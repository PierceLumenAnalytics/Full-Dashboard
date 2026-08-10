import React, { useState, useEffect } from "react";
import { authFetch } from "../lib/supabaseClient";
import Markdown from "react-markdown";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { 
  Sparkles, 
  FileText, 
  Copy, 
  RefreshCw, 
  ChevronRight, 
  AlertTriangle,
  Download
} from "lucide-react";
import { ClientAccount, PerformanceMetric } from "../types";
import { DateRange } from "../utils/dateHelpers";

interface AIDailySummaryProps {
  selectedClient: ClientAccount | null;
  dateRange: DateRange;
  addToast: (title: string, description?: string, type?: "success" | "error" | "warning" | "info") => void;
  profile?: any;
}

export default function AIDailySummary({ selectedClient, dateRange, addToast, profile }: AIDailySummaryProps) {
  const [summary, setSummary] = useState<string>("");
  const [insights, setInsights] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const serializeInsightsToText = (insightsList: any[]) => {
    return insightsList.map(ins => {
      return `${ins.number} — ${ins.label}\nWhat: ${ins.what}\nWhy: ${ins.why}\nRecommendation: ${ins.action}\n`;
    }).join("\n");
  };

  const fetchAISummary = async () => {
    if (!selectedClient) return;

    setLoading(true);
    setError(null);

    try {
      // First, fetch some analytics metrics so we can pass current aggregates to Claude AI
      const analyticsRes = await authFetch(`/api/analytics/${selectedClient.id}`);
      if (!analyticsRes.ok) throw new Error("Failed to get latest client metrics.");
      const analyticsData = await analyticsRes.json();
      let metrics: PerformanceMetric[] = analyticsData.metrics || [];

      // Filter by dynamic date range
      metrics = metrics.filter(
        (m) => m.date >= dateRange.startDate && m.date <= dateRange.endDate
      );

      // Handle empty metrics gracefully
      if (metrics.length === 0) {
        setSummary("### No campaign metrics found for this selected date range.\n\nPlease select another date range or verify your connected ad accounts.");
        setInsights(null);
        setLoading(false);
        return;
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

      // Query Claude AI Secure Server-Side Endpoint
      const response = await authFetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClient.id,
          clientName: selectedClient.name,
          metricsSummary
        })
      });

      if (!response.ok) {
        throw new Error("Claude AI failed to compile the performance summary.");
      }

      const data = await response.json();
      if (data.insights && Array.isArray(data.insights)) {
        setInsights(data.insights);
        setSummary(serializeInsightsToText(data.insights));
      } else if (typeof data.summary === "string") {
        setSummary(data.summary);
        setInsights(null);
      } else {
        setSummary(data.summary || "");
        setInsights(null);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate AI executive insights.");
      addToast("AI Summary compilation failed", err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // Auto-generate AI summary on mount/client switch or date range change
  useEffect(() => {
    if (selectedClient) {
      fetchAISummary();
    }
  }, [selectedClient, dateRange]);

  // Using react-markdown for rich, validated formatted summaries

  const handleCopy = () => {
    if (!summary) return;
    navigator.clipboard.writeText(summary);
    addToast(
      "Report Copied", 
      "AI Summary copied to clipboard. Paste in Slack or Email to share with client.", 
      "success"
    );
  };

  const handleExportPDF = async () => {
    if (!summary || !selectedClient) return;

    // Create a temporary container with the styled report for jsPDF
    const element = document.createElement("div");
    element.style.padding = "30px";
    element.style.color = "#0f172a";
    element.style.backgroundColor = "#ffffff";
    element.style.fontFamily = "system-ui, -apple-system, sans-serif";
    element.style.fontSize = "12px";
    element.style.lineHeight = "1.5";
    element.style.width = "650px";

    // Printable Executive Header
    element.innerHTML = `
      <div style="border-bottom: 2px solid ${profile?.primaryColor || '#6d28d9'}; padding-bottom: 16px; margin-bottom: 24px;">
        <div style="font-size: 22px; font-weight: 800; color: #1e1b4b; letter-spacing: -0.5px;">${profile?.agencyName || 'Lumen Analytics'} Summary</div>
        <div style="font-size: 9px; text-transform: uppercase; font-weight: 700; color: ${profile?.primaryColor || '#6d28d9'}; margin-top: 4px; letter-spacing: 1px;">EXECUTIVE PERFORMANCE REPORT</div>
        <div style="margin-top: 12px; font-size: 11px; color: #334155; display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
          <div><strong>Client Name:</strong> ${selectedClient.name} (${selectedClient.domain})</div>
          <div><strong>Date Range:</strong> ${dateRange.startDate} to ${dateRange.endDate}</div>
          <div><strong>Generated On:</strong> ${new Date().toLocaleDateString()}</div>
        </div>
      </div>
      <div id="pdf-markdown-content" style="color: #334155;"></div>
    `;

    const markdownContainer = document.querySelector(".markdown-body");
    const contentElement = element.querySelector("#pdf-markdown-content") as HTMLElement | null;
    if (contentElement) {
      if (markdownContainer) {
        contentElement.innerHTML = markdownContainer.innerHTML;
      } else {
        contentElement.textContent = summary;
      }
    }

    const fileName = `${selectedClient.name.replace(/\s+/g, '_')}_AI_Summary_${dateRange.startDate}_to_${dateRange.endDate}.pdf`;

    let iframe: HTMLIFrameElement | null = null;
    try {
      addToast("Exporting PDF", "Generating your executive performance report PDF...", "info");
      
      // Create a temporary hidden iframe to sandbox the rendering context
      iframe = document.createElement("iframe");
      iframe.style.position = "absolute";
      iframe.style.width = "700px";
      iframe.style.height = "1000px";
      iframe.style.left = "-9999px";
      iframe.style.top = "0";
      iframe.style.border = "none";
      iframe.style.visibility = "hidden";
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) {
        throw new Error("Could not access iframe document context");
      }

      iframeDoc.open();
      iframeDoc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { margin: 0; padding: 0; background: #ffffff; }
          </style>
        </head>
        <body>
          <div id="pdf-root"></div>
        </body>
        </html>
      `);
      iframeDoc.close();

      const pdfRoot = iframeDoc.getElementById("pdf-root");
      if (!pdfRoot) {
        throw new Error("Could not find pdf-root inside iframe");
      }
      pdfRoot.appendChild(element);

      // Race canvas generation against a 15-second timeout
      const canvasPromise = html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("PDF generation timed out")), 15000)
      );

      const canvas = await Promise.race([canvasPromise, timeoutPromise]);
      
      // Clean up the iframe immediately
      document.body.removeChild(iframe);
      iframe = null;

      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });

      const imgWidth = 190;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 10; // 10mm top margin

      // Page 1
      doc.addImage(imgData, "JPEG", 10, position, imgWidth, imgHeight);
      heightLeft -= (pageHeight - 20); // 20mm margin (10mm top + 10mm bottom)

      // Dynamic page breaks
      while (heightLeft > 0) {
        position = heightLeft - imgHeight + 10;
        doc.addPage();
        doc.addImage(imgData, "JPEG", 10, position, imgWidth, imgHeight);
        heightLeft -= (pageHeight - 20);
      }

      doc.save(fileName);
      addToast("Export Successful", "Executive PDF downloaded successfully.", "success");
    } catch (err: any) {
      if (iframe && document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
      console.error(err);
      addToast("Export Failed", "Could not generate PDF: " + err.message, "error");
    }
  };



  if (!selectedClient) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] p-8 text-center bg-[#101010] rounded-lg border border-white/5 font-sans">
        <Sparkles className="w-12 h-12 text-[#8A8680]/40 animate-pulse mb-4" />
        <h3 className="text-lg font-bold text-[#F5F3EE]">No Connected Client Selected</h3>
        <p className="text-sm text-[#8A8680] max-w-md mt-1.5">
          Select an active client account from the global header selector to compile instant AI insights.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans text-left">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-5">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#F5F3EE] font-display flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#D6B77A]" />
            Lumen Intelligence
          </h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchAISummary}
            disabled={loading}
            className="px-3.5 py-2 bg-transparent hover:bg-white/5 border border-white/10 hover:border-[#D6B77A] text-[#8A8680] hover:text-[#F5F3EE] text-xs font-semibold rounded-md cursor-pointer transition-colors flex items-center gap-1.5 font-sans"
            title="Re-compile insights"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#D6B77A]" : ""}`} />
            <span>Regenerate</span>
          </button>

          <button
            onClick={handleCopy}
            disabled={loading || !summary}
            className="px-3.5 py-2 bg-transparent hover:bg-white/5 border border-white/10 hover:border-[#D6B77A] text-[#8A8680] hover:text-[#F5F3EE] text-xs font-semibold rounded-md cursor-pointer transition-colors flex items-center gap-1.5 font-sans"
            title="Copy summary content"
          >
            <Copy className="w-3.5 h-3.5 text-[#8A8680]" />
            <span>Copy All</span>
          </button>

          <button
            onClick={handleExportPDF}
            disabled={loading || !summary}
            className="px-3.5 py-2 bg-[#D6B77A] hover:bg-[#bfa063] border border-[#D6B77A] text-[#080808] text-xs font-semibold rounded-md cursor-pointer transition-colors flex items-center gap-1.5 font-sans"
            title="Download executive PDF report"
          >
            <Download className="w-3.5 h-3.5 text-[#080808]" />
            <span>Export as PDF</span>
          </button>
        </div>
      </div>

      {/* Main summary view content */}
      {loading ? (
        <div className="p-8 rounded-lg bg-[#101010] border border-white/5 min-h-[300px] flex flex-col items-center justify-center text-center space-y-4">
          <div className="relative flex items-center justify-center">
            <div className="w-14 h-14 rounded-full border-2 border-white/10 border-t-[#D6B77A] animate-spin"></div>
            <Sparkles className="w-5 h-5 text-[#D6B77A] absolute animate-pulse" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[#F5F3EE]">Compiling Ad Spend Insights...</h4>
            <p className="text-xs text-[#8A8680] mt-1 max-w-sm">
              Lumen is communicating with Claude to compile highlights, bottlenecks, and campaign optimizations.
            </p>
          </div>
        </div>
      ) : error ? (
        <div className="p-8 rounded-lg bg-[#101010] border border-white/5 text-center space-y-4">
          <div className="inline-flex p-3 rounded-full bg-red-500/10 text-red-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[#F5F3EE]">Could not compile AI Insights</h4>
            <p className="text-xs text-red-400 mt-1">{error}</p>
          </div>
          <button
            onClick={fetchAISummary}
            className="px-4 py-2 bg-[#D6B77A] hover:bg-[#bfa063] text-[#080808] text-xs font-semibold rounded-md transition-colors cursor-pointer animate-fade-in"
          >
            Retry Generation
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {insights && insights.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {insights.map((ins, idx) => {
                const colors = {
                  scale: { border: "border-[#D6B77A]/30", bg: "bg-[#D6B77A]/5", text: "text-[#D6B77A]" },
                  watch: { border: "border-[#FCD34D]/30", bg: "bg-[#FCD34D]/5", text: "text-[#FCD34D]" },
                  opportunity: { border: "border-[#4ADE80]/30", bg: "bg-[#4ADE80]/5", text: "text-[#4ADE80]" },
                  alert: { border: "border-[#F87171]/30", bg: "bg-[#F87171]/5", text: "text-[#F87171]" }
                }[ins.type as 'scale'|'watch'|'opportunity'|'alert'] || { border: "border-white/5", bg: "bg-[#151515]", text: "text-[#F5F3EE]" };

                return (
                  <div key={idx} className={`p-5 rounded-lg border ${colors.border} ${colors.bg} flex flex-col justify-between space-y-4 text-left animate-fade-in`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-mono tracking-widest uppercase font-bold ${colors.text}`}>
                        {ins.number} — {ins.label}
                      </span>
                    </div>
                    <div className="space-y-2 flex-1">
                      <p className="text-xs text-[#F5F3EE] font-semibold leading-relaxed">
                        {ins.what}
                      </p>
                      <p className="text-[11px] text-[#8A8680] leading-relaxed">
                        {ins.why}
                      </p>
                    </div>
                    <div className="pt-3 border-t border-white/5">
                      <p className="text-[11px] text-[#F5F3EE]">
                        <span className="font-semibold text-[#D6B77A]">Recommendation:</span> {ins.action}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Main summary outcome pane */
            <div className="p-6 rounded-lg bg-[#101010] border border-white/5 space-y-4 relative min-h-[350px]">
              {/* Copy report button */}
              <div className="absolute top-4 right-4 z-10">
                <button
                  onClick={handleCopy}
                  className="p-2 bg-[#151515] hover:bg-white/5 border border-white/5 hover:border-[#D6B77A] rounded-md text-[#8A8680] hover:text-[#F5F3EE] transition-colors cursor-pointer flex items-center gap-1 text-xs font-sans"
                  title="Copy formatted markdown report"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline font-semibold">Copy Report</span>
                </button>
              </div>

              {/* Document layout header */}
              <div className="flex items-center gap-2 border-b border-white/5 pb-4 mb-4 text-left">
                <FileText className="w-4 h-4 text-[#D6B77A]" />
                <span className="text-[10px] font-mono tracking-widest text-[#8A8680] uppercase">
                  Performance Summary
                </span>
              </div>

              {/* Formatted Text Box */}
              <div className="markdown-body text-[#8A8680] text-xs text-left leading-relaxed space-y-4">
                <Markdown
                  components={{
                    h1: ({ children }) => <h1 className="text-lg font-bold text-[#F5F3EE] mt-6 mb-3 font-display border-b border-white/5 pb-2 text-left">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-base font-bold text-[#D6B77A] mt-5 mb-2 font-display text-left">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-sm font-bold text-[#D6B77A] mt-4 mb-2 uppercase tracking-wider font-display text-left">{children}</h3>,
                    p: ({ children }) => <p className="text-xs text-[#8A8680] leading-relaxed mt-2 mb-2 text-left">{children}</p>,
                    ul: ({ children }) => <ul className="space-y-2.5 my-3 pl-1 text-left">{children}</ul>,
                    ol: ({ children }) => <ol className="space-y-2.5 my-3 pl-1 list-decimal text-left">{children}</ol>,
                    li: ({ children }) => (
                      <li className="flex gap-2 text-xs text-[#8A8680] py-1 pl-1 leading-relaxed items-start text-left">
                        <span className="text-[#D6B77A] font-semibold shrink-0 mt-1">●</span>
                        <span>{children}</span>
                      </li>
                    ),
                    strong: ({ children }) => <strong className="text-[#F5F3EE] font-bold">{children}</strong>,
                  }}
                >
                  {summary}
                </Markdown>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
