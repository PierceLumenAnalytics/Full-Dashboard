import React, { useState, useEffect } from "react";
import { FileTerminal, Search, ShieldCheck, RefreshCw, Trash2 } from "lucide-react";
import { AuditLog } from "../types";

interface LogsViewerProps {
  logs: AuditLog[];
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
}

export default function LogsViewer({ logs, onRefresh, isRefreshing }: LogsViewerProps) {
  const [search, setSearch] = useState("");
  const [selectedActionFilter, setSelectedActionFilter] = useState("All");

  const filteredLogs = logs.filter((log) => {
    const matchesSearch = log.details.toLowerCase().includes(search.toLowerCase()) || 
                          log.user.toLowerCase().includes(search.toLowerCase()) ||
                          log.entity.toLowerCase().includes(search.toLowerCase());
    const matchesAction = selectedActionFilter === "All" || log.action === selectedActionFilter;
    return matchesSearch && matchesAction;
  });

  const getActionBadgeColor = (action: AuditLog["action"]) => {
    switch (action) {
      case "CREATE":
        return "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
      case "UPDATE":
        return "bg-violet-500/10 border-violet-500/20 text-violet-400";
      case "DELETE":
        return "bg-rose-500/10 border-rose-500/20 text-rose-400";
      default:
        return "bg-sky-500/10 border-sky-500/20 text-sky-400";
    }
  };

  return (
    <div className="space-y-6 font-sans text-left">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-display text-slate-100 flex items-center gap-2">
            <FileTerminal className="w-5 h-5 text-violet-400" />
            Security Audit Logs
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            OWASP compliant automated tamper-proof logs capturing database mutations and security actions. Least privilege is active.
          </p>
        </div>

        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold rounded-lg cursor-pointer transition-colors flex items-center gap-1.5 self-start sm:self-auto shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-violet-400" : ""}`} />
          <span>Refresh Logs</span>
        </button>
      </div>

      {/* Verification Shield Indicator */}
      <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/20 text-emerald-200 text-xs flex gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-slate-200">System Security Compliance</p>
          <p className="text-slate-400 leading-relaxed">
            All POST, PUT, and DELETE client account interactions are written with strict server-side validation. API endpoints are locked from public clients. Audit records are persistent for 90 days.
          </p>
        </div>
      </div>

      {/* Grid Filter Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search security log payload details..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-900/40 border border-slate-900 text-slate-300 text-xs rounded-lg pl-9 pr-4 py-2.5 w-full focus:ring-1 focus:ring-violet-500 outline-none placeholder:text-slate-600"
          />
        </div>

        <div className="flex items-center gap-2 bg-slate-900/20 border border-slate-900 px-3 py-1.5 rounded-lg shrink-0">
          <span className="text-[10px] font-mono tracking-widest text-slate-500 uppercase">Action Filter</span>
          <select
            value={selectedActionFilter}
            onChange={(e) => setSelectedActionFilter(e.target.value)}
            className="bg-slate-950 text-slate-300 text-xs outline-none cursor-pointer pr-4 font-medium border border-transparent focus:border-slate-800 rounded px-1"
          >
            <option value="All" className="bg-slate-950 text-slate-200">All Mutations</option>
            <option value="CREATE" className="bg-slate-950 text-slate-200">CREATE</option>
            <option value="UPDATE" className="bg-slate-950 text-slate-200">UPDATE</option>
            <option value="DELETE" className="bg-slate-950 text-slate-200">DELETE</option>
            <option value="REFRESH" className="bg-slate-950 text-slate-200">REFRESH</option>
          </select>
        </div>
      </div>

      {/* Custom Monospace Audit Table */}
      <div className="bg-slate-950/25 border border-slate-900 rounded-xl overflow-hidden font-mono text-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-slate-400 border-collapse">
            <thead className="bg-slate-950 text-slate-500 uppercase tracking-widest text-[9px] border-b border-slate-900">
              <tr>
                <th className="p-4 w-44">Timestamp (UTC)</th>
                <th className="p-4 w-28 text-center">Action</th>
                <th className="p-4 w-24">Entity</th>
                <th className="p-4">Details</th>
                <th className="p-4 text-right w-44">Authorized Operator</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900 bg-slate-950/5">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500 font-sans">
                    No security events found matching query.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-900/10 transition-colors">
                    <td className="p-4 text-slate-500 text-[11px]">
                      {new Date(log.timestamp).toISOString().replace("T", " ").substring(0, 19)}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getActionBadgeColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="p-4 text-slate-400 font-semibold">{log.entity}</td>
                    <td className="p-4 text-slate-300 text-left font-sans">{log.details}</td>
                    <td className="p-4 text-right text-slate-500 text-[11px] font-sans">
                      {log.user}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
