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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAISummary = async () => {
    if (!selectedClient) return;

    setLoading(true);
    setError(null);

    try {
      // First, fetch some analytics metrics so we can pass current aggregates to Gemini
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

      // Query Gemini Secure Server-Side Endpoint
      const response = await authFetch("/api/gemini/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClient.id,
          clientName: selectedClient.name,
          metricsSummary
        })
      });

      if (!response.ok) {
        throw new Error("Gemini AI failed to compile the performance summary.");
      }

      const data = await response.json();
      setSummary(data.summary);
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
      <div className="flex flex-col items-center justify-center h-[70vh] p-8 text-center bg-slate-950/20 rounded-2xl border border-slate-900/60 font-sans">
        <Sparkles className="w-12 h-12 text-slate-700 animate-pulse mb-4" />
        <h3 className="text-lg font-bold text-slate-300">No Connected Client Selected</h3>
        <p className="text-sm text-slate-500 max-w-md mt-1.5">
          Select an active client account from the global header selector to compile instant AI insights.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans text-left">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-display text-slate-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-400" />
            AI Written Daily Summary
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Lumen's AI-orchestration converts multi-channel spend data into natural English insights. Ideal for client summaries.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchAISummary}
            disabled={loading}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold rounded-lg cursor-pointer transition-colors flex items-center gap-1.5"
            style={profile?.primaryColor ? {
              backgroundColor: profile.primaryColor,
              borderColor: profile.primaryColor,
              color: "#ffffff"
            } : {}}
            onMouseEnter={(e) => {
              if (profile?.primaryColor) {
                e.currentTarget.style.backgroundColor = profile.accentColor || profile.primaryColor;
              }
            }}
            onMouseLeave={(e) => {
              if (profile?.primaryColor) {
                e.currentTarget.style.backgroundColor = profile.primaryColor;
              }
            }}
            title="Re-compile insights"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-violet-400" : ""}`} />
            <span>Regenerate</span>
          </button>

          <button
            onClick={handleCopy}
            disabled={loading || !summary}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold rounded-lg cursor-pointer transition-colors flex items-center gap-1.5"
            style={profile?.primaryColor ? {
              backgroundColor: profile.primaryColor,
              borderColor: profile.primaryColor,
              color: "#ffffff"
            } : {}}
            onMouseEnter={(e) => {
              if (profile?.primaryColor) {
                e.currentTarget.style.backgroundColor = profile.accentColor || profile.primaryColor;
              }
            }}
            onMouseLeave={(e) => {
              if (profile?.primaryColor) {
                e.currentTarget.style.backgroundColor = profile.primaryColor;
              }
            }}
            title="Copy summary content"
          >
            <Copy className="w-3.5 h-3.5 text-slate-400" />
            <span>Copy All</span>
          </button>

          <button
            onClick={handleExportPDF}
            disabled={loading || !summary}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold rounded-lg cursor-pointer transition-colors flex items-center gap-1.5"
            style={profile?.primaryColor ? {
              backgroundColor: profile.primaryColor,
              borderColor: profile.primaryColor,
              color: "#ffffff"
            } : {}}
            onMouseEnter={(e) => {
              if (profile?.primaryColor) {
                e.currentTarget.style.backgroundColor = profile.accentColor || profile.primaryColor;
              }
            }}
            onMouseLeave={(e) => {
              if (profile?.primaryColor) {
                e.currentTarget.style.backgroundColor = profile.primaryColor;
              }
            }}
            title="Download executive PDF report"
          >
            <Download className="w-3.5 h-3.5 text-violet-400" />
            <span>Export as PDF</span>
          </button>
        </div>
      </div>

      {/* Main summary view content */}
      {loading ? (
        <div className="p-8 rounded-xl bg-slate-900/15 border border-slate-900 min-h-[300px] flex flex-col items-center justify-center text-center space-y-4">
          <div className="relative flex items-center justify-center">
            <div className="w-14 h-14 rounded-full border-2 border-violet-600/20 border-t-violet-500 animate-spin"></div>
            <Sparkles className="w-5 h-5 text-violet-400 absolute animate-pulse" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-200">Compiling Ad Spend Insights...</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              Lumen is communicating with Claude to compile highlights, bottlenecks, and campaign optimizations.
            </p>
          </div>
        </div>
      ) : error ? (
        <div className="p-8 rounded-xl bg-slate-900/30 border border-rose-950/40 text-center space-y-4">
          <div className="inline-flex p-3 rounded-full bg-rose-500/10 text-rose-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-200">Could not compile AI Insights</h4>
            <p className="text-xs text-rose-400 mt-1">{error}</p>
          </div>
          <button
            onClick={fetchAISummary}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Retry Generation
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main summary outcome pane */}
          <div className="lg:col-span-2 p-6 rounded-xl bg-slate-900/10 border border-slate-900 space-y-4 relative min-h-[350px]">
            {/* Copy report button */}
            <div className="absolute top-4 right-4 z-10">
              <button
                onClick={handleCopy}
                className="p-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors cursor-pointer flex items-center gap-1 text-xs"
                style={profile?.primaryColor ? {
                  backgroundColor: profile.primaryColor,
                  borderColor: profile.primaryColor,
                  color: "#ffffff"
                } : {}}
                onMouseEnter={(e) => {
                  if (profile?.primaryColor) {
                    e.currentTarget.style.backgroundColor = profile.accentColor || profile.primaryColor;
                  }
                }}
                onMouseLeave={(e) => {
                  if (profile?.primaryColor) {
                    e.currentTarget.style.backgroundColor = profile.primaryColor;
                  }
                }}
                title="Copy formatted markdown report"
              >
                <Copy className="w-3.5 h-3.5" />
                <span className="hidden sm:inline font-semibold">Copy Report</span>
              </button>
            </div>

            {/* Document layout header */}
            <div className="flex items-center gap-2 border-b border-slate-900 pb-4 mb-4">
              <FileText className="w-4 h-4 text-violet-400" />
              <span className="text-[10px] font-mono tracking-widest text-slate-500 uppercase">
                EXECUTIVE COGNITIVE SUMMARY
              </span>
            </div>

            {/* Formatted Text Box */}
            <div className="markdown-body text-slate-300 text-xs text-left leading-relaxed space-y-4">
              <Markdown
                components={{
                  h1: ({ children }) => <h1 className="text-lg font-bold text-slate-100 mt-6 mb-3 font-display border-b border-slate-900/40 pb-2">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-base font-bold text-violet-400 mt-5 mb-2 font-display">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-sm font-bold text-violet-300 mt-4 mb-2 uppercase tracking-wider font-display">{children}</h3>,
                  p: ({ children }) => <p className="text-xs text-slate-300 leading-relaxed mt-2 mb-2">{children}</p>,
                  ul: ({ children }) => <ul className="space-y-2.5 my-3 pl-1">{children}</ul>,
                  ol: ({ children }) => <ol className="space-y-2.5 my-3 pl-1 list-decimal">{children}</ol>,
                  li: ({ children }) => (
                    <li className="flex gap-2 text-xs text-slate-300 py-1 pl-1 leading-relaxed items-start">
                      <span className="text-violet-400 font-semibold shrink-0 mt-1">●</span>
                      <span>{children}</span>
                    </li>
                  ),
                  strong: ({ children }) => <strong className="text-slate-100 font-bold">{children}</strong>,
                }}
              >
                {summary}
              </Markdown>
            </div>
          </div>

          {/* Side quick statistics column */}
          <div className="space-y-4">
            <div className="p-5 rounded-xl bg-slate-900/25 border border-slate-900 space-y-4">
              <h4 className="text-xs font-bold text-slate-200 font-display uppercase tracking-wider">
                Why live dashboards work
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                By sending your agency's clients a single Lumen link, they can read this plain-English daily synthesis of their budget anytime.
              </p>
              
              <ul className="space-y-2.5 text-xs text-slate-300">
                <li className="flex gap-2.5">
                  <span className="p-0.5 rounded bg-violet-500/10 text-violet-400 shrink-0">✓</span>
                  <p className="text-slate-400"><strong>Saves 10-20 hrs</strong> client reporting per month.</p>
                </li>
                <li className="flex gap-2.5">
                  <span className="p-0.5 rounded bg-violet-500/10 text-violet-400 shrink-0">✓</span>
                  <p className="text-slate-400">Eliminates end-of-month PPT screenshot scramble.</p>
                </li>
                <li className="flex gap-2.5">
                  <span className="p-0.5 rounded bg-violet-500/10 text-violet-400 shrink-0">✓</span>
                  <p className="text-slate-400">Enables premium fee charging for elite reporting.</p>
                </li>
              </ul>
            </div>

            <div className="p-5 rounded-xl bg-slate-900/10 border border-slate-900/60 flex items-center justify-between">
              <div>
                <h5 className="text-[10px] font-mono tracking-wider text-slate-500 uppercase">Report Status</h5>
                <p className="text-xs text-emerald-400 font-semibold mt-0.5">Synthesized & Safe</p>
              </div>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
