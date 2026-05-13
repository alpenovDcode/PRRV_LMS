// AES-256-GCM encryption for Telegram bot tokens.
// Key is derived from TG_TOKEN_ENC_KEY (32+ bytes hex/utf8) via SHA-256.
// Format: base64(iv(12) || ciphertext || authTag(16)).

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const IV_LEN = 12;
const AUTH_TAG_LEN = 16;

function getKey(): Buffer {
  const raw = process.env.TG_TOKEN_ENC_KEY;
  if (!raw || raw.length < 16) {
    throw new Error(
      "TG_TOKEN_ENC_KEY must be set (>=16 chars). Generate: `openssl rand -hex 32`"
    );
  }
  // Derive a fixed 32-byte key from arbitrary-length input.
  return createHash("sha256").update(raw, "utf8").digest();
}

export function encryptToken(plain: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]).toString("base64");
}

export function decryptToken(encoded: string): string {
  const key = getKey();
  const buf = Buffer.from(encoded, "base64");
  if (buf.length < IV_LEN + AUTH_TAG_LEN + 1) {
    throw new Error("encrypted token too short");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(buf.length - AUTH_TAG_LEN);
  const ct = buf.subarray(IV_LEN, buf.length - AUTH_TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

// Format used in /api/tg-webhook/[botId] secret check.
// Telegram requires <=256 chars, A-Z a-z 0-9 _-.
export function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

// Token format check — guard against accidental misconfig.
const TOKEN_RE = /^\d{6,15}:[A-Za-z0-9_-]{30,}$/;
export function isValidTokenFormat(token: string): boolean {
  return TOKEN_RE.test(token);
}

export function tokenPrefix(token: string): string {
  const colonIdx = token.indexOf(":");
  if (colonIdx <= 0) return "***";
  return token.substring(0, Math.min(colonIdx, 12));
}
