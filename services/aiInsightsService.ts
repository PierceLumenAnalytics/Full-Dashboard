import { GoogleGenAI } from "@google/genai";

export interface InsightItem {
  type: "positive" | "warning" | "opportunity";
  label: string;
  number: string;
  what: string;
  why: string;
  recommendation: string;
}

export interface GenerateInsightsOptions {
  clientName: string;
  metrics: {
    totalSpend: number;
    totalConversions: number;
    avgConvRate: number;
    avgCtr: number;
    costPerConversion: number;
    totalClicks?: number;
    totalImpressions?: number;
  };
  campaigns?: any[];
  comparison?: any;
  tone?: "Executive" | "Data-driven" | "Casual" | string;
}

export interface GenerateInsightsResult {
  insights: InsightItem[];
  provider: "Gemini" | "Deterministic Fallback";
  warning?: string;
}

/**
 * Deterministic fallback generator based on verified client metrics.
 * Ensures 100% production resilience without external API dependencies.
 */
export function generateDynamicFallbackInsights(options: GenerateInsightsOptions): InsightItem[] {
  const { clientName, metrics, tone = "Executive" } = options;
  const spend = metrics.totalSpend || 0;
  const conversions = metrics.totalConversions || 0;
  const convRate = metrics.avgConvRate || 0;
  const ctr = metrics.avgCtr || 0;
  const cpa = metrics.costPerConversion || (conversions > 0 ? spend / conversions : 0);

  const formattedSpend = `$${spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formattedCpa = `$${cpa.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formattedConversions = conversions.toLocaleString();
  const formattedConvRate = `${convRate.toFixed(2)}%`;
  const formattedCtr = `${ctr.toFixed(2)}%`;

  const toneKey = (tone || "Executive").toLowerCase();

  if (toneKey.includes("casual")) {
    return [
      {
        type: "positive",
        label: "Great Results",
        number: formattedConversions,
        what: `Awesome news for ${clientName}! Campaigns brought in ${formattedConversions} conversions overall.`,
        why: `Ad spend stayed steady at ${formattedSpend}, yielding a solid $${cpa.toFixed(2)} cost per conversion.`,
        recommendation: "Keep pushing top-performing ad assets and scale the budget gradually."
      },
      {
        type: "opportunity",
        label: "Engagement Check",
        number: formattedCtr,
        what: `Click-through rate is sitting right at ${formattedCtr}.`,
        why: "Ad copy is resonating well with target local audiences across Google and Meta.",
        recommendation: "Test a couple fresh headline variations next week to keep momentum going."
      },
      {
        type: "warning",
        label: "Cost Watch",
        number: formattedCpa,
        what: `Average cost per conversion currently stands at ${formattedCpa}.`,
        why: "Competitive bidding in prime time slots pushed acquisition costs slightly higher.",
        recommendation: "Reallocate 10-15% of budget from low-converting keywords to top performers."
      }
    ];
  }

  if (toneKey.includes("data") || toneKey.includes("analytical")) {
    return [
      {
        type: "positive",
        label: "Acquisition Efficiency",
        number: formattedCpa,
        what: `Recorded CPA of ${formattedCpa} across ${formattedConversions} total conversions for ${clientName}.`,
        why: `Total campaign expenditure reached ${formattedSpend} with an average conversion rate of ${formattedConvRate}.`,
        recommendation: "Maintain current bid caps on high-converting keyword clusters."
      },
      {
        type: "positive",
        label: "CTR & Traffic Quality",
        number: formattedCtr,
        what: `Overall click-through rate measured at ${formattedCtr}.`,
        why: "High ad relevance scores across active search and social campaign groups.",
        recommendation: "Expand exact-match keyword coverage to capture high-intent traffic."
      },
      {
        type: "opportunity",
        label: "Conversion Optimization",
        number: formattedConvRate,
        what: `Conversion rate benchmark established at ${formattedConvRate}.`,
        why: "Landing page conversion funnel showing stable conversion performance.",
        recommendation: "Implement landing page A/B tests to push conversion rate toward upper target bounds."
      }
    ];
  }

  // Default: Executive Tone
  return [
    {
      type: "positive",
      label: "Campaign Scalability",
      number: formattedConversions,
      what: `Paid acquisition campaigns for ${clientName} generated ${formattedConversions} total leads/conversions.`,
      why: `Capital deployment of ${formattedSpend} maintained an effective CPA of ${formattedCpa}.`,
      recommendation: "Scale ad set budgets by 15% on high-performing conversion funnels."
    },
    {
      type: "opportunity",
      label: "Funnel Efficiency",
      number: formattedConvRate,
      what: `Conversion rate averaged ${formattedConvRate} with a ${formattedCtr} CTR.`,
      why: "Targeting parameters and brand messaging remain strongly aligned with ideal buyer profiles.",
      recommendation: "Optimize ad scheduling to concentrate spend during peak conversion hours."
    },
    {
      type: "warning",
      label: "Cost Efficiency",
      number: formattedCpa,
      what: `Cost per acquisition benchmark sits at ${formattedCpa}.`,
      why: "Increased auction competition required moderate bid adjustments.",
      recommendation: "Trim spend on underperforming placement networks to preserve profit margin."
    }
  ];
}

/**
 * Main AI insights generator powered by Google Gen AI SDK (@google/genai).
 * Uses process.env.GEMINI_API_KEY with model gemini-2.5-flash.
 */
export async function generateInsights(options: GenerateInsightsOptions): Promise<GenerateInsightsResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.log("GEMINI_API_KEY not configured. Using verified deterministic metric fallback.");
    return {
      insights: generateDynamicFallbackInsights(options),
      provider: "Deterministic Fallback"
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const { clientName, metrics, tone = "Executive" } = options;

    const toneInstructions = {
      Executive: "Tone: Strategic, high-level business focus, concise executive bullet points. Focus on growth, CPA efficiency, and strategic action.",
      "Data-driven": "Tone: Analytical, numbers-focused, precise metrics, CPA/CTR comparisons. Heavy emphasis on exact statistical performance.",
      Casual: "Tone: Conversational, client-friendly, plain English narrative. Avoid overly complex jargon and explain results naturally."
    };

    const toneGuidance = (toneInstructions as any)[tone] || toneInstructions.Executive;

    const systemInstruction = `You are an elite senior performance analytics AI for Lumen Analytics.
Your mission: Translate campaign performance metrics into structured performance insights.

FACT SAFETY RULES (CRITICAL):
1. You MUST NOT invent or hallucinate metrics, spend, conversions, CPA, CPL, CTR, clicks, or ROAS.
2. All numbers in your output MUST match the provided verified data points.
3. ${toneGuidance}

OUTPUT FORMAT:
You MUST respond ONLY with a valid JSON array containing exactly 3 insight objects matching this schema:
[
  {
    "type": "positive" | "warning" | "opportunity",
    "label": string (short 2-4 word title),
    "number": string (the exact formatted metric value, e.g. "$65.38" or "130"),
    "what": string (1 sentence explaining what happened),
    "why": string (1 sentence explaining the driver/cause using the real metrics),
    "recommendation": string (1 clear strategic action)
  }
]`;

    const userPrompt = `Analyze performance metrics for client "${clientName}":
- Total Spend: $${metrics.totalSpend.toFixed(2)}
- Total Conversions: ${metrics.totalConversions}
- Avg Conversion Rate: ${metrics.avgConvRate.toFixed(2)}%
- Avg Click-Through Rate (CTR): ${metrics.avgCtr.toFixed(2)}%
- Cost per Conversion (CPA): $${metrics.costPerConversion.toFixed(2)}

Tone requested: ${tone}

Return ONLY the JSON array. Do not include markdown code fence formatting or surrounding conversational text.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction,
        temperature: 0.4,
        responseMimeType: "application/json"
      }
    });

    const responseText = response.text ? response.text.trim() : "";
    if (!responseText) {
      throw new Error("Gemini returned an empty response.");
    }

    // Clean markdown code blocks if present
    const cleanedText = responseText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleanedText);

    if (Array.isArray(parsed) && parsed.length > 0) {
      const validInsights: InsightItem[] = parsed.map((item: any) => ({
        type: ["positive", "warning", "opportunity"].includes(item.type) ? item.type : "positive",
        label: String(item.label || "Insight"),
        number: String(item.number || ""),
        what: String(item.what || ""),
        why: String(item.why || ""),
        recommendation: String(item.recommendation || "")
      }));

      return {
        insights: validInsights,
        provider: "Gemini"
      };
    } else {
      throw new Error("Gemini JSON output did not contain a valid insight array.");
    }
  } catch (err: any) {
    console.warn("Gemini AI service warning/fallback triggered:", err.message);
    return {
      insights: generateDynamicFallbackInsights(options),
      provider: "Deterministic Fallback",
      warning: "Temporarily using deterministic metric engine."
    };
  }
}
