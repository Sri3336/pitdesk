import {
  bigint,
  boolean,
  char,
  decimal,
  float,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  tinyint,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }), // nullable — legacy Manus OAuth, kept for backward compat
  name: text("name"),
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("passwordHash", { length: 255 }), // null for Google-only users
  googleId: varchar("googleId", { length: 255 }),          // null for email/password-only users
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Password reset tokens
export const passwordResetTokens = mysqlTable("password_reset_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

// Manual trade log
export const manualTrades = mysqlTable("manual_trades", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  ticker: varchar("ticker", { length: 20 }).notNull(),
  strategyType: varchar("strategyType", { length: 64 }).default("other").notNull(),
  account: varchar("account", { length: 32 }).default("other").notNull(),
  entryDate: varchar("entryDate", { length: 10 }),
  entryTime: varchar("entryTime", { length: 5 }), // HH:MM in ET (e.g. "09:35")
  entryPrice: decimal("entryPrice", { precision: 12, scale: 4 }),
  quantity: int("quantity").default(1).notNull(),
  exitDate: varchar("exitDate", { length: 10 }),
  exitPrice: decimal("exitPrice", { precision: 12, scale: 4 }),
  targetPrice: decimal("targetPrice", { precision: 12, scale: 4 }),
  stopPrice: decimal("stopPrice", { precision: 12, scale: 4 }),
  maxLoss: decimal("maxLoss", { precision: 12, scale: 4 }),
  maxProfit: decimal("maxProfit", { precision: 12, scale: 4 }),
  expiryDate: varchar("expiryDate", { length: 10 }),
  realizedPnl: decimal("realizedPnl", { precision: 12, scale: 4 }),
  realizedPnlPct: decimal("realizedPnlPct", { precision: 8, scale: 4 }),
  status: mysqlEnum("status", ["open", "closed", "cancelled"]).default("open").notNull(),
  source: varchar("source", { length: 32 }).default("manual").notNull(),
  notes: varchar("notes", { length: 512 }),
  postTradeNotes: varchar("postTradeNotes", { length: 1024 }),
  lessonsLearned: varchar("lessonsLearned", { length: 512 }),
  tags: varchar("tags", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ManualTrade = typeof manualTrades.$inferSelect;
export type InsertManualTrade = typeof manualTrades.$inferInsert;

// Fib + EMA confluence alert configurations
export const fibEmaAlerts = mysqlTable("fib_ema_alerts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  ticker: varchar("ticker", { length: 16 }).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  proximityPct: float("proximityPct").default(1.0).notNull(), // % threshold for confluence
  fibLevels: json("fibLevels").$type<number[]>().default([38.2, 61.8]), // which fib levels to watch
  emaPeriods: json("emaPeriods").$type<number[]>().default([9, 20, 50, 200]),
  emailEnabled: boolean("emailEnabled").default(true).notNull(),
  pushEnabled: boolean("pushEnabled").default(true).notNull(),
  lastTriggeredAt: timestamp("lastTriggeredAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FibEmaAlert = typeof fibEmaAlerts.$inferSelect;
export type InsertFibEmaAlert = typeof fibEmaAlerts.$inferInsert;

// Fib + EMA confluence scan results / alert history
export const fibEmaAlertHistory = mysqlTable("fib_ema_alert_history", {
  id: int("id").autoincrement().primaryKey(),
  ticker: varchar("ticker", { length: 16 }).notNull(),
  currentPrice: decimal("currentPrice", { precision: 12, scale: 4 }),
  swingHigh: decimal("swingHigh", { precision: 12, scale: 4 }),
  swingLow: decimal("swingLow", { precision: 12, scale: 4 }),
  fibLevel: float("fibLevel"), // e.g. 38.2
  fibPrice: decimal("fibPrice", { precision: 12, scale: 4 }),
  emaPeriod: int("emaPeriod"), // e.g. 50
  emaPrice: decimal("emaPrice", { precision: 12, scale: 4 }),
  proximityPct: float("proximityPct"),
  notifiedEmail: boolean("notifiedEmail").default(false),
  notifiedPush: boolean("notifiedPush").default(false),
  scannedAt: timestamp("scannedAt").defaultNow().notNull(),
});

export type FibEmaAlertHistory = typeof fibEmaAlertHistory.$inferSelect;

// Intraday scanner scan results (history + dedup for A-grade email alerts)
export const intradayScanResults = mysqlTable("intraday_scan_results", {
  id: int("id").autoincrement().primaryKey(),
  ticker: varchar("ticker", { length: 20 }).notNull(),
  scannedAt: timestamp("scannedAt").defaultNow().notNull(),
  grade: mysqlEnum("grade", ["A", "B", "C", "none"]).notNull(),
  direction: mysqlEnum("direction", ["bullish", "bearish", "neutral"]).notNull(),
  weightedScore: decimal("weightedScore", { precision: 6, scale: 2 }).notNull(),
  maxScore: decimal("maxScore", { precision: 6, scale: 2 }).notNull(),
  price: decimal("price", { precision: 12, scale: 4 }).notNull(),
  vwap: decimal("vwap", { precision: 12, scale: 4 }),
  rvol: decimal("rvol", { precision: 6, scale: 2 }),
  rsi: decimal("rsi", { precision: 6, scale: 2 }),
  atr: decimal("atr", { precision: 12, scale: 4 }),
  entryLow: decimal("entryLow", { precision: 12, scale: 4 }),
  entryHigh: decimal("entryHigh", { precision: 12, scale: 4 }),
  stopLevel: decimal("stopLevel", { precision: 12, scale: 4 }),
  target1: decimal("target1", { precision: 12, scale: 4 }),
  target2: decimal("target2", { precision: 12, scale: 4 }),
  criteriaJson: text("criteriaJson").notNull(),
  trapDetected: boolean("trapDetected").default(false).notNull(),
  trapType: varchar("trapType", { length: 64 }),
  trapDetails: varchar("trapDetails", { length: 256 }),
  optionStrategy: varchar("optionStrategy", { length: 64 }),
  optionStrike: decimal("optionStrike", { precision: 12, scale: 4 }),
  optionExpiry: varchar("optionExpiry", { length: 12 }),
  optionDebit: decimal("optionDebit", { precision: 8, scale: 2 }),
  optionMaxProfit: decimal("optionMaxProfit", { precision: 8, scale: 2 }),
  optionMaxLoss: decimal("optionMaxLoss", { precision: 8, scale: 2 }),
  alertSent: boolean("alertSent").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type IntradayScanResult = typeof intradayScanResults.$inferSelect;
export type InsertIntradayScanResult = typeof intradayScanResults.$inferInsert;

// Options Strategy Analyzer — saved analysis runs
export const analysisRuns = mysqlTable("analysis_runs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  ticker: varchar("ticker", { length: 16 }).notNull(),
  analysisJson: text("analysis_json").notNull(), // full AnalysisResult serialized
  topStrategy: varchar("top_strategy", { length: 64 }),
  score: decimal("score", { precision: 5, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AnalysisRun = typeof analysisRuns.$inferSelect;
export type InsertAnalysisRun = typeof analysisRuns.$inferInsert;

// PCR OI baseline snapshots (EOD capture)
export const pcrOiSnapshots = mysqlTable("pcr_oi_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  ticker: varchar("ticker", { length: 20 }).notNull(),
  snapshotDate: varchar("snapshotDate", { length: 10 }).notNull(), // YYYY-MM-DD
  totalPutOI: int("totalPutOI").notNull().default(0),
  totalCallOI: int("totalCallOI").notNull().default(0),
  totalPutVolume: int("totalPutVolume").notNull().default(0),
  totalCallVolume: int("totalCallVolume").notNull().default(0),
  pcrVolume: decimal("pcrVolume", { precision: 8, scale: 4 }).notNull().default("0"),
  pcrOI: decimal("pcrOI", { precision: 8, scale: 4 }).notNull().default("0"),
  closingPrice: decimal("closingPrice", { precision: 12, scale: 4 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  uniqSnapshot: uniqueIndex("uniq_pcr_snapshot").on(t.ticker, t.snapshotDate),
}));
export type PcrOiSnapshot = typeof pcrOiSnapshots.$inferSelect;
export type InsertPcrOiSnapshot = typeof pcrOiSnapshots.$inferInsert;

// PCR scheduled scan results (intraday PCR with delta vs prior EOD)
export const pcrScheduledResults = mysqlTable("pcr_scheduled_results", {
  id: int("id").autoincrement().primaryKey(),
  runDate: varchar("runDate", { length: 10 }).notNull(),
  runType: mysqlEnum("runType", ["eod_snapshot", "intraday_scan"]).notNull(),
  ticker: varchar("ticker", { length: 20 }).notNull(),
  pcr: decimal("pcr", { precision: 8, scale: 4 }).notNull().default("0"),
  pcrOI: decimal("pcrOI", { precision: 8, scale: 4 }).notNull().default("0"),
  coiDelta: decimal("coiDelta", { precision: 10, scale: 4 }).default("0"),
  coiPctChange: decimal("coiPctChange", { precision: 8, scale: 4 }).default("0"),
  signal: varchar("signal", { length: 20 }).notNull().default("NEUTRAL"),
  signalStrength: int("signalStrength").notNull().default(0),
  recommendation: varchar("recommendation", { length: 256 }).notNull().default(""),
  strategyHint: varchar("strategyHint", { length: 64 }).notNull().default(""),
  totalPutVolume: int("totalPutVolume").notNull().default(0),
  totalCallVolume: int("totalCallVolume").notNull().default(0),
  ivSkew: decimal("ivSkew", { precision: 6, scale: 2 }).default("0"),
  pcrDeltaVsPrior: decimal("pcrDeltaVsPrior", { precision: 8, scale: 4 }),
  priorSignal: varchar("priorSignal", { length: 20 }),
  // COI imbalance fields (populated when Tradier API key is set)
  coiCallPct: decimal("coiCallPct", { precision: 6, scale: 2 }).default("50"),
  coiPutPct: decimal("coiPutPct", { precision: 6, scale: 2 }).default("50"),
  coiImbalancePct: decimal("coiImbalancePct", { precision: 6, scale: 2 }).default("0"),
  coiSignal: varchar("coiSignal", { length: 20 }).default("NEUTRAL"),
  atmStrike: decimal("atmStrike", { precision: 10, scale: 2 }).default("0"),
  isExpiryDay: boolean("isExpiryDay").default(false),
  isExpiryEve: boolean("isExpiryEve").default(false),
  atmCallDelta: decimal("atmCallDelta", { precision: 6, scale: 4 }),
  atmPutDelta: decimal("atmPutDelta", { precision: 6, scale: 4 }),
  expiration: varchar("expiration", { length: 12 }).default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  uniqResult: uniqueIndex("uniq_pcr_result").on(t.ticker, t.runDate, t.runType),
}));
export type PcrScheduledResult = typeof pcrScheduledResults.$inferSelect;
export type InsertPcrScheduledResult = typeof pcrScheduledResults.$inferInsert;

// PCR alert settings per ticker
export const pcrAlertSettings = mysqlTable("pcr_alert_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  ticker: varchar("ticker", { length: 20 }).notNull(),
  alertOnFear: boolean("alertOnFear").default(true).notNull(),
  alertOnGreed: boolean("alertOnGreed").default(true).notNull(),
  alertOnExtremeFear: boolean("alertOnExtremeFear").default(true).notNull(),
  alertOnExtremeGreed: boolean("alertOnExtremeGreed").default(true).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uniqUserTicker: uniqueIndex("uniq_pcr_alert").on(t.userId, t.ticker),
}));
export type PcrAlertSetting = typeof pcrAlertSettings.$inferSelect;
export type InsertPcrAlertSetting = typeof pcrAlertSettings.$inferInsert;

// Intraday scan outcomes (for self-learning scorer)
export const scanOutcomes = mysqlTable("scan_outcomes", {
  id: int("id").autoincrement().primaryKey(),
  scanResultId: int("scanResultId").notNull(),
  ticker: varchar("ticker", { length: 20 }).notNull(),
  grade: mysqlEnum("grade", ["A", "B", "C", "none"]).notNull(),
  direction: mysqlEnum("direction", ["bullish", "bearish", "neutral"]).notNull(),
  entryPrice: decimal("entryPrice", { precision: 12, scale: 4 }),
  exitPrice: decimal("exitPrice", { precision: 12, scale: 4 }),
  hitTarget1: boolean("hitTarget1").default(false).notNull(),
  hitTarget2: boolean("hitTarget2").default(false).notNull(),
  hitStop: boolean("hitStop").default(false).notNull(),
  outcome: mysqlEnum("outcome", ["win", "loss", "neutral", "pending"]).default("pending").notNull(),
  pnlPct: decimal("pnlPct", { precision: 8, scale: 4 }),
  evaluatedAt: timestamp("evaluatedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ScanOutcome = typeof scanOutcomes.$inferSelect;
export type InsertScanOutcome = typeof scanOutcomes.$inferInsert;

// Intraday scorer criteria weights (DB-backed, tunable per user)
export const criteriaWeights = mysqlTable("criteria_weights", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  criterionName: varchar("criterion_name", { length: 64 }).notNull(),
  weight: decimal("weight", { precision: 5, scale: 3 }).notNull().default("1.000"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CriteriaWeight = typeof criteriaWeights.$inferSelect;
export type InsertCriteriaWeight = typeof criteriaWeights.$inferInsert;

// Tracked recommendations (auto-saved from analysis runs + PCR recommendations)
export const trackedRecommendations = mysqlTable("tracked_recommendations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  analysisRunId: int("analysisRunId"),
  ticker: varchar("ticker", { length: 20 }).notNull(),
  strategy: varchar("strategy", { length: 64 }).notNull(),
  targetDte: int("targetDte").notNull(),
  entryDate: timestamp("entryDate").defaultNow().notNull(),
  expiryDate: timestamp("expiryDate").notNull(),
  entryPrice: decimal("entryPrice", { precision: 12, scale: 4 }).notNull(),
  netCredit: decimal("netCredit", { precision: 10, scale: 4 }).notNull(),
  maxProfit: decimal("maxProfit", { precision: 10, scale: 4 }),
  maxLoss: decimal("maxLoss", { precision: 10, scale: 4 }),
  breakevens: text("breakevens").notNull(),
  legsJson: text("legsJson").notNull(),
  compositeScore: decimal("compositeScore", { precision: 6, scale: 2 }).notNull(),
  pop: decimal("pop", { precision: 6, scale: 4 }).notNull(),
  bpRequired: decimal("bpRequired", { precision: 12, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["open", "resolved", "expired"]).default("open").notNull(),
  exitPrice: decimal("exitPrice", { precision: 12, scale: 4 }),
  actualPnl: decimal("actualPnl", { precision: 10, scale: 4 }),
  actualPnlPct: decimal("actualPnlPct", { precision: 8, scale: 4 }),
  outcome: mysqlEnum("outcome", ["win", "loss", "breakeven"]),
  resolvedAt: timestamp("resolvedAt"),
  notes: varchar("notes", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  uniqEntry: uniqueIndex("uniq_tracked_entry").on(t.userId, t.ticker, t.expiryDate, t.strategy),
}));
export type TrackedRecommendation = typeof trackedRecommendations.$inferSelect;
export type InsertTrackedRecommendation = typeof trackedRecommendations.$inferInsert;

// ─── Watchlist ────────────────────────────────────────────────────────────────
export const watchlist = mysqlTable("watchlist", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  ticker: varchar("ticker", { length: 20 }).notNull(),
  notes: varchar("notes", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  uniqWatch: uniqueIndex("uniq_watchlist").on(t.userId, t.ticker),
}));
export type Watchlist = typeof watchlist.$inferSelect;
export type InsertWatchlist = typeof watchlist.$inferInsert;

// ─── IVR Alerts ───────────────────────────────────────────────────────────────
export const ivrAlerts = mysqlTable("ivr_alerts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  ticker: varchar("ticker", { length: 20 }).notNull(),
  condition: mysqlEnum("condition", ["above", "below"]).notNull(),
  threshold: decimal("threshold", { precision: 5, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["active", "triggered", "paused"]).default("active").notNull(),
  lastCheckedAt: timestamp("lastCheckedAt"),
  lastTriggeredAt: timestamp("lastTriggeredAt"),
  lastIvr: decimal("lastIvr", { precision: 5, scale: 2 }),
  notes: varchar("notes", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  uniqAlert: uniqueIndex("uniq_ivr_alert").on(t.userId, t.ticker, t.condition, t.threshold),
}));
export type IvrAlert = typeof ivrAlerts.$inferSelect;
export type InsertIvrAlert = typeof ivrAlerts.$inferInsert;

// ─── Broker Connections ───────────────────────────────────────────────────────
export const brokerConnections = mysqlTable("broker_connections", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  broker: mysqlEnum("broker", ["schwab", "etrade"]).notNull(),
  accessToken: text("accessToken").notNull(),
  refreshToken: text("refreshToken"),
  tokenExpiry: timestamp("tokenExpiry"),
  accountId: varchar("accountId", { length: 64 }),
  accountLabel: varchar("accountLabel", { length: 128 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uniqBroker: uniqueIndex("uniq_broker_connection").on(t.userId, t.broker),
}));
export type BrokerConnection = typeof brokerConnections.$inferSelect;
export type InsertBrokerConnection = typeof brokerConnections.$inferInsert;

// ─── Agent Runs ───────────────────────────────────────────────────────────────
export const agentRuns = mysqlTable("agent_runs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  triggeredBy: mysqlEnum("triggeredBy", ["schedule", "manual"]).notNull(),
  status: mysqlEnum("status", ["running", "completed", "failed"]).default("running").notNull(),
  tickersScanned: text("tickersScanned"),
  proposalsGenerated: int("proposalsGenerated").default(0).notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});
export type AgentRun = typeof agentRuns.$inferSelect;
export type InsertAgentRun = typeof agentRuns.$inferInsert;

// ─── Trade Proposals ──────────────────────────────────────────────────────────
export const tradeProposals = mysqlTable("trade_proposals", {
  id: int("id").autoincrement().primaryKey(),
  agentRunId: int("agentRunId"),
  userId: int("userId").notNull(),
  ticker: varchar("ticker", { length: 20 }).notNull(),
  strategy: varchar("strategy", { length: 64 }).notNull(),
  legsJson: text("legsJson").notNull(),
  underlyingPrice: decimal("underlyingPrice", { precision: 12, scale: 4 }).notNull(),
  netCredit: decimal("netCredit", { precision: 10, scale: 4 }).notNull(),
  maxProfit: decimal("maxProfit", { precision: 10, scale: 4 }).notNull(),
  maxLoss: decimal("maxLoss", { precision: 10, scale: 4 }).notNull(),
  breakeven: decimal("breakeven", { precision: 12, scale: 4 }).notNull(),
  pop: decimal("pop", { precision: 6, scale: 4 }).notNull(),
  contracts: int("contracts").notNull(),
  bpRequired: decimal("bpRequired", { precision: 12, scale: 2 }).notNull(),
  compositeScore: decimal("compositeScore", { precision: 6, scale: 2 }).notNull(),
  expiryDate: timestamp("expiryDate").notNull(),
  targetDte: int("targetDte").notNull(),
  broker: mysqlEnum("broker", ["schwab", "etrade"]),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "executed", "failed"]).default("pending").notNull(),
  rejectionReason: varchar("rejectionReason", { length: 256 }),
  executedAt: timestamp("executedAt"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TradeProposal = typeof tradeProposals.$inferSelect;
export type InsertTradeProposal = typeof tradeProposals.$inferInsert;

// ─── Trade Log (Agent-executed trades) ───────────────────────────────────────
export const tradeLog = mysqlTable("trade_log", {
  id: int("id").autoincrement().primaryKey(),
  proposalId: int("proposalId").notNull(),
  userId: int("userId").notNull(),
  broker: mysqlEnum("broker", ["schwab", "etrade"]).notNull(),
  brokerOrderId: varchar("brokerOrderId", { length: 128 }),
  ticker: varchar("ticker", { length: 20 }).notNull(),
  strategy: varchar("strategy", { length: 64 }).notNull(),
  legsJson: text("legsJson").notNull(),
  contracts: int("contracts").notNull(),
  fillPrice: decimal("fillPrice", { precision: 10, scale: 4 }),
  maxLoss: decimal("maxLoss", { precision: 10, scale: 4 }).notNull(),
  status: mysqlEnum("status", ["open", "closed", "expired"]).default("open").notNull(),
  closedAt: timestamp("closedAt"),
  closeFillPrice: decimal("closeFillPrice", { precision: 10, scale: 4 }),
  realizedPnl: decimal("realizedPnl", { precision: 10, scale: 4 }),
  executedAt: timestamp("executedAt").defaultNow(),
  closedPnl: decimal("closedPnl", { precision: 10, scale: 4 }),
  notes: varchar("notes", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TradeLogEntry = typeof tradeLog.$inferSelect;
export type InsertTradeLogEntry = typeof tradeLog.$inferInsert;

// ─── VCP Alerts ───────────────────────────────────────────────────────────────
export const vcpAlerts = mysqlTable("vcp_alerts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  ticker: varchar("ticker", { length: 20 }).notNull(),
  proximityPct: decimal("proximityPct", { precision: 5, scale: 2 }).notNull().default("3.00"),
  status: mysqlEnum("status", ["active", "triggered", "paused"]).default("active").notNull(),
  lastCheckedAt: timestamp("lastCheckedAt"),
  lastTriggeredAt: timestamp("lastTriggeredAt"),
  lastDistancePct: decimal("lastDistancePct", { precision: 6, scale: 2 }),
  notes: varchar("notes", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  uniqVcpAlert: uniqueIndex("uniq_vcp_alert").on(t.userId, t.ticker),
}));
export type VcpAlert = typeof vcpAlerts.$inferSelect;
export type InsertVcpAlert = typeof vcpAlerts.$inferInsert;

// ─── Catalyst Breakout Watch ──────────────────────────────────────────────────
export const catalystBreakoutWatch = mysqlTable("catalyst_breakout_watch", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  ticker: varchar("ticker", { length: 20 }).notNull(),
  keyLevel: decimal("keyLevel", { precision: 12, scale: 4 }).notNull(),
  direction: mysqlEnum("direction", ["resistance", "support"]).notNull(),
  levelLabel: varchar("levelLabel", { length: 100 }),
  daysTested: int("daysTested").default(0),
  touches: int("touches").default(0),
  nextEarningsDate: varchar("nextEarningsDate", { length: 10 }),
  catalystNotes: varchar("catalystNotes", { length: 256 }),
  status: mysqlEnum("status", ["watching", "near_break", "broken_out", "broken_down", "invalidated"]).default("watching").notNull(),
  lastPrice: decimal("lastPrice", { precision: 12, scale: 4 }),
  distancePct: decimal("distancePct", { precision: 8, scale: 4 }),
  volumeRatio: decimal("volumeRatio", { precision: 8, scale: 4 }),
  lastScannedAt: timestamp("lastScannedAt"),
  notes: varchar("notes", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CatalystBreakoutWatchEntry = typeof catalystBreakoutWatch.$inferSelect;
export type InsertCatalystBreakoutWatch = typeof catalystBreakoutWatch.$inferInsert;

// ─── COT Threshold Alerts ─────────────────────────────────────────────────────
export const cotAlerts = mysqlTable("cot_alerts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  instrumentId: varchar("instrumentId", { length: 50 }).notNull(),
  instrumentName: varchar("instrumentName", { length: 100 }).notNull(),
  condition: mysqlEnum("condition", ["above", "below"]).notNull(),
  threshold: int("threshold").notNull(),
  status: mysqlEnum("status", ["active", "paused", "triggered"]).default("active").notNull(),
  lastCotIndex: int("lastCotIndex"),
  lastTriggeredAt: timestamp("lastTriggeredAt"),
  notes: varchar("notes", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CotAlert = typeof cotAlerts.$inferSelect;
export type InsertCotAlert = typeof cotAlerts.$inferInsert;

// ─── Trade Upload (CSV import + community insights) ───────────────────────────
export const tradeUploadBatches = mysqlTable("trade_upload_batches", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  rowCount: int("rowCount").notNull().default(0),
  source: varchar("source", { length: 64 }).default("csv"), // "csv" | "etrade" | "schwab"
  status: mysqlEnum("status", ["pending", "processed", "failed"]).default("processed").notNull(),
  accountId: varchar("accountId", { length: 32 }),   // e.g. "etrade-4723"
  accountLabel: varchar("accountLabel", { length: 64 }), // e.g. "E*TRADE -4723"
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TradeUploadBatch = typeof tradeUploadBatches.$inferSelect;
export type InsertTradeUploadBatch = typeof tradeUploadBatches.$inferInsert;

export const uploadedTrades = mysqlTable("uploaded_trades", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  batchId: int("batchId").notNull(),
  ticker: varchar("ticker", { length: 20 }).notNull(),
  tradeDate: varchar("tradeDate", { length: 10 }).notNull(), // YYYY-MM-DD
  side: mysqlEnum("side", ["BUY", "SELL", "LONG", "SHORT"]).notNull(),
  qty: decimal("qty", { precision: 12, scale: 4 }).notNull(),
  entryPrice: decimal("entryPrice", { precision: 12, scale: 4 }).notNull(),
  exitPrice: decimal("exitPrice", { precision: 12, scale: 4 }),
  pnl: decimal("pnl", { precision: 12, scale: 4 }),
  pnlPct: decimal("pnlPct", { precision: 8, scale: 4 }),
  strategy: varchar("strategy", { length: 64 }),
  assetType: mysqlEnum("assetType", ["stock", "option", "etf", "other"]).default("stock").notNull(),
  notes: varchar("notes", { length: 512 }),
  isWin: boolean("isWin"),
  accountId: varchar("accountId", { length: 32 }),   // e.g. "etrade-4723"
  accountLabel: varchar("accountLabel", { length: 64 }), // e.g. "E*TRADE -4723"
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type UploadedTrade = typeof uploadedTrades.$inferSelect;
export type InsertUploadedTrade = typeof uploadedTrades.$inferInsert;

// ─── Positions (current holdings per account) ─────────────────────────────────
export const positionBatches = mysqlTable("position_batches", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  rowCount: int("rowCount").notNull().default(0),
  accountId: varchar("accountId", { length: 32 }).notNull(),
  accountLabel: varchar("accountLabel", { length: 64 }).notNull(),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
});
export type PositionBatch = typeof positionBatches.$inferSelect;
export type InsertPositionBatch = typeof positionBatches.$inferInsert;

export const positions = mysqlTable("positions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  batchId: int("batchId").notNull(),
  accountId: varchar("accountId", { length: 32 }).notNull(),
  accountLabel: varchar("accountLabel", { length: 64 }).notNull(),
  ticker: varchar("ticker", { length: 20 }).notNull(),
  qty: decimal("qty", { precision: 12, scale: 4 }).notNull(),
  avgCost: decimal("avgCost", { precision: 12, scale: 4 }),
  currentPrice: decimal("currentPrice", { precision: 12, scale: 4 }),
  marketValue: decimal("marketValue", { precision: 14, scale: 4 }),
  unrealizedPnl: decimal("unrealizedPnl", { precision: 14, scale: 4 }),
  unrealizedPnlPct: decimal("unrealizedPnlPct", { precision: 8, scale: 4 }),
  assetType: mysqlEnum("assetType", ["stock", "option", "etf", "other"]).default("stock").notNull(),
  notes: varchar("notes", { length: 512 }),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
});
export type Position = typeof positions.$inferSelect;
export type InsertPosition = typeof positions.$inferInsert;

// ─── Pre-Market Checklist ─────────────────────────────────────────────────────
export const preMarketChecklistItems = mysqlTable("pre_market_checklist_items", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  date: varchar("date", { length: 10 }).notNull(),       // YYYY-MM-DD
  itemKey: varchar("itemKey", { length: 64 }).notNull(), // e.g. "market_bias"
  label: varchar("label", { length: 128 }).notNull(),
  completed: boolean("completed").default(false).notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PreMarketChecklistItem = typeof preMarketChecklistItems.$inferSelect;
export type InsertPreMarketChecklistItem = typeof preMarketChecklistItems.$inferInsert;

// ─── Drawdown Settings ────────────────────────────────────────────────────────
export const drawdownSettings = mysqlTable("drawdown_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  maxDrawdownPct: decimal("maxDrawdownPct", { precision: 6, scale: 2 }).default("20.00").notNull(),
  riskPerTradePct: decimal("riskPerTradePct", { precision: 6, scale: 2 }).default("0.66").notNull(),
  totalCapital: decimal("totalCapital", { precision: 14, scale: 2 }).default("350000.00").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DrawdownSettings = typeof drawdownSettings.$inferSelect;
export type InsertDrawdownSettings = typeof drawdownSettings.$inferInsert;

// ─── Morning Session Trades ───────────────────────────────────────────────────
export const morningSessionTrades = mysqlTable("morning_session_trades", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  ticker: varchar("ticker", { length: 20 }).notNull(),
  setupType: mysqlEnum("setupType", ["ORB", "GAP_GO", "VWAP_RECLAIM"]).notNull(),
  direction: mysqlEnum("direction", ["LONG", "SHORT"]).notNull(),
  entryPrice: decimal("entryPrice", { precision: 12, scale: 4 }).notNull(),
  stopPrice: decimal("stopPrice", { precision: 12, scale: 4 }).notNull(),
  targetPrice: decimal("targetPrice", { precision: 12, scale: 4 }).notNull(),
  exitPrice: decimal("exitPrice", { precision: 12, scale: 4 }),
  shares: int("shares").notNull(),
  riskAmount: decimal("riskAmount", { precision: 12, scale: 2 }).notNull(),
  rrRatio: decimal("rrRatio", { precision: 6, scale: 2 }).notNull(),
  pnl: decimal("pnl", { precision: 12, scale: 2 }),
  status: mysqlEnum("status", ["ACTIVE", "WIN", "LOSS", "SCRATCH"]).default("ACTIVE").notNull(),
  notes: text("notes"),
  nearRetailZone: tinyint("near_retail_zone").default(0).notNull(),
  liquidityContext: varchar("liquidity_context", { length: 64 }),
  liquidityNotes: varchar("liquidity_notes", { length: 255 }),
  enteredAt: timestamp("enteredAt").defaultNow().notNull(),
  exitedAt: timestamp("exitedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MorningSessionTrade = typeof morningSessionTrades.$inferSelect;
export type InsertMorningSessionTrade = typeof morningSessionTrades.$inferInsert;

// ─── Session Settings ─────────────────────────────────────────────────────────
export const sessionSettings = mysqlTable("session_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  accountSize: decimal("accountSize", { precision: 14, scale: 2 }).default("350000.00").notNull(),
  maxRiskPerTradePct: decimal("maxRiskPerTradePct", { precision: 6, scale: 2 }).default("1.00").notNull(),
  dailyLossLimitPct: decimal("dailyLossLimitPct", { precision: 6, scale: 2 }).default("2.00").notNull(),
  maxTradesPerDay: int("maxTradesPerDay").default(3).notNull(),
  swingRiskPerTradePct: decimal("swingRiskPerTradePct", { precision: 6, scale: 2 }).default("1.50").notNull(),
  maxConcurrentSwings: int("maxConcurrentSwings").default(3).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SessionSettings = typeof sessionSettings.$inferSelect;
export type InsertSessionSettings = typeof sessionSettings.$inferInsert;

// ─── Swing Watchlist ──────────────────────────────────────────────────────────
export const swingWatchlist = mysqlTable("swing_watchlist", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  ticker: varchar("ticker", { length: 20 }).notNull(),
  setupType: mysqlEnum("setupType", ["POST_EARNINGS", "CATALYST_BREAKOUT", "VCP", "GAP_FILL"]).notNull(),
  direction: mysqlEnum("direction", ["LONG", "SHORT"]).default("LONG").notNull(),
  entryPrice: decimal("entryPrice", { precision: 12, scale: 4 }).notNull(),
  stopPrice: decimal("stopPrice", { precision: 12, scale: 4 }).notNull(),
  targetPrice: decimal("targetPrice", { precision: 12, scale: 4 }).notNull(),
  shares: int("shares").notNull(),
  riskAmount: decimal("riskAmount", { precision: 12, scale: 2 }).notNull(),
  rrRatio: decimal("rrRatio", { precision: 6, scale: 2 }).notNull(),
  accountId: varchar("accountId", { length: 32 }), // etrade_4723 | etrade_2738 | schwab
  status: mysqlEnum("status", ["WATCHING", "ACTIVE", "WIN", "LOSS", "SCRATCH", "EXPIRED"]).default("WATCHING").notNull(),
  entryDate: varchar("entryDate", { length: 10 }), // YYYY-MM-DD — set when status → ACTIVE
  exitDate: varchar("exitDate", { length: 10 }),
  exitPrice: decimal("exitPrice", { precision: 12, scale: 4 }),
  pnl: decimal("pnl", { precision: 12, scale: 2 }),
  dayCount: int("dayCount").default(0).notNull(), // days since entry (0 = not yet entered)
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SwingWatchlistEntry = typeof swingWatchlist.$inferSelect;
export type InsertSwingWatchlistEntry = typeof swingWatchlist.$inferInsert;

// ─── Liquidity Zones (AJ Liquidity Hunting) ───────────────────────────────────
export const liquidityZones = mysqlTable("liquidity_zones", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  ticker: varchar("ticker", { length: 20 }).notNull(),
  zoneType: varchar("zone_type", { length: 32 }).notNull(), // resistance|support|supply|demand|trendline|fibonacci|vwap|previous_high|previous_low|other
  priceLevel: decimal("price_level", { precision: 12, scale: 4 }).notNull(),
  priceLevelHigh: decimal("price_level_high", { precision: 12, scale: 4 }),
  notes: text("notes"),
  isActive: tinyint("is_active").default(1).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
export type LiquidityZone = typeof liquidityZones.$inferSelect;
export type InsertLiquidityZone = typeof liquidityZones.$inferInsert;

// ─── Historical Price Bars (5-Year OHLCV for Backtesting) ─────────────────────
export const priceBars = mysqlTable("price_bars", {
  id: int("id").autoincrement().primaryKey(),
  ticker: varchar("ticker", { length: 20 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  open: decimal("open", { precision: 14, scale: 4 }).notNull(),
  high: decimal("high", { precision: 14, scale: 4 }).notNull(),
  low: decimal("low", { precision: 14, scale: 4 }).notNull(),
  close: decimal("close", { precision: 14, scale: 4 }).notNull(),
  volume: bigint("volume", { mode: "number" }).notNull(),
  adjClose: decimal("adj_close", { precision: 14, scale: 4 }),
  interval: varchar("interval", { length: 10 }).default("1d").notNull(),
  source: varchar("source", { length: 32 }).default("yahoo").notNull(),
  fetchedAt: bigint("fetched_at", { mode: "number" }).notNull(),
});
export type PriceBar = typeof priceBars.$inferSelect;
export type InsertPriceBar = typeof priceBars.$inferInsert;

// ─── Price Download Jobs ───────────────────────────────────────────────────────
export const priceDownloadJobs = mysqlTable("price_download_jobs", {
  id: int("id").autoincrement().primaryKey(),
  ticker: varchar("ticker", { length: 20 }).notNull(),
  universe: varchar("universe", { length: 32 }).notNull(),
  status: mysqlEnum("status", ["pending", "running", "done", "error"]).default("pending").notNull(),
  barsDownloaded: int("bars_downloaded").default(0).notNull(),
  errorMsg: text("error_msg"),
  startedAt: bigint("started_at", { mode: "number" }),
  completedAt: bigint("completed_at", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type PriceDownloadJob = typeof priceDownloadJobs.$inferSelect;
export type InsertPriceDownloadJob = typeof priceDownloadJobs.$inferInsert;

// ─── Sri's Portfolio Tracker ───────────────────────────────────────────────────

// Daily account snapshots — one row per account per day
export const accountSnapshots = mysqlTable("account_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  snapshotDate: varchar("snapshot_date", { length: 10 }).notNull(), // YYYY-MM-DD
  accountId: varchar("account_id", { length: 32 }).notNull(),       // "schwab_764" | "etrade_4723" | "etrade_2738"
  accountLabel: varchar("account_label", { length: 64 }).notNull(), // "Schwab ...764"
  totalValue: decimal("total_value", { precision: 14, scale: 2 }).notNull(),
  cashValue: decimal("cash_value", { precision: 14, scale: 2 }).notNull(),
  marketValue: decimal("market_value", { precision: 14, scale: 2 }).notNull(),
  dayPnl: decimal("day_pnl", { precision: 14, scale: 2 }).notNull(),
  totalPnl: decimal("total_pnl", { precision: 14, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type AccountSnapshot = typeof accountSnapshots.$inferSelect;
export type InsertAccountSnapshot = typeof accountSnapshots.$inferInsert;

// Active options positions — manually entered/updated
export const playbookPositions = mysqlTable("playbook_positions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  accountId: varchar("account_id", { length: 32 }).notNull(),
  accountLabel: varchar("account_label", { length: 64 }).notNull(),
  ticker: varchar("ticker", { length: 20 }).notNull(),
  strategy: mysqlEnum("strategy", ["iron_condor", "strangle", "naked_put", "naked_call", "other"]).notNull(),
  // Legs stored as JSON: [{action, strike, type, expiry, qty, credit}]
  legs: json("legs").notNull(),
  expiry: varchar("expiry", { length: 10 }).notNull(),              // YYYY-MM-DD
  creditCollected: decimal("credit_collected", { precision: 10, scale: 2 }).notNull(),
  maxRisk: decimal("max_risk", { precision: 10, scale: 2 }),        // null for naked
  contracts: int("contracts").notNull(),
  shortCallStrike: decimal("short_call_strike", { precision: 10, scale: 2 }),
  shortPutStrike: decimal("short_put_strike", { precision: 10, scale: 2 }),
  status: mysqlEnum("status", ["open", "closed", "expired"]).default("open").notNull(),
  closedPnl: decimal("closed_pnl", { precision: 10, scale: 2 }),   // realized when closed
  closeReason: varchar("close_reason", { length: 128 }),            // "50% profit" | "2x loss" | "expired" | "rolled"
  entryDate: varchar("entry_date", { length: 10 }).notNull(),
  closeDate: varchar("close_date", { length: 10 }),
  notes: text("notes"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
export type PlaybookPosition = typeof playbookPositions.$inferSelect;
export type InsertPlaybookPosition = typeof playbookPositions.$inferInsert;

// Monthly P&L summary — computed/cached per month
export const monthlyPnl = mysqlTable("monthly_pnl", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  month: varchar("month", { length: 7 }).notNull(),                 // YYYY-MM
  totalCapital: decimal("total_capital", { precision: 14, scale: 2 }).notNull(),
  targetPct: decimal("target_pct", { precision: 5, scale: 2 }).default("3.00").notNull(),
  targetAmount: decimal("target_amount", { precision: 14, scale: 2 }).notNull(),
  actualPnl: decimal("actual_pnl", { precision: 14, scale: 2 }).default("0").notNull(),
  tradesWon: int("trades_won").default(0).notNull(),
  tradesLost: int("trades_lost").default(0).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
export type MonthlyPnl = typeof monthlyPnl.$inferSelect;
export type InsertMonthlyPnl = typeof monthlyPnl.$inferInsert;

// Chrome extension sync tokens — personal API tokens for the Chrome extension
export const extensionSyncTokens = mysqlTable("extension_sync_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  label: varchar("label", { length: 100 }).default("Chrome Extension").notNull(),
  lastUsedAt: bigint("last_used_at", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type ExtensionSyncToken = typeof extensionSyncTokens.$inferSelect;
export type InsertExtensionSyncToken = typeof extensionSyncTokens.$inferInsert;

// Cash transfers in/out of brokerage accounts — used for transfer-adjusted P&L
// True P&L = (Ending Value - Beginning Value) - Net Transfers In
export const accountTransfers = mysqlTable("account_transfers", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  accountId: varchar("account_id", { length: 32 }).notNull(),   // "schwab_764" | "etrade_4723" | "etrade_2738" | "all"
  accountLabel: varchar("account_label", { length: 64 }).notNull(),
  transferDate: varchar("transfer_date", { length: 10 }).notNull(), // YYYY-MM-DD
  // Positive = deposit/transfer-in, Negative = withdrawal/transfer-out
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  transferType: mysqlEnum("transfer_type", ["deposit", "withdrawal", "transfer_in", "transfer_out"]).notNull(),
  notes: text("notes"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type AccountTransfer = typeof accountTransfers.$inferSelect;
export type InsertAccountTransfer = typeof accountTransfers.$inferInsert;

// EOD capital snapshots — daily total portfolio value for performance tracking
// Auto-captured from extension sync data, one row per day
export const eodCapitalSnapshots = mysqlTable("eod_capital_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  snapshotDate: varchar("snapshot_date", { length: 10 }).notNull(), // YYYY-MM-DD
  totalValue: decimal("total_value", { precision: 14, scale: 2 }).notNull(),    // sum of all accounts
  schwab764Value: decimal("schwab_764_value", { precision: 14, scale: 2 }),
  etrade4723Value: decimal("etrade_4723_value", { precision: 14, scale: 2 }),
  etrade2738Value: decimal("etrade_2738_value", { precision: 14, scale: 2 }),
  // Transfer-adjusted P&L vs the previous EOD snapshot
  netTransfersSinceLastSnapshot: decimal("net_transfers_since_last_snapshot", { precision: 14, scale: 2 }).default("0"),
  adjustedPnl: decimal("adjusted_pnl", { precision: 14, scale: 2 }),  // totalValue - prevTotalValue - netTransfers
  notes: text("notes"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type EodCapitalSnapshot = typeof eodCapitalSnapshots.$inferSelect;
export type InsertEodCapitalSnapshot = typeof eodCapitalSnapshots.$inferInsert;

// Schwab OAuth tokens — stores access + refresh tokens for the Schwab Trader API
// One row per user (Sri only). Refresh token expires every 7 days — requires re-auth.
export const schwabTokens = mysqlTable("schwab_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  accessTokenExpiresAt: bigint("access_token_expires_at", { mode: "number" }).notNull(), // unix ms
  refreshTokenExpiresAt: bigint("refresh_token_expires_at", { mode: "number" }).notNull(), // unix ms
  // Hashed account numbers returned by Schwab (needed for API calls)
  accountNumbers: json("account_numbers"), // Array of { accountNumber, hashValue }
  // Last successful sync metadata
  lastSyncAt: bigint("last_sync_at", { mode: "number" }),
  lastSyncStatus: varchar("last_sync_status", { length: 32 }), // "ok" | "error" | "token_expired"
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
export type SchwabToken = typeof schwabTokens.$inferSelect;
export type InsertSchwabToken = typeof schwabTokens.$inferInsert;
