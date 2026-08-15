import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env && import.meta.env.VITE_SUPABASE_URL) || "https://wrbgbkmwusbeankitwex.supabase.co";
const supabaseAnonKey = (import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyYmdia213dXNiZWFua2l0d2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzMDY5MzgsImV4cCI6MjA5OTg4MjkzOH0.3gY2dWwSu0uc3MGrcpIOz6mJXej1JJeueGQUdC_wrYg";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

let globalSession: any = null;

export const setGlobalSession = (session: any) => {
  globalSession = session;
};

export const authFetch = async (url: string, options: RequestInit = {}) => {
  const headers = new Headers(options.headers || {});
  if (globalSession?.access_token) {
    headers.set("Authorization", `Bearer ${globalSession.access_token}`);
  }
  if (globalSession?.adminPreviewAgencySlug) {
    headers.set("X-Admin-Preview-Agency-Slug", globalSession.adminPreviewAgencySlug);
  }
  if (globalSession?.agencySlug) {
    headers.set("X-Agency-Slug", globalSession.agencySlug);
  }
  const res = await fetch(url, {
    ...options,
    headers
  });
  if (res.status === 401 && !globalSession?.agencySlug && !globalSession?.adminPreviewAgencySlug) {
    supabase.auth.signOut().catch(() => {});
  }
  return res;
};
