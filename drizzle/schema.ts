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
  ticker: varchar("ticker", { length: 16 }).notNull(),
  strategy: varchar("strategy", { length: 64 }),
  direction: mysqlEnum("direction", ["long", "short"]).default("long").notNull(),
  entryPrice: decimal("entryPrice", { precision: 12, scale: 4 }),
  exitPrice: decimal("exitPrice", { precision: 12, scale: 4 }),
  swingLow: decimal("swingLow", { precision: 12, scale: 4 }),
  swingHigh: decimal("swingHigh", { precision: 12, scale: 4 }),
  quantity: int("quantity"),
  target1: decimal("target1", { precision: 12, scale: 4 }),
  target2: decimal("target2", { precision: 12, scale: 4 }),
  stopLoss: decimal("stopLoss", { precision: 12, scale: 4 }),
  pnl: decimal("pnl", { precision: 12, scale: 4 }),
  status: mysqlEnum("status", ["open", "closed"]).default("open").notNull(),
  postTradeNotes: text("postTradeNotes"),
  lessonsLearned: text("lessonsLearned"),
  enteredAt: timestamp("enteredAt").defaultNow().notNull(),
  closedAt: timestamp("closedAt"),
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
