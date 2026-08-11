import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "[REDACTED]";
const supabaseAnonKey = "[REDACTED]";

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
  if (globalSession?.agencySlug) {
    headers.set("X-Agency-Slug", globalSession.agencySlug);
  }
  const res = await fetch(url, {
    ...options,
    headers
  });
  if (res.status === 401 && !globalSession?.agencySlug) {
    supabase.auth.signOut().catch(() => {});
  }
  return res;
};
