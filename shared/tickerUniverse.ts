/**
 * 66-Ticker Options Trading Universe
 * Curated across 12 sectors for diversified options trading.
 * Selection criteria: high options liquidity, active retail interest,
 * strong institutional coverage, and options-friendly price/IV profile.
 */

export interface TickerInfo {
  symbol: string;
  name: string;
  sector: string;
  sectorCode: string;
  marketCap: "mega" | "large" | "mid";
  optionsLiquidity: "high" | "very_high";
  notes: string;
}

export const TICKER_UNIVERSE: TickerInfo[] = [
  // ── Technology (8) ──────────────────────────────────────────────────────────
  { symbol: "AAPL",  name: "Apple Inc.",              sector: "Technology",        sectorCode: "TECH", marketCap: "mega",  optionsLiquidity: "very_high", notes: "Most liquid options market globally" },
  { symbol: "NVDA",  name: "NVIDIA Corp.",             sector: "Technology",        sectorCode: "TECH", marketCap: "mega",  optionsLiquidity: "very_high", notes: "AI/GPU leader, high IV, active retail" },
  { symbol: "MSFT",  name: "Microsoft Corp.",          sector: "Technology",        sectorCode: "TECH", marketCap: "mega",  optionsLiquidity: "very_high", notes: "Stable mega-cap, consistent premium seller" },
  { symbol: "META",  name: "Meta Platforms",           sector: "Technology",        sectorCode: "TECH", marketCap: "mega",  optionsLiquidity: "very_high", notes: "High IV around earnings, active options" },
  { symbol: "AMD",   name: "Advanced Micro Devices",   sector: "Technology",        sectorCode: "TECH", marketCap: "large", optionsLiquidity: "very_high", notes: "High beta, excellent for spreads" },
  { symbol: "ORCL",  name: "Oracle Corp.",             sector: "Technology",        sectorCode: "TECH", marketCap: "mega",  optionsLiquidity: "high",      notes: "Cloud growth story, earnings IV spikes" },
  { symbol: "PLTR",  name: "Palantir Technologies",    sector: "Technology",        sectorCode: "TECH", marketCap: "large", optionsLiquidity: "very_high", notes: "High retail interest, elevated IV" },
  { symbol: "APP",   name: "AppLovin Corp.",           sector: "Technology",        sectorCode: "TECH", marketCap: "large", optionsLiquidity: "high",      notes: "High momentum, volatile options" },

  // ── Semiconductors (8) ──────────────────────────────────────────────────────
  { symbol: "TSM",   name: "Taiwan Semiconductor",     sector: "Semiconductors",    sectorCode: "SEMI", marketCap: "mega",  optionsLiquidity: "high",      notes: "Global chip leader, geopolitical premium" },
  { symbol: "AVGO",  name: "Broadcom Inc.",            sector: "Semiconductors",    sectorCode: "SEMI", marketCap: "mega",  optionsLiquidity: "high",      notes: "AI networking play, high premium" },
  { symbol: "INTC",  name: "Intel Corp.",              sector: "Semiconductors",    sectorCode: "SEMI", marketCap: "large", optionsLiquidity: "very_high", notes: "Turnaround story, elevated IV" },
  { symbol: "QCOM",  name: "Qualcomm Inc.",            sector: "Semiconductors",    sectorCode: "SEMI", marketCap: "large", optionsLiquidity: "high",      notes: "Mobile/AI chips, steady IV" },
  { symbol: "SOXL",  name: "Direxion Semi Bull 3X",    sector: "Semiconductors",    sectorCode: "SEMI", marketCap: "large", optionsLiquidity: "very_high", notes: "Leveraged ETF, very high IV, active retail" },
  { symbol: "LITE",  name: "Lumentum Holdings",        sector: "Semiconductors",    sectorCode: "SEMI", marketCap: "mid",   optionsLiquidity: "high",      notes: "Photonics/optical chips, AI datacentre demand" },
  { symbol: "SNDK",  name: "SanDisk Corp.",            sector: "Semiconductors",    sectorCode: "SEMI", marketCap: "large", optionsLiquidity: "high",      notes: "NAND flash memory, high IV on supply cycle" },
  { symbol: "MU",    name: "Micron Technology",        sector: "Semiconductors",    sectorCode: "SEMI", marketCap: "large", optionsLiquidity: "very_high", notes: "DRAM/NAND leader, highest memory options volume" },

  // ── Consumer Discretionary / E-Commerce (5) ─────────────────────────────────
  { symbol: "AMZN",  name: "Amazon.com Inc.",          sector: "Consumer Disc.",    sectorCode: "CONS", marketCap: "mega",  optionsLiquidity: "very_high", notes: "Cloud + retail, high earnings IV" },
  { symbol: "TSLA",  name: "Tesla Inc.",               sector: "Consumer Disc.",    sectorCode: "CONS", marketCap: "mega",  optionsLiquidity: "very_high", notes: "Highest retail options volume globally" },
  { symbol: "NFLX",  name: "Netflix Inc.",             sector: "Consumer Disc.",    sectorCode: "CONS", marketCap: "mega",  optionsLiquidity: "very_high", notes: "Streaming leader, high earnings moves" },
  { symbol: "HOOD",  name: "Robinhood Markets",        sector: "Consumer Disc.",    sectorCode: "CONS", marketCap: "mid",   optionsLiquidity: "high",      notes: "Fintech/retail trading platform" },
  { symbol: "SHOP",  name: "Shopify Inc.",             sector: "Consumer Disc.",    sectorCode: "CONS", marketCap: "large", optionsLiquidity: "high",      notes: "E-commerce platform, high IV" },

  // ── Communication Services (4) ───────────────────────────────────────────────
  { symbol: "GOOGL", name: "Alphabet Inc.",            sector: "Communication",     sectorCode: "COMM", marketCap: "mega",  optionsLiquidity: "very_high", notes: "Search/AI/cloud, liquid options" },
  { symbol: "DIS",   name: "Walt Disney Co.",          sector: "Communication",     sectorCode: "COMM", marketCap: "large", optionsLiquidity: "high",      notes: "Media/streaming, steady IV" },
  { symbol: "SNAP",  name: "Snap Inc.",                sector: "Communication",     sectorCode: "COMM", marketCap: "mid",   optionsLiquidity: "high",      notes: "High IV, active retail" },
  { symbol: "SPOT",  name: "Spotify Technology",       sector: "Communication",     sectorCode: "COMM", marketCap: "large", optionsLiquidity: "high",      notes: "Audio streaming, elevated IV" },

  // ── Financial Services (5) ───────────────────────────────────────────────────
  { symbol: "JPM",   name: "JPMorgan Chase",           sector: "Financials",        sectorCode: "FIN",  marketCap: "mega",  optionsLiquidity: "very_high", notes: "Largest US bank, liquid options" },
  { symbol: "GS",    name: "Goldman Sachs",            sector: "Financials",        sectorCode: "FIN",  marketCap: "large", optionsLiquidity: "high",      notes: "Investment banking, rate-sensitive" },
  { symbol: "SOFI",  name: "SoFi Technologies",        sector: "Financials",        sectorCode: "FIN",  marketCap: "mid",   optionsLiquidity: "high",      notes: "Fintech, high retail interest" },
  { symbol: "FAS",   name: "Direxion Fin. Bull 3X",    sector: "Financials",        sectorCode: "FIN",  marketCap: "large", optionsLiquidity: "high",      notes: "Leveraged financial ETF" },
  { symbol: "V",     name: "Visa Inc.",                sector: "Financials",        sectorCode: "FIN",  marketCap: "mega",  optionsLiquidity: "high",      notes: "Payments leader, stable premium" },

  // ── Healthcare & Biotech (5) ─────────────────────────────────────────────────
  { symbol: "UNH",   name: "UnitedHealth Group",       sector: "Healthcare",        sectorCode: "HLTH", marketCap: "mega",  optionsLiquidity: "high",      notes: "Managed care leader, high premium" },
  { symbol: "LLY",   name: "Eli Lilly & Co.",          sector: "Healthcare",        sectorCode: "HLTH", marketCap: "mega",  optionsLiquidity: "high",      notes: "GLP-1/obesity drugs, high IV" },
  { symbol: "MRNA",  name: "Moderna Inc.",             sector: "Healthcare",        sectorCode: "HLTH", marketCap: "large", optionsLiquidity: "very_high", notes: "Biotech, very high IV, active retail" },
  { symbol: "TEM",   name: "Tempus AI Inc.",           sector: "Healthcare",        sectorCode: "HLTH", marketCap: "mid",   optionsLiquidity: "high",      notes: "AI healthcare, elevated IV" },
  { symbol: "ABBV",  name: "AbbVie Inc.",              sector: "Healthcare",        sectorCode: "HLTH", marketCap: "mega",  optionsLiquidity: "high",      notes: "Pharma/biotech, dividend + premium" },

  // ── Energy (4) ───────────────────────────────────────────────────────────────
  { symbol: "XOM",   name: "Exxon Mobil Corp.",        sector: "Energy",            sectorCode: "ENRG", marketCap: "mega",  optionsLiquidity: "high",      notes: "Oil major, macro-driven IV" },
  { symbol: "CVX",   name: "Chevron Corp.",            sector: "Energy",            sectorCode: "ENRG", marketCap: "mega",  optionsLiquidity: "high",      notes: "Oil major, dividend + premium" },
  { symbol: "OXY",   name: "Occidental Petroleum",     sector: "Energy",            sectorCode: "ENRG", marketCap: "large", optionsLiquidity: "high",      notes: "Buffett-backed, active options" },
  { symbol: "BE",    name: "Bloom Energy Corp.",       sector: "Energy",            sectorCode: "ENRG", marketCap: "mid",   optionsLiquidity: "high",      notes: "Clean energy, high IV" },

  // ── Defense & Aerospace (4) ──────────────────────────────────────────────────
  { symbol: "LMT",   name: "Lockheed Martin",          sector: "Defense",           sectorCode: "DEF",  marketCap: "large", optionsLiquidity: "high",      notes: "Defense leader, VCP candidate" },
  { symbol: "NOC",   name: "Northrop Grumman",         sector: "Defense",           sectorCode: "DEF",  marketCap: "large", optionsLiquidity: "high",      notes: "Defense/space, steady premium" },
  { symbol: "RTX",   name: "RTX Corp. (Raytheon)",     sector: "Defense",           sectorCode: "DEF",  marketCap: "large", optionsLiquidity: "high",      notes: "Defense/aerospace, stable IV" },
  { symbol: "RKLB",  name: "Rocket Lab USA",           sector: "Defense",           sectorCode: "DEF",  marketCap: "mid",   optionsLiquidity: "high",      notes: "Space launch, high retail interest" },

  // ── Emerging Tech / Cyber (5) ────────────────────────────────────────────────
  { symbol: "ACHR",  name: "Archer Aviation",          sector: "Emerging Tech",     sectorCode: "EMRG", marketCap: "mid",   optionsLiquidity: "high",      notes: "eVTOL/air taxi, high IV" },
  { symbol: "ARKG",  name: "ARK Genomic Revolution",   sector: "Emerging Tech",     sectorCode: "EMRG", marketCap: "large", optionsLiquidity: "high",      notes: "Genomics ETF, high retail" },
  { symbol: "CRWD",  name: "CrowdStrike Holdings",     sector: "Emerging Tech",     sectorCode: "EMRG", marketCap: "large", optionsLiquidity: "high",      notes: "Cybersecurity leader, high IV" },
  { symbol: "PANW",  name: "Palo Alto Networks",       sector: "Emerging Tech",     sectorCode: "EMRG", marketCap: "large", optionsLiquidity: "high",      notes: "Cybersecurity platform, active options" },
  { symbol: "S",     name: "SentinelOne Inc.",         sector: "Emerging Tech",     sectorCode: "EMRG", marketCap: "large", optionsLiquidity: "high",      notes: "AI-native cybersecurity, elevated IV" },

  // ── Quantum & AI (7) ─────────────────────────────────────────────────────────
  { symbol: "IONQ",  name: "IonQ Inc.",                sector: "Quantum & AI",      sectorCode: "QMAI", marketCap: "mid",   optionsLiquidity: "high",      notes: "Largest pure-play quantum, very high IV" },
  { symbol: "RGTI",  name: "Rigetti Computing",        sector: "Quantum & AI",      sectorCode: "QMAI", marketCap: "mid",   optionsLiquidity: "high",      notes: "Superconducting quantum, speculative" },
  { symbol: "QUBT",  name: "Quantum Computing Inc.",   sector: "Quantum & AI",      sectorCode: "QMAI", marketCap: "mid",   optionsLiquidity: "high",      notes: "Photonic quantum, high retail interest" },
  { symbol: "QBTS",  name: "D-Wave Quantum",           sector: "Quantum & AI",      sectorCode: "QMAI", marketCap: "mid",   optionsLiquidity: "high",      notes: "Annealing quantum systems, active retail" },
  { symbol: "AI",    name: "C3.ai Inc.",               sector: "Quantum & AI",      sectorCode: "QMAI", marketCap: "mid",   optionsLiquidity: "high",      notes: "Enterprise AI software, high IV" },
  { symbol: "SOUN",  name: "SoundHound AI",            sector: "Quantum & AI",      sectorCode: "QMAI", marketCap: "mid",   optionsLiquidity: "high",      notes: "Voice AI, very high retail options volume" },
  { symbol: "BBAI",  name: "BigBear.ai Holdings",      sector: "Quantum & AI",      sectorCode: "QMAI", marketCap: "mid",   optionsLiquidity: "high",      notes: "AI analytics/defense, speculative" },

  // ── Broad Market ETFs (5) ────────────────────────────────────────────────────
  { symbol: "SPY",   name: "SPDR S&P 500 ETF",         sector: "ETF",               sectorCode: "ETF",  marketCap: "mega",  optionsLiquidity: "very_high", notes: "Most liquid options in the world" },
  { symbol: "QQQ",   name: "Invesco Nasdaq-100 ETF",   sector: "ETF",               sectorCode: "ETF",  marketCap: "mega",  optionsLiquidity: "very_high", notes: "Tech-heavy, very active options" },
  { symbol: "IWM",   name: "iShares Russell 2000 ETF", sector: "ETF",               sectorCode: "ETF",  marketCap: "large", optionsLiquidity: "very_high", notes: "Small-cap gauge, active options" },
  { symbol: "GLD",   name: "SPDR Gold Shares ETF",     sector: "ETF",               sectorCode: "ETF",  marketCap: "large", optionsLiquidity: "high",      notes: "Gold hedge, macro-driven" },
  { symbol: "TLT",   name: "iShares 20+ Yr Treasury",  sector: "ETF",               sectorCode: "ETF",  marketCap: "large", optionsLiquidity: "very_high", notes: "Rate-sensitive, high IV on Fed days" },
];

export const TICKER_SYMBOLS = TICKER_UNIVERSE.map(t => t.symbol);

export const SECTORS = Array.from(new Set(TICKER_UNIVERSE.map(t => t.sector)));

export const SECTOR_CODES = Array.from(new Set(TICKER_UNIVERSE.map(t => t.sectorCode)));

export function getTickersBySector(sectorCode: string): TickerInfo[] {
  return TICKER_UNIVERSE.filter(t => t.sectorCode === sectorCode);
}

export function getTickerInfo(symbol: string): TickerInfo | undefined {
  return TICKER_UNIVERSE.find(t => t.symbol === symbol.toUpperCase());
}
