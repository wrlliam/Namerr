/**
 * Encryption utilities for sensitive data
 * Uses AES-256-GCM for authenticated encryption
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 16 bytes for AES
const AUTH_TAG_LENGTH = 16; // 16 bytes for GCM auth tag
const SALT_LENGTH = 64; // 64 bytes for key derivation salt

/**
 * Get encryption key from environment
 * Falls back to a default key for development (NOT SECURE FOR PRODUCTION)
 */
function getEncryptionKey(): Buffer {
  const keyString = process.env.ENCRYPTION_KEY;

  if (!keyString) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "ENCRYPTION_KEY environment variable is required in production"
      );
    }

    // Development fallback - NOT SECURE
    console.warn(
      "⚠️  WARNING: Using default encryption key. Set ENCRYPTION_KEY in .env for production!"
    );
    return Buffer.from("dev-encryption-key-not-secure-32b", "utf-8");
  }

  // If key is hex-encoded
  if (keyString.length === 64 && /^[0-9a-fA-F]+$/.test(keyString)) {
    return Buffer.from(keyString, "hex");
  }

  // If key is base64-encoded
  if (keyString.length === 44 && /^[A-Za-z0-9+/]+=*$/.test(keyString)) {
    return Buffer.from(keyString, "base64");
  }

  // Otherwise, derive key from string using PBKDF2
  const salt = Buffer.from("namerr-encryption-salt-v1", "utf-8");
  return crypto.pbkdf2Sync(keyString, salt, 100000, 32, "sha256");
}

export interface EncryptedData {
  encrypted: string; // Base64-encoded encrypted data
  iv: string; // Base64-encoded initialization vector
  authTag: string; // Base64-encoded authentication tag
}

/**
 * Encrypt text using AES-256-GCM
 * @param text - Plain text to encrypt
 * @returns Encrypted data with IV and auth tag
 */
export function encrypt(text: string | null | undefined): EncryptedData | null {
  if (!text) {
    return null;
  }

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, "utf8", "base64");
    encrypted += cipher.final("base64");

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
    };
  } catch (error) {
    console.error("Encryption error:", error);
    throw new Error("Failed to encrypt data");
  }
}

/**
 * Decrypt data encrypted with AES-256-GCM
 * @param data - Encrypted data object
 * @returns Decrypted plain text
 */
export function decrypt(data: EncryptedData | null | undefined): string | null {
  if (!data || !data.encrypted || !data.iv || !data.authTag) {
    return null;
  }

  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(data.iv, "base64");
    const authTag = Buffer.from(data.authTag, "base64");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(data.encrypted, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error);
    throw new Error("Failed to decrypt data - data may be corrupted or key is incorrect");
  }
}

/**
 * Generate a random encryption key (32 bytes for AES-256)
 * @returns Hex-encoded encryption key
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Hash a password using scrypt (for comparison, not encryption)
 * @param password - Password to hash
 * @returns Hashed password with salt
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Verify a password against a hash
 * @param password - Password to verify
 * @param hashedPassword - Previously hashed password
 * @returns True if password matches
 */
export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  const [salt, hash] = hashedPassword.split(":");
  const hashToVerify = crypto.scryptSync(password, salt, 64).toString("hex");
  return hash === hashToVerify;
}
