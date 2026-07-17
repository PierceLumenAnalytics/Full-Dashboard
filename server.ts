import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

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

// In-memory data store for server-authoritative state
interface ClientAccount {
  id: string;
  name: string;
  domain: string;
  platform: "Google Ads" | "Meta Ads" | "TikTok Ads" | "All Platforms";
  monthlyBudget: number;
  status: "Active" | "Paused" | "Needs Review";
  createdAt: string;
}

interface PerformanceMetric {
  date: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
}

// In-memory state seed data
let clients: ClientAccount[] = [
  {
    id: "c1",
    name: "Luxe Apparel",
    domain: "luxeapparel.co",
    platform: "All Platforms",
    monthlyBudget: 12500,
    status: "Active",
    createdAt: "2026-01-15T08:00:00Z"
  },
  {
    id: "c2",
    name: "AeroMedia Agency",
    domain: "aeromedia.io",
    platform: "Google Ads",
    monthlyBudget: 8000,
    status: "Active",
    createdAt: "2026-02-10T10:30:00Z"
  },
  {
    id: "c3",
    name: "Apex Fitness",
    domain: "apexfit.com",
    platform: "Meta Ads",
    monthlyBudget: 5500,
    status: "Needs Review",
    createdAt: "2026-03-22T14:15:00Z"
  },
  {
    id: "c4",
    name: "Horizon tech",
    domain: "horizontech.net",
    platform: "All Platforms",
    monthlyBudget: 22000,
    status: "Active",
    createdAt: "2026-04-05T09:00:00Z"
  }
];

// Audit logging system for key actions (Least Privilege + Secure Audit Logging)
interface AuditLog {
  id: string;
  timestamp: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "REFRESH";
  entity: string;
  details: string;
  user: string;
}

let auditLogs: AuditLog[] = [
  {
    id: "log-1",
    timestamp: "2026-07-16T10:00:00Z",
    action: "CREATE",
    entity: "Client",
    details: "Connected new account Luxe Apparel",
    user: "pierce@lumenanalytics.co"
  },
  {
    id: "log-2",
    timestamp: "2026-07-16T12:30:00Z",
    action: "UPDATE",
    entity: "Client",
    details: "Updated budget for Apex Fitness to $5,500",
    user: "pierce@lumenanalytics.co"
  }
];

// Generative historical metric generator for dashboard charts
const generateMockMetrics = (clientId: string): PerformanceMetric[] => {
  const data: PerformanceMetric[] = [];
  const baseBudget = clients.find(c => c.id === clientId)?.monthlyBudget || 10000;
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
app.get("/api/clients", (req, res) => {
  res.json(clients);
});

// API: Create a client
app.post("/api/clients", (req, res) => {
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

  const newClient: ClientAccount = {
    id: `c_${Math.random().toString(36).substr(2, 9)}`,
    name: name.trim(),
    domain: domain.trim().toLowerCase(),
    platform: platform as any,
    monthlyBudget,
    status: "Active",
    createdAt: new Date().toISOString()
  };

  clients.push(newClient);

  // Add audit log entry
  const logEntry: AuditLog = {
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: "CREATE",
    entity: "Client",
    details: `Connected new account ${newClient.name} with budget $${newClient.monthlyBudget.toLocaleString()}`,
    user: "pierce@lumenanalytics.co"
  };
  auditLogs.unshift(logEntry);

  res.status(201).json(newClient);
});

// API: Update a client budget or details
app.put("/api/clients/:id", (req, res) => {
  const { id } = req.params;
  const { name, domain, platform, monthlyBudget, status } = req.body;
  
  const clientIndex = clients.findIndex(c => c.id === id);
  if (clientIndex === -1) {
    return res.status(404).json({ error: "Client account not found." });
  }

  const currentClient = clients[clientIndex];

  // Simple safe assignments
  if (name && typeof name === "string") currentClient.name = name.trim();
  if (domain && typeof domain === "string" && domain.includes(".")) currentClient.domain = domain.trim().toLowerCase();
  if (platform && ["Google Ads", "Meta Ads", "TikTok Ads", "All Platforms"].includes(platform)) currentClient.platform = platform as any;
  if (monthlyBudget !== undefined && typeof monthlyBudget === "number" && monthlyBudget > 0) currentClient.monthlyBudget = monthlyBudget;
  if (status && ["Active", "Paused", "Needs Review"].includes(status)) currentClient.status = status as any;

  // Add audit log entry
  const logEntry: AuditLog = {
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: "UPDATE",
    entity: "Client",
    details: `Updated account ${currentClient.name}: budget $${currentClient.monthlyBudget.toLocaleString()}, status ${currentClient.status}`,
    user: "pierce@lumenanalytics.co"
  };
  auditLogs.unshift(logEntry);

  res.json(currentClient);
});

// API: Delete a client
app.delete("/api/clients/:id", (req, res) => {
  const { id } = req.params;
  const clientIndex = clients.findIndex(c => c.id === id);
  
  if (clientIndex === -1) {
    return res.status(404).json({ error: "Client account not found." });
  }

  const deletedClient = clients[clientIndex];
  clients.splice(clientIndex, 1);

  // Add audit log entry
  const logEntry: AuditLog = {
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: "DELETE",
    entity: "Client",
    details: `Disconnected account ${deletedClient.name}`,
    user: "pierce@lumenanalytics.co"
  };
  auditLogs.unshift(logEntry);

  res.json({ success: true, deletedId: id });
});

// API: Get analytics data for a specific client
app.get("/api/analytics/:clientId", (req, res) => {
  const { clientId } = req.params;
  const client = clients.find(c => c.id === clientId);
  if (!client) {
    return res.status(404).json({ error: "Client account not found" });
  }
  
  const metrics = generateMockMetrics(clientId);
  res.json({
    client,
    metrics
  });
});

// API: List audit logs
app.get("/api/logs", (req, res) => {
  res.json(auditLogs);
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
