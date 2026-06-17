/**
 * The 60 PCR tickers scanned across PitDesk features.
 */
export const PCR_TICKERS = [
  "SPY", "QQQ", "IWM", "DIA", "GLD", "SLV", "TLT", "HYG", "XLF", "XLE",
  "XLK", "XLV", "XLI", "XLU", "XLP", "XLB", "XLRE", "XLC", "XLY",
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "ORCL",
  "AMD", "INTC", "CRM", "ADBE", "NFLX", "PYPL", "UBER", "LYFT", "SQ",
  "JPM", "BAC", "GS", "MS", "WFC", "C",
  "XOM", "CVX", "OXY",
  "JNJ", "PFE", "MRNA", "UNH",
  "BA", "CAT", "DE", "GE",
  "AMGN", "GILD", "BIIB",
  "V", "MA", "AXP",
  "WMT", "COST",
] as const;

export type PcrTicker = (typeof PCR_TICKERS)[number];
