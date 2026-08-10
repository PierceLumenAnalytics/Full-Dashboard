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
  clients?: ClientAccount[] | null;
  dateRange: DateRange;
  compareRange?: { startDate: string; endDate: string } | null;
  isClientView?: boolean;
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
  addToast: (title: string, description?: string, type?: "success" | "error" | "warning" | "info") => void;
  customCta?: string | null;
  profile?: any;
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

export default function Overview({ 
  selectedClient, 
  clients = [],
  dateRange, 
  compareRange = null,
  isClientView = false,
  onRefresh, 
  isRefreshing, 
  addToast, 
  customCta, 
  profile 
}: OverviewProps) {
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);

  // Filter metrics based on selected date range
  const filteredMetrics = useMemo(() => {
    return metrics.filter(m => m.date >= dateRange.startDate && m.date <= dateRange.endDate);
  }, [metrics, dateRange]);

  const compareFilteredMetrics = useMemo(() => {
    if (!compareRange) return [];
    return metrics.filter(m => m.date >= compareRange.startDate && m.date <= compareRange.endDate);
  }, [metrics, compareRange]);

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

  // Calculate date range duration in days
  const daysInRange = useMemo(() => {
    if (dateRange && dateRange.startDate && dateRange.endDate) {
      const start = new Date(dateRange.startDate);
      const end = new Date(dateRange.endDate);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }
    return 30; // default to a month
  }, [dateRange]);

  const compareStats = useMemo(() => {
    if (compareFilteredMetrics.length === 0) return { spend: 0, clicks: 0, conversions: 0, impressions: 0, ctr: 0, cr: 0, cpc: 0, savedHours: 0, cpl: 0, roas: 0 };
    
    const spend = compareFilteredMetrics.reduce((acc, m) => acc + m.spend, 0);
    const clicks = compareFilteredMetrics.reduce((acc, m) => acc + m.clicks, 0);
    const conversions = compareFilteredMetrics.reduce((acc, m) => acc + m.conversions, 0);
    const impressions = compareFilteredMetrics.reduce((acc, m) => acc + m.impressions, 0);
    
    const cpl = conversions > 0 ? spend / conversions : 0;
    const roas = spend > 0 ? (conversions * 150) / spend : 0;

    return {
      spend,
      clicks,
      conversions,
      impressions,
      ctr: (clicks / impressions) * 100,
      cr: (conversions / clicks) * 100,
      cpc: spend / clicks,
      savedHours: 0,
      cpl,
      roas
    };
  }, [compareFilteredMetrics]);

  const getDeltaValue = (current: number, compare: number, lowerIsBetter = false) => {
    if (!compare || compare === 0) return null;
    const pct = ((current - compare) / compare) * 100;
    const isPositive = pct > 0;
    const isGood = lowerIsBetter ? !isPositive : isPositive;
    return {
      text: `${isPositive ? "↑" : "↓"} ${Math.abs(pct).toFixed(1)}% vs last period`,
      color: isGood ? "text-[#4ADE80]/80" : "text-[#F87171]/80",
      isGood
    };
  };

  const greeting = useMemo(() => {
    const hr = new Date().getHours();
    let name = "Pierce";
    if (profile?.agencyName) {
      name = profile.agencyName.split(" ")[0];
    } else if (profile?.email) {
      const parts = profile.email.split("@")[0].split(".");
      name = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    }
    if (hr < 12) return `Good morning, ${name}.`;
    if (hr < 17) return `Good afternoon, ${name}.`;
    return `Good evening, ${name}.`;
  }, [profile]);

  // Calculated KPI Aggregates
  const stats = useMemo(() => {
    if (filteredMetrics.length === 0) return { spend: 0, clicks: 0, conversions: 0, impressions: 0, ctr: 0, cr: 0, cpc: 0, savedHours: 0, cpl: 0, roas: 0 };
    
    const spend = filteredMetrics.reduce((acc, m) => acc + m.spend, 0);
    const clicks = filteredMetrics.reduce((acc, m) => acc + m.clicks, 0);
    const conversions = filteredMetrics.reduce((acc, m) => acc + m.conversions, 0);
    const impressions = filteredMetrics.reduce((acc, m) => acc + m.impressions, 0);
    
    const budgetFactor = (selectedClient?.monthlyBudget || 10000) / 10000;
    const savedHours = Math.round(15 * budgetFactor * (daysInRange / 30) * 10) / 10;

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
  }, [filteredMetrics, selectedClient, daysInRange]);

  // Goal Tracker Calculations (Monthly Goals vs Actual Performance)
  const goalsData = useMemo(() => {
    const monthlyBudget = selectedClient?.monthlyBudget || 10000;
    const timeRatio = daysInRange / 30;
    
    // Total Spend Goal (scaled to range duration)
    const spendGoal = Math.round(monthlyBudget * timeRatio);
    const spendProgress = Math.min((stats.spend / spendGoal) * 100, 100);
    let spendStatus: "on_track" | "warning" | "danger" = "on_track";
    if (spendProgress < 50) spendStatus = "danger";
    else if (spendProgress < 75) spendStatus = "warning";

    // Conversions Goal (scaled to range duration, target CPA $40)
    const conversionGoal = Math.max(1, Math.round((monthlyBudget / 40) * timeRatio));
    const conversionProgress = Math.min((stats.conversions / conversionGoal) * 100, 100);
    let conversionStatus: "on_track" | "warning" | "danger" = "on_track";
    if (conversionProgress < 50) conversionStatus = "danger";
    else if (conversionProgress < 75) conversionStatus = "warning";

    // Cost Per Lead (CPL) Goal - Lower is better! Target CPL is $40
    const cplGoal = 40.0;
    const cplProgress = stats.cpl > 0 ? Math.min((cplGoal / stats.cpl) * 100, 100) : 0;
    let cplStatus: "on_track" | "warning" | "danger" = "on_track";
    if (cplProgress < 50) cplStatus = "danger";
    else if (cplProgress < 75) cplStatus = "warning";

    // Return on Ad Spend (ROAS) Goal - Higher is better! Target is 3.5x
    const roasGoal = 3.5;
    const roasProgress = Math.min((stats.roas / roasGoal) * 100, 100);
    let roasStatus: "on_track" | "warning" | "danger" = "on_track";
    if (stats.roas < roasGoal * 0.8) roasStatus = "danger";
    else if (stats.roas < roasGoal) roasStatus = "warning";

    // Average CTR Goal - Target is 2.5% (5% buffer before flagging warning)
    const ctrGoal = 2.5;
    const ctrProgress = Math.min((stats.ctr / ctrGoal) * 100, 100);
    let ctrStatus: "on_track" | "warning" | "danger" = "on_track";
    if (stats.ctr < ctrGoal * 0.75) ctrStatus = "danger";
    else if (stats.ctr < ctrGoal * 0.95) ctrStatus = "warning";

    // Saved Reporting Hours Goal (scaled to range duration)
    const savedHoursGoal = Math.max(1, Math.round(15 * timeRatio));
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
  }, [stats, selectedClient, daysInRange]);

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

  const handleExportPDF = async () => {
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
      <div style="border-bottom: 2px solid ${profile?.primaryColor || '#6d28d9'}; padding-bottom: 16px; margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-end;">
          <div>
            <div style="font-size: 22px; font-weight: 800; color: #1e1b4b; letter-spacing: -0.5px;">${profile?.agencyName || 'Lumen Analytics'} Report</div>
            <div style="font-size: 9px; text-transform: uppercase; font-weight: 700; color: ${profile?.primaryColor || '#6d28d9'}; margin-top: 3px; letter-spacing: 1px;">EXECUTIVE PERFORMANCE DASHBOARD</div>
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
    const originalChartSvg = document.getElementById("performance-trend-chart-svg");
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
        polyline.setAttribute("stroke", profile?.primaryColor || "#6d28d9");
      });
      clonedSvg.querySelectorAll("circle").forEach((circle) => {
        circle.setAttribute("stroke", profile?.primaryColor || "#6d28d9");
        circle.setAttribute("fill", "#ffffff");
      });
      clonedSvg.querySelectorAll("rect").forEach((rect) => {
        rect.setAttribute("fill", profile?.primaryColor || "#a78bfa");
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

    // Custom CTA Block for PDF report
    const ctaHtml = (customCta && customCta.trim() !== "") ? `
      <div style="padding: 12px 16px; border: 1px solid ${(profile?.primaryColor || '#6d28d9')}33; border-radius: 8px; background-color: #f8fafc; margin-bottom: 20px;">
        <div style="font-size: 8px; font-weight: 700; color: ${profile?.primaryColor || '#6d28d9'}; text-transform: uppercase; letter-spacing: 0.5px;">Agency Message</div>
        <div style="font-size: 11px; font-weight: 500; color: #1e293b; margin-top: 4px; line-height: 1.45;">${customCta}</div>
      </div>
    ` : "";

    element.innerHTML = `${headerHtml}${ctaHtml}${kpisHtml}${chartHtml}${channelsHtml}`;

    const fileName = `${selectedClient.name.replace(/\s+/g, '_')}_Dashboard_Overview_${dateRange.startDate}_to_${dateRange.endDate}.pdf`;

    let iframe: HTMLIFrameElement | null = null;
    try {
      addToast("Exporting PDF", "Generating your executive performance overview PDF...", "info");
      
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
      addToast("Export Successful", "Dashboard Overview PDF downloaded successfully.", "success");
    } catch (err: any) {
      if (iframe && document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
      console.error(err);
      addToast("Export Failed", "Could not generate PDF: " + err.message, "error");
    }
  };

  // Custom Line and Bar Chart helper calculation (Responsive SVGs)
  const chartCoordinates = useMemo(() => {
    if (filteredMetrics.length === 0) return { linePoints: "", barPoints: [], areaPoints: "" };
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
      return { linePoints, barPoints, rawPoints: points, areaPoints: "" };
    }

    const maxSpend = Math.max(...filteredMetrics.map(m => m.spend)) * 1.1 || 1;
    const points = filteredMetrics.map((m, index) => {
      const x = padding + (index * (width - padding * 2)) / (filteredMetrics.length - 1);
      const y = height - padding - (m.spend * (height - padding * 2)) / maxSpend;
      return { x, y, data: m };
    });

    const linePoints = points.map(p => `${p.x},${p.y}`).join(" ");
    const areaPoints = points.length > 0
      ? `${points[0].x},155 ` + points.map(p => `${p.x},${p.y}`).join(" ") + ` ${points[points.length - 1].x},155`
      : "";

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

    return { linePoints, barPoints, rawPoints: points, areaPoints };
  }, [filteredMetrics]);

  // Utility to get pacing text and colors
  const getStatusPacingDetails = (status: "on_track" | "warning" | "danger") => {
    switch (status) {
      case "on_track":
        return { text: "On Track", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", progressColor: "bg-emerald-400/80" };
      case "warning":
        return { text: "Behind", color: "text-amber-400 bg-amber-500/10 border-amber-500/20", progressColor: "bg-amber-400/80" };
      case "danger":
        return { text: "Significantly Behind", color: "text-rose-400 bg-rose-500/10 border-rose-500/20", progressColor: "bg-rose-500/70" };
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-5 text-left">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#F5F3EE] font-display">
            {greeting}
          </h2>
          <p className="text-sm text-[#8A8680] mt-1">
            Your clients' performance at a glance.
          </p>
          <p className="text-[11px] text-[#8A8680]/60 mt-1.5 font-mono">
            Last synced 2 minutes ago · {clients?.length || 3} clients · 2 platforms
          </p>
        </div>

        <button
          onClick={handleExportPDF}
          disabled={isLoading || filteredMetrics.length === 0}
          className="px-3.5 py-2 bg-[#D6B77A] hover:bg-[#bfa063] border border-[#D6B77A] text-[#080808] text-xs font-semibold rounded-md cursor-pointer transition-colors flex items-center gap-1.5 shrink-0"
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
          title="Download full dashboard PDF report"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Overview as PDF</span>
        </button>
      </div>

      {/* Skeletons Loading View */}
      {isLoading ? (
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-[#101010] rounded-lg border border-white/5"></div>
            ))}
          </div>
          <div className="h-80 bg-[#101010] rounded-lg border border-white/5"></div>
          <div className="h-64 bg-[#101010] rounded-lg border border-white/5"></div>
        </div>
      ) : error ? (
        <div className="p-8 text-center bg-[#101010] rounded-lg border border-white/5 text-[#F87171]/70">
          <p className="font-semibold text-[#F87171]">Error fetching client analytics data</p>
          <p className="text-xs text-[#8A8680] mt-1">{error}</p>
          <button 
            onClick={onRefresh}
            className="mt-4 px-4 py-2 bg-[#D6B77A] hover:bg-[#bfa063] text-[#080808] rounded-md text-sm transition-colors cursor-pointer"
          >
            Retry Fetch
          </button>
        </div>
      ) : (
        <>
          {customCta && customCta.trim() !== "" && (
            <div className="p-5 rounded-lg bg-[#101010] border border-white/5 flex flex-col gap-2 animate-fade-in mb-6 text-left">
              <span className="text-[11px] font-mono tracking-widest text-[#D6B77A] uppercase font-bold">
                FROM YOUR STRATEGIST
              </span>
              <p className="text-sm text-[#F5F3EE] italic leading-relaxed">
                "{customCta}"
              </p>
              <span className="text-xs text-[#8A8680] font-medium">
                — {profile?.agencyName || "Lumen Intelligence"}
              </span>
            </div>
          )}

          {/* Section 1: KPI Grid with 4 primary cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Ad Spend Card */}
            <div className="p-5 rounded-lg bg-[#101010] border border-white/5 flex flex-col justify-between hover:border-white/10 transition-colors duration-200 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-[#8A8680] tracking-widest font-mono">AD SPEND</span>
                <span className="p-1 rounded-md bg-[#151515] border border-white/5 text-[#8A8680]">
                  <DollarSign className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="mt-4 space-y-2">
                <h3 className="text-2xl font-bold font-display text-[#F5F3EE]">
                  ${stats.spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h3>
                <div className="flex items-center justify-between text-[11px]">
                  {(() => {
                    const delta = getDeltaValue(stats.spend, compareStats.spend);
                    return delta ? (
                      <span className={`font-bold ${delta.color}`}>{delta.text}</span>
                    ) : (
                      <span className="text-[#8A8680]">--</span>
                    );
                  })()}
                  <span className="text-[#8A8680] font-mono">Goal: ${goalsData.spend.goal.toLocaleString()}</span>
                </div>
                <div className="w-full h-1 bg-[#151515] rounded-full overflow-hidden mt-1">
                  <div className="h-full rounded-full bg-[#D6B77A]" style={{ width: `${goalsData.spend.progress}%` }}></div>
                </div>
              </div>
            </div>

            {/* Conversions Card */}
            <div className="p-5 rounded-lg bg-[#101010] border border-white/5 flex flex-col justify-between hover:border-white/10 transition-colors duration-200 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-[#8A8680] tracking-widest font-mono font-sans">CONVERSIONS</span>
                <span className="p-1 rounded-md bg-[#151515] border border-white/5 text-[#8A8680]">
                  <Sparkles className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="mt-4 space-y-2">
                <h3 className="text-2xl font-bold font-display text-[#F5F3EE]">
                  {stats.conversions.toLocaleString()}
                </h3>
                <div className="flex items-center justify-between text-[11px]">
                  {(() => {
                    const delta = getDeltaValue(stats.conversions, compareStats.conversions);
                    return delta ? (
                      <span className={`font-bold ${delta.color}`}>{delta.text}</span>
                    ) : (
                      <span className="text-[#8A8680]">--</span>
                    );
                  })()}
                  <span className="text-[#8A8680] font-mono">Goal: {goalsData.conversions.goal.toLocaleString()}</span>
                </div>
                <div className="w-full h-1 bg-[#151515] rounded-full overflow-hidden mt-1">
                  <div className="h-full rounded-full bg-[#D6B77A]" style={{ width: `${goalsData.conversions.progress}%` }}></div>
                </div>
              </div>
            </div>

            {/* Cost Per Lead (CPL) Card */}
            <div className="p-5 rounded-lg bg-[#101010] border border-white/5 flex flex-col justify-between hover:border-white/10 transition-colors duration-200 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-[#8A8680] tracking-widest font-mono">COST PER LEAD (CPL)</span>
                <span className="p-1 rounded-md bg-[#151515] border border-white/5 text-[#8A8680]">
                  <Activity className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="mt-4 space-y-2">
                <h3 className="text-2xl font-bold font-display text-[#F5F3EE]">
                  ${stats.cpl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h3>
                <div className="flex items-center justify-between text-[11px]">
                  {(() => {
                    // CPL lower is better
                    const delta = getDeltaValue(stats.cpl, compareStats.cpl, true);
                    return delta ? (
                      <span className={`font-bold ${delta.color}`}>{delta.text}</span>
                    ) : (
                      <span className="text-[#8A8680]">--</span>
                    );
                  })()}
                  <span className="text-[#8A8680] font-mono">Target: $40.00</span>
                </div>
                <div className="w-full h-1 bg-[#151515] rounded-full overflow-hidden mt-1">
                  <div 
                    className="h-full rounded-full bg-[#D6B77A]" 
                    style={{ width: `${stats.cpl > 0 ? Math.min((40 / stats.cpl) * 100, 100) : 100}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* ROAS Card */}
            <div className="p-5 rounded-lg bg-[#101010] border border-white/5 flex flex-col justify-between hover:border-white/10 transition-colors duration-200 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-[#8A8680] tracking-widest font-mono">ROAS</span>
                <span className="p-1 rounded-md bg-[#151515] border border-white/5 text-[#8A8680]">
                  <TrendingUp className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="mt-4 space-y-2">
                <h3 className="text-2xl font-bold font-display text-[#F5F3EE]">
                  {stats.roas.toFixed(2)}x
                </h3>
                <div className="flex items-center justify-between text-[11px]">
                  {(() => {
                    const delta = getDeltaValue(stats.roas, compareStats.roas);
                    return delta ? (
                      <span className={`font-bold ${delta.color}`}>{delta.text}</span>
                    ) : (
                      <span className="text-[#8A8680]">--</span>
                    );
                  })()}
                  <span className="text-[#8A8680] font-mono">Target: 3.00x</span>
                </div>
                <div className="w-full h-1 bg-[#151515] rounded-full overflow-hidden mt-1">
                  <div 
                    className="h-full rounded-full bg-[#D6B77A]" 
                    style={{ width: `${Math.min((stats.roas / 3.0) * 100, 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>

          </div>

          {/* Saved Time Hero Section */}
          <div className="p-5 rounded-lg bg-[#101010] border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 text-left">
            <div className="space-y-1">
              <span className="text-[11px] font-mono tracking-widest text-[#D6B77A] uppercase font-bold">
                REPORTING TIME SAVED
              </span>
              <h3 className="text-xl font-bold text-[#F5F3EE] font-display">
                {stats.savedHours || 18} hrs this month
              </h3>
            </div>
            <div className="flex items-center gap-3 text-xs text-[#8A8680] font-mono">
              <span>Previously: ~{Math.round((stats.savedHours || 18) * 1.1) + 2} hrs manual work</span>
              <span className="text-[#D6B77A]">→</span>
              <span>Lumen: 2 hrs</span>
            </div>
          </div>

          {/* Section 2: Interactive Trend Graph & Channel Breakdown (Side-by-Side Grid) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Chart Area */}
            <div className="lg:col-span-2 p-6 rounded-lg bg-[#101010] border border-white/5 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/5">
                <div className="text-left">
                  <h3 className="text-sm font-bold text-[#F5F3EE] font-display uppercase tracking-wider">
                    Performance Over Time
                  </h3>
                  <p className="text-xs text-[#8A8680] mt-0.5">
                    Visualizing daily spend scaling versus conversions for the selected period.
                  </p>
                </div>
                
                {/* Legend Indicator */}
                <div className="flex items-center gap-4 text-xs font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-[#D6B77A] rounded-full inline-block" style={profile?.primaryColor ? { backgroundColor: profile.primaryColor } : {}}></span>
                    <span className="text-[#8A8680]">Daily Spend ($)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 bg-[#D6B77A]/20 rounded inline-block" style={profile?.primaryColor ? { backgroundColor: profile.primaryColor + '33' } : {}}></span>
                    <span className="text-[#8A8680]">Conversions</span>
                  </div>
                </div>
              </div>

              {/* Performance Charts Area using responsive pure SVGs for elite fidelity and iframe durability */}
              <div className="relative h-56 w-full">
                {filteredMetrics.length > 0 ? (
                  <svg id="performance-trend-chart-svg" className="w-full h-full animate-fade-in" viewBox="0 0 600 180" preserveAspectRatio="none">
                    {/* Gradient Defs */}
                    <defs>
                      <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={profile?.primaryColor || "#D6B77A"} stopOpacity="0.2" />
                        <stop offset="100%" stopColor={profile?.primaryColor || "#D6B77A"} stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Gradient Area Fill */}
                    {chartCoordinates.areaPoints && (
                      <polygon points={chartCoordinates.areaPoints} fill="url(#chart-gradient)" />
                    )}

                    {/* Grid Lines */}
                    <line x1="25" y1="25" x2="575" y2="25" stroke="#151515" strokeWidth="0.5" strokeDasharray="3 3" />
                    <line x1="25" y1="70" x2="575" y2="70" stroke="#151515" strokeWidth="0.5" strokeDasharray="3 3" />
                    <line x1="25" y1="115" x2="575" y2="115" stroke="#151515" strokeWidth="0.5" strokeDasharray="3 3" />
                    <line x1="25" y1="155" x2="575" y2="155" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />

                    {/* Bars (Conversions Chart) */}
                    {chartCoordinates.barPoints.map((bar, idx) => (
                      <rect
                        key={`bar-${idx}`}
                        x={bar.x}
                        y={bar.y}
                        width={bar.width}
                        height={bar.height}
                        fill={profile?.primaryColor || "#D6B77A"}
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
                      stroke={profile?.primaryColor || "#D6B77A"}
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
                        fill="#080808"
                        stroke={profile?.primaryColor || "#D6B77A"}
                        strokeWidth="2"
                        className="hover:r-5 hover:fill-[#D6B77A] transition-all cursor-pointer duration-150"
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
                    <text x="5" y="30" fill="#8A8680" className="text-[11px] font-sans">Max</text>
                    <text x="5" y="90" fill="#8A8680" className="text-[11px] font-sans">Mid</text>
                    <text x="5" y="152" fill="#8A8680" className="text-[11px] font-sans">$0</text>

                    {/* X-Axis labels for dates */}
                    <text x="25" y="172" fill="#8A8680" className="text-[11px] font-sans">
                      {formatDisplayDate(filteredMetrics[0]?.date)}
                    </text>
                    <text x="280" y="172" fill="#8A8680" className="text-[11px] font-sans text-center">
                      Mid-Period
                    </text>
                    <text x="510" y="172" fill="#8A8680" className="text-[11px] font-sans">
                      {formatDisplayDate(filteredMetrics[filteredMetrics.length - 1]?.date)}
                    </text>
                  </svg>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-[#101010]/20 border border-white/5 rounded-lg">
                    <AlertTriangle className="w-8 h-8 text-[#D6B77A] mb-2 animate-pulse" />
                    <h4 className="text-xs font-bold text-[#F5F3EE]">No data available for this date range</h4>
                    <p className="text-[11px] text-[#8A8680] max-w-xs mt-1">
                      Try selecting a different date range or preset from the header calendar.
                    </p>
                  </div>
                )}
                {hoveredPoint && (
                  <div 
                    className="fixed bg-[#151515] border border-white/10 text-[#F5F3EE] p-2.5 rounded-lg shadow-2xl z-50 text-xs pointer-events-none text-left"
                    style={{ left: `${hoveredPoint.x}px`, top: `${hoveredPoint.y}px` }}
                  >
                    <div className="font-semibold text-[10px] text-[#8A8680] uppercase tracking-wider">{hoveredPoint.label}</div>
                    <div className="font-bold text-[#D6B77A] mt-0.5">{hoveredPoint.value}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Side: Channel breakdown side by side comparison */}
            <div className="p-6 rounded-lg bg-[#101010] border border-white/5 space-y-4 flex flex-col justify-between">
              <div className="text-left">
                <h3 className="text-sm font-bold text-[#F5F3EE] font-display uppercase tracking-wider">
                  Channel Breakdown
                </h3>
                <p className="text-xs text-[#8A8680] mt-0.5">
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
                          ? "bg-[#151515] border-white/5" 
                          : "bg-white/[0.02] border-transparent opacity-40 select-none"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span 
                            className={`w-2 h-2 rounded-full ${chan.active ? "bg-[#4ADE80] animate-pulse" : "bg-white/10"}`}
                            style={chan.active && profile?.primaryColor ? { backgroundColor: profile.primaryColor } : {}}
                          ></span>
                          <span className="text-xs font-bold text-[#F5F3EE]">{chan.label}</span>
                        </div>
                        <span className="text-[10px] font-mono text-[#8A8680]">
                          {chan.active ? `${Math.round(chan.share)}% budget split` : "Not Configured"}
                        </span>
                      </div>

                      {chan.active ? (
                        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-sans">
                          <div>
                            <span className="text-[10px] text-[#8A8680] font-mono font-medium">SPEND</span>
                            <p className="font-mono font-semibold text-[#F5F3EE]">
                              ${Math.round(chan.spend).toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] text-[#8A8680] font-mono font-medium">CONVERSIONS</span>
                            <p className="font-mono font-semibold text-[#F5F3EE]">
                              {chan.conversions.toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] text-[#8A8680] font-mono font-medium">CPL</span>
                            <p className="font-mono font-semibold text-[#4ADE80]">
                              ${chan.cpl.toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] text-[#8A8680] font-mono font-medium">ROAS</span>
                            <p className="font-mono font-semibold text-[#D6B77A]">
                              {chan.roas.toFixed(2)}x
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[10px] text-[#8A8680]/60 mt-2 italic">
                          No active integrations found for this channel.
                        </p>
                      )}

                      {chan.active && (
                        <div className="mt-3.5">
                          <div className="w-full h-1 bg-[#101010] rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${profile?.primaryColor ? "" : "bg-[#D6B77A]"}`} 
                              style={profile?.primaryColor ? { 
                                width: `${chan.share}%`, 
                                backgroundColor: profile.primaryColor
                              } : { 
                                width: `${chan.share}%` 
                              }}
                            ></div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="p-3 bg-[#151515] border border-white/5 rounded-lg flex items-center justify-between text-left">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#D6B77A] shrink-0" />
                  <div>
                    <h5 className="text-[9px] font-mono text-[#8A8680] uppercase">Connected Channels</h5>
                    <p className="text-xs text-[#F5F3EE] font-semibold">Connected ad platforms</p>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Section 3: Dimension Filter Popover / Row */}
          <div className="p-4 rounded-lg bg-[#101010] border border-white/5 flex flex-col md:flex-row items-center gap-4 text-left">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#8A8680] shrink-0 font-mono">
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#D6B77A]" />
              <span>DIMENSIONS FILTER</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full font-sans">
              <div className="flex flex-col">
                <label className="text-[10px] font-mono tracking-widest text-[#8A8680] uppercase mb-1">Dimension</label>
                <select 
                  value={selectedDimension}
                  onChange={(e) => setSelectedDimension(e.target.value)}
                  className="bg-[#080808] border border-white/5 text-[#F5F3EE] rounded-md p-2 text-xs focus:border-[#D6B77A] outline-none"
                >
                  <option value="All">All Campaign Dimensions</option>
                  <option value="Country">Filter by Country</option>
                </select>
              </div>

              <div className="flex flex-col">
                <label className="text-[10px] font-mono tracking-widest text-[#8A8680] uppercase mb-1">Campaign Type</label>
                <select 
                  value={selectedCampaignType}
                  onChange={(e) => setSelectedCampaignType(e.target.value)}
                  className="bg-[#080808] border border-white/5 text-[#F5F3EE] rounded-md p-2 text-xs focus:border-[#D6B77A] outline-none"
                >
                  <option value="All">All Campaign Types</option>
                  <option value="Search">Search Campaigns</option>
                  <option value="Display">Display Retargeting</option>
                </select>
              </div>

              <div className="flex flex-col">
                <label className="text-[10px] font-mono tracking-widest text-[#8A8680] uppercase mb-1">UTM Source</label>
                <select 
                  value={selectedSource}
                  onChange={(e) => setSelectedSource(e.target.value)}
                  className="bg-[#080808] border border-white/5 text-[#F5F3EE] rounded-md p-2 text-xs focus:border-[#D6B77A] outline-none"
                >
                  <option value="All">All UTM Sources</option>
                  <option value="Organic">Organic Search</option>
                  <option value="Paid ads">Paid Platforms</option>
                </select>
              </div>
            </div>

            <button 
              onClick={handleResetFilters}
              className="px-4 py-2 bg-[#080808] hover:bg-white/5 border border-white/5 text-[#8A8680] hover:text-[#F5F3EE] rounded-md text-xs font-semibold cursor-pointer shrink-0 transition-colors h-9 flex items-center justify-center font-sans"
            >
              Reset Filters
            </button>
          </div>

          {/* Section 4: Campaigns Performance Table vs Regional Traffic Table tabbed container */}
          <div className="p-6 rounded-lg bg-[#101010] border border-white/5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              
              {/* Tab Selector */}
              <div className="flex items-center gap-1.5 p-1 bg-[#080808] rounded-md border border-white/5 self-start">
                <button
                  onClick={() => {
                    setActiveTableTab("campaigns");
                    setTableSearch("");
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 font-sans ${
                    activeTableTab === "campaigns"
                      ? "bg-[#151515] text-[#F5F3EE] border border-white/5"
                      : "text-[#8A8680] hover:text-[#F5F3EE]"
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
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 font-sans ${
                    activeTableTab === "regions"
                      ? "bg-[#151515] text-[#F5F3EE] border border-white/5"
                      : "text-[#8A8680] hover:text-[#F5F3EE]"
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Regional Traffic</span>
                </button>
              </div>

              {/* Selection action toolbar */}
              {((activeTableTab === "regions" && selectedRows.length > 0) || (activeTableTab === "campaigns" && selectedCampaignRows.length > 0)) ? (
                <div className="flex items-center gap-2 p-1 bg-white/5 border border-white/10 rounded-lg animate-fade-in shrink-0">
                  <span className="text-xs text-[#8A8680] px-2 font-medium">
                    {activeTableTab === "regions" ? selectedRows.length : selectedCampaignRows.length} item(s) selected
                  </span>
                  <button
                    onClick={handleBulkExport}
                    className="px-2.5 py-1 bg-[#D6B77A] hover:bg-[#bfa063] text-[#080808] text-xs font-semibold rounded-md transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" /> Export
                  </button>
                  <button
                    disabled
                    className="px-2.5 py-1 bg-[#151515] text-[#8A8680] text-xs font-semibold rounded-md cursor-not-allowed border border-white/5"
                    title="Exclusions feature coming soon"
                  >
                    Exclude
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  {/* Search bar */}
                  <div className="relative flex-1 sm:flex-initial">
                    <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[#8A8680]" />
                    <input
                      type="text"
                      placeholder={activeTableTab === "campaigns" ? "Search campaigns..." : "Search country..."}
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      className="bg-[#080808] border border-white/5 text-[#F5F3EE] text-xs rounded-md pl-8 pr-3 py-2 w-full sm:w-48 focus:border-[#D6B77A] outline-none placeholder:text-[#8A8680]/60 font-sans"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Render Tab Content */}
            {activeTableTab === "campaigns" ? (
              <div className="space-y-4">
                <div className="overflow-x-auto rounded-lg border border-white/5">
                  <table className="w-full text-left text-xs text-[#8A8680] border-collapse font-sans">
                    <thead className="bg-[#101010] text-[#8A8680] uppercase tracking-widest text-[10px] font-mono border-b border-white/5">
                      <tr>
                        {!isClientView && (
                          <th className="p-4 w-10 text-center">
                            <input
                              type="checkbox"
                              checked={selectedCampaignRows.length === filteredCampaigns.length && filteredCampaigns.length > 0}
                              onChange={handleSelectAllCampaignRows}
                              className="rounded border-white/10 text-[#D6B77A] focus:ring-[#D6B77A]/50 bg-[#101010] cursor-pointer"
                            />
                          </th>
                        )}
                        <th className="p-4">Campaign</th>
                        <th className="p-4">Platform</th>
                        <th className="p-4">Status</th>
                        <th className="p-4 text-right">Spend</th>
                        <th className="p-4 text-center">Leads</th>
                        <th className="p-4 text-right">CPL</th>
                        <th className="p-4 text-right">ROAS</th>
                        <th className="p-4 text-center">Trend</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 bg-[#101010]/20">
                      {filteredCampaigns.length === 0 ? (
                        <tr>
                          <td colSpan={isClientView ? 8 : 9} className="p-8 text-center text-[#8A8680]">
                            No campaigns matching search query.
                          </td>
                        </tr>
                      ) : (
                        filteredCampaigns.map((camp) => {
                          const isChecked = selectedCampaignRows.includes(camp.id);
                          
                          // Determine status icon and color
                          const statusConfig = {
                            "Active": { label: "Active", bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: Play },
                            "Paused": { label: "Paused", bg: "bg-[#151515] text-[#8A8680] border-white/5", icon: Pause },
                            "Needs Review": { label: "Needs Review", bg: "bg-amber-500/10 text-amber-400 border-amber-500/20", icon: AlertTriangle }
                          }[camp.status];

                          return (
                            <tr 
                              key={camp.id}
                              className={`hover:bg-white/5 transition-colors duration-150 ${!isClientView && isChecked ? "bg-[#D6B77A]/5" : ""}`}
                            >
                              {!isClientView && (
                                <td className="p-4 text-center">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleSelectCampaignRow(camp.id)}
                                    className="rounded border-white/10 text-[#D6B77A] focus:ring-[#D6B77A]/50 bg-[#101010] cursor-pointer"
                                  />
                                </td>
                              )}
                              <td className="py-5 px-4 font-semibold text-[#F5F3EE]">
                                {camp.name}
                              </td>
                              <td className="py-5 px-4 font-medium text-[#8A8680]">
                                {camp.platform}
                              </td>
                              <td className="py-5 px-4">
                                <span 
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${statusConfig.bg}`}
                                >
                                  <statusConfig.icon className="w-2.5 h-2.5 shrink-0" />
                                  {statusConfig.label}
                                </span>
                              </td>
                              <td className="py-5 px-4 text-right font-mono text-[#F5F3EE] font-semibold">
                                ${camp.spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-5 px-4 text-center font-mono text-[#F5F3EE]">
                                {camp.conversions.toLocaleString()}
                              </td>
                              <td className="py-5 px-4 text-right font-mono text-[#4ADE80] font-semibold">
                                ${camp.cpl.toFixed(2)}
                              </td>
                              <td className="py-5 px-4 text-right font-mono text-[#D6B77A] font-semibold">
                                {camp.roas.toFixed(2)}x
                              </td>
                              <td className="py-5 px-4 text-center font-mono font-bold text-xs">
                                {camp.roas >= 3.0 ? (
                                  <span className="text-[#4ADE80]">↑</span>
                                ) : (
                                  <span className="text-[#F87171]">↓</span>
                                )}
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
              <div className="space-y-4 font-sans">
                {/* Filter Tabs matching screenshots */}
                <div className="flex flex-wrap items-center border-b border-white/5 pb-1 gap-1">
                  {(["All", "Organic", "Invalid", "Referrals", "Direct", "Social"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTrafficTab(tab)}
                      className={`px-3 py-2 text-xs font-medium border-b-2 cursor-pointer transition-colors ${
                        activeTrafficTab === tab
                          ? "border-[#D6B77A] text-[#D6B77A]"
                          : "border-transparent text-[#8A8680] hover:text-[#F5F3EE]"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                <div className="overflow-x-auto rounded-lg border border-white/5">
                  <table className="w-full text-left text-xs text-[#8A8680] border-collapse">
                    <thead className="bg-[#101010] text-[#8A8680] uppercase tracking-widest text-[10px] font-mono border-b border-white/5">
                      <tr>
                        {!isClientView && (
                          <th className="p-4 w-10 text-center">
                            <input
                              type="checkbox"
                              checked={selectedRows.length === filteredCountryTraffic.length && filteredCountryTraffic.length > 0}
                              onChange={handleSelectAllRows}
                              className="rounded border-white/10 text-[#D6B77A] focus:ring-[#D6B77A]/50 bg-[#101010] cursor-pointer"
                            />
                          </th>
                        )}
                        <th className="p-4">Countries</th>
                        <th className="p-4">Time on Page</th>
                        <th className="p-4">Page Views</th>
                        <th className="p-4">Bounce Rate</th>
                        <th className="p-4 text-center">Conv. Rate</th>
                        <th className="p-4 text-right">Totals Views</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 bg-[#101010]/20">
                      {filteredCountryTraffic.length === 0 ? (
                        <tr>
                          <td colSpan={isClientView ? 6 : 7} className="p-8 text-center text-[#8A8680]">
                            No traffic records found matching your dimension constraints.
                          </td>
                        </tr>
                      ) : (
                        filteredCountryTraffic.map((item) => {
                          const isChecked = selectedRows.includes(item.country);
                          return (
                            <tr 
                              key={item.country} 
                              className={`hover:bg-white/5 transition-colors duration-150 ${!isClientView && isChecked ? "bg-[#D6B77A]/5" : ""}`}
                            >
                              {!isClientView && (
                                <td className="p-4 text-center">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleSelectRow(item.country)}
                                    className="rounded border-white/10 text-[#D6B77A] focus:ring-[#D6B77A]/50 bg-[#101010] cursor-pointer"
                                  />
                                </td>
                              )}
                              <td className="p-4 font-semibold text-[#F5F3EE] flex items-center gap-2">
                                <span className="text-base select-none">{item.flag}</span>
                                <span>{item.country}</span>
                              </td>
                              <td className="p-4 font-mono text-[#8A8680]">{item.timeOnPage}</td>
                              <td className="p-4 font-mono text-[#F5F3EE]">{(item.views / 12).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                              <td className="p-4 font-mono text-[#8A8680]">{item.bounceRate}</td>
                              <td className="p-4 text-center font-mono font-medium text-[#4ADE80]">
                                {item.conversionRate}
                              </td>
                              <td className="p-4 text-right font-mono text-[#F5F3EE] font-semibold">
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
