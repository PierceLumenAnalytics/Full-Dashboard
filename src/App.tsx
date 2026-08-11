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
        const slug = agencyMatch[1];
        if (slug === "northstar-digital") {
          // Public sales demo workspace
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

        // Real agency workspace: Require authenticated user session
        try {
          const { data: { session: activeSession } } = await supabase.auth.getSession();
          if (activeSession) {
            setGlobalSession(activeSession);
            const res = await fetch("/api/profile", {
              headers: { Authorization: `Bearer ${activeSession.access_token}` }
            });
            if (res.ok) {
              const profile = await res.json();
              if (profile.isAdmin || (profile.agencyId && profile.agencyName)) {
                setAgencySlug(slug);
                setIsAdminRoute(false);
                setSession(activeSession);
                setLoading(false);
                return;
              }
            }
          }
        } catch (err) {
          console.error("Agency session check failed:", err);
        }

        // Unauthenticated or invalid session -> Fall back to public demo
        setAgencySlug("northstar-digital");
        setIsAdminRoute(false);
        const demoSession = {
          access_token: null,
          user: null,
          agencySlug: "northstar-digital"
        };
        setSession(demoSession);
        setGlobalSession(demoSession);
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
