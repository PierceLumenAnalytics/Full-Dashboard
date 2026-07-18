import React, { useState } from "react";
import { Sliders, Sparkles, Loader2, Save } from "lucide-react";
import { authFetch } from "../lib/supabaseClient";

interface AgencySettingsProps {
  profile: any;
  refreshProfile: () => Promise<void>;
  addToast: (title: string, description?: string, type?: "success" | "error" | "warning" | "info") => void;
}

export default function AgencySettings({ profile, refreshProfile, addToast }: AgencySettingsProps) {
  const [ctaText, setCtaText] = useState(profile?.customCta || "");
  const [loading, setLoading] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await authFetch("/api/agency/cta", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customCta: ctaText }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to save settings.");
      }

      await refreshProfile();
      addToast(
        "Settings Saved",
        "Your agency custom CTA message has been updated and is now live for all clients.",
        "success"
      );
    } catch (err: any) {
      console.error(err);
      addToast("Failed to Save", err.message || "Could not update CTA settings.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 font-sans text-left">
      <div>
        <h2 className="text-xl font-bold font-display text-slate-100 flex items-center gap-2">
          <Sliders className="w-5 h-5 text-violet-400" />
          Agency Control Panel
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Manage your portal brand presence, custom client messaging, and dashboard alerts.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form onSubmit={handleSave} className="lg:col-span-2 p-6 rounded-xl bg-slate-900/10 border border-slate-900 space-y-6">
          <div>
            <h3 className="text-sm font-bold text-slate-200 font-display uppercase tracking-wider mb-2">
              Custom Client CTA Message
            </h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Define a message to show on your clients' dashboards. You can use this to promote new services, highlight wins, or prompt them to contact you. Leave it blank to disable the section completely.
            </p>
            
            <textarea
              rows={4}
              value={ctaText}
              onChange={(e) => setCtaText(e.target.value)}
              placeholder="e.g., Ready to scale? Ask us about our new SEO & Content packages to double organic traffic!"
              className="w-full bg-slate-950 border border-slate-900 rounded-lg p-4 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-slate-700 transition-all font-sans leading-relaxed"
            />
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-900">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Settings</span>
                </>
              )}
            </button>
          </div>
        </form>

        <div className="p-5 rounded-xl bg-slate-900/25 border border-slate-900 space-y-4 h-fit">
          <div className="flex items-center gap-2 text-violet-400">
            <Sparkles className="w-4 h-4" />
            <h4 className="text-xs font-bold text-slate-200 font-display uppercase tracking-wider">
              Preview Mode
            </h4>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            The CTA message will render prominently on the Dashboard Overview screen of every client portal linked to your agency.
          </p>

          {ctaText ? (
            <div className="p-3.5 rounded-lg bg-violet-950/20 border border-violet-500/30 text-xs text-violet-300 font-medium leading-relaxed">
              {ctaText}
            </div>
          ) : (
            <div className="p-3.5 rounded-lg bg-slate-950/40 border border-slate-900 text-xs text-slate-600 italic text-center">
              No message active (hidden from clients)
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
