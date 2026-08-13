import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { generateReportData } from "./services/clientReport.js";
import { sendEmail, renderReportHtml } from "./services/emailService.js";
import { getAppBaseUrl } from "./services/urlHelper.js";
import { 
  hashPortalToken, 
  encryptPortalToken, 
  decryptPortalToken, 
  generateRawPortalToken 
} from "./services/portalSecurity.js";
import { generateInsights } from "./services/aiInsightsService.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Security Headers and CORS Middleware
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  
  if (req.path.startsWith("/portal") || req.path.startsWith("/api/portal")) {
    res.setHeader("Referrer-Policy", "no-referrer");
  } else {
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  }

  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://wrbgbkmwusbeankitwex.supabase.co https://api.anthropic.com;");
  
  const origin = req.headers.origin;
  const allowedOrigins = [process.env.APP_URL || "http://localhost:3000", "http://localhost:5173"];
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Agency-Slug, X-Public-Dashboard-Token");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Simple In-Memory Rate Limiter
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const rateLimiter = (limit: number, windowMs: number) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "anonymous";
    const key = `${req.path}-${ip}`;
    const now = Date.now();
    const record = rateLimits.get(key);

    if (!record || now > record.resetAt) {
      rateLimits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (record.count >= limit) {
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }

    record.count++;
    next();
  };
};

app.use(express.json());

// Global read-only protection for public demo mode (bypassable for admin/windsor)
app.use(async (req, res, next) => {
  const isWriteMethod = ["POST", "PUT", "DELETE", "PATCH"].includes(req.method);
  const fullPath = req.originalUrl || req.path || "";
  const isMutation = isWriteMethod && !fullPath.includes("/summary") && !fullPath.includes("/config") && !fullPath.includes("/dashboard-config") && !fullPath.includes("/portal-access");
  
  if (isMutation) {
    // 1. Check if authenticated as Windsor.ai (only if key is defined in env)
    const apiKey = req.query.apiKey || req.headers["x-api-key"];
    const expectedApiKey = process.env.WINDSOR_API_KEY;
    if (expectedApiKey && apiKey === expectedApiKey) {
      return next();
    }

    // 2. Check if authenticated as User (Admin or Agency)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      try {
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
        if (!authError && authUser) {
          return next();
        }
      } catch (e) {}
    }
    
    return res.status(403).json({ error: "This is a read-only public demonstration. Modifications are disabled." });
  }
  next();
});

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("Supabase URL initialized:", supabaseUrl);
console.log("Supabase Service Role Key configured:", !!supabaseKey);

if (!supabaseUrl || !supabaseKey) {
  console.error("CRITICAL: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY environment variables are not defined.");
}

const supabase = createClient(supabaseUrl || "", supabaseKey || "");

// Test connection on server start
async function testSupabaseConnection() {
  try {
    console.log("Attempting database connectivity check...");
    const { error } = await supabase
      .from("clients")
      .select("id")
      .limit(1);
    if (error) {
      console.error("Supabase Connection Check FAILED during initialization:", error.message, error.details);
    } else {
      console.log("Supabase Connection Check SUCCESSFUL: Database is reachable.");
    }
  } catch (err: any) {
    console.error("Supabase Connection Check Exception:", err.message);
  }
}
testSupabaseConnection();

// Dynamic configurations route
app.get("/api/config", (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyYmdia213dXNiZWFua2l0d2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzMDY5MzgsImV4cCI6MjA5OTg4MjkzOH0.3gY2dWwSu0uc3MGrcpIOz6mJXej1JJeueGQUdC_wrYg"
  });
});

// Authentication and Multi-Tenancy Middleware
const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    // 1. Check Windsor API key first (e.g. for server-to-server webhook syncing)
    const apiKey = req.query.apiKey || req.headers["x-api-key"];
    const expectedApiKey = process.env.WINDSOR_API_KEY;
    if (expectedApiKey && apiKey === expectedApiKey) {
      const clientId = req.params.id || req.body.clientId;
      let agencyId = null;
      if (clientId) {
        const { data: client } = await supabase
          .from("clients")
          .select("agency_id")
          .eq("id", clientId)
          .single();
        if (client) {
          agencyId = client.agency_id;
        }
      }
      (req as any).user = {
        id: "windsor-ai-system",
        email: "system@windsor.ai",
        agencyId,
        isAdmin: true, // system bypasses client limit checks and can write
        agencyName: "Windsor.ai Sync Integration",
        clientLimit: 9999
      };
      return next();
    }

    // 2. Check standard Bearer Token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
      if (!authError && authUser) {
        // Query profiles
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("*, agencies(*)")
          .eq("id", authUser.id)
          .single();

        if (!profileError && profile) {
          if (profile.is_admin) {
            const rawSlug = (req.headers["x-admin-preview-agency-slug"] as string) || (req.headers["x-agency-slug"] as string) || (req.query.agencySlug as string);
            let previewAgency: any = null;
            if (rawSlug && typeof rawSlug === "string" && rawSlug.trim()) {
              const cleanSlug = rawSlug.trim().toLowerCase();
              const { data: targetAg } = await supabase
                .from("agencies")
                .select("*")
                .eq("slug", cleanSlug)
                .single();
              if (targetAg) {
                previewAgency = targetAg;
              }
            }

            (req as any).user = {
              id: authUser.id,
              email: authUser.email,
              isAdmin: true,
              isDemo: previewAgency ? previewAgency.is_demo : false,
              isAdminPreview: !!previewAgency,
              previewAgencySlug: previewAgency?.slug || null,
              agencyId: previewAgency ? previewAgency.id : null,
              agencyName: previewAgency ? previewAgency.name : null,
              customCta: previewAgency ? previewAgency.custom_cta : null,
              logoUrl: previewAgency ? previewAgency.logo_url : null,
              primaryColor: previewAgency ? previewAgency.primary_color : null,
              accentColor: previewAgency ? previewAgency.accent_color : null,
              clientLimit: previewAgency ? (previewAgency.client_limit || 5) : 9999
            };
            return next();
          } else {
            const rawSlug = (req.headers["x-agency-slug"] as string) || (req.query.agencySlug as string) || (req.headers["x-admin-preview-agency-slug"] as string);
            const agency = (profile as any).agencies;

            if (rawSlug && typeof rawSlug === "string" && rawSlug.trim()) {
              const cleanSlug = rawSlug.trim().toLowerCase();
              const { data: targetAg } = await supabase
                .from("agencies")
                .select("id, slug")
                .eq("slug", cleanSlug)
                .single();
              if (targetAg && targetAg.id !== profile.agency_id) {
                return res.status(403).json({ error: "Access Denied: Cross-tenant agency access is prohibited." });
              }
            }

            (req as any).user = {
              id: authUser.id,
              email: authUser.email,
              agencyId: profile.agency_id,
              agencySlug: agency?.slug || null,
              isAdmin: false,
              agencyName: agency?.name || null,
              customCta: agency?.custom_cta || null,
              logoUrl: agency?.logo_url || null,
              primaryColor: agency?.primary_color || null,
              accentColor: agency?.accent_color || null,
              clientLimit: agency?.client_limit || 5,
              isDemo: agency?.is_demo || false
            };
            return next();
          }
        }
      }
    }

    // 3. Check X-Agency-Slug header ONLY for public demo agencies (is_demo === true)
    const agencySlug = req.headers["x-agency-slug"] || req.query.agencySlug;
    if (agencySlug && typeof agencySlug === "string") {
      const { data: agency, error: agencyError } = await supabase
        .from("agencies")
        .select("*")
        .eq("slug", agencySlug)
        .single();
      
      // CRITICAL SECURITY RULE: Unauthenticated slug-based access is strictly prohibited for real agencies (is_demo !== true)
      if (!agencyError && agency && agency.is_demo === true) {
        (req as any).user = {
          id: "public-reader",
          email: agency.contact_email || `agency@${agency.slug}.com`,
          agencyId: agency.id,
          isAdmin: false,
          agencyName: agency.name,
          customCta: agency.custom_cta || null,
          logoUrl: agency.logo_url || null,
          primaryColor: agency.primary_color || null,
          accentColor: agency.accent_color || null,
          clientLimit: agency.client_limit || 5,
          isDemo: true
        };
        return next();
      }
    }

    return res.status(401).json({ error: "Unauthorized: Invalid or missing authorization credentials." });
  } catch (err: any) {
    console.error("Auth middleware error:", err.message);
    res.status(401).json({ error: "Unauthorized: Auth check failed." });
  }
};

// API: Unauthenticated public demo check for agency slug
app.get("/api/agency/public-check/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const { data: agency, error } = await supabase
      .from("agencies")
      .select("id, name, slug, is_demo")
      .eq("slug", slug)
      .single();

    if (error || !agency) {
      return res.status(404).json({ error: "Agency not found.", isDemo: false });
    }

    res.json({
      id: agency.id,
      name: agency.name,
      slug: agency.slug,
      isDemo: agency.is_demo === true
    });
  } catch (err: any) {
    res.status(500).json({ error: "Public agency check failed: " + err.message, isDemo: false });
  }
});

// API: Get agency details by slug (For System Admin Preview & Demo access)
app.get("/api/agency/by-slug/:slug", requireAuth, async (req, res) => {
  try {
    const { slug } = req.params;
    const { data: agency, error } = await supabase
      .from("agencies")
      .select("id, name, slug, logo_url, primary_color, accent_color, is_demo, custom_cta, client_limit")
      .eq("slug", slug)
      .single();

    if (error || !agency) {
      return res.status(404).json({ error: "Agency not found." });
    }

    const user = (req as any).user;
    if (!agency.is_demo && !user.isAdmin && user.agencyId !== agency.id) {
      return res.status(403).json({ error: "Forbidden: Access denied to this agency." });
    }

    res.json({
      id: agency.id,
      name: agency.name,
      slug: agency.slug,
      logoUrl: agency.logo_url,
      primaryColor: agency.primary_color,
      accentColor: agency.accent_color,
      isDemo: agency.is_demo,
      customCta: agency.custom_cta,
      clientLimit: agency.client_limit || 5
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch agency by slug: " + err.message });
  }
});

// API: Get current user profile details
app.get("/api/profile", requireAuth, (req, res) => {
  res.json((req as any).user);
});

// API: Update agency custom CTA settings
app.put("/api/agency/cta", requireAuth, async (req, res) => {
  const { customCta } = req.body;
  const user = (req as any).user;
  
  if (!user.agencyId) {
    return res.status(403).json({ error: "Access Denied: No agency context associated with user." });
  }

  try {
    const { error: updateError } = await supabase
      .from("agencies")
      .update({ custom_cta: customCta || null })
      .eq("id", user.agencyId);

    if (updateError) {
      throw updateError;
    }

    await supabase.from("audit_logs").insert({
      agency_id: user.agencyId,
      action: "Update Custom CTA Message",
      actor_email: user.email,
      details: `Custom CTA message updated to: "${customCta || '(disabled)'}"`
    });

    res.json({ success: true, customCta });
  } catch (err: any) {
    console.error("Failed to update custom CTA settings:", err.message);
    res.status(500).json({ error: "Failed to update agency custom CTA message in database." });
  }
});

// API: List all agencies (Admin only)
app.get("/api/agencies", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user.isAdmin) {
      return res.status(403).json({ error: "Access Denied: Admin role required." });
    }
    const { data, error } = await supabase
      .from("agencies")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch agencies: " + err.message });
  }
});

// API: One-click agency onboarding (Admin only)
app.post("/api/admin/agencies/onboard", requireAuth, async (req, res) => {
  const user = (req as any).user;
  if (!user.isAdmin) {
    return res.status(403).json({ error: "Access Denied: Admin role required." });
  }

  const { name, slug, logoUrl, primaryColor, accentColor, clientLimit, clients, isDemo, timezone, industry } = req.body;

  if (!name || !slug) {
    return res.status(400).json({ error: "Agency name and slug are required." });
  }

  try {
    // 1. Insert Agency
    const { data: agency, error: agencyError } = await supabase
      .from("agencies")
      .insert({
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        logo_url: logoUrl ? logoUrl.trim() : null,
        primary_color: primaryColor ? primaryColor.trim() : null,
        accent_color: accentColor ? accentColor.trim() : null,
        client_limit: typeof clientLimit === "number" ? clientLimit : 5,
        is_demo: isDemo === true,
        timezone: timezone ? timezone.trim() : null,
        industry: industry ? industry.trim() : null
      })
      .select()
      .single();

    if (agencyError) throw agencyError;

    // 2. Insert Clients if any
    const clientsInserted = [];
    if (Array.isArray(clients) && clients.length > 0) {
      for (const client of clients) {
        if (!client.name || !client.domain) continue;
        const clientId = `c_${Math.random().toString(36).substr(2, 9)}`;
        const { data: newClient, error: clientError } = await supabase
          .from("clients")
          .insert({
            id: clientId,
            name: client.name.trim(),
            domain: client.domain.trim().toLowerCase(),
            platform: client.platform || "All Platforms",
            monthly_budget: Number(client.monthlyBudget) || 1000,
            status: "Active",
            agency_id: agency.id,
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (clientError) {
          console.error(`Failed to create onboarded client ${client.name}:`, clientError.message);
        } else {
          clientsInserted.push(newClient);
        }
      }
    }

    // 3. Log Audit
    const logId = `log-${Date.now()}`;
    await supabase.from("audit_logs").insert({
      id: logId,
      timestamp: new Date().toISOString(),
      action: "CREATE",
      entity: "Agency",
      details: `Onboarded new agency ${name.trim()} with slug ${slug.trim()} and ${clientsInserted.length} clients`,
      user: user.email || "admin",
      agency_id: agency.id
    });

    res.status(201).json({
      success: true,
      agency,
      clients: clientsInserted
    });
  } catch (err: any) {
    console.error("Error onboarding agency:", err.message);
    res.status(500).json({ error: "Failed to onboard agency: " + err.message });
  }
});

// API: List all agencies with clients count (Admin only)
app.get("/api/admin/agencies", requireAuth, async (req, res) => {
  const user = (req as any).user;
  if (!user.isAdmin) {
    return res.status(403).json({ error: "Access Denied: Admin role required." });
  }

  try {
    const { data: agencies, error: agencyError } = await supabase
      .from("agencies")
      .select("*")
      .order("created_at", { ascending: false });

    if (agencyError) throw agencyError;

    // Get client count for each agency
    const { data: clients, error: clientsError } = await supabase
      .from("clients")
      .select("agency_id");

    if (clientsError) throw clientsError;

    const mappedAgencies = agencies.map((a: any) => {
      const agencyClientsCount = clients?.filter((c: any) => c.agency_id === a.id).length || 0;
      return {
        ...a,
        clientsCount: agencyClientsCount
      };
    });

    res.json(mappedAgencies);
  } catch (err: any) {
    console.error("Error listing agencies:", err.message);
    res.status(500).json({ error: "Failed to list agencies: " + err.message });
  }
});

// API: Update agency settings (Admin only)
app.put("/api/admin/agencies/:id", requireAuth, async (req, res) => {
  const user = (req as any).user;
  if (!user.isAdmin) {
    return res.status(403).json({ error: "Access Denied: Admin role required." });
  }

  const { id } = req.params;
  const { name, slug, logoUrl, primaryColor, accentColor, clientLimit, isDemo, timezone, industry } = req.body;

  try {
    const updates: any = {};
    if (name) updates.name = name.trim();
    if (slug) updates.slug = slug.trim().toLowerCase();
    if (logoUrl !== undefined) updates.logo_url = logoUrl ? logoUrl.trim() : null;
    if (primaryColor !== undefined) updates.primary_color = primaryColor ? primaryColor.trim() : null;
    if (accentColor !== undefined) updates.accent_color = accentColor ? accentColor.trim() : null;
    if (clientLimit !== undefined) updates.client_limit = Number(clientLimit);
    if (isDemo !== undefined) updates.is_demo = isDemo === true;
    if (timezone !== undefined) updates.timezone = timezone ? timezone.trim() : null;
    if (industry !== undefined) updates.industry = industry ? industry.trim() : null;

    const { data: updatedAgency, error } = await supabase
      .from("agencies")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    res.json(updatedAgency);
  } catch (err: any) {
    console.error("Error updating agency:", err.message);
    res.status(500).json({ error: "Failed to update agency: " + err.message });
  }
});

// API: Delete agency (Admin only)
app.delete("/api/admin/agencies/:id", requireAuth, async (req, res) => {
  const user = (req as any).user;
  if (!user.isAdmin) {
    return res.status(403).json({ error: "Access Denied: Admin role required." });
  }

  const { id } = req.params;

  try {
    // Delete clients associated with agency first to prevent FK violation
    await supabase.from("clients").delete().eq("agency_id", id);
    
    // Delete agency
    const { error } = await supabase
      .from("agencies")
      .delete()
      .eq("id", id);

    if (error) throw error;

    res.json({ success: true });
  } catch (err: any) {
    console.error("Error deleting agency:", err.message);
    res.status(500).json({ error: "Failed to delete agency: " + err.message });
  }
});

// API: File Upload Endpoint (Admin only)
app.post("/api/admin/upload", requireAuth, async (req, res) => {
  const user = (req as any).user;
  if (!user.isAdmin) {
    return res.status(403).json({ error: "Access Denied: Admin role required." });
  }

  const { fileName, fileType, fileData } = req.body;
  if (!fileName || !fileType || !fileData) {
    return res.status(400).json({ error: "Missing required upload parameters." });
  }

  try {
    const buffer = Buffer.from(fileData, "base64");
    
    // Ensure bucket exists
    await supabase.storage.createBucket("logos", {
      public: true
    }).catch(() => {}); // ignore error if it already exists

    // Unique filename to prevent overwrites
    const uniqueFileName = `${Date.now()}-${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from("logos")
      .upload(uniqueFileName, buffer, {
        contentType: fileType,
        upsert: true
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from("logos")
      .getPublicUrl(uniqueFileName);

    res.json({ publicUrl });
  } catch (err: any) {
    console.error("Upload failed:", err.message);
    res.status(500).json({ error: "Failed to upload file: " + err.message });
  }
});

// Deterministic Seeded Random helper
class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  next() {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }
  range(min: number, max: number) {
    return min + this.next() * (max - min);
  }
}

// API: Deterministic Demo Data Generator (Admin only)
app.post("/api/admin/generate-demo", requireAuth, async (req, res) => {
  const user = (req as any).user;
  if (!user.isAdmin) {
    return res.status(403).json({ error: "Access Denied: Admin role required." });
  }

  const { clientId } = req.body;
  if (!clientId) {
    return res.status(400).json({ error: "Client ID is required." });
  }

  try {
    // 1. Fetch Client and Agency details
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("*, agencies(*)")
      .eq("id", clientId)
      .single();

    if (clientErr || !client) {
      return res.status(404).json({ error: "Client not found." });
    }

    const agency = (client as any).agencies;
    if (!agency) {
      return res.status(404).json({ error: "Associated agency not found." });
    }

    // 2. Block generation for production agencies
    if (agency.is_demo !== true) {
      return res.status(403).json({ error: "CRITICAL SECURITY BLOCK: Demo data generation is only allowed for demo tenants (is_demo = true)." });
    }

    // 3. Clear existing metrics & summaries
    await supabase.from("campaign_metrics").delete().eq("client_id", clientId);
    await supabase.from("ai_summaries").delete().eq("client_id", clientId);

    // 4. Resolve geographic primary market & regional distributions
    let chosenDist = [
      { location: "Phoenix, AZ", code: "US", flag: "🌵", share: 0.35, conversionShare: 0.37, bounceRate: "24.5%", timeOnPage: "3m 15s", type: "Organic" },
      { location: "Mesa, AZ", code: "US", flag: "🌵", share: 0.20, conversionShare: 0.21, bounceRate: "25.0%", timeOnPage: "2m 50s", type: "Organic" },
      { location: "Chandler, AZ", code: "US", flag: "🌵", share: 0.15, conversionShare: 0.16, bounceRate: "23.8%", timeOnPage: "3m 05s", type: "Organic" },
      { location: "Scottsdale, AZ", code: "US", flag: "🌵", share: 0.12, conversionShare: 0.13, bounceRate: "22.1%", timeOnPage: "3m 40s", type: "Referral" },
      { location: "Tempe, AZ", code: "US", flag: "🌵", share: 0.10, conversionShare: 0.10, bounceRate: "26.4%", timeOnPage: "2m 30s", type: "Social" },
      { location: "Gilbert, AZ", code: "US", flag: "🌵", share: 0.08, conversionShare: 0.03, bounceRate: "24.9%", timeOnPage: "2m 55s", type: "Direct" }
    ];

    const marketLower = (client.primary_market || "").toLowerCase();
    if (marketLower.includes("los angeles") || marketLower.includes("la") || marketLower.includes("ca")) {
      chosenDist = [
        { location: "Los Angeles, CA", code: "US", flag: "🌴", share: 0.40, conversionShare: 0.42, bounceRate: "23.5%", timeOnPage: "3m 20s", type: "Organic" },
        { location: "Pasadena, CA", code: "US", flag: "🌴", share: 0.20, conversionShare: 0.21, bounceRate: "24.0%", timeOnPage: "3m 02s", type: "Organic" },
        { location: "Santa Monica, CA", code: "US", flag: "🌴", share: 0.15, conversionShare: 0.16, bounceRate: "21.5%", timeOnPage: "4m 10s", type: "Referral" },
        { location: "Glendale, CA", code: "US", flag: "🌴", share: 0.13, conversionShare: 0.13, bounceRate: "25.2%", timeOnPage: "2m 45s", type: "Organic" },
        { location: "Long Beach, CA", code: "US", flag: "🌴", share: 0.12, conversionShare: 0.08, bounceRate: "26.8%", timeOnPage: "2m 30s", type: "Social" }
      ];
    } else if (marketLower.includes("new york") || marketLower.includes("ny")) {
      chosenDist = [
        { location: "New York, NY", code: "US", flag: "🗽", share: 0.35, conversionShare: 0.36, bounceRate: "22.4%", timeOnPage: "3m 45s", type: "Organic" },
        { location: "Brooklyn, NY", code: "US", flag: "🗽", share: 0.25, conversionShare: 0.27, bounceRate: "23.1%", timeOnPage: "3m 12s", type: "Organic" },
        { location: "Queens, NY", code: "US", flag: "🗽", share: 0.20, conversionShare: 0.21, bounceRate: "24.8%", timeOnPage: "2m 55s", type: "Organic" },
        { location: "Bronx, NY", code: "US", flag: "🗽", share: 0.12, conversionShare: 0.12, bounceRate: "27.0%", timeOnPage: "2m 20s", type: "Social" },
        { location: "Staten Island, NY", code: "US", flag: "🗽", share: 0.08, conversionShare: 0.04, bounceRate: "25.5%", timeOnPage: "2m 35s", type: "Direct" }
      ];
    }

    // Save regional distribution to client row
    await supabase
      .from("clients")
      .update({ regional_distribution: chosenDist })
      .eq("id", clientId);

    // 5. Generate Campaign names
    let campNames = ["Brand Search", "Product Prospecting", "Lead Gen Prospecting", "Retargeting"];
    const indLower = (client.industry || "").toLowerCase();
    if (indLower.includes("beauty") || indLower.includes("skin") || indLower.includes("retail") || indLower.includes("ecom")) {
      campNames = ["Brand Search", "Product Prospecting", "Retargeting", "High Intent", "Lookalike"];
    } else if (indLower.includes("roof") || indLower.includes("home") || indLower.includes("plumb")) {
      campNames = ["Emergency Roofing", "Roof Replacement", "Local Roofing", "Retargeting"];
    } else if (indLower.includes("dental") || indLower.includes("dentist") || indLower.includes("health")) {
      campNames = ["Emergency Dentist", "General Dentistry", "Dental Implants", "Invisalign", "Retargeting"];
    }

    // Resolve platforms list
    let platforms = ["Google Ads", "Meta Ads"];
    const platformInput = client.platform || "";
    if (platformInput.includes("Google Ads Only") || platformInput === "Google Ads") {
      platforms = ["Google Ads"];
    } else if (platformInput.includes("Meta Ads Only") || platformInput === "Meta Ads") {
      platforms = ["Meta Ads"];
    } else if (platformInput.includes("TikTok Ads Only") || platformInput === "TikTok Ads") {
      platforms = ["TikTok Ads"];
    }

    // Setup base campaign metrics
    const campaigns: { name: string; platform: string; baseSpend: number; baseCpl: number; baseCpc: number; baseCtr: number }[] = [];
    const dailyBudget = (Number(client.monthly_budget) || 5000) / 30;
    const targetCpl = Number(client.target_cpl) || 50;

    campNames.forEach((name, idx) => {
      let plat = platforms[0];
      if (platforms.length > 1) {
        plat = idx % 2 === 0 ? "Google Ads" : "Meta Ads";
      }

      const share = 1 / campNames.length;
      campaigns.push({
        name,
        platform: plat,
        baseSpend: dailyBudget * share,
        baseCpl: name.includes("Brand") ? targetCpl * 0.5 : targetCpl * 1.1,
        baseCpc: plat === "Google Ads" ? 3.0 : 1.5,
        baseCtr: plat === "Google Ads" ? 0.035 : 0.018
      });
    });

    // SeededRandom seeded by character code sum of client ID
    const clientHash = clientId.split("").reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
    const rand = new SeededRandom(clientHash);
    const storyType = clientHash % 5;

    const endDate = new Date();
    const dates: string[] = [];
    for (let i = 89; i >= 0; i--) {
      const d = new Date(endDate);
      d.setDate(endDate.getDate() - i);
      dates.push(d.toISOString().split("T")[0]);
    }

    const campaignMetricsBatch: any[] = [];
    let totalSpendSum = 0;
    let totalConversionsSum = 0;

    for (let day = 0; day < 90; day++) {
      const dateStr = dates[day];
      const dayOfWeek = new Date(dateStr).getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      for (const camp of campaigns) {
        let spendTrend = 1.0;
        let leadsEfficiencyTrend = 1.0;
        let weekendFactor = 1.0;

        if (isWeekend) {
          weekendFactor = (clientHash % 2 === 0) ? 0.70 : 1.20;
        }

        // Apply story trends
        if (storyType === 0) {
          // Scaling/CPL improves (spend +25%, conversions +35%)
          spendTrend = 1.0 + (day / 89) * 0.25;
          leadsEfficiencyTrend = 1.0 + (day / 89) * 0.40;
        } else if (storyType === 1) {
          // CPL stable
          spendTrend = 0.95 + rand.next() * 0.10;
          leadsEfficiencyTrend = 1.0;
        } else if (storyType === 2) {
          // CPL deteriorating
          spendTrend = 1.0 + (day / 89) * 0.40;
          leadsEfficiencyTrend = 1.0 - (day / 89) * 0.40;
        } else if (storyType === 3) {
          // CPL falling
          spendTrend = 1.0;
          leadsEfficiencyTrend = 1.0 + (day / 89) * 0.45;
        } else {
          // Needs Attention (CPL rises)
          spendTrend = 1.0 + (day / 89) * 0.20;
          leadsEfficiencyTrend = 1.0 - (day / 89) * 0.45;
        }

        const noise = rand.range(0.85, 1.15);
        const spend = Math.max(0, Math.round(camp.baseSpend * spendTrend * weekendFactor * noise * 100) / 100);
        const currentCpl = camp.baseCpl / leadsEfficiencyTrend;
        const conversions = Math.round(spend / currentCpl);

        const avgCpc = camp.baseCpc * rand.range(0.90, 1.10);
        const clicks = conversions + Math.round(spend / avgCpc);
        const avgCtr = camp.baseCtr * rand.range(0.90, 1.10);
        const impressions = clicks + Math.round(clicks / avgCtr);

        // Sales goal / ROAS check
        const isSales = (client.primary_goal || "").toLowerCase().includes("sale") || 
                        (client.primary_goal || "").toLowerCase().includes("rev") ||
                        indLower.includes("beauty") || indLower.includes("retail") || indLower.includes("ecom");
        let conversionValue = 0.0;
        if (isSales) {
          const roas = rand.range(2.8, 5.0);
          conversionValue = Math.round(spend * roas * 100) / 100;
        }

        totalSpendSum += spend;
        totalConversionsSum += conversions;

        campaignMetricsBatch.push({
          client_id: client.id,
          agency_id: agency.id,
          date: dateStr,
          platform: camp.platform,
          spend,
          impressions,
          clicks,
          conversions,
          campaign_name: camp.name,
          conversion_value: conversionValue,
          revenue: conversionValue
        });
      }
    }

    const { error: insError } = await supabase.from("campaign_metrics").insert(campaignMetricsBatch);
    if (insError) throw insError;

    // 6. SeedCached AI summaries
    const finalCpl = totalConversionsSum > 0 ? totalSpendSum / totalConversionsSum : 0;
    
    let summaryData = [
      {
        type: "scale",
        label: "SCALE",
        number: "01",
        what: `Performance metrics for ${client.name} are tracking inside target guidelines.`,
        why: `Average cost-per-lead (CPL) is $${finalCpl.toFixed(2)} vs target CPL $${targetCpl.toFixed(2)}.`,
        action: "Maintain current budget pacing allocations."
      },
      {
        type: "opportunity",
        label: "OPPORTUNITY",
        number: "02",
        what: "High relevance and CTR on prospecting campaigns indicates strong creative appeal.",
        why: "Prospecting click-through rates reached an optimized average this week.",
        action: "Incorporate dedicated localized search copy landing pages."
      },
      {
        type: "watch",
        label: "WATCH",
        number: "03",
        what: "Competitor activity on branded keywords has increased.",
        why: "Branded search cost-per-click experienced minor upward pacing pressures.",
        action: "Audit branded bid ceilings to protect top impression shares."
      }
    ];

    if (storyType === 0) {
      summaryData = [
        {
          type: "scale",
          label: "SCALE",
          number: "01",
          what: `Paid acquisition campaigns for ${client.name} show strong scalability.`,
          why: `Conversions scaled by 35% while CPL dropped to $${finalCpl.toFixed(2)} (Target CPL: $${targetCpl.toFixed(2)}).`,
          action: "Increase daily budgets on top two converting search campaigns by 15%."
        },
        {
          type: "opportunity",
          label: "OPPORTUNITY",
          number: "02",
          what: "Prospecting audiences are demonstrating very high conversion efficiency.",
          why: "Recent creative optimizations led to a 20% CTR boost.",
          action: "Test expanding lookalike audience filters by 1%."
        },
        {
          type: "watch",
          label: "WATCH",
          number: "03",
          what: "Branded search bid pacing became slightly more competitive.",
          why: "Competitor branded impressions crept up by 3%.",
          action: "Set automatic rules to maintain absolute top page bid positions."
        }
      ];
    } else if (storyType === 2 || storyType === 4) {
      summaryData = [
        {
          type: "alert",
          label: "ALERT",
          number: "01",
          what: `Deteriorating conversion cost pacing for ${client.name}.`,
          why: `Total spend expanded but conversions dropped, causing CPL to inflate to $${finalCpl.toFixed(2)} (Target: $${targetCpl.toFixed(2)}).`,
          action: "Pause the lowest performing prospecting campaigns and audit landing page forms."
        },
        {
          type: "watch",
          label: "WATCH",
          number: "02",
          what: "Ad frequency reached elevated levels in warm audience segments.",
          why: "Frequency rose to 4.5 in the last 14 days, indicating ad fatigue.",
          action: "Immediately swap in three fresh creative design templates."
        },
        {
          type: "opportunity",
          label: "OPPORTUNITY",
          number: "03",
          what: "Local Google brand search campaigns remain highly cost-efficient.",
          why: "Conversion rates on high-intent search terms remain at 14.2%.",
          action: "Shift $25/day budget from low-performing Facebook ads to Google Brand search."
        }
      ];
    }

    const todayStr = new Date().toISOString().split("T")[0];
    await supabase.from("ai_summaries").insert({
      client_id: clientId,
      agency_id: agency.id,
      date_range: "30days",
      summary_data: summaryData
    });
    await supabase.from("ai_summaries").insert({
      client_id: clientId,
      agency_id: agency.id,
      date_range: `30days-${todayStr}`,
      summary_data: summaryData
    });

    res.json({ success: true, storyType, clientCpl: finalCpl });
  } catch (err: any) {
    console.error("Failed to generate demo data:", err.message);
    res.status(500).json({ error: "Failed to generate demo data: " + err.message });
  }
});



interface PerformanceMetric {
  date: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  conversionValue?: number;
}

// Cleaned up client-side mock generators

// API: List connected clients
app.get("/api/clients", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    console.log(`GET /api/clients: Querying clients table for ${user.email} (Admin: ${user.isAdmin})`);
    
    let query;
    if (user.agencyId) {
      // Specific agency view (agency user, public demo, or System Admin agency preview)
      query = supabase
        .from("clients")
        .select("*")
        .eq("agency_id", user.agencyId)
        .order("created_at", { ascending: true });
    } else if (user.isAdmin) {
      // General Admin view across non-demo agencies
      const { data: nonDemoAgencies } = await supabase
        .from("agencies")
        .select("id")
        .eq("is_demo", false);
      const nonDemoIds = (nonDemoAgencies || []).map(a => a.id);
      query = supabase
        .from("clients")
        .select("*")
        .in("agency_id", nonDemoIds.length > 0 ? nonDemoIds : ["no-match"])
        .order("created_at", { ascending: true });
    } else {
      query = supabase
        .from("clients")
        .select("*")
        .eq("agency_id", "no-agency-assigned")
        .order("created_at", { ascending: true });
    }

    const { data, error } = await query;

    if (error) {
      console.error("GET /api/clients query failed in Supabase:", error.message, error.details);
      throw error;
    }

    const mapped = (data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      domain: c.domain,
      platform: c.platform,
      monthlyBudget: Number(c.monthly_budget),
      status: c.status,
      createdAt: c.created_at,
      agencyId: c.agency_id,
      targetCpl: c.target_cpl ? Number(c.target_cpl) : null,
      brandColor: c.brand_color || null,
      industry: c.industry || null,
      primaryGoal: c.primary_goal || null,
      regionalDistribution: c.regional_distribution || null,
      primaryMarket: c.primary_market || null,
      logoUrl: c.logo_url || null,
      reportingEnabled: c.reporting_enabled || false,
      reportEmail: c.report_email || null,
      reportCc: c.report_cc || null,
      reportDay: c.report_day !== undefined ? c.report_day : 1,
      reportTime: c.report_time || "08:00",
      reportTimezone: c.report_timezone || "UTC",
      reportPeriod: c.report_period || "weekly"
    }));

    console.log(`GET /api/clients: Successfully retrieved and mapped ${mapped.length} clients.`);
    res.json(mapped);
  } catch (err: any) {
    console.error("Error in GET /api/clients handler:", err.message);
    res.status(500).json({ error: "Failed to fetch clients from database: " + err.message });
  }
});

// API: Create a client
app.post("/api/clients", requireAuth, async (req, res) => {
  const { name, domain, platform, monthlyBudget, agencyId: inputAgencyId, targetCpl, brandColor, industry, primaryGoal, primaryMarket, logoUrl, reportingEnabled, reportEmail, reportCc, reportDay, reportTime, reportTimezone, reportPeriod } = req.body;
  const user = (req as any).user;
  
  // Zod-like simple key validation for security/safety
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ error: "Client name is required and must be a valid string." });
  }
  if (!domain || typeof domain !== "string" || !domain.includes(".")) {
    return res.status(400).json({ error: "A valid domain (e.g., example.com) is required." });
  }
  if (!platform || typeof platform !== "string" || platform.trim().length === 0) {
    return res.status(400).json({ error: "Platform must be a valid string selection." });
  }
  if (monthlyBudget === undefined || typeof monthlyBudget !== "number" || monthlyBudget <= 0) {
    return res.status(400).json({ error: "Monthly budget must be a positive number." });
  }

  const id = `c_${Math.random().toString(36).substr(2, 9)}`;
  const createdAt = new Date().toISOString();
  const targetAgencyId = user.isAdmin ? (inputAgencyId || null) : user.agencyId;

  try {
    if (!user.isAdmin) {
      if (!user.agencyId) {
        return res.status(400).json({ error: "User is not linked to any agency." });
      }
      const { count, error: countError } = await supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("agency_id", user.agencyId);
      
      if (countError) throw countError;
      if (count !== null && count >= user.clientLimit) {
        return res.status(403).json({ error: `You have reached your client limit of ${user.clientLimit} clients. Contact your Lumen Analytics account manager.` });
      }
    }

    const { data: newClientData, error: clientError } = await supabase
      .from("clients")
      .insert({
        id,
        name: name.trim(),
        domain: domain.trim().toLowerCase(),
        platform,
        monthly_budget: monthlyBudget,
        status: "Active",
        created_at: createdAt,
        agency_id: targetAgencyId,
        target_cpl: targetCpl !== undefined ? Number(targetCpl) : null,
        brand_color: brandColor || null,
        industry: industry || null,
        primary_goal: primaryGoal || null,
        primary_market: primaryMarket || null,
        logo_url: logoUrl || null,
        reporting_enabled: !!reportingEnabled,
        report_email: reportEmail ? reportEmail.trim() : null,
        report_cc: reportCc ? reportCc.trim() : null,
        report_day: reportDay !== undefined ? Number(reportDay) : 1,
        report_time: reportTime || "08:00",
        report_timezone: reportTimezone || "UTC",
        report_period: reportPeriod || "weekly"
      })
      .select()
      .single();

    if (clientError) throw clientError;

    // Add audit log entry
    const logId = `log-${Date.now()}`;
    const details = `Connected new account ${name.trim()} with budget $${monthlyBudget.toLocaleString()}`;

    const { error: logError } = await supabase
      .from("audit_logs")
      .insert({
        id: logId,
        timestamp: new Date().toISOString(),
        action: "CREATE",
        entity: "Client",
        details,
        user: user.email || "system",
        agency_id: targetAgencyId
      });

    if (logError) {
      console.error("Warning: Failed to log audit event:", logError.message);
    }

    const mappedClient = {
      id: newClientData.id,
      name: newClientData.name,
      domain: newClientData.domain,
      platform: newClientData.platform,
      monthlyBudget: Number(newClientData.monthly_budget),
      status: newClientData.status,
      createdAt: newClientData.created_at,
      agencyId: newClientData.agency_id,
      targetCpl: newClientData.target_cpl ? Number(newClientData.target_cpl) : null,
      brandColor: newClientData.brand_color || null,
      industry: newClientData.industry || null,
      primaryGoal: newClientData.primary_goal || null,
      regionalDistribution: newClientData.regional_distribution || null,
      primaryMarket: newClientData.primary_market || null,
      logoUrl: newClientData.logo_url || null,
      reportingEnabled: newClientData.reporting_enabled,
      reportEmail: newClientData.report_email,
      reportCc: newClientData.report_cc,
      reportDay: newClientData.report_day,
      reportTime: newClientData.report_time,
      reportTimezone: newClientData.report_timezone,
      reportPeriod: newClientData.report_period
    };

    res.status(201).json(mappedClient);
  } catch (err: any) {
    console.error("Error creating client:", err.message);
    res.status(500).json({ error: "Failed to create client in database: " + err.message });
  }
});

// API: Update a client budget or details
app.put("/api/clients/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { name, domain, platform, monthlyBudget, status } = req.body;
  const user = (req as any).user;
  
  try {
    // 1. Fetch current client first to verify ownership
    const { data: currentClient, error: fetchError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !currentClient) {
      return res.status(404).json({ error: "Client account not found." });
    }

    if (!user.isAdmin && currentClient.agency_id !== user.agencyId) {
      return res.status(403).json({ error: "Access Denied: You do not own this client account." });
    }

    // 2. Prepare updates
    const updates: any = {};
    if (name && typeof name === "string") updates.name = name.trim();
    if (domain && typeof domain === "string" && domain.includes(".")) updates.domain = domain.trim().toLowerCase();
    if (platform) updates.platform = platform;
    if (monthlyBudget !== undefined && typeof monthlyBudget === "number" && monthlyBudget > 0) updates.monthly_budget = monthlyBudget;
    if (status && ["Active", "Paused", "Needs Review"].includes(status)) updates.status = status;
    if (req.body.targetCpl !== undefined) updates.target_cpl = req.body.targetCpl ? Number(req.body.targetCpl) : null;
    if (req.body.brandColor !== undefined) updates.brand_color = req.body.brandColor || null;
    if (req.body.industry !== undefined) updates.industry = req.body.industry || null;
    if (req.body.primaryGoal !== undefined) updates.primary_goal = req.body.primaryGoal || null;
    if (req.body.regionalDistribution !== undefined) updates.regional_distribution = req.body.regionalDistribution || null;
    if (req.body.primaryMarket !== undefined) updates.primary_market = req.body.primaryMarket || null;
    if (req.body.logoUrl !== undefined) updates.logo_url = req.body.logoUrl || null;
    if (req.body.reportingEnabled !== undefined) updates.reporting_enabled = !!req.body.reportingEnabled;
    if (req.body.reportEmail !== undefined) updates.report_email = req.body.reportEmail ? req.body.reportEmail.trim() : null;
    if (req.body.reportCc !== undefined) updates.report_cc = req.body.reportCc ? req.body.reportCc.trim() : null;
    if (req.body.reportDay !== undefined) updates.report_day = Number(req.body.reportDay);
    if (req.body.reportTime !== undefined) updates.report_time = req.body.reportTime;
    if (req.body.reportTimezone !== undefined) updates.report_timezone = req.body.reportTimezone;
    if (req.body.reportPeriod !== undefined) updates.report_period = req.body.reportPeriod;

    // 3. Update client
    const { data: updatedClientData, error: updateError } = await supabase
      .from("clients")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (updateError) throw updateError;

    // 4. Add audit log entry
    const details = `Updated account ${updatedClientData.name}: budget $${Number(updatedClientData.monthly_budget).toLocaleString()}, status ${updatedClientData.status}`;
    const logId = `log-${Date.now()}`;
    
    const { error: logError } = await supabase
      .from("audit_logs")
      .insert({
        id: logId,
        timestamp: new Date().toISOString(),
        action: "UPDATE",
        entity: "Client",
        details,
        user: user.email || "system",
        agency_id: currentClient.agency_id
      });

    if (logError) {
      console.error("Warning: Failed to log audit event:", logError.message);
    }

    const mappedClient = {
      id: updatedClientData.id,
      name: updatedClientData.name,
      domain: updatedClientData.domain,
      platform: updatedClientData.platform,
      monthlyBudget: Number(updatedClientData.monthly_budget),
      status: updatedClientData.status,
      createdAt: updatedClientData.created_at,
      agencyId: updatedClientData.agency_id,
      targetCpl: updatedClientData.target_cpl ? Number(updatedClientData.target_cpl) : null,
      brandColor: updatedClientData.brand_color || null,
      industry: updatedClientData.industry || null,
      primaryGoal: updatedClientData.primary_goal || null,
      regionalDistribution: updatedClientData.regional_distribution || null,
      primaryMarket: updatedClientData.primary_market || null,
      logoUrl: updatedClientData.logo_url || null,
      reportingEnabled: updatedClientData.reporting_enabled,
      reportEmail: updatedClientData.report_email,
      reportCc: updatedClientData.report_cc,
      reportDay: updatedClientData.report_day,
      reportTime: updatedClientData.report_time,
      reportTimezone: updatedClientData.report_timezone,
      reportPeriod: updatedClientData.report_period
    };

    res.json(mappedClient);
  } catch (err: any) {
    console.error("Error updating client:", err.message);
    res.status(500).json({ error: "Failed to update client in database: " + err.message });
  }
});

// API: Delete a client
app.delete("/api/clients/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const user = (req as any).user;
  
  try {
    // 1. Fetch current client first to log its name and verify ownership
    const { data: currentClient, error: fetchError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !currentClient) {
      return res.status(404).json({ error: "Client account not found." });
    }

    if (!user.isAdmin && currentClient.agency_id !== user.agencyId) {
      return res.status(403).json({ error: "Access Denied: You do not own this client account." });
    }

    // 2. Delete client
    const { error: deleteError } = await supabase
      .from("clients")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;

    // 3. Add audit log entry
    const details = `Disconnected account ${currentClient.name}`;
    const logId = `log-${Date.now()}`;

    const { error: logError } = await supabase
      .from("audit_logs")
      .insert({
        id: logId,
        timestamp: new Date().toISOString(),
        action: "DELETE",
        entity: "Client",
        details,
        user: user.email || "system",
        agency_id: currentClient.agency_id
      });

    if (logError) {
      console.error("Warning: Failed to log audit event:", logError.message);
    }

    res.json({ success: true, deletedId: id });
  } catch (err: any) {
    console.error("Error deleting client:", err.message);
    res.status(500).json({ error: "Failed to delete client from database: " + err.message });
  }
});

// API: Get analytics data for a specific client
app.get("/api/analytics/:clientId", requireAuth, async (req, res) => {
  const { clientId } = req.params;
  const user = (req as any).user;

  try {
    const { data: client, error } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .single();

    if (error || !client) {
      return res.status(404).json({ error: "Client account not found" });
    }

    if (!user.isAdmin && client.agency_id !== user.agencyId) {
      return res.status(403).json({ error: "Access Denied: You do not own this client account." });
    }

    const mappedClient = {
      id: client.id,
      name: client.name,
      domain: client.domain,
      platform: client.platform,
      monthlyBudget: Number(client.monthly_budget),
      status: client.status,
      createdAt: client.created_at,
      agencyId: client.agency_id,
      targetCpl: client.target_cpl ? Number(client.target_cpl) : null,
      brandColor: client.brand_color || null,
      industry: client.industry || null,
      primaryGoal: client.primary_goal || null,
      regionalDistribution: client.regional_distribution || null
    };

    // Check if there are any imported metrics in DB
    const { data: dbMetrics, error: metricsError } = await supabase
      .from("campaign_metrics")
      .select("date, spend, impressions, clicks, conversions, platform, campaign_name, conversion_value")
      .eq("client_id", clientId)
      .order("date", { ascending: true });

    let metrics: any[] = [];
    let campaignsList: any[] = [];
    let status = "OK";
    if (!metricsError && dbMetrics && dbMetrics.length > 0) {
      // Group and aggregate metrics by date to handle multiple campaigns/platforms per day
      const dailyGroup: { [date: string]: any } = {};
      const campaignsGroup: { [name: string]: any } = {};

      for (const m of dbMetrics) {
        const dateStr = m.date;
        if (!dailyGroup[dateStr]) {
          dailyGroup[dateStr] = {
            date: dateStr,
            spend: 0,
            clicks: 0,
            impressions: 0,
            conversions: 0,
            conversionValue: 0
          };
        }
        dailyGroup[dateStr].spend += Number(m.spend);
        dailyGroup[dateStr].clicks += Number(m.clicks);
        dailyGroup[dateStr].impressions += Number(m.impressions);
        dailyGroup[dateStr].conversions += Number(m.conversions);
        dailyGroup[dateStr].conversionValue += Number(m.conversion_value || 0);

        // Group campaign-level aggregates
        if (m.campaign_name && m.campaign_name !== "General") {
          const cName = m.campaign_name;
          if (!campaignsGroup[cName]) {
            campaignsGroup[cName] = {
              id: `camp-${cName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
              name: cName,
              platform: m.platform,
              status: "Active",
              spend: 0,
              impressions: 0,
              clicks: 0,
              conversions: 0,
              conversionValue: 0
            };
          }
          campaignsGroup[cName].spend += Number(m.spend);
          campaignsGroup[cName].impressions += Number(m.impressions);
          campaignsGroup[cName].clicks += Number(m.clicks);
          campaignsGroup[cName].conversions += Number(m.conversions);
          campaignsGroup[cName].conversionValue += Number(m.conversion_value || 0);
        }
      }
      metrics = Object.values(dailyGroup).sort((a, b) => a.date.localeCompare(b.date));

      campaignsList = Object.values(campaignsGroup).map((c: any) => {
        const cpl = c.conversions > 0 ? c.spend / c.conversions : 0;
        const roas = c.spend > 0 ? c.conversionValue / c.spend : 0;
        return {
          id: c.id,
          name: c.name,
          platform: c.platform,
          status: c.status,
          spend: c.spend,
          impressions: c.impressions,
          clicks: c.clicks,
          conversions: c.conversions,
          cpl,
          roas
        };
      });

      console.log(`GET /api/analytics/${clientId}: Loaded and aggregated ${dbMetrics.length} campaign metrics into ${metrics.length} daily entries.`);
    } else {
      status = "NO_DATA";
    }

    res.json({
      client: mappedClient,
      metrics,
      campaigns: campaignsList,
      status
    });
  } catch (err: any) {
    console.error("Error fetching analytics:", err.message);
    res.status(500).json({ error: "Failed to fetch analytics from database: " + err.message });
  }
});

// API: Import campaign metrics from CSV
app.post("/api/clients/:id/import", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { rows } = req.body;
  const user = (req as any).user;

  try {
    const { data: client, error: fetchError } = await supabase
      .from("clients")
      .select("agency_id, name")
      .eq("id", id)
      .single();

    if (fetchError || !client) {
      return res.status(404).json({ error: "Client not found." });
    }

    if (!user.isAdmin && client.agency_id !== user.agencyId) {
      return res.status(403).json({ error: "Access Denied: You do not own this client account." });
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "Invalid payload: 'rows' must be a non-empty array." });
    }

    const validatedRows: any[] = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const rowNum = index + 1;

      if (!row.date || typeof row.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
        return res.status(400).json({ error: `Validation error at row ${rowNum}: 'date' must be YYYY-MM-DD.` });
      }

      if (!row.platform || typeof row.platform !== "string") {
        return res.status(400).json({ error: `Validation error at row ${rowNum}: 'platform' must be a string.` });
      }

      const spend = Number(row.spend);
      if (isNaN(spend) || spend < 0) {
        return res.status(400).json({ error: `Validation error at row ${rowNum}: 'spend' must be a non-negative number.` });
      }

      const impressions = Number(row.impressions);
      if (isNaN(impressions) || !Number.isInteger(impressions) || impressions < 0) {
        return res.status(400).json({ error: `Validation error at row ${rowNum}: 'impressions' must be a non-negative integer.` });
      }

      const clicks = Number(row.clicks);
      if (isNaN(clicks) || !Number.isInteger(clicks) || clicks < 0) {
        return res.status(400).json({ error: `Validation error at row ${rowNum}: 'clicks' must be a non-negative integer.` });
      }

      const conversions = Number(row.conversions);
      if (isNaN(conversions) || !Number.isInteger(conversions) || conversions < 0) {
        return res.status(400).json({ error: `Validation error at row ${rowNum}: 'conversions' must be a non-negative integer.` });
      }

      validatedRows.push({
        client_id: id,
        agency_id: client.agency_id,
        date: row.date,
        platform: row.platform.trim(),
        spend,
        impressions,
        clicks,
        conversions
      });
    }

    // Idempotent upsert of campaign metrics (unique constraint on client_id, date, platform handles duplicates)
    const { error: upsertError } = await supabase
      .from("campaign_metrics")
      .upsert(validatedRows, { onConflict: "client_id,date,platform" });
    if (upsertError) throw upsertError;

    // Audit log
    const details = `Imported ${validatedRows.length} campaign metrics from CSV for client ${client.name}`;
    const logId = `log-${Date.now()}`;
    await supabase.from("audit_logs").insert({
      id: logId,
      timestamp: new Date().toISOString(),
      action: "UPDATE",
      entity: "Client",
      details,
      user: user.email || "system",
      agency_id: client.agency_id
    });

    res.json({ success: true, count: validatedRows.length });
  } catch (err: any) {
    console.error("CSV Import Error:", err.message);
    res.status(500).json({ error: "Failed to import campaign metrics: " + err.message });
  }
});



// API: List audit logs
app.get("/api/logs", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    
    let query = supabase
      .from("audit_logs")
      .select("*")
      .order("timestamp", { ascending: false });

    if (!user.isAdmin) {
      query = query.eq("agency_id", user.agencyId);
    }

    const { data, error } = await query;

    if (error) throw error;

    const mapped = (data || []).map((l: any) => ({
      id: l.id,
      timestamp: l.timestamp,
      action: l.action,
      entity: l.entity,
      details: l.details,
      user: l.user,
      agencyId: l.agency_id
    }));

    res.json(mapped);
  } catch (err: any) {
    console.error("Error fetching audit logs:", err.message);
    res.status(500).json({ error: "Failed to fetch audit logs from database: " + err.message });
  }
});


// API: Generate AI summary report using Claude API (secured on server)
app.post("/api/summary", requireAuth, rateLimiter(10, 60000), async (req, res) => {
  const { clientId, clientName, metricsSummary, tone = "Executive", forceRegenerate = false } = req.body;
  const user = (req as any).user;
  
  if (!clientId || !clientName || !metricsSummary) {
    return res.status(400).json({ error: "clientId, clientName, and metricsSummary are required." });
  }

  let clientData: any;
  try {
    if (clientId === "agency-overview") {
      if (!user.agencyId) {
        return res.status(403).json({ error: "Access Denied: Agency context required." });
      }
      clientData = { agency_id: user.agencyId };
    } else {
      // Verify client access
      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("agency_id")
        .eq("id", clientId)
        .single();

      if (clientError || !client) {
        return res.status(404).json({ error: "Client account not found" });
      }

      if (!user.isAdmin && client.agency_id !== user.agencyId) {
        return res.status(403).json({ error: "Access Denied: You do not own this client account." });
      }
      clientData = client;
    }
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to verify client access: " + err.message });
  }

  const todayStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const dateRangeKey = `30days-${todayStr}-${tone}`;

  if (!forceRegenerate) {
    try {
      // Check Cache first - exact tone-specific date_range keying
      const { data: cachedSummary } = await supabase
        .from("ai_summaries")
        .select("summary_data, date_range")
        .eq("client_id", clientId)
        .eq("date_range", dateRangeKey);

      if (cachedSummary && cachedSummary.length > 0) {
        const bestMatch = cachedSummary.find(s => s.date_range === dateRangeKey) || cachedSummary[0];
        console.log(`Cache Hit: Serving stored AI summary (${bestMatch.date_range}) for client ${clientId} (${tone})`);
        return res.json({
          insights: bestMatch.summary_data,
          provider: "Cached"
        });
      }
    } catch (cacheErr: any) {
      console.warn("Summary cache check skipped/empty:", cacheErr.message);
    }
  }

  try {
    const metricsPayload = {
      totalSpend: Number(metricsSummary?.totalSpend || 0),
      totalConversions: Number(metricsSummary?.totalConversions || 0),
      avgConvRate: Number(metricsSummary?.avgConvRate || 0),
      avgCtr: Number(metricsSummary?.avgCtr || 0),
      costPerConversion: Number(metricsSummary?.costPerConversion || (metricsSummary?.totalConversions > 0 ? metricsSummary.totalSpend / metricsSummary.totalConversions : 0)),
      totalClicks: Number(metricsSummary?.totalClicks || 0),
      totalImpressions: Number(metricsSummary?.totalImpressions || 0)
    };

    const aiResult = await generateInsights({
      clientName,
      metrics: metricsPayload,
      tone
    });

    try {
      await supabase.from("ai_summaries").delete().eq("client_id", clientId).eq("date_range", dateRangeKey);
      await supabase.from("ai_summaries").insert({
        client_id: clientId,
        agency_id: clientData.agency_id,
        date_range: dateRangeKey,
        summary_data: aiResult.insights
      });
    } catch (saveErr: any) {
      console.warn("Failed to cache AI insights:", saveErr.message);
    }

    return res.json({
      insights: aiResult.insights,
      provider: aiResult.provider,
      warning: aiResult.warning
    });
  } catch (error: any) {
    console.error("General error in server summary endpoint:", error);
    return res.status(500).json({ error: "Performance insights are temporarily unavailable." });
  }
});

// ============================================================================
// PUBLIC DASHBOARD ACCESS & CONFIGURATION ENDPOINTS
// ============================================================================

// 1. GET Dashboard Config: checks if public dashboard is enabled and if token exists
app.get("/api/agency/dashboard-config", requireAuth, async (req, res) => {
  const user = (req as any).user;
  if (!user.agencyId) {
    return res.status(403).json({ error: "Access Denied: Agency context required." });
  }

  try {
    const { data: config, error } = await supabase
      .from("public_dashboards")
      .select("enabled")
      .eq("agency_id", user.agencyId)
      .single();

    if (error && error.code !== "PGRST116") { // Ignore 'no rows returned' error
      throw error;
    }

    res.json({
      enabled: config ? config.enabled : false,
      hasToken: !!config
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load dashboard configuration: " + err.message });
  }
});

// 2. POST Toggle Dashboard: Enables or disables public dashboard access
app.post("/api/agency/dashboard-config/toggle", requireAuth, async (req, res) => {
  const { enabled } = req.body;
  const user = (req as any).user;

  if (!user.agencyId) {
    return res.status(403).json({ error: "Access Denied: Agency context required." });
  }

  try {
    const { data: config } = await supabase
      .from("public_dashboards")
      .select("id")
      .eq("agency_id", user.agencyId)
      .single();

    if (!config) {
      return res.status(400).json({ error: "No token exists. Please generate/rotate public dashboard token first." });
    }

    const { error } = await supabase
      .from("public_dashboards")
      .update({ enabled: !!enabled, updated_at: new Date().toISOString() })
      .eq("agency_id", user.agencyId);

    if (error) throw error;

    await supabase.from("audit_logs").insert({
      agency_id: user.agencyId,
      action: "UPDATE",
      entity: "Dashboard Config",
      details: `Public dashboard access ${!!enabled ? "ENABLED" : "DISABLED"}`,
      user: user.email || "system"
    });

    res.json({ success: true, enabled: !!enabled });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to toggle dashboard: " + err.message });
  }
});

// 3. POST Rotate Token: Generates a new random token, hashes it, and returns the plain token once
app.post("/api/agency/dashboard-config/rotate", requireAuth, rateLimiter(5, 60000), async (req, res) => {
  const user = (req as any).user;
  if (!user.agencyId) {
    return res.status(403).json({ error: "Access Denied: Agency context required." });
  }

  try {
    const plainToken = "lumen_dash_" + crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(plainToken).update("salt_value_lumen_2026").digest("hex");

    const { data: existing } = await supabase
      .from("public_dashboards")
      .select("id")
      .eq("agency_id", user.agencyId)
      .single();

    let error;
    if (existing) {
      ({ error } = await supabase
        .from("public_dashboards")
        .update({
          token_hash: tokenHash,
          enabled: true,
          updated_at: new Date().toISOString()
        })
        .eq("agency_id", user.agencyId));
    } else {
      ({ error } = await supabase
        .from("public_dashboards")
        .insert({
          agency_id: user.agencyId,
          token_hash: tokenHash,
          enabled: true
        }));
    }

    if (error) throw error;

    await supabase.from("audit_logs").insert({
      agency_id: user.agencyId,
      action: "UPDATE",
      entity: "Dashboard Token",
      details: "Public dashboard authorization token rotated / generated",
      user: user.email || "system"
    });

    res.json({ success: true, token: plainToken });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to rotate dashboard token: " + err.message });
  }
});

// 4. PUT Client Publish: Publishes a client to the public dashboard
app.put("/api/clients/:id/public-dashboard", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { enabled } = req.body;
  const user = (req as any).user;

  try {
    const { data: client, error: fetchError } = await supabase
      .from("clients")
      .select("agency_id, name")
      .eq("id", id)
      .single();

    if (fetchError || !client) {
      return res.status(404).json({ error: "Client account not found." });
    }

    if (!user.isAdmin && client.agency_id !== user.agencyId) {
      return res.status(403).json({ error: "Access Denied: You do not own this client account." });
    }

    const { error: updateError } = await supabase
      .from("clients")
      .update({ public_dashboard_enabled: !!enabled })
      .eq("id", id);

    if (updateError) throw updateError;

    await supabase.from("audit_logs").insert({
      agency_id: client.agency_id,
      action: "UPDATE",
      entity: "Client Dashboard Publish",
      details: `Client ${client.name} public dashboard status set to: ${!!enabled ? "PUBLISHED" : "UNPUBLISHED"}`,
      user: user.email || "system"
    });

    res.json({ success: true, clientId: id, publicDashboardEnabled: !!enabled });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to publish client: " + err.message });
  }
});

// ============================================================================
// ISOLATED SECURE CLIENT PORTAL ACCESS & AUTHORIZATION
// ============================================================================

// ============================================================================
// ISOLATED SECURE CLIENT PORTAL ACCESS & AUTHORIZATION
// ============================================================================

const requireClientPortalAccess = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    let token = (req.headers["x-portal-token"] as string) || (req.query.token as string) || (req.params.token as string);
    if (!token && req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token || typeof token !== "string") {
      return res.status(401).json({ error: "Unauthorized: Missing secure client portal token." });
    }

    const tokenHash = hashPortalToken(token);

    const { data: portalRecords, error: portalErr } = await supabase
      .from("client_portal_access")
      .select("*")
      .eq("token_hash", tokenHash)
      .eq("enabled", true)
      .limit(1);

    const portalRecord = portalRecords && portalRecords.length > 0 ? portalRecords[0] : null;

    if (portalErr || !portalRecord) {
      console.error("requireClientPortalAccess failure — portalErr:", portalErr?.message || portalErr, "tokenHash:", tokenHash);
      return res.status(401).json({ error: "Unauthorized: Invalid, disabled, or revoked portal token." });
    }

    const { data: client } = await supabase
      .from("clients")
      .select("*")
      .eq("id", portalRecord.client_id)
      .single();

    const { data: agency } = await supabase
      .from("agencies")
      .select("*")
      .eq("id", portalRecord.agency_id)
      .single();

    if (!client || !agency || client.agency_id !== portalRecord.agency_id) {
      console.error("requireClientPortalAccess binding failure — client:", client?.id, "agency:", agency?.id, "portalAgency:", portalRecord.agency_id);
      return res.status(401).json({ error: "Unauthorized: Invalid portal client binding." });
    }

    (req as any).portalContext = {
      accessType: "client_portal",
      agencyId: portalRecord.agency_id,
      clientId: portalRecord.client_id,
      clientName: client.name,
      agencyName: agency.name,
      logoUrl: agency.logo_url,
      primaryColor: agency.primary_color,
      accentColor: agency.accent_color,
      domain: client.domain,
      platform: client.platform,
      status: client.status,
      targetCpl: client.target_cpl ? Number(client.target_cpl) : null,
      monthlyBudget: Number(client.monthly_budget),
      industry: client.industry || null,
      primaryGoal: client.primary_goal || null,
      regionalDistribution: client.regional_distribution || null,
      brandColor: client.brand_color || null
    };

    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");

    next();
  } catch (err: any) {
    console.error("Portal auth error:", err.message);
    res.status(401).json({ error: "Unauthorized: Client portal verification failed." });
  }
};

// 1. Management API: Get portal access details for a client (Agency/Admin authenticated)
app.get("/api/clients/:id/portal-access", requireAuth, async (req, res) => {
  const { id } = req.params;
  const user = (req as any).user;

  try {
    const { data: client, error: fetchError } = await supabase
      .from("clients")
      .select("agency_id, name")
      .eq("id", id)
      .single();

    if (fetchError || !client) {
      return res.status(404).json({ error: "Client account not found." });
    }

    if (!user.isAdmin && client.agency_id !== user.agencyId) {
      return res.status(403).json({ error: "Access Denied: You do not own this client account." });
    }

    const { data: portalRecord } = await supabase
      .from("client_portal_access")
      .select("*")
      .eq("client_id", id)
      .single();

    if (!portalRecord) {
      return res.json({
        enabled: false,
        lastRotatedAt: null,
        portalUrl: null
      });
    }

    let plainToken: string | null = null;
    if (portalRecord.encrypted_token) {
      plainToken = decryptPortalToken(portalRecord.encrypted_token);
    }

    const baseUrl = getAppBaseUrl(req);
    const portalUrl = (portalRecord.enabled && plainToken) ? `${baseUrl}/portal/${plainToken}` : null;

    res.json({
      enabled: portalRecord.enabled,
      lastRotatedAt: portalRecord.last_rotated_at || null,
      portalUrl
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load client portal access info: " + err.message });
  }
});

// 2. Management API: Rotate portal link for a client (Agency/Admin authenticated)
app.post("/api/clients/:id/portal-access/rotate", requireAuth, rateLimiter(5, 60000), async (req, res) => {
  const { id } = req.params;
  const user = (req as any).user;

  try {
    const { data: client, error: fetchError } = await supabase
      .from("clients")
      .select("agency_id, name")
      .eq("id", id)
      .single();

    if (fetchError || !client) {
      return res.status(404).json({ error: "Client account not found." });
    }

    if (!user.isAdmin && client.agency_id !== user.agencyId) {
      return res.status(403).json({ error: "Access Denied: You do not own this client account." });
    }

    const { data: existing } = await supabase
      .from("client_portal_access")
      .select("*")
      .eq("client_id", id)
      .single();

    const plainToken = generateRawPortalToken();
    const tokenHash = hashPortalToken(plainToken);
    const encryptedToken = encryptPortalToken(plainToken);
    const nowIso = new Date().toISOString();

    const isEnabled = existing ? existing.enabled : false;

    let error;
    if (existing) {
      ({ error } = await supabase
        .from("client_portal_access")
        .update({
          token_hash: tokenHash,
          encrypted_token: encryptedToken,
          updated_at: nowIso,
          last_rotated_at: nowIso
        })
        .eq("client_id", id));
    } else {
      ({ error } = await supabase
        .from("client_portal_access")
        .insert({
          agency_id: client.agency_id,
          client_id: id,
          token_hash: tokenHash,
          encrypted_token: encryptedToken,
          enabled: false,
          last_rotated_at: nowIso
        }));
    }

    if (error) throw error;

    await supabase.from("audit_logs").insert({
      agency_id: client.agency_id,
      action: "UPDATE",
      entity: "Client Portal Token",
      details: `Rotated portal access token for client ${client.name}`,
      user: user.email || "system"
    });

    const baseUrl = getAppBaseUrl(req);
    const portalUrl = isEnabled ? `${baseUrl}/portal/${plainToken}` : null;

    res.json({ success: true, enabled: isEnabled, lastRotatedAt: nowIso, portalUrl });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to rotate client portal token: " + err.message });
  }
});

// 3. Management API: Toggle portal access (Agency/Admin authenticated)
app.post("/api/clients/:id/portal-access/toggle", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { enabled } = req.body;
  const user = (req as any).user;

  try {
    const { data: client, error: fetchError } = await supabase
      .from("clients")
      .select("agency_id, name")
      .eq("id", id)
      .single();

    if (fetchError || !client) {
      return res.status(404).json({ error: "Client account not found." });
    }

    if (!user.isAdmin && client.agency_id !== user.agencyId) {
      return res.status(403).json({ error: "Access Denied: You do not own this client account." });
    }

    const { data: existing } = await supabase
      .from("client_portal_access")
      .select("*")
      .eq("client_id", id)
      .single();

    let plainToken: string | null = null;
    const nextEnabled = !!enabled;

    if (!existing) {
      plainToken = generateRawPortalToken();
      const tokenHash = hashPortalToken(plainToken);
      const encryptedToken = encryptPortalToken(plainToken);

      const { error: insertError } = await supabase
        .from("client_portal_access")
        .insert({
          agency_id: client.agency_id,
          client_id: id,
          token_hash: tokenHash,
          encrypted_token: encryptedToken,
          enabled: nextEnabled
        });
      if (insertError) throw insertError;
    } else {
      if (existing.encrypted_token) {
        plainToken = decryptPortalToken(existing.encrypted_token);
      }
      if (!plainToken) {
        plainToken = generateRawPortalToken();
        const tokenHash = hashPortalToken(plainToken);
        const encryptedToken = encryptPortalToken(plainToken);

        const { error: updateTokenErr } = await supabase
          .from("client_portal_access")
          .update({
            token_hash: tokenHash,
            encrypted_token: encryptedToken,
            enabled: nextEnabled,
            updated_at: new Date().toISOString()
          })
          .eq("client_id", id);
        if (updateTokenErr) throw updateTokenErr;
      } else {
        const { error: updateError } = await supabase
          .from("client_portal_access")
          .update({ enabled: nextEnabled, updated_at: new Date().toISOString() })
          .eq("client_id", id);
        if (updateError) throw updateError;
      }
    }

    await supabase.from("audit_logs").insert({
      agency_id: client.agency_id,
      action: "UPDATE",
      entity: "Client Portal Status",
      details: `Client ${client.name} portal status set to: ${nextEnabled ? "ENABLED" : "DISABLED"}`,
      user: user.email || "system"
    });

    const baseUrl = getAppBaseUrl(req);
    const portalUrl = (nextEnabled && plainToken) ? `${baseUrl}/portal/${plainToken}` : null;

    res.json({ success: true, enabled: nextEnabled, portalUrl });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to toggle portal access: " + err.message });
  }
});

// 4. PUBLIC PORTAL: Validate token & fetch portal branding/metadata
app.get("/api/portal/validate/:token", rateLimiter(30, 60000), async (req, res) => {
  const { token } = req.params;
  if (!token) return res.status(400).json({ error: "Portal token parameter is required." });

  const tokenHash = hashPortalToken(token);
  const { data: portalRecords, error: portalErr } = await supabase
    .from("client_portal_access")
    .select("*")
    .eq("token_hash", tokenHash)
    .eq("enabled", true)
    .limit(1);

  const portalRecord = portalRecords && portalRecords.length > 0 ? portalRecords[0] : null;

  if (portalErr || !portalRecord) {
    return res.status(401).json({ error: "Unauthorized: Invalid, disabled, or revoked portal token." });
  }

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", portalRecord.client_id)
    .single();

  const { data: agency } = await supabase
    .from("agencies")
    .select("*")
    .eq("id", portalRecord.agency_id)
    .single();

  if (!client || !agency || client.agency_id !== portalRecord.agency_id) {
    return res.status(401).json({ error: "Unauthorized: Client portal context mismatch." });
  }

  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
  res.json({
    valid: true,
    agency: {
      id: agency.id,
      name: agency.name,
      slug: agency.slug,
      logoUrl: agency.logo_url,
      primaryColor: agency.primary_color,
      accentColor: agency.accent_color,
      customCta: agency.custom_cta
    },
    client: {
      id: client.id,
      name: client.name,
      domain: client.domain,
      platform: client.platform,
      status: client.status,
      brandColor: client.brand_color,
      targetCpl: client.target_cpl ? Number(client.target_cpl) : null,
      monthlyBudget: Number(client.monthly_budget),
      industry: client.industry || null,
      primaryGoal: client.primary_goal || null,
      regionalDistribution: client.regional_distribution || null
    }
  });
});

// 5. PUBLIC PORTAL: Scoped Analytics Data
app.get("/api/portal/analytics", requireClientPortalAccess, rateLimiter(30, 60000), async (req, res) => {
  const ctx = (req as any).portalContext;
  if (req.query.clientId && req.query.clientId !== ctx.clientId) {
    return res.status(403).json({ error: "Access Denied: Requested clientId does not match validated portal context." });
  }

  const clientId = ctx.clientId;
  const { startDate, endDate } = req.query;

  try {
    let metricsQuery = supabase
      .from("campaign_metrics")
      .select("date, spend, impressions, clicks, conversions, platform, campaign_name, revenue, conversion_value")
      .eq("client_id", clientId);

    if (startDate && typeof startDate === "string") {
      metricsQuery = metricsQuery.gte("date", startDate);
    }
    if (endDate && typeof endDate === "string") {
      metricsQuery = metricsQuery.lte("date", endDate);
    }

    const { data: dbMetrics, error: metricsError } = await metricsQuery.order("date", { ascending: true });
    if (metricsError) throw metricsError;

    let metrics: PerformanceMetric[] = [];
    let campaignsList: any[] = [];

    if (dbMetrics && dbMetrics.length > 0) {
      const dailyGroup: { [date: string]: PerformanceMetric } = {};
      const campaignsGroup: { [name: string]: any } = {};

      for (const m of dbMetrics) {
        const dateStr = m.date;
        if (!dailyGroup[dateStr]) {
          dailyGroup[dateStr] = {
            date: dateStr,
            spend: 0,
            clicks: 0,
            impressions: 0,
            conversions: 0,
            conversionValue: 0
          };
        }
        dailyGroup[dateStr].spend += Number(m.spend);
        dailyGroup[dateStr].clicks += Number(m.clicks);
        dailyGroup[dateStr].impressions += Number(m.impressions);
        dailyGroup[dateStr].conversions += Number(m.conversions);
        dailyGroup[dateStr].conversionValue += Number(m.conversion_value || m.revenue || 0);

        if (m.campaign_name && m.campaign_name !== "General") {
          const cName = m.campaign_name;
          if (!campaignsGroup[cName]) {
            campaignsGroup[cName] = {
              id: `camp-${cName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
              name: cName,
              platform: m.platform,
              status: "Active",
              spend: 0,
              impressions: 0,
              clicks: 0,
              conversions: 0,
              conversionValue: 0
            };
          }
          campaignsGroup[cName].spend += Number(m.spend);
          campaignsGroup[cName].impressions += Number(m.impressions);
          campaignsGroup[cName].clicks += Number(m.clicks);
          campaignsGroup[cName].conversions += Number(m.conversions);
          campaignsGroup[cName].conversionValue += Number(m.conversion_value || m.revenue || 0);
        }
      }

      metrics = Object.values(dailyGroup).sort((a, b) => a.date.localeCompare(b.date));

      campaignsList = Object.values(campaignsGroup).map((c: any) => {
        const cpl = c.conversions > 0 ? c.spend / c.conversions : 0;
        const roas = c.spend > 0 ? c.conversionValue / c.spend : 0;
        return {
          id: c.id,
          name: c.name,
          platform: c.platform,
          status: c.status,
          spend: c.spend,
          impressions: c.impressions,
          clicks: c.clicks,
          conversions: c.conversions,
          cpl,
          roas
        };
      });
    }

    res.json({
      client: {
        id: ctx.clientId,
        name: ctx.clientName,
        domain: ctx.domain,
        platform: ctx.platform,
        status: ctx.status,
        agencyId: ctx.agencyId,
        targetCpl: ctx.targetCpl,
        brandColor: ctx.brandColor,
        industry: ctx.industry,
        primaryGoal: ctx.primaryGoal,
        regionalDistribution: ctx.regionalDistribution
      },
      metrics,
      campaigns: campaignsList,
      status: metrics.length > 0 ? "OK" : "NO_DATA"
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load portal analytics: " + err.message });
  }
});

// 6. PUBLIC PORTAL: Scoped AI Summary
app.get("/api/portal/summary", requireClientPortalAccess, rateLimiter(20, 60000), async (req, res) => {
  const ctx = (req as any).portalContext;
  if (req.query.clientId && req.query.clientId !== ctx.clientId) {
    return res.status(403).json({ error: "Access Denied: Requested clientId does not match validated portal context." });
  }

  try {
    const { data: summary, error: summaryErr } = await supabase
      .from("ai_summaries")
      .select("summary_data, created_at")
      .eq("client_id", ctx.clientId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (summaryErr || !summary || summary.length === 0) {
      return res.json({ insights: [], status: "NO_DATA" });
    }

    res.json({
      insights: summary[0].summary_data,
      createdAt: summary[0].created_at
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load portal AI summary: " + err.message });
  }
});

// 7. PUBLIC PORTAL: Scoped Reports List (Explicit Safe Projection)
app.get("/api/portal/reports", requireClientPortalAccess, rateLimiter(20, 60000), async (req, res) => {
  const ctx = (req as any).portalContext;

  try {
    const { data: deliveries, error } = await supabase
      .from("client_report_deliveries")
      .select("id, report_period_start, report_period_end, sent_at, status")
      .eq("client_id", ctx.clientId)
      .order("sent_at", { ascending: false });

    if (error) throw error;

    const mapped = (deliveries || []).map((d: any) => ({
      id: d.id,
      reportPeriodStart: d.report_period_start,
      reportPeriodEnd: d.report_period_end,
      sentAt: d.sent_at,
      status: d.status
    }));

    res.json(mapped);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load portal reports: " + err.message });
  }
});


// ============================================================================
// AUTOMATED CLIENT REPORTING + EMAIL ROUTING SYSTEM
// ============================================================================

// A. GET: Fetch client performance report data
app.get("/api/clients/:clientId/report", requireAuth, async (req, res) => {
  const { clientId } = req.params;
  const user = (req as any).user;

  try {
    const { data: client, error: fetchError } = await supabase
      .from("clients")
      .select("agency_id, name")
      .eq("id", clientId)
      .single();

    if (fetchError || !client) {
      return res.status(404).json({ error: "Client account not found." });
    }

    if (!user.isAdmin && client.agency_id !== user.agencyId) {
      return res.status(403).json({ error: "Access Denied: You do not own this client account." });
    }

    let startStr = req.query.startDate as string;
    let endStr = req.query.endDate as string;
    
    // Default to last complete week (Monday -> Sunday)
    if (!startStr || !endStr) {
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday
      const daysToSub = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      
      const end = new Date();
      end.setDate(today.getDate() - daysToSub - 1); // Last Sunday
      const start = new Date();
      start.setDate(end.getDate() - 6); // Last Monday
      
      startStr = start.toISOString().split("T")[0];
      endStr = end.toISOString().split("T")[0];
    }

    const baseUrl = getAppBaseUrl(req);
    const report = await generateReportData(clientId, client.agency_id, startStr, endStr, supabase, baseUrl);
    res.json(report);
  } catch (err: any) {
    console.error("Error generating report:", err.message);
    res.status(500).json({ error: "Failed to generate report: " + err.message });
  }
});

// A2. GET: Fetch client performance report HTML preview
app.get("/api/clients/:clientId/report/preview", requireAuth, async (req, res) => {
  const { clientId } = req.params;
  const user = (req as any).user;

  try {
    const { data: client, error: fetchError } = await supabase
      .from("clients")
      .select("agency_id, name")
      .eq("id", clientId)
      .single();

    if (fetchError || !client) {
      return res.status(404).send("Client account not found.");
    }

    if (!user.isAdmin && client.agency_id !== user.agencyId) {
      return res.status(403).send("Access Denied: You do not own this client account.");
    }

    let startStr = req.query.startDate as string;
    let endStr = req.query.endDate as string;
    
    if (!startStr || !endStr) {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const daysToSub = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      
      const end = new Date();
      end.setDate(today.getDate() - daysToSub - 1);
      const start = new Date();
      start.setDate(end.getDate() - 6);
      
      startStr = start.toISOString().split("T")[0];
      endStr = end.toISOString().split("T")[0];
    }

    const baseUrl = getAppBaseUrl(req);
    const report = await generateReportData(clientId, client.agency_id, startStr, endStr, supabase, baseUrl);
    const html = renderReportHtml(report);
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (err: any) {
    console.error("Error generating report preview:", err.message);
    res.status(500).send("Failed to generate report preview: " + err.message);
  }
});

// B. POST: Dispatch test report email to target email address
app.post("/api/clients/:clientId/report/test", requireAuth, async (req, res) => {
  const { clientId } = req.params;
  const { testEmail } = req.body;
  const user = (req as any).user;

  if (!testEmail || typeof testEmail !== "string" || !testEmail.includes("@")) {
    return res.status(400).json({ error: "A valid testEmail address is required." });
  }

  try {
    const { data: client, error: fetchError } = await supabase
      .from("clients")
      .select("agency_id, name")
      .eq("id", clientId)
      .single();

    if (fetchError || !client) {
      return res.status(404).json({ error: "Client account not found." });
    }

    if (!user.isAdmin && client.agency_id !== user.agencyId) {
      return res.status(403).json({ error: "Access Denied: You do not own this client account." });
    }

    // Default to last complete week
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysToSub = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    
    const end = new Date();
    end.setDate(today.getDate() - daysToSub - 1);
    const start = new Date();
    start.setDate(end.getDate() - 6);
    
    const startStr = start.toISOString().split("T")[0];
    const endStr = end.toISOString().split("T")[0];

    const baseUrl = getAppBaseUrl(req);
    const report = await generateReportData(clientId, client.agency_id, startStr, endStr, supabase, baseUrl);
    const html = renderReportHtml(report);
    
    const emailResult = await sendEmail({
      to: testEmail,
      subject: `[TEST REPORT] Weekly Performance Report for ${report.clientName}`,
      html,
      agencyName: report.agencyName
    });

    if (emailResult.success) {
      res.json({ success: true, message: "Test report email dispatched successfully!" });
    } else {
      res.status(500).json({ error: "Failed to deliver email: " + emailResult.error });
    }
  } catch (err: any) {
    console.error("Error sending test report:", err.message);
    res.status(500).json({ error: "Failed to send test report: " + err.message });
  }
});

// C. POST: Cron handler to generate and dispatch weekly reports
app.post("/api/cron/client-reports", async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  const reqSecret = req.query.secret || req.headers["x-cron-secret"];

  if (cronSecret && reqSecret !== cronSecret) {
    return res.status(401).json({ error: "Unauthorized: Invalid cron secret." });
  }

  console.log("[CRON] Initiating automated client report batch process...");

  try {
    const { data: clients, error: fetchErr } = await supabase
      .from("clients")
      .select("*")
      .eq("reporting_enabled", true);

    if (fetchErr) throw fetchErr;
    if (!clients || clients.length === 0) {
      return res.json({ message: "No clients configured for automated reporting.", processed: 0 });
    }

    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysToSub = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    
    const end = new Date();
    end.setDate(today.getDate() - daysToSub - 1);
    const start = new Date();
    start.setDate(end.getDate() - 6);
    
    const startStr = start.toISOString().split("T")[0];
    const endStr = end.toISOString().split("T")[0];

    const results: any[] = [];
    let processed = 0;

    for (const client of clients) {
      const recipient = client.report_email;
      if (!recipient || !recipient.includes("@")) {
        results.push({ clientId: client.id, status: "skipped", reason: "Invalid or missing report_email." });
        continue;
      }

      // Check timezone eligibility
      try {
        const clientDateObj = new Date(new Intl.DateTimeFormat("en-US", { timeZone: client.report_timezone || "UTC" }).format(new Date()));
        const clientLocalDay = clientDateObj.getDay(); // 0 = Sunday, 1 = Monday, etc.

        if (clientLocalDay !== client.report_day) {
          // Not the configured day for this client yet
          continue;
        }

        const clientLocalHourStr = new Intl.DateTimeFormat("en-US", { timeZone: client.report_timezone || "UTC", hour: "numeric", hour12: false }).format(new Date());
        const clientLocalHour = parseInt(clientLocalHourStr, 10);
        const targetHour = parseInt((client.report_time || "08:00").split(":")[0], 10);

        if (clientLocalHour < targetHour) {
          // Configured hour has not arrived yet in client's timezone
          continue;
        }
      } catch (tzErr: any) {
        console.warn(`Timezone lookup failed for client ${client.id} (${client.report_timezone}): ${tzErr.message}. Defaulting to send.`);
      }

      processed++;

      // Check if already sent (Idempotency unique check)
      const { data: existingDelivery } = await supabase
        .from("client_report_deliveries")
        .select("id")
        .eq("client_id", client.id)
        .eq("report_period_start", startStr)
        .eq("report_period_end", endStr)
        .eq("recipient_email", recipient)
        .maybeSingle();

      if (existingDelivery) {
        results.push({ clientId: client.id, status: "skipped", reason: "Report already sent for this period." });
        continue;
      }

      try {
        // Generate Report
        const baseUrl = getAppBaseUrl(req);
        const report = await generateReportData(client.id, client.agency_id, startStr, endStr, supabase, baseUrl);
        const html = renderReportHtml(report);

        // Send Email
        const emailResult = await sendEmail({
          to: recipient,
          cc: client.report_cc || undefined,
          subject: `Weekly Performance Report for ${report.clientName}`,
          html,
          agencyName: report.agencyName
        });

        if (emailResult.success) {
          // Record successful delivery
          await supabase.from("client_report_deliveries").insert({
            agency_id: client.agency_id,
            client_id: client.id,
            report_period_start: startStr,
            report_period_end: endStr,
            recipient_email: recipient,
            status: "sent",
            sent_at: new Date().toISOString()
          });

          results.push({ clientId: client.id, status: "sent" });
        } else {
          throw new Error(emailResult.error);
        }
      } catch (sendErr: any) {
        console.error(`Failed to send report for client ${client.id}:`, sendErr.message);

        // Record failed delivery attempt
        await supabase.from("client_report_deliveries").insert({
          agency_id: client.agency_id,
          client_id: client.id,
          report_period_start: startStr,
          report_period_end: endStr,
          recipient_email: recipient,
          status: "failed",
          error_message: sendErr.message
        });

        results.push({ clientId: client.id, status: "failed", error: sendErr.message });
      }
    }

    res.json({ message: "Automated report batch run complete.", processed, results });
  } catch (err: any) {
    console.error("Cron batch reporting error:", err.message);
    res.status(500).json({ error: "Automated batch run failed: " + err.message });
  }
});

// Helper: Verifies a public token and returns the corresponding agency_id
async function verifyPublicToken(token: string): Promise<string | null> {
  if (!token || typeof token !== "string") return null;
  try {
    const tokenHash = crypto.createHash("sha256").update(token).update("salt_value_lumen_2026").digest("hex");
    const { data, error } = await supabase
      .from("public_dashboards")
      .select("agency_id, enabled")
      .eq("token_hash", tokenHash)
      .single();

    if (error || !data || !data.enabled) return null;
    return data.agency_id;
  } catch (err) {
    return null;
  }
}

// 5. PUBLIC GET: Dashboard Config & Client list
app.get("/api/public/dashboard/:token", rateLimiter(20, 60000), async (req, res) => {
  const { token } = req.params;
  const agencyId = await verifyPublicToken(token);

  if (!agencyId) {
    return res.status(401).json({ error: "Unauthorized: Invalid or revoked public dashboard token." });
  }

  try {
    const { data: agency, error: agencyError } = await supabase
      .from("agencies")
      .select("name, logo_url, primary_color, accent_color, custom_cta, slug")
      .eq("id", agencyId)
      .single();

    if (agencyError || !agency) throw agencyError || new Error("Agency not found");

    const { data: clients, error: clientsError } = await supabase
      .from("clients")
      .select("id, name, domain, platform, monthly_budget, status, target_cpl, brand_color, industry, primary_goal, regional_distribution")
      .eq("agency_id", agencyId)
      .eq("public_dashboard_enabled", true);

    if (clientsError) throw clientsError;

    res.json({
      agency,
      clients: (clients || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        domain: c.domain,
        platform: c.platform,
        monthlyBudget: Number(c.monthly_budget),
        status: c.status,
        targetCpl: c.target_cpl ? Number(c.target_cpl) : null,
        brandColor: c.brand_color || null,
        industry: c.industry || null,
        primaryGoal: c.primary_goal || null,
        regionalDistribution: c.regional_distribution || null
      }))
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load public dashboard: " + err.message });
  }
});

// 6. PUBLIC GET: Client metrics
app.get("/api/public/analytics/:clientId", rateLimiter(30, 60000), async (req, res) => {
  const { clientId } = req.params;
  const token = (req.query.token as string) || (req.headers["x-public-dashboard-token"] as string);
  const agencyId = await verifyPublicToken(token);

  if (!agencyId) {
    return res.status(401).json({ error: "Unauthorized: Invalid token." });
  }

  try {
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, name, domain, platform, monthly_budget, status, agency_id, public_dashboard_enabled, target_cpl, brand_color, industry, primary_goal, regional_distribution")
      .eq("id", clientId)
      .single();

    if (clientErr || !client || client.agency_id !== agencyId || !client.public_dashboard_enabled) {
      return res.status(404).json({ error: "Client dashboard not found or unpublished." });
    }

    const mappedClient = {
      id: client.id,
      name: client.name,
      domain: client.domain,
      platform: client.platform,
      monthlyBudget: Number(client.monthly_budget),
      status: client.status,
      agencyId: client.agency_id,
      targetCpl: client.target_cpl ? Number(client.target_cpl) : null,
      brandColor: client.brand_color || null,
      industry: client.industry || null,
      primaryGoal: client.primary_goal || null,
      regionalDistribution: client.regional_distribution || null
    };

    const { data: dbMetrics, error: metricsError } = await supabase
      .from("campaign_metrics")
      .select("date, spend, impressions, clicks, conversions, platform, campaign_name, revenue, conversion_value")
      .eq("client_id", clientId)
      .order("date", { ascending: true });

    let metrics: PerformanceMetric[] = [];
    let campaignsList: any[] = [];
    let status = "OK";

    if (!metricsError && dbMetrics && dbMetrics.length > 0) {
      const dailyGroup: { [date: string]: PerformanceMetric } = {};
      const campaignsGroup: { [name: string]: any } = {};

      for (const m of dbMetrics) {
        const dateStr = m.date;
        if (!dailyGroup[dateStr]) {
          dailyGroup[dateStr] = {
            date: dateStr,
            spend: 0,
            clicks: 0,
            impressions: 0,
            conversions: 0,
            conversionValue: 0
          };
        }
        dailyGroup[dateStr].spend += Number(m.spend);
        dailyGroup[dateStr].clicks += Number(m.clicks);
        dailyGroup[dateStr].impressions += Number(m.impressions);
        dailyGroup[dateStr].conversions += Number(m.conversions);
        dailyGroup[dateStr].conversionValue += Number(m.conversion_value || m.revenue || 0);

        if (m.campaign_name && m.campaign_name !== "General") {
          const cName = m.campaign_name;
          if (!campaignsGroup[cName]) {
            campaignsGroup[cName] = {
              id: `camp-${cName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
              name: cName,
              platform: m.platform,
              status: "Active",
              spend: 0,
              impressions: 0,
              clicks: 0,
              conversions: 0,
              conversionValue: 0
            };
          }
          campaignsGroup[cName].spend += Number(m.spend);
          campaignsGroup[cName].impressions += Number(m.impressions);
          campaignsGroup[cName].clicks += Number(m.clicks);
          campaignsGroup[cName].conversions += Number(m.conversions);
          campaignsGroup[cName].conversionValue += Number(m.conversion_value || m.revenue || 0);
        }
      }
      metrics = Object.values(dailyGroup).sort((a, b) => a.date.localeCompare(b.date));

      campaignsList = Object.values(campaignsGroup).map((c: any) => {
        const cpl = c.conversions > 0 ? c.spend / c.conversions : 0;
        const roas = c.spend > 0 ? c.conversionValue / c.spend : 0;
        return {
          id: c.id,
          name: c.name,
          platform: c.platform,
          status: c.status,
          spend: c.spend,
          impressions: c.impressions,
          clicks: c.clicks,
          conversions: c.conversions,
          cpl,
          roas
        };
      });
    } else {
      status = "NO_DATA";
    }

    res.json({
      client: mappedClient,
      metrics,
      campaigns: campaignsList,
      status
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load public analytics: " + err.message });
  }
});

// 7. PUBLIC GET: Client AI summary insights (pre-generated only!)
app.get("/api/public/summary/:clientId", rateLimiter(20, 60000), async (req, res) => {
  const { clientId } = req.params;
  const token = (req.query.token as string) || (req.headers["x-public-dashboard-token"] as string);
  const agencyId = await verifyPublicToken(token);

  if (!agencyId) {
    return res.status(401).json({ error: "Unauthorized: Invalid token." });
  }

  try {
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("agency_id, public_dashboard_enabled")
      .eq("id", clientId)
      .single();

    if (clientErr || !client || client.agency_id !== agencyId || !client.public_dashboard_enabled) {
      return res.status(404).json({ error: "Client not found or unpublished." });
    }

    const { data: summary, error: summaryErr } = await supabase
      .from("ai_summaries")
      .select("summary_data, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (summaryErr || !summary || summary.length === 0) {
      return res.json({ insights: [], status: "NO_DATA" });
    }

    res.json({
      insights: summary[0].summary_data,
      createdAt: summary[0].created_at,
      provider: "Cached"
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load public summary: " + err.message });
  }
});

// Mount Vite middleware or static server
async function start() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Setting up Vite middleware for development...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Serving production static assets...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Lumen Analytics custom backend server running on http://0.0.0.0:${PORT}`);
  });
}

// Only start the listening server if we are NOT running in the Vercel serverless environment
if (!process.env.VERCEL) {
  start();
}

export default app;
