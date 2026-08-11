import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "https://wrbgbkmwusbeankitwex.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "[REDACTED]";

if (!supabaseServiceKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY in env.");
  process.exit(1);
}

// Admin client to seed and clean up test data
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false }
});

const PORT = 3050;
const BASE_URL = `http://localhost:${PORT}`;

async function runTests() {
  console.log("=== LUMEN SECURITY HARDENING VERIFICATION SUITE ===");

  let agencyA: any, agencyB: any;
  let clientA: any, clientB: any;
  let userA: any, userB: any;
  let tokenA: string, tokenB: string;

  try {
    // 1. Seed Test Data using Admin Client
    console.log("\n[1/7] Seeding test agencies, clients, and users...");

    // Create unique identifiers
    const suffix = Math.floor(Math.random() * 10000);
    const emailA = `tenant.a.${suffix}@lumen.co`;
    const emailB = `tenant.b.${suffix}@lumen.co`;
    const password = "TestPassword123!";

    // Create Agency A
    const { data: agA, error: errAgA } = await supabaseAdmin
      .from("agencies")
      .insert({ name: `Test Agency A ${suffix}`, slug: `test-agency-a-${suffix}` })
      .select()
      .single();
    if (errAgA) throw errAgA;
    agencyA = agA;

    // Create Agency B
    const { data: agB, error: errAgB } = await supabaseAdmin
      .from("agencies")
      .insert({ name: `Test Agency B ${suffix}`, slug: `test-agency-b-${suffix}` })
      .select()
      .single();
    if (errAgB) throw errAgB;
    agencyB = agB;

    // Create Auth User A
    const { data: uA, error: errUA } = await supabaseAdmin.auth.admin.createUser({
      email: emailA,
      password: password,
      email_confirm: true
    });
    if (errUA) throw errUA;
    userA = uA.user;

    // Link User A to Agency A in profile
    const { error: errPrA } = await supabaseAdmin
      .from("profiles")
      .insert({ id: userA.id, agency_id: agencyA.id, is_admin: false });
    if (errPrA) throw errPrA;

    // Create Auth User B
    const { data: uB, error: errUB } = await supabaseAdmin.auth.admin.createUser({
      email: emailB,
      password: password,
      email_confirm: true
    });
    if (errUB) throw errUB;
    userB = uB.user;

    // Link User B to Agency B in profile
    const { error: errPrB } = await supabaseAdmin
      .from("profiles")
      .insert({ id: userB.id, agency_id: agencyB.id, is_admin: false });
    if (errPrB) throw errPrB;

    // Create Client A under Agency A
    const { data: clA, error: errClA } = await supabaseAdmin
      .from("clients")
      .insert({
        id: `c_test_a_${suffix}`,
        name: `Client A ${suffix}`,
        domain: "clienta.com",
        platform: "Meta Ads",
        monthly_budget: 1000,
        status: "Active",
        agency_id: agencyA.id
      })
      .select()
      .single();
    if (errClA) throw errClA;
    clientA = clA;

    // Create Client B under Agency B
    const { data: clB, error: errClB } = await supabaseAdmin
      .from("clients")
      .insert({
        id: `c_test_b_${suffix}`,
        name: `Client B ${suffix}`,
        domain: "clientb.com",
        platform: "Google Ads",
        monthly_budget: 2000,
        status: "Active",
        agency_id: agencyB.id
      })
      .select()
      .single();
    if (errClB) throw errClB;
    clientB = clB;

    console.log(`Seeded Agency A (${agencyA.id}) with Client A (${clientA.id})`);
    console.log(`Seeded Agency B (${agencyB.id}) with Client B (${clientB.id})`);

    // 2. Sign In to acquire user session access tokens
    console.log("\n[2/7] Authenticating test sessions...");
    const { data: sessionA, error: errSessA } = await supabaseClient.auth.signInWithPassword({
      email: emailA,
      password: password
    });
    if (errSessA) throw errSessA;
    tokenA = sessionA.session?.access_token || "";

    const { data: sessionB, error: errSessB } = await supabaseClient.auth.signInWithPassword({
      email: emailB,
      password: password
    });
    if (errSessB) throw errSessB;
    tokenB = sessionB.session?.access_token || "";

    console.log("Acquired tokens for User A and User B successfully.");

    // 3. Test Private Endpoint Multi-Tenant Isolation
    console.log("\n[3/7] Testing private route authentication & tenant isolation...");

    // Test A: Access without token
    const resNoToken = await fetch(`${BASE_URL}/api/profile`);
    console.log(`- GET /api/profile (No Token): ${resNoToken.status} (Expected: 401)`);
    if (resNoToken.status !== 401) throw new Error("Security breach: Protected route allowed unauthenticated access!");

    // Test B: Access Client A as User A
    const resAtoA = await fetch(`${BASE_URL}/api/clients`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const clientsA = await resAtoA.json() as any[];
    console.log(`- GET /api/clients (User A): Status ${resAtoA.status}, count: ${clientsA.length}`);
    if (resAtoA.status !== 200 || !clientsA.some(c => c.id === clientA.id)) {
      throw new Error("Failure: User A could not read Client A.");
    }
    // Verify User A does NOT see Client B
    if (clientsA.some(c => c.id === clientB.id)) {
      throw new Error("Security breach: User A can view Client B in client list!");
    }

    // Test C: Access Client B details as User A
    const resAtoB = await fetch(`${BASE_URL}/api/analytics/${clientB.id}`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    console.log(`- GET /api/analytics/${clientB.id} (User A): Status ${resAtoB.status} (Expected: 403)`);
    if (resAtoB.status !== 403) {
      throw new Error("Security breach: User A was allowed access to Client B's analytics!");
    }

    // 4. Test Public Dashboard Tokens & Branding
    console.log("\n[4/7] Testing secure hash-based public dashboard endpoints...");

    // Test A: Get Config initially (no token created)
    const resConfigInit = await fetch(`${BASE_URL}/api/agency/dashboard-config`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const configInit = await resConfigInit.json() as any;
    console.log(`- GET /api/agency/dashboard-config (Initial): hasToken = ${configInit.hasToken}`);
    if (configInit.hasToken !== false) throw new Error("Expected initial token status to be false");

    // Test B: Generate/Rotate token for Agency A
    const resRotate = await fetch(`${BASE_URL}/api/agency/dashboard-config/rotate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const rotateData = await resRotate.json() as any;
    console.log(`- POST /api/agency/dashboard-config/rotate: Status ${resRotate.status}, token starts with: ${rotateData.token?.substring(0, 15)}`);
    if (resRotate.status !== 200 || !rotateData.token) throw new Error("Failed to rotate public token");
    const publicTokenA = rotateData.token;

    // Test C: Try accessing public dashboard with publicTokenA (client is not published yet)
    const resPublicDash = await fetch(`${BASE_URL}/api/public/dashboard/${publicTokenA}`);
    const publicDash = await resPublicDash.json() as any;
    console.log(`- GET /api/public/dashboard/:token (Initial): Status ${resPublicDash.status}, clients count: ${publicDash.clients?.length}`);
    if (resPublicDash.status !== 200) throw new Error("Public dashboard token was not recognized!");
    if (publicDash.clients.length !== 0) throw new Error("Security breach: Unpublished client shown on public dashboard!");

    // Test D: Publish Client A to public dashboard
    const resPublish = await fetch(`${BASE_URL}/api/clients/${clientA.id}/public-dashboard`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${tokenA}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ enabled: true })
    });
    console.log(`- PUT /api/clients/${clientA.id}/public-dashboard (Publish Client A): Status ${resPublish.status}`);
    if (resPublish.status !== 200) throw new Error("Failed to publish client to public dashboard");

    // Test E: Fetch public dashboard again, client A must be included
    const resPublicDash2 = await fetch(`${BASE_URL}/api/public/dashboard/${publicTokenA}`);
    const publicDash2 = await resPublicDash2.json() as any;
    console.log(`- GET /api/public/dashboard/:token (After Publish): Status ${resPublicDash2.status}, clients count: ${publicDash2.clients?.length}`);
    if (publicDash2.clients.length !== 1 || publicDash2.clients[0].id !== clientA.id) {
      throw new Error("Failure: Published client A not found in public list");
    }

    // 5. Test Mock Data Protection
    console.log("\n[5/7] Testing mock data protection constraints...");
    // Test A: Get public analytics for client A (Client A is real and has no database metrics)
    const resPublicMetrics = await fetch(`${BASE_URL}/api/public/analytics/${clientA.id}?token=${publicTokenA}`);
    const publicMetrics = await resPublicMetrics.json() as any;
    console.log(`- GET /api/public/analytics/${clientA.id}: Status ${resPublicMetrics.status}, status indicator: ${publicMetrics.status}, metrics count: ${publicMetrics.metrics?.length}`);
    if (publicMetrics.status !== "NO_DATA" || publicMetrics.metrics.length !== 0) {
      throw new Error("Security breach: Real client dashboard generated mock/synthetic metrics instead of returning NO_DATA!");
    }

    // 6. Test AI Summary Caching & Cost Protection
    console.log("\n[6/7] Testing same-day AI summary caching & cost protection...");

    // Test A: Generate summary (initial call, writes to cache)
    const summaryBody = {
      clientId: clientA.id,
      clientName: clientA.name,
      tone: "Executive",
      metricsSummary: {
        totalSpend: 1500,
        totalConversions: 45,
        avgConvRate: 3.0,
        totalClicks: 1500,
        avgCtr: 1.0,
        costPerConversion: 33.3
      }
    };

    console.log("Sending first summary generation request (initial cache setup)...");
    const resSum1 = await fetch(`${BASE_URL}/api/summary`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenA}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(summaryBody)
    });
    const sumData1 = await resSum1.json() as any;
    console.log(`- POST /api/summary (1st Call): Status ${resSum1.status}, provider: ${sumData1.provider || "Default/Mock"}`);
    if (resSum1.status !== 200) throw new Error("Failed to generate summary");

    // Test B: Call summary again, it must return from Cache
    console.log("Sending second summary request (should hit Cache)...");
    const resSum2 = await fetch(`${BASE_URL}/api/summary`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenA}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(summaryBody)
    });
    const sumData2 = await resSum2.json() as any;
    console.log(`- POST /api/summary (2nd Call): Status ${resSum2.status}, provider: ${sumData2.provider}`);
    if (sumData2.provider !== "Cached") {
      throw new Error("AI Cost Protection failure: Repeated daily summary did not hit the database cache!");
    }

    // Test C: Access AI Summary via Public endpoint (must read pre-generated cached copy)
    const resPubSum = await fetch(`${BASE_URL}/api/public/summary/${clientA.id}?token=${publicTokenA}`);
    const pubSum = await resPubSum.json() as any;
    console.log(`- GET /api/public/summary/${clientA.id}: Status ${resPubSum.status}, provider: ${pubSum.provider}, insights count: ${pubSum.insights?.length}`);
    if (resPubSum.status !== 200 || pubSum.provider !== "Cached" || pubSum.insights.length === 0) {
      throw new Error("Failure: Public summary endpoint did not return cached pre-generated insights.");
    }

    // 7. Test Token Rotation
    console.log("\n[7/7] Testing public token rotation and immediate revocation...");
    const resRotate2 = await fetch(`${BASE_URL}/api/agency/dashboard-config/rotate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const rotateData2 = await resRotate2.json() as any;
    const publicTokenA2 = rotateData2.token;
    console.log(`- Rotated token. Old token: ${publicTokenA.substring(0, 12)}... New token: ${publicTokenA2.substring(0, 12)}...`);

    // Fetch public dashboard with old token (must fail now!)
    const resOldTokenTest = await fetch(`${BASE_URL}/api/public/dashboard/${publicTokenA}`);
    console.log(`- GET /api/public/dashboard/ (Old Token): Status ${resOldTokenTest.status} (Expected: 401)`);
    if (resOldTokenTest.status !== 401) {
      throw new Error("Security breach: Rotated/revoked token was still accepted by the public dashboard!");
    }

    // Fetch public dashboard with new token (must succeed!)
    const resNewTokenTest = await fetch(`${BASE_URL}/api/public/dashboard/${publicTokenA2}`);
    console.log(`- GET /api/public/dashboard/ (New Token): Status ${resNewTokenTest.status} (Expected: 200)`);
    if (resNewTokenTest.status !== 200) {
      throw new Error("Failure: New public dashboard token failed to authenticate.");
    }

    console.log("\nALL VERIFICATION TESTS COMPLETED SUCCESSFULLY! SECURITY POLICIES STAND SECURE.");

  } catch (error: any) {
    console.error("\nTEST SUITE CRITICAL FAILURE:", error.message);
    process.exit(1);
  } finally {
    // 8. Clean up seeded data from database
    console.log("\nCleaning up seeded database records...");
    try {
      if (clientA) await supabaseAdmin.from("clients").delete().eq("id", clientA.id);
      if (clientB) await supabaseAdmin.from("clients").delete().eq("id", clientB.id);
      if (userA) await supabaseAdmin.auth.admin.deleteUser(userA.id);
      if (userB) await supabaseAdmin.auth.admin.deleteUser(userB.id);
      if (agencyA) await supabaseAdmin.from("agencies").delete().eq("id", agencyA.id);
      if (agencyB) await supabaseAdmin.from("agencies").delete().eq("id", agencyB.id);
      console.log("Cleanup finished.");
    } catch (err: any) {
      console.error("Cleanup failed:", err.message);
    }
  }
}

runTests();
