import React, { useState, useEffect } from "react";
import { 
  FileText, 
  Play, 
  Eye, 
  Send, 
  Sparkles, 
  X, 
  ChevronDown, 
  Check, 
  Loader2,
  Copy,
  Slack
} from "lucide-react";
import { ClientAccount, PerformanceMetric } from "../types";
import { DateRange } from "../utils/dateHelpers";
import { authFetch } from "../lib/supabaseClient";

interface ReportsPageProps {
  clients: ClientAccount[];
  dateRange: DateRange;
  addToast: (title: string, description?: string, type?: "success" | "error" | "warning" | "info") => void;
}

interface ClientReport {
  id: string;
  clientId: string;
  clientName: string;
  clientDomain: string;
  period: string;
  status: "Delivered" | "Draft" | "Scheduled";
  schedule: string;
  lastSent: string;
  generatedInsights: any[] | null;
}

export default function ReportsPage({ clients, dateRange, addToast }: ReportsPageProps) {
  const [reports, setReports] = useState<ClientReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<ClientReport | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTone, setSelectedTone] = useState<"Executive" | "Data-driven" | "Casual">("Executive");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<any[] | null>(null);

  useEffect(() => {
    if (clients && clients.length > 0) {
      const seeded = clients.map((c, idx) => ({
        id: `report-${c.id}`,
        clientId: c.id,
        clientName: c.name,
        clientDomain: c.domain,
        period: "Last 30 Days",
        status: (idx % 3 === 0 ? "Delivered" : idx % 3 === 1 ? "Scheduled" : "Draft") as any,
        schedule: idx % 3 === 1 ? "Weekly on Mon" : idx % 3 === 0 ? "Monthly (1st)" : "On-Demand",
        lastSent: idx % 3 === 0 ? "2026-08-01" : "Never",
        generatedInsights: null
      }));
      setReports(seeded);
    }
  }, [clients]);

  const handleGenerateReport = (report: ClientReport) => {
    setSelectedReport(report);
    setGeneratedResult(report.generatedInsights);
    setSelectedTone("Executive");
    setIsModalOpen(true);
  };

  const executeGeneration = async () => {
    if (!selectedReport) return;
    setIsGenerating(true);
    
    try {
      // 1. Fetch metrics for client
      const analyticsRes = await authFetch(`/api/analytics/${selectedReport.clientId}`);
      if (!analyticsRes.ok) throw new Error("Failed to get latest client metrics.");
      const analyticsData = await analyticsRes.json();
      let metrics: PerformanceMetric[] = analyticsData.metrics || [];

      // Filter by dynamic date range
      metrics = metrics.filter(
        (m) => m.date >= dateRange.startDate && m.date <= dateRange.endDate
      );

      if (metrics.length === 0) {
        throw new Error("No campaign metrics found for this selected date range.");
      }

      // Compile aggregates
      const totalSpend = metrics.reduce((acc, m) => acc + m.spend, 0);
      const totalConversions = metrics.reduce((acc, m) => acc + m.conversions, 0);
      const totalClicks = metrics.reduce((acc, m) => acc + m.clicks, 0);
      const totalImpressions = metrics.reduce((acc, m) => acc + m.impressions, 0);
      
      const metricsSummary = {
        totalSpend,
        totalConversions,
        totalClicks,
        avgConvRate: (totalConversions / totalClicks) * 100 || 0,
        avgCtr: (totalClicks / totalImpressions) * 100 || 0,
        costPerConversion: totalSpend / totalConversions || 0
      };

      // 2. Call summary endpoint with selected tone
      const response = await authFetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedReport.clientId,
          clientName: selectedReport.clientName,
          metricsSummary,
          tone: selectedTone
        })
      });

      if (!response.ok) {
        throw new Error("Failed to compile AI insights.");
      }

      const data = await response.json();
      if (data.insights && Array.isArray(data.insights)) {
        setGeneratedResult(data.insights);
        // Save to local report state
        setReports(prev => prev.map(r => r.id === selectedReport.id ? { ...r, generatedInsights: data.insights } : r));
        addToast("Insights Generated", `AI Report for ${selectedReport.clientName} is ready in ${selectedTone} tone.`, "success");
      } else {
        throw new Error("AI returned unstructured content.");
      }
    } catch (err: any) {
      console.error(err);
      addToast("Report Generation Failed", err.message || "Failed to query Claude.", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const serializeToText = (insightsList: any[] | null) => {
    if (!insightsList) return "";
    return insightsList.map(ins => {
      return `${ins.number} — ${ins.label}\nWhat: ${ins.what}\nWhy: ${ins.why}\nRecommendation: ${ins.action}\n`;
    }).join("\n");
  };

  const handleCopyToClipboard = (format: "text" | "slack") => {
    const text = serializeToText(generatedResult);
    if (!text) return;

    if (format === "slack") {
      const slackText = `*LUMEN INSIGHTS REPORT* :sparkles:\n\n` + generatedResult?.map(ins => {
        return `*${ins.number} — ${ins.label}*\n• *What:* ${ins.what}\n• *Why:* ${ins.why}\n• *Recommendation:* ${ins.action}\n`;
      }).join("\n");
      navigator.clipboard.writeText(slackText);
      addToast("Slack Block Copied", "Copy block generated with bold Slack markdown formatting.", "success");
    } else {
      navigator.clipboard.writeText(text);
      addToast("Report Copied", "Text serialized and copied to clipboard successfully.", "success");
    }
  };

  const handleSendEmail = (report: ClientReport) => {
    const insightsList = report.generatedInsights || generatedResult;
    const text = serializeToText(insightsList);
    if (!text) {
      addToast("Generate Report First", "You must click Generate to build the AI content before sending.", "warning");
      return;
    }

    const emailSubject = `Paid Ads Performance Report — ${report.clientName}`;
    const emailBody = `Hi team,\n\nHere are the latest ad account insights computed by Lumen AI:\n\n${text}\nBest regards,\nPierce`;
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    window.open(gmailUrl, "_blank");
    
    // Update status to Delivered
    setReports(prev => prev.map(r => r.id === report.id ? { ...r, status: "Delivered", lastSent: new Date().toISOString().split("T")[0] } : r));
    addToast("Gmail Compose Opened", "Gmail window pre-filled with serialized AI report metrics.", "success");
  };

  const scheduledCount = reports.filter(r => r.status === "Scheduled").length;

  return (
    <div className="space-y-6 font-sans text-left">
      
      {/* Premium Header Workload Card */}
      <div className="p-6 rounded-lg bg-gradient-to-r from-[#101010] to-[#151515] border border-white/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <span className="text-[10px] font-mono tracking-widest text-[#D6B77A] uppercase font-bold">
            Automated Workload
          </span>
          <h2 className="text-xl font-bold text-[#F5F3EE] font-display uppercase tracking-tight">
            Reporting, Without The Reporting.
          </h2>
          <p className="text-xs text-[#8A8680]">
            Generate insight cards, customize response tones, and compose pre-filled drafts for clients instantly.
          </p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="h-10 w-px bg-white/5 hidden sm:block" />
          <div className="text-left sm:text-right">
            <span className="text-lg font-mono font-bold text-[#F5F3EE] block">
              {scheduledCount} Client Reports
            </span>
            <span className="text-[10px] text-[#8A8680] font-mono uppercase tracking-wider block">
              Next delivery: Monday · 8:00 AM
            </span>
          </div>
        </div>
      </div>

      {/* Reports Table surface */}
      <div className="bg-[#101010] border border-white/5 rounded-lg overflow-hidden">
        <div className="p-5 border-b border-white/5">
          <h3 className="text-sm font-bold text-[#F5F3EE] uppercase tracking-wider font-display">
            Client Reporting Workload
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-[#151515] select-none">
                <th className="py-3.5 px-5 text-[10px] font-mono tracking-wider text-[#8A8680] uppercase">Client</th>
                <th className="py-3.5 px-5 text-[10px] font-mono tracking-wider text-[#8A8680] uppercase">Period</th>
                <th className="py-3.5 px-5 text-[10px] font-mono tracking-wider text-[#8A8680] uppercase">Status</th>
                <th className="py-3.5 px-5 text-[10px] font-mono tracking-wider text-[#8A8680] uppercase">Schedule</th>
                <th className="py-3.5 px-5 text-[10px] font-mono tracking-wider text-[#8A8680] uppercase">Last Sent</th>
                <th className="py-3.5 px-5 text-[10px] font-mono tracking-wider text-[#8A8680] uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {reports.map((report) => (
                <tr key={report.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-3.5 px-5">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-[#F5F3EE]">{report.clientName}</span>
                      <span className="text-[10px] text-[#8A8680] font-mono">{report.clientDomain}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-5 text-xs text-[#F5F3EE] font-mono">{report.period}</td>
                  <td className="py-3.5 px-5">
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase font-mono ${
                      report.status === "Delivered" 
                        ? "bg-[#4ADE80]/5 text-[#4ADE80] border-[#4ADE80]/20"
                        : report.status === "Scheduled"
                        ? "bg-[#D6B77A]/5 text-[#D6B77A] border-[#D6B77A]/20"
                        : "bg-white/5 text-[#8A8680] border-white/5"
                    }`}>
                      {report.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-5 text-xs text-[#8A8680] font-mono">{report.schedule}</td>
                  <td className="py-3.5 px-5 text-xs text-[#8A8680] font-mono">{report.lastSent}</td>
                  <td className="py-3.5 px-5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleGenerateReport(report)}
                        className="p-1.5 bg-[#151515] hover:bg-white/5 border border-white/5 rounded text-[#D6B77A] hover:text-[#bfa063] transition-colors cursor-pointer"
                        title="Generate Report"
                      >
                        <Play className="w-3.5 h-3.5 fill-[#D6B77A] hover:fill-[#bfa063]" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedReport(report);
                          setGeneratedResult(report.generatedInsights);
                          setIsModalOpen(true);
                        }}
                        disabled={!report.generatedInsights}
                        className={`p-1.5 border border-white/5 rounded transition-colors ${
                          report.generatedInsights 
                            ? "bg-[#151515] hover:bg-white/5 text-[#F5F3EE] cursor-pointer" 
                            : "bg-[#101010] text-[#8A8680]/40 cursor-not-allowed"
                        }`}
                        title="Preview generated insights"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleSendEmail(report)}
                        disabled={!report.generatedInsights}
                        className={`p-1.5 border border-white/5 rounded transition-colors ${
                          report.generatedInsights 
                            ? "bg-[#151515] hover:bg-white/5 text-emerald-400 cursor-pointer" 
                            : "bg-[#101010] text-[#8A8680]/40 cursor-not-allowed"
                        }`}
                        title="Pre-fill report email in Gmail"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Styled Modal for Report Generation & Preview */}
      {isModalOpen && selectedReport && (
        <div className="fixed inset-0 bg-[#080808]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#101010] border border-white/5 rounded-lg shadow-2xl flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#D6B77A]" />
                <h3 className="text-sm font-bold text-[#F5F3EE] uppercase tracking-wider font-display">
                  Report Builder — {selectedReport.clientName}
                </h3>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-[#8A8680] hover:text-[#F5F3EE] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              
              {/* Tone Selection row */}
              <div className="flex items-center justify-between gap-4 bg-[#151515] p-3.5 rounded-lg border border-white/5">
                <div className="text-left">
                  <span className="text-[10px] font-mono tracking-widest text-[#8A8680] uppercase block">
                    AI Tone Profile
                  </span>
                  <span className="text-xs text-[#F5F3EE] font-semibold mt-0.5">
                    Adjust response vocabulary and focus area.
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {(["Executive", "Data-driven", "Casual"] as const).map((tone) => (
                    <button
                      key={tone}
                      onClick={() => setSelectedTone(tone)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                        selectedTone === tone
                          ? "bg-[#D6B77A]/10 text-[#D6B77A] border border-[#D6B77A]/30"
                          : "bg-[#101010] text-[#8A8680] hover:bg-[#151515] border border-transparent"
                      }`}
                    >
                      {tone}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate Trigger block */}
              {!generatedResult && !isGenerating && (
                <div className="p-8 text-center border border-dashed border-white/10 rounded-lg space-y-4">
                  <p className="text-xs text-[#8A8680]">
                    AI analysis insights have not been generated for this client report range.
                  </p>
                  <button
                    onClick={executeGeneration}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#D6B77A] hover:bg-[#bfa063] text-[#080808] text-xs font-bold rounded-md transition-colors cursor-pointer"
                  >
                    <Play className="w-3 h-3 fill-[#080808]" />
                    <span>Run AI Analysis</span>
                  </button>
                </div>
              )}

              {/* Generating spinner */}
              {isGenerating && (
                <div className="p-8 text-center flex flex-col items-center justify-center space-y-4 min-h-[150px]">
                  <Loader2 className="w-8 h-8 text-[#D6B77A] animate-spin" />
                  <p className="text-xs text-[#8A8680]">
                    Compiling ad metrics and prompting AI using {selectedTone} tone...
                  </p>
                </div>
              )}

              {/* Results display */}
              {generatedResult && !isGenerating && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono tracking-widest text-[#8A8680] uppercase">
                      Generated Insight Cards
                    </span>
                    <button
                      onClick={executeGeneration}
                      className="text-xs font-bold text-[#D6B77A] hover:underline cursor-pointer flex items-center gap-1"
                    >
                      Regenerate in new tone
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {generatedResult.map((ins, idx) => {
                      const colors = {
                        scale: { border: "border-[#D6B77A]/30", bg: "bg-[#D6B77A]/5", text: "text-[#D6B77A]" },
                        watch: { border: "border-[#FCD34D]/30", bg: "bg-[#FCD34D]/5", text: "text-[#FCD34D]" },
                        opportunity: { border: "border-[#4ADE80]/30", bg: "bg-[#4ADE80]/5", text: "text-[#4ADE80]" },
                        alert: { border: "border-[#F87171]/30", bg: "bg-[#F87171]/5", text: "text-[#F87171]" }
                      }[ins.type as 'scale'|'watch'|'opportunity'|'alert'] || { border: "border-white/5", bg: "bg-[#151515]", text: "text-[#F5F3EE]" };

                      return (
                        <div key={idx} className={`p-4 rounded border ${colors.border} ${colors.bg} flex flex-col justify-between space-y-3`}>
                          <span className={`text-[9px] font-mono tracking-wider font-bold ${colors.text}`}>
                            {ins.number} — {ins.label}
                          </span>
                          <div className="space-y-1">
                            <p className="text-[11px] text-[#F5F3EE] font-semibold leading-relaxed">{ins.what}</p>
                            <p className="text-[10px] text-[#8A8680] leading-relaxed">{ins.why}</p>
                          </div>
                          <div className="pt-2 border-t border-white/5">
                            <p className="text-[10px] text-[#F5F3EE] leading-snug">
                              <span className="font-semibold text-[#D6B77A]">Rec:</span> {ins.action}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/5 bg-[#151515] flex items-center justify-between rounded-b-lg">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-transparent hover:bg-white/5 border border-white/5 rounded text-xs font-semibold text-[#8A8680] hover:text-[#F5F3EE] transition-colors cursor-pointer"
              >
                Close Modal
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleCopyToClipboard("text")}
                  disabled={!generatedResult}
                  className={`px-3 py-2 rounded text-xs font-semibold border flex items-center gap-1 transition-colors ${
                    generatedResult
                      ? "bg-[#101010] hover:bg-[#151515] border-white/5 text-[#F5F3EE] cursor-pointer"
                      : "bg-[#101010] border-transparent text-[#8A8680]/30 cursor-not-allowed"
                  }`}
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Text</span>
                </button>
                <button
                  onClick={() => handleCopyToClipboard("slack")}
                  disabled={!generatedResult}
                  className={`px-3 py-2 rounded text-xs font-semibold border flex items-center gap-1 transition-colors ${
                    generatedResult
                      ? "bg-[#101010] hover:bg-[#151515] border-white/5 text-[#D6B77A] cursor-pointer"
                      : "bg-[#101010] border-transparent text-[#8A8680]/30 cursor-not-allowed"
                  }`}
                >
                  <Slack className="w-3.5 h-3.5" />
                  <span>Copy to Slack</span>
                </button>
                <button
                  onClick={() => handleSendEmail(selectedReport)}
                  disabled={!generatedResult}
                  className={`px-4 py-2 rounded text-xs font-bold flex items-center gap-1 transition-colors ${
                    generatedResult
                      ? "bg-[#D6B77A] hover:bg-[#bfa063] text-[#080808] cursor-pointer"
                      : "bg-[#101010] text-[#8A8680]/30 cursor-not-allowed"
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Compose Email</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
