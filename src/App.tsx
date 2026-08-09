import React, { useEffect, useState } from "react";
import DashboardShell from "./components/DashboardShell";
import Login from "./components/Login";
import AdminPanel from "./components/AdminPanel";
import { supabase, setGlobalSession } from "./lib/supabaseClient";

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAdminRoute, setIsAdminRoute] = useState(false);
  const [agencySlug, setAgencySlug] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const initApp = async () => {
      const path = window.location.pathname;
      
      const agencyMatch = path.match(/^\/agency\/([^/]+)/i);
      if (agencyMatch && agencyMatch[1]) {
        const slug = agencyMatch[1];
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

      if (path === "/" || path === "") {
        const slug = "ignite-ppc";
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
      {isAdminRoute ? (
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
