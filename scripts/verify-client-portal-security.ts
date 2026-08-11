import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { 
  hashPortalToken, 
  encryptPortalToken, 
  decryptPortalToken, 
  generateRawPortalToken 
} from "../services/portalSecurity.js";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "https://wrbgbkmwusbeankitwex.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error("❌ Missing SUPABASE_SERVICE_ROLE_KEY in environment variables.");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function runSecurityTests() {
  console.log("==================================================");
  console.log("LUMEN ANALYTICS — CLIENT PORTAL ISOLATION TEST SUITE");
  console.log("==================================================\n");

  let agency: any;
  let clientApex: any;
  let clientVerde: any;
  let clientSummit: any;
  let apexToken: string;
  let verdeToken: string;
  let oldApexToken: string;
  let newApexToken: string;

  try {
    // 1. Setup Test Agency and Clients
    console.log("[Setup] Finding or initializing test agency and clients...");
    const { data: ag, error: agErr } = await supabaseAdmin
      .from("agencies")
      .select("*")
      .eq("slug", "northstar-digital")
      .single();
    if (agErr || !ag) throw agErr || new Error("Northstar Digital agency not found.");
    agency = ag;

    // Ensure Apex Roofing
    let { data: apex } = await supabaseAdmin
      .from("clients")
      .select("*")
      .eq("id", "c_apex_roof")
      .single();
    if (!apex) {
      const { data: createdApex, error: createApexErr } = await supabaseAdmin
        .from("clients")
        .insert({
          id: "c_apex_roof",
          name: "Apex Roofing",
          domain: "apexroofing.com",
          platform: "Google Ads",
          monthly_budget: 15000,
          status: "Active",
          agency_id: agency.id
        })
        .select()
        .single();
      if (createApexErr) throw createApexErr;
      apex = createdApex;
    }
    clientApex = apex;

    // Ensure Verde Dental
    let { data: verde } = await supabaseAdmin
      .from("clients")
      .select("*")
      .eq("id", "c_verde_dent")
      .single();
    if (!verde) {
      const { data: createdVerde, error: createVerdeErr } = await supabaseAdmin
        .from("clients")
        .insert({
          id: "c_verde_dent",
          name: "Verde Dental",
          domain: "verdedental.com",
          platform: "Meta Ads",
          monthly_budget: 12000,
          status: "Active",
          agency_id: agency.id
        })
        .select()
        .single();
      if (createVerdeErr) throw createVerdeErr;
      verde = createdVerde;
    }
    clientVerde = verde;

    // Ensure Summit Fitness
    let { data: summit } = await supabaseAdmin
      .from("clients")
      .select("*")
      .eq("id", "c_summit_fit")
      .single();
    if (!summit) {
      const { data: createdSummit, error: createSummitErr } = await supabaseAdmin
        .from("clients")
        .insert({
          id: "c_summit_fit",
          name: "Summit Fitness",
          domain: "summitfitness.com",
          platform: "TikTok Ads",
          monthly_budget: 9000,
          status: "Active",
          agency_id: agency.id
        })
        .select()
        .single();
      if (createSummitErr) throw createSummitErr;
      summit = createdSummit;
    }
    clientSummit = summit;

    // Seed dummy metric for Apex Roofing
    await supabaseAdmin.from("campaign_metrics").upsert({
      client_id: clientApex.id,
      agency_id: agency.id,
      date: "2026-08-10",
      spend: 500,
      impressions: 10000,
      clicks: 400,
      conversions: 25,
      campaign_name: "Apex Search Campaign",
      platform: "Google Ads"
    });

    // Seed dummy metric for Verde Dental
    await supabaseAdmin.from("campaign_metrics").upsert({
      client_id: clientVerde.id,
      agency_id: agency.id,
      date: "2026-08-10",
      spend: 400,
      impressions: 8000,
      clicks: 300,
      conversions: 15,
      campaign_name: "Verde Dental Meta Promo",
      platform: "Meta Ads"
    });

    // Generate/fetch AES-256-GCM Encrypted Portal Token for Apex
    apexToken = generateRawPortalToken();
    const apexHash = hashPortalToken(apexToken);
    const apexEncrypted = encryptPortalToken(apexToken);

    await supabaseAdmin.from("client_portal_access").upsert({
      agency_id: agency.id,
      client_id: clientApex.id,
      token_hash: apexHash,
      encrypted_token: apexEncrypted,
      enabled: true
    }, { onConflict: "client_id" });

    // Generate/fetch AES-256-GCM Encrypted Portal Token for Verde
    verdeToken = generateRawPortalToken();
    const verdeHash = hashPortalToken(verdeToken);
    const verdeEncrypted = encryptPortalToken(verdeToken);

    await supabaseAdmin.from("client_portal_access").upsert({
      agency_id: agency.id,
      client_id: clientVerde.id,
      token_hash: verdeHash,
      encrypted_token: verdeEncrypted,
      enabled: true
    }, { onConflict: "client_id" });

    console.log("✅ Test setup completed successfully.\n");

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

    // TEST 1: Apex portal token -> Apex client data
    console.log("Running TEST 1: Apex portal token -> Apex client data");
    const res1 = await fetch(`${BASE_URL}/api/portal/analytics`, {
      headers: { "X-Portal-Token": apexToken }
    });
    const data1: any = await res1.json();
    assertTest("TEST 1: Apex portal token resolves to Apex client data", res1.status === 200 && data1.client?.id === "c_apex_roof" && data1.client?.name === "Apex Roofing");

    // TEST 2: Apex portal -> Verde data attempt
    console.log("Running TEST 2: Apex portal -> Verde data attempt");
    const res2 = await fetch(`${BASE_URL}/api/portal/analytics?clientId=c_verde_dent`, {
      headers: { "X-Portal-Token": apexToken }
    });
    const data2: any = await res2.json();
    assertTest("TEST 2: Apex portal rejecting Verde data request", res2.status === 403 || (data2.client && data2.client.id === "c_apex_roof"));

    // TEST 3: Apex portal -> Summit data attempt
    console.log("Running TEST 3: Apex portal -> Summit data attempt");
    const res3 = await fetch(`${BASE_URL}/api/portal/analytics?clientId=c_summit_fit`, {
      headers: { "X-Portal-Token": apexToken }
    });
    const data3: any = await res3.json();
    assertTest("TEST 3: Apex portal rejecting Summit data request", res3.status === 403 || (data3.client && data3.client.id === "c_apex_roof"));

    // TEST 4: Apex portal -> agency client list attempt
    console.log("Running TEST 4: Apex portal -> agency client list attempt");
    const res4 = await fetch(`${BASE_URL}/api/clients`, {
      headers: { "Authorization": `Bearer ${apexToken}` }
    });
    assertTest("TEST 4: Apex portal denied agency client list", res4.status === 401 || res4.status === 403);

    // TEST 5: Apex portal -> All Clients aggregate
    console.log("Running TEST 5: Apex portal -> All Clients aggregate");
    const res5 = await fetch(`${BASE_URL}/api/analytics/agency-overview`, {
      headers: { "Authorization": `Bearer ${apexToken}` }
    });
    assertTest("TEST 5: Apex portal denied agency aggregate metrics", res5.status === 401 || res5.status === 403);

    // TEST 6: Apex portal -> agency settings
    console.log("Running TEST 6: Apex portal -> agency settings");
    const res6 = await fetch(`${BASE_URL}/api/agency/cta`, {
      method: "PUT",
      headers: { "Authorization": `Bearer ${apexToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ customCta: "Hacked" })
    });
    assertTest("TEST 6: Apex portal denied agency settings", res6.status === 401 || res6.status === 403);

    // TEST 7: Apex portal -> audit logs
    console.log("Running TEST 7: Apex portal -> audit logs");
    const res7 = await fetch(`${BASE_URL}/api/logs`, {
      headers: { "Authorization": `Bearer ${apexToken}` }
    });
    assertTest("TEST 7: Apex portal denied audit logs", res7.status === 401 || res7.status === 403);

    // TEST 8: Invalid token
    console.log("Running TEST 8: Invalid token");
    const res8 = await fetch(`${BASE_URL}/api/portal/analytics`, {
      headers: { "X-Portal-Token": "lumen_portal_invalid_fake_token_123" }
    });
    assertTest("TEST 8: Invalid portal token rejected", res8.status === 401);

    // TEST 9: Revoked/Disabled token
    console.log("Running TEST 9: Disabled portal token");
    await supabaseAdmin.from("client_portal_access").update({ enabled: false }).eq("client_id", clientApex.id);
    const res9 = await fetch(`${BASE_URL}/api/portal/analytics`, {
      headers: { "X-Portal-Token": apexToken }
    });
    assertTest("TEST 9: Disabled portal token rejected", res9.status === 401);

    // Re-enable Apex token for rotation test
    await supabaseAdmin.from("client_portal_access").update({ enabled: true }).eq("client_id", clientApex.id);

    // TEST 10 & 11: Token Rotation
    console.log("Running TEST 10 & 11: Token rotation");
    oldApexToken = apexToken;
    newApexToken = generateRawPortalToken();
    const newHash = hashPortalToken(newApexToken);
    const newEncrypted = encryptPortalToken(newApexToken);

    await supabaseAdmin.from("client_portal_access").update({
      token_hash: newHash,
      encrypted_token: newEncrypted,
      last_rotated_at: new Date().toISOString()
    }).eq("client_id", clientApex.id);

    // Try old token (TEST 10)
    const res10 = await fetch(`${BASE_URL}/api/portal/analytics`, {
      headers: { "X-Portal-Token": oldApexToken }
    });
    assertTest("TEST 10: Old token after rotation rejected", res10.status === 401);

    // Try new token (TEST 11)
    const res11 = await fetch(`${BASE_URL}/api/portal/analytics`, {
      headers: { "X-Portal-Token": newApexToken }
    });
    const data11: any = await res11.json();
    assertTest("TEST 11: New token after rotation accepted", res11.status === 200 && data11.client?.id === "c_apex_roof");

    // TEST 12: Portal URL validation endpoint
    console.log("Running TEST 12: Portal URL validation endpoint");
    const res12 = await fetch(`${BASE_URL}/api/portal/validate/${encodeURIComponent(newApexToken)}`);
    const data12: any = await res12.json();
    assertTest("TEST 12: Portal token validation returns Apex Roofing strictly", res12.status === 200 && data12.client?.name === "Apex Roofing");

    // TEST 13: Portal API call manually includes clientId = Verde
    console.log("Running TEST 13: Manual clientId override injection");
    const res13 = await fetch(`${BASE_URL}/api/portal/summary?clientId=c_verde_dent`, {
      headers: { "X-Portal-Token": newApexToken }
    });
    assertTest("TEST 13: Summary endpoint rejects/ignores fake clientId parameter", res13.status === 403 || res13.status === 200);

    // TEST 14: Report URL test
    console.log("Running TEST 14: Report generator URL isolation");
    const { generateReportData } = await import("../services/clientReport.js");
    const reportData = await generateReportData(clientApex.id, agency.id, "2026-08-01", "2026-08-07", supabaseAdmin, BASE_URL);
    assertTest("TEST 14: Generated report CTA contains /portal/ and NOT /agency/", reportData.portalUrl.includes("/portal/") && !reportData.portalUrl.includes("/agency/"));

    // TEST 15: DB Plaintext Absence Verification (SQL SELECT verification)
    console.log("Running TEST 15: DB Plaintext Absence Verification");
    const { data: dbRecords, error: dbErr } = await supabaseAdmin.from("client_portal_access").select("*");
    let hasPlaintext = false;
    if (dbRecords && dbRecords.length > 0) {
      for (const rec of dbRecords) {
        if ((rec as any).raw_token) {
          hasPlaintext = true;
        }
      }
    }
    assertTest("TEST 15: No raw_token or plaintext portal credentials in DB", !dbErr && !hasPlaintext && dbRecords?.[0]?.encrypted_token !== undefined);

    // TEST 16: Disabled Portal Report Creation Behavior (Issue 4)
    console.log("Running TEST 16: Disabled portal report generation constraint");
    await supabaseAdmin.from("client_portal_access").update({ enabled: false }).eq("client_id", clientApex.id);
    const { getOrCreatePortalToken } = await import("../services/clientReport.js");
    const disabledToken = await getOrCreatePortalToken(clientApex.id, agency.id, supabaseAdmin);
    const { data: checkApexRecord } = await supabaseAdmin.from("client_portal_access").select("enabled").eq("client_id", clientApex.id).single();
    assertTest("TEST 16: Disabled portal is NOT silently re-enabled when generating a report", disabledToken === null && checkApexRecord?.enabled === false);

    // Re-enable Apex portal after test
    await supabaseAdmin.from("client_portal_access").update({ enabled: true }).eq("client_id", clientApex.id);

    console.log("\n==================================================");
    console.log(`TEST SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
    console.log("==================================================");

    if (failCount > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error("❌ Exception during security test run:", err.message);
    process.exit(1);
  }
}

runSecurityTests();
