/**
 * PitDesk Route Constants
 * ─────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH for all route paths.
 * Import from here in: Home.tsx, ActionLayout, DashboardLayout,
 * App.tsx, and any page that navigates programmatically.
 *
 * Never hardcode route strings anywhere else.
 */

// ── Action Hub Routes (no sidebar, ActionLayout) ──────────────
export const ROUTES = {
  HOME: "/",
  TICKER_ANALYSIS: "/ticker-analysis",
  DAY_PICKS: "/day-picks",
  SWING_PICKS: "/swing-picks",
  TRADE_UPLOAD: "/trade-upload",
  GLOSSARY: "/glossary",
  PIT_ADVISOR: "/pit-advisor",

  // ── Dashboard / Power Mode Routes (DashboardLayout sidebar) ──
  DASHBOARD: "/dashboard",
  PCR_DASHBOARD: "/pcr-dashboard",
  CHARTS: "/charts",
  SCAN_ALL: "/scan-all",
  ANALYZER: "/analyzer",
  WATCHLIST: "/watchlist",
  EARNINGS_CALENDAR: "/earnings-calendar",

  // Strategies
  PCR_STRATEGY: "/pcr-strategy",
  VCP_STRATEGY: "/vcp-strategy",
  VELEZ_SCANNER: "/velez-scanner",
  INTRADAY_SCANNER: "/intraday-scanner",
  CATALYST_WATCH: "/catalyst-watch",
  ORS: "/velez-scanner?tab=ors",

  // Alerts
  IVR_ALERTS: "/ivr-alerts",
  VCP_ALERTS: "/vcp-alerts",
  FIB_EMA_ALERTS: "/fib-ema-alerts",

  // Execution
  AI_AGENT: "/agent",
  PRE_MARKET: "/pre-market",
  MORNING_SESSION: "/morning-session",
  SWING_WATCHLIST: "/swing-watchlist",
  TRADE_LOG: "/trade-log",
  PERFORMANCE: "/performance",
  TRADE_PROPOSALS: "/trade-proposals",

  // Advanced
  LIQUIDITY_MAP: "/liquidity-map",
  OPTIONS_FLOW: "/options-flow",
  COT_DASHBOARD: "/cot-dashboard",
  BROKER_SETTINGS: "/broker-settings",

  // Education
  METHODOLOGY: "/methodology",
  HOW_TO: "/how-to",
} as const;

export type RouteKey = keyof typeof ROUTES;
export type RoutePath = (typeof ROUTES)[RouteKey];

/** Action hub cards shown on the Home page */
export const HOME_ACTIONS = [
  // ── Workflow 1: Find the Best Trade ──────────────────────────────────────
  {
    key: "ticker-analysis" as const,
    path: ROUTES.TICKER_ANALYSIS,
    label: "\uD83C\uDFAF Analyze a Ticker",
    description: "Type any ticker. Get the best options strategy, stock direction bias, IV environment, earnings risk — all in plain English.",
    color: "#22c55e",
    number: "01",
    workflow: "find",
  },
  {
    key: "day-picks" as const,
    path: ROUTES.DAY_PICKS,
    label: "\u26A1 Day Trading Picks",
    description: "Top 5 Grade-A intraday setups from your watchlist right now. Entry, stop, T1, T2 — ready to act.",
    color: "#f59e0b",
    number: "02",
    workflow: "find",
  },
  {
    key: "swing-picks" as const,
    path: ROUTES.SWING_PICKS,
    label: "\uD83D\uDCC8 Swing Picks",
    description: "Best 3\u201310 day setups — VCP, Velez, BCOS breakouts. Triple-confirmed with stage, R:R, and stop levels.",
    color: "#6366f1",
    number: "03",
    workflow: "find",
  },
  // ── Workflow 2: Test & Visualize Payout ──────────────────────────────────
  {
    key: "pit-advisor" as const,
    path: ROUTES.PIT_ADVISOR,
    label: "\uD83E\uDD16 Ask Pit Advisor",
    description: "Describe any trade idea. Get a plain-English verdict: good setup or bad, with specific entry/stop/target and risk.",
    color: "#8b5cf6",
    number: "04",
    workflow: "test",
  },
  {
    key: "trade-upload" as const,
    path: ROUTES.TRADE_UPLOAD,
    label: "\uD83D\uDCCA Analyze My Trades",
    description: "Upload your E*TRADE or Schwab CSV. See what\u2019s working, what\u2019s not, and where you\u2019re leaving money on the table.",
    color: "#ec4899",
    number: "05",
    workflow: "test",
  },
  {
    key: "glossary" as const,
    path: ROUTES.GLOSSARY,
    label: "\uD83D\uDCDA Glossary & Playbook",
    description: "Options terminology, PCR signal zones, Okala rules, Velez methodology, and Sri\u2019s personal strategy guide.",
    color: "#14b8a6",
    number: "06",
    workflow: "test",
  },
] as const;

/** Quick-access tools shown in ActionLayout "All Tools" dropdown */
export const ALL_TOOLS_MENU = [
  { label: "Analyze a Ticker", path: ROUTES.TICKER_ANALYSIS, group: "Actions" },
  { label: "Day Trading Picks", path: ROUTES.DAY_PICKS, group: "Actions" },
  { label: "Swing Trading Picks", path: ROUTES.SWING_PICKS, group: "Actions" },
  { label: "Ask Pit Advisor", path: ROUTES.PIT_ADVISOR, group: "Actions" },
  { label: "Analyze My Trades", path: ROUTES.TRADE_UPLOAD, group: "Actions" },
  { label: "Glossary", path: ROUTES.GLOSSARY, group: "Actions" },
  { label: "Options Analyzer", path: ROUTES.ANALYZER, group: "Power Tools" },
  { label: "PCR Dashboard", path: ROUTES.PCR_DASHBOARD, group: "Power Tools" },
  { label: "Velez Scanner", path: ROUTES.VELEZ_SCANNER, group: "Power Tools" },
  { label: "Intraday Scanner", path: ROUTES.INTRADAY_SCANNER, group: "Power Tools" },
  { label: "VCP Strategy", path: ROUTES.VCP_STRATEGY, group: "Power Tools" },
  { label: "Catalyst Watch", path: ROUTES.CATALYST_WATCH, group: "Power Tools" },
  { label: "Trade Log", path: ROUTES.TRADE_LOG, group: "Power Tools" },
  { label: "Pre-Market Checklist", path: ROUTES.PRE_MARKET, group: "Power Tools" },
  { label: "Morning Session", path: ROUTES.MORNING_SESSION, group: "Power Tools" },
  { label: "Swing Watchlist", path: ROUTES.SWING_WATCHLIST, group: "Power Tools" },
  { label: "Liquidity Map", path: ROUTES.LIQUIDITY_MAP, group: "Power Tools" },
  { label: "IVR Alerts", path: ROUTES.IVR_ALERTS, group: "Alerts" },
  { label: "VCP Alerts", path: ROUTES.VCP_ALERTS, group: "Alerts" },
  { label: "Full Dashboard", path: ROUTES.DASHBOARD, group: "Power Tools" },
] as const;
