import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://wrbgbkmwusbeankitwex.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyYmdia213dXNiZWFua2l0d2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzMDY5MzgsImV4cCI6MjA5OTg4MjkzOH0.3gY2dWwSu0uc3MGrcpIOz6mJXej1JJeueGQUdC_wrYg";

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
  return fetch(url, {
    ...options,
    headers
  });
};
