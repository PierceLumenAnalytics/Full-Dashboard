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

  useEffect(() => {
    const initApp = async () => {
      const path = window.location.pathname;
      
      const portalMatch = path.match(/^\/portal\/([^/]+)/i);
      if (portalMatch && portalMatch[1]) {
        setPortalToken(portalMatch[1]);
        setIsAdminRoute(false);
        setLoading(false);
        return;
      }

      const agencyMatch = path.match(/^\/agency\/([^/]+)/i);
      if (agencyMatch && agencyMatch[1]) {
        const slug = agencyMatch[1].trim().toLowerCase();

        // STEP 1: ALWAYS check if an authenticated Supabase session exists FIRST!
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

              // IF System Admin: establish secure ADMIN PREVIEW context for requested slug
              if (profile.isAdmin) {
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
              }

              // ELSE IF normal agency user: verify requested slug belongs to user's agency
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
              setIsAdminRoute(true);
              setLoading(false);
              return;
            } else {
              // Authenticated request failed or was rejected (e.g. 403 cross-tenant error) -> Deny!
              await supabase.auth.signOut().catch(() => {});
              setGlobalSession(null);
              setSession(null);
              setIsAdminRoute(true);
              setLoading(false);
              return;
            }
          }
        } catch (err) {
          console.error("Agency session auth check error:", err);
        }

        // STEP 2: NO authenticated session exists -> Check if agency is a public demo
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
            }
          }
        } catch (err) {
          console.error("Public agency check failed:", err);
        }

        // Unauthenticated access to private production agency -> Deny! Redirect to login/admin
        setGlobalSession(null);
        setSession(null);
        setIsAdminRoute(true);
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

  return (
    <div className="w-screen h-screen overflow-hidden bg-slate-950">
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
