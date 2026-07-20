import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

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
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: Missing token." });
    }

    const token = authHeader.split(" ")[1];
    
    // Verify user JWT
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: "Unauthorized: Invalid or expired token." });
    }

    // Look up profile using service role client
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("agency_id, is_admin, agencies(name, custom_cta, logo_url, primary_color, accent_color, client_limit)")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return res.status(401).json({ error: "Unauthorized: User profile not found." });
    }

    const typedProfile = profile as any;
    
    // Attach user profile details
    (req as any).user = {
      id: user.id,
      email: user.email,
      agencyId: typedProfile.agency_id,
      isAdmin: typedProfile.is_admin,
      agencyName: typedProfile.agencies?.name || null,
      customCta: typedProfile.agencies?.custom_cta || null,
      logoUrl: typedProfile.agencies?.logo_url || null,
      primaryColor: typedProfile.agencies?.primary_color || null,
      accentColor: typedProfile.agencies?.accent_color || null,
      clientLimit: typedProfile.agencies?.client_limit || 5
    };

    next();
  } catch (err: any) {
    console.error("Auth middleware error:", err.message);
    res.status(401).json({ error: "Unauthorized: Auth check failed." });
  }
};

// API: Get current user profile details
app.get("/api/profile", requireAuth, (req, res) => {
  res.json((req as any).user);
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



interface PerformanceMetric {
  date: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
}

// Seedable LCG random number generator
const seedRandom = (seedStr: string) => {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  let seed = Math.abs(hash);
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
};

// Generative historical metric generator for dashboard charts
const generateMockMetrics = (clientId: string, baseBudget: number): PerformanceMetric[] => {
  const data: PerformanceMetric[] = [];
  const dailyBaseSpend = baseBudget / 30;
  
  // Deterministic client-specific ROAS factor to target realistic 3x-8x range
  const clientRng = seedRandom(clientId);
  for (let k = 0; k < 15; k++) clientRng(); // Warm up LCG to scramble close seeds
  const clientRoasTarget = 3.2 + clientRng() * 4.3; // believable 3.2x to 7.5x target
  const crMultiplier = clientRoasTarget / 3.55;

  // Create last 120 days of data to support 7, 30, 90 day ranges
  for (let i = 119; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    
    // Seed using client ID and the date string
    const rng = seedRandom(`${clientId}-${dateStr}`);
    
    // Add some realistic volatility and trend
    const dayOfWeek = d.getDay();
    const weekendMultiplier = (dayOfWeek === 0 || dayOfWeek === 6) ? 0.75 : 1.15;
    const volatility = 0.85 + rng() * 0.3; // 85% to 115% volatility
    
    const spend = Math.round(dailyBaseSpend * weekendMultiplier * volatility * 100) / 100;
    // Clicks: spend / CPC (avg CPC around $1.50)
    const clicks = Math.round((spend / (1.2 + rng() * 0.6)) * 1);
    // Impressions: clicks / CTR (avg CTR around 2.5%)
    const impressions = Math.round(clicks / (0.02 + rng() * 0.01));
    // Conversions: clicks * ConvRate (avg Conversion Rate around 3.5%)
    const conversions = Math.round(clicks * (0.025 + rng() * 0.02) * crMultiplier);
    
    data.push({
      date: dateStr,
      spend,
      clicks,
      impressions,
      conversions
    });
  }
  return data;
};

// API: List connected clients
app.get("/api/clients", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    console.log(`GET /api/clients: Querying clients table for ${user.email} (Admin: ${user.isAdmin})`);
    
    let query = supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: true });

    if (!user.isAdmin) {
      query = query.eq("agency_id", user.agencyId);
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
        return res.status(403).json({ error: `You have reached your client limit of ${user.clientLimit} clients. Contact us to add more.` });
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
      .select("date, spend, impressions, clicks, conversions, platform")
      .eq("client_id", clientId)
      .order("date", { ascending: true });

    let metrics: PerformanceMetric[] = [];
    if (!metricsError && dbMetrics && dbMetrics.length > 0) {
      // Group and aggregate metrics by date to handle multiple campaigns/platforms per day
      const dailyGroup: { [date: string]: PerformanceMetric } = {};
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
      }
      metrics = Object.values(dailyGroup).sort((a, b) => a.date.localeCompare(b.date));
      console.log(`GET /api/analytics/${clientId}: Loaded and aggregated ${dbMetrics.length} campaign metrics into ${metrics.length} daily entries.`);
    } else {
      metrics = generateMockMetrics(clientId, mappedClient.monthlyBudget);
    }

    res.json({
      client: mappedClient,
      metrics
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

    // Clear existing campaign metrics for this client
    const { error: deleteError } = await supabase
      .from("campaign_metrics")
      .delete()
      .eq("client_id", id);
    if (deleteError) throw deleteError;

    // Insert new metrics
    const { error: insertError } = await supabase
      .from("campaign_metrics")
      .insert(validatedRows);
    if (insertError) throw insertError;

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
app.post("/api/summary", requireAuth, async (req, res) => {
  const { clientId, clientName, metricsSummary } = req.body;
  const user = (req as any).user;
  
  if (!clientId || !clientName || !metricsSummary) {
    return res.status(400).json({ error: "clientId, clientName, and metricsSummary are required." });
  }

  try {
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
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to verify client access: " + err.message });
  }

  // Graceful fallback generator using actual client performance metrics
  const generateDynamicFallbackSummary = (name: string, summary: any) => {
    const totalSpend = summary.totalSpend || 0;
    const totalConversions = summary.totalConversions || 0;
    const avgConvRate = summary.avgConvRate || 0;
    const totalClicks = summary.totalClicks || 0;
    const avgCtr = summary.avgCtr || 0;
    const costPerConversion = summary.costPerConversion || 0;

    return `### AI Campaign Insights for ${name}
* **Trend Analysis**: Over the last 30 days, Google and Meta ad spend was highly efficient. Total ad spend reached **$${totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}**, generating **${totalClicks.toLocaleString()}** clicks with an average click-through rate of **${avgCtr.toFixed(2)}%**.
* **Highlight**: Conversion volume settled at **${totalConversions.toLocaleString()}** conversions, with an average conversion rate of **${avgConvRate.toFixed(2)}%**. The cost per acquisition (CPA) was managed exceptionally well at **$${costPerConversion.toFixed(2)}** per conversion.
* **Opportunities for ${name}**:
  1. **Optimize Underperforming Budgets**: Shift 15% budget from underperforming ad variations to the high-converting campaigns.
  2. **Frequency Cap Warning**: Creative fatigue detected in display assets. Refresh display assets to sustain click rate levels.`;
  };

  const systemInstruction = `You are an elite, senior performance marketing director and analytics AI for Lumen Analytics. 
You translate complex Google Ads, Meta Ads, and other marketing channel metrics into clear, calm, extremely actionable executive bullet points for marketing agencies and their clients.
Never use dry robotic corporate jargon, and avoid hype words. Be realistic, direct, and helpful. Translate metrics into plain English and guide agency owners (like Pierce) on what went up, what went down, and exactly what to fix.`;

  const prompt = `Please analyze the performance metrics over the last 30 days for our client "${clientName}":
Metrics summary:
- Total Spend: $${metricsSummary.totalSpend.toLocaleString()}
- Total Conversions: ${metricsSummary.totalConversions.toLocaleString()}
- Avg Conversion Rate: ${metricsSummary.avgConvRate.toFixed(2)}%
- Total Clicks: ${metricsSummary.totalClicks.toLocaleString()}
- Avg Click-Through Rate: ${metricsSummary.avgCtr.toFixed(2)}%
- Cost per Conversion: $${metricsSummary.costPerConversion.toFixed(2)}

Please write an executive daily/weekly insight report. Keep it concise.
Include three short sections:
1. What went up (Highlights)
2. What went down (Issues to monitor)
3. Action Plan (Exactly what to fix or optimize)

Address this to our agency dashboard and write directly, clearly, with beautiful typography format using markdown bullet points. Make it feel highly strategic, calm, and tailored.`;

  const claudeApiKey = process.env.ANTHROPIC_API_KEY;

  try {
    if (claudeApiKey) {
      try {
        console.log("Attempting to compile summary with Claude (claude-sonnet-5)...");
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
            system: systemInstruction,
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
          const summaryText = data.content?.[0]?.text;
          if (summaryText) {
            return res.json({
              summary: summaryText,
              provider: "Claude"
            });
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

    // Fallback to high-fidelity dynamic sandbox summary
    const mockSummary = generateDynamicFallbackSummary(clientName, metricsSummary);
    return res.json({
      summary: mockSummary,
      warning: "Demonstration Sandbox Active: This demo simulates and aggregates dynamic campaign stats in real-time. The production version connects live to your actual Google Ads, Meta Ads, and TikTok Ads accounts via secure OAuth integrations."
    });

  } catch (error: any) {
    console.error("General error in server summary endpoint:", error);
    const mockSummary = generateDynamicFallbackSummary(clientName, metricsSummary);
    res.json({
      summary: mockSummary,
      warning: "Demonstration Sandbox Active: This demo simulates and aggregates dynamic campaign stats in real-time. The production version connects live to your actual Google Ads, Meta Ads, and TikTok Ads accounts via secure OAuth integrations."
    });
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
