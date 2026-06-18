import { describe, it, expect } from "vitest";

describe("Google OAuth credentials", () => {
  it("GOOGLE_CLIENT_ID is set and has correct format", () => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    expect(clientId, "GOOGLE_CLIENT_ID must be set").toBeTruthy();
    expect(clientId).toMatch(/\.apps\.googleusercontent\.com$/);
  });

  it("GOOGLE_CLIENT_SECRET is set and non-empty", () => {
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    expect(clientSecret, "GOOGLE_CLIENT_SECRET must be set").toBeTruthy();
    expect(typeof clientSecret).toBe("string");
    expect((clientSecret as string).length).toBeGreaterThan(5);
  });
});
