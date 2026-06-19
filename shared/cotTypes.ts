// ─── COT (Commitment of Traders) Types ────────────────────────────────────────
// Larry Williams methodology: COT Index ≥75 = BULLISH, ≤25 = BEARISH

export type CotSignal = "BULLISH" | "BEARISH" | "NEUTRAL" | "LOADING";

export type CotCategory = "Commodity" | "Currency" | "Equity" | "Rate" | "Energy" | "Metal" | "Grain";

export interface CotInstrument {
  id: string;                    // e.g. "gold"
  name: string;                  // e.g. "Gold"
  cftcCode: string;              // CFTC contract market code
  category: CotCategory;
  exchange: string;              // e.g. "COMEX"
  ticker?: string;               // Corresponding equity/ETF ticker for price context
  description: string;
}

export interface CotWeeklyData {
  reportDate: string;            // ISO date string "YYYY-MM-DD"
  commercialLong: number;
  commercialShort: number;
  nonCommercialLong: number;
  nonCommercialShort: number;
  openInterest: number;
  // Derived
  commercialNet: number;         // commercialLong - commercialShort
  nonCommercialNet: number;      // nonCommercialLong - nonCommercialShort
}

export interface CotIndexResult {
  instrument: CotInstrument;
  latestDate: string;
  cotIndex: number;              // 0–100, Larry Williams formula
  signal: CotSignal;
  commercialNet: number;
  nonCommercialNet: number;
  openInterest: number;
  weeklyHistory: CotWeeklyData[];  // Last 52 weeks for chart
  // Trend
  cotIndexChange: number;        // vs prior week
  commercialNetChange: number;
  // Meta
  dataAge: number;               // Days since latest report
  lookbackWeeks: number;         // Weeks used for index calculation
}

export interface CotScanResult {
  results: CotIndexResult[];
  scannedAt: string;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  dataSource: "CFTC";
}

// The 19 instruments tracked
export const COT_INSTRUMENTS: CotInstrument[] = [
  // Metals
  { id: "gold",         name: "Gold",           cftcCode: "088691", category: "Metal",     exchange: "COMEX",  ticker: "GLD",  description: "Gold futures — safe haven and inflation hedge" },
  { id: "silver",       name: "Silver",         cftcCode: "084691", category: "Metal",     exchange: "COMEX",  ticker: "SLV",  description: "Silver futures — industrial + monetary metal" },
  { id: "copper",       name: "Copper",         cftcCode: "085692", category: "Metal",     exchange: "COMEX",  ticker: "COPX", description: "Copper futures — global economic bellwether" },
  // Energy
  { id: "crude_oil",    name: "Crude Oil",      cftcCode: "067651", category: "Energy",    exchange: "NYMEX",  ticker: "USO",  description: "WTI crude oil futures" },
  { id: "nat_gas",      name: "Natural Gas",    cftcCode: "023651", category: "Energy",    exchange: "NYMEX",  ticker: "UNG",  description: "Henry Hub natural gas futures" },
  // Grains
  { id: "corn",         name: "Corn",           cftcCode: "002602", category: "Grain",     exchange: "CBOT",   ticker: "CORN", description: "Corn futures" },
  { id: "wheat",        name: "Wheat",          cftcCode: "001602", category: "Grain",     exchange: "CBOT",   ticker: "WEAT", description: "Chicago SRW wheat futures" },
  { id: "soybeans",     name: "Soybeans",       cftcCode: "005602", category: "Grain",     exchange: "CBOT",   ticker: "SOYB", description: "Soybean futures" },
  // Currencies
  { id: "eur_usd",      name: "Euro",           cftcCode: "099741", category: "Currency",  exchange: "CME",    ticker: "FXE",  description: "Euro FX futures (EUR/USD)" },
  { id: "jpy_usd",      name: "Japanese Yen",   cftcCode: "097741", category: "Currency",  exchange: "CME",    ticker: "FXY",  description: "Japanese Yen futures (JPY/USD)" },
  { id: "gbp_usd",      name: "British Pound",  cftcCode: "096742", category: "Currency",  exchange: "CME",    ticker: "FXB",  description: "British Pound futures (GBP/USD)" },
  { id: "aud_usd",      name: "Australian Dollar", cftcCode: "232741", category: "Currency", exchange: "CME", ticker: "FXA",  description: "Australian Dollar futures (AUD/USD)" },
  { id: "cad_usd",      name: "Canadian Dollar", cftcCode: "090741", category: "Currency", exchange: "CME",   ticker: "FXC",  description: "Canadian Dollar futures (CAD/USD)" },
  // Equities
  { id: "sp500",        name: "S&P 500",        cftcCode: "13874A", category: "Equity",    exchange: "CME",    ticker: "SPY",  description: "E-mini S&P 500 futures" },
  { id: "nasdaq",       name: "Nasdaq 100",     cftcCode: "20974P", category: "Equity",    exchange: "CME",    ticker: "QQQ",  description: "E-mini Nasdaq-100 futures" },
  { id: "russell",      name: "Russell 2000",   cftcCode: "239742", category: "Equity",    exchange: "CME",    ticker: "IWM",  description: "E-mini Russell 2000 futures" },
  // Rates
  { id: "tnote_10y",    name: "10-Year T-Note", cftcCode: "043602", category: "Rate",      exchange: "CBOT",   ticker: "TLT",  description: "10-Year Treasury Note futures" },
  { id: "tnote_30y",    name: "30-Year T-Bond", cftcCode: "020601", category: "Rate",      exchange: "CBOT",   ticker: "TLT",  description: "30-Year Treasury Bond futures" },
  // Soft commodities
  { id: "cotton",       name: "Cotton",         cftcCode: "033661", category: "Commodity", exchange: "ICE",    ticker: "BAL",  description: "Cotton No. 2 futures" },
];
