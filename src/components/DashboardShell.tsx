import React, { useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import Overview from "./Overview";
import ClientsManager from "./ClientsManager";
import AIDailySummary from "./AIDailySummary";
import LogsViewer from "./LogsViewer";
import ToastContainer, { ToastMessage } from "./Toast";
import { ClientAccount, AuditLog, ActiveTab } from "../types";
import { RefreshCw, Calendar, ChevronDown } from "lucide-react";
import { DateRange, getPresetRange, formatDisplayDate } from "../utils/dateHelpers";

export default function DashboardShell() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Functional Date Range state
  const [dateRange, setDateRange] = useState<DateRange>({
    preset: "30days",
    startDate: getPresetRange("30days").startDate,
    endDate: getPresetRange("30days").endDate
  });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

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

  // Sync client list from Express server (Server State Cache)
  const syncClients = async () => {
    try {
      const res = await fetch("/api/clients");
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Could not sync clients list.");
      }
      const data = await res.json();
      setClients(data);
      
      // Auto select first client if none selected
      if (data.length > 0 && !selectedClientId) {
        setSelectedClientId(data[0].id);
      }
    } catch (err: any) {
      addToast("Network Error", err.message || "Failed to retrieve connected clients from database.", "error");
    }
  };

  // Sync security audit logs from server
  const syncLogs = async () => {
    try {
      const res = await fetch("/api/logs");
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
        user: "pierce@lumenanalytics.co"
      };
      setAuditLogs((prev) => [refreshLog, ...prev]);

      addToast("Sync Successful", "Live reporting metrics updated successfully.", "success");
    } catch (err: any) {
      addToast("Sync Failed", "Could not connect to external Google/Meta endpoints.", "error");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Initial Seed mount
  useEffect(() => {
    syncClients();
    syncLogs();
  }, []);

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
      const res = await fetch("/api/clients", {
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

  const handleUpdateClientMutation = async (id: string, updates: Partial<ClientAccount>) => {
    const previousClients = [...clients];
    
    // Optimistic UI update
    setClients((prev) => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    
    try {
      const res = await fetch(`/api/clients/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });

      if (!res.ok) throw new Error();
      const updatedClient = await res.json();
      setClients((prev) => prev.map(c => c.id === id ? updatedClient : c));
      
      addToast("Account Updated", "Modifications written to secure database.", "success");
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
      const res = await fetch(`/api/clients/${id}`, {
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

  return (
    <div className="flex h-screen w-screen bg-[#0b0f19] text-slate-100 overflow-hidden font-sans select-none">
      {/* Persistent Left Sidebar */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        userEmail="pierce@lumenanalytics.co" 
      />

      {/* Main Container Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Global Action Header Bar */}
        <header className="h-16 bg-slate-950/40 border-b border-slate-900/60 px-6 flex items-center justify-between shrink-0">
          {/* Left Context: Selected Client Dropdown */}
          <div className="flex items-center gap-3 text-left">
            <span className="text-[10px] font-mono tracking-wider text-slate-500 uppercase">
              ACTIVE CLIENT:
            </span>
            <div className="relative">
              <select
                value={selectedClientId}
                onChange={(e) => {
                  setSelectedClientId(e.target.value);
                  addToast(
                    "Context Switched", 
                    `Reporting cache updated for ${clients.find(c => c.id === e.target.value)?.name}`, 
                    "info"
                  );
                }}
                className="appearance-none bg-slate-900 border border-slate-800 text-slate-200 text-xs font-semibold rounded-lg pl-3 pr-8 py-1.5 focus:ring-1 focus:ring-violet-500 outline-none cursor-pointer"
              >
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} ({client.domain})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Right Context: Actions (Manual Sync & Functional Date Picker) */}
          <div className="flex items-center gap-4">
            {/* Functional Date Range Picker */}
            <div className="relative">
              <button
                onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
                className="flex items-center gap-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 px-3 py-1.5 rounded-lg text-slate-300 hover:text-slate-100 text-xs font-semibold cursor-pointer transition-all"
              >
                <Calendar className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                <span className="font-medium tracking-wide">
                  {formatDisplayDate(dateRange.startDate)} to {formatDisplayDate(dateRange.endDate)}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              </button>

              {/* Date Picker Dropdown Popover */}
              {isDatePickerOpen && (
                <div className="absolute right-0 mt-2 w-72 rounded-xl bg-slate-950 border border-slate-800/95 shadow-2xl p-4 z-50 text-left space-y-3.5">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-mono tracking-wider text-slate-500 uppercase">
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
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium text-left transition-colors cursor-pointer ${
                            dateRange.preset === preset.value
                              ? "bg-violet-600/20 text-violet-300 border border-violet-500/30"
                              : "bg-slate-900/50 text-slate-400 hover:bg-slate-900 border border-transparent"
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Date Inputs */}
                  {dateRange.preset === "custom" && (
                    <div className="pt-2.5 border-t border-slate-900 space-y-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-mono tracking-wider text-slate-500 uppercase">
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
                          className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:border-violet-500 outline-none w-full cursor-pointer [color-scheme:dark]"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-mono tracking-wider text-slate-500 uppercase">
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
                          className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:border-violet-500 outline-none w-full cursor-pointer [color-scheme:dark]"
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
                        className="w-full py-1.5 bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                      >
                        Apply Range
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Live Refresh override */}
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 rounded-lg cursor-pointer transition-colors"
              title="Pull latest live platform API data"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-violet-400" : ""}`} />
            </button>
          </div>
        </header>

        {/* Dynamic Screen View Content Grid */}
        <main className="flex-1 overflow-y-auto p-6 max-w-7xl w-full mx-auto space-y-6">
          {activeTab === "overview" && (
            <Overview 
              selectedClient={activeClientEntity} 
              dateRange={dateRange}
              onRefresh={handleManualRefresh}
              isRefreshing={isRefreshing}
              addToast={addToast}
            />
          )}

          {activeTab === "clients" && (
            <ClientsManager 
              clients={clients}
              onAddClient={handleAddClientMutation}
              onUpdateClient={handleUpdateClientMutation}
              onDeleteClient={handleDeleteClientMutation}
              addToast={addToast}
            />
          )}

          {activeTab === "summary" && (
            <AIDailySummary 
              selectedClient={activeClientEntity}
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
        </main>
      </div>

      {/* Global Toast Container */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
