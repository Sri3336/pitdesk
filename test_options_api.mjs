// Test script to probe Yahoo Finance options API response structure
import { callDataApi } from "./server/_core/dataApi.ts";

async function test() {
  try {
    const r = await callDataApi("YahooFinance/get_options", { query: { symbol: "AAPL" } });
    const result = r?.optionChain?.result?.[0];
    if (!result) {
      console.log("No result. Top-level keys:", Object.keys(r || {}));
      console.log("Full response (truncated):", JSON.stringify(r).slice(0, 500));
      return;
    }
    const opts = result.options?.[0];
    if (!opts) {
      console.log("No options. Result keys:", Object.keys(result));
      return;
    }
    const puts = opts.puts ?? [];
    const calls = opts.calls ?? [];
    console.log("PUT count:", puts.length, "CALL count:", calls.length);
    if (puts[0]) console.log("PUT sample:", JSON.stringify(puts[0], null, 2));
    if (calls[0]) console.log("CALL sample:", JSON.stringify(calls[0], null, 2));
    const totalPutOI = puts.reduce((s, p) => s + (p.openInterest ?? 0), 0);
    const totalCallOI = calls.reduce((s, c) => s + (c.openInterest ?? 0), 0);
    const totalPutVol = puts.reduce((s, p) => s + (p.volume ?? 0), 0);
    const totalCallVol = calls.reduce((s, c) => s + (c.volume ?? 0), 0);
    console.log("\ntotalPutOI:", totalPutOI, "totalCallOI:", totalCallOI);
    console.log("totalPutVol:", totalPutVol, "totalCallVol:", totalCallVol);
    if (totalCallOI > 0) console.log("PCR OI:", (totalPutOI / totalCallOI).toFixed(3));
    if (totalCallVol > 0) console.log("PCR Vol:", (totalPutVol / totalCallVol).toFixed(3));
    // Check if multiple expiry dates available
    console.log("\nExpiry dates available:", result.options?.length ?? 0);
    if (result.expirationDates) {
      console.log("Expiration timestamps:", result.expirationDates.slice(0, 5));
    }
  } catch (e) {
    console.error("Error:", e.message);
    // Try alternate endpoint
    console.log("\nTrying alternate endpoint...");
    try {
      const r2 = await callDataApi("YahooFinance/get_stock_chart", {
        query: { symbol: "AAPL", interval: "1d", range: "1d" }
      });
      console.log("Chart API works. Keys:", Object.keys(r2 || {}));
    } catch (e2) {
      console.error("Chart API also failed:", e2.message);
    }
  }
}

test();
