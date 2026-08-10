import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "https://wrbgbkmwusbeankitwex.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

// Client with service role key to bypass RLS policies during seeding
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

// Seedable Linear Congruential Generator (LCG)
class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  next() {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }
  range(min: number, max: number) {
    return min + this.next() * (max - min);
  }
}

async function main() {
  console.log("=== LUMEN UPGRADED DETERMINISTIC DEMO SEEDING ===");
  const rand = new SeededRandom(42);

  try {
    // 1. Database Cleanup for Demo Agency
    const demoSlug = "northstar-digital";
    console.log(`\n[1/6] Cleaning up any existing data for demo agency: ${demoSlug}...`);

    const { data: existingAgency } = await supabase
      .from("agencies")
      .select("id")
      .eq("slug", demoSlug)
      .single();

    if (existingAgency) {
      const demoId = existingAgency.id;
      console.log(`Found existing demo agency ID: ${demoId}. Clearing associated records...`);

      // Order of deletions to avoid FK violations (since REST does not cascade in REST API deletes)
      const { error: delMetrics } = await supabase.from("campaign_metrics").delete().eq("agency_id", demoId);
      if (delMetrics) throw delMetrics;

      const { error: delSummaries } = await supabase.from("ai_summaries").delete().eq("agency_id", demoId);
      if (delSummaries) throw delSummaries;

      const { error: delPublicDashboards } = await supabase.from("public_dashboards").delete().eq("agency_id", demoId);
      if (delPublicDashboards) throw delPublicDashboards;

      const { error: delLogs } = await supabase.from("audit_logs").delete().eq("agency_id", demoId);
      if (delLogs) throw delLogs;

      const { error: delClients } = await supabase.from("clients").delete().eq("agency_id", demoId);
      if (delClients) throw delClients;

      // Delete Profile associated with any demo auth user
      const { data: { users } } = await supabase.auth.admin.listUsers();
      const demoEmail = "agency@northstar-digital.com";
      const demoAuthUser = (users as any[]).find(u => u.email === demoEmail);
      if (demoAuthUser) {
        console.log(`Deleting demo auth user profile and credentials for ${demoEmail}...`);
        await supabase.from("profiles").delete().eq("id", demoAuthUser.id);
        await supabase.auth.admin.deleteUser(demoAuthUser.id);
      }

      // Finally, delete the agency itself
      const { error: delAg } = await supabase.from("agencies").delete().eq("id", demoId);
      if (delAg) throw delAg;

      console.log("Cleanup completed successfully.");
    }

    // 2. Create the Demo Agency Row
    console.log("\n[2/6] Creating Demo Agency: Northstar Digital...");
    const { data: agency, error: agencyErr } = await supabase
      .from("agencies")
      .insert({
        name: "Northstar Digital",
        slug: demoSlug,
        contact_email: "contact@northstar-digital.com",
        plan_tier: "Enterprise",
        logo_url: "NORTHSTAR",
        primary_color: "#1A3A5C",
        accent_color: "#E05C2A",
        client_limit: 10,
        is_demo: true
      })
      .select()
      .single();
    if (agencyErr) throw agencyErr;
    console.log(`Demo Agency created with ID: ${agency.id}`);

    // Create the Demo User
    console.log("Creating Demo User: agency@northstar-digital.com...");
    const { data: { user }, error: userErr } = await supabase.auth.admin.createUser({
      email: "agency@northstar-digital.com",
      password: "NorthstarPass123!",
      email_confirm: true
    });
    if (userErr) throw userErr;
    if (!user) throw new Error("Failed to create auth user");

    // Link profile
    const { error: profileErr } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        agency_id: agency.id,
        is_admin: false,
        email: "agency@northstar-digital.com"
      });
    if (profileErr) throw profileErr;

    // 3. Create the 5 Clients
    console.log("\n[3/6] Seeding 5 clients...");
    const clientsData = [
      { id: "c_apex_roof", name: "Apex Roofing", domain: "apexroofing.com", platform: "All Platforms", monthly_budget: 8500, status: "Active", agency_id: agency.id, brand_color: "#1A3A5C", industry: "Home Services (Roofing)", primary_goal: "Leads", target_cpl: 65 },
      { id: "c_verde_dental", name: "Verde Dental", domain: "verdedental.com", platform: "All Platforms", monthly_budget: 6000, status: "Active", agency_id: agency.id, brand_color: "#2E7D5E", industry: "Dental / Healthcare", primary_goal: "Appointment Leads", target_cpl: 45 },
      { id: "c_summit_fit", name: "Summit Fitness", domain: "summitfitness.com", platform: "Meta Ads", monthly_budget: 4000, status: "Active", agency_id: agency.id, brand_color: "#E05C2A", industry: "Fitness / Wellness", primary_goal: "Membership Leads", target_cpl: 30 },
      { id: "c_westline_auto", name: "Westline Auto", domain: "westlineauto.com", platform: "Google Ads", monthly_budget: 7000, status: "Active", agency_id: agency.id, brand_color: "#333333", industry: "Automotive", primary_goal: "Leads", target_cpl: 55 },
      { id: "c_canyon_home", name: "Canyon Home Services", domain: "canyonhomeservices.com", platform: "All Platforms", monthly_budget: 5500, status: "Active", agency_id: agency.id, brand_color: "#8B1A1A", industry: "Home Services (HVAC / Plumbing)", primary_goal: "Leads", target_cpl: 70 }
    ];

    const seededClients: any[] = [];
    for (const c of clientsData) {
      const { data: dbClient, error: clErr } = await supabase
        .from("clients")
        .insert({
          id: c.id,
          name: c.name,
          domain: c.domain,
          platform: c.platform,
          monthly_budget: c.monthly_budget,
          status: c.status,
          agency_id: c.agency_id
        })
        .select()
        .single();
      if (clErr) throw clErr;
      seededClients.push({ ...dbClient, ...c });
    }
    console.log("Seeded 5 clients successfully.");

    // 4. Generate 90 Days of Deterministic Historical Metrics
    console.log("\n[4/6] Generating 90 days of campaign metrics...");
    const endDate = new Date();
    const dates: string[] = [];
    for (let i = 89; i >= 0; i--) {
      const d = new Date(endDate);
      d.setDate(endDate.getDate() - i);
      dates.push(d.toISOString().split("T")[0]);
    }

    const campaignMetricsBatch: any[] = [];

    // Client Campaign Configuration
    const campaignConfig: { [clientId: string]: { name: string; platform: string; baseSpend: number; baseCpl: number; baseCpc: number; baseCtr: number }[] } = {
      c_apex_roof: [
        { name: "Emergency Roofing", platform: "Google Ads", baseSpend: 80, baseCpl: 65, baseCpc: 4.5, baseCtr: 0.042 },
        { name: "Roof Replacement", platform: "Google Ads", baseSpend: 100, baseCpl: 75, baseCpc: 6.0, baseCtr: 0.031 },
        { name: "Local Roofing Services", platform: "Google Ads", baseSpend: 60, baseCpl: 55, baseCpc: 3.5, baseCtr: 0.035 },
        { name: "Brand Search", platform: "Google Ads", baseSpend: 15, baseCpl: 30, baseCpc: 1.2, baseCtr: 0.12 },
        { name: "Lead Gen Prospecting", platform: "Meta Ads", baseSpend: 20, baseCpl: 45, baseCpc: 2.2, baseCtr: 0.02 },
        { name: "Retargeting", platform: "Meta Ads", baseSpend: 8.33, baseCpl: 30, baseCpc: 1.8, baseCtr: 0.045 }
      ],
      c_verde_dental: [
        { name: "Invisalign", platform: "Google Ads", baseSpend: 50, baseCpl: 45, baseCpc: 2.8, baseCtr: 0.035 },
        { name: "Emergency Dentist", platform: "Google Ads", baseSpend: 40, baseCpl: 40, baseCpc: 3.0, baseCtr: 0.032 },
        { name: "General Dentistry", platform: "Google Ads", baseSpend: 40, baseCpl: 35, baseCpc: 2.2, baseCtr: 0.04 },
        { name: "Dental Implants", platform: "Google Ads", baseSpend: 30, baseCpl: 50, baseCpc: 5.5, baseCtr: 0.022 }, // problem campaign
        { name: "Invisalign Prospecting", platform: "Meta Ads", baseSpend: 30, baseCpl: 45, baseCpc: 2.0, baseCtr: 0.018 },
        { name: "Retargeting", platform: "Meta Ads", baseSpend: 10, baseCpl: 35, baseCpc: 1.6, baseCtr: 0.038 }
      ],
      c_summit_fit: [
        { name: "Membership Prospecting", platform: "Meta Ads", baseSpend: 60, baseCpl: 38, baseCpc: 1.8, baseCtr: 0.022 }, // scales well
        { name: "Retargeting", platform: "Meta Ads", baseSpend: 20, baseCpl: 25, baseCpc: 1.2, baseCtr: 0.048 },
        { name: "Lookalike — Past Members", platform: "Meta Ads", baseSpend: 33.33, baseCpl: 32, baseCpc: 1.6, baseCtr: 0.03 },
        { name: "Engagement Warm Audience", platform: "Meta Ads", baseSpend: 20, baseCpl: 20, baseCpc: 0.8, baseCtr: 0.052 }
      ],
      c_westline_auto: [
        { name: "New Vehicle Leads", platform: "Google Ads", baseSpend: 100, baseCpl: 55, baseCpc: 3.2, baseCtr: 0.038 },
        { name: "Used Vehicle Leads", platform: "Google Ads", baseSpend: 80, baseCpl: 50, baseCpc: 2.8, baseCtr: 0.04 },
        { name: "Brand Search", platform: "Google Ads", baseSpend: 33.33, baseCpl: 30, baseCpc: 1.1, baseCtr: 0.14 },
        { name: "Competitor Conquest", platform: "Google Ads", baseSpend: 20, baseCpl: 75, baseCpc: 4.8, baseCtr: 0.02 }
      ],
      c_canyon_home: [
        { name: "HVAC Emergency", platform: "Google Ads", baseSpend: 60, baseCpl: 65, baseCpc: 4.0, baseCtr: 0.035 },
        { name: "AC Installation", platform: "Google Ads", baseSpend: 50, baseCpl: 70, baseCpc: 4.8, baseCtr: 0.028 },
        { name: "Plumbing Services", platform: "Google Ads", baseSpend: 40, baseCpl: 60, baseCpc: 3.2, baseCtr: 0.03 },
        { name: "Brand Search", platform: "Google Ads", baseSpend: 13.33, baseCpl: 35, baseCpc: 1.3, baseCtr: 0.09 },
        { name: "Lead Gen Prospecting", platform: "Meta Ads", baseSpend: 15, baseCpl: 60, baseCpc: 2.2, baseCtr: 0.018 },
        { name: "Retargeting", platform: "Meta Ads", baseSpend: 5, baseCpl: 45, baseCpc: 1.5, baseCtr: 0.04 }
      ]
    };

    for (const c of seededClients) {
      const config = campaignConfig[c.id];
      if (!config) continue;

      for (let day = 0; day < 90; day++) {
        const dateStr = dates[day];
        const dayOfWeek = new Date(dateStr).getDay(); // 0: Sunday, 6: Saturday
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        for (const camp of config) {
          // A. Multipliers and Stories
          let spendTrend = 1.0;
          let leadsEfficiencyTrend = 1.0;
          let weekendFactor = 1.0;

          // Weekend variations:
          // B2B-adjacent (Apex Roofing, Verde Dental, Westline Auto) have lower weekend spend
          // Leisure/Home services (Summit Fitness, Canyon Home Services) have higher/equal weekend spend
          if (isWeekend) {
            if (["c_apex_roof", "c_verde_dental", "c_westline_auto"].includes(c.id)) {
              weekendFactor = 0.65;
            } else {
              weekendFactor = 1.25;
            }
          }

          // Stories over 90 days:
          if (c.id === "c_apex_roof") {
            // Apex Roofing: spend +25%, lead volume +30% (CPL improves $72 -> $58)
            spendTrend = 1.0 + (day / 89) * 0.25;
            leadsEfficiencyTrend = 1.0 + (day / 89) * 0.55; // improves cost efficiency
          } else if (c.id === "c_verde_dental") {
            // Verde Dental: spend +40%, leads +10% (CPL deteriorates $44 -> $68)
            // Driven heavily by "Dental Implants" Google campaign
            spendTrend = 1.0 + (day / 89) * 0.40;
            if (camp.name === "Dental Implants") {
              // Dental Implants scales spend heavily, but leads crash
              spendTrend = 1.0 + (day / 89) * 2.50; // spend +250%
              leadsEfficiencyTrend = 1.0 - (day / 89) * 0.70; // efficiency deteriorates by 70%
            } else {
              leadsEfficiencyTrend = 1.0 + (day / 89) * 0.15; // others improve slightly
            }
          } else if (c.id === "c_summit_fit") {
            // Summit Fitness: spend flat, leads +45% (CPL $38 -> $22)
            // Membership Prospecting improves in last 30 days
            spendTrend = 1.0;
            if (camp.name === "Membership Prospecting" && day >= 60) {
              const last30DayIdx = day - 60;
              leadsEfficiencyTrend = 1.0 + (last30DayIdx / 29) * 0.90; // big efficiency jump
            } else {
              leadsEfficiencyTrend = 1.0 + (day / 89) * 0.20;
            }
          } else if (c.id === "c_westline_auto") {
            // Westline Auto: Stable, spend within +-5% of budget, CPL stays $50-$60
            spendTrend = 0.98 + (rand.next() * 0.04);
            leadsEfficiencyTrend = 1.0;
          } else if (c.id === "c_canyon_home") {
            // Canyon Home Services: Deteriorating, spend +20%, leads -15% (CPL $65 -> $105)
            spendTrend = 1.0 + (day / 89) * 0.20;
            leadsEfficiencyTrend = 1.0 - (day / 89) * 0.45; // efficiency drops 45%
          }

          // B. Add Day-to-day noise (0.80x to 1.20x)
          const noiseFactor = rand.range(0.80, 1.20);

          // C. Calculate final base stats
          const spend = Math.max(0, Math.round(camp.baseSpend * spendTrend * weekendFactor * noiseFactor * 100) / 100);
          
          // Calculate CPL for today
          const currentCpl = camp.baseCpl / leadsEfficiencyTrend;
          
          // Leads (Conversions)
          const conversions = Math.round(spend / currentCpl);
          
          // Clicks (CPC average around baseCpc, with clicks >= conversions)
          const avgCpc = camp.baseCpc * rand.range(0.90, 1.10);
          const clickAdd = Math.round(spend / avgCpc);
          const clicks = conversions + clickAdd;

          // Impressions (CTR around baseCtr, with impressions >= clicks)
          const avgCtr = camp.baseCtr * rand.range(0.90, 1.10);
          const impressions = clicks + Math.round(clicks / avgCtr);

          // Conversion Value / Revenue (Deterministic and tied to conversions/spend)
          let conversion_value = 0.0;
          if (c.id === "c_summit_fit") {
            // Target ROAS ~ 2.8x to 3.8x
            const targetRoas = rand.range(2.8, 3.8);
            conversion_value = Math.round(spend * targetRoas * 100) / 100;
          } else if (c.id === "c_westline_auto") {
            // Target ROAS ~ 4.0x to 5.5x
            const targetRoas = rand.range(4.0, 5.5);
            conversion_value = Math.round(spend * targetRoas * 100) / 100;
          } else {
            // For lead gen clients, compute value as conversions multiplied by deterministic base value
            const baseValue = {
              c_apex_roof: 180.0,
              c_verde_dental: 120.0,
              c_canyon_home: 160.0
            }[c.id as string] || 150.0;
            conversion_value = conversions * baseValue;
          }

          // D. Final bounds integrity check
          if (spend < 0) throw new Error("Validation failed: spend < 0");
          if (clicks < conversions) throw new Error("Validation failed: clicks < conversions");
          if (impressions < clicks) throw new Error("Validation failed: impressions < clicks");

          campaignMetricsBatch.push({
            client_id: c.id,
            agency_id: agency.id,
            date: dateStr,
            platform: camp.platform,
            spend,
            impressions,
            clicks,
            conversions,
            campaign_name: camp.name,
            conversion_value
          });
        }
      }
    }

    console.log(`Generated batch of ${campaignMetricsBatch.length} daily metrics rows.`);
    const { error: insErr } = await supabase.from("campaign_metrics").insert(campaignMetricsBatch);
    if (insErr) throw insErr;
    console.log("Seeded campaign metrics successfully!");

    // 5. Seed Pre-Written AI Summaries per Client
    console.log("\n[5/6] Seeding AI performance summaries...");
    const aiSummaries = [
      {
        client_id: "c_apex_roof",
        agency_id: agency.id,
        date_range: "30days",
        summary_data: [
          {
            type: "scale",
            label: "SCALE",
            number: "01",
            what: "Paid acquisition campaigns for Apex Roofing show strong scalability and cost improvements.",
            why: "Total budget expanded by 22% over the last 30 days while conversions increased by 31%, reducing CPL to $59.50 — well below the target of $65.",
            action: "Recommend scaling daily budgets on Roof Replacement and Emergency Roofing by 15%."
          },
          {
            type: "opportunity",
            label: "OPPORTUNITY",
            number: "02",
            what: "High CTR on Local Roofing Services shows strong localized search query match.",
            why: "CTR reached 4.1% following negative keyword tuning and structured local snippets.",
            action: "Add dedicated landing pages for top three high-volume service zip codes."
          },
          {
            type: "watch",
            label: "WATCH",
            number: "03",
            what: "Brand Search CTR is healthy, but average CPC crept up slightly.",
            why: "Competitors are bidding on branded terms, driving impression share down 3%.",
            action: "Monitor target impression share and adjust bidding strategy to maintain absolute top position."
          }
        ]
      },
      {
        client_id: "c_verde_dental",
        agency_id: agency.id,
        date_range: "30days",
        summary_data: [
          {
            type: "alert",
            label: "ALERT",
            number: "01",
            what: "Dental Implants campaign is causing severe cost-per-lead inflation.",
            why: "Implants spend rose 40% but conversions dropped 15%, pushing CPL on this campaign to $240. Ad variations are generating traffic but high bounce rates on implants page.",
            action: "Pause implants ads immediately and test landing page form simplification."
          },
          {
            type: "scale",
            label: "SCALE",
            number: "02",
            what: "Invisalign and Emergency Dentist search campaigns continue to perform well.",
            why: "Invisalign CPL stabilized at $42.50. Emergency Dentist conversion rate rose to 12.5% on mobile.",
            action: "Shift $30/day budget from Implants to the Invisalign campaign."
          },
          {
            type: "opportunity",
            label: "OPPORTUNITY",
            number: "03",
            what: "General Dentistry Meta campaigns indicate high conversion on retargeting ads.",
            why: "Meta Retargeting ads achieved 5.4% CTR. Prospecting ad CTR remains low.",
            action: "Expand Meta Retargeting list with custom audience matching dentist site visits."
          }
        ]
      },
      {
        client_id: "c_summit_fit",
        agency_id: agency.id,
        date_range: "30days",
        summary_data: [
          {
            type: "scale",
            label: "SCALE",
            number: "01",
            what: "Summit Fitness Meta campaigns show major conversion efficiency increases.",
            why: "Creative updates and audience matching led to a 45% increase in leads, dropping overall CPL to $21.80 (target CPL was $30). ROAS is tracking at 3.4x.",
            action: "Maintain budget levels and prepare creative refresh to prevent ad fatigue."
          },
          {
            type: "opportunity",
            label: "OPPORTUNITY",
            number: "02",
            what: "Meta Prospecting Lookalike Audience (Past Members) is driving bulk signups.",
            why: "Lookalike conversions increased 50% week-over-week. CPM is stable.",
            action: "Test a 1% Lookalike slice to expand audience reach while CTR is high."
          },
          {
            type: "watch",
            label: "WATCH",
            number: "03",
            what: "Engagement Warm Audience is showing high cost-per-click.",
            why: "Ad frequency reached 4.2 in the last 7 days, indicating saturating audience fatigue.",
            action: "Inject three new customer testimonial video creatives to warm audience pools."
          }
        ]
      },
      {
        client_id: "c_westline_auto",
        agency_id: agency.id,
        date_range: "30days",
        summary_data: [
          {
            type: "scale",
            label: "SCALE",
            number: "01",
            what: "Westline Auto performance metrics are tracking steadily inside target budgets.",
            why: "Weekly spend stayed within +-2% of daily allocations. CPL is hovering between $52 and $58, aligning with Target CPL of $55. ROAS is tracking at 4.6x.",
            action: "Continue current bidding allocations. High stability indicates campaigns are fully optimized."
          },
          {
            type: "opportunity",
            label: "OPPORTUNITY",
            number: "02",
            what: "Used Vehicle Leads campaign showed strong performance spike on Thursday/Friday.",
            why: "Thursday/Friday conversions increased 18%, matching weekly purchase habits of pre-owned buyers.",
            action: "Allocate a 10% bid multiplier during the Thursday-Saturday window."
          },
          {
            type: "watch",
            label: "WATCH",
            number: "03",
            what: "Competitor Conquest campaign CPL rose to $78.",
            why: "Auction insights report indicates key local rival increased bids on competitor conquest keywords.",
            action: "Monitor search share and check match query to verify negative keyword placement."
          }
        ]
      },
      {
        client_id: "c_canyon_home",
        agency_id: agency.id,
        date_range: "30days",
        summary_data: [
          {
            type: "alert",
            label: "ALERT",
            number: "01",
            what: "Canyon Home Services metrics are deteriorating rapidly.",
            why: "Spend expanded 20% while conversions dropped 15%, causing CPL to inflate to $102 (Target CPL is $70). The plumbing campaign conversion rate fell to 1.8%.",
            action: "Recommend auditing plumbers landing page to check for broken mobile form submission."
          },
          {
            type: "watch",
            label: "WATCH",
            number: "02",
            what: "AC Installation campaign CPL increased to $98.",
            why: "Summer weather cooling led to a drop in AC emergency installations demand.",
            action: "Pivot ad copy messaging to fall system maintenance tune-ups."
          },
          {
            type: "opportunity",
            label: "OPPORTUNITY",
            number: "03",
            what: "Brand Search campaign is highly cost-effective.",
            why: "CPC remains very low at $1.15, protecting localized high-intent conversions.",
            action: "Ensure brand search bid limits do not restrict impressions share during emergency demand."
          }
        ]
      }
    ];

    for (const s of aiSummaries) {
      const { error: sumErr } = await supabase
        .from("ai_summaries")
        .insert({
          client_id: s.client_id,
          agency_id: s.agency_id,
          date_range: s.date_range,
          summary_data: s.summary_data
        });
      if (sumErr) throw sumErr;
    }
    console.log("Seeded AI summaries successfully.");

    // Create demo public dashboard config
    console.log("Creating default enabled public dashboard configuration...");
    const demoToken = "lumen_dash_northstar_demo_token_secret_42";
    const tokenHash = crypto.createHash("sha256").update(demoToken).update("salt_value_lumen_2026").digest("hex");
    const { error: dashErr } = await supabase
      .from("public_dashboards")
      .insert({
        agency_id: agency.id,
        token_hash: tokenHash,
        enabled: true
      });
    if (dashErr) throw dashErr;

    // Publish all 5 clients
    console.log("Publishing all 5 clients to the public dashboard...");
    for (const c of seededClients) {
      await supabase
        .from("clients")
        .update({ public_dashboard_enabled: true })
        .eq("id", c.id);
    }

    // 6. Integrity and Self-Validation Checks
    console.log("\n[6/6] Running validation assertions on seeded data...");

    // Fetch the inserted campaign metrics
    const { data: dbMetrics, error: fetchErr } = await supabase
      .from("campaign_metrics")
      .select("*")
      .eq("agency_id", agency.id);

    if (fetchErr || !dbMetrics || dbMetrics.length === 0) {
      throw new Error("Validation failed: No campaign metrics retrieved from DB after insert!");
    }

    let validationErrors = 0;
    for (const m of dbMetrics) {
      // Rule checks:
      if (m.spend < 0) {
        console.error(`- Spend constraint violation: row ID ${m.id} has spend < 0`);
        validationErrors++;
      }
      if (m.clicks > m.impressions) {
        console.error(`- Clicks > Impressions violation: row ID ${m.id} (clicks: ${m.clicks}, impressions: ${m.impressions})`);
        validationErrors++;
      }
      if (m.conversions > m.clicks) {
        console.error(`- Leads > Clicks violation: row ID ${m.id} (leads: ${m.conversions}, clicks: ${m.clicks})`);
        validationErrors++;
      }
      if (m.conversions < 0) {
        console.error(`- Conversions constraint violation: row ID ${m.id} has conversions < 0`);
        validationErrors++;
      }
      if (m.agency_id !== agency.id) {
        console.error(`- Multi-tenant mismatch: row ID ${m.id} has agency_id ${m.agency_id} instead of ${agency.id}`);
        validationErrors++;
      }
    }

    // Check duplicate campaign + date rows
    const uniqueKeys = new Set<string>();
    for (const m of dbMetrics) {
      const key = `${m.client_id}-${m.date}-${m.platform}-${m.campaign_name}`;
      if (uniqueKeys.has(key)) {
        console.error(`- Unique constraint violation: duplicate record found for key: ${key}`);
        validationErrors++;
      }
      uniqueKeys.add(key);
    }

    // Confirm summaries count
    const { data: summaries } = await supabase.from("ai_summaries").select("id").eq("agency_id", agency.id);
    if (!summaries || summaries.length !== 5) {
      console.error(`- AI Summary count mismatch: found ${summaries?.length || 0} instead of 5.`);
      validationErrors++;
    }

    if (validationErrors > 0) {
      console.error(`\n❌ Seeding data validation FAILED with ${validationErrors} errors.`);
      process.exit(1);
    }

    console.log("\n=======================================================");
    console.log("🎉 NORTHSTAR DIGITAL DEMO AGENCY SEED COMPLETED SUCCESSFULLY!");
    console.log("=======================================================");
    console.log(`- Agency Created: ${agency.name} (ID: ${agency.id})`);
    console.log(`- Clients Created: 5`);
    console.log(`- Campaigns Seeded: 22`);
    console.log(`- Campaign Metric Records Inserted: ${dbMetrics.length}`);
    console.log(`- Date Range: ${dates[0]} to ${dates[89]}`);
    console.log(`- AI Summaries Cached: 5`);
    console.log(`- Demo User: agency@northstar-digital.com / NorthstarPass123!`);
    console.log(`- Public Demo Token: ${demoToken}`);
    console.log("=======================================================");

  } catch (error: any) {
    console.error("\n❌ Seeding Process Failed Critical Error:", error.message || error);
    process.exit(1);
  }
}

main();
