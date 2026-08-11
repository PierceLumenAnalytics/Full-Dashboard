import React, { useState, useEffect } from "react";
import { 
  Briefcase, 
  Plus, 
  Trash2, 
  Edit3, 
  Sparkles, 
  Settings, 
  Layers, 
  Check, 
  Users, 
  Lock, 
  Link as LinkIcon, 
  FileTerminal,
  LogOut,
  Sliders,
  DollarSign,
  Globe,
  Loader2,
  Trash
} from "lucide-react";
import { authFetch } from "../lib/supabaseClient";
import ClientsManager from "./ClientsManager";
import LogsViewer from "./LogsViewer";
import ToastContainer, { ToastMessage } from "./Toast";
import { ClientAccount, AuditLog } from "../types";

interface AdminPanelProps {
  session: any;
  onLogout: () => void;
}

export default function AdminPanel({ session, onLogout }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<"agencies" | "clients" | "logs">("agencies");
  const [agencies, setAgencies] = useState<any[]>([]);
  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  
  // Modals
  const [isOnboardModalOpen, setIsOnboardModalOpen] = useState(false);
  const [isEditAgencyModalOpen, setIsEditAgencyModalOpen] = useState(false);
  const [editingAgency, setEditingAgency] = useState<any>(null);

  // Agency Onboarding Form State
  const [agencyName, setAgencyName] = useState("");
  const [agencySlug, setAgencySlug] = useState("");
  const [agencyLogoUrl, setAgencyLogoUrl] = useState("");
  const [agencyPrimaryColor, setAgencyPrimaryColor] = useState("#ea580c");
  const [agencyAccentColor, setAgencyAccentColor] = useState("#dc2626");
  const [agencyClientLimit, setAgencyClientLimit] = useState(5);
  
  // Nested clients in onboarding flow
  const [onboardClients, setOnboardClients] = useState<any[]>([
    { name: "", domain: "", budget: 2000, platform: "All Platforms" }
  ]);

  // Toast helpers
  const addToast = (
    title: string, 
    description?: string, 
    type: "success" | "error" | "warning" | "info" = "success"
  ) => {
    setToasts((prev) => [...prev, { id: `toast-${Date.now()}-${Math.random()}`, type, title, description }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Fetches
  const fetchAgencies = async () => {
    try {
      const res = await authFetch("/api/admin/agencies");
      if (res.ok) {
        const data = await res.json();
        setAgencies(data);
      }
    } catch (err) {
      console.error(err);
      addToast("Error", "Could not fetch agencies.", "error");
    }
  };

  const fetchClients = async () => {
    try {
      const res = await authFetch("/api/clients");
      if (res.ok) {
        const data = await res.json();
        setClients(data);
      }
    } catch (err) {
      console.error(err);
      addToast("Error", "Could not fetch clients.", "error");
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await authFetch("/api/logs");
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      }
    } catch (err) {
      console.error(err);
      addToast("Error", "Could not fetch audit logs.", "error");
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchAgencies(), fetchClients(), fetchLogs()]).finally(() => setLoading(false));
  }, []);

  // Mutating handlers
  const handleOnboardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agencyName.trim() || !agencySlug.trim()) {
      addToast("Validation Failed", "Agency name and slug are required.", "error");
      return;
    }

    try {
      // Filter empty onboard clients
      const filteredClients = onboardClients
        .filter(c => c.name.trim() !== "")
        .map(c => ({
          name: c.name.trim(),
          domain: c.domain.trim(),
          monthlyBudget: Number(c.budget) || 1000,
          platform: c.platform
        }));

      const res = await authFetch("/api/admin/agencies/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: agencyName.trim(),
          slug: agencySlug.trim().toLowerCase(),
          logoUrl: agencyLogoUrl.trim() || null,
          primaryColor: agencyPrimaryColor.trim(),
          accentColor: agencyAccentColor.trim(),
          clientLimit: Number(agencyClientLimit),
          clients: filteredClients
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to onboard agency");
      }

      addToast("Success", "Agency and clients successfully onboarded!", "success");
      setIsOnboardModalOpen(false);
      
      // Reset form
      setAgencyName("");
      setAgencySlug("");
      setAgencyLogoUrl("");
      setAgencyPrimaryColor("#ea580c");
      setAgencyAccentColor("#dc2626");
      setAgencyClientLimit(5);
      setOnboardClients([{ name: "", domain: "", budget: 2000, platform: "All Platforms" }]);

      fetchAgencies();
      fetchClients();
      fetchLogs();
    } catch (err: any) {
      addToast("Onboarding Failed", err.message, "error");
    }
  };

  const handleEditAgencySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAgency) return;

    try {
      const res = await authFetch(`/api/admin/agencies/${editingAgency.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingAgency.name,
          slug: editingAgency.slug.toLowerCase(),
          logoUrl: editingAgency.logo_url,
          primaryColor: editingAgency.primary_color,
          accentColor: editingAgency.accent_color,
          clientLimit: Number(editingAgency.client_limit)
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update agency");
      }

      addToast("Updated", "Agency branding and limits updated.", "success");
      setIsEditAgencyModalOpen(false);
      fetchAgencies();
      fetchLogs();
    } catch (err: any) {
      addToast("Update Failed", err.message, "error");
    }
  };

  const handleDeleteAgency = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete agency "${name}"? This deletes all associated clients and metrics!`)) return;

    try {
      const res = await authFetch(`/api/admin/agencies/${id}`, {
        method: "DELETE"
      });

      if (!res.ok) throw new Error("Failed to delete agency");

      addToast("Deleted", "Agency and clients deleted successfully.", "warning");
      fetchAgencies();
      fetchClients();
      fetchLogs();
    } catch (err: any) {
      addToast("Delete Failed", err.message, "error");
    }
  };

  // Client Mutations from ClientsManager
  const handleAddClient = async (clientData: any) => {
    const targetAgencyId = clientData.agencyId;
    if (!targetAgencyId) {
      addToast("Validation Failed", "Please select an agency to associate the client with.", "error");
      return;
    }

    try {
      const res = await authFetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: clientData.name,
          domain: clientData.domain,
          platform: clientData.platform,
          monthlyBudget: clientData.monthlyBudget,
          agencyId: targetAgencyId
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create client");
      }

      addToast("Success", "Client created successfully.", "success");
      fetchClients();
      fetchLogs();
    } catch (err: any) {
      addToast("Error", err.message, "error");
    }
  };

  const handleUpdateClient = async (id: string, updates: Partial<ClientAccount>) => {
    try {
      const res = await authFetch(`/api/clients/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error("Failed to update client");
      fetchClients();
      fetchLogs();
    } catch (err: any) {
      addToast("Error", err.message, "error");
    }
  };

  const handleDeleteClient = async (id: string) => {
    try {
      const res = await authFetch(`/api/clients/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete client");
      fetchClients();
      fetchLogs();
    } catch (err: any) {
      addToast("Error", err.message, "error");
    }
  };

  // Dynamic Clients row editor inside onboarding
  const addOnboardClientRow = () => {
    setOnboardClients([...onboardClients, { name: "", domain: "", budget: 2000, platform: "All Platforms" }]);
  };

  const removeOnboardClientRow = (idx: number) => {
    setOnboardClients(onboardClients.filter((_, i) => i !== idx));
  };

  const updateOnboardClientField = (idx: number, field: string, value: any) => {
    setOnboardClients(onboardClients.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  return (
    <div className="flex h-screen w-screen bg-[#0b0f19] text-slate-100 overflow-hidden font-sans select-none">
      
      {/* Admin Sidebar */}
      <aside className="w-64 bg-slate-950 border-r border-slate-900/80 flex flex-col justify-between select-none h-screen shrink-0 font-sans text-left">
        <div>
          {/* Logo Branding */}
          <div className="p-5 flex items-center gap-2.5 border-b border-slate-900/40 text-left">
            <div className="w-8 h-8 rounded-lg border border-slate-800 bg-slate-900/30 flex items-center justify-center font-bold text-xs">
              <Lock className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-slate-200">
                Lumen Analytics
              </h1>
              <span className="text-[9px] text-violet-500 tracking-wider font-mono uppercase block">
                SYSTEM ADMINISTRATOR
              </span>
            </div>
          </div>

          {/* Navigation */}
          <div className="px-3 py-4 space-y-6">
            <div>
              <span className="text-[9px] font-mono tracking-wider text-slate-600 uppercase px-3 block mb-1.5">
                Console
              </span>
              <ul className="space-y-0.5">
                <li>
                  <button
                    onClick={() => setActiveTab("agencies")}
                    className={`w-full flex items-center px-3 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      activeTab === "agencies" ? "bg-slate-900/85 text-slate-100" : "text-slate-400 hover:bg-slate-900/40 hover:text-slate-200"
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 mr-2.5 text-violet-400/90" />
                    <span>Manage Agencies</span>
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setActiveTab("clients")}
                    className={`w-full flex items-center px-3 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      activeTab === "clients" ? "bg-slate-900/85 text-slate-100" : "text-slate-400 hover:bg-slate-900/40 hover:text-slate-200"
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 mr-2.5 text-violet-400/90" />
                    <span>Manage Clients</span>
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setActiveTab("logs")}
                    className={`w-full flex items-center px-3 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      activeTab === "logs" ? "bg-slate-900/85 text-slate-100" : "text-slate-400 hover:bg-slate-900/40 hover:text-slate-200"
                    }`}
                  >
                    <FileTerminal className="w-3.5 h-3.5 mr-2.5 text-violet-400/90" />
                    <span>Audit System Logs</span>
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between p-2 border-t border-slate-900/50 pt-3">
            <div className="flex flex-col text-left overflow-hidden">
              <span className="text-xs font-bold text-slate-300 truncate">
                System Admin
              </span>
              <span className="text-[9px] text-slate-500 truncate">
                {session?.user?.email}
              </span>
            </div>
            <button
              onClick={onLogout}
              className="text-slate-600 hover:text-rose-400 transition-colors p-1 rounded hover:bg-slate-900/40 cursor-pointer"
              title="Log Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Panel Content */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Header Bar */}
        <header className="h-16 bg-slate-950/40 border-b border-slate-900/60 px-6 flex items-center justify-between shrink-0">
          <h2 className="text-sm font-bold font-display uppercase tracking-wider text-slate-200">
            {activeTab === "agencies" && "Agencies White-Label Controller"}
            {activeTab === "clients" && "Global Clients Integrator"}
            {activeTab === "logs" && "System Audit History Logs"}
          </h2>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-6 max-w-7xl w-full mx-auto space-y-6">
          {loading ? (
            <div className="h-64 flex items-center justify-center text-xs text-slate-500 font-mono">
              <Loader2 className="w-5 h-5 animate-spin mr-2 text-violet-400" />
              Syncing configurations database...
            </div>
          ) : (
            <>
              {activeTab === "agencies" && (
                <div className="space-y-6 text-left">
                  {/* Header action */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-slate-100">White-Labeled Managed Agencies</h3>
                      <p className="text-xs text-slate-400">Configure visual branding properties and limit capacities of agencies.</p>
                    </div>
                    <button
                      onClick={() => setIsOnboardModalOpen(true)}
                      className="px-4 py-2 bg-violet-600 hover:bg-violet-750 text-white font-semibold rounded-lg text-xs cursor-pointer flex items-center gap-1.5 transition-colors"
                    >
                      <Plus className="w-4 h-4" /> Create New Agency
                    </button>
                  </div>

                  {/* Agencies Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {agencies.map((agency) => (
                      <div key={agency.id} className="bg-slate-900/20 border border-slate-900 rounded-xl p-5 space-y-4 hover:border-slate-800 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg border border-slate-800 bg-slate-950 flex items-center justify-center font-bold text-xs uppercase" style={{ borderColor: agency.primary_color || '#ea580c' }}>
                              {agency.logo_url && (agency.logo_url.startsWith("http") || agency.logo_url.startsWith("data:")) ? (
                                <img src={agency.logo_url} alt="" className="w-6 h-6 object-contain" />
                              ) : (
                                <span style={{ color: agency.primary_color || '#ea580c' }}>
                                  {agency.slug ? agency.slug.substring(0, 2).toUpperCase() : "AG"}
                                </span>
                              )}
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-slate-200">{agency.name}</h4>
                              <p className="text-[10px] text-slate-500 font-mono">/agency/{agency.slug}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                setEditingAgency(agency);
                                setIsEditAgencyModalOpen(true);
                              }}
                              className="p-1.5 bg-slate-900 hover:bg-slate-850 rounded border border-slate-800 text-slate-400 hover:text-violet-400 transition-colors"
                              title="Edit Agency"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteAgency(agency.id, agency.name)}
                              className="p-1.5 bg-slate-900 hover:bg-slate-850 rounded border border-slate-800 text-slate-400 hover:text-rose-400 transition-colors"
                              title="Delete Agency"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Agency Metrics */}
                        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-900/60 text-xs">
                          <div>
                            <span className="text-[9px] font-mono uppercase text-slate-500 tracking-wider">Clients Active</span>
                            <p className="font-semibold text-slate-300">{agency.clientsCount} / {agency.client_limit} max</p>
                          </div>
                          <div>
                            <span className="text-[9px] font-mono uppercase text-slate-500 tracking-wider">Branding Colors</span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="w-3 h-3 rounded-full border border-slate-950" style={{ backgroundColor: agency.primary_color || '#ea580c' }}></span>
                              <span className="w-3 h-3 rounded-full border border-slate-950" style={{ backgroundColor: agency.accent_color || '#dc2626' }}></span>
                              <span className="text-[10px] text-slate-400 font-mono">{agency.primary_color || 'Default'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Public Link */}
                        <a
                          href={`/agency/${agency.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-slate-950/60 border border-slate-900 hover:border-slate-800 rounded-lg text-[10px] font-mono font-bold text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
                        >
                          <LinkIcon className="w-3 h-3" /> Visit Dashboard
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "clients" && (
                <ClientsManager
                  clients={clients}
                  onAddClient={handleAddClient}
                  onUpdateClient={handleUpdateClient}
                  onDeleteClient={handleDeleteClient}
                  addToast={addToast}
                  clientLimit={9999}
                  isAdmin={true}
                  profile={{ isAdmin: true }}
                />
              )}

              {activeTab === "logs" && (
                <LogsViewer
                  logs={auditLogs}
                  onRefresh={fetchLogs}
                  isRefreshing={false}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* ONE FORM AGENCY ONBOARDING DIALOG MODAL */}
      {isOnboardModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-900 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl animate-scale-in flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-900 shrink-0">
              <h3 className="text-sm font-bold font-display uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-400" />
                Managed Agency Onboarding Flow
              </h3>
              <button
                onClick={() => setIsOnboardModalOpen(false)}
                className="text-slate-500 hover:text-slate-300 p-1"
              >
                Close
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleOnboardSubmit} className="p-6 overflow-y-auto space-y-6 text-left flex-1">
              
              {/* Agency Meta Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <label className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1">Agency Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ignite PPC Group"
                    value={agencyName}
                    onChange={(e) => setAgencyName(e.target.value)}
                    className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1">Agency URL Slug</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ignite-ppc"
                    value={agencySlug}
                    onChange={(e) => setAgencySlug(e.target.value)}
                    className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col md:col-span-2">
                  <label className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1">Branding Logo URL</label>
                  <input
                    type="text"
                    placeholder="e.g. https://domain.com/logo.png"
                    value={agencyLogoUrl}
                    onChange={(e) => setAgencyLogoUrl(e.target.value)}
                    className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1">Client Limit Cap</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={agencyClientLimit}
                    onChange={(e) => setAgencyClientLimit(Number(e.target.value))}
                    className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
              </div>

              {/* Color selectors */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <label className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1 flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 border border-slate-950 rounded-full" style={{ backgroundColor: agencyPrimaryColor }}></span>
                    Primary Brand Color (Hex)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={agencyPrimaryColor}
                      onChange={(e) => setAgencyPrimaryColor(e.target.value)}
                      className="w-10 h-10 border border-slate-800 rounded bg-slate-950 p-1 cursor-pointer"
                    />
                    <input
                      type="text"
                      required
                      value={agencyPrimaryColor}
                      onChange={(e) => setAgencyPrimaryColor(e.target.value)}
                      placeholder="#ea580c"
                      className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500 flex-1"
                    />
                  </div>
                </div>
                <div className="flex flex-col">
                  <label className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1 flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 border border-slate-950 rounded-full" style={{ backgroundColor: agencyAccentColor }}></span>
                    Accent Accent Color (Hex)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={agencyAccentColor}
                      onChange={(e) => setAgencyAccentColor(e.target.value)}
                      className="w-10 h-10 border border-slate-800 rounded bg-slate-950 p-1 cursor-pointer"
                    />
                    <input
                      type="text"
                      required
                      value={agencyAccentColor}
                      onChange={(e) => setAgencyAccentColor(e.target.value)}
                      placeholder="#dc2626"
                      className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500 flex-1"
                    />
                  </div>
                </div>
              </div>

              {/* Dynamic Clients Section */}
              <div className="border-t border-slate-900 pt-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-300 font-display uppercase tracking-wider">Associate Initial Clients</h4>
                  <button
                    type="button"
                    onClick={addOnboardClientRow}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded text-slate-300 font-semibold text-[10px] flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add Row
                  </button>
                </div>

                <div className="space-y-3">
                  {onboardClients.map((client, idx) => (
                    <div key={idx} className="flex gap-2.5 items-end bg-slate-900/20 border border-slate-900/60 p-3.5 rounded-lg relative">
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
                        <div className="flex flex-col">
                          <label className="text-[9px] font-mono text-slate-500 uppercase mb-0.5">Client Name</label>
                          <input
                            type="text"
                            placeholder="Luxe Retail"
                            value={client.name}
                            onChange={(e) => updateOnboardClientField(idx, "name", e.target.value)}
                            className="bg-slate-950 border border-slate-900 text-slate-300 text-[11px] rounded p-2 outline-none focus:border-slate-800"
                          />
                        </div>
                        <div className="flex flex-col">
                          <label className="text-[9px] font-mono text-slate-500 uppercase mb-0.5">TLD Domain</label>
                          <input
                            type="text"
                            placeholder="luxeretail.com"
                            value={client.domain}
                            onChange={(e) => updateOnboardClientField(idx, "domain", e.target.value)}
                            className="bg-slate-950 border border-slate-900 text-slate-300 text-[11px] rounded p-2 outline-none focus:border-slate-800"
                          />
                        </div>
                        <div className="flex flex-col">
                          <label className="text-[9px] font-mono text-slate-500 uppercase mb-0.5">Budget ($)</label>
                          <input
                            type="number"
                            value={client.budget}
                            onChange={(e) => updateOnboardClientField(idx, "budget", Number(e.target.value))}
                            className="bg-slate-950 border border-slate-900 text-slate-300 text-[11px] rounded p-2 outline-none focus:border-slate-800"
                          />
                        </div>
                        <div className="flex flex-col">
                          <label className="text-[9px] font-mono text-slate-500 uppercase mb-0.5">Ad Platform</label>
                          <select
                            value={client.platform}
                            onChange={(e) => updateOnboardClientField(idx, "platform", e.target.value)}
                            className="bg-slate-950 border border-slate-900 text-slate-300 text-[11px] rounded p-2 outline-none focus:border-slate-800"
                          >
                            <option value="All Platforms">All Platforms</option>
                            <option value="Google Ads">Google Ads Only</option>
                            <option value="Meta Ads">Meta Ads Only</option>
                            <option value="TikTok Ads">TikTok Ads Only</option>
                          </select>
                        </div>
                      </div>
                      {onboardClients.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeOnboardClientRow(idx)}
                          className="p-2 bg-slate-950 hover:bg-slate-900 rounded border border-slate-900 text-rose-500 transition-colors"
                          title="Remove Client"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-900 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsOnboardModalOpen(false)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 font-semibold rounded-lg text-xs cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-750 text-white font-semibold rounded-lg text-xs cursor-pointer transition-colors"
                >
                  Onboard Agency & Live Live URL
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT BRANDING/LIMIT DETAILS MODAL */}
      {isEditAgencyModalOpen && editingAgency && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-900 rounded-xl w-full max-w-md overflow-hidden shadow-2xl animate-scale-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-900">
              <h3 className="text-sm font-bold font-display uppercase tracking-wider text-slate-200">
                Edit Agency White-Label settings
              </h3>
              <button
                onClick={() => setIsEditAgencyModalOpen(false)}
                className="text-slate-500 hover:text-slate-300 p-1"
              >
                Close
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleEditAgencySubmit} className="p-5 space-y-4 text-left">
              <div className="flex flex-col">
                <label className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1">Agency Name</label>
                <input
                  type="text"
                  required
                  value={editingAgency.name}
                  onChange={(e) => setEditingAgency({ ...editingAgency, name: e.target.value })}
                  className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1">Agency Slug</label>
                <input
                  type="text"
                  required
                  value={editingAgency.slug}
                  onChange={(e) => setEditingAgency({ ...editingAgency, slug: e.target.value })}
                  className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1">Logo URL</label>
                <input
                  type="text"
                  value={editingAgency.logo_url || ""}
                  onChange={(e) => setEditingAgency({ ...editingAgency, logo_url: e.target.value })}
                  className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1">Client Limit</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={editingAgency.client_limit}
                  onChange={(e) => setEditingAgency({ ...editingAgency, client_limit: Number(e.target.value) })}
                  className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <label className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1">Primary Color</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={editingAgency.primary_color || "#ea580c"}
                      onChange={(e) => setEditingAgency({ ...editingAgency, primary_color: e.target.value })}
                      className="w-10 h-10 border border-slate-800 rounded bg-slate-950 p-1 cursor-pointer"
                    />
                    <input
                      type="text"
                      required
                      value={editingAgency.primary_color || ""}
                      onChange={(e) => setEditingAgency({ ...editingAgency, primary_color: e.target.value })}
                      className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500 flex-1 font-mono text-[10px]"
                    />
                  </div>
                </div>
                <div className="flex flex-col">
                  <label className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1">Accent Color</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={editingAgency.accent_color || "#dc2626"}
                      onChange={(e) => setEditingAgency({ ...editingAgency, accent_color: e.target.value })}
                      className="w-10 h-10 border border-slate-800 rounded bg-slate-950 p-1 cursor-pointer"
                    />
                    <input
                      type="text"
                      required
                      value={editingAgency.accent_color || ""}
                      onChange={(e) => setEditingAgency({ ...editingAgency, accent_color: e.target.value })}
                      className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500 flex-1 font-mono text-[10px]"
                    />
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-900">
                <button
                  type="button"
                  onClick={() => setIsEditAgencyModalOpen(false)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 font-semibold rounded-lg text-xs cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-750 text-white font-semibold rounded-lg text-xs cursor-pointer transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toasts */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
