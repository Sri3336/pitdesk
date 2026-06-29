/**
 * Dux Universe — Curated Small-Cap Watchlist for the Steven Dux 5-Filter Scanner
 *
 * Criteria for inclusion:
 * - Market cap < $1 billion (at time of curation)
 * - Float < 100 million shares
 * - Price > $1 (avoids sub-penny noise)
 * - High-volatility, momentum-driven names known to gap frequently
 *
 * Live filters applied at scan time:
 * - Up ≥ 20% for the day (change_percentage)
 * - Volume ≥ 1M shares in pre-market (approximated via current volume vs avg)
 * - Price > $3
 *
 * Static metadata (mktCapM = market cap in millions, floatM = float in millions)
 * is stored here because Tradier quotes API does not return fundamentals.
 */

export interface DuxTicker {
  symbol: string;
  name: string;
  mktCapM: number;   // Market cap in millions USD
  floatM: number;    // Float in millions shares
  sector: string;
}

export const DUX_UNIVERSE: DuxTicker[] = [
  // ── Biotech / Healthcare (excluded per Dux rule — shown but flagged) ──────────
  { symbol: "ACMR", name: "ACM Research", mktCapM: 420, floatM: 32, sector: "Semiconductor" },
  { symbol: "APLD", name: "Applied Digital", mktCapM: 650, floatM: 85, sector: "Tech" },
  { symbol: "ARQT", name: "Arcutis Biotherapeutics", mktCapM: 380, floatM: 55, sector: "Biotech" },
  { symbol: "ASTS", name: "AST SpaceMobile", mktCapM: 890, floatM: 78, sector: "Tech" },
  { symbol: "AVAV", name: "AeroVironment", mktCapM: 780, floatM: 22, sector: "Defense" },
  { symbol: "BBAI", name: "BigBear.ai", mktCapM: 320, floatM: 48, sector: "AI/Tech" },
  { symbol: "BFRI", name: "Biofrontera", mktCapM: 45, floatM: 12, sector: "Biotech" },
  { symbol: "BKKT", name: "Bakkt Holdings", mktCapM: 180, floatM: 35, sector: "Fintech" },
  { symbol: "CLOV", name: "Clover Health", mktCapM: 290, floatM: 62, sector: "Healthcare" },
  { symbol: "CLSK", name: "CleanSpark", mktCapM: 750, floatM: 88, sector: "Crypto Mining" },
  { symbol: "COHR", name: "Coherent Corp", mktCapM: 820, floatM: 70, sector: "Photonics" },
  { symbol: "COYA", name: "Coya Therapeutics", mktCapM: 65, floatM: 8, sector: "Biotech" },
  { symbol: "CRKN", name: "Crown Electrokinetics", mktCapM: 15, floatM: 5, sector: "Tech" },
  { symbol: "CTRM", name: "Castor Maritime", mktCapM: 55, floatM: 18, sector: "Shipping" },
  { symbol: "DRUG", name: "Bright Mountain Media", mktCapM: 20, floatM: 6, sector: "Media" },
  { symbol: "DWAC", name: "Digital World Acquisition", mktCapM: 420, floatM: 28, sector: "SPAC" },
  { symbol: "EBON", name: "Ebang International", mktCapM: 35, floatM: 10, sector: "Crypto Mining" },
  { symbol: "ENVX", name: "Enovix Corp", mktCapM: 680, floatM: 72, sector: "Battery Tech" },
  { symbol: "EVGO", name: "EVgo Inc", mktCapM: 450, floatM: 82, sector: "EV Infrastructure" },
  { symbol: "FFIE", name: "Faraday Future", mktCapM: 25, floatM: 15, sector: "EV" },
  { symbol: "FGEN", name: "FibroGen", mktCapM: 120, floatM: 45, sector: "Biotech" },
  { symbol: "GFAI", name: "Guardforce AI", mktCapM: 18, floatM: 7, sector: "AI/Robotics" },
  { symbol: "GIGA", name: "Giga-tronics", mktCapM: 12, floatM: 4, sector: "Defense" },
  { symbol: "GREE", name: "Greenidge Generation", mktCapM: 85, floatM: 22, sector: "Crypto Mining" },
  { symbol: "HIMS", name: "Hims & Hers Health", mktCapM: 920, floatM: 90, sector: "Telehealth" },
  { symbol: "HLBZ", name: "Helbiz Inc", mktCapM: 8, floatM: 3, sector: "Mobility" },
  { symbol: "HOLO", name: "MicroCloud Hologram", mktCapM: 28, floatM: 9, sector: "Holographic Tech" },
  { symbol: "HYMC", name: "Hycroft Mining", mktCapM: 42, floatM: 14, sector: "Mining" },
  { symbol: "IDEX", name: "Ideanomics", mktCapM: 35, floatM: 20, sector: "EV" },
  { symbol: "IMPP", name: "Imperial Petroleum", mktCapM: 55, floatM: 16, sector: "Shipping" },
  { symbol: "INPX", name: "Inpixon", mktCapM: 22, floatM: 8, sector: "Tech" },
  { symbol: "IONQ", name: "IonQ Inc", mktCapM: 850, floatM: 92, sector: "Quantum Computing" },
  { symbol: "ITRM", name: "Iterion Therapeutics", mktCapM: 18, floatM: 5, sector: "Biotech" },
  { symbol: "JAGX", name: "Jaguar Health", mktCapM: 12, floatM: 6, sector: "Biotech" },
  { symbol: "JMIA", name: "Jumia Technologies", mktCapM: 280, floatM: 55, sector: "E-Commerce" },
  { symbol: "KPLT", name: "Katapult Holdings", mktCapM: 45, floatM: 18, sector: "Fintech" },
  { symbol: "LIQT", name: "LiqTech International", mktCapM: 15, floatM: 7, sector: "Industrial" },
  { symbol: "LLAP", name: "Terran Orbital", mktCapM: 120, floatM: 38, sector: "Space Tech" },
  { symbol: "LMND", name: "Lemonade Inc", mktCapM: 780, floatM: 68, sector: "Insurtech" },
  { symbol: "LTRY", name: "Lottery.com", mktCapM: 8, floatM: 4, sector: "Gaming" },
  { symbol: "MARA", name: "Marathon Digital", mktCapM: 890, floatM: 95, sector: "Crypto Mining" },
  { symbol: "MBRX", name: "Moleculin Biotech", mktCapM: 22, floatM: 8, sector: "Biotech" },
  { symbol: "MDXG", name: "MiMedx Group", mktCapM: 380, floatM: 62, sector: "Biotech" },
  { symbol: "MEGL", name: "Magic Empire Global", mktCapM: 12, floatM: 3, sector: "Finance" },
  { symbol: "MFON", name: "Mobivity Holdings", mktCapM: 18, floatM: 6, sector: "MarTech" },
  { symbol: "MMAT", name: "Meta Materials", mktCapM: 35, floatM: 25, sector: "Materials" },
  { symbol: "MNMD", name: "Mind Medicine", mktCapM: 420, floatM: 72, sector: "Biotech" },
  { symbol: "MULN", name: "Mullen Automotive", mktCapM: 15, floatM: 12, sector: "EV" },
  { symbol: "NKLA", name: "Nikola Corp", mktCapM: 180, floatM: 45, sector: "EV Trucks" },
  { symbol: "NRXP", name: "NRx Pharmaceuticals", mktCapM: 25, floatM: 8, sector: "Biotech" },
  { symbol: "NVAX", name: "Novavax Inc", mktCapM: 620, floatM: 78, sector: "Biotech" },
  { symbol: "OCGN", name: "Ocugen Inc", mktCapM: 85, floatM: 32, sector: "Biotech" },
  { symbol: "OPEN", name: "Opendoor Technologies", mktCapM: 780, floatM: 88, sector: "Proptech" },
  { symbol: "OPAD", name: "Offerpad Solutions", mktCapM: 45, floatM: 15, sector: "Proptech" },
  { symbol: "ORMP", name: "Oramed Pharmaceuticals", mktCapM: 95, floatM: 28, sector: "Biotech" },
  { symbol: "PAYO", name: "Payoneer Global", mktCapM: 850, floatM: 90, sector: "Fintech" },
  { symbol: "PHUN", name: "Phunware Inc", mktCapM: 18, floatM: 7, sector: "Mobile Tech" },
  { symbol: "PRTY", name: "Party City", mktCapM: 35, floatM: 22, sector: "Retail" },
  { symbol: "PSTV", name: "Plus Therapeutics", mktCapM: 12, floatM: 5, sector: "Biotech" },
  { symbol: "RCAT", name: "Red Cat Holdings", mktCapM: 180, floatM: 38, sector: "Drones" },
  { symbol: "RDHL", name: "RedHill Biopharma", mktCapM: 15, floatM: 8, sector: "Biotech" },
  { symbol: "RGTI", name: "Rigetti Computing", mktCapM: 650, floatM: 85, sector: "Quantum Computing" },
  { symbol: "RIVN", name: "Rivian Automotive", mktCapM: 920, floatM: 92, sector: "EV" },
  { symbol: "RKLB", name: "Rocket Lab USA", mktCapM: 880, floatM: 88, sector: "Space Tech" },
  { symbol: "RNAZ", name: "TransCode Therapeutics", mktCapM: 8, floatM: 3, sector: "Biotech" },
  { symbol: "RVSN", name: "Rail Vision", mktCapM: 12, floatM: 4, sector: "Rail Tech" },
  { symbol: "SABS", name: "SAB Biotherapeutics", mktCapM: 35, floatM: 12, sector: "Biotech" },
  { symbol: "SAVA", name: "Cassava Sciences", mktCapM: 280, floatM: 35, sector: "Biotech" },
  { symbol: "SBEV", name: "Splash Beverage Group", mktCapM: 15, floatM: 8, sector: "Beverage" },
  { symbol: "SEEL", name: "Seelos Biosciences", mktCapM: 18, floatM: 6, sector: "Biotech" },
  { symbol: "SIGA", name: "SIGA Technologies", mktCapM: 380, floatM: 52, sector: "Biotech" },
  { symbol: "SLNA", name: "Selina Hospitality", mktCapM: 25, floatM: 10, sector: "Hospitality" },
  { symbol: "SNDL", name: "SNDL Inc", mktCapM: 180, floatM: 42, sector: "Cannabis" },
  { symbol: "SPCE", name: "Virgin Galactic", mktCapM: 120, floatM: 35, sector: "Space Tourism" },
  { symbol: "SPCX", name: "SPAC", mktCapM: 85, floatM: 20, sector: "SPAC" },
  { symbol: "SPRB", name: "Sprinklr Inc", mktCapM: 780, floatM: 82, sector: "SaaS" },
  { symbol: "SRRK", name: "Scholar Rock Holding", mktCapM: 320, floatM: 45, sector: "Biotech" },
  { symbol: "STSS", name: "Sharps Technology", mktCapM: 12, floatM: 5, sector: "MedTech" },
  { symbol: "SURF", name: "Surface Oncology", mktCapM: 85, floatM: 28, sector: "Biotech" },
  { symbol: "TBLT", name: "Toughbuilt Industries", mktCapM: 15, floatM: 8, sector: "Tools" },
  { symbol: "TPVG", name: "TriplePoint Venture", mktCapM: 320, floatM: 38, sector: "Finance" },
  { symbol: "TRNX", name: "Taronis Fuels", mktCapM: 8, floatM: 4, sector: "Energy" },
  { symbol: "TTOO", name: "T2 Biosystems", mktCapM: 18, floatM: 7, sector: "Biotech" },
  { symbol: "TPST", name: "Tempest Therapeutics", mktCapM: 22, floatM: 8, sector: "Biotech" },
  { symbol: "UAVS", name: "AgEagle Aerial Systems", mktCapM: 25, floatM: 10, sector: "Drones" },
  { symbol: "VBIV", name: "VBI Vaccines", mktCapM: 35, floatM: 15, sector: "Biotech" },
  { symbol: "VERB", name: "Verb Technology", mktCapM: 18, floatM: 8, sector: "SaaS" },
  { symbol: "VISL", name: "Vislink Technologies", mktCapM: 22, floatM: 9, sector: "Wireless" },
  { symbol: "VLDR", name: "Velodyne Lidar", mktCapM: 120, floatM: 35, sector: "Lidar" },
  { symbol: "VNET", name: "21Vianet Group", mktCapM: 680, floatM: 72, sector: "Data Centers" },
  { symbol: "VNRX", name: "VolitionRx", mktCapM: 12, floatM: 5, sector: "Biotech" },
  { symbol: "VVPR", name: "VivoPower International", mktCapM: 15, floatM: 6, sector: "EV" },
  { symbol: "WKHS", name: "Workhorse Group", mktCapM: 85, floatM: 28, sector: "EV" },
  { symbol: "XELA", name: "Exela Technologies", mktCapM: 35, floatM: 18, sector: "BPO" },
  { symbol: "XERS", name: "Xeris Biopharma", mktCapM: 120, floatM: 38, sector: "Biotech" },
  { symbol: "XPEV", name: "XPeng Inc", mktCapM: 920, floatM: 88, sector: "EV" },
  { symbol: "XTIA", name: "XTI Aerospace", mktCapM: 12, floatM: 5, sector: "Aerospace" },
  { symbol: "YMAB", name: "Y-mAbs Therapeutics", mktCapM: 180, floatM: 28, sector: "Biotech" },
  { symbol: "ZAPP", name: "Zapp Electric Vehicles", mktCapM: 18, floatM: 7, sector: "EV" },
  { symbol: "ZEST", name: "Yunji Inc", mktCapM: 25, floatM: 10, sector: "E-Commerce" },
  { symbol: "ZEV", name: "Lightning eMotors", mktCapM: 12, floatM: 5, sector: "EV" },
  { symbol: "ZKIN", name: "ZK International Group", mktCapM: 15, floatM: 6, sector: "Industrial" },
  { symbol: "ZLAB", name: "Zymeworks Inc", mktCapM: 780, floatM: 75, sector: "Biotech" },
];

// Biotech tickers flagged per Dux rule (avoid trading biotech)
export const BIOTECH_BLACKLIST = new Set(
  DUX_UNIVERSE.filter(t => t.sector === "Biotech").map(t => t.symbol)
);

export const DUX_UNIVERSE_SYMBOLS = DUX_UNIVERSE.map(t => t.symbol);
