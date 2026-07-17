import React from "react";
import { 
  LayoutDashboard, 
  Users, 
  Sparkles, 
  FileTerminal, 
  LogOut, 
  ChevronRight, 
  Layers
} from "lucide-react";
import { ActiveTab } from "../types";

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  profile: any;
  onLogout: () => void;
}

export default function Sidebar({ activeTab, setActiveTab, profile, onLogout }: SidebarProps) {
  const mainNavigation = [
    { id: "overview" as ActiveTab, name: "Dashboard Overview", icon: LayoutDashboard },
    { id: "summary" as ActiveTab, name: "AI Daily Summary", icon: Sparkles },
  ];

  const managementNavigation = [
    { id: "clients" as ActiveTab, name: "Connected Clients", icon: Users },
    { id: "logs" as ActiveTab, name: "Security Audit Logs", icon: FileTerminal },
  ];

  const userInitial = profile?.email ? profile.email.charAt(0).toUpperCase() : "U";

  return (
    <aside className="w-64 bg-slate-950 border-r border-slate-900/80 flex flex-col justify-between select-none h-screen shrink-0 font-sans">
      {/* Brand Header */}
      <div>
        <div className="p-5 flex items-center gap-2.5 border-b border-slate-900/40">
          <div className="w-8 h-8 rounded-lg border border-slate-800 bg-slate-900/30 flex items-center justify-center">
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-slate-200">
              Lumen Analytics
            </h1>
            <span className="text-[9px] text-slate-600 tracking-wider font-mono uppercase block">
              Insights Platform
            </span>
          </div>
        </div>

        {/* Navigation Groups */}
        <div className="px-3 py-4 space-y-6">
          {/* Main Navigation Group */}
          <div>
            <span className="text-[9px] font-mono tracking-wider text-slate-600 uppercase px-3 block mb-1.5">
              Analytics
            </span>
            <ul className="space-y-0.5">
              {mainNavigation.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center px-3 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                        isActive
                          ? "bg-slate-900/85 text-slate-100"
                          : "text-slate-400 hover:bg-slate-900/40 hover:text-slate-200"
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 mr-2.5 ${isActive ? "text-violet-400/90" : "text-slate-500"}`} />
                      <span>{item.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Management Group */}
          <div>
            <span className="text-[9px] font-mono tracking-wider text-slate-600 uppercase px-3 block mb-1.5">
              Management
            </span>
            <ul className="space-y-0.5">
              {managementNavigation.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center px-3 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                        isActive
                          ? "bg-slate-900/85 text-slate-100"
                          : "text-slate-400 hover:bg-slate-900/40 hover:text-slate-200"
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 mr-2.5 ${isActive ? "text-violet-400/90" : "text-slate-500"}`} />
                      <span>{item.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      {/* Sidebar Footer (Clean User Profile + Footnote) */}
      <div className="p-3 space-y-3">
        {/* Subtle Footnote instead of bulky card */}
        <div className="px-3 py-1 flex justify-between text-[9px] text-slate-600 font-mono pt-2 border-t border-slate-900/30">
          <span>{profile?.isAdmin ? "Admin Console" : "Agency Portal"}</span>
          <span>v4.1.2</span>
        </div>

        {/* User Profile Info */}
        <div className="flex items-center justify-between p-2 border-t border-slate-900/50 pt-3">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-7 h-7 rounded-full bg-slate-900 border border-slate-800 text-slate-400 flex items-center justify-center font-medium text-xs shrink-0 select-none">
              {userInitial}
            </div>
            <div className="flex flex-col text-left overflow-hidden">
              <span className="text-xs font-bold text-slate-300 truncate" title={profile?.agencyName || "Lumen Admin"}>
                {profile?.agencyName || "Lumen Admin"}
              </span>
              <span className="text-[9px] text-slate-500 truncate" title={profile?.email}>
                {profile?.email}
              </span>
            </div>
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
  );
}
