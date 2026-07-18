import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "https://wrbgbkmwusbeankitwex.supabase.co";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyYmdia213dXNiZWFua2l0d2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzMDY5MzgsImV4cCI6MjA5OTg4MjkzOH0.3gY2dWwSu0uc3MGrcpIOz6mJXej1JJeueGQUdC_wrYg";
const supabase = createClient(supabaseUrl, anonKey);
const PORT = process.env.PORT || "3001";

async function main() {
  console.log(`Starting verification of CSV Import & Custom CTA features on port ${PORT}...`);

  try {
    // 1. Sign in as agency@lumen.co
    console.log("Signing in as agency@lumen.co...");
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: "agency@lumen.co",
      password: "AgencyPass123!"
    });

    if (authError || !authData.session) {
      throw new Error("Auth failed: " + (authError?.message || "No session returned."));
    }

    const token = authData.session.access_token;
    console.log("✅ Authenticated successfully! Token acquired.");

    const headers = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    };

    // 2. Set custom CTA
    console.log("\nTesting Custom CTA Update...");
    const testCtaText = "Verification Test CTA: Ready to scale? Contact our strategy desk.";
    const ctaRes = await fetch(`http://localhost:${PORT}/api/agency/cta`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ customCta: testCtaText })
    });

    if (!ctaRes.ok) {
      throw new Error(`Failed to update CTA: ${ctaRes.statusText} (${await ctaRes.text()})`);
    }

    console.log("✅ Custom CTA updated via backend PUT route!");

    // 3. Get profile and verify CTA
    console.log("\nVerifying profile contains updated CTA...");
    const profileRes = await fetch(`http://localhost:${PORT}/api/profile`, { headers });
    if (!profileRes.ok) {
      throw new Error("Failed to fetch profile");
    }

    const profileData = await profileRes.json() as any;
    console.log("Profile customCta:", profileData.customCta);
    if (profileData.customCta !== testCtaText) {
      throw new Error("CTA mismatch in fetched profile!");
    }
    console.log("✅ Custom CTA verified successfully in profile object!");

    // 4. Test CSV Import
    console.log("\nTesting CSV Import for client c1...");
    const sampleMetrics = [
      { date: "2026-07-01", platform: "Google Ads", spend: 100, impressions: 5000, clicks: 120, conversions: 10 },
      { date: "2026-07-02", platform: "Google Ads", spend: 120, impressions: 5500, clicks: 130, conversions: 12 },
      { date: "2026-07-03", platform: "Meta Ads", spend: 80, impressions: 4000, clicks: 90, conversions: 8 },
      { date: "2026-07-04", platform: "Meta Ads", spend: 90, impressions: 4500, clicks: 100, conversions: 9 },
      { date: "2026-07-05", platform: "TikTok Ads", spend: 150, impressions: 8000, clicks: 200, conversions: 25 }
    ];

    const importRes = await fetch(`http://localhost:${PORT}/api/clients/c1/import`, {
      method: "POST",
      headers,
      body: JSON.stringify({ rows: sampleMetrics })
    });

    if (!importRes.ok) {
      throw new Error(`Failed to import metrics: ${importRes.statusText} (${await importRes.text()})`);
    }

    const importResult = await importRes.json() as any;
    console.log(`✅ CSV Import succeeded! Imported count: ${importResult.count}`);

    // 5. Verify analytics endpoint returns the imported data
    console.log("\nFetching analytics for client c1 to verify data fallback...");
    const analyticsRes = await fetch(`http://localhost:${PORT}/api/analytics/c1`, { headers });
    if (!analyticsRes.ok) {
      throw new Error("Failed to fetch analytics");
    }

    const analyticsData = await analyticsRes.json() as any;
    console.log(`Fetched metrics count: ${analyticsData.metrics.length}`);
    
    if (analyticsData.metrics.length !== sampleMetrics.length) {
      throw new Error(`Expected exactly ${sampleMetrics.length} metrics rows, but got ${analyticsData.metrics.length}.`);
    }

    const firstMetric = analyticsData.metrics[0];
    console.log("First metrics row:", firstMetric);
    if (Number(firstMetric.spend) !== 100 || Number(firstMetric.conversions) !== 10) {
      throw new Error("Imported metrics values do not match expected input!");
    }
    console.log("✅ Verified imported campaign metrics returned successfully!");

    // Clean up CTA back to empty
    console.log("\nCleaning up CTA message...");
    await fetch(`http://localhost:${PORT}/api/agency/cta`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ customCta: "" })
    });
    console.log("✅ Cleanup complete!");
    
    console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY!");

  } catch (err: any) {
    console.error("\n❌ Verification failed:", err.message || err);
    process.exit(1);
  }
}

main();
