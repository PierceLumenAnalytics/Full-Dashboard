import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "https://wrbgbkmwusbeankitwex.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function audit() {
  console.log("==========================================");
  console.log("1. SUPABASE PROJECT AUDIT");
  console.log("==========================================");
  console.log("Supabase URL:", supabaseUrl);
  console.log("Service Role Key Present:", !!supabaseKey);

  console.log("\n==========================================");
  console.log("2. AUTH USERS AUDIT (auth.users)");
  console.log("==========================================");
  const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();
  if (usersError) {
    console.error("Error listing auth users:", usersError);
    return;
  }

  console.log(`Total Auth Users: ${users.length}`);
  users.forEach((u, i) => {
    console.log(`\nUser #${i + 1}:`);
    console.log(`  ID: ${u.id}`);
    console.log(`  Email: ${u.email}`);
    console.log(`  Confirmed At: ${u.confirmed_at || u.email_confirmed_at || "NOT CONFIRMED"}`);
    console.log(`  Last Sign In At: ${u.last_sign_in_at || "NEVER"}`);
    console.log(`  App Metadata:`, JSON.stringify(u.app_metadata));
    console.log(`  User Metadata:`, JSON.stringify(u.user_metadata));
  });

  console.log("\n==========================================");
  console.log("3. PROFILES AUDIT (public.profiles)");
  console.log("==========================================");
  const { data: profiles, error: profilesError } = await supabase.from("profiles").select("*");
  if (profilesError) {
    console.error("Error fetching profiles:", profilesError);
    return;
  }

  console.log(`Total Profiles: ${profiles.length}`);
  profiles.forEach((p, i) => {
    console.log(`\nProfile #${i + 1}:`);
    console.log(`  ID (user_id): ${p.id}`);
    console.log(`  Email: ${p.email}`);
    console.log(`  is_admin: ${p.is_admin}`);
    console.log(`  agency_id: ${p.agency_id}`);
    console.log(`  created_at: ${p.created_at}`);

    // Cross-match with Auth Users
    const matchedAuthUser = users.find(u => u.id === p.id);
    if (matchedAuthUser) {
      console.log(`  ✅ MATCHES Auth User ID (email: ${matchedAuthUser.email})`);
    } else {
      console.log(`  ❌ NO MATCHING AUTH USER FOUND for profile ID ${p.id}`);
    }
  });

  console.log("\n==========================================");
  console.log("4. LINKAGE & IS_ADMIN AUDIT");
  console.log("==========================================");
  const adminProfiles = profiles.filter(p => p.is_admin === true);
  console.log(`Profiles with is_admin = true: ${adminProfiles.length}`);
  adminProfiles.forEach(ap => {
    const authUser = users.find(u => u.id === ap.id);
    console.log(`Admin Email: ${ap.email} | Auth Match: ${!!authUser} | Auth Email: ${authUser?.email || 'N/A'}`);
  });

  console.log("\n==========================================");
  console.log("5. AGENCIES AUDIT");
  console.log("==========================================");
  const { data: agencies } = await supabase.from("agencies").select("id, name, slug, is_demo");
  console.log(`Total Agencies: ${agencies?.length || 0}`);
  agencies?.forEach(a => {
    console.log(`  Agency: ${a.name} | Slug: ${a.slug} | Demo: ${a.is_demo} | ID: ${a.id}`);
  });
}

audit();
