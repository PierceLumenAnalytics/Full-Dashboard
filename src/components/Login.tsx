import React, { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Lock, Mail, Loader2, Sparkles } from "lucide-react";

interface LoginProps {
  onLoginSuccess: (session: any) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
      } else if (data.session) {
        onLoginSuccess(data.session);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-slate-950 text-slate-100 font-sans p-4 relative overflow-hidden">
      {/* Background soft glow elements */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-900/10 rounded-full blur-3xl"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-900/10 rounded-full blur-3xl"></div>

      <div className="w-full max-w-md bg-slate-900/60 border border-slate-900 backdrop-blur-xl rounded-2xl p-8 relative shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl mb-4 text-violet-400">
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold font-display tracking-tight text-slate-100">
            Lumen Analytics
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-mono">
            ENTERPRISE AGENCY PORTAL
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-rose-950/30 border border-rose-900/50 text-rose-400 text-xs font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 tracking-wider uppercase mb-1.5 font-mono">
              EMAIL ADDRESS
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-600" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="agency@lumen.co"
                className="w-full bg-slate-950 border border-slate-900 rounded-lg pl-10 pr-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-slate-700 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 tracking-wider uppercase mb-1.5 font-mono">
              PASSWORD
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-600" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-900 rounded-lg pl-10 pr-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-slate-700 transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-slate-900 border border-slate-800 text-slate-200 hover:text-slate-100 hover:bg-slate-800/80 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
                <span>Authenticating...</span>
              </>
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
