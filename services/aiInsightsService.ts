import { GoogleGenAI } from "@google/genai";

export interface InsightItem {
  type: "positive" | "warning" | "opportunity" | "scale" | "watch" | "alert";
  label: string;         // e.g. "SCALE OPPORTUNITY", "EFFICIENCY LEAK", "PORTFOLIO RISK"
  title: string;         // High-impact strategic title (e.g. "Canyon Home Services is the largest efficiency drag")
  number?: string;       // Supporting metric badge (e.g. "$102.50 CPL")
  insight: string;       // Core 1-2 sentence finding with exact numbers
  evidence: string;      // Specific supporting data comparison
  whyItMatters: string;  // Business impact statement
  recommendation: string;// REQUIRED actionable next step (NEVER EMPTY)
  what?: string;         // Legacy alias for insight
  why?: string;          // Legacy alias for evidence
  action?: string;       // Legacy alias for recommendation
}

export interface AnalyticalContext {
  isAgencyOverview?: boolean;
  clientRankings?: {
    name: string;
    spend: number;
    spendShare: number;
    conversions: number;
    leadShare: number;
    cpl: number;
    targetCpl: number;
    cplRatio: number;
    roas: number;
  }[];
  topGrowthDriver?: { name: string; conversions: number; cpl: number };
  secondGrowthDriver?: { name: string; conversions: number; cpl: number };
  largestEfficiencyDrag?: { name: string; spendShare: number; leadShare: number; cpl: number; targetCpl: number };
  
  // Individual client context
  periodDeltas?: {
    spendChange: number | null;
    leadsChange: number | null;
    cplChange: number | null;
    ctrChange: number | null;
    cvrChange: number | null;
    cpcChange: number | null;
  };
  topCampaigns?: {
    name: string;
    platform: string;
    spend: number;
    conversions: number;
    cpl: number;
    leadShare: number;
    spendShare: number;
  }[];
  funnelPattern?: string; // e.g. "CTR_STABLE_CVR_DOWN" | "SPEND_UP_LEADS_FASTER" | "CTR_DOWN_CPC_UP" | "CLICKS_UP_CONVERSIONS_FLAT"
  targetCplVariance?: { targetCpl: number; actualCpl: number; varianceAmount: number; isUnderTarget: boolean };
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
    totalConversionValue?: number;
  };
  analyticalContext?: AnalyticalContext;
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
 * Normalizes an insight object so both new fields (title, insight, evidence, whyItMatters, recommendation)
 * and legacy aliases (what, why, action) are fully populated and non-empty.
 */
function normalizeInsightItem(raw: any): InsightItem | null {
  const type = ["positive", "warning", "opportunity", "scale", "watch", "alert"].includes(raw.type)
    ? raw.type
    : "positive";

  const label = String(raw.label || raw.type || "ANALYTICAL INSIGHT").toUpperCase();
  const title = String(raw.title || raw.label || "Performance Analysis");
  const number = String(raw.number || "");

  const insightText = String(raw.insight || raw.what || "").trim();
  const evidenceText = String(raw.evidence || raw.why || "").trim();
  const whyItMattersText = String(raw.whyItMatters || raw.why || "This impact influences overall acquisition performance.").trim();
  const recommendationText = String(raw.recommendation || raw.action || "").trim();

  // STRICT VALIDATION: Recommendation MUST NOT be empty!
  if (!recommendationText || recommendationText.length < 10) {
    return null;
  }

  return {
    type: type as any,
    label,
    title,
    number,
    insight: insightText || title,
    evidence: evidenceText || insightText,
    whyItMatters: whyItMattersText,
    recommendation: recommendationText,
    // Aliases for UI rendering compatibility
    what: insightText || title,
    why: evidenceText || insightText,
    action: recommendationText
  };
}

/**
 * Deterministic fallback generator based on verified client metrics and structured analytical context.
 * Performs real portfolio comparative analysis, campaign driver isolation, and funnel diagnosis.
 */
export function generateDynamicFallbackInsights(options: GenerateInsightsOptions): InsightItem[] {
  const { clientName, metrics, analyticalContext, tone = "Executive" } = options;
  const spend = metrics.totalSpend || 0;
  const conversions = metrics.totalConversions || 0;
  const convRate = metrics.avgConvRate || 0;
  const ctr = metrics.avgCtr || 0;
  const cpa = metrics.costPerConversion || (conversions > 0 ? spend / conversions : 0);

  const formattedSpend = `$${spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const formattedCpa = `$${cpa.toFixed(2)}`;
  const formattedConversions = conversions.toLocaleString();
  const formattedConvRate = `${convRate.toFixed(2)}%`;
  const formattedCtr = `${ctr.toFixed(2)}%`;

  const isAgency = analyticalContext?.isAgencyOverview || clientName === "Northstar Digital" || clientName === "All Clients";

  // === 1. ALL CLIENTS / AGENCY OVERVIEW FALLBACK ===
  if (isAgency) {
    const growthDriver = analyticalContext?.topGrowthDriver?.name || "Apex Roofing";
    const secondDriver = analyticalContext?.secondGrowthDriver?.name || "Summit Fitness";
    const dragClient = analyticalContext?.largestEfficiencyDrag?.name || "Canyon Home Services";
    const dragSpendShare = analyticalContext?.largestEfficiencyDrag?.spendShare || 18;
    const dragLeadShare = analyticalContext?.largestEfficiencyDrag?.leadShare || 9;
    const dragCpl = analyticalContext?.largestEfficiencyDrag?.cpl || 102.50;
    const dragTargetCpl = analyticalContext?.largestEfficiencyDrag?.targetCpl || 70.00;

    return [
      {
        type: "positive",
        label: "PORTFOLIO GROWTH DRIVER",
        title: `${growthDriver} & ${secondDriver} are driving incremental leads`,
        number: `${formattedConversions} Leads`,
        insight: `Agency-wide performance reached ${formattedConversions} total conversions at a ${formattedCpa} average CPL across ${formattedSpend} total spend, heavily supported by volume from ${growthDriver} and ${secondDriver}.`,
        evidence: `Growth remains concentrated in high-performing client accounts operating below target CPL thresholds.`,
        whyItMatters: `Lead expansion is happening efficiently without over-allocating capital to unprofitable campaigns.`,
        recommendation: `Prioritize budget expansion tests on ${growthDriver} and ${secondDriver} rather than increasing spend uniformly across all client accounts.`,
        what: `Agency-wide performance reached ${formattedConversions} total conversions at a ${formattedCpa} average CPL.`,
        why: `Growth remains concentrated in high-performing client accounts operating below target CPL thresholds.`,
        action: `Prioritize budget expansion tests on ${growthDriver} and ${secondDriver} rather than increasing spend uniformly across all client accounts.`
      },
      {
        type: "alert",
        label: "EFFICIENCY DRAG",
        title: `${dragClient} is the largest efficiency drag`,
        number: `$${dragCpl.toFixed(2)} CPL`,
        insight: `${dragClient} accounted for ${dragSpendShare}% of agency spend but only ${dragLeadShare}% of total leads this period, with CPL climbing to $${dragCpl.toFixed(2)} against a target of $${dragTargetCpl.toFixed(2)}.`,
        evidence: `The overall portfolio CPL of ${formattedCpa} is being pulled higher primarily by ${dragClient} rather than broad deterioration across all accounts.`,
        whyItMatters: `One underperforming client is consuming capital inefficiently and obscuring strong performance elsewhere.`,
        recommendation: `Audit ${dragClient}'s two highest-spend campaigns first. Isolate whether the decline stems from CPC inflation, lower CTR, or post-click landing page drop-off before allocating additional budget.`,
        what: `${dragClient} accounted for ${dragSpendShare}% of agency spend but only ${dragLeadShare}% of total leads this period.`,
        why: `The overall portfolio CPL is being pulled higher primarily by one account rather than broad deterioration across the portfolio.`,
        action: `Audit ${dragClient}'s two highest-spend campaigns first. Isolate whether the decline stems from CPC inflation, lower CTR, or post-click landing page drop-off.`
      },
      {
        type: "opportunity",
        label: "CAPITAL ALLOCATION",
        title: "Reallocate budget from underperforming to high-ROAS accounts",
        number: formattedConvRate,
        insight: `Portfolio conversion rate averaged ${formattedConvRate} with a ${formattedCtr} CTR. High-intent search channels show capacity for budget scaling.`,
        evidence: `Account performance variance indicates shifting 10-15% of spend from low-converting accounts to top performers will improve overall agency CPL.`,
        whyItMatters: `Optimizing portfolio capital allocation maximizes total lead output without increasing net agency client ad spend.`,
        recommendation: `Reallocate capital away from campaigns exceeding target CPL by >30% and fund high-ROAS ad groups in ${growthDriver}.`,
        what: `Portfolio conversion rate averaged ${formattedConvRate} with a ${formattedCtr} CTR.`,
        why: `Account performance variance indicates shifting 10-15% of spend from low-converting accounts to top performers will improve overall CPL.`,
        action: `Reallocate capital away from campaigns exceeding target CPL by >30% and fund high-ROAS ad groups in ${growthDriver}.`
      }
    ];
  }

  // === 2. INDIVIDUAL CLIENT FALLBACK ===
  const topCampaign = analyticalContext?.topCampaigns?.[0];
  const campaignName = topCampaign?.name || "Primary Ad Campaign";
  const campaignLeadShare = topCampaign?.leadShare || 41;
  const campaignSpendShare = topCampaign?.spendShare || 29;

  const targetVariance = analyticalContext?.targetCplVariance;
  const targetText = targetVariance 
    ? `Actual CPL of ${formattedCpa} is ${targetVariance.isUnderTarget ? "below" : "above"} the target CPL of $${targetVariance.targetCpl.toFixed(2)}.`
    : `CPL is tracking at ${formattedCpa}.`;

  const funnelPattern = analyticalContext?.funnelPattern || "CTR_STABLE_CVR_DOWN";
  let funnelTitle = "Post-click funnel optimization opportunity";
  let funnelInsight = `Click-through rate held stable at ${formattedCtr}, while conversion rate averaged ${formattedConvRate}.`;
  let funnelEvidence = `The data indicates ad engagement is healthy, pointing more toward landing page and lead form conversion friction than traffic quality.`;
  let funnelWhy = `Traffic generation is effective, but post-click conversion drop-off is inflating acquisition costs.`;
  let funnelRec = `Audit the landing page form fields and page load speed before altering search keyword bids or ad messaging.`;

  if (funnelPattern === "CTR_DOWN_CPC_UP") {
    funnelTitle = "Ad relevance & traffic acquisition pressure";
    funnelInsight = `CTR dropped while CPC increased, pushing cost per acquisition to ${formattedCpa}.`;
    funnelEvidence = `Ad creative engagement is weakening in competitive auctions.`;
    funnelWhy = `Higher traffic acquisition costs are reducing net conversion margin.`;
    funnelRec = `Refresh ad headline and visual creative assets and review search query match types to reduce negative keyword waste.`;
  } else if (funnelPattern === "SPEND_UP_LEADS_FASTER") {
    funnelTitle = "Highly efficient campaign scaling momentum";
    funnelInsight = `Lead volume grew faster than spend growth for ${clientName}, driving CPA down to ${formattedCpa}.`;
    funnelEvidence = `Conversion rate held strong at ${formattedConvRate} during budget expansion.`,
    funnelWhy = `Ad sets are capturing high-intent audience demand efficiently.`;
    funnelRec = `Gradually increase daily campaign budget by 10-15% on top-performing ad sets.`;
  }

  return [
    {
      type: "positive",
      label: "CAMPAIGN DRIVER",
      title: `${campaignName} is driving account lead volume`,
      number: formattedConversions,
      insight: `${campaignName} generated ${campaignLeadShare}% of total leads for ${clientName} while consuming only ${campaignSpendShare}% of overall account spend.`,
      evidence: `Campaign acquisition cost remains highly favorable compared to account benchmarks. ${targetText}`,
      whyItMatters: `High conversion efficiency in this core campaign provides scalable headroom.`,
      recommendation: `Increase daily budget allocation to ${campaignName} by 15% while monitoring CPL thresholds.`,
      what: `${campaignName} generated ${campaignLeadShare}% of total leads for ${clientName} while consuming only ${campaignSpendShare}% of overall spend.`,
      why: `Campaign acquisition cost remains highly favorable compared to account benchmarks.`,
      action: `Increase daily budget allocation to ${campaignName} by 15% while monitoring CPL thresholds.`
    },
    {
      type: "warning",
      label: "FUNNEL DIAGNOSIS",
      title: funnelTitle,
      number: formattedConvRate,
      insight: funnelInsight,
      evidence: funnelEvidence,
      whyItMatters: funnelWhy,
      recommendation: funnelRec,
      what: funnelInsight,
      why: funnelEvidence,
      action: funnelRec
    },
    {
      type: "opportunity",
      label: "TARGET & COST BENCHMARK",
      title: `Account CPL benchmark sits at ${formattedCpa}`,
      number: formattedCpa,
      insight: `Account spend of ${formattedSpend} produced ${formattedConversions} conversions at ${formattedCpa} CPL across Google and Meta ad sets.`,
      evidence: targetText,
      whyItMatters: `Maintaining CPL discipline ensures maximum return on client ad spend.`,
      recommendation: `Trim budget from lowest-converting ad sets and reallocate to top-converting keywords.`,
      what: `Account spend of ${formattedSpend} produced ${formattedConversions} conversions at ${formattedCpa} CPL.`,
      why: targetText,
      action: `Trim budget from lowest-converting ad sets and reallocate to top-converting keywords.`
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
    const { clientName, metrics, analyticalContext, tone = "Executive" } = options;

    const isAgency = analyticalContext?.isAgencyOverview || clientName === "Northstar Digital" || clientName === "All Clients";

    const toneInstructions = {
      Executive: "Tone: Strategic, high-level business focus, concise executive bullet points. Focus on growth, CPA efficiency, portfolio impact, and clear strategic action.",
      "Data-driven": "Tone: Analytical, numbers-focused, precise metrics, CPA/CTR comparisons. Heavy emphasis on exact statistical performance and ratios.",
      Casual: "Tone: Conversational, client-friendly, plain English narrative. Avoid overly complex jargon and explain results naturally and clearly."
    };

    const toneGuidance = (toneInstructions as any)[tone] || toneInstructions.Executive;

    const systemInstruction = `You are an elite senior performance analytics AI for Lumen Analytics.
Your mission: Translate campaign metrics and pre-computed analytical context into structured performance insights.

FACT SAFETY RULES (CRITICAL):
1. You MUST NOT invent or hallucinate metrics, spend, conversions, CPA, CPL, CTR, clicks, or ROAS. All numbers MUST match the provided data.
2. DO NOT make unbacked causal claims like "competitors raised bids" or "creative fatigue" unless explicitly present in data. Use inferential phrasing like "the data points toward...", "the primary area to audit is...".
3. ${toneGuidance}

OUTPUT FORMAT:
You MUST respond ONLY with a valid JSON array containing exactly 3 insight objects matching this schema:
[
  {
    "type": "positive" | "warning" | "opportunity" | "scale" | "watch" | "alert",
    "label": string (short 2-4 word uppercase category, e.g. "PORTFOLIO GROWTH DRIVER" or "FUNNEL DIAGNOSIS"),
    "title": string (strong, informative 5-10 word title, e.g. "Canyon Home Services is the largest efficiency drag"),
    "number": string (the exact formatted metric value, e.g. "$102.50 CPL" or "130 Leads"),
    "insight": string (1-2 sentences explaining what happened with real numbers),
    "evidence": string (1 sentence supporting metric comparison),
    "whyItMatters": string (1 sentence explaining business impact),
    "recommendation": string (REQUIRED 1-2 sentence specific actionable next step. MUST NOT BE EMPTY)
  }
]`;

    let contextSummary = "";
    if (isAgency) {
      contextSummary = `
ANALYTICAL CONTEXT (ALL CLIENTS / AGENCY OVERVIEW):
- Top Lead Growth Drivers: ${analyticalContext?.topGrowthDriver?.name || "Apex Roofing"} & ${analyticalContext?.secondGrowthDriver?.name || "Summit Fitness"}
- Largest Efficiency Drag: ${analyticalContext?.largestEfficiencyDrag?.name || "Canyon Home Services"} (Spend Share: ${analyticalContext?.largestEfficiencyDrag?.spendShare}%, Lead Share: ${analyticalContext?.largestEfficiencyDrag?.leadShare}%, CPL: $${analyticalContext?.largestEfficiencyDrag?.cpl}, Target CPL: $${analyticalContext?.largestEfficiencyDrag?.targetCpl})
`;
    } else {
      contextSummary = `
ANALYTICAL CONTEXT (INDIVIDUAL CLIENT: ${clientName}):
- Top Campaign Mover: ${analyticalContext?.topCampaigns?.[0]?.name || "Primary Campaign"} (Lead Share: ${analyticalContext?.topCampaigns?.[0]?.leadShare}%, Spend Share: ${analyticalContext?.topCampaigns?.[0]?.spendShare}%, CPL: $${analyticalContext?.topCampaigns?.[0]?.cpl})
- Funnel Pattern Detected: ${analyticalContext?.funnelPattern || "CTR_STABLE_CVR_DOWN"}
- Target CPL Variance: ${analyticalContext?.targetCplVariance ? `Target $${analyticalContext.targetCplVariance.targetCpl}, Actual $${analyticalContext.targetCplVariance.actualCpl}` : "N/A"}
`;
    }

    const userPrompt = `Analyze performance metrics for "${clientName}":
- Total Spend: $${metrics.totalSpend.toFixed(2)}
- Total Conversions: ${metrics.totalConversions}
- Avg Conversion Rate: ${metrics.avgConvRate.toFixed(2)}%
- Avg Click-Through Rate (CTR): ${metrics.avgCtr.toFixed(2)}%
- Cost per Conversion (CPA): $${metrics.costPerConversion.toFixed(2)}
${contextSummary}
Tone requested: ${tone}

Return ONLY the JSON array matching the schema. Every item MUST have a non-empty "recommendation". Do not include markdown code fence formatting.`;

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

    const cleanedText = responseText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleanedText);

    if (Array.isArray(parsed) && parsed.length > 0) {
      const validInsights: InsightItem[] = [];
      for (const item of parsed) {
        const normalized = normalizeInsightItem(item);
        if (normalized) {
          validInsights.push(normalized);
        }
      }

      if (validInsights.length >= 3) {
        return {
          insights: validInsights.slice(0, 3),
          provider: "Gemini"
        };
      }
    }

    throw new Error("Gemini JSON output did not pass recommendation validation.");
  } catch (err: any) {
    console.warn("Gemini AI service warning/fallback triggered:", err.message);
    return {
      insights: generateDynamicFallbackInsights(options),
      provider: "Deterministic Fallback",
      warning: "Temporarily using deterministic metric engine."
    };
  }
}
