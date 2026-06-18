/**
 * PitDesk Intraday Scanner — 50-ticker watchlist across sectors
 * These are the default tickers scanned every 15 min during market hours.
 * Curated for liquidity, volatility, and sector diversity.
 */

export interface IntradayTicker {
  symbol: string;
  name: string;
  sector: string;
}

export const INTRADAY_TICKERS: IntradayTicker[] = [
  // Technology (12)
  { symbol: "AAPL",  name: "Apple",             sector: "Technology" },
  { symbol: "MSFT",  name: "Microsoft",          sector: "Technology" },
  { symbol: "NVDA",  name: "NVIDIA",             sector: "Technology" },
  { symbol: "META",  name: "Meta Platforms",     sector: "Technology" },
  { symbol: "GOOGL", name: "Alphabet",           sector: "Technology" },
  { symbol: "AMZN",  name: "Amazon",             sector: "Technology" },
  { symbol: "AMD",   name: "AMD",                sector: "Technology" },
  { symbol: "TSMC",  name: "TSMC",               sector: "Technology" },
  { symbol: "AVGO",  name: "Broadcom",           sector: "Technology" },
  { symbol: "CRM",   name: "Salesforce",         sector: "Technology" },
  { symbol: "ORCL",  name: "Oracle",             sector: "Technology" },
  { symbol: "PLTR",  name: "Palantir",           sector: "Technology" },

  // Consumer / EV / Autos (5)
  { symbol: "TSLA",  name: "Tesla",              sector: "Consumer/EV" },
  { symbol: "RIVN",  name: "Rivian",             sector: "Consumer/EV" },
  { symbol: "NIO",   name: "NIO",                sector: "Consumer/EV" },
  { symbol: "F",     name: "Ford",               sector: "Consumer/EV" },
  { symbol: "GM",    name: "General Motors",     sector: "Consumer/EV" },

  // Financials (6)
  { symbol: "JPM",   name: "JPMorgan Chase",     sector: "Financials" },
  { symbol: "GS",    name: "Goldman Sachs",      sector: "Financials" },
  { symbol: "BAC",   name: "Bank of America",    sector: "Financials" },
  { symbol: "MS",    name: "Morgan Stanley",     sector: "Financials" },
  { symbol: "V",     name: "Visa",               sector: "Financials" },
  { symbol: "COIN",  name: "Coinbase",           sector: "Financials" },

  // Healthcare / Biotech (5)
  { symbol: "UNH",   name: "UnitedHealth",       sector: "Healthcare" },
  { symbol: "LLY",   name: "Eli Lilly",          sector: "Healthcare" },
  { symbol: "MRNA",  name: "Moderna",            sector: "Healthcare" },
  { symbol: "ABBV",  name: "AbbVie",             sector: "Healthcare" },
  { symbol: "BIIB",  name: "Biogen",             sector: "Healthcare" },

  // Energy (4)
  { symbol: "XOM",   name: "ExxonMobil",         sector: "Energy" },
  { symbol: "CVX",   name: "Chevron",            sector: "Energy" },
  { symbol: "OXY",   name: "Occidental",         sector: "Energy" },
  { symbol: "SLB",   name: "SLB (Schlumberger)", sector: "Energy" },

  // Industrials / Defense (4)
  { symbol: "CAT",   name: "Caterpillar",        sector: "Industrials" },
  { symbol: "BA",    name: "Boeing",             sector: "Industrials" },
  { symbol: "LMT",   name: "Lockheed Martin",    sector: "Industrials" },
  { symbol: "RTX",   name: "RTX Corp",           sector: "Industrials" },

  // Retail / Consumer Discretionary (4)
  { symbol: "WMT",   name: "Walmart",            sector: "Retail" },
  { symbol: "TGT",   name: "Target",             sector: "Retail" },
  { symbol: "COST",  name: "Costco",             sector: "Retail" },
  { symbol: "HD",    name: "Home Depot",         sector: "Retail" },

  // Semiconductors / Chips (4)
  { symbol: "INTC",  name: "Intel",              sector: "Semiconductors" },
  { symbol: "QCOM",  name: "Qualcomm",           sector: "Semiconductors" },
  { symbol: "MU",    name: "Micron",             sector: "Semiconductors" },
  { symbol: "AMAT",  name: "Applied Materials",  sector: "Semiconductors" },

  // ETFs / Indices (6)
  { symbol: "SPY",   name: "S&P 500 ETF",        sector: "ETF" },
  { symbol: "QQQ",   name: "Nasdaq 100 ETF",     sector: "ETF" },
  { symbol: "IWM",   name: "Russell 2000 ETF",   sector: "ETF" },
  { symbol: "SOXL",  name: "Semis 3× Bull ETF",  sector: "ETF" },
  { symbol: "TQQQ",  name: "QQQ 3× Bull ETF",    sector: "ETF" },
  { symbol: "GLD",   name: "Gold ETF",           sector: "ETF" },
];

export const INTRADAY_TICKER_SYMBOLS = INTRADAY_TICKERS.map((t) => t.symbol);

/** Returns ticker metadata by symbol, or undefined if not found */
export function getIntradayTicker(symbol: string): IntradayTicker | undefined {
  return INTRADAY_TICKERS.find((t) => t.symbol === symbol.toUpperCase());
}
