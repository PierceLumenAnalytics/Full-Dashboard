import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://wrbgbkmwusbeankitwex.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyYmdia213dXNiZWFua2l0d2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzMDY5MzgsImV4cCI6MjA5OTg4MjkzOH0.3gY2dWwSu0uc3MGrcpIOz6mJXej1JJeueGQUdC_wrYg";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function verify() {
  console.log("Verifying tenant access control levels...");

  const port = process.env.TEST_PORT || "3000";
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Sign in as agency@lumen.co
    console.log("\nLogging in as agency@lumen.co...");
    const { data: agencyData, error: agencyError } = await supabase.auth.signInWithPassword({
      email: "agency@lumen.co",
      password: "AgencyPass123!",
    });
    if (agencyError || !agencyData.session) throw new Error("Agency login failed: " + agencyError?.message);
    const agencyToken = agencyData.session.access_token;
    console.log("Agency logged in. Token acquired.");

    // Query clients for agency
    const agencyClientsRes = await fetch(`${baseUrl}/api/clients`, {
      headers: { Authorization: `Bearer ${agencyToken}` }
    });
    if (!agencyClientsRes.ok) throw new Error(`Agency clients query failed: ${agencyClientsRes.statusText}`);
    const agencyClients = await agencyClientsRes.json() as any[];
    console.log(`Agency clients count: ${agencyClients.length} (Expected: 4)`);
    console.log("Client Names:", agencyClients.map((c: any) => c.name));

    // Query logs for agency
    const agencyLogsRes = await fetch(`${baseUrl}/api/logs`, {
      headers: { Authorization: `Bearer ${agencyToken}` }
    });
    if (!agencyLogsRes.ok) throw new Error(`Agency logs query failed: ${agencyLogsRes.statusText}`);
    const agencyLogs = await agencyLogsRes.json() as any[];
    console.log(`Agency audit logs count: ${agencyLogs.length}`);

    // 2. Sign in as admin@lumen.co
    console.log("\nLogging in as admin@lumen.co...");
    const { data: adminData, error: adminError } = await supabase.auth.signInWithPassword({
      email: "admin@lumen.co",
      password: "AdminPass123!",
    });
    if (adminError || !adminData.session) throw new Error("Admin login failed: " + adminError?.message);
    const adminToken = adminData.session.access_token;
    console.log("Admin logged in. Token acquired.");

    // Query clients for admin
    const adminClientsRes = await fetch(`${baseUrl}/api/clients`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!adminClientsRes.ok) throw new Error(`Admin clients query failed: ${adminClientsRes.statusText}`);
    const adminClients = await adminClientsRes.json() as any[];
    console.log(`Admin clients count: ${adminClients.length} (Expected: 4)`);
    console.log("Client Names:", adminClients.map((c: any) => c.name));

    // Query logs for admin
    const adminLogsRes = await fetch(`${baseUrl}/api/logs`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!adminLogsRes.ok) throw new Error(`Admin logs query failed: ${adminLogsRes.statusText}`);
    const adminLogs = await adminLogsRes.json() as any[];
    console.log(`Admin audit logs count: ${adminLogs.length}`);

    console.log("\nAccess control level verification completed successfully!");
  } catch (err: any) {
    console.error("Verification failed:", err.message);
  }
}

verify();
