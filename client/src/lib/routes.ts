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
  TRADE_LOG: "/trade-log",
  PERFORMANCE: "/performance",
  TRADE_PROPOSALS: "/trade-proposals",

  // Advanced
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
  {
    key: "ticker-analysis" as const,
    path: ROUTES.TICKER_ANALYSIS,
    label: "Analyze a Ticker",
    description: "Full chart analysis, options strategy recommendation, entry & exit levels across all 5 dimensions.",
    color: "#22c55e",
    number: "01",
  },
  {
    key: "day-picks" as const,
    path: ROUTES.DAY_PICKS,
    label: "Day Trading Picks",
    description: "Apply all strategies across our watchlist. Get the top 5 Grade-A intraday setups for today.",
    color: "#f59e0b",
    number: "02",
  },
  {
    key: "swing-picks" as const,
    path: ROUTES.SWING_PICKS,
    label: "Swing Trading Picks",
    description: "Multi-day setups — VCP, Velez signals, BCOS breakouts. Best tickers for the next 3–10 days.",
    color: "#6366f1",
    number: "03",
  },
  {
    key: "trade-upload" as const,
    path: ROUTES.TRADE_UPLOAD,
    label: "Analyze My Trades",
    description: "Upload your brokerage CSV or paste trade data. Get a full breakdown of performance and strategy gaps.",
    color: "#ec4899",
    number: "04",
  },
  {
    key: "glossary" as const,
    path: ROUTES.GLOSSARY,
    label: "Glossary & Education",
    description: "Options terminology, strategy playbooks, PCR signal zones, Okala rules, and Velez methodology.",
    color: "#14b8a6",
    number: "05",
  },
  {
    key: "pit-advisor" as const,
    path: ROUTES.PIT_ADVISOR,
    label: "Ask Pit Advisor",
    description: "Your AI trading buddy. Challenge setups, get entry/stop/target plans, and analyze any trade idea.",
    color: "#8b5cf6",
    number: "06",
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
  { label: "IVR Alerts", path: ROUTES.IVR_ALERTS, group: "Alerts" },
  { label: "VCP Alerts", path: ROUTES.VCP_ALERTS, group: "Alerts" },
  { label: "Full Dashboard", path: ROUTES.DASHBOARD, group: "Power Tools" },
] as const;
