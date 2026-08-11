import React, { useState, useEffect } from "react";
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  Users, 
  Target, 
  Calendar, 
  FileText, 
  Sparkles, 
  ShieldCheck, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  Layers,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { isValidHex, getContrastColor, darkenColor } from "../utils/themeHelpers";
import { getPresetRange, DateRange, formatDisplayDate } from "../utils/dateHelpers";

interface ClientPortalProps {
  token: string;
}

export default function ClientPortal({ token }: ClientPortalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Scoped Data States
  const [agency, setAgency] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [aiSummary, setAiSummary] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);

  // Navigation & Date Range
  const [activeTab, setActiveTab] = useState<"overview" | "performance" | "reports">("overview");
  const [dateRange, setDateRange] = useState<DateRange>({
    preset: "30days",
    ...getPresetRange("30days")
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 1. Initial Validation & Metadata Lookup
  useEffect(() => {
    const validateToken = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/portal/validate/${encodeURIComponent(token)}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Invalid or expired client portal link.");
        }
        const data = await res.json();
        setAgency(data.agency);
        setClient(data.client);

        // Apply Agency Dynamic Branding Colors
        if (data.agency) {
          const primaryColor = data.agency.primaryColor && isValidHex(data.agency.primaryColor) ? data.agency.primaryColor : "#D6B77A";
          const hoverColor = darkenColor(primaryColor, 0.1);
          const contrastColor = getContrastColor(primaryColor);

          document.documentElement.style.setProperty("--agency-primary", primaryColor);
          document.documentElement.style.setProperty("--agency-primary-hover", hoverColor);
          document.documentElement.style.setProperty("--agency-primary-muted", `${primaryColor}1f`);
          document.documentElement.style.setProperty("--agency-primary-border", `${primaryColor}47`);
          document.documentElement.style.setProperty("--agency-primary-contrast", contrastColor);
        }
      } catch (err: any) {
        setError(err.message || "Failed to authenticate portal token.");
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      validateToken();
    }
  }, [token]);

  // 2. Fetch Scoped Analytics & Summary when valid
  const fetchPortalData = async () => {
    if (!token) return;
    setIsRefreshing(true);
    try {
      const headers = { "X-Portal-Token": token };

      // Fetch Scoped Analytics
      const analyticsRes = await fetch(
        `/api/portal/analytics?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`, 
        { headers }
      );
      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json();
        setMetrics(analyticsData.metrics || []);
        setCampaigns(analyticsData.campaigns || []);
      }

      // Fetch Scoped AI Summary
      const summaryRes = await fetch(`/api/portal/summary`, { headers });
      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        setAiSummary(summaryData.insights || null);
      }

      // Fetch Scoped Deliveries/Reports
      const reportsRes = await fetch(`/api/portal/reports`, { headers });
      if (reportsRes.ok) {
        const reportsData = await reportsRes.json();
        setReports(reportsData || []);
      }
    } catch (err) {
      console.error("Error loading portal data:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (client && agency) {
      fetchPortalData();
    }
  }, [client, agency, dateRange]);

  // Calculated Aggregations
  const totalSpend = metrics.reduce((acc, m) => acc + Number(m.spend || 0), 0);
  const totalConversions = metrics.reduce((acc, m) => acc + Number(m.conversions || 0), 0);
  const totalClicks = metrics.reduce((acc, m) => acc + Number(m.clicks || 0), 0);
  const totalImpressions = metrics.reduce((acc, m) => acc + Number(m.impressions || 0), 0);
  const totalValue = metrics.reduce((acc, m) => acc + Number(m.conversionValue || 0), 0);

  const cpl = totalConversions > 0 ? totalSpend / totalConversions : 0;
  const roas = totalSpend > 0 ? totalValue / totalSpend : 0;
  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

  if (loading) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-300 font-sans">
        <RefreshCw className="w-8 h-8 animate-spin text-amber-500 mb-4" />
        <p className="text-sm font-medium">Loading Secure Client Portal...</p>
      </div>
    );
  }

  if (error || !agency || !client) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200 p-4 text-center">
        <div className="w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-4">
          <AlertCircle className="w-7 h-7" />
        </div>
        <h1 className="text-xl font-bold mb-2">Access Restricted</h1>
        <p className="text-sm text-slate-400 max-w-md mb-6">
          {error || "This interactive client portal link is invalid, disabled, or has expired."}
        </p>
        <div className="text-xs text-slate-500 border-t border-slate-800 pt-4">
          Please contact <strong>{agency?.name || "your agency manager"}</strong> to request a new active reporting link.
        </div>
      </div>
    );
  }

  const primaryColor = agency.primaryColor && isValidHex(agency.primaryColor) ? agency.primaryColor : "#D6B77A";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-12">
      
      {/* BRANDED PORTAL HEADER */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            
            {/* Agency Branding + Client Info */}
            <div className="flex items-center gap-4">
              {agency.logoUrl ? (
                <img 
                  src={agency.logoUrl} 
                  alt={agency.name} 
                  className="h-10 max-w-[180px] object-contain rounded"
                />
              ) : (
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm shadow-md"
                  style={{ backgroundColor: `${primaryColor}20`, color: primaryColor, border: `1px solid ${primaryColor}40` }}
                >
                  {agency.name.substring(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wider font-mono font-semibold" style={{ color: primaryColor }}>
                    {agency.name}
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1 font-medium">
                    <ShieldCheck className="w-3 h-3" /> Secure Client Portal
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-0.5">
                  {client.name}
                </h1>
              </div>
            </div>

            {/* Date Range Controls & Freshness */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800/50 border border-slate-700/50 px-3 py-1.5 rounded-lg">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Updated: Today</span>
              </div>

              {/* Range Selector */}
              <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-1">
                {(["7days", "30days", "90days", "thisMonth"] as const).map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setDateRange({ preset, ...getPresetRange(preset) })}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                      dateRange.preset === preset 
                        ? "bg-slate-800 text-white shadow-sm" 
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {preset === "thisMonth" ? "Month" : preset.replace("days", "D")}
                  </button>
                ))}
              </div>

              <button
                onClick={fetchPortalData}
                disabled={isRefreshing}
                className="p-2 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors"
                title="Refresh Metrics"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
              </button>
            </div>

          </div>

          {/* PORTAL TABS */}
          <div className="flex items-center gap-6 mt-6 border-t border-slate-800/60 pt-3">
            <button
              onClick={() => setActiveTab("overview")}
              className={`flex items-center gap-2 pb-2 text-sm font-semibold border-b-2 transition-all ${
                activeTab === "overview"
                  ? "border-amber-500 text-white"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
              style={{ borderColor: activeTab === "overview" ? primaryColor : "transparent" }}
            >
              <BarChart3 className="w-4 h-4" /> Overview
            </button>
            <button
              onClick={() => setActiveTab("performance")}
              className={`flex items-center gap-2 pb-2 text-sm font-semibold border-b-2 transition-all ${
                activeTab === "performance"
                  ? "border-amber-500 text-white"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
              style={{ borderColor: activeTab === "performance" ? primaryColor : "transparent" }}
            >
              <TrendingUp className="w-4 h-4" /> Performance & Campaigns
            </button>
            <button
              onClick={() => setActiveTab("reports")}
              className={`flex items-center gap-2 pb-2 text-sm font-semibold border-b-2 transition-all ${
                activeTab === "reports"
                  ? "border-amber-500 text-white"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
              style={{ borderColor: activeTab === "reports" ? primaryColor : "transparent" }}
            >
              <FileText className="w-4 h-4" /> Published Reports ({reports.length})
            </button>
          </div>
        </div>
      </header>

      {/* PORTAL CONTENT */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">

        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <div className="space-y-8">
            
            {/* KPI CARDS GRID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Ad Spend */}
              <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-5 relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs uppercase tracking-wider font-mono font-medium">Ad Spend</span>
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400" style={{ color: primaryColor }}>
                    <DollarSign className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-bold font-mono text-white">
                  ${totalSpend.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                  <span>Period:</span>
                  <span className="text-slate-400 font-medium">{formatDisplayDate(dateRange.startDate)} – {formatDisplayDate(dateRange.endDate)}</span>
                </div>
              </div>

              {/* Leads / Conversions */}
              <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-5 relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs uppercase tracking-wider font-mono font-medium">Leads Generated</span>
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <Users className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-white">
                  {totalConversions.toLocaleString()}
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  Total trackable conversions across active channels
                </div>
              </div>

              {/* CPL */}
              <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-5 relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs uppercase tracking-wider font-mono font-medium">Cost Per Lead (CPL)</span>
                  <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                    <Target className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-bold font-mono text-white">
                  ${cpl.toFixed(2)}
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  Target CPL: <span className="text-slate-300 font-mono">${client.targetCpl ? client.targetCpl.toFixed(2) : "N/A"}</span>
                </div>
              </div>

              {/* ROAS */}
              <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-5 relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs uppercase tracking-wider font-mono font-medium">Return on Ad Spend</span>
                  <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-white">
                  {roas > 0 ? `${roas.toFixed(2)}x` : "N/A"}
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  Revenue generated vs ad expenditure
                </div>
              </div>

            </div>

            {/* AI PERFORMANCE SUMMARY SECTION */}
            {aiSummary && (
              <div 
                className="bg-slate-900/90 border rounded-xl p-6 sm:p-8 relative overflow-hidden shadow-lg"
                style={{ borderColor: `${primaryColor}33`, borderLeftWidth: "4px", borderLeftColor: primaryColor }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-5 h-5" style={{ color: primaryColor }} />
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider" style={{ color: primaryColor }}>
                    AI Strategic Executive Summary
                  </h3>
                </div>

                <p className="text-base sm:text-lg text-slate-200 leading-relaxed font-medium mb-6">
                  {aiSummary.executiveSummary || (typeof aiSummary === "string" ? aiSummary : "Performance summary available.")}
                </p>

                {typeof aiSummary === "object" && aiSummary.whatImproved && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-800/80 pt-5 text-sm">
                    <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800/50">
                      <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5 mb-1">
                        <CheckCircle2 className="w-4 h-4" /> What Improved
                      </span>
                      <p className="text-slate-300 text-xs leading-normal">{aiSummary.whatImproved}</p>
                    </div>

                    <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800/50">
                      <span className="text-xs font-semibold text-amber-400 flex items-center gap-1.5 mb-1">
                        <AlertCircle className="w-4 h-4" /> Key Observation
                      </span>
                      <p className="text-slate-300 text-xs leading-normal">{aiSummary.campaignObservations || aiSummary.whatDeclined}</p>
                    </div>

                    {aiSummary.recommendedNextStep && (
                      <div className="md:col-span-2 bg-slate-950/70 p-4 rounded-lg border border-amber-500/20">
                        <span className="text-xs font-semibold flex items-center gap-1.5 mb-1" style={{ color: primaryColor }}>
                          💡 Strategic Recommendation
                        </span>
                        <p className="text-slate-200 text-xs leading-normal">{aiSummary.recommendedNextStep}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* CAMPAIGNS BREAKDOWN */}
            <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-white">Campaign Performance</h2>
                  <p className="text-xs text-slate-400">Scoped view of top lead generating ad campaigns</p>
                </div>
                <span className="text-xs text-slate-400 font-mono bg-slate-800 px-2.5 py-1 rounded-md">
                  {campaigns.length} Campaigns
                </span>
              </div>

              {campaigns.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">
                  No active campaign metrics recorded for this period.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-300 border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-xs font-mono uppercase text-slate-400">
                        <th className="py-3 px-4">Campaign Name</th>
                        <th className="py-3 px-4">Platform</th>
                        <th className="py-3 px-4 text-right">Spend</th>
                        <th className="py-3 px-4 text-right">Leads</th>
                        <th className="py-3 px-4 text-right">CPL</th>
                        <th className="py-3 px-4 text-right">ROAS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {campaigns.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3.5 px-4 font-semibold text-white max-w-[220px] truncate">
                            {c.name}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                              {c.platform || "Ad Network"}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-slate-200">
                            ${Number(c.spend || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </td>
                          <td className="py-3.5 px-4 text-right font-bold text-white">
                            {Number(c.conversions || 0).toLocaleString()}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-slate-300">
                            ${Number(c.cpl || 0).toFixed(2)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-slate-300">
                            {Number(c.roas || 0) > 0 ? `${Number(c.roas).toFixed(2)}x` : "N/A"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}

        {/* PERFORMANCE TAB */}
        {activeTab === "performance" && (
          <div className="space-y-6">
            <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-6">
              <h2 className="text-lg font-bold text-white mb-1">Account & Channel Breakdown</h2>
              <p className="text-xs text-slate-400 mb-6">Detailed performance distribution across networks</p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-950 p-5 rounded-lg border border-slate-800">
                  <span className="text-xs text-slate-400 font-mono uppercase">Primary Platform</span>
                  <div className="text-xl font-bold text-white mt-1">{client.platform || "Omnichannel"}</div>
                </div>
                <div className="bg-slate-950 p-5 rounded-lg border border-slate-800">
                  <span className="text-xs text-slate-400 font-mono uppercase">Monthly Budget</span>
                  <div className="text-xl font-bold font-mono text-white mt-1">
                    ${Number(client.monthlyBudget || 0).toLocaleString()}
                  </div>
                </div>
                <div className="bg-slate-950 p-5 rounded-lg border border-slate-800">
                  <span className="text-xs text-slate-400 font-mono uppercase">Target Cost Per Lead</span>
                  <div className="text-xl font-bold font-mono text-white mt-1">
                    ${client.targetCpl ? client.targetCpl.toFixed(2) : "Not Set"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* REPORTS TAB */}
        {activeTab === "reports" && (
          <div className="space-y-6">
            <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-6">
              <h2 className="text-lg font-bold text-white mb-1">Published Client Reports</h2>
              <p className="text-xs text-slate-400 mb-6">Weekly & monthly performance reports delivered by {agency.name}</p>

              {reports.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">
                  No published reports available for download yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {reports.map((r) => (
                    <div key={r.id} className="py-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400" style={{ color: primaryColor }}>
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-white">
                            Performance Report ({r.reportPeriodStart || r.report_period_start} – {r.reportPeriodEnd || r.report_period_end})
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            Published {new Date(r.sentAt || r.sent_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                          </div>
                        </div>
                      </div>

                      <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full font-medium">
                        Sent & Active
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      {/* FOOTER */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-16 text-center text-xs text-slate-600 border-t border-slate-900 pt-6">
        <p>Prepared by <strong className="text-slate-400">{agency.name}</strong></p>
        <p className="mt-1 text-[11px] text-slate-600">Powered by Lumen Analytics • White-Label Performance Reporting</p>
      </footer>

    </div>
  );
}
