import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "https://wrbgbkmwusbeankitwex.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log("Seeding Ignite PPC Group Agency data...");

  try {
    // 1. Create or find the agency
    console.log("Checking for Ignite PPC Group agency...");
    let agencyId = "";
    
    const { data: existingAgencies, error: agencySelectError } = await supabase
      .from("agencies")
      .select("id")
      .eq("name", "Ignite PPC Group");
    
    if (agencySelectError) throw agencySelectError;

    if (existingAgencies && existingAgencies.length > 0) {
      agencyId = existingAgencies[0].id;
      console.log(`Agency already exists with ID: ${agencyId}. Updating colors and logo...`);
      const { error: agencyUpdateError } = await supabase
        .from("agencies")
        .update({
          logo_url: "IGNITE_PPC",
          primary_color: "#ea580c", // Bold Orange
          accent_color: "#dc2626"    // Red
        })
        .eq("id", agencyId);
      if (agencyUpdateError) throw agencyUpdateError;
    } else {
      console.log("Creating Ignite PPC Group agency...");
      const { data: newAgency, error: agencyInsertError } = await supabase
        .from("agencies")
        .insert({
          name: "Ignite PPC Group",
          contact_email: "contact@igniteppc.com",
          plan_tier: "Growth",
          logo_url: "IGNITE_PPC",
          primary_color: "#ea580c",
          accent_color: "#dc2626"
        })
        .select()
        .single();
      
      if (agencyInsertError) throw agencyInsertError;
      agencyId = newAgency.id;
      console.log(`Created agency with ID: ${agencyId}`);
    }

    // 2. Create or update auth user
    console.log("\nChecking for ignitepp@lumen.co auth user...");
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;

    let authUser = (users as any[]).find(u => u.email === "ignitepp@lumen.co");
    let userId = "";

    if (authUser) {
      userId = authUser.id;
      console.log(`User already exists (ID: ${userId}). Resetting password to IgnitePass123!...`);
      const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
        password: "IgnitePass123!",
        email_confirm: true
      });
      if (updateError) throw updateError;
      console.log("Password reset succeeded!");
    } else {
      console.log("Creating new user ignitepp@lumen.co...");
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: "ignitepp@lumen.co",
        password: "IgnitePass123!",
        email_confirm: true
      });
      if (createError) throw createError;
      userId = newUser.user.id;
      console.log(`User created with ID: ${userId}`);
    }

    // 3. Create or update profile
    console.log("\nChecking for profile record...");
    const { data: profile, error: profileSelectError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId);
    
    // Ignore error if profile not found
    if (profile && profile.length > 0) {
      console.log("Profile already exists. Updating agency_id...");
      const { error: profileUpdateError } = await supabase
        .from("profiles")
        .update({ agency_id: agencyId, is_admin: false, email: "ignitepp@lumen.co" })
        .eq("id", userId);
      if (profileUpdateError) throw profileUpdateError;
    } else {
      console.log("Inserting profile record...");
      const { error: profileInsertError } = await supabase
        .from("profiles")
        .insert({
          id: userId,
          agency_id: agencyId,
          is_admin: false,
          email: "ignitepp@lumen.co"
        });
      if (profileInsertError) throw profileInsertError;
      console.log("Profile created successfully!");
    }

    // 4. Create 3 new sample clients
    console.log("\nCreating 3 new clients (c5, c6, c7)...");
    const clients = [
      { id: "c5", name: "Sizzle BBQ & Grill", domain: "sizzlebbq.com", platform: "Google Ads", monthly_budget: 5000, status: "Active", agency_id: agencyId },
      { id: "c6", name: "Zippy Couriers", domain: "zippycouriers.com", platform: "Meta Ads", monthly_budget: 8000, status: "Active", agency_id: agencyId },
      { id: "c7", name: "Nova Skincare", domain: "novaskincare.com", platform: "All Platforms", monthly_budget: 12000, status: "Active", agency_id: agencyId }
    ];

    for (const client of clients) {
      console.log(`Checking client ${client.id} (${client.name})...`);
      // Delete existing metrics for these clients to prevent FK conflicts
      await supabase.from("campaign_metrics").delete().eq("client_id", client.id);
      
      const { data: existingClient } = await supabase
        .from("clients")
        .select("id")
        .eq("id", client.id);
      
      if (existingClient && existingClient.length > 0) {
        console.log(`Client ${client.id} exists. Updating...`);
        const { error } = await supabase.from("clients").update(client).eq("id", client.id);
        if (error) throw error;
      } else {
        console.log(`Client ${client.id} does not exist. Inserting...`);
        const { error } = await supabase.from("clients").insert(client);
        if (error) throw error;
      }
    }

    // 5. Seed some sample campaign metrics
    console.log("\nSeeding campaign metrics for c5, c6, c7...");
    const mockMetrics = [
      // c5 (Google Ads, $5000 budget, spend ~ $150/day)
      { client_id: "c5", agency_id: agencyId, date: "2026-07-10", platform: "Google Ads", spend: 152.50, impressions: 6100, clicks: 183, conversions: 15 },
      { client_id: "c5", agency_id: agencyId, date: "2026-07-11", platform: "Google Ads", spend: 148.00, impressions: 5900, clicks: 177, conversions: 12 },
      { client_id: "c5", agency_id: agencyId, date: "2026-07-12", platform: "Google Ads", spend: 161.20, impressions: 6450, clicks: 194, conversions: 16 },
      { client_id: "c5", agency_id: agencyId, date: "2026-07-13", platform: "Google Ads", spend: 150.00, impressions: 6000, clicks: 180, conversions: 14 },
      { client_id: "c5", agency_id: agencyId, date: "2026-07-14", platform: "Google Ads", spend: 155.80, impressions: 6230, clicks: 187, conversions: 18 },
      // c6 (Meta Ads, $8000 budget, spend ~ $240/day)
      { client_id: "c6", agency_id: agencyId, date: "2026-07-10", platform: "Meta Ads", spend: 238.40, impressions: 11920, clicks: 358, conversions: 24 },
      { client_id: "c6", agency_id: agencyId, date: "2026-07-11", platform: "Meta Ads", spend: 245.00, impressions: 12250, clicks: 368, conversions: 28 },
      { client_id: "c6", agency_id: agencyId, date: "2026-07-12", platform: "Meta Ads", spend: 228.90, impressions: 11445, clicks: 343, conversions: 21 },
      { client_id: "c6", agency_id: agencyId, date: "2026-07-13", platform: "Meta Ads", spend: 251.30, impressions: 12565, clicks: 377, conversions: 31 },
      { client_id: "c6", agency_id: agencyId, date: "2026-07-14", platform: "Meta Ads", spend: 240.00, impressions: 12000, clicks: 360, conversions: 25 },
      // c7 (All Platforms, $12000 budget, spend ~ $360/day total split across channels)
      { client_id: "c7", agency_id: agencyId, date: "2026-07-10", platform: "Google Ads", spend: 180.00, impressions: 7200, clicks: 216, conversions: 18 },
      { client_id: "c7", agency_id: agencyId, date: "2026-07-10", platform: "Meta Ads", spend: 120.00, impressions: 6000, clicks: 180, conversions: 12 },
      { client_id: "c7", agency_id: agencyId, date: "2026-07-10", platform: "TikTok Ads", spend: 60.00, impressions: 3000, clicks: 90, conversions: 5 },
      
      { client_id: "c7", agency_id: agencyId, date: "2026-07-11", platform: "Google Ads", spend: 175.00, impressions: 7000, clicks: 210, conversions: 16 },
      { client_id: "c7", agency_id: agencyId, date: "2026-07-11", platform: "Meta Ads", spend: 125.00, impressions: 6250, clicks: 188, conversions: 15 },
      { client_id: "c7", agency_id: agencyId, date: "2026-07-11", platform: "TikTok Ads", spend: 65.00, impressions: 3250, clicks: 98, conversions: 7 },
      
      { client_id: "c7", agency_id: agencyId, date: "2026-07-12", platform: "Google Ads", spend: 190.00, impressions: 7600, clicks: 228, conversions: 21 },
      { client_id: "c7", agency_id: agencyId, date: "2026-07-12", platform: "Meta Ads", spend: 110.00, impressions: 5500, clicks: 165, conversions: 10 },
      { client_id: "c7", agency_id: agencyId, date: "2026-07-12", platform: "TikTok Ads", spend: 55.00, impressions: 2750, clicks: 83, conversions: 4 },
      
      { client_id: "c7", agency_id: agencyId, date: "2026-07-13", platform: "Google Ads", spend: 185.00, impressions: 7400, clicks: 222, conversions: 19 },
      { client_id: "c7", agency_id: agencyId, date: "2026-07-13", platform: "Meta Ads", spend: 130.00, impressions: 6500, clicks: 195, conversions: 16 },
      { client_id: "c7", agency_id: agencyId, date: "2026-07-13", platform: "TikTok Ads", spend: 62.00, impressions: 3100, clicks: 93, conversions: 6 },
      
      { client_id: "c7", agency_id: agencyId, date: "2026-07-14", platform: "Google Ads", spend: 178.00, impressions: 7120, clicks: 214, conversions: 17 },
      { client_id: "c7", agency_id: agencyId, date: "2026-07-14", platform: "Meta Ads", spend: 118.00, impressions: 5900, clicks: 177, conversions: 11 },
      { client_id: "c7", agency_id: agencyId, date: "2026-07-14", platform: "TikTok Ads", spend: 58.00, impressions: 2900, clicks: 87, conversions: 5 }
    ];

    const { error: metricsError } = await supabase.from("campaign_metrics").insert(mockMetrics);
    if (metricsError) throw metricsError;
    console.log("Campaign metrics seeded successfully!");

    console.log("\n🎉 Ignite PPC Group Agency seed completed successfully!");
    console.log("Credentials:");
    console.log("  Email: ignitepp@lumen.co");
    console.log("  Password: IgnitePass123!");

  } catch (err: any) {
    console.error("\n❌ Seeding failed:", err.message || err);
    process.exit(1);
  }
}

main();
