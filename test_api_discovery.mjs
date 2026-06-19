// Discover available Yahoo Finance options-related endpoints
import { callDataApi } from "./server/_core/dataApi.ts";

const endpoints = [
  "YahooFinance/get_options",
  "YahooFinance/get_option_chain",
  "YahooFinance/options",
  "YahooFinance/get_stock_options",
  "YahooFinance/get_quote_summary",
  "YahooFinance/get_quotes",
];

for (const ep of endpoints) {
  try {
    const r = await callDataApi(ep, { query: { symbol: "AAPL" } });
    console.log(`✓ ${ep} — keys: ${Object.keys(r || {}).join(", ")}`);
  } catch (e) {
    console.log(`✗ ${ep} — ${e.message.slice(0, 80)}`);
  }
}

// Also try get_quote_summary with options module
try {
  const r = await callDataApi("YahooFinance/get_quote_summary", {
    query: { symbol: "AAPL", modules: "optionChain" }
  });
  console.log("quote_summary optionChain:", JSON.stringify(r).slice(0, 200));
} catch (e) {
  console.log("quote_summary optionChain error:", e.message.slice(0, 80));
}
