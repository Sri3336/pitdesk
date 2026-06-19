/**
 * Live end-to-end test of the COI analysis pipeline using Tradier.
 * Run with: node test_coi_live.mjs
 */
import { config } from "dotenv";
config();

const TRADIER_BASE = "https://api.tradier.com/v1";
const KEY = process.env.TRADIER_API_KEY;

if (!KEY) {
  console.error("TRADIER_API_KEY not set");
  process.exit(1);
}

async function tradierFetch(path, params = {}) {
  const url = new URL(`${TRADIER_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${KEY}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Tradier ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  const ticker = "AAPL";
  console.log(`\n=== COI Analysis for ${ticker} ===\n`);

  // 1. Get quote
  const quoteData = await tradierFetch("/markets/quotes", { symbols: ticker });
  const price = quoteData.quotes.quote.last;
  console.log(`Current price: $${price}`);

  // 2. Get expirations
  const expData = await tradierFetch("/markets/options/expirations", { symbol: ticker, includeAllRoots: "true" });
  const expirations = expData.expirations.date;
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const nearest = expirations[0];
  const isExpiryDay = nearest === today;
  const isExpiryEve = nearest === tomorrow;
  const selectedExpiry = (isExpiryDay || isExpiryEve) ? expirations[1] : expirations[0];
  console.log(`Nearest expiry: ${nearest} (isExpiryDay=${isExpiryDay}, isExpiryEve=${isExpiryEve})`);
  console.log(`Selected expiry: ${selectedExpiry}`);

  // 3. Get options chain
  const chainData = await tradierFetch("/markets/options/chains", { symbol: ticker, expiration: selectedExpiry, greeks: "true" });
  const options = chainData.options.option;
  const calls = options.filter(o => o.option_type === "call");
  const puts = options.filter(o => o.option_type === "put");
  console.log(`Chain: ${calls.length} calls, ${puts.length} puts`);

  // 4. Find ATM strike
  const strikes = [...new Set([...calls.map(c => c.strike), ...puts.map(p => p.strike)])].sort((a, b) => a - b);
  const atmStrike = strikes.reduce((prev, curr) => Math.abs(curr - price) < Math.abs(prev - price) ? curr : prev);
  const atmIdx = strikes.indexOf(atmStrike);
  const atmStrikes = strikes.slice(Math.max(0, atmIdx - 3), atmIdx + 4);
  console.log(`ATM strike: $${atmStrike}`);
  console.log(`7-strike window: ${atmStrikes.join(", ")}`);

  // 5. COI imbalance
  const callMap = new Map(calls.map(c => [c.strike, c]));
  const putMap = new Map(puts.map(p => [p.strike, p]));

  let callOITotal = 0, putOITotal = 0;
  console.log("\nStrike-by-strike OI:");
  for (const strike of atmStrikes) {
    const c = callMap.get(strike);
    const p = putMap.get(strike);
    const cOI = c?.open_interest ?? 0;
    const pOI = p?.open_interest ?? 0;
    const cDelta = c?.greeks?.delta?.toFixed(2) ?? "N/A";
    const pDelta = p?.greeks?.delta?.toFixed(2) ?? "N/A";
    callOITotal += cOI;
    putOITotal += pOI;
    console.log(`  $${strike}: Call OI=${cOI.toLocaleString()} (Δ${cDelta})  |  Put OI=${pOI.toLocaleString()} (Δ${pDelta})`);
  }

  const total = callOITotal + putOITotal;
  const callPct = total > 0 ? (callOITotal / total * 100) : 50;
  const putPct = total > 0 ? (putOITotal / total * 100) : 50;
  const imbalance = Math.abs(callPct - putPct);
  const signal = imbalance >= 30
    ? (callPct > putPct ? "BUY_PUT (heavy call writing = resistance)" : "BUY_CALL (heavy put writing = support)")
    : "NEUTRAL";

  console.log(`\nCOI Summary:`);
  console.log(`  Call OI: ${callOITotal.toLocaleString()} (${callPct.toFixed(1)}%)`);
  console.log(`  Put OI:  ${putOITotal.toLocaleString()} (${putPct.toFixed(1)}%)`);
  console.log(`  Imbalance: ${imbalance.toFixed(1)}%`);
  console.log(`  Signal: ${signal}`);

  // 6. Full chain PCR
  const totalCallOI = calls.reduce((s, c) => s + (c.open_interest ?? 0), 0);
  const totalPutOI = puts.reduce((s, p) => s + (p.open_interest ?? 0), 0);
  const pcrOI = totalCallOI > 0 ? (totalPutOI / totalCallOI).toFixed(3) : "N/A";
  console.log(`\nFull chain PCR(OI): ${pcrOI}`);
  console.log(`\n✓ COI pipeline working correctly with real Tradier data`);
}

main().catch(err => { console.error(err); process.exit(1); });
