import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "https://wrbgbkmwusbeankitwex.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error("❌ Missing SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const PORT = 3009;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function runEnvisionSecuritySuite() {
  console.log("==================================================");
  console.log("LUMEN ANALYTICS — ENVISION RESPONSE ROUTING & SECURITY TEST SUITE");
  console.log("==================================================\n");

  // Start local server for testing
  const { default: app } = await import("../server.js");
  const server = app.listen(PORT, "127.0.0.1");

  let passCount = 0;
  let failCount = 0;

  const assertTest = (name: string, condition: boolean, detail?: string) => {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passCount++;
    } else {
      console.error(`[FAIL] ${name} — ${detail || "Assertion failed"}`);
      failCount++;
    }
  };

  try {
    // 1. Fetch Envision Response Agency in DB
    const { data: envisionAg, error: envAgErr } = await supabaseAdmin
      .from("agencies")
      .select("*")
      .eq("slug", "envision-response")
      .single();

    if (envAgErr || !envisionAg) {
      throw new Error("Envision Response agency record not found in database.");
    }

    // 2. Fetch Northstar Digital Agency in DB
    const { data: northstarAg, error: nsAgErr } = await supabaseAdmin
      .from("agencies")
      .select("*")
      .eq("slug", "northstar-digital")
      .single();

    if (nsAgErr || !northstarAg) {
      throw new Error("Northstar Digital agency record not found in database.");
    }

    // Ensure Auth Users exist & passwords set
    const { data: authData } = await supabaseAdmin.auth.admin.listUsers();
    const usersList: any[] = authData?.users || [];
    const adminUserObj = usersList.find((u: any) => u.email === "admin@lumen.co");
    const nsUserObj = usersList.find((u: any) => u.email === "agency@northstar-digital.com");

    if (adminUserObj) {
      await supabaseAdmin.auth.admin.updateUserById(adminUserObj.id, { password: "Password123!" });
    }
    if (nsUserObj) {
      await supabaseAdmin.auth.admin.updateUserById(nsUserObj.id, { password: "Password123!" });
    }

    // 3. Authenticate System Admin
    const adminAuth = await supabaseAdmin.auth.signInWithPassword({
      email: "admin@lumen.co",
      password: "Password123!"
    });
    const adminToken = adminAuth?.data?.session?.access_token;
    if (!adminToken) throw new Error("Failed to authenticate System Admin");

    // 4. Authenticate Reference Agency User (Northstar)
    const nsAuth = await supabaseAdmin.auth.signInWithPassword({
      email: "agency@northstar-digital.com",
      password: "Password123!"
    });
    const northstarToken = nsAuth?.data?.session?.access_token;
    if (!northstarToken) throw new Error("Failed to authenticate Northstar Agency User");

    // --- TEST A: /agency/envision-response resolves Envision Response in DB ---
    const resA = await fetch(`${BASE_URL}/api/agency/public-check/envision-response`);
    const dataA: any = await resA.json();
    assertTest(
      "TEST A: /agency/envision-response resolves Envision Response correctly from database",
      resA.status === 200 && dataA.slug === "envision-response" && dataA.id === envisionAg.id
    );

    // --- TEST B: Envision data requests return only Envision records ---
    const resB = await fetch(`${BASE_URL}/api/clients`, {
      headers: {
        "Authorization": `Bearer ${adminToken}`,
        "X-Admin-Preview-Agency-Slug": "envision-response"
      }
    });
    const dataB: any = await resB.json();
    const allEnvisionClients = Array.isArray(dataB) && dataB.every(c => c.agencyId === envisionAg.id);
    const containsPremera = Array.isArray(dataB) && dataB.some(c => c.name.toLowerCase().includes("premera"));
    assertTest(
      "TEST B: Envision data requests return only Envision records (Premera BlueCross)",
      resB.status === 200 && allEnvisionClients && containsPremera
    );

    // --- TEST C: Envision users / cross-tenant calls cannot access Northstar data ---
    const resC = await fetch(`${BASE_URL}/api/analytics/c_apex_roof`, {
      headers: {
        "Authorization": `Bearer ${northstarToken}`,
        "X-Agency-Slug": "envision-response"
      }
    });
    assertTest(
      "TEST C: Cross-tenant access attempt with mismatched agency context is rejected with 403 Forbidden",
      resC.status === 403
    );

    // --- TEST D: Northstar users cannot access Envision data ---
    const resD = await fetch(`${BASE_URL}/api/analytics/c_2bbe8vr8f`, {
      headers: {
        "Authorization": `Bearer ${northstarToken}`
      }
    });
    assertTest(
      "TEST D: Northstar agency user trying to access Envision client (Premera) is rejected with 403 Forbidden",
      resD.status === 403
    );

    // --- TEST E: System Admin can preview Envision ---
    const resE = await fetch(`${BASE_URL}/api/profile`, {
      headers: {
        "Authorization": `Bearer ${adminToken}`,
        "X-Admin-Preview-Agency-Slug": "envision-response"
      }
    });
    const dataE: any = await resE.json();
    assertTest(
      "TEST E: System Admin can preview Envision Response (isAdmin = true, agencySlug = envision-response)",
      resE.status === 200 && dataE.isAdmin === true && dataE.previewAgencySlug === "envision-response" && dataE.agencyId === envisionAg.id
    );

    // --- TEST F: Non-admin agency user profile hides admin agency selector ---
    const resF = await fetch(`${BASE_URL}/api/profile`, {
      headers: {
        "Authorization": `Bearer ${northstarToken}`
      }
    });
    const dataF: any = await resF.json();
    assertTest(
      "TEST F: Agency user profile has isAdmin = false (cannot access system-wide agency selector)",
      resF.status === 200 && dataF.isAdmin === false
    );

    // --- TEST G: Invalid agency slugs do not fall back to another tenant ---
    const resG = await fetch(`${BASE_URL}/api/agency/public-check/invalid-nonexistent-slug-999`);
    assertTest(
      "TEST G: Invalid agency slug returns 404 and does not fall back to another tenant",
      resG.status === 404
    );

    // --- TEST H: Client portal tokens remain scoped to exactly one client ---
    let portalUrlToTest: string | null = null;
    const resH = await fetch(`${BASE_URL}/api/clients/c_2bbe8vr8f/portal-access`, {
      headers: {
        "Authorization": `Bearer ${adminToken}`,
        "X-Admin-Preview-Agency-Slug": "envision-response"
      }
    });
    const dataH: any = await resH.json();
    if (dataH.portalUrl) {
      portalUrlToTest = dataH.portalUrl;
    } else {
      // Enable portal access to retrieve active portal token
      const toggleRes = await fetch(`${BASE_URL}/api/clients/c_2bbe8vr8f/portal-access/toggle`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${adminToken}`,
          "Content-Type": "application/json",
          "X-Admin-Preview-Agency-Slug": "envision-response"
        },
        body: JSON.stringify({ enabled: true })
      });
      const toggleData: any = await toggleRes.json();
      if (toggleData.portalUrl) {
        portalUrlToTest = toggleData.portalUrl;
      }
    }

    let portalValid = false;
    if (portalUrlToTest) {
      const tokenMatch = portalUrlToTest.match(/\/portal\/([^/]+)/);
      if (tokenMatch && tokenMatch[1]) {
        const valRes = await fetch(`${BASE_URL}/api/portal/validate/${tokenMatch[1]}`);
        const valData: any = await valRes.json();
        if (valRes.status === 200 && valData.valid && valData.client?.id === "c_2bbe8vr8f" && valData.agency?.id === envisionAg.id) {
          portalValid = true;
        }
      }
    }

    assertTest(
      "TEST H: Client portal access remains scoped strictly to Premera BlueCross client",
      resH.status === 200 && portalValid
    );

    // --- TEST I: Direct navigation with X-Agency-Slug header cannot bypass auth for private agency ---
    const resI = await fetch(`${BASE_URL}/api/clients`, {
      headers: {
        "X-Agency-Slug": "envision-response"
      }
    });
    assertTest(
      "TEST I: Direct access with X-Agency-Slug to private production agency (is_demo = false) rejected with 401 Unauthorized",
      resI.status === 401
    );

  } catch (err: any) {
    console.error("❌ Exception during Envision security test run:", err.message);
    failCount++;
  } finally {
    server.close();
    console.log("==================================================");
    console.log(`TEST SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
    console.log("==================================================");

    if (failCount > 0) {
      process.exit(1);
    }
  }
}

runEnvisionSecuritySuite();
