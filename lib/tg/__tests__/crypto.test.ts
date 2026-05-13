import { describe, expect, it, beforeAll } from "vitest";

beforeAll(() => {
  process.env.TG_TOKEN_ENC_KEY = "test-key-test-key-test-key-test-key";
});

describe("tg/crypto", () => {
  it("encrypt then decrypt yields the original", async () => {
    const { encryptToken, decryptToken } = await import("../crypto");
    const token = "1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";
    const ct = encryptToken(token);
    expect(ct).not.toContain(token);
    expect(decryptToken(ct)).toBe(token);
  });

  it("different ciphertexts for the same plaintext (random IV)", async () => {
    const { encryptToken } = await import("../crypto");
    const token = "1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";
    expect(encryptToken(token)).not.toBe(encryptToken(token));
  });

  it("rejects garbage", async () => {
    const { decryptToken } = await import("../crypto");
    expect(() => decryptToken("not-base64")).toThrow();
  });

  it("validates token shape", async () => {
    const { isValidTokenFormat } = await import("../crypto");
    expect(isValidTokenFormat("1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij")).toBe(true);
    expect(isValidTokenFormat("bad-token")).toBe(false);
    expect(isValidTokenFormat("12345:short")).toBe(false);
  });

  it("generates a valid webhook secret", async () => {
    const { generateWebhookSecret } = await import("../crypto");
    const s = generateWebhookSecret();
    expect(s).toMatch(/^[a-f0-9]+$/);
    expect(s.length).toBeGreaterThanOrEqual(32);
  });
});
