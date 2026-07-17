import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Error: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY are not defined in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function main() {
  try {
    console.log("Starting multi-tenant database seeding...");

    // 1. Create or get Demo Agency
    console.log("Checking for Demo Agency...");
    let { data: agencies, error: agencyError } = await supabase
      .from("agencies")
      .select("*")
      .eq("name", "Demo Agency")
      .limit(1);

    if (agencyError) throw agencyError;

    let demoAgency = agencies?.[0];
    if (!demoAgency) {
      console.log("Creating Demo Agency...");
      const { data: newAgency, error: createAgencyError } = await supabase
        .from("agencies")
        .insert({
          name: "Demo Agency",
          contact_email: "contact@demoagency.com",
          plan_tier: "Enterprise"
        })
        .select()
        .single();
      
      if (createAgencyError) throw createAgencyError;
      demoAgency = newAgency;
    }
    console.log(`Demo Agency ID: ${demoAgency.id}`);

    // 2. Associate existing clients with Demo Agency
    console.log("Associating existing clients with Demo Agency...");
    const { data: clients, error: clientsError } = await supabase
      .from("clients")
      .select("id, name");

    if (clientsError) throw clientsError;

    if (clients && clients.length > 0) {
      for (const client of clients) {
        console.log(`Updating client ${client.name} to belong to Demo Agency...`);
        const { error: updateError } = await supabase
          .from("clients")
          .update({ agency_id: demoAgency.id })
          .eq("id", client.id);
        if (updateError) throw updateError;
      }
    }
    console.log("All clients successfully migrated to Demo Agency.");

    // Helper: Clean up and recreate a user
    const setupUser = async (email: string, password: string, isAdmin: boolean, agencyId: string | null) => {
      console.log(`Setting up user ${email}...`);
      
      // Check if user already exists in Supabase auth
      const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
      if (listError) throw listError;

      const existingUser = (users as any[]).find(u => u.email === email);
      let userId = "";

      if (existingUser) {
        console.log(`User ${email} already exists. Recreating...`);
        // Delete profile first due to foreign keys
        await supabase.from("profiles").delete().eq("id", existingUser.id);
        
        // Delete auth user
        const { error: deleteError } = await supabase.auth.admin.deleteUser(existingUser.id);
        if (deleteError) throw deleteError;
      }

      // Create new user
      const { data: { user }, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });

      if (createError) throw createError;
      if (!user) throw new Error(`Failed to create user ${email}`);
      userId = user.id;
      console.log(`Created auth user ${email} with ID ${userId}`);

      // Insert into public.profiles
      const { error: profileError } = await supabase
        .from("profiles")
        .insert({
          id: userId,
          agency_id: agencyId,
          is_admin: isAdmin,
          email
        });

      if (profileError) throw profileError;
      console.log(`Profile created successfully for ${email}.`);
    };

    // 3. Create Demo Agency login (agency@lumen.co / AgencyPass123!)
    await setupUser("agency@lumen.co", "AgencyPass123!", false, demoAgency.id);

    // 4. Create Lumen Admin login (admin@lumen.co / AdminPass123!)
    await setupUser("admin@lumen.co", "AdminPass123!", true, null);

    console.log("Database seeding completed successfully!");
  } catch (error: any) {
    console.error("Seeding failed with error:", error.message || error);
    process.exit(1);
  }
}

main();
