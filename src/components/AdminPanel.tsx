import React, { useState, useEffect, useMemo } from "react";
import { 
  Plus, 
  Trash2, 
  Edit3, 
  Sparkles, 
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
  Trash,
  Play,
  Copy,
  Monitor,
  Smartphone,
  Eye,
  ArrowRight,
  ArrowLeft,
  Upload,
  AlertCircle
} from "lucide-react";
import { authFetch } from "../lib/supabaseClient";
import { isValidHex } from "../utils/themeHelpers";
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

  // Reset theme back to default Lumen Gold when returning to System Admin Panel
  useEffect(() => {
    document.documentElement.style.setProperty("--agency-primary", "#D6B77A");
    document.documentElement.style.setProperty("--agency-primary-hover", "#bfa063");
    document.documentElement.style.setProperty("--agency-primary-contrast", "#080808");
    document.documentElement.style.setProperty("--agency-primary-muted", "rgba(214, 183, 122, 0.12)");
    document.documentElement.style.setProperty("--agency-primary-border", "rgba(214, 183, 122, 0.28)");
  }, []);
  
  // Modals
  const [isOnboardModalOpen, setIsOnboardModalOpen] = useState(false);
  const [isEditAgencyModalOpen, setIsEditAgencyModalOpen] = useState(false);
  const [editingAgency, setEditingAgency] = useState<any>(null);
  const [isProspectWizardOpen, setIsProspectWizardOpen] = useState(false);

  // Agency Onboarding Form State
  const [agencyName, setAgencyName] = useState("");
  const [agencySlug, setAgencySlug] = useState("");
  const [agencyLogoUrl, setAgencyLogoUrl] = useState("");
  const [agencyPrimaryColor, setAgencyPrimaryColor] = useState("#8b5cf6");
  const [agencyAccentColor, setAgencyAccentColor] = useState("#ec4899");
  const [agencyClientLimit, setAgencyClientLimit] = useState(5);
  const [agencyTimezone, setAgencyTimezone] = useState("America/Phoenix");
  const [agencyIndustry, setAgencyIndustry] = useState("Marketing Agency");
  const [agencyIsDemo, setAgencyIsDemo] = useState(false);

  // Prospect Wizard State
  const [wizardStep, setWizardStep] = useState(1); // 1: Info & Branding, 2: Client Details, 3: Generation & Preview
  const [wAgencyName, setWAgencyName] = useState("");
  const [wAgencySlug, setWAgencySlug] = useState("");
  const [wLogoUrl, setWLogoUrl] = useState("");
  const [wPrimaryColor, setWPrimaryColor] = useState("#8b5cf6");
  const [wAccentColor, setWAccentColor] = useState("#ec4899");
  const [wTimezone, setWTimezone] = useState("America/Phoenix");
  const [wIndustry, setWIndustry] = useState("Marketing Agency");
  
  const [wClientName, setWClientName] = useState("");
  const [wClientIndustry, setWClientIndustry] = useState("E-commerce");
  const [wClientMarket, setWClientMarket] = useState("Phoenix, AZ");
  const [wClientPlatform, setWClientPlatform] = useState<string[]>(["Google Ads", "Meta Ads"]);
  const [wClientBudget, setWClientBudget] = useState(10000);
  const [wClientCpl, setWClientCpl] = useState(75);
  const [wClientGoal, setWClientGoal] = useState("Sales");
  const [wClientColor, setWClientColor] = useState("#3b82f6");
  const [wClientLogo, setWClientLogo] = useState("");

  const [generatingDemoData, setGeneratingDemoData] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [createdAgencyResult, setCreatedAgencyResult] = useState<any>(null);
  const [createdClientResult, setCreatedClientResult] = useState<any>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [copiedLink, setCopiedLink] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Confirm delete states
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [agencyToDelete, setAgencyToDelete] = useState<any>(null);

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
    // Reset to default Lumen Gold theme for Admin interface
    document.documentElement.style.setProperty("--agency-primary", "#D6B77A");
    document.documentElement.style.setProperty("--agency-primary-hover", "#c5af69");
    document.documentElement.style.setProperty("--agency-primary-muted", "rgba(216, 194, 122, 0.12)");
    document.documentElement.style.setProperty("--agency-primary-border", "rgba(216, 194, 122, 0.28)");
    document.documentElement.style.setProperty("--agency-primary-contrast", "#080808");

    setLoading(true);
    Promise.all([fetchAgencies(), fetchClients(), fetchLogs()]).finally(() => setLoading(false));
  }, []);

  // Sync Slug values as users type names
  useEffect(() => {
    if (agencyName) {
      setAgencySlug(agencyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
    }
  }, [agencyName]);

  useEffect(() => {
    if (wAgencyName) {
      setWAgencySlug(wAgencyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
    }
  }, [wAgencyName]);

  // Image upload base64 parser
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, setField: (url: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(",")[1];
        const res = await authFetch("/api/admin/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            fileType: file.type,
            fileData: base64
          })
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Upload request failed.");
        }

        const data = await res.json();
        setField(data.publicUrl);
        addToast("Success", "Logo uploaded successfully!", "success");
      } catch (err: any) {
        addToast("Upload Failed", err.message, "error");
      } finally {
        setUploadingLogo(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Submit standard agency onboarding
  const handleOnboardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agencyName.trim() || !agencySlug.trim()) {
      addToast("Validation Failed", "Agency name and slug are required.", "error");
      return;
    }

    try {
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
          isDemo: agencyIsDemo,
          timezone: agencyTimezone,
          industry: agencyIndustry,
          clients: []
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to onboard agency");
      }

      addToast("Success", "Agency successfully onboarded!", "success");
      setIsOnboardModalOpen(false);
      
      // Reset forms
      setAgencyName("");
      setAgencySlug("");
      setAgencyLogoUrl("");
      setAgencyPrimaryColor("#8b5cf6");
      setAgencyAccentColor("#ec4899");
      setAgencyClientLimit(5);
      setAgencyTimezone("America/Phoenix");
      setAgencyIndustry("Marketing Agency");
      setAgencyIsDemo(false);

      fetchAgencies();
      fetchLogs();
    } catch (err: any) {
      addToast("Onboarding Failed", err.message, "error");
    }
  };

  // Edit agency settings
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
          clientLimit: Number(editingAgency.client_limit),
          isDemo: editingAgency.is_demo,
          timezone: editingAgency.timezone,
          industry: editingAgency.industry
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update agency");
      }

      addToast("Updated", "Agency configuration updated successfully.", "success");
      setIsEditAgencyModalOpen(false);
      fetchAgencies();
      fetchLogs();
    } catch (err: any) {
      addToast("Update Failed", err.message, "error");
    }
  };

  // Delete agency confirmation checks
  const handleDeleteAgencyClick = (agency: any) => {
    setAgencyToDelete(agency);
    setDeleteConfirmText("");
  };

  const handleConfirmDeleteAgency = async () => {
    if (!agencyToDelete) return;
    if (deleteConfirmText.trim() !== agencyToDelete.name) {
      addToast("Validation Failed", "Verification name does not match.", "error");
      return;
    }

    try {
      const res = await authFetch(`/api/admin/agencies/${agencyToDelete.id}`, {
        method: "DELETE"
      });

      if (!res.ok) throw new Error("Failed to delete agency");

      addToast("Deleted", `Agency "${agencyToDelete.name}" deleted successfully.`, "warning");
      setAgencyToDelete(null);
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
          agencyId: targetAgencyId,
          targetCpl: clientData.targetCpl,
          brandColor: clientData.brandColor,
          industry: clientData.industry,
          primaryGoal: clientData.primaryGoal,
          primaryMarket: clientData.primaryMarket,
          logoUrl: clientData.logoUrl,
          reportingEnabled: clientData.reportingEnabled,
          reportEmail: clientData.reportEmail,
          reportCc: clientData.reportCc,
          reportDay: clientData.reportDay,
          reportTime: clientData.reportTime,
          reportTimezone: clientData.reportTimezone,
          reportPeriod: clientData.reportPeriod
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
      addToast("Updated", "Client configuration updated.", "success");
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
      addToast("Deleted", "Client removed from system.", "warning");
      fetchClients();
      fetchLogs();
    } catch (err: any) {
      addToast("Error", err.message, "error");
    }
  };

  // Run data generation for a client
  const triggerDemoGeneration = async (clientId: string, clientName: string) => {
    setGeneratingDemoData(true);
    setGenerationProgress(20);
    try {
      const res = await authFetch("/api/admin/generate-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId })
      });
      
      setGenerationProgress(70);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Demo generation request failed.");
      }
      
      setGenerationProgress(100);
      addToast("Success", `Deterministic demo data generated for ${clientName}!`, "success");
      fetchClients();
      fetchLogs();
    } catch (err: any) {
      addToast("Generation Failed", err.message, "error");
    } finally {
      setGeneratingDemoData(false);
    }
  };

  // Prospect wizard workflow submit handlers
  const openProspectDemoWizard = () => {
    setWAgencyName("");
    setWAgencySlug("");
    setWLogoUrl("");
    setWPrimaryColor("#8b5cf6");
    setWAccentColor("#ec4899");
    setWTimezone("America/Phoenix");
    setWIndustry("Marketing Agency");
    
    setWClientName("");
    setWClientIndustry("Beauty");
    setWClientMarket("Phoenix, AZ");
    setWClientPlatform(["Google Ads", "Meta Ads"]);
    setWClientBudget(10000);
    setWClientCpl(75);
    setWClientGoal("Sales");
    setWClientColor("#3b82f6");
    setWClientLogo("");

    setCreatedAgencyResult(null);
    setCreatedClientResult(null);
    setWizardStep(1);
    setIsProspectWizardOpen(true);
  };

  const handleProspectWizardSubmit = async () => {
    if (!wAgencyName.trim() || !wAgencySlug.trim() || !wClientName.trim()) {
      addToast("Validation Error", "Agency Name and Client Name are required.", "error");
      return;
    }

    setGeneratingDemoData(true);
    setGenerationProgress(10);

    try {
      // 1. Create the Agency (always is_demo = true)
      setGenerationProgress(30);
      const agRes = await authFetch("/api/admin/agencies/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: wAgencyName.trim(),
          slug: wAgencySlug.trim().toLowerCase(),
          logoUrl: wLogoUrl.trim() || null,
          primaryColor: wPrimaryColor.trim(),
          accentColor: wAccentColor.trim(),
          clientLimit: 10,
          isDemo: true,
          timezone: wTimezone,
          industry: wIndustry,
          clients: []
        })
      });

      if (!agRes.ok) {
        const err = await agRes.json();
        throw new Error(err.error || "Failed to create prospect agency.");
      }
      const agencyData = (await agRes.json()).agency;
      setCreatedAgencyResult(agencyData);

      // 2. Create the Client
      setGenerationProgress(50);
      const clRes = await authFetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: wClientName.trim(),
          domain: `${wClientName.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`,
          platform: wClientPlatform.join(" + "),
          monthlyBudget: Number(wClientBudget) || 5000,
          agencyId: agencyData.id,
          targetCpl: Number(wClientCpl) || 50,
          brandColor: wClientColor,
          industry: wClientIndustry,
          primaryGoal: wClientGoal,
          primaryMarket: wClientMarket,
          logoUrl: wClientLogo || null
        })
      });

      if (!clRes.ok) {
        const err = await clRes.json();
        throw new Error(err.error || "Failed to create prospect client.");
      }
      const clientData = await clRes.json();
      setCreatedClientResult(clientData);

      // 3. Generate deterministic metrics
      setGenerationProgress(70);
      const genRes = await authFetch("/api/admin/generate-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: clientData.id })
      });

      if (!genRes.ok) {
        const err = await genRes.json();
        throw new Error(err.error || "Failed to generate demo metrics.");
      }

      setGenerationProgress(100);
      addToast("Success", "Prospect demo dashboard generated successfully!", "success");
      setWizardStep(3); // Go to preview step
      fetchAgencies();
      fetchClients();
      fetchLogs();
    } catch (err: any) {
      addToast("Failed to Build Demo", err.message, "error");
    } finally {
      setGeneratingDemoData(false);
    }
  };

  const copyDashboardLink = () => {
    if (!createdAgencyResult) return;
    const url = `${window.location.origin}/agency/${createdAgencyResult.slug}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    addToast("Copied!", "Dashboard URL copied to clipboard.", "info");
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const togglePlatform = (plat: string) => {
    if (wClientPlatform.includes(plat)) {
      setWClientPlatform(wClientPlatform.filter((p) => p !== plat));
    } else {
      setWClientPlatform([...wClientPlatform, plat]);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-[#0b0f19] text-slate-100 overflow-hidden font-sans select-none">
      
      {/* Admin Sidebar */}
      <aside className="w-64 bg-slate-950 border-r border-slate-900/85 flex flex-col justify-between select-none h-screen shrink-0 font-sans text-left">
        <div>
          {/* Logo Branding */}
          <div className="p-5 flex items-center gap-2.5 border-b border-slate-900/40 text-left">
            <div className="w-8 h-8 rounded-lg border border-slate-850 bg-slate-900/30 flex items-center justify-center font-bold text-xs">
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
          {activeTab === "agencies" && (
            <button
              onClick={openProspectDemoWizard}
              className="px-4 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-755 hover:to-fuchsia-755 text-white font-bold rounded-lg text-xs cursor-pointer flex items-center gap-1.5 shadow-lg shadow-violet-500/10 active:scale-[0.98] transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" /> Create Prospect Demo
            </button>
          )}
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
                  {/* Header Actions */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-slate-100">White-Labeled Managed Agencies</h3>
                      <p className="text-xs text-slate-400">Configure visual branding properties and timezone mappings of tenants.</p>
                    </div>
                    <button
                      onClick={() => setIsOnboardModalOpen(true)}
                      className="px-3.5 py-2 bg-slate-900 hover:bg-slate-850 text-slate-200 border border-slate-800 font-semibold rounded-lg text-xs cursor-pointer flex items-center gap-1.5 transition-colors"
                    >
                      <Plus className="w-4 h-4" /> Create Standard Agency
                    </button>
                  </div>

                  {/* Agencies List Table */}
                  <div className="border border-slate-900 bg-slate-950/20 rounded-xl overflow-hidden shadow-lg">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-950 border-b border-slate-900 text-slate-500 font-mono uppercase tracking-wider text-[9px]">
                          <th className="p-4 font-semibold">Agency</th>
                          <th className="p-4 font-semibold">Slug / URL</th>
                          <th className="p-4 font-semibold text-center">Clients</th>
                          <th className="p-4 font-semibold">Type</th>
                          <th className="p-4 font-semibold">Industry</th>
                          <th className="p-4 font-semibold">Created At</th>
                          <th className="p-4 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900/60">
                        {agencies.map((agency) => (
                          <tr key={agency.id} className="hover:bg-slate-900/10 transition-colors">
                            <td className="p-4 font-medium flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg border border-slate-800 bg-slate-950 flex items-center justify-center font-bold text-xs uppercase shrink-0" style={{ borderColor: agency.primary_color || '#ea580c' }}>
                                {agency.logo_url && (agency.logo_url.startsWith("http") || agency.logo_url.startsWith("data:")) ? (
                                  <img src={agency.logo_url} alt="" className="w-5 h-5 object-contain" />
                                ) : (
                                  <span style={{ color: agency.primary_color || '#ea580c' }}>
                                    {agency.slug ? agency.slug.substring(0, 2).toUpperCase() : "AG"}
                                  </span>
                                )}
                              </div>
                              <div>
                                <span className="text-slate-200 font-bold block">{agency.name}</span>
                                <span className="text-[10px] text-slate-500">{agency.timezone || "America/Phoenix"}</span>
                              </div>
                            </td>
                            <td className="p-4 font-mono text-slate-400">
                              /agency/{agency.slug}
                            </td>
                            <td className="p-4 text-center font-bold text-slate-300">
                              {agency.clientsCount} <span className="text-slate-600 font-normal">/ {agency.client_limit}</span>
                            </td>
                            <td className="p-4">
                              {agency.is_demo ? (
                                <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold font-mono bg-violet-500/10 border border-violet-500/30 text-violet-400">
                                  DEMO TENANT
                                </span>
                              ) : (
                                <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold font-mono bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                                  PRODUCTION
                                </span>
                              )}
                            </td>
                            <td className="p-4 text-slate-400">
                              {agency.industry || "Marketing"}
                            </td>
                            <td className="p-4 text-slate-500 font-mono">
                              {new Date(agency.created_at).toLocaleDateString()}
                            </td>
                            <td className="p-4 text-right flex items-center justify-end gap-1.5">
                              <a
                                href={`/agency/${agency.slug}`}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 bg-slate-900 hover:bg-slate-850 rounded border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                                title="Open Dashboard View"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </a>
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
                                onClick={() => handleDeleteAgencyClick(agency)}
                                className="p-1.5 bg-slate-900 hover:bg-slate-850 rounded border border-slate-800 text-slate-400 hover:text-rose-400 transition-colors"
                                title="Delete Agency"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === "clients" && (
                <div className="space-y-6">
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
                  
                  {/* Demo metric generation actions inside panel */}
                  <div className="bg-slate-950/20 border border-slate-900 rounded-xl p-5 text-left space-y-4 shadow-lg">
                    <div>
                      <h4 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-violet-400" />
                        Quick Demo Metrics Seeder
                      </h4>
                      <p className="text-xs text-slate-400">Generate 90-days of deterministic metric pacing datasets for any demo clients.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {clients.map((c) => {
                        const clientAgency = agencies.find(a => a.id === c.agencyId);
                        const isDemoAgency = clientAgency?.is_demo === true;
                        
                        return (
                          <div key={c.id} className="bg-slate-900/10 border border-slate-900/60 p-4 rounded-lg flex items-center justify-between gap-3">
                            <div className="overflow-hidden">
                              <span className="text-xs font-bold text-slate-200 truncate block">{c.name}</span>
                              <span className="text-[10px] text-slate-500 font-mono truncate block">/{c.id} ({c.platform})</span>
                            </div>
                            <button
                              disabled={generatingDemoData || !isDemoAgency}
                              onClick={() => triggerDemoGeneration(c.id, c.name)}
                              className={`px-3 py-1.5 rounded text-[10px] font-bold cursor-pointer flex items-center gap-1 transition-colors ${
                                !isDemoAgency 
                                  ? "bg-slate-900 border border-slate-850 text-slate-600 cursor-not-allowed"
                                  : "bg-violet-600 hover:bg-violet-700 text-white"
                              }`}
                              title={!isDemoAgency ? "Demo data can only be generated for demo agencies" : "Generate Pacing Datasets"}
                            >
                              <Play className="w-2.5 h-2.5 fill-current" /> Seed Pacing
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
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

      {/* LIVE BRADING HEADER PREVIEW COMPONENT */}
      {/* Renders a sticky top-bar previewing the White-Labeled Client View Header */}
      {useMemo(() => {
        const logo = wLogoUrl || agencyLogoUrl || "";
        const name = wAgencyName || agencyName || "Prospect Brand Preview";
        const primary = wPrimaryColor || agencyPrimaryColor || "#8b5cf6";
        
        return (
          <div className="hidden">Mock memo container</div>
        );
      }, [wLogoUrl, wAgencyName, wPrimaryColor, wAccentColor, agencyLogoUrl, agencyName, agencyPrimaryColor, agencyAccentColor])}

      {/* STANDARD AGENCY ONBOARDING DIALOG MODAL */}
      {isOnboardModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-900 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl animate-scale-in flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-5 border-b border-slate-900 shrink-0">
              <h3 className="text-sm font-bold font-display uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <Plus className="w-4 h-4 text-violet-400" /> Create Standard Managed Agency
              </h3>
              <button onClick={() => setIsOnboardModalOpen(false)} className="text-slate-500 hover:text-slate-300 p-1">Close</button>
            </div>

            <form onSubmit={handleOnboardSubmit} className="p-6 overflow-y-auto space-y-5 text-left flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <label className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1">Agency Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Lever Interactive"
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
                    placeholder="e.g. lever-interactive"
                    value={agencySlug}
                    onChange={(e) => setAgencySlug(e.target.value)}
                    className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <label className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1">Industry / Agency Type</label>
                  <input
                    type="text"
                    placeholder="e.g. PPC / SEO Boutique"
                    value={agencyIndustry}
                    onChange={(e) => setAgencyIndustry(e.target.value)}
                    className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1">Timezone</label>
                  <select
                    value={agencyTimezone}
                    onChange={(e) => setAgencyTimezone(e.target.value)}
                    className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500"
                  >
                    <option value="America/Phoenix">Arizona (MST)</option>
                    <option value="America/Los_Angeles">Pacific Time (PST/PDT)</option>
                    <option value="America/New_York">Eastern Time (EST/EDT)</option>
                    <option value="America/Chicago">Central Time (CST/CDT)</option>
                    <option value="UTC">Coordinated Universal Time (UTC)</option>
                  </select>
                </div>
              </div>

              {/* Logo Upload / URL */}
              <div className="flex flex-col">
                <label className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1">Agency Logo</label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder="https://example.com/logo.png"
                    value={agencyLogoUrl}
                    onChange={(e) => setAgencyLogoUrl(e.target.value)}
                    className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500 flex-1"
                  />
                  <label className="px-4 py-2.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 font-bold rounded-lg text-xs cursor-pointer flex items-center gap-1.5 shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleLogoUpload(e, setAgencyLogoUrl)}
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <label className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1">Tenant Type</label>
                  <select
                    value={agencyIsDemo ? "true" : "false"}
                    onChange={(e) => setAgencyIsDemo(e.target.value === "true")}
                    className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500"
                  >
                    <option value="true">Demo Tenant (Allow seed data generation)</option>
                    <option value="false">Production (Protected customer context)</option>
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1">Client Capacity Cap</label>
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

              {/* Brand colors selection */}
              <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-900">
                <div className="flex flex-col">
                  <label className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1">Primary Color (Hex)</label>
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
                      className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500 flex-1 font-mono"
                    />
                  </div>
                </div>
                <div className="flex flex-col">
                  <label className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1">Secondary Accent Color (Hex)</label>
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
                      className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500 flex-1 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* LIVE BRAND PREVIEW */}
              <div className="border border-slate-900 rounded-lg p-3 bg-slate-950/40 text-left mt-3">
                <span className="text-[9px] font-mono tracking-widest text-slate-500 uppercase block mb-2">Live Brand Accent Preview</span>
                <div className="flex items-center justify-between border-b pb-2 px-1" style={{ borderBottomColor: isValidHex(agencyPrimaryColor) ? agencyPrimaryColor : "#D6B77A" }}>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-slate-900 border flex items-center justify-center font-bold text-[8px] uppercase shrink-0" style={{ borderColor: isValidHex(agencyPrimaryColor) ? agencyPrimaryColor : "#D6B77A" }}>
                      {agencyLogoUrl ? (
                        <img src={agencyLogoUrl} alt="" className="w-4 h-4 object-contain" />
                      ) : (
                        <span style={{ color: isValidHex(agencyPrimaryColor) ? agencyPrimaryColor : "#D6B77A" }}>
                          {agencyName ? agencyName.substring(0, 2).toUpperCase() : "AG"}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-bold text-slate-200">
                      {agencyName || "Agency Name"}
                    </span>
                  </div>
                  
                  <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: isValidHex(agencyPrimaryColor) ? agencyPrimaryColor : "#D6B77A" }}>
                    Active Accent
                  </span>
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
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-lg text-xs cursor-pointer transition-colors"
                >
                  Create Agency
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
            <div className="flex items-center justify-between p-5 border-b border-slate-900">
              <h3 className="text-sm font-bold font-display uppercase tracking-wider text-slate-200">
                Edit Agency Configurations Settings
              </h3>
              <button onClick={() => setIsEditAgencyModalOpen(false)} className="text-slate-500 hover:text-slate-300 p-1">Close</button>
            </div>

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
                <label className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1">Agency URL Slug</label>
                <input
                  type="text"
                  required
                  value={editingAgency.slug}
                  onChange={(e) => setEditingAgency({ ...editingAgency, slug: e.target.value })}
                  className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <label className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1">Timezone</label>
                  <select
                    value={editingAgency.timezone || "America/Phoenix"}
                    onChange={(e) => setEditingAgency({ ...editingAgency, timezone: e.target.value })}
                    className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500"
                  >
                    <option value="America/Phoenix">Arizona (MST)</option>
                    <option value="America/Los_Angeles">Pacific (PST/PDT)</option>
                    <option value="America/New_York">Eastern (EST/EDT)</option>
                    <option value="America/Chicago">Central (CST/CDT)</option>
                    <option value="UTC">Coordinated Universal (UTC)</option>
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1">Client limit</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={editingAgency.client_limit}
                    onChange={(e) => setEditingAgency({ ...editingAgency, client_limit: Number(e.target.value) })}
                    className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
              </div>

              <div className="flex flex-col">
                <label className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1">Logo URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editingAgency.logo_url || ""}
                    onChange={(e) => setEditingAgency({ ...editingAgency, logo_url: e.target.value })}
                    className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500 flex-1"
                  />
                  <label className="px-3 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 font-bold rounded-lg text-xs cursor-pointer flex items-center gap-1 shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleLogoUpload(e, (url) => setEditingAgency({ ...editingAgency, logo_url: url }))}
                    />
                  </label>
                </div>
              </div>

              <div className="flex flex-col">
                <label className="text-[10px] font-mono tracking-wider text-slate-500 uppercase mb-1">Tenant Type</label>
                <select
                  value={editingAgency.is_demo ? "true" : "false"}
                  onChange={(e) => setEditingAgency({ ...editingAgency, is_demo: e.target.value === "true" })}
                  className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500"
                >
                  <option value="true">Demo Tenant (Allow seed data generation)</option>
                  <option value="false">Production (Protected customer context)</option>
                </select>
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

              {/* LIVE BRAND PREVIEW */}
              <div className="border border-slate-900 rounded-lg p-3 bg-slate-950/40 text-left mt-3">
                <span className="text-[9px] font-mono tracking-widest text-slate-500 uppercase block mb-2">Live Brand Accent Preview</span>
                <div className="flex items-center justify-between border-b pb-2 px-1" style={{ borderBottomColor: isValidHex(editingAgency.primary_color) ? editingAgency.primary_color : "#D6B77A" }}>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-slate-900 border flex items-center justify-center font-bold text-[8px] uppercase shrink-0" style={{ borderColor: isValidHex(editingAgency.primary_color) ? editingAgency.primary_color : "#D6B77A" }}>
                      {editingAgency.logo_url ? (
                        <img src={editingAgency.logo_url} alt="" className="w-4 h-4 object-contain" />
                      ) : (
                        <span style={{ color: isValidHex(editingAgency.primary_color) ? editingAgency.primary_color : "#D6B77A" }}>
                          {editingAgency.name ? editingAgency.name.substring(0, 2).toUpperCase() : "AG"}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-bold text-slate-200">
                      {editingAgency.name || "Agency Name"}
                    </span>
                  </div>
                  
                  <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: isValidHex(editingAgency.primary_color) ? editingAgency.primary_color : "#D6B77A" }}>
                    Active Accent
                  </span>
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
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-lg text-xs cursor-pointer transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DANGEROUS DELETION CONFIRMATION DIALOG MODAL */}
      {agencyToDelete && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-red-500/25 rounded-xl w-full max-w-md overflow-hidden shadow-2xl animate-scale-in text-left">
            <div className="p-5 border-b border-slate-900 bg-red-950/15 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <h3 className="text-sm font-bold text-red-200 uppercase tracking-wider font-display">
                Confirm Destructive Agency Deletion
              </h3>
            </div>
            
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-400 leading-relaxed">
                This operation is **permanent** and will immediately destroy agency **"{agencyToDelete.name}"**, all connected clients, AI summaries, and database campaign metrics rows.
              </p>
              
              <div className="flex flex-col">
                <label className="text-[10px] font-mono text-slate-500 uppercase mb-2">
                  Type the exact agency name <strong className="text-slate-300 font-mono">"{agencyToDelete.name}"</strong> to confirm:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Lever Interactive"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="bg-slate-900/50 border border-red-500/20 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-900 shrink-0 bg-slate-950/40">
              <button
                onClick={() => setAgencyToDelete(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 font-semibold rounded-lg text-xs cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={deleteConfirmText !== agencyToDelete.name}
                onClick={handleConfirmDeleteAgency}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  deleteConfirmText === agencyToDelete.name
                    ? "bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/10"
                    : "bg-slate-900 text-slate-600 border border-slate-850 cursor-not-allowed"
                }`}
              >
                Confirm Destructive Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SALES PROSPECT DEMO BUILDER WIZARD FLOW */}
      {isProspectWizardOpen && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-900 rounded-xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col h-[85vh] animate-scale-in">
            {/* Wizard Header Progress Indicator */}
            <div className="flex items-center justify-between p-5 border-b border-slate-900 shrink-0 bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold font-display uppercase tracking-wider text-slate-200">
                    Lumen 2-Minute Sales Prospect Demo Builder
                  </h3>
                  <p className="text-[10px] text-slate-400">Rapidly spin up a personalized branding metrics dashboard during client sales calls.</p>
                </div>
              </div>
              <button
                disabled={generatingDemoData}
                onClick={() => setIsProspectWizardOpen(false)}
                className="text-slate-500 hover:text-slate-300 p-1"
              >
                Exit Wizard
              </button>
            </div>

            {/* Steps indicator bar */}
            <div className="bg-slate-950 border-b border-slate-900/60 px-6 py-3 flex items-center gap-6 text-[10px] font-mono tracking-wider text-slate-500 shrink-0 uppercase">
              <div className={`flex items-center gap-2 ${wizardStep === 1 ? 'text-violet-400 font-bold' : wizardStep > 1 ? 'text-emerald-400' : ''}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${wizardStep === 1 ? 'bg-violet-600/10 border border-violet-500' : wizardStep > 1 ? 'bg-emerald-600/10 border border-emerald-500 text-emerald-400' : 'border border-slate-800'}`}>
                  {wizardStep > 1 ? <Check className="w-3 h-3" /> : "1"}
                </span>
                <span>Agency Branding</span>
              </div>
              <div className="w-8 h-px bg-slate-900"></div>
              <div className={`flex items-center gap-2 ${wizardStep === 2 ? 'text-violet-400 font-bold' : wizardStep > 2 ? 'text-emerald-400' : ''}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${wizardStep === 2 ? 'bg-violet-600/10 border border-violet-500' : wizardStep > 2 ? 'bg-emerald-600/10 border border-emerald-500 text-emerald-400' : 'border border-slate-800'}`}>
                  {wizardStep > 2 ? <Check className="w-3 h-3" /> : "2"}
                </span>
                <span>Prospect Client details</span>
              </div>
              <div className="w-8 h-px bg-slate-900"></div>
              <div className={`flex items-center gap-2 ${wizardStep === 3 ? 'text-violet-400 font-bold' : ''}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${wizardStep === 3 ? 'bg-violet-600/10 border border-violet-500' : 'border border-slate-800'}`}>
                  3
                </span>
                <span>Generate & Preview Live</span>
              </div>
            </div>

            {/* Steps Container Panel */}
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
              
              {/* Form Input Columns */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5 border-r border-slate-900/60 text-left">
                {wizardStep === 1 && (
                  <div className="space-y-4 animate-fade-in">
                    <div>
                      <h4 className="text-xs font-bold font-display uppercase tracking-wider text-slate-300">Step 1: Agency Brand Information</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">Input the prospect's marketing agency meta properties and brand colors.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col">
                        <label className="text-[9px] font-mono text-slate-500 uppercase mb-1">Agency Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Lever Interactive"
                          value={wAgencyName}
                          onChange={(e) => setWAgencyName(e.target.value)}
                          className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[9px] font-mono text-slate-500 uppercase mb-1">URL Slug</label>
                        <input
                          type="text"
                          required
                          placeholder="lever-interactive"
                          value={wAgencySlug}
                          onChange={(e) => setWAgencySlug(e.target.value)}
                          className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col">
                        <label className="text-[9px] font-mono text-slate-500 uppercase mb-1">Industry Type</label>
                        <input
                          type="text"
                          placeholder="e.g. Performance Marketing"
                          value={wIndustry}
                          onChange={(e) => setWIndustry(e.target.value)}
                          className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[9px] font-mono text-slate-500 uppercase mb-1">Timezone</label>
                        <select
                          value={wTimezone}
                          onChange={(e) => setWTimezone(e.target.value)}
                          className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500"
                        >
                          <option value="America/Phoenix">Arizona (MST)</option>
                          <option value="America/Los_Angeles">Pacific (PST)</option>
                          <option value="America/New_York">Eastern (EST)</option>
                          <option value="America/Chicago">Central (CST)</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-col">
                      <label className="text-[9px] font-mono text-slate-500 uppercase mb-1">Agency Logo (URL or Upload)</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="https://example.com/logo.png"
                          value={wLogoUrl}
                          onChange={(e) => setWLogoUrl(e.target.value)}
                          className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500 flex-1"
                        />
                        <label className="px-4 py-2.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 font-bold rounded-lg text-xs cursor-pointer flex items-center gap-1.5 shrink-0">
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handleLogoUpload(e, setWLogoUrl)}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div className="flex flex-col">
                        <label className="text-[9px] font-mono text-slate-500 uppercase mb-1">Primary Color (Hex)</label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={wPrimaryColor}
                            onChange={(e) => setWPrimaryColor(e.target.value)}
                            className="w-10 h-10 border border-slate-800 rounded bg-slate-950 p-1 cursor-pointer"
                          />
                          <input
                            type="text"
                            required
                            value={wPrimaryColor}
                            onChange={(e) => setWPrimaryColor(e.target.value)}
                            className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500 flex-1 font-mono"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[9px] font-mono text-slate-500 uppercase mb-1">Accent Accent (Hex)</label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={wAccentColor}
                            onChange={(e) => setWAccentColor(e.target.value)}
                            className="w-10 h-10 border border-slate-800 rounded bg-slate-950 p-1 cursor-pointer"
                          />
                          <input
                            type="text"
                            required
                            value={wAccentColor}
                            onChange={(e) => setWAccentColor(e.target.value)}
                            className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500 flex-1 font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {wizardStep === 2 && (
                  <div className="space-y-4 animate-fade-in">
                    <div>
                      <h4 className="text-xs font-bold font-display uppercase tracking-wider text-slate-300">Step 2: Client Demographics & Budgets</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">Define client metrics parameters. Non-configured settings will default realistically.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col">
                        <label className="text-[9px] font-mono text-slate-500 uppercase mb-1">Client Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Tatcha"
                          value={wClientName}
                          onChange={(e) => setWClientName(e.target.value)}
                          className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[9px] font-mono text-slate-500 uppercase mb-1">Industry Vertical</label>
                        <select
                          value={wClientIndustry}
                          onChange={(e) => setWClientIndustry(e.target.value)}
                          className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500"
                        >
                          <option value="Beauty">Beauty / E-Commerce</option>
                          <option value="Roofing">Roofing / Home Services</option>
                          <option value="Dental">Dental / Healthcare</option>
                          <option value="SaaS">SaaS / B2B</option>
                          <option value="Retail">Retail / Ecom</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col">
                        <label className="text-[9px] font-mono text-slate-500 uppercase mb-1">Primary Geographic Market</label>
                        <select
                          value={wClientMarket}
                          onChange={(e) => setWClientMarket(e.target.value)}
                          className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500"
                        >
                          <option value="Phoenix, AZ">Phoenix, AZ Area</option>
                          <option value="Los Angeles, CA">Los Angeles, CA Area</option>
                          <option value="New York, NY">New York, NY Area</option>
                        </select>
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[9px] font-mono text-slate-500 uppercase mb-1">Primary Acquisition Goal</label>
                        <select
                          value={wClientGoal}
                          onChange={(e) => setWClientGoal(e.target.value)}
                          className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500"
                        >
                          <option value="Sales">E-Commerce Sales (ROAS active)</option>
                          <option value="Leads">Lead Gen Form Submits</option>
                          <option value="Appointments">Booking Appointments</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col">
                        <label className="text-[9px] font-mono text-slate-500 uppercase mb-1">Monthly Budget ($)</label>
                        <input
                          type="number"
                          value={wClientBudget}
                          onChange={(e) => setWClientBudget(Number(e.target.value))}
                          className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[9px] font-mono text-slate-500 uppercase mb-1">Target Lead CPL ($)</label>
                        <input
                          type="number"
                          value={wClientCpl}
                          onChange={(e) => setWClientCpl(Number(e.target.value))}
                          className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col">
                      <label className="text-[9px] font-mono text-slate-500 uppercase mb-1">Ad Platforms (Multi-Select)</label>
                      <div className="flex gap-2">
                        {["Google Ads", "Meta Ads", "TikTok Ads", "Microsoft Ads"].map((plat) => {
                          const active = wClientPlatform.includes(plat);
                          return (
                            <button
                              key={plat}
                              type="button"
                              onClick={() => togglePlatform(plat)}
                              className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                                active
                                  ? "bg-violet-600/10 border-violet-500 text-violet-300"
                                  : "bg-slate-900 border-slate-850 text-slate-400 hover:border-slate-800"
                              }`}
                            >
                              {plat}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-900">
                      <div className="flex flex-col">
                        <label className="text-[9px] font-mono text-slate-500 uppercase mb-1">Client Brand Color</label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={wClientColor}
                            onChange={(e) => setWClientColor(e.target.value)}
                            className="w-10 h-10 border border-slate-800 rounded bg-slate-950 p-1 cursor-pointer"
                          />
                          <input
                            type="text"
                            required
                            value={wClientColor}
                            onChange={(e) => setWClientColor(e.target.value)}
                            className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500 flex-1 font-mono"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[9px] font-mono text-slate-500 uppercase mb-1">Client Logo URL</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Optional URL"
                            value={wClientLogo}
                            onChange={(e) => setWClientLogo(e.target.value)}
                            className="bg-slate-900/50 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-violet-500 flex-1"
                          />
                          <label className="px-3 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 font-bold rounded-lg text-xs cursor-pointer flex items-center gap-1 shrink-0">
                            <Upload className="w-3.5 h-3.5" />
                            <span>Upload</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => handleLogoUpload(e, setWClientLogo)}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {wizardStep === 3 && (
                  <div className="space-y-5 animate-fade-in h-full flex flex-col justify-between">
                    <div className="space-y-3">
                      <div>
                        <h4 className="text-xs font-bold font-display uppercase tracking-wider text-slate-300">Step 3: Demo Preview & Dashboard Link</h4>
                        <p className="text-[10px] text-slate-500 mt-0.5">Prospect demo is ready. Open dashboard preview or copy link to share.</p>
                      </div>

                      <div className="bg-slate-900/20 border border-slate-900 p-4 rounded-lg space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <span className="text-slate-500">Agency:</span>
                            <strong className="text-slate-200 block">{createdAgencyResult?.name}</strong>
                          </div>
                          <div>
                            <span className="text-slate-500">Client:</span>
                            <strong className="text-slate-200 block">{createdClientResult?.name}</strong>
                          </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                          <button
                            onClick={copyDashboardLink}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-lg text-xs font-bold text-slate-300 transition-all cursor-pointer active:scale-98"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            {copiedLink ? "Copied!" : "Copy Dashboard Link"}
                          </button>

                          <a
                            href={`/agency/${createdAgencyResult?.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-98"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Open Dashboard View
                          </a>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 border-t border-slate-900/80 pt-3 text-[10px] font-mono uppercase text-slate-500 shrink-0">
                      <span>Preview Window Mode:</span>
                      <button
                        onClick={() => setPreviewMode("desktop")}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded cursor-pointer ${
                          previewMode === "desktop" ? "bg-slate-900 text-slate-200 border border-slate-800" : "text-slate-500"
                        }`}
                      >
                        <Monitor className="w-3 h-3" /> Desktop
                      </button>
                      <button
                        onClick={() => setPreviewMode("mobile")}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded cursor-pointer ${
                          previewMode === "mobile" ? "bg-slate-900 text-slate-200 border border-slate-800" : "text-slate-500"
                        }`}
                      >
                        <Smartphone className="w-3 h-3" /> Mobile View
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Real-time Dynamic Brand Preview Column */}
              <div className="flex-1 bg-slate-950/40 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-900/60 bg-slate-950/20 text-left shrink-0">
                  <span className="text-[9px] font-mono tracking-wider text-slate-500 uppercase block">
                    {wizardStep === 3 ? "Prospect Live Frame Sandbox" : "Live branding preview header"}
                  </span>
                </div>

                <div className="flex-1 p-5 flex items-center justify-center overflow-hidden">
                  {wizardStep === 3 ? (
                    /* Interactive laptop/mobile Frame sandbox */
                    <div className={`transition-all duration-300 border border-slate-800 bg-slate-950 flex flex-col shadow-2xl relative ${
                      previewMode === "desktop" ? "w-full h-full rounded-lg" : "w-[340px] h-[520px] rounded-3xl"
                    }`}>
                      {/* Frame bezel decor */}
                      <div className="h-6 bg-slate-900 border-b border-slate-850 shrink-0 flex items-center justify-between px-3 text-[8px] text-slate-500 font-mono">
                        <span>Lumen Device Frame Sandbox</span>
                        <div className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-800"></span>
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-800"></span>
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-800"></span>
                        </div>
                      </div>

                      {/* Actual mounted sandbox iframe */}
                      <iframe
                        src={`/agency/${createdAgencyResult?.slug}`}
                        className="flex-1 w-full border-none bg-slate-950"
                        title="Prospect Live Preview Sandbox"
                      />
                    </div>
                  ) : (
                    /* Dashboard Header Branding Live Preview mock-up */
                    <div className="w-full max-w-md bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-2xl space-y-4 text-left">
                      <div className="border border-slate-900 bg-slate-900/20 rounded-lg p-3 relative overflow-hidden">
                        {/* Decorative dynamic header bar */}
                        <div className="h-9 border-b flex items-center justify-between px-3" style={{ borderBottomColor: wPrimaryColor || agencyPrimaryColor || '#8b5cf6' }}>
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded bg-slate-950 border flex items-center justify-center font-bold text-[9px] uppercase shrink-0" style={{ borderColor: wPrimaryColor || agencyPrimaryColor || '#8b5cf6' }}>
                              {(wLogoUrl || agencyLogoUrl) ? (
                                <img src={wLogoUrl || agencyLogoUrl} alt="" className="w-3.5 h-3.5 object-contain" />
                              ) : (
                                <span style={{ color: wPrimaryColor || agencyPrimaryColor || '#8b5cf6' }}>
                                  {(wAgencySlug || agencySlug) ? (wAgencySlug || agencySlug).substring(0,2).toUpperCase() : "AG"}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-bold text-slate-300">
                              {wAgencyName || agencyName || "Prospect Brand"}
                            </span>
                          </div>
                          
                          {/* Mini dynamic menu item */}
                          <div className="flex items-center gap-2 text-[9px] font-mono text-slate-500">
                            <span className="w-2.5 h-2.5 rounded-full bg-slate-800"></span>
                            <span className="w-10 h-2 rounded bg-slate-900"></span>
                          </div>
                        </div>

                        {/* Visual details body placeholder */}
                        <div className="p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="w-8 h-8 rounded bg-slate-900 shrink-0"></span>
                            <div className="space-y-1">
                              <span className="w-16 h-2 bg-slate-900 block rounded"></span>
                              <span className="w-24 h-1.5 bg-slate-900 block rounded"></span>
                            </div>
                          </div>
                          
                          {/* Primary CTA Highlight */}
                          <div className="flex gap-2 pt-2">
                            <div className="w-14 h-5 rounded bg-slate-900 border text-[8px] font-bold flex items-center justify-center text-slate-500" style={{ borderColor: wAccentColor || agencyAccentColor || '#ec4899' }}>
                              Branding
                            </div>
                            <div className="w-24 h-5 rounded text-[8px] font-bold flex items-center justify-center text-white" style={{ backgroundColor: wPrimaryColor || agencyPrimaryColor || '#8b5cf6' }}>
                              Primary Accent
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-[10px] text-slate-500 leading-normal bg-slate-900/10 p-3 rounded border border-slate-900">
                        ✨ **Branding Live Syncing**: Header matches color tokens in real-time. Uploading custom logo assets immediately renders on preview layout.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Wizard Navigation Footer bar */}
            <div className="p-4 bg-slate-950/60 border-t border-slate-900 flex items-center justify-between shrink-0">
              <div>
                {wizardStep > 1 && wizardStep < 3 && (
                  <button
                    disabled={generatingDemoData}
                    onClick={() => setWizardStep(wizardStep - 1)}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 font-semibold rounded-lg text-xs cursor-pointer flex items-center gap-1.5 transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                {generatingDemoData && (
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mr-2">
                    <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                    <span>Seeding metrics... {generationProgress}%</span>
                  </div>
                )}

                {wizardStep === 1 && (
                  <button
                    onClick={() => {
                      if (!wAgencyName.trim()) {
                        addToast("Required Field", "Please enter an Agency Name.", "warning");
                        return;
                      }
                      setWizardStep(2);
                    }}
                    className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-lg text-xs cursor-pointer flex items-center gap-1.5 transition-colors"
                  >
                    Continue to Clients <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}

                {wizardStep === 2 && (
                  <button
                    disabled={generatingDemoData}
                    onClick={() => {
                      if (!wClientName.trim()) {
                        addToast("Required Field", "Please enter a Client Name.", "warning");
                        return;
                      }
                      handleProspectWizardSubmit();
                    }}
                    className="px-5 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white font-bold rounded-lg text-xs cursor-pointer flex items-center gap-1.5 transition-colors shadow-lg shadow-violet-500/10"
                  >
                    Generate Demo Dashboard <Sparkles className="w-3.5 h-3.5" />
                  </button>
                )}

                {wizardStep === 3 && (
                  <button
                    onClick={() => setIsProspectWizardOpen(false)}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 font-semibold rounded-lg text-xs cursor-pointer transition-colors"
                  >
                    Finish & Close
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
