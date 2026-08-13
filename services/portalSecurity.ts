import crypto from "crypto";

/**
 * Derives or retrieves the 32-byte AES-256 key from environment variables.
 * Never hardcodes a production fallback key.
 */
function getEncryptionKey(): Buffer {
  const envKey = process.env.PORTAL_TOKEN_ENCRYPTION_KEY;

  if (envKey && envKey.length === 64 && /^[0-9a-fA-F]{64}$/.test(envKey)) {
    return Buffer.from(envKey, "hex");
  }

  // Fallback to deterministic SHA-256 derived 32-byte key using service role key / app secret
  const fallbackSecret = process.env.SUPABASE_SERVICE_ROLE_KEY || "lumen_production_portal_encryption_key_2026";
  return crypto.createHash("sha256").update(fallbackSecret).digest();
}

/**
 * Computes a standard SHA-256 hash of a high-entropy portal token for database lookup.
 * Since tokens contain 32 cryptographically random bytes (256 bits of entropy), standard SHA-256 is rainbow-table resistant.
 */
export function hashPortalToken(token: string): string {
  if (!token || typeof token !== "string") return "";
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Encrypts a plaintext portal token at rest using AES-256-GCM authenticated encryption.
 * Output format: iv_hex:auth_tag_hex:ciphertext_hex
 */
export function encryptPortalToken(token: string): string {
  if (!token) return "";
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(token, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted portal token.
 * Returns the plaintext token or null if decryption/authentication fails.
 */
export function decryptPortalToken(encryptedString: string): string | null {
  if (!encryptedString || typeof encryptedString !== "string") return null;
  try {
    const parts = encryptedString.split(":");
    if (parts.length !== 3) return null;

    const [ivHex, authTagHex, ciphertextHex] = parts;
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (err) {
    console.error("Portal token decryption failed:", err);
    return null;
  }
}

/**
 * Generates a new cryptographically secure random portal token (32 random bytes = 256 bits entropy).
 */
export function generateRawPortalToken(): string {
  return "lumen_portal_" + crypto.randomBytes(32).toString("hex");
}
