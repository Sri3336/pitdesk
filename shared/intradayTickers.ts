/**
 * PitDesk Intraday Trend Scanner — 50-Ticker Watchlist
 *
 * Tier 1 (top 25): scanned every 5 minutes during market hours
 * Tier 2 (remaining 25): scanned every 15 minutes
 *
 * Sectors: AI/Semis, Mega-Cap Tech, Storage/Memory, EV/Space,
 *          Financials, Energy, Healthcare, Airlines/Travel, ETFs
 */

export interface ScannerTicker {
  symbol: string;
  name: string;
  sector: string;
  tier: 1 | 2; // 1 = every 5 min, 2 = every 15 min
  etfTicker?: string; // corresponding ETF for options liquidity check
}

export const SCANNER_TICKERS: ScannerTicker[] = [
  // ── AI / Semis ──────────────────────────────────────────────────────────────
  { symbol: "NVDA", name: "NVIDIA", sector: "AI/Semis", tier: 1 },
  { symbol: "AMD",  name: "Advanced Micro Devices", sector: "AI/Semis", tier: 1 },
  { symbol: "AVGO", name: "Broadcom", sector: "AI/Semis", tier: 1 },
  { symbol: "MRVL", name: "Marvell Technology", sector: "AI/Semis", tier: 1 },
  { symbol: "ARM",  name: "Arm Holdings", sector: "AI/Semis", tier: 1 },
  { symbol: "AMAT", name: "Applied Materials", sector: "AI/Semis", tier: 2 },
  { symbol: "LRCX", name: "Lam Research", sector: "AI/Semis", tier: 2 },
  { symbol: "INTC", name: "Intel", sector: "AI/Semis", tier: 2 },
  { symbol: "MSTR", name: "MicroStrategy", sector: "AI/Semis", tier: 2 },
  { symbol: "CRWV", name: "CoreWeave", sector: "AI/Semis", tier: 2 },

  // ── Mega-Cap Tech ────────────────────────────────────────────────────────────
  { symbol: "AAPL",  name: "Apple", sector: "Mega-Cap Tech", tier: 1 },
  { symbol: "MSFT",  name: "Microsoft", sector: "Mega-Cap Tech", tier: 1 },
  { symbol: "META",  name: "Meta Platforms", sector: "Mega-Cap Tech", tier: 1 },
  { symbol: "GOOGL", name: "Alphabet", sector: "Mega-Cap Tech", tier: 1 },
  { symbol: "AMZN",  name: "Amazon", sector: "Mega-Cap Tech", tier: 1 },
  { symbol: "CRM",   name: "Salesforce", sector: "Mega-Cap Tech", tier: 2 },
  { symbol: "ADBE",  name: "Adobe", sector: "Mega-Cap Tech", tier: 2 },
  { symbol: "TSLA",  name: "Tesla", sector: "EV/Space", tier: 1 },

  // ── Storage / Memory ─────────────────────────────────────────────────────────
  { symbol: "MU",   name: "Micron Technology", sector: "Storage/Memory", tier: 1 },
  { symbol: "SNDK", name: "SanDisk", sector: "Storage/Memory", tier: 1 },
  { symbol: "WDC",  name: "Western Digital", sector: "Storage/Memory", tier: 2 },
  { symbol: "STX",  name: "Seagate Technology", sector: "Storage/Memory", tier: 2 },
  { symbol: "SPCX", name: "SPCX ETF", sector: "Storage/Memory", tier: 2 },

  // ── Financials ───────────────────────────────────────────────────────────────
  { symbol: "JPM", name: "JPMorgan Chase", sector: "Financials", tier: 1 },
  { symbol: "GS",  name: "Goldman Sachs", sector: "Financials", tier: 1 },
  { symbol: "BAC", name: "Bank of America", sector: "Financials", tier: 2 },
  { symbol: "MS",  name: "Morgan Stanley", sector: "Financials", tier: 2 },
  { symbol: "V",   name: "Visa", sector: "Financials", tier: 2 },

  // ── Energy ───────────────────────────────────────────────────────────────────
  { symbol: "XOM", name: "ExxonMobil", sector: "Energy", tier: 1 },
  { symbol: "CVX", name: "Chevron", sector: "Energy", tier: 2 },
  { symbol: "FCX", name: "Freeport-McMoRan", sector: "Energy", tier: 2 },
  { symbol: "OXY", name: "Occidental Petroleum", sector: "Energy", tier: 2 },
  { symbol: "SLB", name: "SLB (Schlumberger)", sector: "Energy", tier: 2 },

  // ── Healthcare ───────────────────────────────────────────────────────────────
  { symbol: "LLY",  name: "Eli Lilly", sector: "Healthcare", tier: 1 },
  { symbol: "UNH",  name: "UnitedHealth", sector: "Healthcare", tier: 2 },
  { symbol: "MRNA", name: "Moderna", sector: "Healthcare", tier: 2 },
  { symbol: "ABBV", name: "AbbVie", sector: "Healthcare", tier: 2 },
  { symbol: "PFE",  name: "Pfizer", sector: "Healthcare", tier: 2 },

  // ── Airlines / Travel ────────────────────────────────────────────────────────
  { symbol: "UAL", name: "United Airlines", sector: "Airlines/Travel", tier: 1 },
  { symbol: "DAL", name: "Delta Air Lines", sector: "Airlines/Travel", tier: 2 },
  { symbol: "AAL", name: "American Airlines", sector: "Airlines/Travel", tier: 2 },
  { symbol: "CCL", name: "Carnival Corp", sector: "Airlines/Travel", tier: 2 },

  // ── Broad Market ETFs ────────────────────────────────────────────────────────
  { symbol: "SPY", name: "S&P 500 ETF", sector: "ETFs", tier: 1 },
  { symbol: "QQQ", name: "Nasdaq 100 ETF", sector: "ETFs", tier: 1 },
  { symbol: "IWM", name: "Russell 2000 ETF", sector: "ETFs", tier: 2 },

  // ── Sector ETFs ──────────────────────────────────────────────────────────────
  { symbol: "SMH", name: "Semiconductor ETF", sector: "ETFs", tier: 2 },
  { symbol: "XLE", name: "Energy Sector ETF", sector: "ETFs", tier: 2 },
  { symbol: "XLF", name: "Financial Sector ETF", sector: "ETFs", tier: 2 },
  { symbol: "ZS",  name: "Zscaler", sector: "Mega-Cap Tech", tier: 2 },
];

export const TIER1_TICKERS = SCANNER_TICKERS.filter(t => t.tier === 1).map(t => t.symbol);
export const TIER2_TICKERS = SCANNER_TICKERS.filter(t => t.tier === 2).map(t => t.symbol);
export const ALL_TICKERS   = SCANNER_TICKERS.map(t => t.symbol);
export const SECTORS: string[] = Array.from(new Set(SCANNER_TICKERS.map(t => t.sector)));
// Alias for backward compatibility with scheduledIntradayScan.ts
export const INTRADAY_TICKER_SYMBOLS = ALL_TICKERS;

export function getTickerMeta(symbol: string): ScannerTicker | undefined {
  return SCANNER_TICKERS.find(t => t.symbol === symbol);
}
