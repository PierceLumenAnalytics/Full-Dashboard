import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "https://wrbgbkmwusbeankitwex.supabase.co";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyYmdia213dXNiZWFua2l0d2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzMDY5MzgsImV4cCI6MjA5OTg4MjkzOH0.3gY2dWwSu0uc3MGrcpIOz6mJXej1JJeueGQUdC_wrYg";
const supabase = createClient(supabaseUrl, anonKey);
const PORT = process.env.PORT || "3001";

async function main() {
  console.log(`Starting automated verification of Custom CTA Message & PDF Export data binding on port ${PORT}...\n`);

  try {
    // -------------------------------------------------------------
    // SETUP: Logins
    // -------------------------------------------------------------
    console.log("=== STEP 1: Logging in as Tenants ===");
    
    // Login Ignite
    const { data: igniteAuth, error: igniteAuthError } = await supabase.auth.signInWithPassword({
      email: "ignitepp@lumen.co",
      password: "IgnitePass123!"
    });
    if (igniteAuthError || !igniteAuth.session) {
      throw new Error("Ignite PPC Group auth failed: " + igniteAuthError?.message);
    }
    const igniteToken = igniteAuth.session.access_token;
    const igniteHeaders = { "Authorization": `Bearer ${igniteToken}`, "Content-Type": "application/json" };
    console.log("✅ Authenticated as Ignite PPC Group.");

    // Login Demo Agency
    const { data: demoAuth, error: demoAuthError } = await supabase.auth.signInWithPassword({
      email: "agency@lumen.co",
      password: "AgencyPass123!"
    });
    if (demoAuthError || !demoAuth.session) {
      throw new Error("Demo Agency auth failed: " + demoAuthError?.message);
    }
    const demoToken = demoAuth.session.access_token;
    const demoHeaders = { "Authorization": `Bearer ${demoToken}`, "Content-Type": "application/json" };
    console.log("✅ Authenticated as Demo Agency.");

    // Store original Demo Agency CTA to restore later
    const originalDemoRes = await fetch(`http://localhost:${PORT}/api/profile`, { headers: demoHeaders });
    const originalDemoProfile = await originalDemoRes.json() as any;
    const originalDemoCta = originalDemoProfile.customCta;
    console.log(`  Original Demo Agency CTA stored: "${originalDemoCta}"`);

    // -------------------------------------------------------------
    // TEST 1: Clear Ignite CTA and verify null
    // -------------------------------------------------------------
    console.log("\n=== TEST 1: Clearing Ignite CTA message ===");
    const clearIgniteRes = await fetch(`http://localhost:${PORT}/api/agency/cta`, {
      method: "PUT",
      headers: igniteHeaders,
      body: JSON.stringify({ customCta: null })
    });
    if (!clearIgniteRes.ok) throw new Error("Failed to clear Ignite CTA");
    
    const profileResNull = await fetch(`http://localhost:${PORT}/api/profile`, { headers: igniteHeaders });
    const profileNull = await profileResNull.json() as any;
    console.log(`  Ignite profile customCta: ${profileNull.customCta} (Expected: null)`);
    if (profileNull.customCta !== null) {
      throw new Error("❌ FAIL: Ignite CTA was not cleared!");
    }
    console.log("✅ PASS: Ignite CTA cleared successfully.");

    // -------------------------------------------------------------
    // TEST 2: Clear Demo CTA and verify null
    // -------------------------------------------------------------
    console.log("\n=== TEST 2: Clearing Demo Agency CTA message ===");
    const clearDemoRes = await fetch(`http://localhost:${PORT}/api/agency/cta`, {
      method: "PUT",
      headers: demoHeaders,
      body: JSON.stringify({ customCta: null })
    });
    if (!clearDemoRes.ok) throw new Error("Failed to clear Demo Agency CTA");

    const demoProfileResNull = await fetch(`http://localhost:${PORT}/api/profile`, { headers: demoHeaders });
    const demoProfileNull = await demoProfileResNull.json() as any;
    console.log(`  Demo profile customCta: ${demoProfileNull.customCta} (Expected: null)`);
    if (demoProfileNull.customCta !== null) {
      throw new Error("❌ FAIL: Demo Agency CTA was not cleared!");
    }
    console.log("✅ PASS: Demo Agency CTA cleared successfully.");

    // -------------------------------------------------------------
    // TEST 3: Set Ignite CTA and verify isolation (Demo Agency remains null)
    // -------------------------------------------------------------
    const testMessage = "📈 Let's scale Google Search Campaigns for Sizzle BBQ by 15% next week!";
    console.log(`\n=== TEST 3: Setting Ignite CTA to "${testMessage}" and checking isolation ===`);
    const updateIgniteRes = await fetch(`http://localhost:${PORT}/api/agency/cta`, {
      method: "PUT",
      headers: igniteHeaders,
      body: JSON.stringify({ customCta: testMessage })
    });
    if (!updateIgniteRes.ok) throw new Error("Failed to set Ignite CTA");

    const profileResActive = await fetch(`http://localhost:${PORT}/api/profile`, { headers: igniteHeaders });
    const profileActive = await profileResActive.json() as any;
    console.log(`  Ignite profile customCta: "${profileActive.customCta}"`);
    if (profileActive.customCta !== testMessage) {
      throw new Error("❌ FAIL: Ignite CTA message does not match set value!");
    }

    const demoProfileResCheck = await fetch(`http://localhost:${PORT}/api/profile`, { headers: demoHeaders });
    const demoProfileCheck = await demoProfileResCheck.json() as any;
    console.log(`  Demo Agency customCta: ${demoProfileCheck.customCta} (Expected: null)`);
    if (demoProfileCheck.customCta !== null) {
      throw new Error("❌ FAIL: Demo Agency CTA is not isolated!");
    }
    console.log("✅ PASS: CTA update and boundary isolation verified.");

    // -------------------------------------------------------------
    // CLEANUP: Restore original Demo Agency CTA
    // -------------------------------------------------------------
    console.log("\n=== CLEANUP: Restoring Demo Agency original CTA ===");
    const restoreDemoRes = await fetch(`http://localhost:${PORT}/api/agency/cta`, {
      method: "PUT",
      headers: demoHeaders,
      body: JSON.stringify({ customCta: originalDemoCta })
    });
    if (!restoreDemoRes.ok) throw new Error("Failed to restore Demo Agency CTA");
    console.log("✅ Demo Agency CTA restored successfully.");

    console.log("\n🎉 ALL CUSTOM CTA VERIFICATION TESTS PASSED SUCCESSFULLY!");

  } catch (err: any) {
    console.error("\n❌ Verification failed:", err.message || err);
    process.exit(1);
  }
}

main();
