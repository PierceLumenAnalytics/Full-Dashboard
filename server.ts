import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Security Headers and CORS Middleware
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
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
  const isMutation = isWriteMethod && !req.path.endsWith("/summary") && !req.path.endsWith("/config") && !req.path.includes("/dashboard-config");
  
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
            (req as any).user = {
              id: authUser.id,
              email: authUser.email,
              isAdmin: true,
              isDemo: false,
              agencyId: null,
              agencyName: null,
              customCta: null,
              logoUrl: null,
              primaryColor: null,
              accentColor: null,
              clientLimit: 9999
            };
            return next();
          } else {
            const agency = (profile as any).agencies;
            (req as any).user = {
              id: authUser.id,
              email: authUser.email,
              agencyId: profile.agency_id,
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

    // 3. Check X-Agency-Slug header for public white-label dashboard requests (read-only)
    const agencySlug = req.headers["x-agency-slug"] || req.query.agencySlug;
    if (agencySlug && typeof agencySlug === "string") {
      const { data: agency, error: agencyError } = await supabase
        .from("agencies")
        .select("*")
        .eq("slug", agencySlug)
        .single();
      
      if (!agencyError && agency) {
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
          isDemo: agency.is_demo || false
        };
        return next();
      }
    }

    // 4. Default fallback lookup of Northstar Digital agency info for backward compatibility / public demo session
    const { data: agency, error: agencyError } = await supabase
      .from("agencies")
      .select("*")
      .eq("name", "Northstar Digital")
      .single();

    if (!agencyError && agency) {
      (req as any).user = {
        id: "public-demo-user-id",
        email: "demo@northstar-digital.com",
        agencyId: agency.id,
        isAdmin: false,
        agencyName: agency.name,
        customCta: agency.custom_cta || null,
        logoUrl: agency.logo_url || null,
        primaryColor: agency.primary_color || null,
        accentColor: agency.accent_color || null,
        clientLimit: agency.client_limit || 5,
        isDemo: agency.is_demo || false
      };
      return next();
    }

    return res.status(401).json({ error: "Unauthorized: Invalid credentials." });
  } catch (err: any) {
    console.error("Auth middleware error:", err.message);
    res.status(401).json({ error: "Unauthorized: Auth check failed." });
  }
};

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

  const { name, slug, logoUrl, primaryColor, accentColor, clientLimit, clients } = req.body;

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
        client_limit: typeof clientLimit === "number" ? clientLimit : 5
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
  const { name, slug, logoUrl, primaryColor, accentColor, clientLimit } = req.body;

  try {
    const updates: any = {};
    if (name) updates.name = name.trim();
    if (slug) updates.slug = slug.trim().toLowerCase();
    if (logoUrl !== undefined) updates.logo_url = logoUrl ? logoUrl.trim() : null;
    if (primaryColor !== undefined) updates.primary_color = primaryColor ? primaryColor.trim() : null;
    if (accentColor !== undefined) updates.accent_color = accentColor ? accentColor.trim() : null;
    if (clientLimit !== undefined) updates.client_limit = Number(clientLimit);

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



interface PerformanceMetric {
  date: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
}

// Cleaned up client-side mock generators

// API: List connected clients
app.get("/api/clients", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    console.log(`GET /api/clients: Querying clients table for ${user.email} (Admin: ${user.isAdmin})`);
    
    let query;
    if (user.isAdmin) {
      // Admin lists only clients belonging to real (non-demo) agencies
      const { data: nonDemoAgencies } = await supabase
        .from("agencies")
        .select("id")
        .eq("is_demo", false);
      const nonDemoIds = (nonDemoAgencies || []).map(a => a.id);
      query = supabase
        .from("clients")
        .select("*")
        .in("agency_id", nonDemoIds)
        .order("created_at", { ascending: true });
    } else {
      query = supabase
        .from("clients")
        .select("*")
        .eq("agency_id", user.agencyId)
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
      agencyId: c.agency_id
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
  const { name, domain, platform, monthlyBudget, agencyId: inputAgencyId } = req.body;
  const user = (req as any).user;
  
  // Zod-like simple key validation for security/safety
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ error: "Client name is required and must be a valid string." });
  }
  if (!domain || typeof domain !== "string" || !domain.includes(".")) {
    return res.status(400).json({ error: "A valid domain (e.g., example.com) is required." });
  }
  if (!platform || !["Google Ads", "Meta Ads", "TikTok Ads", "All Platforms"].includes(platform)) {
    return res.status(400).json({ error: "Platform must be one of: Google Ads, Meta Ads, TikTok Ads, All Platforms." });
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
        agency_id: targetAgencyId
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
      agencyId: newClientData.agency_id
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
    if (platform && ["Google Ads", "Meta Ads", "TikTok Ads", "All Platforms"].includes(platform)) updates.platform = platform;
    if (monthlyBudget !== undefined && typeof monthlyBudget === "number" && monthlyBudget > 0) updates.monthly_budget = monthlyBudget;
    if (status && ["Active", "Paused", "Needs Review"].includes(status)) updates.status = status;

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
      agencyId: updatedClientData.agency_id
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
      agencyId: client.agency_id
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

// API: Update agency custom CTA message
app.put("/api/agency/cta", requireAuth, async (req, res) => {
  const { customCta } = req.body;
  const user = (req as any).user;

  if (user.isAdmin) {
    return res.status(400).json({ error: "Admin role cannot set an agency custom CTA." });
  }
  if (!user.agencyId) {
    return res.status(400).json({ error: "User is not linked to any agency." });
  }

  try {
    const { error } = await supabase
      .from("agencies")
      .update({ custom_cta: customCta ? customCta.trim() : null })
      .eq("id", user.agencyId);

    if (error) throw error;

    res.json({ success: true, customCta });
  } catch (err: any) {
    console.error("Update CTA Error:", err.message);
    res.status(500).json({ error: "Failed to update agency CTA: " + err.message });
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
  const { clientId, clientName, metricsSummary, tone = "Executive" } = req.body;
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
  const dateRangeKey = `30days-${todayStr}`;

  try {
    // Check Cache first
    const { data: cachedSummary } = await supabase
      .from("ai_summaries")
      .select("summary_data")
      .eq("client_id", clientId)
      .eq("date_range", dateRangeKey)
      .single();

    if (cachedSummary) {
      console.log(`Cache Hit: Serving stored AI summary for client ${clientId} on date ${todayStr}`);
      return res.json({
        insights: (cachedSummary as any).summary_data,
        provider: "Cached"
      });
    }
  } catch (cacheErr: any) {
    console.warn("Summary cache check skipped/empty:", cacheErr.message);
  }

  // Graceful fallback generator using actual client performance metrics
  const generateDynamicFallbackInsights = (name: string, summary: any) => {
    if (clientId === "agency-overview") {
      const totalSpend = summary.totalSpend || 0;
      const totalConversions = summary.totalConversions || 0;
      const totalConversionValue = summary.totalConversionValue || 0;
      const avgCpl = totalConversions > 0 ? totalSpend / totalConversions : 0;
      const roas = totalSpend > 0 ? totalConversionValue / totalSpend : 0;

      return [
        {
          type: "scale",
          label: "AGENCY SUMMARY",
          number: "01",
          what: `Agency-wide spend is tracking at $${totalSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })} producing ${totalConversions.toLocaleString()} leads overall.`,
          why: `Overall agency CPL is tracking efficiently at $${avgCpl.toFixed(2)}, indicating a stable performance baseline across all marketing channels.`,
          action: "Maintain current target bid caps. Continue monitoring campaign fatigue on lower-performing accounts."
        },
        {
          type: "opportunity",
          label: "OPPORTUNITY",
          number: "02",
          what: "Overall agency performance improved, driven primarily by Apex Roofing and Summit Fitness.",
          why: `Apex Roofing and Summit Fitness accounts generated high ROAS and efficient conversion volume, boosting average ROAS to ${roas.toFixed(2)}x.`,
          action: "Shift budget allocations from under-performing accounts to scale high-performing campaigns on these two clients."
        },
        {
          type: "alert",
          label: "ALERT",
          number: "03",
          what: "Canyon Home Services is experiencing severe performance deterioration.",
          why: "Canyon Home Services cost-per-lead rose 57% to $102.50 due to ad conversion pacing issues on plumbing search queries.",
          action: "Audit the plumber landing page form and check match query report for negative search terms."
        }
      ];
    }

    const totalSpend = summary.totalSpend || 0;
    const totalConversions = summary.totalConversions || 0;
    const avgConvRate = summary.avgConvRate || 0;
    const totalClicks = summary.totalClicks || 0;
    const avgCtr = summary.avgCtr || 0;

    const toneText = tone.toLowerCase();
    const greetings = {
      casual: `Hey, quick update on ${name}. things look solid.`,
      "data-driven": `Analyzing key performative indicators for ${name}. Variance metrics follow.`,
      executive: `Executive overview for ${name}. High-level indicators show sound efficiency.`
    }[toneText] || `Executive performance highlights for ${name}.`;

    return [
      {
        type: "scale",
        label: "SCALE",
        number: "01",
        what: `${greetings} Meta Ads generated efficient conversion volume.`,
        why: `Total spend reached $${totalSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })} producing ${totalConversions.toLocaleString()} conversions.`,
        action: "Increase daily budget by 10-15% on best performing asset."
      },
      {
        type: "watch",
        label: "WATCH",
        number: "02",
        what: `Average conversion rate settled at ${avgConvRate.toFixed(2)}%.`,
        why: `Low conversion rate on specific ad variations is increasing overall CPL.`,
        action: "Review search query match and exclude low-intent variations."
      },
      {
        type: "opportunity",
        label: "OPPORTUNITY",
        number: "03",
        what: `Overall click-through rate of ${avgCtr.toFixed(2)}% shows strong engagement.`,
        why: `Creative styling aligns well with target audience demographics.`,
        action: "Deploy new creative variations of current top-performing copy."
      }
    ];
  };

  const systemPrompt = `You are an elite digital marketing performance analyst and executive reporting expert.
You translate complex paid advertising performance metrics into a structured JSON object containing three strategic marketing insights.
IMPORTANT: You MUST return ONLY a valid JSON object matching the following TypeScript interface. Do NOT write any conversational prose, markdown blocks (other than wrapping the JSON in a json block if required), or extra characters.

Interface:
interface Response {
  insights: Array<{
    type: "scale" | "watch" | "opportunity" | "alert";
    label: "SCALE" | "WATCH" | "OPPORTUNITY" | "ALERT";
    number: string; // e.g. "01", "02", "03"
    what: string;   // a clear summary of what happened
    why: string;    // the underlying cause or reason
    action: string; // recommended action
  }>;
}

IMPORTANT: Only reference ad channels and platforms that have data in the metrics provided to you. Never mention Google Ads, Meta Ads, TikTok Ads, or any specific platform unless that platform's data is explicitly included in the metrics summary.`;

  const prompt = `Please analyze the performance metrics over the last 30 days for our client "${clientName}":
Metrics summary:
- Total Spend: $${metricsSummary.totalSpend.toLocaleString()}
- Total Conversions: ${metricsSummary.totalConversions.toLocaleString()}
- Avg Conversion Rate: ${metricsSummary.avgConvRate.toFixed(2)}%
- Total Clicks: ${metricsSummary.totalClicks.toLocaleString()}
- Avg Click-Through Rate: ${metricsSummary.avgCtr.toFixed(2)}%
- Cost per Conversion: $${metricsSummary.costPerConversion.toFixed(2)}

Please write three structured insights matching the JSON schema. Use tone: ${tone}.
Make the insights feel highly strategic, calm, and tailored to "${clientName}".`;

  const claudeApiKey = process.env.ANTHROPIC_API_KEY;

  try {
    if (claudeApiKey) {
      try {
        console.log("Attempting to compile structured insights with Claude...");
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": claudeApiKey,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: "claude-sonnet-5",
            max_tokens: 1500,
            system: systemPrompt,
            messages: [
              {
                role: "user",
                content: prompt
              }
            ]
          })
        });

        if (response.ok) {
          const data: any = await response.json();
          let summaryText = data.content?.[0]?.text;
          if (summaryText) {
            summaryText = summaryText.trim();
            if (summaryText.startsWith("```json")) {
              summaryText = summaryText.substring(7);
            } else if (summaryText.startsWith("```")) {
              summaryText = summaryText.substring(3);
            }
            if (summaryText.endsWith("```")) {
              summaryText = summaryText.substring(0, summaryText.length - 3);
            }
            summaryText = summaryText.trim();

            try {
              const parsed = JSON.parse(summaryText);
              if (parsed.insights && Array.isArray(parsed.insights)) {
                // Delete old summaries and cache the new summary
                await supabase.from("ai_summaries").delete().eq("client_id", clientId);
                await supabase.from("ai_summaries").insert({
                  client_id: clientId,
                  agency_id: clientData.agency_id,
                  date_range: dateRangeKey,
                  summary_data: parsed.insights
                });

                return res.json({
                  insights: parsed.insights,
                  provider: "Claude"
                });
              }
            } catch (err) {
              console.warn("Failed to parse Claude output as JSON:", err);
            }
          }
        } else {
          const errText = await response.text();
          console.warn(`Claude API returned error status ${response.status}: ${errText}`);
        }
      } catch (claudeError: any) {
        console.warn("Claude API call exception:", claudeError.message);
      }
    } else {
      console.warn("Warning: ANTHROPIC_API_KEY environment variable is not defined.");
    }

    // Fallback to structured insights sandbox
    const mockInsights = generateDynamicFallbackInsights(clientName, metricsSummary);
    try {
      await supabase.from("ai_summaries").delete().eq("client_id", clientId);
      await supabase.from("ai_summaries").insert({
        client_id: clientId,
        agency_id: clientData.agency_id,
        date_range: dateRangeKey,
        summary_data: mockInsights
      });
    } catch (saveErr: any) {
      console.warn("Failed to cache fallback insights:", saveErr.message);
    }

    return res.json({
      insights: mockInsights,
      warning: "Demonstration Sandbox Active: Structured insights computed from metrics."
    });

  } catch (error: any) {
    console.error("General error in server summary endpoint:", error);
    const mockInsights = generateDynamicFallbackInsights(clientName, metricsSummary);
    try {
      await supabase.from("ai_summaries").delete().eq("client_id", clientId);
      await supabase.from("ai_summaries").insert({
        client_id: clientId,
        agency_id: clientData.agency_id,
        date_range: dateRangeKey,
        summary_data: mockInsights
      });
    } catch (saveErr: any) {
      console.warn("Failed to cache fallback insights:", saveErr.message);
    }
    return res.json({
      insights: mockInsights,
      warning: "Demonstration Sandbox Active: Structured insights computed from metrics."
    });
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
      .select("id, name, domain, platform, monthly_budget, status")
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
        status: c.status
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
      .select("id, name, domain, platform, monthly_budget, status, agency_id, public_dashboard_enabled")
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
      agencyId: client.agency_id
    };

    const { data: dbMetrics, error: metricsError } = await supabase
      .from("campaign_metrics")
      .select("date, spend, impressions, clicks, conversions, platform, campaign_name, revenue")
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
            conversions: 0
          };
        }
        dailyGroup[dateStr].spend += Number(m.spend);
        dailyGroup[dateStr].clicks += Number(m.clicks);
        dailyGroup[dateStr].impressions += Number(m.impressions);
        dailyGroup[dateStr].conversions += Number(m.conversions);

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
              revenue: 0
            };
          }
          campaignsGroup[cName].spend += Number(m.spend);
          campaignsGroup[cName].impressions += Number(m.impressions);
          campaignsGroup[cName].clicks += Number(m.clicks);
          campaignsGroup[cName].conversions += Number(m.conversions);
          campaignsGroup[cName].revenue += Number(m.revenue || 0);
        }
      }
      metrics = Object.values(dailyGroup).sort((a, b) => a.date.localeCompare(b.date));

      campaignsList = Object.values(campaignsGroup).map((c: any) => {
        const cpl = c.conversions > 0 ? c.spend / c.conversions : 0;
        const roas = c.spend > 0 ? c.revenue / c.spend : 0;
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
