import React from "react";
import { 
  LayoutDashboard, 
  Users, 
  Sparkles, 
  FileTerminal, 
  LogOut, 
  Layers,
  Settings,
  FileText
} from "lucide-react";
import { ActiveTab } from "../types";

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  profile: any;
  onLogout: () => void;
  isClientView?: boolean;
}

export default function Sidebar({ activeTab, setActiveTab, profile, onLogout, isClientView = false }: SidebarProps) {
  const mainNavigation = [
    { id: "overview" as ActiveTab, name: "Overview", icon: LayoutDashboard },
    { id: "summary" as ActiveTab, name: "Intelligence", icon: Sparkles },
  ];

  if (!isClientView) {
    mainNavigation.push({ id: "reports" as ActiveTab, name: "Reports", icon: FileText });
  }

  let managementNavigation: any[] = [];
  if (!isClientView) {
    managementNavigation.push({ id: "clients" as ActiveTab, name: "Clients", icon: Users });
    if (profile?.isAdmin) {
      managementNavigation.push({ id: "admin-panel" as ActiveTab, name: "Admin Panel", icon: Settings });
      managementNavigation.push({ id: "logs" as ActiveTab, name: "Security Audit Logs", icon: FileTerminal });
    }
    if (profile && !profile.isAdmin) {
      managementNavigation.push({ id: "settings" as ActiveTab, name: "Settings", icon: Settings });
    }
  }

  const isPublicReader = profile?.id === "public-reader";
  const userInitial = profile?.email ? profile.email.charAt(0).toUpperCase() : "U";

  return (
    <aside className="w-[220px] bg-[#101010] border-r border-white/5 flex flex-col justify-between select-none h-screen shrink-0 font-sans text-left">
      {/* Brand Header */}
      <div>
        <div className="p-5 flex items-center gap-2.5 border-b border-white/5 text-left">
          {profile?.logoUrl && (profile.logoUrl.startsWith("http") || profile.logoUrl.startsWith("data:") || profile.logoUrl.includes("/")) ? (
            <div className="flex items-center gap-2.5">
              <img 
                src={profile.logoUrl} 
                alt={profile.agencyName || "Agency Logo"} 
                className="max-h-8 max-w-[150px] object-contain" 
              />
            </div>
          ) : profile?.agencyName ? (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg border border-accent/20 bg-[#151515] flex items-center justify-center font-bold text-xs shrink-0">
                <span className="text-accent font-display text-sm font-bold">
                  {profile.agencyName.substring(0, 2).toUpperCase()}
                </span>
              </div>
              <div className="overflow-hidden">
                <h1 className="text-sm font-semibold tracking-tight text-[#F5F3EE] flex items-center gap-1.5 truncate">
                  <span className="truncate">{profile.agencyName}</span>
                  {profile?.isDemo && (
                    <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-accent/10 text-accent border border-accent/20 uppercase tracking-widest font-mono shrink-0">
                      Demo
                    </span>
                  )}
                </h1>
                <span className="text-[9px] text-[#8A8680] tracking-wider font-mono uppercase block truncate">
                  Marketing Intelligence
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg border border-accent/25 bg-[#151515] flex items-center justify-center font-bold text-xs shrink-0">
                <span className="text-accent font-display text-sm font-bold">L</span>
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-widest text-[#F5F3EE] font-display">
                  LUMEN
                </h1>
                <span className="text-[9px] text-[#8A8680] tracking-widest font-mono uppercase block">
                  MARKETING INTELLIGENCE
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Groups */}
        <div className="px-3 py-4 space-y-6">
          {/* Main Navigation Group */}
          <div>
            <span className="text-[10px] font-mono tracking-widest text-[#8A8680]/70 uppercase px-3 block mb-1.5">
              WORKSPACE
            </span>
            <ul className="space-y-0.5">
              {mainNavigation.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center py-2 text-xs font-medium transition-all cursor-pointer focus:outline-none ${
                        isActive
                          ? "border-l-2 border-accent text-accent bg-transparent pl-2.5 font-bold"
                          : "text-[#8A8680] hover:text-[#F5F3EE] hover:bg-white/5 pl-3"
                      }`}
                    >
                      {isActive ? (
                        <span className="w-3.5 h-3.5 mr-2.5 bg-accent rounded-full inline-block scale-50"></span>
                      ) : (
                        <Icon className="w-3.5 h-3.5 mr-2.5 text-[#8A8680]/60 shrink-0" />
                      )}
                      <span>{item.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Management Group */}
          {managementNavigation.length > 0 && (
            <div>
              <span className="text-[10px] font-mono tracking-widest text-[#8A8680]/70 uppercase px-3 block mb-1.5">
                MANAGE
              </span>
              <ul className="space-y-0.5">
                {managementNavigation.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  
                  if (item.id === "admin-panel") {
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => {
                            window.location.href = "/admin";
                          }}
                          className="w-full flex items-center py-2 text-xs font-medium text-[#8A8680] hover:text-[#F5F3EE] hover:bg-white/5 pl-3 cursor-pointer focus:outline-none"
                        >
                          <Icon className="w-3.5 h-3.5 mr-2.5 text-[#8A8680]/60 shrink-0" />
                          <span>{item.name}</span>
                        </button>
                      </li>
                    );
                  }

                  if (item.id === "logs") {
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => setActiveTab(item.id)}
                          className={`w-full flex items-center py-1.5 text-[10.5px] font-medium transition-all cursor-pointer focus:outline-none ${
                            isActive
                              ? "border-l-2 border-accent text-accent bg-transparent pl-2.5 font-bold"
                              : "text-[#8A8680]/80 hover:text-[#F5F3EE] pl-3"
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-700 mr-2"></span>
                          <span>{item.name}</span>
                        </button>
                      </li>
                    );
                  }
                  
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => setActiveTab(item.id)}
                        className={`w-full flex items-center py-2 text-xs font-medium transition-all cursor-pointer focus:outline-none ${
                          isActive
                            ? "border-l-2 border-accent text-accent bg-transparent pl-2.5 font-bold"
                            : "text-[#8A8680] hover:text-[#F5F3EE] hover:bg-white/5 pl-3"
                        }`}
                      >
                        {isActive ? (
                          <span className="w-3.5 h-3.5 mr-2.5 bg-accent rounded-full inline-block scale-50"></span>
                        ) : (
                          <Icon className="w-3.5 h-3.5 mr-2.5 text-[#8A8680]/60 shrink-0" />
                        )}
                        <span>{item.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Sidebar Footer */}
      <div className="p-3 space-y-3 border-t border-white/5">
        <div className="px-3 py-1 flex justify-between text-[9px] text-[#8A8680] font-mono pt-1">
          <span>{isClientView ? "Client Portal" : isPublicReader ? "Client Portal" : profile?.isAdmin ? "Admin Console" : "Agency Portal"}</span>
          {profile?.isDemo && <span className="text-accent font-bold tracking-wider">DEMO MODE</span>}
        </div>

        {!isClientView && !isPublicReader && (
          <div className="flex items-center justify-between p-2 pt-2">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-7 h-7 rounded-full bg-[#151515] border border-white/10 text-[#F5F3EE] flex items-center justify-center font-medium text-xs shrink-0 select-none">
                {userInitial}
              </div>
              <div className="flex flex-col text-left overflow-hidden">
                <span className="text-xs font-bold text-[#F5F3EE] truncate" title={profile?.agencyName || "Lumen Admin"}>
                  {profile?.agencyName || "Lumen Admin"}
                </span>
                <span className="text-[9px] text-[#8A8680] truncate" title={profile?.email}>
                  {profile?.email}
                </span>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="text-[#8A8680] hover:text-[#F87171]/80 transition-colors p-1 rounded hover:bg-white/5 cursor-pointer"
              title="Log Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
