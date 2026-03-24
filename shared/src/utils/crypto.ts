import crypto from "crypto";
import { logger } from "./logger.ts";

const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;

/**
 * Get the encryption key from environment variables.
 * It must be a 32-byte string for aes-256-cbc.
 * If ENCRYPTION_KEY is not provided, we derive one from JWT_SECRET as a fallback.
 */
function getEncryptionKey(): Buffer {
  const key = (process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || "").trim();

  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ENCRYPTION_KEY or JWT_SECRET must be set in production");
    }
    // Fallback for development if everything is missing
    return crypto.createHash("sha256").update("dev-secret-key").digest();
  }

  // Always hash the key to ensure it's exactly 32 bytes
  return crypto.createHash("sha256").update(key).digest();
}

/**
 * Encrypt a string using AES-256-CBC
 * Returns a string in the format: iv:encryptedData
 */
export function encrypt(text: string): string {
  try {
    if (!text) return "";

    const iv = crypto.randomBytes(IV_LENGTH);
    const key = getEncryptionKey();
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    return `${iv.toString("hex")}:${encrypted}`;
  } catch (error) {
    logger.error("Encryption failed", { error });
    throw new Error("Failed to encrypt data");
  }
}

/**
 * Decrypt a string using AES-256-CBC
 * Expects a string in the format: iv:encryptedData
 */
export function decrypt(text: string): string {
  try {
    if (!text) return "";

    const parts = text.split(":");
    if (parts.length !== 2) {
      // If it doesn't have the colon, it's likely not encrypted
      logger.warn("Decrypt: Text doesn't have expected format (iv:data)", { 
        textLength: text.length,
        preview: text.substring(0, 20)
      });
      return text;
    }

    const ivStr = parts[0];
    const encryptedText = parts[1];

    if (!ivStr || ivStr.length !== 32 || !encryptedText) {
      logger.warn("Decrypt: Invalid IV or encrypted text", {
        ivLength: ivStr?.length,
        hasEncryptedText: !!encryptedText
      });
      return text;
    }

    const iv = Buffer.from(ivStr, "hex");
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");

    logger.debug("Decrypt: Successfully decrypted", {
      originalLength: text.length,
      decryptedLength: decrypted.length
    });

    return decrypted;
  } catch (error: any) {
    // If decryption fails, it might be plain text that was incorrectly formatted or a key mismatch
    logger.error("Decryption failed - possible key mismatch", { 
      error: error.message,
      textPreview: text.substring(0, 20),
      hasEncryptionKey: !!process.env.ENCRYPTION_KEY,
      hasJwtSecret: !!process.env.JWT_SECRET
    });
    return text;
  }
}

/**
 * Simple utility to check if a string looks like it's encrypted
 */
export function isEncrypted(text: string): boolean {
  if (!text) return false;
  const parts = text.split(":");
  if (parts.length !== 2) return false;
  const ivPart = parts[0];
  // IV should be 32 hex chars (16 bytes)
  return !!ivPart && ivPart.length === 32;
}
