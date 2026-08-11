import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error("Missing SUPABASE_URL in env.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey || "");

async function run() {
  console.log("1. Authenticating admin user...");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: "admin@lumen.co",
    password: "AdminPass123!"
  });

  if (error) {
    console.error("Auth failed:", error.message);
    process.exit(1);
  }

  const token = data.session.access_token;
  console.log("Authentication successful! Token acquired.");

  const port = process.env.PORT || 3000;
  const url = `http://localhost:${port}/api/clients/c_apex_roof/report?startDate=2026-08-03&endDate=2026-08-09`;

  console.log(`2. Hitting report endpoint: ${url}`);
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    console.log("Response status:", res.status);
    const json = await res.json() as any;
    if (res.ok) {
      console.log("REPORT DATA GENERATION SUCCESSFUL!");
      console.log("Client Name:", json.clientName);
      console.log("Agency Name:", json.agencyName);
      console.log("Portal URL:", json.portalUrl);
      console.log("Weekly Metrics:", json.metrics);
      console.log("AI Summary observations:", json.summary?.campaignObservations);
      console.log("Top campaign name:", json.campaigns?.[0]?.campaign_name);
    } else {
      console.error("Error from API:", json);
    }

    const previewUrl = `http://localhost:${port}/api/clients/c_apex_roof/report/preview?startDate=2026-08-03&endDate=2026-08-09`;
    console.log(`3. Hitting preview endpoint: ${previewUrl}`);
    const previewRes = await fetch(previewUrl, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    console.log("Preview Response status:", previewRes.status);
    const html = await previewRes.text();
    if (previewRes.ok) {
      console.log("HTML PREVIEW GENERATION SUCCESSFUL!");
      console.log("First 300 chars of HTML:");
      console.log(html.substring(0, 300));
    } else {
      console.error("Error from Preview API:", html);
    }

    const testEmailUrl = `http://localhost:${port}/api/clients/c_apex_roof/report/test`;
    console.log(`4. Hitting test email endpoint: ${testEmailUrl}`);
    const testEmailRes = await fetch(testEmailUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ testEmail: "test@lumenanalytics.co" })
    });
    console.log("Test Email Response status:", testEmailRes.status);
    const testResult = await testEmailRes.json() as any;
    if (testEmailRes.ok) {
      console.log("TEST EMAIL DISPATCH SUCCESSFUL!");
      console.log("Response:", testResult);
    } else {
      console.error("Error from Test Email API:", testResult);
    }
  } catch (err: any) {
    console.error("Fetch error:", err.message);
  }
}

run();
