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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type UploadedTrade = typeof uploadedTrades.$inferSelect;
export type InsertUploadedTrade = typeof uploadedTrades.$inferInsert;
