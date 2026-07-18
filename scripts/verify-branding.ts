import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "https://wrbgbkmwusbeankitwex.supabase.co";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyYmdia213dXNiZWFua2l0d2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzMDY5MzgsImV4cCI6MjA5OTg4MjkzOH0.3gY2dWwSu0uc3MGrcpIOz6mJXej1JJeueGQUdC_wrYg";
const supabase = createClient(supabaseUrl, anonKey);
const PORT = process.env.PORT || "3001";

async function main() {
  console.log(`Starting automated verification of Multi-Tenant White-Label Branding on port ${PORT}...\n`);

  try {
    // -------------------------------------------------------------
    // TEST 1: Login as Demo Agency
    // -------------------------------------------------------------
    console.log("=== TEST 1: Logging in as Demo Agency (agency@lumen.co) ===");
    const { data: demoAuth, error: demoAuthError } = await supabase.auth.signInWithPassword({
      email: "agency@lumen.co",
      password: "AgencyPass123!"
    });
    if (demoAuthError || !demoAuth.session) {
      throw new Error("Demo Agency auth failed: " + demoAuthError?.message);
    }
    const demoToken = demoAuth.session.access_token;
    console.log("✅ Authenticated as Demo Agency.");

    const demoHeaders = { "Authorization": `Bearer ${demoToken}`, "Content-Type": "application/json" };

    // Fetch Profile
    const demoProfileRes = await fetch(`http://localhost:${PORT}/api/profile`, { headers: demoHeaders });
    if (!demoProfileRes.ok) throw new Error("Failed to fetch Demo Agency profile");
    const demoProfile = await demoProfileRes.json() as any;
    
    console.log(`  Agency Name:   "${demoProfile.agencyName}"`);
    console.log(`  Logo URL:      ${demoProfile.logoUrl} (Expected: null)`);
    console.log(`  Primary Color: ${demoProfile.primaryColor} (Expected: null)`);
    console.log(`  Accent Color:  ${demoProfile.accentColor} (Expected: null)`);
    
    if (demoProfile.logoUrl !== null || demoProfile.primaryColor !== null || demoProfile.accentColor !== null) {
      throw new Error("❌ FAIL: Demo Agency should have NULL branding fields to fallback to defaults!");
    }
    console.log("✅ PASS: Demo Agency branding fields are null (default fallback intact).");

    // Fetch Clients
    const demoClientsRes = await fetch(`http://localhost:${PORT}/api/clients`, { headers: demoHeaders });
    if (!demoClientsRes.ok) throw new Error("Failed to fetch Demo Agency clients");
    const demoClients = await demoClientsRes.json() as any[];
    console.log(`  Clients Count: ${demoClients.length} (Expected: 4)`);
    console.log(`  Client Names:  [ ${demoClients.map(c => c.name).join(", ")} ]`);
    if (demoClients.length !== 4) {
      throw new Error("❌ FAIL: Demo Agency should have exactly 4 clients!");
    }
    console.log("✅ PASS: Demo Agency client isolation verified.\n");

    // -------------------------------------------------------------
    // TEST 2: Login as Ignite PPC Group
    // -------------------------------------------------------------
    console.log("=== TEST 2: Logging in as Ignite PPC Group (ignitepp@lumen.co) ===");
    const { data: igniteAuth, error: igniteAuthError } = await supabase.auth.signInWithPassword({
      email: "ignitepp@lumen.co",
      password: "IgnitePass123!"
    });
    if (igniteAuthError || !igniteAuth.session) {
      throw new Error("Ignite PPC Group auth failed: " + igniteAuthError?.message);
    }
    const igniteToken = igniteAuth.session.access_token;
    console.log("✅ Authenticated as Ignite PPC Group.");

    const igniteHeaders = { "Authorization": `Bearer ${igniteToken}`, "Content-Type": "application/json" };

    // Fetch Profile
    const igniteProfileRes = await fetch(`http://localhost:${PORT}/api/profile`, { headers: igniteHeaders });
    if (!igniteProfileRes.ok) throw new Error("Failed to fetch Ignite PPC Group profile");
    const igniteProfile = await igniteProfileRes.json() as any;
    
    console.log(`  Agency Name:   "${igniteProfile.agencyName}"`);
    console.log(`  Logo URL:      "${igniteProfile.logoUrl}" (Expected: "IGNITE_PPC")`);
    console.log(`  Primary Color: "${igniteProfile.primaryColor}" (Expected: "#ea580c")`);
    console.log(`  Accent Color:  "${igniteProfile.accentColor}" (Expected: "#dc2626")`);
    
    if (igniteProfile.logoUrl !== "IGNITE_PPC" || igniteProfile.primaryColor !== "#ea580c" || igniteProfile.accentColor !== "#dc2626") {
      throw new Error("❌ FAIL: Ignite PPC Group branding values do not match database configuration!");
    }
    console.log("✅ PASS: Ignite PPC Group branding fields successfully loaded.");

    // Fetch Clients
    const igniteClientsRes = await fetch(`http://localhost:${PORT}/api/clients`, { headers: igniteHeaders });
    if (!igniteClientsRes.ok) throw new Error("Failed to fetch Ignite PPC Group clients");
    const igniteClients = await igniteClientsRes.json() as any[];
    console.log(`  Clients Count: ${igniteClients.length} (Expected: 3)`);
    console.log(`  Client Names:  [ ${igniteClients.map(c => c.name).join(", ")} ]`);
    if (igniteClients.length !== 3) {
      throw new Error("❌ FAIL: Ignite PPC Group should have exactly 3 clients!");
    }
    console.log("✅ PASS: Ignite PPC Group client isolation verified.");

    // Verify analytics retrieval for Ignite's client
    const c5AnalyticsRes = await fetch(`http://localhost:${PORT}/api/analytics/c5`, { headers: igniteHeaders });
    if (!c5AnalyticsRes.ok) throw new Error("Failed to fetch analytics for client c5");
    const c5Analytics = await c5AnalyticsRes.json() as any;
    console.log(`  Client c5 metrics: ${c5Analytics.metrics.length} rows loaded.`);
    console.log("✅ PASS: Analytics retrieved successfully for branded client.\n");

    // -------------------------------------------------------------
    // TEST 3: Login as Lumen Admin
    // -------------------------------------------------------------
    console.log("=== TEST 3: Logging in as Lumen Admin (admin@lumen.co) ===");
    const { data: adminAuth, error: adminAuthError } = await supabase.auth.signInWithPassword({
      email: "admin@lumen.co",
      password: "AdminPass123!"
    });
    if (adminAuthError || !adminAuth.session) {
      throw new Error("Admin auth failed: " + adminAuthError?.message);
    }
    const adminToken = adminAuth.session.access_token;
    console.log("✅ Authenticated as Lumen Admin.");

    const adminHeaders = { "Authorization": `Bearer ${adminToken}`, "Content-Type": "application/json" };

    // Fetch Profile
    const adminProfileRes = await fetch(`http://localhost:${PORT}/api/profile`, { headers: adminHeaders });
    if (!adminProfileRes.ok) throw new Error("Failed to fetch Admin profile");
    const adminProfile = await adminProfileRes.json() as any;
    
    console.log(`  User Email:    "${adminProfile.email}"`);
    console.log(`  Is Admin:      ${adminProfile.isAdmin} (Expected: true)`);
    console.log(`  Agency Name:   ${adminProfile.agencyName} (Expected: null)`);
    
    if (adminProfile.isAdmin !== true || adminProfile.agencyName !== null) {
      throw new Error("❌ FAIL: Admin profile parameters are incorrect!");
    }
    console.log("✅ PASS: Admin role parameters verified.");

    // Fetch All Clients (as Admin)
    const adminClientsRes = await fetch(`http://localhost:${PORT}/api/clients`, { headers: adminHeaders });
    if (!adminClientsRes.ok) throw new Error("Failed to fetch Admin clients");
    const adminClients = await adminClientsRes.json() as any[];
    console.log(`  Clients Count: ${adminClients.length} (Expected: 7 total across all agencies)`);
    if (adminClients.length !== 7) {
      throw new Error("❌ FAIL: Admin should have visibility of all 7 clients (4 Demo Agency + 3 Ignite PPC Group)!");
    }
    console.log("✅ PASS: Admin cross-agency visibility verified.\n");

    console.log("🎉 ALL BRANDING VERIFICATION TESTS PASSED SUCCESSFULLY!");

  } catch (err: any) {
    console.error("\n❌ Verification failed:", err.message || err);
    process.exit(1);
  }
}

main();
