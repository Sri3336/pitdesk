import { describe, it, expect } from "vitest";

describe("Schwab API credentials", () => {
  it("SCHWAB_APP_KEY is present and has expected length (32–64 chars)", () => {
    const key = process.env.SCHWAB_APP_KEY ?? "";
    expect(key.length).toBeGreaterThanOrEqual(32);
    expect(key.length).toBeLessThanOrEqual(64);
  });

  it("SCHWAB_APP_SECRET is present and has expected length (32–128 chars)", () => {
    const secret = process.env.SCHWAB_APP_SECRET ?? "";
    expect(secret.length).toBeGreaterThanOrEqual(32);
    expect(secret.length).toBeLessThanOrEqual(128);
  });

  it("Base64-encoded credentials are non-empty and valid", () => {
    const key = process.env.SCHWAB_APP_KEY ?? "";
    const secret = process.env.SCHWAB_APP_SECRET ?? "";
    const encoded = Buffer.from(`${key}:${secret}`).toString("base64");
    expect(encoded.length).toBeGreaterThan(0);
    // Verify it round-trips correctly
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    expect(decoded).toBe(`${key}:${secret}`);
  });
});
