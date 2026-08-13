import { SupabaseClient } from "@supabase/supabase-js";
import { isValidHex } from "../src/utils/themeHelpers.js";
import { 
  hashPortalToken, 
  encryptPortalToken, 
  decryptPortalToken, 
  generateRawPortalToken 
} from "./portalSecurity.js";

export async function getOrCreatePortalToken(
  clientId: string,
  agencyId: string,
  supabase: SupabaseClient
): Promise<string | null> {
  try {
    const { data: existing } = await supabase
      .from("client_portal_access")
      .select("token_hash, encrypted_token, enabled")
      .eq("client_id", clientId)
      .single();

    if (existing && existing.enabled && existing.encrypted_token) {
      const decrypted = decryptPortalToken(existing.encrypted_token);
      if (decrypted && hashPortalToken(decrypted) === existing.token_hash) {
        return decrypted;
      }
    }
  } catch (err) {
    console.warn("[getOrCreatePortalToken] Could not fetch portal access:", err);
  }

  return null;
}



// Helper: Calculate comparison percent change safely
export function calculateChange(current: number, previous: number): number | null {
  if (previous === null || previous === undefined || previous === 0) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}

// Interface for AI report summary
export interface ClientReportSummary {
  executiveSummary: string;
  whatImproved: string;
  whatDeclined: string;
  campaignObservations: string;
  recommendedNextStep: string;
}

export async function generateReportData(
  clientId: string,
  agencyId: string,
  startDateStr: string,
  endDateStr: string,
  supabase: SupabaseClient,
  baseUrl?: string
): Promise<any> {
  // 1. Fetch Client Details
  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();
  if (clientErr || !client) throw new Error("Client account not found: " + clientErr?.message);

  // Tenant Isolation Security check
  if (client.agency_id !== agencyId) {
    throw new Error("Access Denied: Agency context mismatch.");
  }

  // 2. Fetch Agency Details (Branding)
  const { data: agency, error: agencyErr } = await supabase
    .from("agencies")
    .select("*")
    .eq("id", agencyId)
    .single();
  if (agencyErr || !agency) throw new Error("Agency not found: " + agencyErr?.message);

  // 3. Determine Previous Period Date Range (Shifted back by same duration)
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const durationMs = end.getTime() - start.getTime() + 86400000; // include end day
  const prevStart = new Date(start.getTime() - durationMs);
  const prevEnd = new Date(end.getTime() - durationMs);

  const prevStartDateStr = prevStart.toISOString().split("T")[0];
  const prevEndDateStr = prevEnd.toISOString().split("T")[0];

  // 4. Query Current Period campaign metrics
  const { data: currentMetrics, error: currMetricsErr } = await supabase
    .from("campaign_metrics")
    .select("*")
    .eq("client_id", clientId)
    .gte("date", startDateStr)
    .lte("date", endDateStr);
  if (currMetricsErr) throw currMetricsErr;

  // 5. Query Previous Period campaign metrics
  const { data: previousMetrics, error: prevMetricsErr } = await supabase
    .from("campaign_metrics")
    .select("*")
    .eq("client_id", clientId)
    .gte("date", prevStartDateStr)
    .lte("date", prevEndDateStr);
  if (prevMetricsErr) throw prevMetricsErr;

  // 6. Aggregate Metrics Helper
  const aggregate = (metrics: any[]) => {
    const totalSpend = metrics.reduce((acc, m) => acc + Number(m.spend || 0), 0);
    const totalImpressions = metrics.reduce((acc, m) => acc + Number(m.impressions || 0), 0);
    const totalClicks = metrics.reduce((acc, m) => acc + Number(m.clicks || 0), 0);
    const totalConversions = metrics.reduce((acc, m) => acc + Number(m.conversions || 0), 0);
    const totalConversionValue = metrics.reduce((acc, m) => acc + Number(m.conversion_value || m.revenue || 0), 0);

    return {
      spend: totalSpend,
      impressions: totalImpressions,
      clicks: totalClicks,
      conversions: totalConversions,
      conversionValue: totalConversionValue,
      ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      cr: totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0,
      cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
      cpl: totalConversions > 0 ? totalSpend / totalConversions : 0,
      roas: totalSpend > 0 ? totalConversionValue / totalSpend : 0
    };
  };

  const currentStats = aggregate(currentMetrics || []);
  const previousStats = aggregate(previousMetrics || []);

  // 7. Calculate percentage changes vs previous period
  const comparison = {
    spend: calculateChange(currentStats.spend, previousStats.spend),
    impressions: calculateChange(currentStats.impressions, previousStats.impressions),
    clicks: calculateChange(currentStats.clicks, previousStats.clicks),
    conversions: calculateChange(currentStats.conversions, previousStats.conversions),
    ctr: calculateChange(currentStats.ctr, previousStats.ctr),
    cr: calculateChange(currentStats.cr, previousStats.cr),
    cpc: calculateChange(currentStats.cpc, previousStats.cpc),
    cpl: calculateChange(currentStats.cpl, previousStats.cpl),
    roas: calculateChange(currentStats.roas, previousStats.roas)
  };

  // 8. Platform Channel Breakdown (Current Period)
  const channelGroups: Record<string, any[]> = {};
  (currentMetrics || []).forEach(m => {
    const platformName = m.platform || "Other Channels";
    if (!channelGroups[platformName]) channelGroups[platformName] = [];
    channelGroups[platformName].push(m);
  });

  const channels = Object.keys(channelGroups).map(platform => {
    const channelMetrics = channelGroups[platform];
    const stats = aggregate(channelMetrics);
    return {
      platform,
      spend: stats.spend,
      conversions: stats.conversions,
      cpl: stats.cpl,
      roas: stats.roas
    };
  }).filter(ch => ch.spend > 0 || ch.conversions > 0);

  // 9. Campaign Breakdown (Current Period) - Grouped and sorted by conversions descending
  const campaignGroups: Record<string, any[]> = {};
  (currentMetrics || []).forEach(m => {
    const cName = m.campaign_name || "General Campaign";
    if (!campaignGroups[cName]) campaignGroups[cName] = [];
    campaignGroups[cName].push(m);
  });

  const campaigns = Object.keys(campaignGroups).map(campaign_name => {
    const cMetrics = campaignGroups[campaign_name];
    const stats = aggregate(cMetrics);
    return {
      campaign_name,
      spend: stats.spend,
      conversions: stats.conversions,
      cpl: stats.cpl,
      roas: stats.roas
    };
  }).filter(c => c.spend > 0 || c.conversions > 0)
    .sort((a, b) => b.conversions - a.conversions);

  // 10. AI Summary Generation
  const summary = await generateAiSummary(client.name, currentStats, comparison, campaigns);

  // 11. Custom branding colors
  const primaryColor = agency.primary_color && isValidHex(agency.primary_color) ? agency.primary_color : "#D6B77A";
  const accentColor = agency.accent_color && isValidHex(agency.accent_color) ? agency.accent_color : "#E05C2A";

  const finalBaseUrl = baseUrl || process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000";
  const portalToken = await getOrCreatePortalToken(client.id, agency.id, supabase);
  const portalUrl = portalToken ? `${finalBaseUrl}/portal/${portalToken}` : "";

  return {
    period: {
      startDate: startDateStr,
      endDate: endDateStr,
      prevStartDate: prevStartDateStr,
      prevEndDate: prevEndDateStr
    },
    clientName: client.name,
    agencyName: agency.name,
    logoUrl: agency.logo_url,
    primaryColor,
    accentColor,
    portalUrl,
    metrics: currentStats,
    comparison,
    channels,
    campaigns,
    summary
  };
}

async function generateAiSummary(
  clientName: string,
  metrics: any,
  comparison: any,
  campaigns: any[]
): Promise<ClientReportSummary> {
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (geminiApiKey) {
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });

      const topCampaigns = campaigns.slice(0, 3).map(c => `- ${c.campaign_name}: Spend $${Number(c.spend || 0).toLocaleString()}, Conversions ${Number(c.conversions || 0)}`).join("\n");
      const topCampaignText = topCampaigns ? `Top Active Campaigns:\n${topCampaigns}` : "No specific campaign breakdown available.";

      const systemPrompt = `You are an elite senior performance analytics AI for Lumen Analytics.
Analyze paid advertising performance metrics and generate structured executive report insights.

OUTPUT FORMAT:
Respond ONLY with a valid JSON object matching this exact schema:
{
  "executiveSummary": "brief high level summary under 3 sentences",
  "whatImproved": "what metric or platform improved, referencing actual numbers",
  "whatDeclined": "what metric or campaign declined/needs attention, referencing numbers",
  "campaignObservations": "brief observation on specific campaigns",
  "recommendedNextStep": "one clear strategic recommendation"
}

FACT SAFETY (CRITICAL):
- NEVER fabricate, guess, or hallucinate metrics, platforms, or campaign names.
- All numbers must come from the metrics provided.
- Keep the tone professional, client-friendly, concise, and clear.`;

      const prompt = `Please analyze performance metrics for "${clientName}":
Weekly Metrics:
- Spend: $${metrics.spend.toLocaleString()} (Change: ${comparison.spend !== null ? comparison.spend.toFixed(1) + "%" : "N/A"})
- Conversions: ${metrics.conversions.toLocaleString()} (Change: ${comparison.conversions !== null ? comparison.conversions.toFixed(1) + "%" : "N/A"})
- Cost per Conversion (CPL): $${metrics.cpl.toFixed(2)} (Change: ${comparison.cpl !== null ? comparison.cpl.toFixed(1) + "%" : "N/A"})
- CTR: ${metrics.ctr.toFixed(2)}% (Change: ${comparison.ctr !== null ? comparison.ctr.toFixed(1) + "%" : "N/A"})
- Conversion Value / Revenue: $${metrics.conversionValue.toLocaleString()}
- ROAS: ${metrics.roas.toFixed(2)}x (Change: ${comparison.roas !== null ? comparison.roas.toFixed(1) + "%" : "N/A"})

${topCampaignText}

Please write the JSON response.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.4,
          responseMimeType: "application/json"
        }
      });

      const responseText = response.text ? response.text.trim() : "";
      if (responseText) {
        const cleanedText = responseText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
        const parsed = JSON.parse(cleanedText);
        if (
          parsed.executiveSummary &&
          parsed.whatImproved &&
          parsed.whatDeclined &&
          parsed.campaignObservations &&
          parsed.recommendedNextStep
        ) {
          return parsed;
        }
      }
    } catch (err: any) {
      console.warn("Gemini report summary generation failed/skipped:", err.message);
    }
  }

  // Fallback to deterministic summary
  return generateDeterministicSummary(clientName, metrics, comparison, campaigns);
}

function generateDeterministicSummary(
  clientName: string,
  metrics: any,
  comparison: any,
  campaigns: any[]
): ClientReportSummary {
  const topCampaign = campaigns && campaigns.length > 0 ? campaigns[0] : null;

  const formatChange = (val: number | null, name: string, lowerIsBetter = false) => {
    if (val === null || val === undefined) return "stable";
    const dir = val >= 0 ? "increased" : "decreased";
    const status = lowerIsBetter ? (val >= 0 ? "declined" : "improved") : (val >= 0 ? "improved" : "declined");
    return `${name} ${dir} by ${Math.abs(val).toFixed(1)}% (which is a performance ${status})`;
  };

  const spendChangeStr = comparison.spend !== null 
    ? (comparison.spend >= 0 ? `increased by ${comparison.spend.toFixed(1)}%` : `decreased by ${Math.abs(comparison.spend).toFixed(1)}%`)
    : "remained stable";

  const conversionsChangeStr = comparison.conversions !== null 
    ? (comparison.conversions >= 0 ? `rose by ${comparison.conversions.toFixed(1)}%` : `fell by ${Math.abs(comparison.conversions).toFixed(1)}%`)
    : "remained stable";

  return {
    executiveSummary: `Performance report for ${clientName}. Weekly ad spend was $${metrics.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}, generating ${metrics.conversions.toLocaleString()} leads overall. CTR was efficient at ${metrics.ctr.toFixed(2)}% with conversion rate tracking at ${metrics.cr.toFixed(2)}%.`,
    whatImproved: `Lead volume ${conversionsChangeStr} compared to the previous week. CTR was also optimized at ${metrics.ctr.toFixed(2)}%.`,
    whatDeclined: `Weekly ad spend ${spendChangeStr} during this period, with Cost Per Lead (CPL) averaging $${metrics.cpl.toFixed(2)} (change of ${comparison.cpl !== null ? comparison.cpl.toFixed(1) + "%" : "0%"}).`,
    campaignObservations: topCampaign 
      ? `The campaign "${topCampaign.campaign_name}" was the primary volume driver, generating ${topCampaign.conversions} leads with $${Number(topCampaign.spend).toLocaleString()} spend (CPL: $${Number(topCampaign.cpl).toFixed(2)}).`
      : "Active ad campaigns were monitored for performance consistency across all networks.",
    recommendedNextStep: `Review search query variations and shift ad spend allocation towards the highest converting campaigns to optimize average acquisition costs.`
  };
}
