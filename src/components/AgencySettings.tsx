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
    <div className="space-y-6 font-sans text-left animate-fade-in">
      <div>
        <h2 className="text-xl font-bold font-display text-slate-100 flex items-center gap-2">
          <Sliders className="w-5 h-5 text-accent" />
          Agency Control Panel
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Manage your portal brand presence, custom client messaging, and dashboard alerts.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form onSubmit={handleSave} className="lg:col-span-2 p-6 rounded-xl bg-[#101010] border border-white/5 space-y-6">
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
              className="w-full form-input h-auto leading-relaxed focus:border-accent/50 p-4"
            />
          </div>
 
          <div className="flex justify-end pt-4 border-t border-white/5">
            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex items-center gap-1.5"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{loading ? "Saving..." : "Save Settings"}</span>
            </button>
          </div>
        </form>

        <div className="p-5 rounded-xl bg-[#101010] border border-white/5 space-y-4 h-fit">
          <div className="flex items-center gap-2 text-accent">
            <Sparkles className="w-4 h-4" />
            <h4 className="text-xs font-bold text-slate-200 font-display uppercase tracking-wider">
              Preview Mode
            </h4>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            The CTA message will render prominently on the Dashboard Overview screen of every client portal linked to your agency.
          </p>

          {ctaText ? (
            <div className="p-3.5 rounded-lg bg-accent/5 border border-accent/20 text-xs text-accent font-medium leading-relaxed">
              {ctaText}
            </div>
          ) : (
            <div className="p-3.5 rounded-lg bg-[#080808]/40 border border-white/5 text-xs text-slate-600 italic text-center">
              No message active (hidden from clients)
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
// Restored agency settings tab customization
