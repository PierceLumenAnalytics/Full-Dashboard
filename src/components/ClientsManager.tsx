import React, { useState } from "react";
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
  Loader2
} from "lucide-react";
import { ClientAccount } from "../types";
import { authFetch } from "../lib/supabaseClient";

interface ClientsManagerProps {
  clients: ClientAccount[];
  onAddClient: (client: Omit<ClientAccount, "id" | "createdAt" | "status">) => Promise<void>;
  onUpdateClient: (id: string, updates: Partial<ClientAccount>, silent?: boolean) => Promise<void>;
  onDeleteClient: (id: string) => Promise<void>;
  addToast: (title: string, description?: string, type?: "success" | "error" | "warning" | "info") => void;
}

export default function ClientsManager({ 
  clients, 
  onAddClient, 
  onUpdateClient, 
  onDeleteClient,
  addToast
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
  const [formPlatform, setFormPlatform] = useState<"Google Ads" | "Meta Ads" | "TikTok Ads" | "All Platforms">("All Platforms");
  const [formBudget, setFormBudget] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (client: ClientAccount) => {
    setEditingClient(client);
    setFormName(client.name);
    setFormDomain(client.domain);
    setFormPlatform(client.platform);
    setFormBudget(client.monthlyBudget.toString());
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleOpenImportModal = (client: ClientAccount) => {
    setImportingClient(client);
    setImportFile(null);
    setImportErrors(null);
    setImporting(false);
    setIsImportModalOpen(true);
  };

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

  // Safe client validation on submit (OWASP Top 10 client validation sandbox logic)
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
        // Run update client mutation
        await onUpdateClient(editingClient.id, {
          name: formName.trim(),
          domain: formDomain.trim().toLowerCase(),
          platform: formPlatform,
          monthlyBudget: budgetNum
        });
      } else {
        // Run add client mutation
        await onAddClient({
          name: formName.trim(),
          domain: formDomain.trim().toLowerCase(),
          platform: formPlatform,
          monthlyBudget: budgetNum
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

        <button
          onClick={handleOpenCreateModal}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-lg text-xs cursor-pointer flex items-center gap-1.5 transition-colors shadow-lg shadow-violet-500/10 shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> Connect New Client
        </button>
      </div>

      {/* Grid Filter Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by client name or domain..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-900/40 border border-slate-900 text-slate-300 text-xs rounded-lg pl-9 pr-4 py-2.5 w-full focus:ring-1 focus:ring-violet-500 outline-none placeholder:text-slate-600"
          />
        </div>

        <div className="flex items-center gap-2 bg-slate-900/20 border border-slate-900 px-3 py-1.5 rounded-lg shrink-0">
          <Filter className="w-3.5 h-3.5 text-violet-400" />
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="bg-slate-950 text-slate-300 text-xs outline-none cursor-pointer pr-4 font-medium border border-transparent focus:border-slate-800 rounded px-1"
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
            <thead className="bg-slate-950 text-slate-500 uppercase tracking-widest text-[9px] font-mono border-b border-slate-900">
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
                      <button
                        onClick={() => toggleStatus(client)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors border ${
                          client.status === "Active"
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
                            : client.status === "Paused"
                            ? "bg-slate-800/40 border-slate-700/50 text-slate-500 hover:bg-slate-800"
                            : "bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20"
                        }`}
                      >
                        {client.status}
                      </button>
                    </td>
                    <td className="p-4 text-slate-500 font-mono">
                      {new Date(client.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenImportModal(client)}
                          className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-900/50 rounded transition-all cursor-pointer"
                          title="Import Campaign Data (CSV)"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEditModal(client)}
                          className="p-1.5 text-slate-400 hover:text-violet-400 hover:bg-slate-900/50 rounded transition-all cursor-pointer"
                          title="Modify Account Settings"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(client.id, client.name)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-900/50 rounded transition-all cursor-pointer"
                          title="Disconnect Integration"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
          <div className="bg-slate-950 border border-slate-900 rounded-xl w-full max-w-md overflow-hidden shadow-2xl animate-scale-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-900">
              <h3 className="text-sm font-bold font-display uppercase tracking-wider text-slate-200">
                {editingClient ? "Modify Account Configuration" : "Integrate Client Portal"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-500 hover:text-slate-300 p-1 rounded-md hover:bg-slate-900/50 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Account Name */}
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

              {/* TLD Domain */}
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

              {/* Platforms */}
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

              {/* Monthly budget */}
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

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-900">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold rounded-lg text-xs cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-800 text-white font-semibold rounded-lg text-xs cursor-pointer transition-colors flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  ) : null}
                  <span>{editingClient ? "Save Updates" : "Activate Integration"}</span>
                </button>
              </div>
            </form>
          </div>
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

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-900">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold rounded-lg text-xs cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={importing || !importFile}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 disabled:text-slate-500 text-white font-semibold rounded-lg text-xs cursor-pointer transition-colors flex items-center gap-1.5"
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
    </div>
  );
}
