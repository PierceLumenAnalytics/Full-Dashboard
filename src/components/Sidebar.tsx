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
  userEmail: string;
}

export default function Sidebar({ activeTab, setActiveTab, userEmail }: SidebarProps) {
  const mainNavigation = [
    { id: "overview" as ActiveTab, name: "Dashboard Overview", icon: LayoutDashboard },
    { id: "summary" as ActiveTab, name: "AI Daily Summary", icon: Sparkles },
  ];

  const managementNavigation = [
    { id: "clients" as ActiveTab, name: "Connected Clients", icon: Users },
    { id: "logs" as ActiveTab, name: "Security Audit Logs", icon: FileTerminal },
  ];

  return (
    <aside className="w-64 bg-slate-950 border-r border-slate-900 flex flex-col justify-between select-none h-screen shrink-0 font-sans">
      {/* Brand Header */}
      <div>
        <div className="p-6 flex items-center gap-3 border-b border-slate-900/60">
          <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold font-display tracking-tight text-slate-100 flex items-center gap-1.5">
              Lumen <span className="text-violet-400">Analytics</span>
            </h1>
            <span className="text-[10px] text-violet-400/80 tracking-widest font-mono uppercase block">
              INSIGHTS PLATFORM
            </span>
          </div>
        </div>

        {/* Navigation Groups */}
        <div className="px-4 py-6 space-y-7">
          {/* Main Navigation Group */}
          <div>
            <span className="text-[10px] font-mono tracking-widest text-slate-500 uppercase px-3 block mb-2">
              Analytics
            </span>
            <ul className="space-y-1">
              {mainNavigation.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                        isActive
                          ? "bg-violet-600/15 border-l-2 border-violet-500 text-violet-300"
                          : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`w-4 h-4 ${isActive ? "text-violet-400" : "text-slate-400"}`} />
                        <span>{item.name}</span>
                      </div>
                      {isActive && <ChevronRight className="w-3 h-3 text-violet-400" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Management Group */}
          <div>
            <span className="text-[10px] font-mono tracking-widest text-slate-500 uppercase px-3 block mb-2">
              Management
            </span>
            <ul className="space-y-1">
              {managementNavigation.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                        isActive
                          ? "bg-violet-600/15 border-l-2 border-violet-500 text-violet-300"
                          : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`w-4 h-4 ${isActive ? "text-violet-400" : "text-slate-400"}`} />
                        <span>{item.name}</span>
                      </div>
                      {isActive && <ChevronRight className="w-3 h-3 text-violet-400" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      {/* Sidebar Footer (Upgrade Card + User Profile) */}
      <div className="p-4 space-y-4">
        {/* Powered by Lumen Analytics badge */}
        <div className="p-4 rounded-xl bg-slate-900/30 border border-slate-900/60 flex flex-col items-center justify-center gap-1 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-violet-500/5 to-transparent pointer-events-none" />
          <span className="text-[9px] font-mono tracking-widest text-violet-400 uppercase">
            Platform Engine
          </span>
          <p className="text-xs font-semibold text-slate-300">
            Powered by Lumen Analytics
          </p>
          <span className="text-[10px] text-slate-500 font-mono">
            v4.1.2 · Enterprise Tier
          </span>
        </div>

        {/* User Profile Info */}
        <div className="flex items-center justify-between p-2 border-t border-slate-900/80 pt-4">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-violet-500/20 text-violet-300 flex items-center justify-center font-bold text-xs shrink-0 select-none">
              P
            </div>
            <div className="flex flex-col text-left overflow-hidden">
              <span className="text-xs font-semibold text-slate-200 truncate">Pierce</span>
              <span className="text-[10px] text-slate-500 truncate" title={userEmail}>
                {userEmail}
              </span>
            </div>
          </div>
          <button
            onClick={() => alert("Simulation logout: To reset context, reload the browser.")}
            className="text-slate-500 hover:text-rose-400 transition-colors p-1 rounded-md hover:bg-slate-900/50 cursor-pointer"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
