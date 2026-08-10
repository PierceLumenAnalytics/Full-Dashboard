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
  console.log("Resetting passwords for admin@lumen.co and agency@lumen.co...");

  try {
    // List users
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;

    const agencyUser = (users as any[]).find(u => u.email === "agency@lumen.co");
    const adminUser = (users as any[]).find(u => u.email === "admin@lumen.co");

    if (!agencyUser) {
      console.error("agency@lumen.co user not found");
    } else {
      console.log(`Resetting agency@lumen.co password (ID: ${agencyUser.id})...`);
      const { error } = await supabase.auth.admin.updateUserById(agencyUser.id, {
        password: "[REDACTED]"
      });
      if (error) throw error;
      console.log("agency@lumen.co password reset succeeded!");
    }

    if (!adminUser) {
      console.error("admin@lumen.co user not found");
    } else {
      console.log(`Resetting admin@lumen.co password (ID: ${adminUser.id})...`);
      const { error } = await supabase.auth.admin.updateUserById(adminUser.id, {
        password: "[REDACTED]"
      });
      if (error) throw error;
      console.log("admin@lumen.co password reset succeeded!");
    }

    // Now verify the sign-in with anon client to be 100% sure!
    console.log("\nVerifying passwords by performing test sign-ins...");
    const anonClient = createClient(
      supabaseUrl,
      "[REDACTED]"
    );

    console.log("Testing agency@lumen.co sign-in...");
    const { error: agencySignInError } = await anonClient.auth.signInWithPassword({
      email: "agency@lumen.co",
      password: "[REDACTED]"
    });
    if (agencySignInError) {
      console.error("❌ agency@lumen.co sign-in failed:", agencySignInError.message);
    } else {
      console.log("✅ agency@lumen.co sign-in succeeded!");
    }

    console.log("Testing admin@lumen.co sign-in...");
    const { error: adminSignInError } = await anonClient.auth.signInWithPassword({
      email: "admin@lumen.co",
      password: "[REDACTED]"
    });
    if (adminSignInError) {
      console.error("❌ admin@lumen.co sign-in failed:", adminSignInError.message);
    } else {
      console.log("✅ admin@lumen.co sign-in succeeded!");
    }

  } catch (err: any) {
    console.error("Reset failed:", err.message || err);
  }
}

main();
