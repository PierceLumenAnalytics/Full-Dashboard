import React, { useState, useEffect, useMemo } from "react";
import Sidebar from "./Sidebar";
import Overview from "./Overview";
import ClientsManager from "./ClientsManager";
import AIDailySummary from "./AIDailySummary";
import LogsViewer from "./LogsViewer";
import AgencySettings from "./AgencySettings";
import ToastContainer, { ToastMessage } from "./Toast";
import { ClientAccount, AuditLog, ActiveTab } from "../types";
import { RefreshCw, Calendar, ChevronDown } from "lucide-react";
import { DateRange, getPresetRange, formatDisplayDate, getCompareRange } from "../utils/dateHelpers";
import ReportsPage from "./ReportsPage";
import { authFetch } from "../lib/supabaseClient";
import { isValidHex, getContrastColor, darkenColor } from "../utils/themeHelpers";

interface DashboardShellProps {
  session: any;
  onLogout: () => void;
}

export default function DashboardShell({ session, onLogout }: DashboardShellProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Auth profile & agency filtering states
  const [profile, setProfile] = useState<any>(null);
  const [agencies, setAgencies] = useState<any[]>([]);
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>("All");

  // Functional Date Range state
  const [dateRange, setDateRange] = useState<DateRange>({
    preset: "30days",
    startDate: getPresetRange("30days").startDate,
    endDate: getPresetRange("30days").endDate
  });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isClientView, setIsClientView] = useState(false);

  // Redirect back to overview if active tab becomes unavailable in client view
  useEffect(() => {
    if (isClientView && !["overview", "summary"].includes(activeTab)) {
      setActiveTab("overview");
    }
  }, [isClientView, activeTab]);
  const [compareMode, setCompareMode] = useState<"previous_period" | "previous_year" | "custom">("previous_period");
  const [customCompareRange, setCustomCompareRange] = useState<DateRange>({
    preset: "custom",
    startDate: "",
    endDate: ""
  });
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");

  // Calculate default custom comparison range whenever dateRange changes
  useEffect(() => {
    if (dateRange.startDate && dateRange.endDate) {
      const prev = getCompareRange(dateRange.startDate, dateRange.endDate, "previous_period");
      setCustomCompareRange({
        preset: "custom",
        startDate: prev.startDate,
        endDate: prev.endDate
      });
    }
  }, [dateRange.startDate, dateRange.endDate]);

  const compareRange = useMemo(() => {
    return getCompareRange(
      dateRange.startDate,
      dateRange.endDate,
      compareMode,
      customCompareRange.startDate,
      customCompareRange.endDate
    );
  }, [dateRange, compareMode, customCompareRange]);

  // Toast notifier helper
  const addToast = (
    title: string, 
    description?: string, 
    type: "success" | "error" | "warning" | "info" = "success"
  ) => {
    const newToast: ToastMessage = {
      id: `toast-${Date.now()}-${Math.random()}`,
      type,
      title,
      description
    };
    setToasts((prev) => [...prev, newToast]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const fetchProfile = async () => {
    try {
      const res = await authFetch("/api/profile");
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        if (data.agencyId) {
          setSelectedAgencyId(data.agencyId);
        }
      }
    } catch (err) {
      console.error("Failed to load user profile:", err);
    }
  };

  // Fetch logged-in user profile details
  useEffect(() => {
    fetchProfile();
  }, [session]);

  // Apply dynamic agency branding colors
  useEffect(() => {
    if (profile) {
      const primaryColor = profile.primaryColor && isValidHex(profile.primaryColor) ? profile.primaryColor : "#D6B77A";
      const hoverColor = darkenColor(primaryColor, 0.1);
      const contrastColor = getContrastColor(primaryColor);
      
      document.documentElement.style.setProperty("--agency-primary", primaryColor);
      document.documentElement.style.setProperty("--agency-primary-hover", hoverColor);
      document.documentElement.style.setProperty("--agency-primary-muted", `${primaryColor}1f`);
      document.documentElement.style.setProperty("--agency-primary-border", `${primaryColor}47`);
      document.documentElement.style.setProperty("--agency-primary-contrast", contrastColor);
    }
  }, [profile]);

  // Fetch list of all agencies if admin
  useEffect(() => {
    if (profile?.isAdmin) {
      const fetchAgencies = async () => {
        try {
          const res = await authFetch("/api/agencies");
          if (res.ok) {
            const data = await res.json();
            setAgencies(data);
          }
        } catch (err) {
          console.error("Failed to load agencies:", err);
        }
      };
      fetchAgencies();
    }
  }, [profile]);

  // Sync client list from Express server (Server State Cache)
  const syncClients = async () => {
    try {
      const res = await authFetch("/api/clients");
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Could not sync clients list.");
      }
      const data = await res.json();
      setClients(data);
      
      // Auto select client from URL query param if present
      const params = new URLSearchParams(window.location.search);
      const urlClientId = params.get("client");

      if (urlClientId && data.some((c: any) => c.id === urlClientId)) {
        setSelectedClientId(urlClientId);
      } else if (data.length > 0 && !selectedClientId) {
        setSelectedClientId("agency-overview");
      }
    } catch (err: any) {
      addToast("Network Error", err.message || "Failed to retrieve connected clients from database.", "error");
    }
  };

  // Sync security audit logs from server
  const syncLogs = async () => {
    try {
      const res = await authFetch("/api/logs");
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Could not sync audit logs.");
      }
      const data = await res.json();
      setAuditLogs(data);
    } catch (err: any) {
      console.error(err);
      addToast("Audit Logs Error", err.message || "Failed to retrieve audit logs.", "error");
    }
  };

  // Manual pull-refresh triggered by Pierce (Optimistic State updates)
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    addToast("Syncing Live Channels", "Retrieving latest ad performance stats from Google & Meta APIs...", "info");
    
    try {
      await Promise.all([syncClients(), syncLogs()]);
      
      // Add custom refresh entry to logs
      const refreshLog: AuditLog = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: "REFRESH",
        entity: "System",
        details: "Triggered global marketing channels sync override",
        user: profile?.email || "system"
      };
      setAuditLogs((prev) => [refreshLog, ...prev]);

      addToast("Sync Successful", "Live reporting metrics updated successfully.", "success");
    } catch (err: any) {
      addToast("Sync Failed", "Could not connect to external Google/Meta endpoints.", "error");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Initial Seed mount when profile loads
  useEffect(() => {
    if (session) {
      syncClients();
      syncLogs();
    }
  }, [session, profile]);

  // Selected client entity object helper
  const activeClientEntity = clients.find(c => c.id === selectedClientId) || null;

  // Mutation Handlers passed to Children (Strict validation + optimistic updates + error fallback rollback)
  const handleAddClientMutation = async (newClientData: Omit<ClientAccount, "id" | "createdAt" | "status">) => {
    // Generate optimistic client
    const tempId = `temp-${Date.now()}`;
    const optimisticClient: ClientAccount = {
      ...newClientData,
      id: tempId,
      status: "Active",
      createdAt: new Date().toISOString()
    };

    // Optimistically update UI State immediately
    const previousClients = [...clients];
    setClients((prev) => [...prev, optimisticClient]);
    if (!selectedClientId) {
      setSelectedClientId(tempId);
    }
    
    addToast(
      "Integrating Portal", 
      `Optimistically connecting ${newClientData.name}. Writing audit history...`, 
      "info"
    );

    try {
      const res = await authFetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newClientData)
      });

      if (!res.ok) throw new Error();
      
      const savedClient = await res.json();
      // Replace optimistic client with real database client
      setClients((prev) => prev.map(c => c.id === tempId ? savedClient : c));
      if (selectedClientId === tempId) {
        setSelectedClientId(savedClient.id);
      }
      
      addToast(
        "Integration Active", 
        `${newClientData.name} live reporting URL provisioned successfully!`, 
        "success"
      );
      syncLogs(); // reload logs to get the audit record
    } catch (err) {
      // Rollback on server failure
      setClients(previousClients);
      addToast("Integration Failed", "Server validation rejected client creation.", "error");
    }
  };

  const handleUpdateClientMutation = async (id: string, updates: Partial<ClientAccount>, silent = false) => {
    const previousClients = [...clients];
    
    // Optimistic UI update
    setClients((prev) => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    
    try {
      const res = await authFetch(`/api/clients/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });

      if (!res.ok) throw new Error();
      const updatedClient = await res.json();
      setClients((prev) => prev.map(c => c.id === id ? updatedClient : c));
      
      if (!silent) {
        addToast("Account Updated", "Modifications written to secure database.", "success");
      }
      syncLogs();
    } catch (err) {
      // Rollback
      setClients(previousClients);
      addToast("Update Failed", "Server rejected configuration changes.", "error");
    }
  };

  const handleDeleteClientMutation = async (id: string) => {
    const previousClients = [...clients];
    const clientToDelete = clients.find(c => c.id === id);

    // Optimistically delete
    setClients((prev) => prev.filter(c => c.id !== id));
    if (selectedClientId === id) {
      setSelectedClientId(clients.find(c => c.id !== id)?.id || "");
    }

    try {
      const res = await authFetch(`/api/clients/${id}`, {
        method: "DELETE"
      });

      if (!res.ok) throw new Error();
      
      addToast("Portal Disconnected", `Integration deleted for ${clientToDelete?.name || "Client"}.`, "warning");
      syncLogs();
    } catch (err) {
      // Rollback
      setClients(previousClients);
      addToast("Deletion Failed", "Server failed to delete connected database record.", "error");
    }
  };

  // Filter clients based on agency selection if admin
  const visibleClients = clients.filter((c) => {
    if (profile?.isAdmin && selectedAgencyId !== "All") {
      return c.agencyId === selectedAgencyId;
    }
    return true;
  });

  return (
    <div className="flex h-screen w-screen bg-[#080808] text-[#F5F3EE] overflow-hidden font-sans select-none">
      {/* Persistent Left Sidebar */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        profile={profile} 
        onLogout={onLogout}
        isClientView={isClientView}
      />

      {/* Main Container Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Admin Preview Top Indicator Bar */}
        {profile?.isAdmin && (profile?.isAdminPreview || session?.agencySlug) && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2 flex items-center justify-between text-xs text-amber-300 font-mono z-40 shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
              <span className="font-bold uppercase tracking-wider">ADMIN PREVIEW</span>
              <span className="text-amber-200/70">— Viewing as System Admin ({profile?.agencyName || "Preview Agency"})</span>
            </div>
            <button
              onClick={() => {
                document.documentElement.style.setProperty("--agency-primary", "#D6B77A");
                document.documentElement.style.setProperty("--agency-primary-hover", "#bfa063");
                document.documentElement.style.setProperty("--agency-primary-contrast", "#080808");
                window.location.href = "/admin";
              }}
              className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-200 rounded font-semibold transition-colors cursor-pointer"
            >
              Back to Admin
            </button>
          </div>
        )}

        {/* Global Action Header Bar */}
        <header className="h-16 bg-[#101010] border-b border-white/5 px-6 flex items-center justify-between shrink-0 relative z-30">
          <div className="flex items-center gap-6">
            {/* Subtle Client View Switcher */}
            <div className="flex items-center gap-1.5 bg-[#151515] border border-white/5 rounded-md p-1">
              <button
                onClick={() => {
                  setIsClientView(false);
                  addToast("Switched Context", "Agency management console active", "success");
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider transition-colors cursor-pointer ${
                  !isClientView
                    ? "bg-accent text-[#080808]"
                    : "text-[#8A8680] hover:text-[#F5F3EE]"
                }`}
              >
                AGENCY
              </button>
              <button
                onClick={() => {
                  setIsClientView(true);
                  addToast("Switched Context", "White-label client view active", "success");
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider transition-colors cursor-pointer ${
                  isClientView
                    ? "bg-accent text-[#080808]"
                    : "text-[#8A8680] hover:text-[#F5F3EE]"
                }`}
              >
                CLIENT
              </button>
            </div>

            {/* Sync dot & pill */}
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-1.5 text-[11px] text-[#8A8680]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4ADE80] opacity-70 animate-pulse"></span>
                <span>Synced 2 min ago</span>
              </div>
              
              {!profile?.logoUrl && (
                <div className="bg-accent/10 border border-accent/20 px-2 py-0.5 rounded text-[10px] font-semibold text-accent tracking-wider uppercase">
                  Sample Account
                </div>
              )}
            </div>

            {/* Splitter border */}
            <span className="h-4 w-px bg-white/10" />

            {/* Left Context: Custom Client Select / Client Title */}
            {isClientView ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono tracking-widest text-[#8A8680] uppercase">
                  CLIENT PORTAL:
                </span>
                <span className="text-xs font-bold text-[#F5F3EE]">
                  {activeClientEntity ? activeClientEntity.name : "Sample Client"}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-5">
                {/* Global Agency Filter for Admin */}
                {profile?.isAdmin && (
                  <div className="flex items-center gap-2 text-left">
                    <span className="text-[11px] font-mono tracking-wider text-[#8A8680] uppercase">
                      AGENCY:
                    </span>
                    <div className="relative">
                      <select
                        value={selectedAgencyId}
                        onChange={(e) => {
                          setSelectedAgencyId(e.target.value);
                          const filtered = clients.filter(c => e.target.value === "All" || c.agencyId === e.target.value);
                          if (filtered.length > 0) {
                            setSelectedClientId(filtered[0].id);
                          } else {
                            setSelectedClientId("");
                          }
                        }}
                        className="appearance-none bg-[#151515] border border-white/10 text-[#F5F3EE] text-xs font-semibold rounded-lg pl-3 pr-8 py-1.5 focus:border-accent/40 outline-none cursor-pointer"
                      >
                        <option value="All">All Agencies</option>
                        {agencies.map((agency) => (
                          <option key={agency.id} value={agency.id}>
                            {agency.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-[#8A8680] absolute right-2.5 top-2.5 pointer-events-none" />
                    </div>
                  </div>
                )}

                {/* Left Context: Selected Client Dropdown */}
                <div className="flex items-center gap-2 text-left relative">
                  <span className="text-[11px] font-mono tracking-wider text-[#8A8680] uppercase">
                    CLIENT:
                  </span>
                  <div className="relative">
                    <button
                      onClick={() => setIsClientDropdownOpen(!isClientDropdownOpen)}
                      className="flex items-center justify-between w-48 bg-[#151515] border border-white/10 text-[#F5F3EE] text-xs font-semibold rounded-lg px-3 py-1.5 focus:border-accent/40 outline-none cursor-pointer text-left font-display"
                    >
                      <span className="truncate">{selectedClientId === "agency-overview" ? "All Clients" : activeClientEntity ? activeClientEntity.name : "Select Client"}</span>
                      <ChevronDown className="w-3.5 h-3.5 text-[#8A8680] shrink-0 ml-1" />
                    </button>

                    {isClientDropdownOpen && (
                      <>
                        <div 
                          className="fixed inset-0 z-30" 
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsClientDropdownOpen(false);
                            setClientSearch("");
                          }}
                        />
                        <div className="absolute left-0 mt-1 w-64 rounded-lg bg-[#151515] border border-white/10 shadow-2xl p-2 z-40 space-y-2">
                          <input
                            type="text"
                            value={clientSearch}
                            onChange={(e) => setClientSearch(e.target.value)}
                            placeholder="Search clients..."
                            className="w-full bg-[#101010] border border-white/5 rounded-md px-2 py-1 text-xs text-[#F5F3EE] focus:border-accent/40 outline-none placeholder:text-slate-600 font-sans"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="max-h-48 overflow-y-auto space-y-0.5 font-sans">
                            {(!clientSearch || "all clients".includes(clientSearch.toLowerCase())) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedClientId("agency-overview");
                                  setIsClientDropdownOpen(false);
                                  setClientSearch("");
                                  addToast(
                                    "Context Switched", 
                                    "Showing aggregated overview of all clients", 
                                    "info"
                                  );
                                }}
                                className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors cursor-pointer block truncate ${
                                  selectedClientId === "agency-overview"
                                    ? "bg-accent/10 text-accent font-bold"
                                    : "text-[#8A8680] hover:bg-white/5 hover:text-[#F5F3EE]"
                                }`}
                              >
                                🏢 All Clients
                                <span className="text-[9px] block text-[#8A8680] font-mono font-normal">
                                  All clients aggregated
                                </span>
                              </button>
                            )}
                            {visibleClients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()) || c.domain.toLowerCase().includes(clientSearch.toLowerCase())).map((client) => (
                              <button
                                key={client.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedClientId(client.id);
                                  setIsClientDropdownOpen(false);
                                  setClientSearch("");
                                  addToast(
                                    "Context Switched", 
                                    `Reporting cache updated for ${client.name}`, 
                                    "info"
                                  );
                                }}
                                className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors cursor-pointer block truncate ${
                                  selectedClientId === client.id
                                    ? "bg-accent/10 text-accent font-bold"
                                    : "text-[#8A8680] hover:bg-white/5 hover:text-[#F5F3EE]"
                                }`}
                              >
                                {client.name}
                                <span className="text-[9px] block text-[#8A8680] font-mono font-normal">
                                  {client.domain}
                                </span>
                              </button>
                            ))}
                            {visibleClients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()) || c.domain.toLowerCase().includes(clientSearch.toLowerCase())).length === 0 && (
                              <span className="text-[11px] text-[#8A8680] block text-center py-2">
                                No clients found
                              </span>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Context: Actions (Manual Sync & Functional Date Picker) */}
          <div className="flex items-center gap-4">
            {/* Compare To dropdown */}
            <div className="flex items-center gap-2 text-left">
              <span className="text-[11px] font-mono tracking-wider text-[#8A8680] uppercase">
                COMPARE:
              </span>
              <div className="relative">
                <select
                  value={compareMode}
                  onChange={(e) => {
                    setCompareMode(e.target.value as any);
                    addToast(
                      "Comparison Mode Updated", 
                      `Comparing to ${e.target.value === "previous_period" ? "Previous Period" : e.target.value === "previous_year" ? "Previous Year" : "Custom Period"}`, 
                      "info"
                    );
                  }}
                  className="appearance-none bg-[#151515] border border-white/10 text-[#F5F3EE] text-xs font-semibold rounded-lg pl-3 pr-8 py-1.5 focus:border-accent/40 outline-none cursor-pointer"
                >
                  <option value="previous_period">Previous Period</option>
                  <option value="previous_year">Previous Year</option>
                  <option value="custom">Custom Period</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-[#8A8680] absolute right-2.5 top-2.5 pointer-events-none" />
              </div>
            </div>

            {/* Functional Date Range Picker */}
            <div className="relative font-sans">
              <button
                onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
                className="flex items-center gap-2 bg-[#151515] hover:bg-[#202020] border border-white/10 px-3 py-1.5 rounded-lg text-[#F5F3EE] text-xs font-semibold cursor-pointer transition-all"
              >
                <Calendar className="w-3.5 h-3.5 text-accent shrink-0" />
                <span className="font-medium tracking-wide">
                  {formatDisplayDate(dateRange.startDate)} to {formatDisplayDate(dateRange.endDate)}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-[#8A8680]" />
              </button>

              {/* Date Picker Dropdown Popover */}
              {isDatePickerOpen && (
                <div className="absolute right-0 mt-2 w-72 rounded-lg bg-[#151515] border border-white/10 shadow-2xl p-4 z-50 text-left space-y-3.5">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-mono tracking-wider text-[#8A8680] uppercase">
                      Select Range Preset
                    </span>
                    <div className="grid grid-cols-2 gap-1.5 mt-1">
                      {[
                        { label: "Last 7 Days", value: "7days" as const },
                        { label: "Last 30 Days", value: "30days" as const },
                        { label: "Last 90 Days", value: "90days" as const },
                        { label: "This Month", value: "thisMonth" as const },
                        { label: "Last Month", value: "lastMonth" as const },
                        { label: "Custom Range", value: "custom" as const },
                      ].map((preset) => (
                        <button
                          key={preset.value}
                          onClick={() => {
                            if (preset.value !== "custom") {
                              const range = getPresetRange(preset.value);
                              setDateRange({
                                preset: preset.value,
                                startDate: range.startDate,
                                endDate: range.endDate,
                              });
                              setIsDatePickerOpen(false);
                              addToast(
                                "Date Range Updated",
                                `Analyzing data from ${formatDisplayDate(range.startDate)} to ${formatDisplayDate(range.endDate)}`,
                                "info"
                              );
                            } else {
                              setDateRange((prev) => ({ ...prev, preset: "custom" }));
                            }
                          }}
                          className={`px-2.5 py-1.5 rounded-md text-xs font-medium text-left transition-colors cursor-pointer ${
                            dateRange.preset === preset.value
                              ? "bg-accent/10 text-accent border border-accent/30"
                              : "bg-[#101010] text-[#8A8680] hover:bg-[#151515] border border-transparent"
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Date Inputs */}
                  {dateRange.preset === "custom" && (
                    <div className="pt-2.5 border-t border-white/5 space-y-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-mono tracking-wider text-[#8A8680] uppercase">
                          Start Date
                        </label>
                        <input
                          type="date"
                          value={dateRange.startDate}
                          onChange={(e) => {
                            const newStart = e.target.value;
                            if (newStart) {
                              setDateRange((prev) => ({ ...prev, startDate: newStart }));
                            }
                          }}
                          className="bg-[#101010] border border-white/5 rounded-md px-2.5 py-1.5 text-xs text-[#F5F3EE] focus:border-accent/40 outline-none w-full cursor-pointer [color-scheme:dark]"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-mono tracking-wider text-[#8A8680] uppercase">
                          End Date
                        </label>
                        <input
                          type="date"
                          value={dateRange.endDate}
                          onChange={(e) => {
                            const newEnd = e.target.value;
                            if (newEnd) {
                              setDateRange((prev) => ({ ...prev, endDate: newEnd }));
                            }
                          }}
                          className="bg-[#101010] border border-white/5 rounded-md px-2.5 py-1.5 text-xs text-[#F5F3EE] focus:border-accent/40 outline-none w-full cursor-pointer [color-scheme:dark]"
                        />
                      </div>
                      <button
                        onClick={() => {
                          if (dateRange.startDate > dateRange.endDate) {
                            addToast("Invalid Range", "Start date must be before or equal to end date.", "error");
                            return;
                          }
                          setIsDatePickerOpen(false);
                          addToast(
                            "Date Range Updated",
                            `Analyzing data from ${formatDisplayDate(dateRange.startDate)} to ${formatDisplayDate(dateRange.endDate)}`,
                            "info"
                          );
                        }}
                        className="w-full py-1.5 bg-accent hover:bg-[#bfa063] text-[#080808] font-semibold text-xs rounded-md transition-colors cursor-pointer"
                      >
                        Apply Range
                      </button>
                    </div>
                  )}

                  {/* Custom Compare inputs if compareMode is custom */}
                  {compareMode === "custom" && (
                    <div className="pt-2.5 border-t border-white/5 space-y-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-mono tracking-wider text-[#8A8680] uppercase">
                          Compare Start
                        </label>
                        <input
                          type="date"
                          value={customCompareRange.startDate}
                          onChange={(e) => {
                            const newStart = e.target.value;
                            if (newStart) {
                              setCustomCompareRange((prev) => ({ ...prev, startDate: newStart }));
                            }
                          }}
                          className="bg-[#101010] border border-white/5 rounded-md px-2.5 py-1.5 text-xs text-[#F5F3EE] focus:border-accent/40 outline-none w-full cursor-pointer [color-scheme:dark]"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-mono tracking-wider text-[#8A8680] uppercase">
                          Compare End
                        </label>
                        <input
                          type="date"
                          value={customCompareRange.endDate}
                          onChange={(e) => {
                            const newEnd = e.target.value;
                            if (newEnd) {
                              setCustomCompareRange((prev) => ({ ...prev, endDate: newEnd }));
                            }
                          }}
                          className="bg-[#101010] border border-white/5 rounded-md px-2.5 py-1.5 text-xs text-[#F5F3EE] focus:border-accent/40 outline-none w-full cursor-pointer [color-scheme:dark]"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Live Refresh override */}
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="p-2 bg-[#151515] hover:bg-[#202020] border border-white/10 text-[#8A8680] hover:text-[#F5F3EE] rounded-lg cursor-pointer transition-colors"
              title="Pull latest live platform API data"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-accent" : ""}`} />
            </button>
          </div>
        </header>

        {/* Dynamic Screen View Content Grid */}
        <main className="flex-1 overflow-y-auto p-6 max-w-7xl w-full mx-auto space-y-6">
          {activeTab === "overview" && (
            <Overview 
              selectedClient={activeClientEntity} 
              clients={clients}
              dateRange={dateRange}
              compareRange={compareRange}
              isClientView={isClientView}
              onRefresh={handleManualRefresh}
              isRefreshing={isRefreshing}
              addToast={addToast}
              customCta={profile?.customCta}
              profile={profile}
              onSelectClient={setSelectedClientId}
            />
          )}

          {activeTab === "clients" && (
            <ClientsManager 
              clients={visibleClients}
              onAddClient={handleAddClientMutation}
              onUpdateClient={handleUpdateClientMutation}
              onDeleteClient={handleDeleteClientMutation}
              addToast={addToast}
              clientLimit={profile?.clientLimit}
              isAdmin={profile?.isAdmin}
              profile={profile}
            />
          )}

          {activeTab === "summary" && (
            <AIDailySummary 
              selectedClient={activeClientEntity}
              clients={clients}
              dateRange={dateRange}
              addToast={addToast}
              profile={profile}
            />
          )}

          {activeTab === "reports" && (
            <ReportsPage 
              clients={clients}
              dateRange={dateRange}
              addToast={addToast}
            />
          )}

          {activeTab === "logs" && (
            <LogsViewer 
              logs={auditLogs}
              onRefresh={syncLogs}
              isRefreshing={isRefreshing}
            />
          )}

          {activeTab === "settings" && (
            <AgencySettings
              profile={profile}
              refreshProfile={fetchProfile}
              addToast={addToast}
            />
          )}
        </main>
      </div>

      {/* Global Toast Container */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
