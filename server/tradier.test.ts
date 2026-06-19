/**
 * tradier.test.ts
 * Validates that the TRADIER_API_KEY is set and can fetch real options data.
 */
import { describe, it, expect } from "vitest";

const TRADIER_BASE = "https://api.tradier.com/v1";

describe("Tradier API key validation", () => {
  it("should have TRADIER_API_KEY set in environment", () => {
    const key = process.env.TRADIER_API_KEY;
    expect(key, "TRADIER_API_KEY must be set").toBeTruthy();
    expect(key!.length, "TRADIER_API_KEY must be at least 20 chars").toBeGreaterThan(20);
  });

  it("should successfully fetch AAPL quote from Tradier", async () => {
    const key = process.env.TRADIER_API_KEY;
    if (!key) {
      console.warn("Skipping Tradier live test — no API key set");
      return;
    }

    // Use the quotes endpoint — no expiration needed, simplest validation
    const res = await fetch(
      `${TRADIER_BASE}/markets/quotes?symbols=AAPL`,
      {
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
        },
      }
    );

    expect(res.status, `Tradier API returned ${res.status} — check if key is valid and account is active`).toBe(200);

    const data = await res.json() as { quotes: { quote: { symbol: string; last: number } } };
    expect(data.quotes?.quote?.symbol).toBe("AAPL");
    expect(data.quotes?.quote?.last).toBeGreaterThan(0);

    console.log(`✓ Tradier: AAPL last price = $${data.quotes.quote.last}`);
  }, 15000);

  it("should fetch AAPL options expirations from Tradier", async () => {
    const key = process.env.TRADIER_API_KEY;
    if (!key) return;

    const res = await fetch(
      `${TRADIER_BASE}/markets/options/expirations?symbol=AAPL&includeAllRoots=true`,
      {
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
        },
      }
    );

    expect(res.status, `Tradier expirations returned ${res.status}`).toBe(200);

    const data = await res.json() as { expirations: { date: string[] } | null };
    const dates = data.expirations?.date;
    expect(Array.isArray(dates) && dates.length > 0, "Should have at least 1 expiration date").toBe(true);

    console.log(`✓ Tradier: AAPL has ${dates!.length} expirations, nearest = ${dates![0]}`);
  }, 15000);
});
