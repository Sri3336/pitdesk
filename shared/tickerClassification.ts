/**
 * PitDesk Backtest Classification — 60-Ticker Strategy Map
 * Generated from 2-year Confluence backtest (8,521 ALIGNED trades)
 * Last updated: 2026-08-02
 *
 * Tier A: Premium Seller's Dream  — Win Rate ≥ 70%  → Trade every ALIGNED signal
 * Tier B: Solid Edge              — Win Rate 60–70% → Trade at 75% normal size
 * Tier C: Marginal / Selective    — Win Rate 50–60% → Only trade score ≥ 8/10
 * Tier D: Avoid / Neutral Only    — Win Rate < 50%  → Skip directional; delta-neutral only
 */

export type StrategyTier = "A" | "B" | "C" | "D";
export type BestStrategy =
  | "Bull Put Spread"
  | "Bear Call Spread"
  | "Iron Condor"
  | "Short Strangle";

export interface TickerClassification {
  tier: StrategyTier;
  tierLabel: string;
  bestStrategy: BestStrategy;
  winRate: number;   // % e.g. 92.6
  avgPnl: number;    // % of max risk e.g. +12.4
  nAligned: number;  // # of ALIGNED signal days in 2-year backtest
  dominantDirection: "BULLISH" | "BEARISH" | "NEUTRAL";
}

const TIER_LABELS: Record<StrategyTier, string> = {
  A: "Premium Seller's Dream",
  B: "Solid Edge",
  C: "Marginal / Selective",
  D: "Avoid / Neutral Only",
};

const RAW: Record<string, [StrategyTier, BestStrategy, number, number, number, "BULLISH"|"BEARISH"|"NEUTRAL"]> = {
  // ticker: [tier, bestStrategy, winRate, avgPnl, nAligned, direction]
  // ── Tier A ──────────────────────────────────────────────────────────────
  SPY:  ["A", "Short Strangle",  92.6, 12.4, 197, "BULLISH"],
  QQQ:  ["A", "Bull Put Spread", 84.8, 14.0, 197, "BULLISH"],
  XLK:  ["A", "Bull Put Spread", 79.9, 15.4, 153, "BULLISH"],
  XLY:  ["A", "Bull Put Spread", 79.4, 11.0, 142, "BULLISH"],
  XLI:  ["A", "Bull Put Spread", 79.1, 10.0, 153, "BULLISH"],
  PFE:  ["A", "Short Strangle",  78.0, 19.2, 131, "NEUTRAL"],
  C:    ["A", "Bull Put Spread", 77.2, 14.6, 175, "BULLISH"],
  NVDA: ["A", "Bear Call Spread",77.1, 25.6, 153, "BEARISH"],
  SLV:  ["A", "Bull Put Spread", 76.6, 21.4, 113, "BULLISH"],
  GE:   ["A", "Bull Put Spread", 76.0, 16.0, 175, "BULLISH"],
  IWM:  ["A", "Bull Put Spread", 75.8, 10.7, 153, "BULLISH"],
  XLB:  ["A", "Bear Call Spread",75.7, 11.1, 153, "BEARISH"],
  CAT:  ["A", "Bull Put Spread", 74.2, 17.7, 209, "BULLISH"],
  DE:   ["A", "Bear Call Spread",72.0, 11.7, 125, "BEARISH"],
  BA:   ["A", "Iron Condor",     70.1, 14.4, 134, "NEUTRAL"],
  // ── Tier B ──────────────────────────────────────────────────────────────
  XLV:  ["B", "Bull Put Spread", 81.8,  6.6, 153, "BULLISH"],
  DIA:  ["B", "Bull Put Spread", 80.9,  5.6, 197, "BULLISH"],
  XLU:  ["B", "Bull Put Spread", 78.5,  7.8, 142, "BULLISH"],
  XLC:  ["B", "Bull Put Spread", 78.0,  4.6, 142, "BULLISH"],
  GLD:  ["B", "Short Strangle",  76.9,  4.1, 113, "NEUTRAL"],
  XLRE: ["B", "Bear Call Spread",73.0,  5.0, 113, "BEARISH"],
  MS:   ["B", "Bull Put Spread", 71.6,  7.6, 153, "BULLISH"],
  MSFT: ["B", "Bear Call Spread",67.8,  1.5, 142, "BEARISH"],
  AVGO: ["B", "Bull Put Spread", 66.9, 15.3, 113, "BULLISH"],
  ORCL: ["B", "Short Strangle",  66.7,  8.7, 113, "NEUTRAL"],
  GS:   ["B", "Bull Put Spread", 66.1,  2.0, 153, "BULLISH"],
  BIIB: ["B", "Short Strangle",  65.1,  9.4, 146, "NEUTRAL"],
  AMD:  ["B", "Bull Put Spread", 64.1, 24.1, 142, "BULLISH"],
  UBER: ["B", "Iron Condor",     64.0, 15.4, 113, "NEUTRAL"],
  GOOGL:["B", "Bull Put Spread", 63.8,  2.8, 142, "BULLISH"],
  TSLA: ["B", "Bear Call Spread",61.1,  7.4, 142, "BEARISH"],
  // ── Tier C ──────────────────────────────────────────────────────────────
  HYG:  ["C", "Bear Call Spread",93.1,  0.0, 153, "BEARISH"],
  JNJ:  ["C", "Bull Put Spread", 72.1, -2.8, 131, "BULLISH"],
  XLE:  ["C", "Bull Put Spread", 65.4, -3.7, 142, "BULLISH"],
  TLT:  ["C", "Bear Call Spread",62.9, -1.8, 113, "BEARISH"],
  XLF:  ["C", "Bear Call Spread",62.8, -0.5, 153, "BEARISH"],
  GILD: ["C", "Iron Condor",     62.6, -2.2, 131, "NEUTRAL"],
  XOM:  ["C", "Bear Call Spread",62.4, -4.6, 142, "BEARISH"],
  BAC:  ["C", "Bull Put Spread", 60.6, -3.9, 153, "BULLISH"],
  NFLX: ["C", "Short Strangle",  59.0, -0.4, 113, "NEUTRAL"],
  LYFT: ["C", "Iron Condor",     58.2, 10.7, 113, "NEUTRAL"],
  INTC: ["C", "Bull Put Spread", 57.5, 11.9, 113, "BULLISH"],
  AXP:  ["C", "Bull Put Spread", 57.3, -0.4, 143, "BULLISH"],
  // ── Tier D ──────────────────────────────────────────────────────────────
  XLP:  ["D", "Bear Call Spread",65.8,-10.7, 153, "BEARISH"],
  JPM:  ["D", "Bull Put Spread", 60.0,-10.4, 153, "BULLISH"],
  AAPL: ["D", "Bull Put Spread", 59.2,-10.7, 153, "BULLISH"],
  V:    ["D", "Short Strangle",  57.9, -6.3, 121, "NEUTRAL"],
  PYPL: ["D", "Short Strangle",  57.8, -5.5, 113, "NEUTRAL"],
  OXY:  ["D", "Bull Put Spread", 56.9, -7.2, 113, "BULLISH"],
  CVX:  ["D", "Bull Put Spread", 56.2,-11.7, 142, "BULLISH"],
  AMGN: ["D", "Iron Condor",     55.2, -6.6, 134, "NEUTRAL"],
  WMT:  ["D", "Iron Condor",     54.8,-17.5, 166, "NEUTRAL"],
  WFC:  ["D", "Bull Put Spread", 54.7, -7.7, 153, "BULLISH"],
  META: ["D", "Short Strangle",  54.0, -8.6, 113, "NEUTRAL"],
  MA:   ["D", "Bear Call Spread",53.6,-10.1,  97, "BEARISH"],
  AMZN: ["D", "Bull Put Spread", 53.3,-13.9, 142, "BULLISH"],
  MRNA: ["D", "Iron Condor",     47.6, -1.2, 103, "NEUTRAL"],
  UNH:  ["D", "Bear Call Spread",44.2,-24.2, 104, "BEARISH"],
  COST: ["D", "Bear Call Spread",41.4,-25.3, 116, "BEARISH"],
  CRM:  ["D", "Bear Call Spread",41.0,-26.6, 113, "BEARISH"],
  ADBE: ["D", "Bear Call Spread",19.7,-62.3, 113, "BEARISH"],
  // ── Additional tickers not in PCR_TICKERS but common in watchlist ───────
  PLTR: ["B", "Bull Put Spread", 70.0, 24.1, 153, "BULLISH"],
};

export function getTickerClassification(ticker: string): TickerClassification | null {
  const entry = RAW[ticker.toUpperCase()];
  if (!entry) return null;
  const [tier, bestStrategy, winRate, avgPnl, nAligned, dominantDirection] = entry;
  return {
    tier,
    tierLabel: TIER_LABELS[tier],
    bestStrategy,
    winRate,
    avgPnl,
    nAligned,
    dominantDirection,
  };
}

export function getTierColor(tier: StrategyTier): string {
  return { A: "#22c55e", B: "#86efac", C: "#eab308", D: "#ef4444" }[tier];
}

export function getTierSizeGuidance(tier: StrategyTier): string {
  return {
    A: "Full size — trade every ALIGNED signal",
    B: "75% size — solid edge, slightly lower conviction",
    C: "50% size — only trade when score ≥ 8/10",
    D: "Skip directional — delta-neutral only at 25% size",
  }[tier];
}
