import React, { useState, useEffect, useMemo } from "react";
import { authFetch } from "../lib/supabaseClient";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { 
  TrendingUp, 
  Hourglass, 
  MousePointerClick, 
  CheckCircle, 
  RefreshCw, 
  SlidersHorizontal, 
  Globe, 
  Search, 
  Download,
  Target,
  Percent,
  DollarSign,
  Activity,
  Layers,
  Sparkles,
  ChevronDown,
  AlertTriangle,
  HelpCircle,
  Briefcase,
  Play,
  Pause,
  LayoutDashboard
} from "lucide-react";
import { ClientAccount, PerformanceMetric } from "../types";
import { DateRange, formatDisplayDate } from "../utils/dateHelpers";

interface OverviewProps {
  selectedClient: ClientAccount | null;
  dateRange: DateRange;
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
  addToast: (title: string, description?: string, type?: "success" | "error" | "warning" | "info") => void;
  customCta?: string | null;
}

// Country Traffic representation
interface CountryTraffic {
  country: string;
  code: string;
  flag: string;
  timeOnPage: string;
  views: number;
  bounceRate: string;
  conversionRate: string;
  type: "Organic" | "Referral" | "Invalid" | "Direct" | "Social" | "Email";
}

const mockCountryTraffic: CountryTraffic[] = [
  { country: "United States", code: "US", flag: "🇺🇸", timeOnPage: "3 mins 21 ses", views: 980232, bounceRate: "25.13%", conversionRate: "32.36%", type: "Organic" },
  { country: "United Kingdom", code: "GB", flag: "🇬🇧", timeOnPage: "2 mins 12 ses", views: 896365, bounceRate: "24.35%", conversionRate: "28.83%", type: "Organic" },
  { country: "Bangladesh", code: "BD", flag: "🇧🇩", timeOnPage: "1 mins 18 ses", views: 683723, bounceRate: "32.18%", conversionRate: "20.18%", type: "Invalid" },
  { country: "France", code: "FR", flag: "🇫🇷", timeOnPage: "4 mins 39 ses", views: 453483, bounceRate: "18.72%", conversionRate: "28.48%", type: "Organic" },
  { country: "Germany", code: "DE", flag: "🇩🇪", timeOnPage: "2 mins 55 ses", views: 395120, bounceRate: "21.40%", conversionRate: "27.50%", type: "Referral" },
  { country: "Canada", code: "CA", flag: "🇨🇦", timeOnPage: "3 mins 05 ses", views: 320140, bounceRate: "24.90%", conversionRate: "29.10%", type: "Direct" },
  { country: "Japan", code: "JP", flag: "🇯🇵", timeOnPage: "1 mins 45 ses", views: 280550, bounceRate: "15.30%", conversionRate: "35.20%", type: "Organic" },
  { country: "Australia", code: "AU", flag: "🇦🇺", timeOnPage: "2 mins 40 ses", views: 210890, bounceRate: "23.10%", conversionRate: "26.90%", type: "Social" },
];

// Campaign Data structure for top campaign table
interface CampaignData {
  id: string;
  name: string;
  platform: "Google Ads" | "Meta Ads" | "TikTok Ads";
  status: "Active" | "Paused" | "Needs Review";
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cpl: number;
  roas: number;
}

// Generate dynamic campaigns tailored to client domain and platform splits
const getMockCampaignsForClient = (
  clientName: string, 
  totalSpend: number, 
  totalConversions: number, 
  platform: string
): CampaignData[] => {
  const isGoogleOnly = platform === "Google Ads";
  const isMetaOnly = platform === "Meta Ads";
  const isTikTokOnly = platform === "TikTok Ads";

  const allCamps = [
    { name: "Brand Search - High Intent", platform: "Google Ads" as const, active: !isMetaOnly && !isTikTokOnly },
    { name: "Meta - Custom Retargeting Lookalike (3% Purchasers)", platform: "Meta Ads" as const, active: !isGoogleOnly && !isTikTokOnly },
    { name: "TikTok - UGC Direct Offer (Creators Promo)", platform: "TikTok Ads" as const, active: !isGoogleOnly && !isMetaOnly },
    { name: "Google - Performance Max (Retail Feed Expansion)", platform: "Google Ads" as const, active: !isMetaOnly && !isTikTokOnly },
    { name: "Meta - Broad Demographics prospecting", platform: "Meta Ads" as const, active: !isGoogleOnly && !isTikTokOnly },
    { name: "Google - Competitor Conquesting Keyword Push", platform: "Google Ads" as const, active: !isMetaOnly && !isTikTokOnly },
  ];

  const activeCamps = allCamps.filter(c => c.active);
  if (activeCamps.length === 0) {
    activeCamps.push({ name: "Generic Local Brand Awareness Campaign", platform: "Google Ads" as const, active: true });
  }

  const numCamps = activeCamps.length;
  return activeCamps.map((camp, idx) => {
    // Distribute budget unevenly across campaigns
    const rawShare = 1 / (idx + 1);
    const sumShares = Array.from({ length: numCamps }, (_, i) => 1 / (i + 1)).reduce((a, b) => a + b, 0);
    const share = rawShare / sumShares;

    const campaignSpend = Math.round(totalSpend * share * 100) / 100;
    const campaignConversions = Math.round(totalConversions * share);
    const campaignClicks = Math.round(campaignConversions * (12 + (idx % 3) * 5) + (campaignSpend * 0.08));
    const campaignImpressions = Math.round(campaignClicks * (28 + idx * 12));
    
    const cpl = campaignConversions > 0 ? campaignSpend / campaignConversions : 0;
    const roas = campaignSpend > 0 ? (campaignConversions * 148) / campaignSpend : 0;

    const statuses: CampaignData["status"][] = ["Active", "Active", "Needs Review", "Paused", "Active", "Paused"];
    
    return {
      id: `camp-${idx + 1}`,
      name: `${clientName} | ${camp.name}`,
      platform: camp.platform,
      status: statuses[idx % statuses.length],
      spend: campaignSpend,
      impressions: Math.max(campaignImpressions, campaignClicks * 12),
      clicks: Math.max(campaignClicks, campaignConversions),
      conversions: campaignConversions,
      cpl,
      roas
    };
  });
};

export default function Overview({ selectedClient, dateRange, onRefresh, isRefreshing, addToast, customCta }: OverviewProps) {
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);

  // Filter metrics based on selected date range
  const filteredMetrics = useMemo(() => {
    return metrics.filter(m => m.date >= dateRange.startDate && m.date <= dateRange.endDate);
  }, [metrics, dateRange]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters State
  const [selectedDimension, setSelectedDimension] = useState("All");
  const [selectedCampaignType, setSelectedCampaignType] = useState("All");
  const [selectedSource, setSelectedSource] = useState("All");
  const [activeTrafficTab, setActiveTrafficTab] = useState<"All" | "Organic" | "Invalid" | "Referrals" | "Direct" | "Social">("All");
  const [tableSearch, setTableSearch] = useState("");

  // Sub-navigation for Performance Data Table
  const [activeTableTab, setActiveTableTab] = useState<"campaigns" | "regions">("campaigns");

  // Table Selection State for Bulk Actions
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [selectedCampaignRows, setSelectedCampaignRows] = useState<string[]>([]);
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; label: string; value: string } | null>(null);

  // Load analytical data based on selectedClient
  useEffect(() => {
    if (!selectedClient) return;
    
    let isMounted = true;
    setIsLoading(true);
    setError(null);

    authFetch(`/api/analytics/${selectedClient.id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load client performance state.");
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setMetrics(data.metrics);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message);
          setIsLoading(false);
          addToast("Failed to sync server state", err.message, "error");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedClient, isRefreshing]);

  // Calculated KPI Aggregates
  const stats = useMemo(() => {
    if (filteredMetrics.length === 0) return { spend: 0, clicks: 0, conversions: 0, impressions: 0, ctr: 0, cr: 0, cpc: 0, savedHours: 0, cpl: 0, roas: 0 };
    
    const spend = filteredMetrics.reduce((acc, m) => acc + m.spend, 0);
    const clicks = filteredMetrics.reduce((acc, m) => acc + m.clicks, 0);
    const conversions = filteredMetrics.reduce((acc, m) => acc + m.conversions, 0);
    const impressions = filteredMetrics.reduce((acc, m) => acc + m.impressions, 0);
    
    const budgetFactor = (selectedClient?.monthlyBudget || 10000) / 10000;
    const savedHours = Math.round(15 * budgetFactor * 10) / 10;

    const cpl = conversions > 0 ? spend / conversions : 0;
    // Assume average lead value is $150 to derive standard revenue for ROAS calculation
    const roas = spend > 0 ? (conversions * 150) / spend : 0;

    return {
      spend,
      clicks,
      conversions,
      impressions,
      ctr: (clicks / impressions) * 100,
      cr: (conversions / clicks) * 100,
      cpc: spend / clicks,
      savedHours,
      cpl,
      roas
    };
  }, [filteredMetrics, selectedClient]);

  // Goal Tracker Calculations (Monthly Goals vs Actual Performance)
  const goalsData = useMemo(() => {
    const monthlyBudget = selectedClient?.monthlyBudget || 10000;
    
    // Total Spend Goal
    const spendGoal = monthlyBudget;
    const spendProgress = Math.min((stats.spend / spendGoal) * 100, 100);
    let spendStatus: "on_track" | "warning" | "danger" = "on_track";
    const spendRatio = stats.spend / spendGoal;
    if (spendRatio < 0.75 || spendRatio > 1.2) spendStatus = "danger";
    else if (spendRatio < 0.9 || spendRatio > 1.1) spendStatus = "warning";

    // Conversions Goal (Assume a target CPA of $40 per conversion)
    const conversionGoal = Math.round(monthlyBudget / 40);
    const conversionProgress = Math.min((stats.conversions / conversionGoal) * 100, 100);
    let conversionStatus: "on_track" | "warning" | "danger" = "on_track";
    if (conversionProgress < 80) conversionStatus = "danger";
    else if (conversionProgress < 95) conversionStatus = "warning";

    // Cost Per Lead (CPL) Goal - Lower is better! Target CPL is $40
    const cplGoal = 40.0;
    const cplProgress = stats.cpl > 0 ? Math.min((cplGoal / stats.cpl) * 100, 100) : 0;
    let cplStatus: "on_track" | "warning" | "danger" = "on_track";
    if (stats.cpl > cplGoal * 1.25) cplStatus = "danger";
    else if (stats.cpl > cplGoal) cplStatus = "warning";

    // Return on Ad Spend (ROAS) Goal - Higher is better! Target is 3.5x
    const roasGoal = 3.5;
    const roasProgress = Math.min((stats.roas / roasGoal) * 100, 100);
    let roasStatus: "on_track" | "warning" | "danger" = "on_track";
    if (stats.roas < roasGoal * 0.8) roasStatus = "danger";
    else if (stats.roas < roasGoal) roasStatus = "warning";

    // Average CTR Goal - Target is 2.5%
    const ctrGoal = 2.5;
    const ctrProgress = Math.min((stats.ctr / ctrGoal) * 100, 100);
    let ctrStatus: "on_track" | "warning" | "danger" = "on_track";
    if (stats.ctr < ctrGoal * 0.8) ctrStatus = "danger";
    else if (stats.ctr < ctrGoal) ctrStatus = "warning";

    // Saved Reporting Hours Goal - Target is 15 hours
    const savedHoursGoal = 15;
    const savedHoursProgress = Math.min((stats.savedHours / savedHoursGoal) * 100, 100);
    let savedHoursStatus: "on_track" | "warning" | "danger" = "on_track";
    if (stats.savedHours < savedHoursGoal * 0.8) savedHoursStatus = "danger";
    else if (stats.savedHours < savedHoursGoal) savedHoursStatus = "warning";

    return {
      spend: { goal: spendGoal, progress: spendProgress, status: spendStatus, label: `$${spendGoal.toLocaleString()}` },
      conversions: { goal: conversionGoal, progress: conversionProgress, status: conversionStatus, label: `${conversionGoal} Lead Units` },
      cpl: { goal: cplGoal, progress: cplProgress, status: cplStatus, label: `$${cplGoal.toFixed(2)}` },
      roas: { goal: roasGoal, progress: roasProgress, status: roasStatus, label: `${roasGoal.toFixed(1)}x` },
      ctr: { goal: ctrGoal, progress: ctrProgress, status: ctrStatus, label: `${ctrGoal.toFixed(1)}%` },
      savedHours: { goal: savedHoursGoal, progress: savedHoursProgress, status: savedHoursStatus, label: `${savedHoursGoal} hrs` }
    };
  }, [stats, selectedClient]);

  // Channel Level breakdown logic (Google vs Meta vs TikTok)
  const channelBreakdown = useMemo(() => {
    const platform = selectedClient?.platform || "All Platforms";
    
    // Set up standard splits if "All Platforms" is selected, or 100% attribute if single channel
    const config = {
      "Google Ads": { google: 1.0, meta: 0.0, tiktok: 0.0, googleActive: true, metaActive: false, tiktokActive: false },
      "Meta Ads": { google: 0.0, meta: 1.0, tiktok: 0.0, googleActive: false, metaActive: true, tiktokActive: false },
      "TikTok Ads": { google: 0.0, meta: 0.0, tiktok: 1.0, googleActive: false, metaActive: false, tiktokActive: true },
      "All Platforms": { google: 0.45, meta: 0.35, tiktok: 0.20, googleActive: true, metaActive: true, tiktokActive: true }
    }[platform] || { google: 0.45, meta: 0.35, tiktok: 0.20, googleActive: true, metaActive: true, tiktokActive: true };

    const calculateChannelData = (share: number, label: string, color: string, active: boolean) => {
      if (!active || share === 0) {
        return { label, spend: 0, conversions: 0, cpl: 0, roas: 0, ctr: 0, share: 0, active: false, color };
      }
      
      const channelSpend = stats.spend * share;
      const channelConversions = Math.round(stats.conversions * share);
      const channelCpl = channelConversions > 0 ? channelSpend / channelConversions : 0;
      const channelRoas = channelSpend > 0 ? (channelConversions * 150) / channelSpend : 0;
      
      // Introduce slight channel-specific differences in click rate performance
      const ctrOffset = label === "Google Ads" ? 0.35 : label === "Meta Ads" ? -0.15 : -0.45;
      const channelCtr = Math.max(0.8, stats.ctr + ctrOffset);

      return {
        label,
        spend: channelSpend,
        conversions: channelConversions,
        cpl: channelCpl,
        roas: channelRoas,
        ctr: channelCtr,
        share: share * 100,
        active: true,
        color
      };
    };

    return [
      calculateChannelData(config.google, "Google Ads", "from-blue-600 to-sky-500", config.googleActive),
      calculateChannelData(config.meta, "Meta Ads", "from-indigo-600 to-violet-500", config.metaActive),
      calculateChannelData(config.tiktok, "TikTok Ads", "from-rose-600 to-pink-500", config.tiktokActive)
    ];
  }, [stats, selectedClient]);

  // Dynamic campaigns based on calculations
  const campaignsList = useMemo(() => {
    if (!selectedClient) return [];
    return getMockCampaignsForClient(selectedClient.name, stats.spend, stats.conversions, selectedClient.platform);
  }, [selectedClient, stats]);

  // Reset Filters trigger
  const handleResetFilters = () => {
    setSelectedDimension("All");
    setSelectedCampaignType("All");
    setSelectedSource("All");
    setActiveTrafficTab("All");
    setTableSearch("");
    addToast("Filters reset", "All overview parameters restored to default", "info");
  };

  // Filter Country Traffic Data
  const filteredCountryTraffic = useMemo(() => {
    return mockCountryTraffic.filter((item) => {
      const matchesSearch = item.country.toLowerCase().includes(tableSearch.toLowerCase());
      
      let matchesTab = true;
      if (activeTrafficTab === "Organic") matchesTab = item.type === "Organic";
      else if (activeTrafficTab === "Invalid") matchesTab = item.type === "Invalid";
      else if (activeTrafficTab === "Referrals") matchesTab = item.type === "Referral";
      else if (activeTrafficTab === "Direct") matchesTab = item.type === "Direct";
      else if (activeTrafficTab === "Social") matchesTab = item.type === "Social";
      
      let matchesDimension = true;
      if (selectedDimension !== "All" && selectedDimension !== "Country") {
        matchesDimension = false; 
      }

      return matchesSearch && matchesTab && matchesDimension;
    });
  }, [activeTrafficTab, tableSearch, selectedDimension]);

  // Filter Campaigns based on search
  const filteredCampaigns = useMemo(() => {
    return campaignsList.filter((camp) => {
      return camp.name.toLowerCase().includes(tableSearch.toLowerCase()) || 
             camp.platform.toLowerCase().includes(tableSearch.toLowerCase());
    });
  }, [campaignsList, tableSearch]);

  // Bulk Row Selection Handlers (Regions)
  const handleSelectRow = (countryName: string) => {
    if (selectedRows.includes(countryName)) {
      setSelectedRows(selectedRows.filter(r => r !== countryName));
    } else {
      setSelectedRows([...selectedRows, countryName]);
    }
  };

  const handleSelectAllRows = () => {
    if (selectedRows.length === filteredCountryTraffic.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(filteredCountryTraffic.map(item => item.country));
    }
  };

  // Bulk Campaign Selection Handlers
  const handleSelectCampaignRow = (id: string) => {
    if (selectedCampaignRows.includes(id)) {
      setSelectedCampaignRows(selectedCampaignRows.filter(r => r !== id));
    } else {
      setSelectedCampaignRows([...selectedCampaignRows, id]);
    }
  };

  const handleSelectAllCampaignRows = () => {
    if (selectedCampaignRows.length === filteredCampaigns.length) {
      setSelectedCampaignRows([]);
    } else {
      setSelectedCampaignRows(filteredCampaigns.map(c => c.id));
    }
  };

  const handleBulkExport = () => {
    let csvContent = "";
    let fileName = "";
    
    if (activeTableTab === "campaigns") {
      fileName = `${selectedClient?.name || "Client"}_Campaigns_Export.csv`;
      const headers = ["Campaign Name", "Platform", "Status", "Spend ($)", "Impressions", "Clicks", "Conversions", "CPL ($)", "ROAS"];
      
      const targetCampaigns = selectedCampaignRows.length > 0 
        ? filteredCampaigns.filter(c => selectedCampaignRows.includes(c.id))
        : filteredCampaigns;
        
      const rows = targetCampaigns.map(c => [
        `"${c.name.replace(/"/g, '""')}"`,
        `"${c.platform}"`,
        `"${c.status}"`,
        c.spend.toFixed(2),
        c.impressions,
        c.clicks,
        c.conversions,
        c.cpl.toFixed(2),
        c.roas.toFixed(2)
      ]);
      
      csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    } else {
      fileName = `${selectedClient?.name || "Client"}_Regions_Export.csv`;
      const headers = ["Country", "Code", "Type", "Views", "Bounce Rate", "Conversion Rate", "Avg Time on Page"];
      
      const targetRegions = selectedRows.length > 0
        ? filteredCountryTraffic.filter(r => selectedRows.includes(r.country))
        : filteredCountryTraffic;
        
      const rows = targetRegions.map(r => [
        `"${r.country}"`,
        `"${r.code}"`,
        `"${r.type}"`,
        r.views,
        `"${r.bounceRate}"`,
        `"${r.conversionRate}"`,
        `"${r.timeOnPage}"`
      ]);
      
      csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    }
    
    try {
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", fileName);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      const itemsCount = activeTableTab === "campaigns" 
        ? (selectedCampaignRows.length > 0 ? selectedCampaignRows.length : filteredCampaigns.length)
        : (selectedRows.length > 0 ? selectedRows.length : filteredCountryTraffic.length);
        
      addToast(
        "Export Successful",
        `Downloaded ${itemsCount} records successfully as ${fileName}.`,
        "success"
      );
    } catch (err: any) {
      addToast(
        "Export Failed",
        `Error generating CSV: ${err.message}`,
        "error"
      );
    }
    
    setSelectedRows([]);
    setSelectedCampaignRows([]);
  };

  const handleBulkExclude = () => {
    const itemCount = activeTableTab === "campaigns" ? selectedCampaignRows.length : selectedRows.length;
    addToast(
      "Dimensions Hidden",
      `Simulated: audit logged exclusion of ${itemCount} parameters from reports.`,
      "warning"
    );
    setSelectedRows([]);
    setSelectedCampaignRows([]);
  };

  const handleExportPDF = () => {
    if (!selectedClient) return;

    // Create a print-friendly document container
    const element = document.createElement("div");
    element.style.padding = "35px";
    element.style.color = "#0f172a";
    element.style.backgroundColor = "#ffffff";
    element.style.fontFamily = "system-ui, -apple-system, sans-serif";
    element.style.fontSize = "11px";
    element.style.lineHeight = "1.5";

    // Executive Header
    const headerHtml = `
      <div style="border-bottom: 2px solid #6d28d9; padding-bottom: 16px; margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-end;">
          <div>
            <div style="font-size: 22px; font-weight: 800; color: #1e1b4b; letter-spacing: -0.5px;">Lumen Analytics Report</div>
            <div style="font-size: 9px; text-transform: uppercase; font-weight: 700; color: #6d28d9; margin-top: 3px; letter-spacing: 1px;">EXECUTIVE PERFORMANCE DASHBOARD</div>
          </div>
          <div style="font-size: 10px; color: #64748b; font-weight: 600; text-align: right;">
            Generated: ${new Date().toLocaleDateString()}
          </div>
        </div>
        <div style="margin-top: 15px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; color: #334155; border-top: 1px solid #f1f5f9; padding-top: 10px;">
          <div><strong>Client:</strong> ${selectedClient.name} (${selectedClient.domain})</div>
          <div><strong>Selected Date Range:</strong> ${dateRange.startDate} to ${dateRange.endDate}</div>
          <div><strong>Core Ad Network:</strong> ${selectedClient.platform}</div>
          <div><strong>Monthly Budget:</strong> $${selectedClient.monthlyBudget.toLocaleString()}</div>
        </div>
      </div>
    `;

    // KPI Metrics Section (6 Cards in a clean 3x2 grid)
    const kpisHtml = `
      <div style="margin-bottom: 30px;">
        <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #475569; letter-spacing: 0.5px; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
          Key Performance Indicators (KPIs)
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
          
          <div style="padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #f8fafc;">
            <div style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase;">Total Ad Spend</div>
            <div style="font-size: 16px; font-weight: 800; color: #0f172a; margin-top: 4px;">$${stats.spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div style="font-size: 8px; color: #475569; margin-top: 2px;">Goal: $${goalsData.spend.label}</div>
          </div>

          <div style="padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #f8fafc;">
            <div style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase;">Conversions</div>
            <div style="font-size: 16px; font-weight: 800; color: #0f172a; margin-top: 4px;">${stats.conversions.toLocaleString()}</div>
            <div style="font-size: 8px; color: #475569; margin-top: 2px;">Goal: ${goalsData.conversions.goal}</div>
          </div>

          <div style="padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #f8fafc;">
            <div style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase;">Cost Per Lead (CPL)</div>
            <div style="font-size: 16px; font-weight: 800; color: #0f172a; margin-top: 4px;">$${stats.cpl.toFixed(2)}</div>
            <div style="font-size: 8px; color: #475569; margin-top: 2px;">Target: ${goalsData.cpl.label}</div>
          </div>

          <div style="padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #f8fafc;">
            <div style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase;">Return on Ad Spend</div>
            <div style="font-size: 16px; font-weight: 800; color: #0f172a; margin-top: 4px;">${stats.roas.toFixed(2)}x</div>
            <div style="font-size: 8px; color: #475569; margin-top: 2px;">Target: ${goalsData.roas.label}</div>
          </div>

          <div style="padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #f8fafc;">
            <div style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase;">Average CTR</div>
            <div style="font-size: 16px; font-weight: 800; color: #0f172a; margin-top: 4px;">${stats.ctr.toFixed(2)}%</div>
            <div style="font-size: 8px; color: #475569; margin-top: 2px;">Target: ${goalsData.ctr.label}</div>
          </div>

          <div style="padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #f8fafc;">
            <div style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase;">Saved Hours</div>
            <div style="font-size: 16px; font-weight: 800; color: #0f172a; margin-top: 4px;">${stats.savedHours} hrs</div>
            <div style="font-size: 8px; color: #475569; margin-top: 2px;">Goal: ${goalsData.savedHours.label}</div>
          </div>

        </div>
      </div>
    `;

    // Chart Section
    let chartSvgHtml = "";
    const originalChartSvg = document.querySelector(".relative svg");
    if (originalChartSvg) {
      const clonedSvg = originalChartSvg.cloneNode(true) as SVGSVGElement;
      
      clonedSvg.style.backgroundColor = "#ffffff";
      clonedSvg.style.color = "#0f172a";
      clonedSvg.setAttribute("width", "100%");
      clonedSvg.setAttribute("height", "180");
      
      clonedSvg.querySelectorAll("line").forEach((line) => {
        const currentDash = line.getAttribute("stroke-dasharray");
        if (currentDash) {
          line.setAttribute("stroke", "#e2e8f0");
        } else {
          line.setAttribute("stroke", "#94a3b8");
        }
      });
      clonedSvg.querySelectorAll("text").forEach((text) => {
        text.setAttribute("fill", "#64748b");
        text.style.fontFamily = "sans-serif";
      });
      clonedSvg.querySelectorAll("polyline").forEach((polyline) => {
        polyline.setAttribute("stroke", "#6d28d9");
      });
      clonedSvg.querySelectorAll("circle").forEach((circle) => {
        circle.setAttribute("stroke", "#6d28d9");
        circle.setAttribute("fill", "#ffffff");
      });
      clonedSvg.querySelectorAll("rect").forEach((rect) => {
        rect.setAttribute("fill", "#a78bfa");
        rect.setAttribute("fill-opacity", "0.2");
      });
      
      chartSvgHtml = clonedSvg.outerHTML;
    }

    const chartHtml = `
      <div style="margin-bottom: 30px; page-break-inside: avoid;">
        <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #475569; letter-spacing: 0.5px; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
          Paid Campaign Performance Trend
        </div>
        <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 200px; background-color: #ffffff;">
          ${chartSvgHtml || `<div style="color: #94a3b8; font-size: 12px; font-style: italic">Performance chart preview not available</div>`}
        </div>
      </div>
    `;

    // Cross-Channel Wallet Share breakdown
    const channelsListHtml = channelBreakdown.map((chan) => {
      return `
        <div style="padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; background-color: ${chan.active ? "#ffffff" : "#f8fafc"}; opacity: ${chan.active ? "1" : "0.5"};">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; margin-bottom: 6px;">
            <span style="font-size: 11px; font-weight: 700; color: #1e1b4b;">${chan.label}</span>
            <span style="font-size: 9px; font-weight: 600; color: #64748b; font-family: monospace;">
              ${chan.active ? `${Math.round(chan.share)}% Budget` : "Not Connected"}
            </span>
          </div>
          ${chan.active ? `
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; font-size: 10px;">
              <div><span style="color: #64748b; font-size: 8px; text-transform: uppercase;">Spend</span><br/><strong>$${Math.round(chan.spend).toLocaleString()}</strong></div>
              <div><span style="color: #64748b; font-size: 8px; text-transform: uppercase;">Convs</span><br/><strong>${chan.conversions}</strong></div>
              <div><span style="color: #64748b; font-size: 8px; text-transform: uppercase;">CPL</span><br/><strong>$${chan.cpl.toFixed(2)}</strong></div>
              <div><span style="color: #64748b; font-size: 8px; text-transform: uppercase;">ROAS</span><br/><strong>${chan.roas.toFixed(2)}x</strong></div>
            </div>
          ` : `
            <div style="font-size: 9px; color: #94a3b8; font-style: italic; padding: 4px 0;">This channel is not connected for this client.</div>
          `}
        </div>
      `;
    }).join("");

    const channelsHtml = `
      <div style="page-break-inside: avoid;">
        <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #475569; letter-spacing: 0.5px; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
          Cross-Channel Share of Wallet
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
          ${channelsListHtml}
        </div>
      </div>
    `;
    element.innerHTML = `${headerHtml}${kpisHtml}${chartHtml}${channelsHtml}`;

    const fileName = `${selectedClient.name.replace(/\s+/g, '_')}_Dashboard_Overview_${dateRange.startDate}_to_${dateRange.endDate}.pdf`;

    try {
      addToast("Exporting PDF", "Generating your executive performance overview PDF...", "info");
      
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });

      doc.html(element, {
        html2canvas: html2canvas,
        callback: function (doc) {
          doc.save(fileName);
          addToast("Export Successful", "Dashboard Overview PDF downloaded successfully.", "success");
        },
        x: 10,
        y: 10,
        width: 190,
        windowWidth: 650
      } as any);
    } catch (err: any) {
      console.error(err);
      addToast("Export Failed", "Could not generate PDF: " + err.message, "error");
    }
  };

  // Custom Line and Bar Chart helper calculation (Responsive SVGs)
  const chartCoordinates = useMemo(() => {
    if (filteredMetrics.length === 0) return { linePoints: "", barPoints: [] };
    const width = 600;
    const height = 180;
    const padding = 25;

    if (filteredMetrics.length === 1) {
      const m = filteredMetrics[0];
      const points = [{ x: width / 2, y: height / 2, data: m }];
      const linePoints = `${width / 2},${height / 2}`;
      const barPoints = [{
        x: width / 2 - 6,
        y: height / 2,
        width: 12,
        height: height / 2,
        data: m
      }];
      return { linePoints, barPoints, rawPoints: points };
    }

    const maxSpend = Math.max(...filteredMetrics.map(m => m.spend)) * 1.1 || 1;
    const points = filteredMetrics.map((m, index) => {
      const x = padding + (index * (width - padding * 2)) / (filteredMetrics.length - 1);
      const y = height - padding - (m.spend * (height - padding * 2)) / maxSpend;
      return { x, y, data: m };
    });

    const linePoints = points.map(p => `${p.x},${p.y}`).join(" ");

    // Bar chart coordinate calculator for Conversions
    const maxConversions = Math.max(...filteredMetrics.map(m => m.conversions)) * 1.1 || 1;
    const barPoints = filteredMetrics.map((m, index) => {
      const x = padding + (index * (width - padding * 2)) / (filteredMetrics.length - 1);
      const y = height - padding - (m.conversions * (height - padding * 2)) / maxConversions;
      return {
        x: x - 6, // center the bar
        y,
        width: 12,
        height: height - padding - y,
        data: m
      };
    });

    return { linePoints, barPoints, rawPoints: points };
  }, [filteredMetrics]);

  // Utility to get pacing text and colors
  const getStatusPacingDetails = (status: "on_track" | "warning" | "danger") => {
    switch (status) {
      case "on_track":
        return { text: "On Track", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", progressColor: "bg-emerald-500" };
      case "warning":
        return { text: "Behind", color: "text-amber-400 bg-amber-500/10 border-amber-500/20", progressColor: "bg-amber-500" };
      case "danger":
        return { text: "Significantly Behind", color: "text-rose-400 bg-rose-500/10 border-rose-500/20", progressColor: "bg-rose-500" };
    }
  };

  if (!selectedClient) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] p-8 text-center bg-slate-950/20 rounded-2xl border border-slate-900/60 font-sans">
        <SlidersHorizontal className="w-12 h-12 text-slate-700 animate-pulse mb-4" />
        <h3 className="text-lg font-bold text-slate-300">No Connected Client Selected</h3>
        <p className="text-sm text-slate-500 max-w-md mt-1.5">
          Select an active client account from the global header selector to load analytics intelligence.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 text-left">
        <div>
          <h2 className="text-xl font-bold font-display text-slate-100 flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-violet-400" />
            Executive Performance Overview
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time attribution and performance metrics for connected ad accounts.
          </p>
        </div>

        <button
          onClick={handleExportPDF}
          disabled={isLoading || filteredMetrics.length === 0}
          className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold rounded-lg cursor-pointer transition-colors flex items-center gap-1.5 shrink-0"
          title="Download full dashboard PDF report"
        >
          <Download className="w-3.5 h-3.5 text-violet-400" />
          <span>Export Overview as PDF</span>
        </button>
      </div>

      {/* Skeletons Loading View */}
      {isLoading ? (
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-32 bg-slate-900/50 rounded-xl border border-slate-800"></div>
            ))}
          </div>
          <div className="h-80 bg-slate-900/50 rounded-xl border border-slate-800"></div>
          <div className="h-64 bg-slate-900/50 rounded-xl border border-slate-800"></div>
        </div>
      ) : error ? (
        <div className="p-8 text-center bg-slate-900/40 rounded-xl border border-rose-950/30 text-rose-200">
          <p className="font-semibold text-rose-400">Error fetching client analytics data</p>
          <p className="text-xs text-rose-500 mt-1">{error}</p>
          <button 
            onClick={onRefresh}
            className="mt-4 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm transition-colors cursor-pointer"
          >
            Retry Fetch
          </button>
        </div>
      ) : (
        <>
          {customCta && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-violet-950/20 to-indigo-950/20 border border-violet-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in mb-6">
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-mono tracking-widest text-violet-400 uppercase">
                    Agency Message
                  </span>
                  <p className="text-xs text-slate-300 mt-1 font-medium leading-relaxed">
                    {customCta}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Section 1: KPI Grid with deep performance metrics & goal pacing progress bars */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            
            {/* KPI Ad Spend */}
            <div className="p-4 rounded-xl bg-slate-900/15 border border-slate-900 flex flex-col justify-between hover:border-slate-800/80 transition-colors duration-200 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-medium text-slate-500 tracking-wider font-mono">TOTAL AD SPEND</span>
                <span className="p-1 rounded-md bg-slate-900 border border-slate-800 text-slate-400">
                  <DollarSign className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="mt-4">
                <h3 className="text-xl font-bold font-display text-slate-100">
                  ${stats.spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h3>
                
                <div className="mt-3 flex items-center justify-between">
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold border ${getStatusPacingDetails(goalsData.spend.status).color}`}>
                    {getStatusPacingDetails(goalsData.spend.status).text}
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono">Pacing: {Math.round(goalsData.spend.progress)}%</span>
                </div>

                {/* Goal Track */}
                <div className="w-full h-1 bg-slate-950 rounded-full overflow-hidden mt-2">
                  <div 
                    className={`h-full rounded-full ${getStatusPacingDetails(goalsData.spend.status).progressColor}`} 
                    style={{ width: `${goalsData.spend.progress}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[8px] text-slate-500 font-mono mt-1">
                  <span>Spend: ${Math.round(stats.spend).toLocaleString()}</span>
                  <span>Goal: {goalsData.spend.label}</span>
                </div>
              </div>
            </div>

            {/* KPI Conversions (Leads) */}
            <div className="p-4 rounded-xl bg-slate-900/15 border border-slate-900 flex flex-col justify-between hover:border-slate-800/80 transition-colors duration-200 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-medium text-slate-500 tracking-wider font-mono">CONVERSIONS</span>
                <span className="p-1 rounded-md bg-slate-900 border border-slate-800 text-slate-400">
                  <CheckCircle className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="mt-4">
                <h3 className="text-xl font-bold font-display text-slate-100">
                  {stats.conversions.toLocaleString()}
                </h3>

                <div className="mt-3 flex items-center justify-between">
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold border ${getStatusPacingDetails(goalsData.conversions.status).color}`}>
                    {getStatusPacingDetails(goalsData.conversions.status).text}
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono">Progress: {Math.round(goalsData.conversions.progress)}%</span>
                </div>

                {/* Goal Track */}
                <div className="w-full h-1 bg-slate-950 rounded-full overflow-hidden mt-2">
                  <div 
                    className={`h-full rounded-full ${getStatusPacingDetails(goalsData.conversions.status).progressColor}`} 
                    style={{ width: `${goalsData.conversions.progress}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[8px] text-slate-500 font-mono mt-1">
                  <span>Actual: {stats.conversions}</span>
                  <span>Goal: {goalsData.conversions.goal}</span>
                </div>
              </div>
            </div>

            {/* KPI Cost Per Lead (CPL) */}
            <div className="p-4 rounded-xl bg-slate-900/15 border border-slate-900 flex flex-col justify-between hover:border-slate-800/80 transition-colors duration-200 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-medium text-slate-500 tracking-wider font-mono">COST PER LEAD (CPL)</span>
                <span className="p-1 rounded-md bg-slate-900 border border-slate-800 text-slate-400">
                  <Target className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="mt-4">
                <h3 className="text-xl font-bold font-display text-slate-100">
                  ${stats.cpl.toFixed(2)}
                </h3>

                <div className="mt-3 flex items-center justify-between">
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold border ${getStatusPacingDetails(goalsData.cpl.status).color}`}>
                    {getStatusPacingDetails(goalsData.cpl.status).text}
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono">Efficiency</span>
                </div>

                {/* Goal Track */}
                <div className="w-full h-1 bg-slate-950 rounded-full overflow-hidden mt-2">
                  <div 
                    className={`h-full rounded-full ${getStatusPacingDetails(goalsData.cpl.status).progressColor}`} 
                    style={{ width: `${goalsData.cpl.progress}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[8px] text-slate-500 font-mono mt-1">
                  <span>Actual: ${stats.cpl.toFixed(1)}</span>
                  <span>Target: {goalsData.cpl.label}</span>
                </div>
              </div>
            </div>

            {/* KPI ROAS */}
            <div className="p-4 rounded-xl bg-slate-900/15 border border-slate-900 flex flex-col justify-between hover:border-slate-800/80 transition-colors duration-200 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-medium text-slate-500 tracking-wider font-mono">AD RETURN (ROAS)</span>
                <span className="p-1 rounded-md bg-slate-900 border border-slate-800 text-slate-400">
                  <Percent className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="mt-4">
                <h3 className="text-xl font-bold font-display text-slate-100">
                  {stats.roas.toFixed(2)}x
                </h3>

                <div className="mt-3 flex items-center justify-between">
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold border ${getStatusPacingDetails(goalsData.roas.status).color}`}>
                    {getStatusPacingDetails(goalsData.roas.status).text}
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono">Ratio: {stats.roas.toFixed(1)}x</span>
                </div>

                {/* Goal Track */}
                <div className="w-full h-1 bg-slate-950 rounded-full overflow-hidden mt-2">
                  <div 
                    className={`h-full rounded-full ${getStatusPacingDetails(goalsData.roas.status).progressColor}`} 
                    style={{ width: `${goalsData.roas.progress}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[8px] text-slate-500 font-mono mt-1">
                  <span>Actual: {stats.roas.toFixed(1)}x</span>
                  <span>Target: {goalsData.roas.label}</span>
                </div>
              </div>
            </div>

            {/* KPI Avg CTR */}
            <div className="p-4 rounded-xl bg-slate-900/15 border border-slate-900 flex flex-col justify-between hover:border-slate-800/80 transition-colors duration-200 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-medium text-slate-500 tracking-wider font-mono">AVG CTR</span>
                <span className="p-1 rounded-md bg-slate-900 border border-slate-800 text-slate-400">
                  <MousePointerClick className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="mt-4">
                <h3 className="text-xl font-bold font-display text-slate-100">
                  {stats.ctr.toFixed(2)}%
                </h3>

                <div className="mt-3 flex items-center justify-between">
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold border ${getStatusPacingDetails(goalsData.ctr.status).color}`}>
                    {getStatusPacingDetails(goalsData.ctr.status).text}
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono">Quality Score</span>
                </div>

                {/* Goal Track */}
                <div className="w-full h-1 bg-slate-950 rounded-full overflow-hidden mt-2">
                  <div 
                    className={`h-full rounded-full ${getStatusPacingDetails(goalsData.ctr.status).progressColor}`} 
                    style={{ width: `${goalsData.ctr.progress}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[8px] text-slate-500 font-mono mt-1">
                  <span>Actual: {stats.ctr.toFixed(2)}%</span>
                  <span>Target: {goalsData.ctr.label}</span>
                </div>
              </div>
            </div>

            {/* KPI Saved Reporting Hours */}
            <div className="p-4 rounded-xl bg-slate-900/15 border border-slate-900 flex flex-col justify-between hover:border-slate-800/80 transition-colors duration-200 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-medium text-slate-500 tracking-wider font-mono">SAVED TIME</span>
                <span className="p-1 rounded-md bg-slate-900 border border-slate-800 text-slate-400">
                  <Hourglass className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="mt-4">
                <h3 className="text-xl font-bold font-display text-slate-100">
                  {stats.savedHours} hrs
                </h3>

                <div className="mt-3 flex items-center justify-between">
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold border ${getStatusPacingDetails(goalsData.savedHours.status).color}`}>
                    {getStatusPacingDetails(goalsData.savedHours.status).text}
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono">100% Auto</span>
                </div>

                {/* Goal Track */}
                <div className="w-full h-1 bg-slate-950 rounded-full overflow-hidden mt-2">
                  <div 
                    className={`h-full rounded-full ${getStatusPacingDetails(goalsData.savedHours.status).progressColor}`} 
                    style={{ width: `${goalsData.savedHours.progress}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[8px] text-slate-500 font-mono mt-1">
                  <span>Actual: {stats.savedHours} hrs</span>
                  <span>Goal: {goalsData.savedHours.label}</span>
                </div>
              </div>
            </div>

          </div>

          {/* Section 2: Interactive Trend Graph & Channel Breakdown (Side-by-Side Grid) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Chart Area */}
            <div className="lg:col-span-2 p-6 rounded-xl bg-slate-900/10 border border-slate-900 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-900/60">
                <div className="text-left">
                  <h3 className="text-xs font-bold text-slate-200 font-display uppercase tracking-wider">
                    Paid Campaign Performance Trend
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Visualizing daily spend scaling versus raw customer conversions for the selected period.
                  </p>
                </div>
                
                {/* Legend Indicator */}
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-violet-500 rounded-full inline-block"></span>
                    <span className="text-slate-400">Daily Spend ($)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 bg-violet-400/45 rounded inline-block"></span>
                    <span className="text-slate-400">Conversions</span>
                  </div>
                </div>
              </div>

              {/* Performance Charts Area using responsive pure SVGs for elite fidelity and iframe durability */}
              <div className="relative h-56 w-full">
                {filteredMetrics.length > 0 ? (
                  <svg className="w-full h-full" viewBox="0 0 600 180" preserveAspectRatio="none">
                    {/* Grid Lines */}
                    <line x1="25" y1="25" x2="575" y2="25" stroke="#131b2e" strokeWidth="0.5" strokeDasharray="3 3" />
                    <line x1="25" y1="70" x2="575" y2="70" stroke="#131b2e" strokeWidth="0.5" strokeDasharray="3 3" />
                    <line x1="25" y1="115" x2="575" y2="115" stroke="#131b2e" strokeWidth="0.5" strokeDasharray="3 3" />
                    <line x1="25" y1="155" x2="575" y2="155" stroke="#1e293b" strokeWidth="1" />

                    {/* Bars (Conversions Chart) */}
                    {chartCoordinates.barPoints.map((bar, idx) => (
                      <rect
                         key={`bar-${idx}`}
                        x={bar.x}
                        y={bar.y}
                        width={bar.width}
                        height={bar.height}
                        fill="#8b5cf6"
                        fillOpacity="0.15"
                        className="hover:fill-opacity-40 transition-all cursor-pointer duration-200"
                        onMouseEnter={(e) => {
                          const bbox = e.currentTarget.getBoundingClientRect();
                          setHoveredPoint({
                            x: bbox.left,
                            y: bbox.top - 40,
                            label: `${formatDisplayDate(bar.data.date)} - Conversions`,
                            value: `${bar.data.conversions} Leads`
                          });
                        }}
                        onMouseLeave={() => setHoveredPoint(null)}
                      />
                    ))}

                    {/* Line Path (Spend Chart) */}
                    <polyline
                      fill="none"
                      stroke="#8b5cf6"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      points={chartCoordinates.linePoints}
                    />

                    {/* Line Points circles for hover interaction */}
                    {chartCoordinates.rawPoints?.map((p, idx) => (
                      <circle
                        key={`point-${idx}`}
                        cx={p.x}
                        cy={p.y}
                        r="3.5"
                        fill="#0b0f19"
                        stroke="#8b5cf6"
                        strokeWidth="2"
                        className="hover:r-5 hover:fill-violet-400 transition-all cursor-pointer duration-150"
                        onMouseEnter={(e) => {
                          const bbox = e.currentTarget.getBoundingClientRect();
                          setHoveredPoint({
                            x: bbox.left,
                            y: bbox.top - 40,
                            label: `${formatDisplayDate(p.data.date)} - Spend`,
                            value: `$${p.data.spend.toFixed(2)}`
                          });
                        }}
                        onMouseLeave={() => setHoveredPoint(null)}
                      />
                    ))}

                    {/* Y-Axis Value Labels */}
                    <text x="5" y="30" fill="#475569" className="text-[7px] font-mono">Max</text>
                    <text x="5" y="90" fill="#475569" className="text-[7px] font-mono">Mid</text>
                    <text x="5" y="152" fill="#475569" className="text-[7px] font-mono">$0</text>

                    {/* X-Axis labels for dates */}
                    <text x="25" y="172" fill="#475569" className="text-[8px] font-mono">
                      {formatDisplayDate(filteredMetrics[0]?.date)}
                    </text>
                    <text x="280" y="172" fill="#475569" className="text-[8px] font-mono text-center">
                      Mid-Period
                    </text>
                    <text x="510" y="172" fill="#475569" className="text-[8px] font-mono">
                      {formatDisplayDate(filteredMetrics[filteredMetrics.length - 1]?.date)}
                    </text>
                  </svg>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-slate-950/20 border border-slate-900 rounded-xl">
                    <AlertTriangle className="w-8 h-8 text-amber-500/80 mb-2 animate-pulse" />
                    <h4 className="text-xs font-bold text-slate-300">No data available for this date range</h4>
                    <p className="text-[10px] text-slate-500 max-w-xs mt-1">
                      Try selecting a different date range or preset from the header calendar.
                    </p>
                  </div>
                )}

                {/* Dynamic hover tooltip window */}
                {hoveredPoint && (
                  <div 
                    className="fixed bg-slate-950 border border-slate-800 text-slate-100 p-2.5 rounded shadow-2xl z-50 text-xs pointer-events-none text-left"
                    style={{ left: `${hoveredPoint.x}px`, top: `${hoveredPoint.y}px` }}
                  >
                    <div className="font-semibold text-[9px] text-slate-500 uppercase tracking-wider">{hoveredPoint.label}</div>
                    <div className="font-bold text-violet-400 mt-0.5">{hoveredPoint.value}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Side: Channel breakdown side by side comparison */}
            <div className="p-6 rounded-xl bg-slate-900/10 border border-slate-900 space-y-4 flex flex-col justify-between">
              <div className="text-left">
                <h3 className="text-xs font-bold text-slate-200 font-display uppercase tracking-wider">
                  Cross-Channel Share of Wallet
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Comparative performance and budget split across active connected networks.
                </p>
              </div>

              <div className="space-y-4 flex-1 mt-2">
                {channelBreakdown.map((chan) => {
                  return (
                    <div 
                      key={chan.label} 
                      className={`p-3.5 rounded-lg border text-left transition-all duration-200 ${
                        chan.active 
                          ? "bg-slate-950/40 border-slate-900" 
                          : "bg-slate-950/10 border-slate-950/40 opacity-40 select-none"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${chan.active ? "bg-emerald-500 animate-pulse" : "bg-slate-700"}`}></span>
                          <span className="text-xs font-bold text-slate-200">{chan.label}</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500">
                          {chan.active ? `${Math.round(chan.share)}% budget split` : "Not Configured"}
                        </span>
                      </div>

                      {chan.active ? (
                        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                          <div>
                            <span className="text-[10px] text-slate-500 font-medium">SPEND</span>
                            <p className="font-mono font-semibold text-slate-300">
                              ${Math.round(chan.spend).toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 font-medium">CONVERSIONS</span>
                            <p className="font-mono font-semibold text-slate-300">
                              {chan.conversions.toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 font-medium">CPL (LEAD)</span>
                            <p className="font-mono font-semibold text-emerald-400">
                              ${chan.cpl.toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 font-medium">ROAS</span>
                            <p className="font-mono font-semibold text-violet-400">
                              {chan.roas.toFixed(2)}x
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-600 mt-2 italic">
                          No active integrations found for this channel.
                        </p>
                      )}

                      {chan.active && (
                        <div className="mt-3.5">
                          <div className="w-full h-1 bg-slate-950 rounded-full overflow-hidden">
                            <div className={`h-full bg-gradient-to-r ${chan.color}`} style={{ width: `${chan.share}%` }}></div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="p-3 bg-slate-900/10 border border-slate-900/60 rounded-lg flex items-center justify-between text-left">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-violet-400 shrink-0" />
                  <div>
                    <h5 className="text-[9px] font-mono text-slate-500 uppercase">Integrations Cache</h5>
                    <p className="text-xs text-slate-300 font-semibold">Automatic 1-click hooks</p>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Section 3: Dimension Filter Popover / Row */}
          <div className="p-4 rounded-xl bg-slate-900/20 border border-slate-900/80 flex flex-col md:flex-row items-center gap-4 text-left">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 shrink-0">
              <SlidersHorizontal className="w-3.5 h-3.5 text-violet-400" />
              <span>DIMENSIONS FILTER</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
              <div className="flex flex-col">
                <label className="text-[10px] font-mono tracking-widest text-slate-500 uppercase mb-1">Dimension</label>
                <select 
                  value={selectedDimension}
                  onChange={(e) => setSelectedDimension(e.target.value)}
                  className="bg-slate-950 border border-slate-800/80 text-slate-300 rounded-lg p-2 text-xs focus:ring-1 focus:ring-violet-500 outline-none"
                >
                  <option value="All">All Campaign Dimensions</option>
                  <option value="Country">Filter by Country</option>
                </select>
              </div>

              <div className="flex flex-col">
                <label className="text-[10px] font-mono tracking-widest text-slate-500 uppercase mb-1">Campaign Type</label>
                <select 
                  value={selectedCampaignType}
                  onChange={(e) => setSelectedCampaignType(e.target.value)}
                  className="bg-slate-950 border border-slate-800/80 text-slate-300 rounded-lg p-2 text-xs focus:ring-1 focus:ring-violet-500 outline-none"
                >
                  <option value="All">All Campaign Types</option>
                  <option value="Search">Search Campaigns</option>
                  <option value="Display">Display Retargeting</option>
                </select>
              </div>

              <div className="flex flex-col">
                <label className="text-[10px] font-mono tracking-widest text-slate-500 uppercase mb-1">UTM Source</label>
                <select 
                  value={selectedSource}
                  onChange={(e) => setSelectedSource(e.target.value)}
                  className="bg-slate-950 border border-slate-800/80 text-slate-300 rounded-lg p-2 text-xs focus:ring-1 focus:ring-violet-500 outline-none"
                >
                  <option value="All">All UTM Sources</option>
                  <option value="Organic">Organic Search</option>
                  <option value="Paid ads">Paid Platforms</option>
                </select>
              </div>
            </div>

            <button 
              onClick={handleResetFilters}
              className="px-4 py-2 bg-slate-950 hover:bg-slate-900 border border-slate-800/80 text-slate-400 hover:text-slate-200 rounded-lg text-xs font-semibold cursor-pointer shrink-0 transition-colors h-9 flex items-center justify-center"
            >
              Reset Filters
            </button>
          </div>

          {/* Section 4: Campaigns Performance Table vs Regional Traffic Table tabbed container */}
          <div className="p-6 rounded-xl bg-slate-900/10 border border-slate-900 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              
              {/* Tab Selector */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-lg border border-slate-900/80 self-start">
                <button
                  onClick={() => {
                    setActiveTableTab("campaigns");
                    setTableSearch("");
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTableTab === "campaigns"
                      ? "bg-slate-900 text-slate-100 border border-slate-800"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Briefcase className="w-3.5 h-3.5" />
                  <span>Campaign Performance</span>
                </button>
                <button
                  onClick={() => {
                    setActiveTableTab("regions");
                    setTableSearch("");
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTableTab === "regions"
                      ? "bg-slate-900 text-slate-100 border border-slate-800"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Regional Traffic</span>
                </button>
              </div>

              {/* Selection action toolbar */}
              {((activeTableTab === "regions" && selectedRows.length > 0) || (activeTableTab === "campaigns" && selectedCampaignRows.length > 0)) ? (
                <div className="flex items-center gap-2 p-1 bg-violet-950/20 border border-violet-500/20 rounded-lg animate-fade-in shrink-0">
                  <span className="text-xs text-violet-300 px-2 font-medium">
                    {activeTableTab === "regions" ? selectedRows.length : selectedCampaignRows.length} item(s) selected
                  </span>
                  <button
                    onClick={handleBulkExport}
                    className="px-2.5 py-1 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-md transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" /> Export
                  </button>
                  <button
                    disabled
                    className="px-2.5 py-1 bg-slate-950/40 text-slate-600 text-xs font-semibold rounded-md cursor-not-allowed"
                    title="Exclusions feature coming soon"
                  >
                    Exclude (Coming Soon)
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  {/* Search bar */}
                  <div className="relative flex-1 sm:flex-initial">
                    <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder={activeTableTab === "campaigns" ? "Search campaigns..." : "Search country..."}
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-lg pl-8 pr-3 py-2 w-full sm:w-48 focus:ring-1 focus:ring-violet-500 outline-none placeholder:text-slate-600"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Render Tab Content */}
            {activeTableTab === "campaigns" ? (
              <div className="space-y-4">
                <div className="overflow-x-auto rounded-lg border border-slate-900/80">
                  <table className="w-full text-left text-xs text-slate-400 border-collapse">
                    <thead className="bg-slate-950 text-slate-500 uppercase tracking-widest text-[9px] font-mono border-b border-slate-900">
                      <tr>
                        <th className="p-4 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={selectedCampaignRows.length === filteredCampaigns.length && filteredCampaigns.length > 0}
                            onChange={handleSelectAllCampaignRows}
                            className="rounded border-slate-800 text-violet-600 focus:ring-violet-500 bg-slate-950 cursor-pointer"
                          />
                        </th>
                        <th className="p-4">Campaign Hierarchy</th>
                        <th className="p-4">Platform</th>
                        <th className="p-4">Status</th>
                        <th className="p-4 text-right">Ad Spend</th>
                        <th className="p-4 text-right">Impressions</th>
                        <th className="p-4 text-right">Clicks</th>
                        <th className="p-4 text-center">Conversions</th>
                        <th className="p-4 text-right">CPL</th>
                        <th className="p-4 text-right">ROAS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900 bg-slate-950/20">
                      {filteredCampaigns.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="p-8 text-center text-slate-500">
                            No campaigns matching search query.
                          </td>
                        </tr>
                      ) : (
                        filteredCampaigns.map((camp) => {
                          const isChecked = selectedCampaignRows.includes(camp.id);
                          
                          // Determine status icon and color
                          const statusConfig = {
                            "Active": { label: "Active", bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: Play },
                            "Paused": { label: "Paused", bg: "bg-slate-800 text-slate-400 border-slate-700", icon: Pause },
                            "Needs Review": { label: "Needs Review", bg: "bg-amber-500/10 text-amber-400 border-amber-500/20", icon: AlertTriangle }
                          }[camp.status];

                          return (
                            <tr 
                              key={camp.id}
                              className={`hover:bg-slate-900/30 transition-colors duration-150 ${isChecked ? "bg-violet-950/5" : ""}`}
                            >
                              <td className="p-4 text-center">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleSelectCampaignRow(camp.id)}
                                  className="rounded border-slate-800 text-violet-600 focus:ring-violet-500 bg-slate-950 cursor-pointer"
                                />
                              </td>
                              <td className="p-4 font-semibold text-slate-200">
                                {camp.name}
                              </td>
                              <td className="p-4 font-medium text-slate-400">
                                {camp.platform}
                              </td>
                              <td className="p-4">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold border ${statusConfig.bg}`}>
                                  <statusConfig.icon className="w-2.5 h-2.5 shrink-0" />
                                  {statusConfig.label}
                                </span>
                              </td>
                              <td className="p-4 text-right font-mono text-slate-300 font-semibold">
                                ${camp.spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="p-4 text-right font-mono text-slate-400">
                                {camp.impressions.toLocaleString()}
                              </td>
                              <td className="p-4 text-right font-mono text-slate-400">
                                {camp.clicks.toLocaleString()}
                              </td>
                              <td className="p-4 text-center font-mono text-slate-300">
                                {camp.conversions.toLocaleString()}
                              </td>
                              <td className="p-4 text-right font-mono text-emerald-400 font-semibold">
                                ${camp.cpl.toFixed(2)}
                              </td>
                              <td className="p-4 text-right font-mono text-violet-400 font-semibold">
                                {camp.roas.toFixed(2)}x
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              // Regional Traffic tab view
              <div className="space-y-4">
                {/* Filter Tabs matching screenshots */}
                <div className="flex flex-wrap items-center border-b border-slate-900/60 pb-1 gap-1">
                  {(["All", "Organic", "Invalid", "Referrals", "Direct", "Social"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTrafficTab(tab)}
                      className={`px-3 py-2 text-xs font-medium border-b-2 cursor-pointer transition-colors ${
                        activeTrafficTab === tab
                          ? "border-violet-500 text-violet-400"
                          : "border-transparent text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-900/80">
                  <table className="w-full text-left text-xs text-slate-400 border-collapse">
                    <thead className="bg-slate-950 text-slate-500 uppercase tracking-widest text-[9px] font-mono border-b border-slate-900">
                      <tr>
                        <th className="p-4 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={selectedRows.length === filteredCountryTraffic.length && filteredCountryTraffic.length > 0}
                            onChange={handleSelectAllRows}
                            className="rounded border-slate-800 text-violet-600 focus:ring-violet-500 bg-slate-950 cursor-pointer"
                          />
                        </th>
                        <th className="p-4">Countries</th>
                        <th className="p-4">Time on Page</th>
                        <th className="p-4">Page Views</th>
                        <th className="p-4">Bounce Rate</th>
                        <th className="p-4 text-center">Conv. Rate</th>
                        <th className="p-4 text-right">Totals Views</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900 bg-slate-950/20">
                      {filteredCountryTraffic.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-500">
                            No traffic records found matching your dimension constraints.
                          </td>
                        </tr>
                      ) : (
                        filteredCountryTraffic.map((item) => {
                          const isChecked = selectedRows.includes(item.country);
                          return (
                            <tr 
                              key={item.country} 
                              className={`hover:bg-slate-900/30 transition-colors duration-150 ${isChecked ? "bg-violet-950/5" : ""}`}
                            >
                              <td className="p-4 text-center">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleSelectRow(item.country)}
                                  className="rounded border-slate-800 text-violet-600 focus:ring-violet-500 bg-slate-950 cursor-pointer"
                                />
                              </td>
                              <td className="p-4 font-semibold text-slate-200 flex items-center gap-2">
                                <span className="text-base select-none">{item.flag}</span>
                                <span>{item.country}</span>
                              </td>
                              <td className="p-4 font-mono text-slate-400">{item.timeOnPage}</td>
                              <td className="p-4 font-mono">{(item.views / 12).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                              <td className="p-4 font-mono text-slate-400">{item.bounceRate}</td>
                              <td className="p-4 text-center font-mono font-medium text-emerald-400">
                                {item.conversionRate}
                              </td>
                              <td className="p-4 text-right font-mono text-slate-300 font-semibold">
                                {item.views.toLocaleString()}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
