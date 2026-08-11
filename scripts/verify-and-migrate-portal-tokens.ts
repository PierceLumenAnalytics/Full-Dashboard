import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
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
  console.error("❌ Missing SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

async function runIntegrityCheckAndMigration() {
  console.log("==================================================");
  console.log("CLIENT PORTAL ACCESS — DATABASE INTEGRITY & MIGRATION CHECK");
  console.log("==================================================\n");

  const { data: records, error } = await supabaseAdmin
    .from("client_portal_access")
    .select("*");

  if (error) {
    console.error("❌ Failed to query client_portal_access:", error.message);
    process.exit(1);
  }

  const totalRecords = records.length;
  let enabledCount = 0;
  let disabledCount = 0;
  let withHashCount = 0;
  let withEncryptedCount = 0;
  let successfullyDecryptedCount = 0;
  let hashMatchCount = 0;

  for (const record of records) {
    if (record.enabled) enabledCount++; else disabledCount++;
    if (record.token_hash) withHashCount++;

    let needsRepair = false;
    let decryptedToken: string | null = null;

    if (record.encrypted_token) {
      withEncryptedCount++;
      decryptedToken = decryptPortalToken(record.encrypted_token);
      if (decryptedToken) {
        successfullyDecryptedCount++;
        const computedHash = hashPortalToken(decryptedToken);
        if (computedHash === record.token_hash) {
          hashMatchCount++;
        } else {
          console.warn(`[REPAIR REQUIRED] Record ${record.id} (client: ${record.client_id}) hash mismatch.`);
          needsRepair = true;
        }
      } else {
        console.warn(`[REPAIR REQUIRED] Record ${record.id} (client: ${record.client_id}) encrypted token decryption failed.`);
        needsRepair = true;
      }
    } else {
      console.warn(`[REPAIR REQUIRED] Record ${record.id} (client: ${record.client_id}) missing encrypted_token.`);
      needsRepair = true;
    }

    if (needsRepair) {
      console.log(`[Repairing] Generating fresh encrypted token and hash for client ${record.client_id}...`);
      const newPlain = generateRawPortalToken();
      const newHash = hashPortalToken(newPlain);
      const newEncrypted = encryptPortalToken(newPlain);
      const now = new Date().toISOString();

      const { error: updateErr } = await supabaseAdmin
        .from("client_portal_access")
        .update({
          token_hash: newHash,
          encrypted_token: newEncrypted,
          updated_at: now,
          last_rotated_at: now
        })
        .eq("id", record.id);

      if (updateErr) {
        console.error(`❌ Repair update failed for record ${record.id}:`, updateErr.message);
      } else {
        console.log(`✅ Successfully repaired record ${record.id}`);
      }
    }
  }

  // Final Verification pass
  const { data: finalRecords } = await supabaseAdmin.from("client_portal_access").select("*");
  let finalEnabledCount = 0;
  let finalDisabledCount = 0;
  let finalWithHash = 0;
  let finalWithEncrypted = 0;
  let finalDecrypted = 0;
  let finalHashMatch = 0;

  for (const rec of finalRecords || []) {
    if (rec.enabled) finalEnabledCount++; else finalDisabledCount++;
    if (rec.token_hash) finalWithHash++;
    if (rec.encrypted_token) {
      finalWithEncrypted++;
      const dec = decryptPortalToken(rec.encrypted_token);
      if (dec) {
        finalDecrypted++;
        if (hashPortalToken(dec) === rec.token_hash) {
          finalHashMatch++;
        }
      }
    }
  }

  console.log("\n--- FINAL DATABASE INTEGRITY REPORT ---");
  console.log(`Total records: ${finalRecords?.length || 0}`);
  console.log(`Enabled records: ${finalEnabledCount}`);
  console.log(`Disabled records: ${finalDisabledCount}`);
  console.log(`Records with token_hash: ${finalWithHash}`);
  console.log(`Records with encrypted_token: ${finalWithEncrypted}`);
  console.log(`Records successfully decrypted: ${finalDecrypted}`);
  console.log(`Records where hash(decrypted) === token_hash: ${finalHashMatch}`);

  if (finalWithEncrypted === finalRecords?.length && finalHashMatch === finalRecords?.length) {
    console.log("\n✅ ALL RECORDS VERIFIED 100% INTACT & SECURE!");
  } else {
    console.error("\n❌ Database integrity check failed. Inconsistencies remain!");
    process.exit(1);
  }
}

runIntegrityCheckAndMigration();
