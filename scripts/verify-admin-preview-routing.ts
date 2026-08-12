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

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function runAdminPreviewRoutingTests() {
  console.log("==================================================");
  console.log("LUMEN ANALYTICS — ADMIN PREVIEW ROUTING & BRANDING SUITE");
  console.log("==================================================\n");

  const createdAgencyIds: string[] = [];
  const createdUserIds: string[] = [];

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
    const randSuffix = Math.floor(Math.random() * 10000);
    const slugNewAgent = `new-agent-${randSuffix}`;
    const slugGreenAg = `green-agency-${randSuffix}`;

    console.log("[Setup] Creating test agencies and System Admin user...");

    // 1. Create New Agent (Purple theme, 0 clients, is_demo = false)
    const { data: ag1, error: err1 } = await supabaseAdmin
      .from("agencies")
      .insert({
        name: `New Agent ${randSuffix}`,
        slug: slugNewAgent,
        primary_color: "#8b5cf6",
        accent_color: "#ec4899",
        is_demo: false
      })
      .select()
      .single();
    if (err1) throw err1;
    createdAgencyIds.push(ag1.id);

    // 2. Create Green Agency (Green theme, 0 clients, is_demo = false)
    const { data: ag2, error: err2 } = await supabaseAdmin
      .from("agencies")
      .insert({
        name: `Green Agency ${randSuffix}`,
        slug: slugGreenAg,
        primary_color: "#10b981",
        accent_color: "#06b6d4",
        is_demo: false
      })
      .select()
      .single();
    if (err2) throw err2;
    createdAgencyIds.push(ag2.id);

    // 3. Create System Admin User
    const adminEmail = `admin.test.${randSuffix}@lumen.co`;
    const password = "TestAdminPassword123!";

    const { data: adminUserObj, error: adminErr } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password,
      email_confirm: true
    });
    if (adminErr) throw adminErr;
    createdUserIds.push(adminUserObj.user.id);

    await supabaseAdmin.from("profiles").upsert({
      id: adminUserObj.user.id,
      email: adminEmail,
      is_admin: true,
      agency_id: null
    });

    // 4. Create Normal Agency User (assigned to ag1)
    const normalEmail = `normal.user.${randSuffix}@agency.com`;
    const { data: normalUserObj, error: normalErr } = await supabaseAdmin.auth.admin.createUser({
      email: normalEmail,
      password,
      email_confirm: true
    });
    if (normalErr) throw normalErr;
    createdUserIds.push(normalUserObj.user.id);

    await supabaseAdmin.from("profiles").upsert({
      id: normalUserObj.user.id,
      email: normalEmail,
      is_admin: false,
      agency_id: ag1.id
    });

    // Authenticate sessions
    const authClient = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
    
    const { data: adminSess } = await authClient.auth.signInWithPassword({ email: adminEmail, password });
    const adminToken = adminSess.session!.access_token;

    const { data: normalSess } = await authClient.auth.signInWithPassword({ email: normalEmail, password });
    const normalToken = normalSess.session!.access_token;

    console.log("✅ Setup completed successfully.\n");

    // TEST 1: Authenticated System Admin previewing New Agent via X-Admin-Preview-Agency-Slug
    console.log("Running TEST 1: System Admin previewing New Agent (/api/profile)");
    const res1 = await fetch(`${BASE_URL}/api/profile`, {
      headers: {
        "Authorization": `Bearer ${adminToken}`,
        "X-Admin-Preview-Agency-Slug": slugNewAgent
      }
    });
    const data1: any = await res1.json();
    assertTest(
      "TEST 1: /api/profile returns New Agent branding + isAdminPreview: true",
      res1.status === 200 &&
      data1.isAdmin === true &&
      data1.isAdminPreview === true &&
      data1.agencyName === `New Agent ${randSuffix}` &&
      data1.primaryColor === "#8b5cf6" &&
      data1.accentColor === "#ec4899"
    );

    // TEST 2: Client isolation check for zero-client New Agent
    console.log("Running TEST 2: System Admin previewing New Agent clients (/api/clients)");
    const res2 = await fetch(`${BASE_URL}/api/clients`, {
      headers: {
        "Authorization": `Bearer ${adminToken}`,
        "X-Admin-Preview-Agency-Slug": slugNewAgent
      }
    });
    const data2: any = await res2.json();
    assertTest(
      "TEST 2: /api/clients returns empty array [] for zero-client New Agent (no Northstar fallback)",
      res2.status === 200 && Array.isArray(data2) && data2.length === 0
    );

    // TEST 3: Distinct branding when previewing Green Agency
    console.log("Running TEST 3: System Admin switching preview to Green Agency");
    const res3 = await fetch(`${BASE_URL}/api/profile`, {
      headers: {
        "Authorization": `Bearer ${adminToken}`,
        "X-Admin-Preview-Agency-Slug": slugGreenAg
      }
    });
    const data3: any = await res3.json();
    assertTest(
      "TEST 3: Switching preview returns Green Agency colors (#10b981)",
      res3.status === 200 && data3.agencyName === `Green Agency ${randSuffix}` && data3.primaryColor === "#10b981"
    );

    // TEST 4: Unauthenticated request to private agency (is_demo = false)
    console.log("Running TEST 4: Unauthenticated request to private agency public-check");
    const res4 = await fetch(`${BASE_URL}/api/agency/public-check/${slugNewAgent}`);
    const data4: any = await res4.json();
    assertTest(
      "TEST 4: Public check for non-demo agency returns isDemo: false",
      res4.status === 200 && data4.isDemo === false
    );

    // TEST 5: Unauthenticated request to Northstar Digital (is_demo = true)
    console.log("Running TEST 5: Unauthenticated request to Northstar Digital public-check");
    const res5 = await fetch(`${BASE_URL}/api/agency/public-check/northstar-digital`);
    const data5: any = await res5.json();
    assertTest(
      "TEST 5: Public check for northstar-digital returns isDemo: true",
      res5.status === 200 && data5.isDemo === true
    );

    // TEST 6: Normal agency user attempting to preview another agency
    console.log("Running TEST 6: Normal agency user sending X-Admin-Preview-Agency-Slug");
    const res6 = await fetch(`${BASE_URL}/api/profile`, {
      headers: {
        "Authorization": `Bearer ${normalToken}`,
        "X-Admin-Preview-Agency-Slug": slugGreenAg
      }
    });
    assertTest(
      "TEST 6: Normal user attempting cross-tenant preview is rejected with 403 Forbidden",
      res6.status === 403
    );

  } catch (err: any) {
    console.error("❌ Exception during routing test run:", err.message);
    failCount++;
  } finally {
    console.log("\n[Cleanup] Cleaning up seeded test records...");
    if (createdUserIds.length > 0) {
      await supabaseAdmin.from("profiles").delete().in("id", createdUserIds);
      for (const uid of createdUserIds) {
        await supabaseAdmin.auth.admin.deleteUser(uid).catch(() => {});
      }
    }
    if (createdAgencyIds.length > 0) {
      await supabaseAdmin.from("agencies").delete().in("id", createdAgencyIds);
    }

    console.log("==================================================");
    console.log(`TEST SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
    console.log("==================================================");

    if (failCount > 0) {
      process.exit(1);
    }
  }
}

runAdminPreviewRoutingTests();
