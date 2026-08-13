import React, { useState, useEffect } from "react";
import { 
  Users, 
  Plus, 
  Edit3, 
  Trash2, 
  Search, 
  Filter, 
  X, 
  AlertTriangle,
  Globe,
  DollarSign,
  Briefcase,
  Upload,
  FileSpreadsheet,
  Loader2,
  Link as LinkIcon,
  ExternalLink,
  Copy,
  RotateCw,
  ShieldCheck,
  Check
} from "lucide-react";
import { ClientAccount } from "../types";
import { authFetch } from "../lib/supabaseClient";

interface ClientsManagerProps {
  clients: ClientAccount[];
  onAddClient: (client: Omit<ClientAccount, "id" | "createdAt" | "status"> & { agencyId?: string }) => Promise<void>;
  onUpdateClient: (id: string, updates: Partial<ClientAccount>, silent?: boolean) => Promise<void>;
  onDeleteClient: (id: string) => Promise<void>;
  addToast: (title: string, description?: string, type?: "success" | "error" | "warning" | "info") => void;
  clientLimit?: number;
  isAdmin?: boolean;
  profile?: any;
}

export default function ClientsManager({ 
  clients, 
  onAddClient, 
  onUpdateClient, 
  onDeleteClient,
  addToast,
  clientLimit = 5,
  isAdmin = false,
  profile
}: ClientsManagerProps) {
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState("All");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientAccount | null>(null);

  // CSV Import States
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importingClient, setImportingClient] = useState<ClientAccount | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importErrors, setImportErrors] = useState<string[] | null>(null);
  const [importing, setImporting] = useState(false);

  // Form State & Validation Error triggers (Simple Zod-like unified validation experience)
  const [formName, setFormName] = useState("");
  const [formDomain, setFormDomain] = useState("");
  const [formPlatform, setFormPlatform] = useState<any>("All Platforms");
  const [formBudget, setFormBudget] = useState("");
  const [formAgencyId, setFormAgencyId] = useState("");
  const [formTargetCpl, setFormTargetCpl] = useState("");
  const [formBrandColor, setFormBrandColor] = useState("#3b82f6");
  const [formIndustry, setFormIndustry] = useState("");
  const [formPrimaryGoal, setFormPrimaryGoal] = useState("Leads");
  const [formPrimaryMarket, setFormPrimaryMarket] = useState("Phoenix, AZ");
  const [formLogoUrl, setFormLogoUrl] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  
  const [reportingEnabled, setReportingEnabled] = useState(false);
  const [reportEmail, setReportEmail] = useState("");
  const [reportCc, setReportCc] = useState("");
  const [reportDay, setReportDay] = useState(1);
  const [reportTime, setReportTime] = useState("08:00");
  const [reportTimezone, setReportTimezone] = useState("UTC");
  const [reportPeriod, setReportPeriod] = useState<any>("weekly");

  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState("");
  const [showTestInput, setShowTestInput] = useState(false);

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Secure Client Portal Access States
  const [portalAccessInfo, setPortalAccessInfo] = useState<{
    enabled: boolean;
    token?: string;
    portalUrl?: string | null;
    lastRotatedAt?: string | null;
  } | null>(null);
  const [loadingPortalInfo, setLoadingPortalInfo] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [rotatingPortalToken, setRotatingPortalToken] = useState(false);

  const fetchPortalAccessInfo = async (clientId: string) => {
    setLoadingPortalInfo(true);
    setPortalError(null);
    try {
      const res = await authFetch(`/api/clients/${clientId}/portal-access`);
      if (res.ok) {
        const data = await res.json();
        setPortalAccessInfo(data);
      } else {
        const errData = await res.json().catch(() => ({}));
        setPortalError(errData.error || "Unable to load portal access info.");
      }
    } catch (err: any) {
      console.error("Failed to load portal info:", err);
      setPortalError(err.message || "Unable to load portal access info.");
    } finally {
      setLoadingPortalInfo(false);
    }
  };

  const handleRotatePortalToken = async () => {
    if (!editingClient) return;
    if (!window.confirm(`Rotate secure portal link for ${editingClient.name}? The previous portal link will immediately stop working.`)) return;
    setRotatingPortalToken(true);
    try {
      const res = await authFetch(`/api/clients/${editingClient.id}/portal-access/rotate`, { method: "POST" });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to rotate portal link.");
      }
      const data = await res.json();
      setPortalAccessInfo(prev => ({
        ...(prev || {}),
        enabled: data.enabled,
        portalUrl: data.portalUrl,
        lastRotatedAt: data.lastRotatedAt || new Date().toISOString()
      }));
      addToast("Portal Link Rotated", "Generated new secure portal link. Old link invalidated.", "success");
    } catch (err: any) {
      addToast("Rotation Failed", err.message || "Failed to rotate link.", "error");
    } finally {
      setRotatingPortalToken(false);
    }
  };

  const handleTogglePortalAccess = async () => {
    if (!editingClient) return;
    const nextState = !(portalAccessInfo?.enabled);
    try {
      const res = await authFetch(`/api/clients/${editingClient.id}/portal-access/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextState })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to update portal status.");
      }
      const data = await res.json();
      setPortalAccessInfo(prev => ({
        ...(prev || {}),
        enabled: data.enabled,
        portalUrl: data.portalUrl
      }));
      addToast("Portal Status Updated", `Client portal status set to: ${nextState ? "ENABLED" : "DISABLED"}`, "success");
    } catch (err: any) {
      addToast("Toggle Failed", err.message || "Failed to toggle portal access.", "error");
    }
  };

  const handleCopyPortalLink = () => {
    if (portalAccessInfo?.portalUrl) {
      navigator.clipboard.writeText(portalAccessInfo.portalUrl);
      addToast("Link Copied", "Client portal production URL copied to clipboard!", "success");
    }
  };

  const [agenciesList, setAgenciesList] = useState<any[]>([]);

  useEffect(() => {
    if (isAdmin) {
      authFetch("/api/agencies")
        .then(res => res.json())
        .then(data => {
          setAgenciesList(data);
          if (data.length > 0) {
            setFormAgencyId(data[0].id);
          }
        })
        .catch(err => console.error("Failed to load agencies in ClientsManager:", err));
    }
  }, [isAdmin]);

  // Filter clients list
  const filteredClients = clients.filter((client) => {
    const matchesSearch = client.name.toLowerCase().includes(search.toLowerCase()) || 
                          client.domain.toLowerCase().includes(search.toLowerCase());
    const matchesPlatform = platformFilter === "All" || client.platform === platformFilter;
    return matchesSearch && matchesPlatform;
  });

  // Open modal for Create/Edit
  const handleOpenCreateModal = () => {
    setEditingClient(null);
    setFormName("");
    setFormDomain("");
    setFormPlatform("All Platforms");
    setFormBudget("");
    setFormTargetCpl("");
    setFormBrandColor("#3b82f6");
    setFormIndustry("");
    setFormPrimaryGoal("Leads");
    setFormPrimaryMarket("Phoenix, AZ");
    setFormLogoUrl("");
    setReportingEnabled(false);
    setReportEmail("");
    setReportCc("");
    setReportDay(1);
    setReportTime("08:00");
    setReportTimezone("UTC");
    setReportPeriod("weekly");
    setShowTestInput(false);
    setTestEmailAddress("");
    if (isAdmin && agenciesList.length > 0) {
      setFormAgencyId(agenciesList[0].id);
    } else {
      setFormAgencyId(profile?.agencyId || "");
    }
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (client: ClientAccount) => {
    setEditingClient(client);
    setFormName(client.name);
    setFormDomain(client.domain);
    setFormPlatform(client.platform);
    setFormBudget(client.monthlyBudget.toString());
    setFormTargetCpl(client.targetCpl?.toString() || "");
    setFormBrandColor(client.brandColor || "#3b82f6");
    setFormIndustry(client.industry || "");
    setFormPrimaryGoal(client.primaryGoal || "Leads");
    setFormPrimaryMarket(client.primaryMarket || "Phoenix, AZ");
    setFormLogoUrl(client.logoUrl || "");
    setReportingEnabled(client.reportingEnabled || false);
    setReportEmail(client.reportEmail || "");
    setReportCc(client.reportCc || "");
    setReportDay(client.reportDay !== undefined ? client.reportDay : 1);
    setReportTime(client.reportTime || "08:00");
    setReportTimezone(client.reportTimezone || "UTC");
    setReportPeriod(client.reportPeriod || "weekly");
    setShowTestInput(false);
    setTestEmailAddress(client.reportEmail || "");
    setFormAgencyId((client as any).agencyId || profile?.agencyId || "");
    setFormErrors({});
    setIsModalOpen(true);
    fetchPortalAccessInfo(client.id);
  };

  const handleOpenImportModal = (client: ClientAccount) => {
    setImportingClient(client);
    setImportFile(null);
    setImportErrors(null);
    setImporting(false);
    setIsImportModalOpen(true);
  };

  const handleClientLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
        setFormLogoUrl(data.publicUrl);
        addToast("Success", "Client logo uploaded successfully!", "success");
      } catch (err: any) {
        addToast("Upload Failed", err.message, "error");
      } finally {
        setUploadingLogo(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePreviewReport = async () => {
    if (!editingClient) return;
    setLoadingPreview(true);
    try {
      const res = await authFetch(`/api/clients/${editingClient.id}/report/preview`);
      if (!res.ok) throw new Error("Failed to load report preview HTML.");
      const html = await res.text();
      setPreviewHtml(html);
      setIsPreviewModalOpen(true);
    } catch (err: any) {
      addToast("Preview Failed", err.message || "Failed to fetch HTML preview.", "error");
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!editingClient) return;
    if (!testEmailAddress || !testEmailAddress.includes("@")) {
      addToast("Invalid Email", "Please provide a valid test recipient email address.", "error");
      return;
    }
    setSendingTest(true);
    try {
      const res = await authFetch(`/api/clients/${editingClient.id}/report/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testEmail: testEmailAddress })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to dispatch test email.");
      }
      addToast("Email Dispatched", `Test report successfully sent to: ${testEmailAddress}`, "success");
      setShowTestInput(false);
    } catch (err: any) {
      addToast("Dispatch Failed", err.message || "Error occurred during delivery attempt.", "error");
    } finally {
      setSendingTest(false);
    }
  };

  const hasChanges = () => {
    if (editingClient) {
      const dbCpl = editingClient.targetCpl !== null && editingClient.targetCpl !== undefined ? editingClient.targetCpl.toString() : "";
      const formCpl = formTargetCpl || "";
      const dbBrand = editingClient.brandColor || "#3b82f6";
      const formBrand = formBrandColor || "#3b82f6";
      const dbIndustry = editingClient.industry || "";
      const formInd = formIndustry || "";
      const dbLogo = editingClient.logoUrl || "";
      const formLogo = formLogoUrl || "";
      const dbReportEmail = editingClient.reportEmail || "";
      const formReportEmail = reportEmail || "";
      const dbReportCc = editingClient.reportCc || "";
      const formReportCc = reportCc || "";

      return (
        formName.trim() !== editingClient.name ||
        formDomain.trim().toLowerCase() !== editingClient.domain ||
        formPlatform !== editingClient.platform ||
        formBudget !== editingClient.monthlyBudget.toString() ||
        formCpl !== dbCpl ||
        formBrand.toLowerCase() !== dbBrand.toLowerCase() ||
        formInd.trim() !== dbIndustry ||
        formPrimaryGoal !== (editingClient.primaryGoal || "Leads") ||
        formPrimaryMarket !== (editingClient.primaryMarket || "Phoenix, AZ") ||
        formLogo.trim() !== dbLogo ||
        reportingEnabled !== (editingClient.reportingEnabled || false) ||
        formReportEmail.trim() !== dbReportEmail ||
        formReportCc.trim() !== dbReportCc ||
        reportDay !== (editingClient.reportDay !== undefined ? editingClient.reportDay : 1) ||
        reportTime.trim() !== (editingClient.reportTime || "08:00") ||
        reportTimezone.trim() !== (editingClient.reportTimezone || "UTC") ||
        reportPeriod !== (editingClient.reportPeriod || "weekly")
      );
    } else {
      return (
        formName.trim() !== "" ||
        formDomain.trim() !== "" ||
        formBudget !== "" ||
        formTargetCpl !== "" ||
        formBrandColor.toLowerCase() !== "#3b82f6" ||
        formIndustry.trim() !== "" ||
        reportingEnabled !== false
      );
    }
  };

  const handleCloseRequest = () => {
    if (hasChanges()) {
      if (!window.confirm("You have unsaved changes. Are you sure you want to discard them?")) {
        return;
      }
    }
    setIsModalOpen(false);
  };

  // Pinned refs for event listener stability
  const closeRequestRef = React.useRef(handleCloseRequest);
  React.useEffect(() => {
    closeRequestRef.current = handleCloseRequest;
  });

  const closePreviewRef = React.useRef(() => setIsPreviewModalOpen(false));
  React.useEffect(() => {
    closePreviewRef.current = () => setIsPreviewModalOpen(false);
  });

  // Keyboard accessibility: Escape key listener
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isPreviewModalOpen) {
          closePreviewRef.current();
        } else if (isModalOpen) {
          closeRequestRef.current();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen, isPreviewModalOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setImportFile(e.target.files[0]);
      setImportErrors(null);
    }
  };

  const parseCSV = (text: string) => {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0 || (lines.length === 1 && !lines[0])) {
      return { error: "CSV file is empty." };
    }

    const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/^["']|["']$/g, ''));
    
    const required = ["date", "platform", "spend", "impressions", "clicks", "conversions"];
    const missing = required.filter(col => !headers.includes(col));
    if (missing.length > 0) {
      return { error: `CSV is missing required column headers: ${missing.join(", ")}` };
    }

    const rows: any[] = [];
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(",").map(v => v.trim().replace(/^["']|["']$/g, ''));
      if (values.length !== headers.length) {
        errors.push(`Row ${i + 1}: Column count mismatch (expected ${headers.length}, got ${values.length}).`);
        continue;
      }

      const rowObj: any = {};
      headers.forEach((header, idx) => {
        rowObj[header] = values[idx];
      });

      const rowNum = i + 1;
      
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rowObj.date)) {
        errors.push(`Row ${rowNum}: 'date' must be in YYYY-MM-DD format (got '${rowObj.date || ""}').`);
      }
      
      if (!rowObj.platform) {
        errors.push(`Row ${rowNum}: 'platform' cannot be empty.`);
      }

      const spend = Number(rowObj.spend);
      if (isNaN(spend) || spend < 0) {
        errors.push(`Row ${rowNum}: 'spend' must be a valid non-negative number.`);
      }

      const impressions = Number(rowObj.impressions);
      if (isNaN(impressions) || !Number.isInteger(impressions) || impressions < 0) {
        errors.push(`Row ${rowNum}: 'impressions' must be a valid non-negative integer.`);
      }

      const clicks = Number(rowObj.clicks);
      if (isNaN(clicks) || !Number.isInteger(clicks) || clicks < 0) {
        errors.push(`Row ${rowNum}: 'clicks' must be a valid non-negative integer.`);
      }

      const conversions = Number(rowObj.conversions);
      if (isNaN(conversions) || !Number.isInteger(conversions) || conversions < 0) {
        errors.push(`Row ${rowNum}: 'conversions' must be a valid non-negative integer.`);
      }

      if (errors.length === 0) {
        rows.push({
          date: rowObj.date,
          platform: rowObj.platform,
          spend,
          impressions,
          clicks,
          conversions
        });
      }
    }

    if (errors.length > 0) {
      return { errors };
    }

    return { rows };
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile || !importingClient) return;

    setImporting(true);
    setImportErrors(null);

    try {
      const text = await importFile.text();
      const parseResult = parseCSV(text);

      if (parseResult.error) {
        setImportErrors([parseResult.error]);
        setImporting(false);
        return;
      }

      if (parseResult.errors && parseResult.errors.length > 0) {
        setImportErrors(parseResult.errors);
        setImporting(false);
        return;
      }

      const res = await authFetch(`/api/clients/${importingClient.id}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parseResult.rows }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to import metrics database rows.");
      }

      addToast(
        "Import Successful",
        `Successfully imported ${parseResult.rows?.length} metrics rows for ${importingClient.name}.`,
        "success"
      );
      setIsImportModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setImportErrors([err.message || "Failed to parse or submit CSV data."]);
    } finally {
      setImporting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});

    const errors: Record<string, string> = {};
    if (!formName.trim()) errors.name = "Client account name is required.";
    if (!formDomain.trim()) {
      errors.domain = "Client corporate domain is required.";
    } else if (!formDomain.includes(".")) {
      errors.domain = "Please input a valid top-level domain format (e.g., logo.com).";
    }
    const budgetNum = Number(formBudget);
    if (!formBudget || isNaN(budgetNum) || budgetNum <= 0) {
      errors.budget = "Please define a valid positive monthly ad budget.";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      addToast("Validation failed", "Please resolve form errors before saving.", "error");
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingClient) {
        await onUpdateClient(editingClient.id, {
          name: formName.trim(),
          domain: formDomain.trim().toLowerCase(),
          platform: formPlatform,
          monthlyBudget: budgetNum,
          targetCpl: formTargetCpl ? Number(formTargetCpl) : null,
          brandColor: formBrandColor,
          industry: formIndustry.trim() || null,
          primaryGoal: formPrimaryGoal,
          primaryMarket: formPrimaryMarket,
          logoUrl: formLogoUrl.trim() || null,
          reportingEnabled,
          reportEmail: reportEmail.trim() || null,
          reportCc: reportCc.trim() || null,
          reportDay,
          reportTime: reportTime.trim(),
          reportTimezone: reportTimezone.trim(),
          reportPeriod
        });
      } else {
        await onAddClient({
          name: formName.trim(),
          domain: formDomain.trim().toLowerCase(),
          platform: formPlatform,
          monthlyBudget: budgetNum,
          agencyId: formAgencyId || profile?.agencyId,
          targetCpl: formTargetCpl ? Number(formTargetCpl) : null,
          brandColor: formBrandColor,
          industry: formIndustry.trim() || null,
          primaryGoal: formPrimaryGoal,
          primaryMarket: formPrimaryMarket,
          logoUrl: formLogoUrl.trim() || null,
          reportingEnabled,
          reportEmail: reportEmail.trim() || null,
          reportCc: reportCc.trim() || null,
          reportDay,
          reportTime: reportTime.trim(),
          reportTimezone: reportTimezone.trim(),
          reportPeriod
        });
      }
      setIsModalOpen(false);
    } catch (err) {
      addToast("Action failed", "Server rejected the client modification.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Are you absolutely sure you want to disconnect ${name}? This cannot be undone.`)) {
      try {
        await onDeleteClient(id);
      } catch (err) {
        addToast("Action failed", "Server rejected database client deletion.", "error");
      }
    }
  };

  const toggleStatus = async (client: ClientAccount) => {
    const nextStatus = client.status === "Active" ? "Paused" : "Active";
    try {
      await onUpdateClient(client.id, { status: nextStatus }, true);
      addToast(
        "Status Changed", 
        `Audit logged status update for ${client.name} to ${nextStatus}`, 
        "success"
      );
    } catch (err) {
      addToast("Update failed", "Could not modify status.", "error");
    }
  };

  return (
    <div className="space-y-6 font-sans text-left">
      {/* Header and Add button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-display text-slate-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-violet-400" />
            Connected Client Portals
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Manage your marketing agency's client integrations. Adding an account provisions a secure live URL.
          </p>
        </div>

        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleOpenCreateModal}
            className="btn-primary flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Connect New Client
          </button>
        </div>
      </div>

      {/* Grid Filter Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by client name or domain..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-input pl-9 w-full h-10"
          />
        </div>

        <div className="flex items-center gap-2 bg-[#101010] border border-white/5 px-3 py-1.5 rounded-lg shrink-0 h-10">
          <Filter className="w-3.5 h-3.5 text-violet-400" />
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="bg-transparent text-slate-300 text-xs outline-none cursor-pointer pr-4 font-medium border border-transparent focus:border-transparent rounded"
          >
            <option value="All" className="bg-slate-950 text-slate-200">All Ad Networks</option>
            <option value="Google Ads" className="bg-slate-950 text-slate-200">Google Ads</option>
            <option value="Meta Ads" className="bg-slate-950 text-slate-200">Meta Ads</option>
            <option value="TikTok Ads" className="bg-slate-950 text-slate-200">TikTok Ads</option>
            <option value="All Platforms" className="bg-slate-950 text-slate-200">Omnichannel</option>
          </select>
        </div>
      </div>

      {/* Clients grid table */}
      <div className="bg-slate-950/20 border border-slate-900 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-400 border-collapse">
            <thead className="bg-slate-950 text-slate-500 uppercase tracking-widest text-[10px] font-mono border-b border-slate-900">
              <tr>
                <th className="p-4">Client details</th>
                <th className="p-4">Ad networks</th>
                <th className="p-4">Monthly Budget</th>
                <th className="p-4">Status</th>
                <th className="p-4">Date Connected</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900 bg-slate-950/10">
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    No active client accounts found matching filter constraints.
                  </td>
                </tr>
              ) : (
                filteredClients.map((client) => (
                  <tr key={client.id} className="hover:bg-slate-900/20 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center font-bold text-slate-300 text-xs uppercase select-none">
                          {client.name.substring(0, 2)}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-200">{client.name}</span>
                          <span className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Globe className="w-3 h-3 text-slate-600" />
                            {client.domain}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 text-[10px] font-medium font-mono">
                        {client.platform}
                      </span>
                    </td>
                    <td className="p-4 font-mono font-semibold text-slate-200">
                      ${client.monthlyBudget.toLocaleString()}
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border select-none ${
                          client.status === "Active"
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                            : client.status === "Paused"
                            ? "bg-slate-800/40 border-slate-700/50 text-slate-500"
                            : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                        }`}
                      >
                        {client.status}
                      </span>
                    </td>
                    <td className="p-4 text-slate-500 font-mono">
                      {new Date(client.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-4 text-right flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => toggleStatus(client)}
                        className={`p-1.5 rounded border border-slate-850 transition-colors ${
                          client.status === "Active" 
                            ? "bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-amber-500" 
                            : "bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-emerald-500"
                        }`}
                        title={client.status === "Active" ? "Pause Client" : "Activate Client"}
                      >
                        <Loader2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleOpenImportModal(client)}
                        className="p-1.5 bg-slate-900 hover:bg-slate-850 rounded border border-slate-800 text-slate-400 hover:text-emerald-400 transition-colors"
                        title="Import CSV Metrics"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleOpenEditModal(client)}
                        className="p-1.5 bg-slate-900 hover:bg-slate-850 rounded border border-slate-800 text-slate-400 hover:text-violet-400 transition-colors"
                        title="Edit Client"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(client.id, client.name)}
                        className="p-1.5 bg-slate-900 hover:bg-slate-850 rounded border border-slate-800 text-slate-400 hover:text-rose-400 transition-colors"
                        title="Delete Client"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE/EDIT CLIENT DIALOG MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form 
            onSubmit={handleSubmit}
            className="bg-slate-950 border border-slate-900 rounded-xl w-full max-w-3xl max-h-[calc(100vh-32px)] flex flex-col overflow-hidden shadow-2xl animate-scale-in text-left"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-900 shrink-0">
              <h3 className="text-sm font-bold font-display uppercase tracking-wider text-slate-200">
                {editingClient ? "Modify Account Configuration" : "Integrate Client Portal"}
              </h3>
              <button
                type="button"
                onClick={handleCloseRequest}
                aria-label="Close Settings"
                className="text-slate-500 hover:text-slate-300 p-1 rounded-md hover:bg-slate-900/50 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Modal Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
              
              {/* Row 1: Name and Domain */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <label className="text-[10px] font-mono tracking-widest text-slate-500 uppercase mb-1 flex items-center gap-1">
                    <Briefcase className="w-3 h-3 text-violet-400" /> Client Account Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Luxe Apparel, AeroMedia"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className={`bg-slate-900/50 border ${
                      formErrors.name ? "border-rose-500/50 focus:ring-rose-500/30" : "border-slate-800 focus:ring-violet-500/30"
                    } text-slate-300 text-xs rounded-lg p-2.5 outline-none focus:ring-2`}
                  />
                  {formErrors.name && (
                    <span className="text-[10px] text-rose-400 font-semibold mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {formErrors.name}
                    </span>
                  )}
                </div>

                <div className="flex flex-col">
                  <label className="text-[10px] font-mono tracking-widest text-slate-500 uppercase mb-1 flex items-center gap-1">
                    <Globe className="w-3 h-3 text-violet-400" /> Corporate Domain URL
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. luxeapparel.co"
                    value={formDomain}
                    onChange={(e) => setFormDomain(e.target.value)}
                    className={`bg-slate-900/50 border ${
                      formErrors.domain ? "border-rose-500/50 focus:ring-rose-500/30" : "border-slate-800 focus:ring-violet-500/30"
                    } text-slate-300 text-xs rounded-lg p-2.5 outline-none focus:ring-2`}
                  />
                  {formErrors.domain && (
                    <span className="text-[10px] text-rose-400 font-semibold mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {formErrors.domain}
                    </span>
                  )}
                </div>
              </div>

              {/* Row 2: Core Platform and Monthly Budget */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <label className="text-[10px] font-mono tracking-widest text-slate-500 uppercase mb-1">
                    Core Ad Network Channel
                  </label>
                  <select
                    value={formPlatform}
                    onChange={(e) => setFormPlatform(e.target.value as any)}
                    className="bg-slate-900/50 border border-slate-800 text-slate-300 text-xs rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-violet-500/30"
                  >
                    <option value="All Platforms">Omnichannel (All Platforms)</option>
                    <option value="Google Ads">Google Ads Only</option>
                    <option value="Meta Ads">Meta Ads Only</option>
                    <option value="TikTok Ads">TikTok Ads Only</option>
                  </select>
                </div>

                <div className="flex flex-col">
                  <label className="text-[10px] font-mono tracking-widest text-slate-500 uppercase mb-1 flex items-center gap-1">
                    <DollarSign className="w-3 h-3 text-violet-400" /> Monthly Advertising Budget ($)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 10000"
                    value={formBudget}
                    onChange={(e) => setFormBudget(e.target.value)}
                    className={`bg-slate-900/50 border ${
                      formErrors.budget ? "border-rose-500/50 focus:ring-rose-500/30" : "border-slate-800 focus:ring-violet-500/30"
                    } text-slate-300 text-xs rounded-lg p-2.5 outline-none focus:ring-2`}
                  />
                  {formErrors.budget && (
                    <span className="text-[10px] text-rose-400 font-semibold mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {formErrors.budget}
                    </span>
                  )}
                </div>
              </div>

              {/* Row 3: Associated Agency (Admin Only & Creating new client) */}
              {isAdmin && !editingClient && (
                <div className="flex flex-col">
                  <label className="text-[10px] font-mono tracking-widest text-slate-500 uppercase mb-1">
                    Associate Agency Portal
                  </label>
                  <select
                    value={formAgencyId}
                    onChange={(e) => setFormAgencyId(e.target.value)}
                    className="bg-slate-900/50 border border-slate-800 text-slate-300 text-xs rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-violet-500/30"
                  >
                    {agenciesList.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Row 4: Target CPL and Brand Color */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <label className="text-[10px] font-mono tracking-widest text-slate-500 uppercase mb-1">Target CPL ($)</label>
                  <input
                    type="number"
                    placeholder="e.g. 75"
                    value={formTargetCpl}
                    onChange={(e) => setFormTargetCpl(e.target.value)}
                    className="bg-slate-900/50 border border-slate-800 text-slate-300 text-xs rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-violet-500/30"
                  />
                </div>

                <div className="flex flex-col">
                  <label className="text-[10px] font-mono tracking-widest text-slate-500 uppercase mb-1">Brand Color (Hex)</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={formBrandColor}
                      onChange={(e) => setFormBrandColor(e.target.value)}
                      className="w-10 h-10 border border-slate-800 rounded bg-slate-950 p-1 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={formBrandColor}
                      onChange={(e) => setFormBrandColor(e.target.value)}
                      className="bg-slate-900/50 border border-slate-800 text-slate-300 text-xs rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-violet-500/30 flex-1 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Row 5: Industry and Primary Goal */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <label className="text-[10px] font-mono tracking-widest text-slate-500 uppercase mb-1">Industry</label>
                  <input
                    type="text"
                    placeholder="e.g. Beauty, Dental"
                    value={formIndustry}
                    onChange={(e) => setFormIndustry(e.target.value)}
                    className="bg-slate-900/50 border border-slate-800 text-slate-300 text-xs rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-violet-500/30"
                  />
                </div>

                <div className="flex flex-col">
                  <label className="text-[10px] font-mono tracking-widest text-slate-550 uppercase mb-1">Primary Goal</label>
                  <select
                    value={formPrimaryGoal}
                    onChange={(e) => setFormPrimaryGoal(e.target.value)}
                    className="bg-slate-900/50 border border-slate-800 text-slate-300 text-xs rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-violet-500/30"
                  >
                    <option value="Leads">Leads</option>
                    <option value="Sales">Sales</option>
                    <option value="Appointments">Appointments</option>
                  </select>
                </div>
              </div>

              {/* Row 6: Primary Market and Client Logo */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <label className="text-[10px] font-mono tracking-widest text-slate-500 uppercase mb-1">Primary Market</label>
                  <input
                    type="text"
                    placeholder="e.g. Phoenix, AZ"
                    value={formPrimaryMarket}
                    onChange={(e) => setFormPrimaryMarket(e.target.value)}
                    className="bg-slate-900/50 border border-slate-800 text-slate-300 text-xs rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-violet-500/30"
                  />
                </div>

                <div className="flex flex-col">
                  <label className="text-[10px] font-mono tracking-widest text-slate-550 uppercase mb-1">Client Logo</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Logo URL"
                      value={formLogoUrl}
                      onChange={(e) => setFormLogoUrl(e.target.value)}
                      className="bg-slate-900/50 border border-slate-800 text-slate-300 text-[10px] rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-violet-500/30 flex-1"
                    />
                    <label className="px-2 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 font-bold rounded text-[10px] cursor-pointer flex items-center gap-1 shrink-0">
                      <Upload className="w-3 h-3" />
                      <span>{uploadingLogo ? "..." : "Upload"}</span>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploadingLogo}
                        className="hidden"
                        onChange={handleClientLogoUpload}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* SECURE CLIENT PORTAL ACCESS CARD */}
              {editingClient && (
                <div className="bg-slate-900/60 border border-emerald-500/30 rounded-xl p-4 space-y-3 mt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                        Client Portal Link Isolation
                      </h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                        portalAccessInfo?.enabled 
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                          : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                      }`}>
                        {portalAccessInfo?.enabled ? "ENABLED" : "DISABLED"}
                      </span>
                      <button
                        type="button"
                        onClick={handleTogglePortalAccess}
                        className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded transition-colors"
                      >
                        {portalAccessInfo?.enabled ? "Disable Portal" : "Enable Portal"}
                      </button>
                    </div>
                  </div>

                  {loadingPortalInfo ? (
                    <div className="text-xs text-slate-400 py-2 flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" /> Loading portal info...
                    </div>
                  ) : portalError ? (
                    <div className="flex items-center justify-between py-2 text-xs text-rose-400 bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
                      <span>Unable to load portal access info</span>
                      <button
                        type="button"
                        onClick={() => fetchPortalAccessInfo(editingClient.id)}
                        className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-1 rounded transition-colors"
                      >
                        Retry
                      </button>
                    </div>
                  ) : !portalAccessInfo?.enabled ? (
                    <div className="py-2 text-xs text-slate-400 space-y-1">
                      <p className="font-medium text-slate-300">Status: DISABLED</p>
                      <p className="text-[11px] text-slate-500">Client portal access is currently disabled for this client.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={portalAccessInfo?.portalUrl || ""}
                          className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-lg p-2 flex-1 font-mono select-all outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleCopyPortalLink}
                          disabled={!portalAccessInfo?.portalUrl}
                          className="btn-secondary text-xs flex items-center gap-1 shrink-0 px-3 py-2"
                        >
                          <Copy className="w-3.5 h-3.5" /> Copy
                        </button>
                        <a
                          href={portalAccessInfo?.portalUrl || "#"}
                          target="_blank"
                          rel="noreferrer"
                          className={`btn-primary text-xs flex items-center gap-1 shrink-0 px-3 py-2 ${!portalAccessInfo?.portalUrl ? 'pointer-events-none opacity-50' : ''}`}
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Open
                        </a>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                        <span>High-entropy cryptographically hashed token</span>
                        <button
                          type="button"
                          onClick={handleRotatePortalToken}
                          disabled={rotatingPortalToken}
                          className="text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium hover:underline cursor-pointer"
                        >
                          <RotateCw className={`w-3 h-3 ${rotatingPortalToken ? "animate-spin" : ""}`} /> Rotate Secret Link
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Weekly Client Performance Reporting Accordion */}
              <div className="border border-slate-800 rounded-lg p-4 bg-slate-900/20">
                <div className="flex items-center justify-between cursor-pointer" onClick={() => setReportingEnabled(!reportingEnabled)}>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-200">Weekly Performance Email Reports</span>
                    <span className="text-[10px] text-slate-500 font-medium">Automatically generate and email branded PDF-style reports to client.</span>
                  </div>
                  <div className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={reportingEnabled} 
                      onChange={(e) => setReportingEnabled(e.target.checked)} 
                      className="sr-only peer" 
                    />
                    <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-400 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-violet-600"></div>
                  </div>
                </div>

                {reportingEnabled && (
                  <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-4">
                    {/* Recipient and CC */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex flex-col">
                        <label className="text-[10px] font-mono tracking-widest text-slate-500 uppercase mb-1">Recipient Email</label>
                        <input
                          type="email"
                          placeholder="client@example.com"
                          value={reportEmail}
                          onChange={(e) => setReportEmail(e.target.value)}
                          className="bg-slate-900/50 border border-slate-800 text-slate-300 text-xs rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-violet-500/30"
                          required={reportingEnabled}
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[10px] font-mono tracking-widest text-slate-500 uppercase mb-1">CC Email(s) (Comma separated)</label>
                        <input
                          type="text"
                          placeholder="manager@example.com"
                          value={reportCc}
                          onChange={(e) => setReportCc(e.target.value)}
                          className="bg-slate-900/50 border border-slate-800 text-slate-300 text-xs rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-violet-500/30"
                        />
                      </div>
                    </div>

                    {/* Day, Time, Timezone, Period */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="flex flex-col">
                        <label className="text-[10px] font-mono tracking-widest text-slate-500 uppercase mb-1">Schedule Day</label>
                        <select
                          value={reportDay}
                          onChange={(e) => setReportDay(Number(e.target.value))}
                          className="bg-slate-900/50 border border-slate-800 text-slate-300 text-xs rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-violet-500/30"
                        >
                          <option value={1}>Monday</option>
                          <option value={2}>Tuesday</option>
                          <option value={3}>Wednesday</option>
                          <option value={4}>Thursday</option>
                          <option value={5}>Friday</option>
                          <option value={6}>Saturday</option>
                          <option value={0}>Sunday</option>
                        </select>
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[10px] font-mono tracking-widest text-slate-550 uppercase mb-1">Schedule Time</label>
                        <input
                          type="text"
                          placeholder="08:00"
                          value={reportTime}
                          onChange={(e) => setReportTime(e.target.value)}
                          className="bg-slate-900/50 border border-slate-800 text-slate-300 text-xs rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-violet-500/30 font-mono"
                          required={reportingEnabled}
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[10px] font-mono tracking-widest text-slate-550 uppercase mb-1">Timezone</label>
                        <input
                          type="text"
                          placeholder="UTC"
                          value={reportTimezone}
                          onChange={(e) => setReportTimezone(e.target.value)}
                          className="bg-slate-900/50 border border-slate-800 text-slate-300 text-xs rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-violet-500/30 font-mono"
                          required={reportingEnabled}
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[10px] font-mono tracking-widest text-slate-550 uppercase mb-1">Period</label>
                        <select
                          value={reportPeriod}
                          onChange={(e) => setReportPeriod(e.target.value as any)}
                          className="bg-slate-900/50 border border-slate-800 text-slate-300 text-xs rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-violet-500/30"
                        >
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </div>
                    </div>

                    {/* Admin Test Send Recipient Area (Inside scrollable accordion content) */}
                    {editingClient && showTestInput && (
                      <div className="flex flex-col gap-1.5 mt-3 pt-3 border-t border-slate-800/50">
                        <label className="text-[10px] font-mono tracking-widest text-slate-500 uppercase">Recipient for Test Email</label>
                        <div className="flex gap-2 items-center">
                          <input
                            type="email"
                            placeholder="Send test email to..."
                            value={testEmailAddress}
                            onChange={(e) => setTestEmailAddress(e.target.value)}
                            className="bg-slate-900/50 border border-slate-800 text-slate-300 text-xs rounded-lg p-2.5 flex-1 outline-none focus:ring-2 focus:ring-violet-500/30"
                          />
                          <button
                            type="button"
                            disabled={sendingTest}
                            onClick={handleSendTestEmail}
                            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors shrink-0"
                          >
                            {sendingTest ? "Sending..." : "Dispatch"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>

            {/* Sticky/Fixed Actions Footer */}
            <div className="flex items-center justify-between p-5 border-t border-slate-900 bg-slate-950 shrink-0 gap-3">
              {/* Left Action Buttons */}
              <div className="flex items-center gap-2">
                {editingClient && reportingEnabled && (
                  <>
                    <button
                      type="button"
                      onClick={handlePreviewReport}
                      className="px-3 py-2 bg-violet-600/10 hover:bg-violet-600/20 text-violet-400 border border-violet-500/20 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                    >
                      {loadingPreview ? "Generating..." : "Preview Report"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowTestInput(!showTestInput)}
                      className="px-3 py-2 bg-slate-850 hover:bg-slate-750 text-slate-300 border border-slate-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                    >
                      Send Test Email
                    </button>
                  </>
                )}
              </div>

              {/* Right Action Buttons */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCloseRequest}
                  className="btn-secondary px-4 py-2 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary px-4 py-2 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  {isSubmitting ? (
                    <span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin"></span>
                  ) : null}
                  <span>{editingClient ? "Save Changes" : "Activate Integration"}</span>
                </button>
              </div>
            </div>

          </form>
        </div>
      )}
      
      {/* CSV IMPORT DIALOG MODAL */}
      {isImportModalOpen && importingClient && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-900 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl animate-scale-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-900">
              <h3 className="text-sm font-bold font-display uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                CSV Data Import Fallback
              </h3>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-500 hover:text-slate-300 transition-colors p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleImportSubmit} className="p-5 space-y-4 text-left">
              <div>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  Upload campaign performance metrics to override live integrations or generated mock stats for <strong>{importingClient.name}</strong>.
                </p>
                
                <div className="p-3 bg-slate-900/40 border border-slate-900 rounded-lg text-[11px] text-slate-500 leading-relaxed space-y-1.5 font-mono mb-4">
                  <div className="text-[10px] font-bold text-slate-400 tracking-wider">EXPECTED CSV HEADERS:</div>
                  <div>date, platform, spend, impressions, clicks, conversions</div>
                  <div className="text-[10px] font-bold text-slate-400 tracking-wider mt-2">EXAMPLE ROW:</div>
                  <div>2026-07-16, Google Ads, 150.50, 5000, 120, 15</div>
                </div>
              </div>

              {importErrors && importErrors.length > 0 && (
                <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-900/50 text-[11px] text-rose-400 space-y-1 max-h-32 overflow-y-auto font-mono">
                  <div className="font-bold flex items-center gap-1 mb-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> CSV Validation Errors:
                  </div>
                  {importErrors.map((err, idx) => (
                    <div key={idx} className="pl-2.5 relative">
                      <span className="absolute left-0">•</span> {err}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col">
                <label className="text-[10px] font-mono tracking-widest text-slate-500 uppercase mb-1.5">
                  Select CSV Document
                </label>
                <div className="relative border border-dashed border-slate-900 hover:border-slate-800 rounded-lg p-6 flex flex-col items-center justify-center bg-slate-950/40 text-center cursor-pointer transition-colors group">
                  <input
                    type="file"
                    accept=".csv"
                    required
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <Upload className="w-8 h-8 text-slate-700 group-hover:text-violet-400 mb-2 transition-colors" />
                  <span className="text-xs text-slate-300 font-semibold truncate max-w-xs">
                    {importFile ? importFile.name : "Choose a CSV file or drag it here"}
                  </span>
                  <span className="text-[10px] text-slate-600 mt-1">
                    {importFile ? `${(importFile.size / 1024).toFixed(1)} KB` : "Max file size: 5 MB"}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={importing || !importFile}
                  className="btn-primary flex items-center gap-1.5"
                >
                  {importing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  <span>{importing ? "Importing..." : "Start Import"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* HTML Report Preview Modal */}
      {isPreviewModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-4xl h-[85vh] bg-[#101010] border border-slate-800 rounded-xl flex flex-col overflow-hidden shadow-2xl animate-scale-in">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-900 bg-[#121212]">
              <div>
                <h3 className="text-sm font-semibold text-slate-100 font-display uppercase tracking-wider">Branded Email Report Preview</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Live preview compiled using real database data and agency styles.</p>
              </div>
              <button
                onClick={() => setIsPreviewModalOpen(false)}
                aria-label="Close Preview"
                className="text-slate-400 hover:text-slate-200 transition-colors p-1 border border-slate-800 hover:border-slate-700 bg-slate-900 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Frame body */}
            <div className="flex-1 bg-black p-4">
              <iframe
                title="Email Report Preview"
                srcDoc={previewHtml}
                className="w-full h-full border-0 rounded bg-[#080808]"
                sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
