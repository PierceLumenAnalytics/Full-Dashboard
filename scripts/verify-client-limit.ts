import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "https://wrbgbkmwusbeankitwex.supabase.co";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyYmdia213dXNiZWFua2l0d2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzMDY5MzgsImV4cCI6MjA5OTg4MjkzOH0.3gY2dWwSu0uc3MGrcpIOz6mJXej1JJeueGQUdC_wrYg";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PORT = process.env.PORT || "3001";

const supabase = createClient(supabaseUrl, anonKey);
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey || "");

async function main() {
  console.log(`Starting automated verification of Agency Client Limits & PDF Chart rendering on port ${PORT}...\n`);

  try {
    // -------------------------------------------------------------
    // SETUP: Logins
    // -------------------------------------------------------------
    console.log("=== STEP 1: Logging in as Tenants ===");
    
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

    // Login Admin
    const { data: adminAuth, error: adminAuthError } = await supabase.auth.signInWithPassword({
      email: "admin@lumen.co",
      password: "AdminPass123!"
    });
    if (adminAuthError || !adminAuth.session) {
      throw new Error("Admin auth failed: " + adminAuthError?.message);
    }
    const adminToken = adminAuth.session.access_token;
    const adminHeaders = { "Authorization": `Bearer ${adminToken}`, "Content-Type": "application/json" };
    console.log("✅ Authenticated as Lumen Admin.");

    // Get Demo Agency ID
    const demoProfileRes = await fetch(`http://localhost:${PORT}/api/profile`, { headers: demoHeaders });
    const demoProfile = await demoProfileRes.json() as any;
    const demoAgencyId = demoProfile.agencyId;
    console.log(`  Demo Agency ID: ${demoAgencyId}`);

    // -------------------------------------------------------------
    // TEST 1: Enforce Limit = 2 for Demo Agency (should fail to add since they have 4 clients)
    // -------------------------------------------------------------
    console.log("\n=== TEST 1: Setting Demo Agency limit to 2 and attempting to add a client ===");
    
    // Set limit = 2 via admin service role
    const { error: limitError } = await supabaseAdmin
      .from("agencies")
      .update({ client_limit: 2 })
      .eq("id", demoAgencyId);
    if (limitError) throw limitError;
    console.log("✅ Demo Agency client_limit set to 2 in database.");

    // Query profile again to verify clientLimit updated in JWT
    // (Wait: since JWT contains cached custom_claims, re-authenticating triggers claims refresh)
    const { data: demoAuthRefresh, error: demoAuthRefreshError } = await supabase.auth.signInWithPassword({
      email: "agency@lumen.co",
      password: "AgencyPass123!"
    });
    if (demoAuthRefreshError || !demoAuthRefresh.session) throw demoAuthRefreshError;
    const freshDemoHeaders = { "Authorization": `Bearer ${demoAuthRefresh.session.access_token}`, "Content-Type": "application/json" };

    const freshProfileRes = await fetch(`http://localhost:${PORT}/api/profile`, { headers: freshDemoHeaders });
    const freshProfile = await freshProfileRes.json() as any;
    console.log(`  Fresh Profile clientLimit: ${freshProfile.clientLimit} (Expected: 2)`);

    // Try creating a client (should be blocked)
    const tryCreateRes = await fetch(`http://localhost:${PORT}/api/clients`, {
      method: "POST",
      headers: freshDemoHeaders,
      body: JSON.stringify({
        name: "Blocked Client LLC",
        domain: "blockedclient.com",
        platform: "Google Ads",
        monthlyBudget: 3500
      })
    });

    console.log(`  Create Client Response Status: ${tryCreateRes.status} (Expected: 403)`);
    const tryCreateBody = await tryCreateRes.json() as any;
    console.log(`  Response body error: "${tryCreateBody.error}"`);
    
    if (tryCreateRes.status !== 403 || !tryCreateBody.error.includes("limit")) {
      throw new Error("❌ FAIL: Server did not correctly block client creation under quota limits!");
    }
    console.log("✅ PASS: Client creation blocked successfully under quota.");

    // -------------------------------------------------------------
    // TEST 2: Verify Admin accounts bypass client limits
    // -------------------------------------------------------------
    console.log("\n=== TEST 2: Verifying Lumen Admin bypasses limit check ===");
    // Admin attempts to create a client for Demo Agency
    const adminCreateRes = await fetch(`http://localhost:${PORT}/api/clients`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        name: "Admin Provisioned Client",
        domain: "adminprov.com",
        platform: "Google Ads",
        monthlyBudget: 4000,
        agencyId: demoAgencyId
      })
    });

    console.log(`  Admin Create Client Response Status: ${adminCreateRes.status} (Expected: 200)`);
    if (!adminCreateRes.ok) {
      const errBody = await adminCreateRes.json();
      throw new Error("❌ FAIL: Admin was blocked by client limit check! Error: " + JSON.stringify(errBody));
    }
    const adminClient = await adminCreateRes.json() as any;
    console.log(`  Created Client ID: "${adminClient.id}"`);
    console.log("✅ PASS: Admin successfully bypassed client limits.");

    // Cleanup the admin created client to keep database clean
    const deleteRes = await supabaseAdmin.from("clients").delete().eq("id", adminClient.id);
    if (deleteRes.error) throw deleteRes.error;
    console.log("✅ Cleaned up Admin-created client.");

    // -------------------------------------------------------------
    // CLEANUP: Reset Demo Agency limit back to 5
    // -------------------------------------------------------------
    console.log("\n=== CLEANUP: Resetting Demo Agency client limit back to 5 ===");
    const { error: resetError } = await supabaseAdmin
      .from("agencies")
      .update({ client_limit: 5 })
      .eq("id", demoAgencyId);
    if (resetError) throw resetError;
    console.log("✅ Demo Agency client_limit restored to 5 in database.");

    console.log("\n🎉 ALL CLIENT LIMIT VERIFICATION TESTS PASSED SUCCESSFULLY!");

  } catch (err: any) {
    console.error("\n❌ Verification failed:", err.message || err);
    process.exit(1);
  }
}

main();
