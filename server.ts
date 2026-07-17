import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn("Warning: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY environment variables are not defined.");
}

const supabase = createClient(supabaseUrl || "", supabaseKey || "");

// Initialize Gemini SDK with telemetry header as per the skill
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("Warning: GEMINI_API_KEY environment variable is not defined.");
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

interface PerformanceMetric {
  date: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
}

// Generative historical metric generator for dashboard charts
const generateMockMetrics = (clientId: string, baseBudget: number): PerformanceMetric[] => {
  const data: PerformanceMetric[] = [];
  const dailyBaseSpend = baseBudget / 30;
  
  // Create last 120 days of data to support 7, 30, 90 day ranges
  for (let i = 119; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    
    // Add some realistic volatility and trend
    const dayOfWeek = d.getDay();
    const weekendMultiplier = (dayOfWeek === 0 || dayOfWeek === 6) ? 0.75 : 1.15;
    const volatility = 0.85 + Math.random() * 0.3; // 85% to 115% volatility
    
    const spend = Math.round(dailyBaseSpend * weekendMultiplier * volatility * 100) / 100;
    // Clicks: spend / CPC (avg CPC around $1.50)
    const clicks = Math.round((spend / (1.2 + Math.random() * 0.6)) * 1);
    // Impressions: clicks / CTR (avg CTR around 2.5%)
    const impressions = Math.round(clicks / (0.02 + Math.random() * 0.01));
    // Conversions: clicks * ConvRate (avg Conversion Rate around 3.5%)
    const conversions = Math.round(clicks * (0.025 + Math.random() * 0.02));
    
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
app.get("/api/clients", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) throw error;

    const mapped = (data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      domain: c.domain,
      platform: c.platform,
      monthlyBudget: Number(c.monthly_budget),
      status: c.status,
      createdAt: c.created_at
    }));

    res.json(mapped);
  } catch (err: any) {
    console.error("Error fetching clients:", err.message);
    res.status(500).json({ error: "Failed to fetch clients from database: " + err.message });
  }
});

// API: Create a client
app.post("/api/clients", async (req, res) => {
  const { name, domain, platform, monthlyBudget } = req.body;
  
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

  try {
    const { data: newClientData, error: clientError } = await supabase
      .from("clients")
      .insert({
        id,
        name: name.trim(),
        domain: domain.trim().toLowerCase(),
        platform,
        monthly_budget: monthlyBudget,
        status: "Active",
        created_at: createdAt
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
        user: "pierce@lumenanalytics.co"
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
      createdAt: newClientData.created_at
    };

    res.status(201).json(mappedClient);
  } catch (err: any) {
    console.error("Error creating client:", err.message);
    res.status(500).json({ error: "Failed to create client in database: " + err.message });
  }
});

// API: Update a client budget or details
app.put("/api/clients/:id", async (req, res) => {
  const { id } = req.params;
  const { name, domain, platform, monthlyBudget, status } = req.body;
  
  try {
    // 1. Fetch current client first
    const { data: currentClient, error: fetchError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !currentClient) {
      return res.status(404).json({ error: "Client account not found." });
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
        user: "pierce@lumenanalytics.co"
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
      createdAt: updatedClientData.created_at
    };

    res.json(mappedClient);
  } catch (err: any) {
    console.error("Error updating client:", err.message);
    res.status(500).json({ error: "Failed to update client in database: " + err.message });
  }
});

// API: Delete a client
app.delete("/api/clients/:id", async (req, res) => {
  const { id } = req.params;
  
  try {
    // 1. Fetch current client first to log its name
    const { data: currentClient, error: fetchError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !currentClient) {
      return res.status(404).json({ error: "Client account not found." });
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
        user: "pierce@lumenanalytics.co"
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
app.get("/api/analytics/:clientId", async (req, res) => {
  const { clientId } = req.params;

  try {
    const { data: client, error } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .single();

    if (error || !client) {
      return res.status(404).json({ error: "Client account not found" });
    }

    const mappedClient = {
      id: client.id,
      name: client.name,
      domain: client.domain,
      platform: client.platform,
      monthlyBudget: Number(client.monthly_budget),
      status: client.status,
      createdAt: client.created_at
    };

    const metrics = generateMockMetrics(clientId, mappedClient.monthlyBudget);
    res.json({
      client: mappedClient,
      metrics
    });
  } catch (err: any) {
    console.error("Error fetching analytics:", err.message);
    res.status(500).json({ error: "Failed to fetch analytics from database: " + err.message });
  }
});

// API: List audit logs
app.get("/api/logs", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .order("timestamp", { ascending: false });

    if (error) throw error;

    const mapped = (data || []).map((l: any) => ({
      id: l.id,
      timestamp: l.timestamp,
      action: l.action,
      entity: l.entity,
      details: l.details,
      user: l.user
    }));

    res.json(mapped);
  } catch (err: any) {
    console.error("Error fetching audit logs:", err.message);
    res.status(500).json({ error: "Failed to fetch audit logs from database: " + err.message });
  }
});


// API: Generate AI summary report using Claude or Gemini API (secured on server)
app.post("/api/gemini/summary", async (req, res) => {
  const { clientId, clientName, metricsSummary } = req.body;
  
  if (!clientId || !clientName || !metricsSummary) {
    return res.status(400).json({ error: "clientId, clientName, and metricsSummary are required." });
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

  const claudeApiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;

  try {
    // 1. Try Claude first if key is present
    if (claudeApiKey) {
      try {
        console.log("Attempting to compile summary with Claude...");
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": claudeApiKey,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: "claude-3-5-sonnet-20241022",
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
    }

    // 2. Try Gemini as second option
    const ai = getGeminiClient();
    if (ai) {
      try {
        console.log("Attempting to compile summary with Gemini...");
        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            systemInstruction,
            temperature: 0.7,
          },
        });

        if (response.text) {
          return res.json({
            summary: response.text,
            provider: "Gemini"
          });
        }
      } catch (geminiError: any) {
        console.warn("Gemini API call failed:", geminiError.message);
      }
    }

    // 3. Fallback to high-fidelity dynamic sandbox summary
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

start();
