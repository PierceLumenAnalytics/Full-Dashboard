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

async function runAgencySlugSecurityTests() {
  console.log("==================================================");
  console.log("LUMEN ANALYTICS — AGENCY SLUG ACCESS CONTROL TEST SUITE");
  console.log("==================================================\n");

  let agencyDemo: any;
  let agencyA: any;
  let agencyB: any;
  let clientA: any;
  let clientB: any;
  let userAToken: string;
  let userBToken: string;

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
    // 1. Setup Demo Agency and Real Agencies A & B
    console.log("[Setup] Seeding demo agency and real agencies A & B...");

    // Northstar Digital (is_demo = true)
    const { data: demoAg } = await supabaseAdmin
      .from("agencies")
      .select("*")
      .eq("slug", "northstar-digital")
      .single();
    agencyDemo = demoAg;

    // Real Agency A (is_demo = false)
    const randSuffix = Math.floor(Math.random() * 10000);
    const slugA = `real-agency-a-${randSuffix}`;
    const slugB = `real-agency-b-${randSuffix}`;

    const { data: agA, error: errA } = await supabaseAdmin
      .from("agencies")
      .insert({
        name: `Real Agency A ${randSuffix}`,
        slug: slugA,
        is_demo: false
      })
      .select()
      .single();
    if (errA) throw errA;
    agencyA = agA;

    // Real Agency B (is_demo = false)
    const { data: agB, error: errB } = await supabaseAdmin
      .from("agencies")
      .insert({
        name: `Real Agency B ${randSuffix}`,
        slug: slugB,
        is_demo: false
      })
      .select()
      .single();
    if (errB) throw errB;
    agencyB = agB;

    // Client for Agency A
    const { data: clA, error: errClA } = await supabaseAdmin
      .from("clients")
      .insert({
        id: `c_real_a_${randSuffix}`,
        name: `Client A ${randSuffix}`,
        domain: `client-a-${randSuffix}.com`,
        platform: "Google Ads",
        monthly_budget: 10000,
        status: "Active",
        agency_id: agencyA.id
      })
      .select()
      .single();
    if (errClA) throw errClA;
    clientA = clA;

    // Client for Agency B
    const { data: clB, error: errClB } = await supabaseAdmin
      .from("clients")
      .insert({
        id: `c_real_b_${randSuffix}`,
        name: `Client B ${randSuffix}`,
        domain: `client-b-${randSuffix}.com`,
        platform: "Meta Ads",
        monthly_budget: 8000,
        status: "Active",
        agency_id: agencyB.id
      })
      .select()
      .single();
    if (errClB) throw errClB;
    clientB = clB;

    // Users for Agency A and Agency B
    const emailA = `user.a.${randSuffix}@agency-a.com`;
    const emailB = `user.b.${randSuffix}@agency-b.com`;
    const password = "TestPassword123!";

    const { data: uA, error: errUA } = await supabaseAdmin.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true
    });
    if (errUA) throw errUA;

    await supabaseAdmin.from("profiles").upsert({
      id: uA.user.id,
      email: emailA,
      agency_id: agencyA.id,
      is_admin: false
    });

    const { data: uB, error: errUB } = await supabaseAdmin.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true
    });
    if (errUB) throw errUB;

    await supabaseAdmin.from("profiles").upsert({
      id: uB.user.id,
      email: emailB,
      agency_id: agencyB.id,
      is_admin: false
    });

    // Authenticate sessions using a separate client instance so supabaseAdmin stays pure
    const authClient = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: sessA } = await authClient.auth.signInWithPassword({ email: emailA, password });
    userAToken = sessA.session!.access_token;

    const { data: sessB } = await authClient.auth.signInWithPassword({ email: emailB, password });
    userBToken = sessB.session!.access_token;

    console.log("✅ Setup completed successfully.\n");

    // TEST 1: Northstar Digital (is_demo = true) unauthenticated public access
    console.log("Running TEST 1: Northstar Digital (is_demo = true) public demo access");
    const res1 = await fetch(`${BASE_URL}/api/clients`, {
      headers: { "X-Agency-Slug": "northstar-digital" }
    });
    assertTest("TEST 1: Public demo access allowed for is_demo = true agency", res1.status === 200);

    // TEST 2: Real Agency A (is_demo = false) X-Agency-Slug without Bearer token
    console.log("Running TEST 2: Real Agency A (is_demo = false) X-Agency-Slug attempt without Bearer token");
    const res2 = await fetch(`${BASE_URL}/api/clients`, {
      headers: { "X-Agency-Slug": agencyA.slug }
    });
    assertTest("TEST 2: X-Agency-Slug rejected for non-demo agency", res2.status === 401);

    // TEST 3: Real Agency A unauthenticated API request without slug or token
    console.log("Running TEST 3: Real Agency A unauthenticated API request");
    const res3 = await fetch(`${BASE_URL}/api/clients`);
    assertTest("TEST 3: Unauthenticated API request rejected with 401", res3.status === 401);

    // TEST 4: Authenticated Agency A user accessing Agency A data
    console.log("Running TEST 4: Authenticated Agency A user accessing Agency A clients");
    const res4 = await fetch(`${BASE_URL}/api/clients`, {
      headers: { "Authorization": `Bearer ${userAToken}` }
    });
    const data4: any = await res4.json();
    assertTest("TEST 4: Authenticated Agency A user succeeds and gets Agency A client", res4.status === 200 && Array.isArray(data4) && data4.some(c => c.id === clientA.id));

    // TEST 5: Authenticated Agency A user trying to access Agency B's client analytics
    console.log("Running TEST 5: Authenticated Agency A user requesting Agency B client analytics");
    const res5 = await fetch(`${BASE_URL}/api/analytics/${clientB.id}`, {
      headers: { "Authorization": `Bearer ${userAToken}` }
    });
    assertTest("TEST 5: Cross-agency access attempt rejected with 403 Forbidden", res5.status === 403);

    // TEST 6: Report delivery projection check (/api/portal/reports)
    console.log("Running TEST 6: /api/portal/reports safe projection check");
    const { error: upErr } = await supabaseAdmin.from("client_portal_access").update({
      enabled: true
    }).eq("client_id", "c_apex_roof");
    if (upErr) console.error("TEST 6 update error:", upErr.message);
    const { getOrCreatePortalToken } = await import("../services/clientReport.js");
    const rawApexToken = await getOrCreatePortalToken("c_apex_roof", agencyDemo.id, supabaseAdmin);

    const res6 = await fetch(`${BASE_URL}/api/portal/reports`, {
      headers: { "X-Portal-Token": rawApexToken || "" }
    });
    const data6: any = await res6.json();
    let hasRecipientEmail = false;
    let hasCcEmails = false;
    let hasErrorMessage = false;

    if (Array.isArray(data6)) {
      for (const item of data6) {
        if ("recipient_email" in item || "recipientEmail" in item) hasRecipientEmail = true;
        if ("cc_emails" in item || "ccEmail" in item) hasCcEmails = true;
        if ("error_message" in item || "errorMessage" in item) hasErrorMessage = true;
      }
    }

    assertTest("TEST 6: /api/portal/reports projects only safe fields and hides recipient_email", res6.status === 200 && Array.isArray(data6) && !hasRecipientEmail && !hasCcEmails && !hasErrorMessage);

    // Clean up test records
    console.log("\n[Cleanup] Cleaning up seeded test records...");
    await supabaseAdmin.from("client_report_deliveries").delete().eq("client_id", clientA.id);
    await supabaseAdmin.from("client_portal_access").delete().eq("client_id", clientA.id);
    await supabaseAdmin.from("clients").delete().eq("id", clientA.id);
    await supabaseAdmin.from("clients").delete().eq("id", clientB.id);
    await supabaseAdmin.from("profiles").delete().eq("id", uA.user.id);
    await supabaseAdmin.from("profiles").delete().eq("id", uB.user.id);
    await supabaseAdmin.auth.admin.deleteUser(uA.user.id);
    await supabaseAdmin.auth.admin.deleteUser(uB.user.id);
    await supabaseAdmin.from("agencies").delete().eq("id", agencyA.id);
    await supabaseAdmin.from("agencies").delete().eq("id", agencyB.id);

    console.log("\n==================================================");
    console.log(`TEST SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
    console.log("==================================================");

    if (failCount > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error("❌ Exception during agency slug security test run:", err.message);
    process.exit(1);
  }
}

runAgencySlugSecurityTests();
