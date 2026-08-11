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
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#D6B77A]/5 rounded-full blur-3xl"></div>

      <div className="w-full max-w-md bg-[#101010]/80 border border-white/5 backdrop-blur-xl rounded-2xl p-8 relative shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="p-3 bg-[#101010] border border-white/5 rounded-xl mb-4 text-[#D6B77A]">
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
              <Mail className="absolute left-3 top-3.5 w-4 h-4 text-slate-600" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="agency@lumen.co"
                className="w-full form-input pl-10 h-11"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 tracking-wider uppercase mb-1.5 font-mono">
              PASSWORD
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 w-4 h-4 text-slate-600" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full form-input pl-10 h-11"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary h-11 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
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
