import React, { useEffect, useState } from "react";
import DashboardShell from "./components/DashboardShell";
import Login from "./components/Login";
import { supabase, setGlobalSession } from "./lib/supabaseClient";

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session: initSession } }) => {
      setSession(initSession);
      setGlobalSession(initSession);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setGlobalSession(newSession);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setGlobalSession(null);
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
      {session ? (
        <DashboardShell session={session} onLogout={handleLogout} />
      ) : (
        <Login onLoginSuccess={(newSession) => {
          setSession(newSession);
          setGlobalSession(newSession);
        }} />
      )}
    </div>
  );
}
