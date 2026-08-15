import React, { useEffect, useState } from "react";
import DashboardShell from "./components/DashboardShell";
import Login from "./components/Login";
import AdminPanel from "./components/AdminPanel";
import ClientPortal from "./components/ClientPortal";
import { supabase, setGlobalSession } from "./lib/supabaseClient";

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAdminRoute, setIsAdminRoute] = useState(false);
  const [portalToken, setPortalToken] = useState<string | null>(null);
  const [agencySlug, setAgencySlug] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tenantNotFound, setTenantNotFound] = useState(false);
  const [invalidSlugName, setInvalidSlugName] = useState<string>("");

  useEffect(() => {
    const initApp = async () => {
      const path = window.location.pathname;
      
      // Portal Route: /portal/:token
      const portalMatch = path.match(/^\/portal\/([^/]+)/i);
      if (portalMatch && portalMatch[1]) {
        setPortalToken(portalMatch[1]);
        setIsAdminRoute(false);
        setLoading(false);
        return;
      }

      // Legacy Route Redirect: e.g. /envision-response -> redirect explicitly to /agency/envision-response
      const legacySlugMatch = path.match(/^\/([^/]+)$/i);
      if (legacySlugMatch && legacySlugMatch[1]) {
        const candidateSlug = legacySlugMatch[1].trim().toLowerCase();
        const reservedRoutes = ["admin", "portal", "agency", "api", "login"];
        if (!reservedRoutes.includes(candidateSlug)) {
          window.location.replace(`/agency/${candidateSlug}`);
          return;
        }
      }

      // Canonical Agency Route: /agency/:agencySlug
      const agencyMatch = path.match(/^\/agency\/([^/]+)/i);
      if (agencyMatch && agencyMatch[1]) {
        const slug = agencyMatch[1].trim().toLowerCase();

        // STEP 1: Check if an authenticated Supabase session exists
        try {
          const { data: { session: activeSession } } = await supabase.auth.getSession();
          
          if (activeSession && activeSession.access_token) {
            // Validate session with backend using admin preview header
            const res = await fetch("/api/profile", {
              headers: {
                "Authorization": `Bearer ${activeSession.access_token}`,
                "X-Admin-Preview-Agency-Slug": slug,
                "X-Agency-Slug": slug
              }
            });

            if (res.ok) {
              const profile = await res.json();

              // System Admin: establish secure ADMIN PREVIEW context if requested slug resolved to an agency in DB
              if (profile.isAdmin) {
                if (profile.previewAgencySlug === slug || profile.agencySlug === slug) {
                  setAgencySlug(slug);
                  setIsAdminRoute(false);
                  setIsAdmin(true);
                  const previewSession = {
                    ...activeSession,
                    agencySlug: slug,
                    adminPreviewAgencySlug: slug
                  };
                  setSession(previewSession);
                  setGlobalSession(previewSession);
                  setLoading(false);
                  return;
                } else {
                  // Requested agency slug does not exist in DB -> Tenant Not Found!
                  setInvalidSlugName(slug);
                  setTenantNotFound(true);
                  setLoading(false);
                  return;
                }
              }

              // Normal Agency User: verify requested slug belongs to user's agency
              if (profile.agencySlug === slug) {
                setAgencySlug(slug);
                setIsAdminRoute(false);
                setIsAdmin(false);
                const userSession = {
                  ...activeSession,
                  agencySlug: slug
                };
                setSession(userSession);
                setGlobalSession(userSession);
                setLoading(false);
                return;
              }

              // Cross-tenant access attempt by normal agency user -> Deny!
              await supabase.auth.signOut().catch(() => {});
              setGlobalSession(null);
              setSession(null);
              setInvalidSlugName(slug);
              setTenantNotFound(true);
              setLoading(false);
              return;
            } else {
              // Authenticated request failed -> Deny!
              await supabase.auth.signOut().catch(() => {});
              setGlobalSession(null);
              setSession(null);
              setInvalidSlugName(slug);
              setTenantNotFound(true);
              setLoading(false);
              return;
            }
          }
        } catch (err) {
          console.error("Agency session auth check error:", err);
        }

        // STEP 2: NO authenticated session exists -> Check if agency is a public demo agency
        try {
          const publicRes = await fetch(`/api/agency/public-check/${slug}`);
          if (publicRes.ok) {
            const publicData = await publicRes.json();
            if (publicData.isDemo === true) {
              setAgencySlug(slug);
              setIsAdminRoute(false);
              setIsAdmin(false);
              const publicSession = {
                access_token: null,
                user: null,
                agencySlug: slug,
                isDemo: true
              };
              setSession(publicSession);
              setGlobalSession(publicSession);
              setLoading(false);
              return;
            } else {
              // Unauthenticated access to private agency -> Redirect to admin login
              setGlobalSession(null);
              setSession(null);
              setIsAdminRoute(true);
              setLoading(false);
              return;
            }
          } else if (publicRes.status === 404) {
            // Invalid agency slug -> Tenant Not Found!
            setInvalidSlugName(slug);
            setTenantNotFound(true);
            setLoading(false);
            return;
          }
        } catch (err) {
          console.error("Public agency check failed:", err);
        }

        setInvalidSlugName(slug);
        setTenantNotFound(true);
        setLoading(false);
        return;
      }

      if (path === "/" || path === "") {
        const slug = "northstar-digital";
        setAgencySlug(slug);
        setIsAdminRoute(false);
        const publicSession = {
          access_token: null,
          user: null,
          agencySlug: slug
        };
        setSession(publicSession);
        setGlobalSession(publicSession);
        setLoading(false);
        return;
      }
      
      // Otherwise, default to Admin route
      setIsAdminRoute(true);
      try {
        const { data: { session: activeSession } } = await supabase.auth.getSession();
        if (activeSession) {
          setGlobalSession(activeSession);
          const res = await fetch("/api/profile", {
            headers: {
              Authorization: `Bearer ${activeSession.access_token}`
            }
          });
          if (res.ok) {
            const profile = await res.json();
            if (profile.isAdmin) {
              setIsAdmin(true);
              setSession(activeSession);
            } else {
              await supabase.auth.signOut();
              setGlobalSession(null);
              setSession(null);
              alert("Access Denied: Admin role required.");
            }
          } else {
            await supabase.auth.signOut();
            setGlobalSession(null);
            setSession(null);
          }
        }
      } catch (err) {
        console.error("Session initialization failed:", err);
      } finally {
        setLoading(false);
      }
    };

    initApp();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setGlobalSession(null);
    setIsAdmin(false);
    window.location.href = "/admin";
  };

  const handleLoginSuccess = async (newSession: any) => {
    setLoading(true);
    setGlobalSession(newSession);
    try {
      const res = await fetch("/api/profile", {
        headers: {
          Authorization: `Bearer ${newSession.access_token}`
        }
      });
      if (res.ok) {
        const profile = await res.json();
        if (profile.isAdmin) {
          setIsAdmin(true);
          setSession(newSession);
        } else {
          await supabase.auth.signOut();
          setGlobalSession(null);
          setSession(null);
          alert("Access Denied: Admin role required.");
        }
      } else {
        await supabase.auth.signOut();
        setGlobalSession(null);
        setSession(null);
        alert("Access Denied: Admin role required.");
      }
    } catch (err) {
      console.error("Login verification failed:", err);
      alert("Login verification failed.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-slate-950 text-slate-400 font-mono text-xs">
        Connecting to Lumen Services...
      </div>
    );
  }

  if (tenantNotFound) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200 font-sans p-6 text-center">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-2xl space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto text-xl font-bold font-mono">
            404
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">Agency Tenant Not Found</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            The requested agency route <span className="font-mono text-amber-400 font-semibold">/agency/{invalidSlugName}</span> does not exist or is not available.
          </p>
          <div className="pt-2">
            <button
              onClick={() => window.location.href = "/admin"}
              className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
            >
              Return to System Admin
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={portalToken ? "w-screen min-h-screen bg-slate-950 overflow-y-auto" : "w-screen h-screen overflow-hidden bg-slate-950"}>
      {portalToken ? (
        <ClientPortal token={portalToken} />
      ) : isAdminRoute ? (
        session && isAdmin ? (
          <AdminPanel session={session} onLogout={handleLogout} />
        ) : (
          <Login onLoginSuccess={handleLoginSuccess} />
        )
      ) : (
        <DashboardShell session={session} onLogout={handleLogout} />
      )}
    </div>
  );
}
