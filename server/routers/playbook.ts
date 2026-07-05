import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { invokeLLM } from "../_core/llm";
import {
  accountSnapshots,
  playbookPositions,
  monthlyPnl,
  extensionSyncTokens,
  accountTransfers,
  eodCapitalSnapshots,
} from "../../drizzle/schema";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import crypto from "crypto";
import { getTradierQuote, getTradierAtmChain } from "../tradierClient";
import {
  getValidAccessToken,
  fetchAllAccounts,
  normalizeAccount,
  updateSchwabSyncStatus,
  getSchwabTokens,
} from "../schwab";

const OWNER_USER_ID = 1; // Sri's actual DB user ID (akulasridhar@gmail.com)

// Sri's 8-ticker universe with known IV range (annualised decimal)
const UNIVERSE_TICKERS = [
  { ticker: "WDC",  ivLow: 0.80, ivHigh: 1.00 },
  { ticker: "TSLA", ivLow: 0.80, ivHigh: 1.20 },
  { ticker: "NVDA", ivLow: 0.60, ivHigh: 0.90 },
  { ticker: "LITE", ivLow: 0.70, ivHigh: 1.00 },
  { ticker: "SMCI", ivLow: 0.80, ivHigh: 1.30 },
  { ticker: "META", ivLow: 0.50, ivHigh: 0.80 },
  { ticker: "AMZN", ivLow: 0.45, ivHigh: 0.75 },
  { ticker: "PLTR", ivLow: 0.70, ivHigh: 1.00 },
];

const legSchema = z.object({
  action: z.enum(["sell", "buy"]),
  strike: z.number(),
  type: z.enum(["call", "put"]),
  expiry: z.string(),
  qty: z.number(),
});

const positionInput = z.object({
  accountId: z.string(),
  accountLabel: z.string(),
  ticker: z.string(),
  strategy: z.enum(["iron_condor", "strangle", "naked_put", "naked_call", "other"]),
  legs: z.array(legSchema),
  expiry: z.string(),
  creditCollected: z.number(),
  maxRisk: z.number().optional(),
  contracts: z.number(),
  shortCallStrike: z.number().optional(),
  shortPutStrike: z.number().optional(),
  entryDate: z.string(),
  notes: z.string().optional(),
});

// ─── Canonical account ID helper ───────────────────────────────────────────
function canonicalId(id: string): string {
  if (id.startsWith("schwab_")) return "schwab_764";
  if (id.includes("4723")) return "etrade_4723";
  if (id.includes("2738")) return "etrade_2738";
  return id;
}

export const playbookRouter = router({
  // ─── Snapshots ─────────────────────────────────────────────────────────────

  saveSnapshot: protectedProcedure
    .input(z.object({
      snapshotDate: z.string(),
      accounts: z.array(z.object({
        accountId: z.string(),
        accountLabel: z.string(),
        totalValue: z.number(),
        cashValue: z.number(),
        marketValue: z.number(),
        dayPnl: z.number(),
        totalPnl: z.number(),
        notes: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const now = Date.now();
      for (const acct of input.accounts) {
        await db.delete(accountSnapshots).where(
          and(
            eq(accountSnapshots.userId, OWNER_USER_ID),
            eq(accountSnapshots.snapshotDate, input.snapshotDate),
            eq(accountSnapshots.accountId, acct.accountId),
          )
        );
        await db.insert(accountSnapshots).values({
          userId: OWNER_USER_ID,
          snapshotDate: input.snapshotDate,
          accountId: acct.accountId,
          accountLabel: acct.accountLabel,
          totalValue: String(acct.totalValue),
          cashValue: String(acct.cashValue),
          marketValue: String(acct.marketValue),
          dayPnl: String(acct.dayPnl),
          totalPnl: String(acct.totalPnl),
          notes: acct.notes ?? null,
          createdAt: now,
        });
      }
      return { ok: true };
    }),

  getLatestSnapshots: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const rows = await db
      .select()
      .from(accountSnapshots)
      .where(eq(accountSnapshots.userId, OWNER_USER_ID))
      .orderBy(desc(accountSnapshots.snapshotDate), desc(accountSnapshots.createdAt));
    const seen = new Map<string, typeof rows[0]>();
    for (const r of rows) {
      const key = canonicalId(r.accountId);
      if (!seen.has(key)) {
        seen.set(key, { ...r, accountId: key });
      }
    }
    return Array.from(seen.values());
  }),

  getSnapshotHistory: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    return db
      .select()
      .from(accountSnapshots)
      .where(eq(accountSnapshots.userId, OWNER_USER_ID))
      .orderBy(desc(accountSnapshots.snapshotDate));
  }),

  // ─── Positions ─────────────────────────────────────────────────────────────

  addPosition: protectedProcedure
    .input(positionInput)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const now = Date.now();
      const [result] = await db.insert(playbookPositions).values({
        userId: OWNER_USER_ID,
        accountId: input.accountId,
        accountLabel: input.accountLabel,
        ticker: input.ticker,
        strategy: input.strategy,
        legs: input.legs,
        expiry: input.expiry,
        creditCollected: String(input.creditCollected),
        maxRisk: input.maxRisk ? String(input.maxRisk) : null,
        contracts: input.contracts,
        shortCallStrike: input.shortCallStrike ? String(input.shortCallStrike) : null,
        shortPutStrike: input.shortPutStrike ? String(input.shortPutStrike) : null,
        status: "open",
        entryDate: input.entryDate,
        notes: input.notes ?? null,
        createdAt: now,
        updatedAt: now,
      });
      return { id: (result as any).insertId };
    }),

  getOpenPositions: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    return db
      .select()
      .from(playbookPositions)
      .where(and(eq(playbookPositions.userId, OWNER_USER_ID), eq(playbookPositions.status, "open")))
      .orderBy(desc(playbookPositions.createdAt));
  }),

  getAllPositions: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    return db
      .select()
      .from(playbookPositions)
      .where(eq(playbookPositions.userId, OWNER_USER_ID))
      .orderBy(desc(playbookPositions.createdAt));
  }),

  closePosition: protectedProcedure
    .input(z.object({
      id: z.number(),
      closedPnl: z.number(),
      closeReason: z.string(),
      closeDate: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.update(playbookPositions)
        .set({
          status: "closed",
          closedPnl: String(input.closedPnl),
          closeReason: input.closeReason,
          closeDate: input.closeDate,
          updatedAt: Date.now(),
        })
        .where(and(eq(playbookPositions.id, input.id), eq(playbookPositions.userId, OWNER_USER_ID)));
      return { ok: true };
    }),

  deletePosition: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.delete(playbookPositions)
        .where(and(eq(playbookPositions.id, input.id), eq(playbookPositions.userId, OWNER_USER_ID)));
      return { ok: true };
    }),

  // ─── Monthly P&L ───────────────────────────────────────────────────────────

  upsertMonthlyPnl: protectedProcedure
    .input(z.object({
      month: z.string(),
      totalCapital: z.number(),
      targetPct: z.number().default(3),
      actualPnl: z.number(),
      tradesWon: z.number().default(0),
      tradesLost: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const now = Date.now();
      const existing = await db.select().from(monthlyPnl)
        .where(and(eq(monthlyPnl.userId, OWNER_USER_ID), eq(monthlyPnl.month, input.month)));
      if (existing.length > 0) {
        await db.update(monthlyPnl).set({
          totalCapital: String(input.totalCapital),
          targetPct: String(input.targetPct),
          targetAmount: String(input.totalCapital * input.targetPct / 100),
          actualPnl: String(input.actualPnl),
          tradesWon: input.tradesWon,
          tradesLost: input.tradesLost,
          updatedAt: now,
        }).where(and(eq(monthlyPnl.userId, OWNER_USER_ID), eq(monthlyPnl.month, input.month)));
      } else {
        await db.insert(monthlyPnl).values({
          userId: OWNER_USER_ID,
          month: input.month,
          totalCapital: String(input.totalCapital),
          targetPct: String(input.targetPct),
          targetAmount: String(input.totalCapital * input.targetPct / 100),
          actualPnl: String(input.actualPnl),
          tradesWon: input.tradesWon,
          tradesLost: input.tradesLost,
          createdAt: now,
          updatedAt: now,
        });
      }
      return { ok: true };
    }),

  getMonthlyPnl: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    return db.select().from(monthlyPnl)
      .where(eq(monthlyPnl.userId, OWNER_USER_ID))
      .orderBy(desc(monthlyPnl.month));
  }),

  // ─── Chrome Extension ──────────────────────────────────────────────────────

  syncBrokerSnapshot: protectedProcedure
    .input(z.object({
      broker: z.enum(["etrade", "schwab"]),
      accountId: z.string(),
      accountLabel: z.string(),
      scrapedAt: z.string(),
      pageUrl: z.string().optional(),
      accountSummary: z.object({
        totalValue: z.number().optional(),
        cash: z.number().optional(),
        dayPnl: z.number().optional(),
        totalPnl: z.number().optional(),
      }).nullable().optional(),
      positions: z.array(z.object({
        symbol: z.string(),
        qty: z.number(),
        price: z.number(),
        costPerShare: z.number(),
        dayChange: z.number(),
        totalGain: z.number(),
        marketValue: z.number(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const now = Date.now();
      const today = new Date().toISOString().split("T")[0];

      if (input.accountSummary && input.accountSummary.totalValue) {
        const s = input.accountSummary;
        await db.delete(accountSnapshots).where(
          and(
            eq(accountSnapshots.userId, OWNER_USER_ID),
            eq(accountSnapshots.snapshotDate, today),
            eq(accountSnapshots.accountId, input.accountId),
          )
        );
        await db.insert(accountSnapshots).values({
          userId: OWNER_USER_ID,
          snapshotDate: today,
          accountId: input.accountId,
          accountLabel: input.accountLabel,
          totalValue: String(s.totalValue ?? 0),
          cashValue: String(s.cash ?? 0),
          marketValue: String((s.totalValue ?? 0) - (s.cash ?? 0)),
          dayPnl: String(s.dayPnl ?? 0),
          totalPnl: String(s.totalPnl ?? 0),
          notes: `Auto-synced via Chrome extension from ${input.broker} at ${input.scrapedAt}`,
          createdAt: now,
        });
      }

      return {
        ok: true,
        broker: input.broker,
        accountId: input.accountId,
        positionsReceived: input.positions.length,
        snapshotSaved: !!(input.accountSummary?.totalValue),
        syncedAt: now,
      };
    }),

  generateExtensionToken: protectedProcedure
    .mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      // Delete any existing token for this user and issue a new one
      await db.delete(extensionSyncTokens).where(eq(extensionSyncTokens.userId, ctx.user.id));
      const token = crypto.randomBytes(32).toString("hex");
      await db.insert(extensionSyncTokens).values({
        userId: ctx.user.id,
        token,
        label: "Chrome Extension",
        createdAt: Date.now(),
      });
      return { token };
    }),

  getExtensionToken: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { hasToken: false, maskedToken: null, lastUsedAt: null };
      const rows = await db
        .select()
        .from(extensionSyncTokens)
        .where(eq(extensionSyncTokens.userId, ctx.user.id))
        .limit(1);
      if (!rows.length) return { hasToken: false, maskedToken: null, lastUsedAt: null };
      const t = rows[0];
      const masked = t.token.slice(0, 8) + "..." + t.token.slice(-4);
      return { hasToken: true, maskedToken: masked, lastUsedAt: t.lastUsedAt };
    }),

  // ─── EOD Capital Tracking ──────────────────────────────────────────────────

  /**
   * Capture an EOD snapshot from the latest account_snapshots data.
   * Calculates transfer-adjusted P&L vs the previous EOD snapshot.
   * Called manually from the UI (or can be automated).
   */
  captureEodSnapshot: protectedProcedure
    .input(z.object({
      snapshotDate: z.string().optional(), // defaults to today
      notes: z.string().optional(),
    }))
    .mutation(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const now = Date.now();
      const today = new Date().toISOString().split("T")[0];

      // ── Step 1: Try to fetch Schwab value live from API ──────────────────────
      let schwabVal = 0;
      let schwabDayPnl = 0;
      let schwabSource = "none";
      try {
        const schwabTokenRow = await getSchwabTokens(OWNER_USER_ID);
        if (schwabTokenRow && Date.now() < schwabTokenRow.refreshTokenExpiresAt) {
          const accessToken = await getValidAccessToken(OWNER_USER_ID);
          const rawAccounts = await fetchAllAccounts(accessToken, "positions");
          const normalized = rawAccounts.map(normalizeAccount);
          // Sum all Schwab accounts (usually just one)
          for (const acct of normalized) {
            schwabVal += acct.totalValue;
            schwabDayPnl += acct.dayPnl;
          }
          // Also upsert a fresh account_snapshot for Schwab so the cards update
          if (normalized.length > 0) {
            const acct = normalized[0];
            await db.delete(accountSnapshots).where(
              and(
                eq(accountSnapshots.userId, OWNER_USER_ID),
                eq(accountSnapshots.snapshotDate, today),
                eq(accountSnapshots.accountId, "schwab_764"),
              )
            );
            await db.insert(accountSnapshots).values({
              userId: OWNER_USER_ID,
              snapshotDate: today,
              accountId: "schwab_764",
              accountLabel: "Schwab ...764",
              totalValue: String(schwabVal),
              cashValue: String(acct.cashBalance),
              marketValue: String(acct.totalValue - acct.cashBalance),
              dayPnl: String(schwabDayPnl),
              totalPnl: String(acct.totalPnl),
              notes: `Auto-fetched via Schwab API at ${new Date().toISOString()}`,
              createdAt: now,
            });
            await updateSchwabSyncStatus(OWNER_USER_ID, "ok");
          }
          schwabSource = "api";
        }
      } catch (err) {
        // Schwab API unavailable — fall back to last extension snapshot
        console.warn("[captureEodSnapshot] Schwab API fetch failed, using extension snapshot:", err);
        schwabSource = "extension_fallback";
      }

      // ── Step 2: Get latest per-account snapshots (for E*TRADE + Schwab fallback) ─
      const snapRows = await db
        .select()
        .from(accountSnapshots)
        .where(eq(accountSnapshots.userId, OWNER_USER_ID))
        .orderBy(desc(accountSnapshots.snapshotDate), desc(accountSnapshots.createdAt));

      // Deduplicate to latest per canonical account
      const seen = new Map<string, typeof snapRows[0]>();
      for (const r of snapRows) {
        const key = canonicalId(r.accountId);
        if (!seen.has(key)) seen.set(key, r);
      }

      // Use API value for Schwab if available, otherwise fall back to extension snapshot
      if (schwabSource === "extension_fallback") {
        const schwabSnap = seen.get("schwab_764");
        schwabVal = schwabSnap ? parseFloat(String(schwabSnap.totalValue)) : 0;
      }

      const et4723 = seen.get("etrade_4723");
      const et2738 = seen.get("etrade_2738");

      const et4723Val = et4723 ? parseFloat(String(et4723.totalValue)) : 0;
      const et2738Val = et2738 ? parseFloat(String(et2738.totalValue)) : 0;
      const totalValue = schwabVal + et4723Val + et2738Val;

      // Get previous EOD snapshot to compute P&L
      const prevRows = await db
        .select()
        .from(eodCapitalSnapshots)
        .where(
          and(
            eq(eodCapitalSnapshots.userId, OWNER_USER_ID),
            lte(eodCapitalSnapshots.snapshotDate, today),
          )
        )
        .orderBy(desc(eodCapitalSnapshots.snapshotDate))
        .limit(2);

      // Find the most recent snapshot that isn't today (to avoid double-counting)
      const prevSnap = prevRows.find(r => r.snapshotDate < today) ?? prevRows[0] ?? null;
      const prevTotal = prevSnap ? parseFloat(String(prevSnap.totalValue)) : 0;

      // Sum transfers between prevSnap.snapshotDate and today
      let netTransfers = 0;
      if (prevSnap) {
        const transferRows = await db
          .select()
          .from(accountTransfers)
          .where(
            and(
              eq(accountTransfers.userId, OWNER_USER_ID),
              gte(accountTransfers.transferDate, prevSnap.snapshotDate),
              lte(accountTransfers.transferDate, today),
            )
          );
        for (const t of transferRows) {
          netTransfers += parseFloat(String(t.amount));
        }
      }

      const adjustedPnl = prevTotal > 0 ? totalValue - prevTotal - netTransfers : null;

      // Upsert today's EOD snapshot
      const existing = await db
        .select()
        .from(eodCapitalSnapshots)
        .where(
          and(
            eq(eodCapitalSnapshots.userId, OWNER_USER_ID),
            eq(eodCapitalSnapshots.snapshotDate, today),
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await db.update(eodCapitalSnapshots)
          .set({
            totalValue: String(totalValue),
            schwab764Value: schwabVal > 0 ? String(schwabVal) : null,
            etrade4723Value: et4723Val > 0 ? String(et4723Val) : null,
            etrade2738Value: et2738Val > 0 ? String(et2738Val) : null,
            netTransfersSinceLastSnapshot: String(netTransfers),
            adjustedPnl: adjustedPnl !== null ? String(adjustedPnl) : null,
            createdAt: now,
          })
          .where(
            and(
              eq(eodCapitalSnapshots.userId, OWNER_USER_ID),
              eq(eodCapitalSnapshots.snapshotDate, today),
            )
          );
      } else {
        await db.insert(eodCapitalSnapshots).values({
          userId: OWNER_USER_ID,
          snapshotDate: today,
          totalValue: String(totalValue),
          schwab764Value: schwabVal > 0 ? String(schwabVal) : null,
          etrade4723Value: et4723Val > 0 ? String(et4723Val) : null,
          etrade2738Value: et2738Val > 0 ? String(et2738Val) : null,
          netTransfersSinceLastSnapshot: String(netTransfers),
          adjustedPnl: adjustedPnl !== null ? String(adjustedPnl) : null,
          createdAt: now,
        });
      }

      return {
        ok: true,
        snapshotDate: today,
        totalValue,
        schwabVal,
        schwabDayPnl,
        schwabSource,
        et4723Val,
        et2738Val,
        netTransfers,
        adjustedPnl,
      };
    }),

  /** Return all EOD capital snapshots for the chart */
  getEodHistory: protectedProcedure
    .input(z.object({
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const conditions = [eq(eodCapitalSnapshots.userId, OWNER_USER_ID)];
      if (input?.fromDate) conditions.push(gte(eodCapitalSnapshots.snapshotDate, input.fromDate));
      if (input?.toDate) conditions.push(lte(eodCapitalSnapshots.snapshotDate, input.toDate));

      return db
        .select()
        .from(eodCapitalSnapshots)
        .where(and(...conditions))
        .orderBy(desc(eodCapitalSnapshots.snapshotDate));
    }),

  /** Return transfer-adjusted P&L for a date range (month-to-date by default) */
  getAdjustedPnl: protectedProcedure
    .input(z.object({
      fromDate: z.string(),
      toDate: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get the EOD snapshot at/before fromDate as the baseline
      const baselineRows = await db
        .select()
        .from(eodCapitalSnapshots)
        .where(
          and(
            eq(eodCapitalSnapshots.userId, OWNER_USER_ID),
            lte(eodCapitalSnapshots.snapshotDate, input.fromDate),
          )
        )
        .orderBy(desc(eodCapitalSnapshots.snapshotDate))
        .limit(1);

      // Get the most recent EOD snapshot at/before toDate
      const currentRows = await db
        .select()
        .from(eodCapitalSnapshots)
        .where(
          and(
            eq(eodCapitalSnapshots.userId, OWNER_USER_ID),
            lte(eodCapitalSnapshots.snapshotDate, input.toDate),
          )
        )
        .orderBy(desc(eodCapitalSnapshots.snapshotDate))
        .limit(1);

      // Sum all transfers in the date range
      const transferRows = await db
        .select()
        .from(accountTransfers)
        .where(
          and(
            eq(accountTransfers.userId, OWNER_USER_ID),
            gte(accountTransfers.transferDate, input.fromDate),
            lte(accountTransfers.transferDate, input.toDate),
          )
        );

      const netTransfers = transferRows.reduce((sum, t) => sum + parseFloat(String(t.amount)), 0);
      const baselineValue = baselineRows[0] ? parseFloat(String(baselineRows[0].totalValue)) : 0;
      const currentValue = currentRows[0] ? parseFloat(String(currentRows[0].totalValue)) : 0;
      const rawPnl = currentValue - baselineValue;
      const adjustedPnl = rawPnl - netTransfers;

      return {
        fromDate: input.fromDate,
        toDate: input.toDate,
        baselineValue,
        currentValue,
        rawPnl,
        netTransfers,
        adjustedPnl,
        baselineDate: baselineRows[0]?.snapshotDate ?? null,
        currentDate: currentRows[0]?.snapshotDate ?? null,
      };
    }),

  // ─── Transfers CRUD ────────────────────────────────────────────────────────

  addTransfer: protectedProcedure
    .input(z.object({
      accountId: z.string(),
      accountLabel: z.string(),
      transferDate: z.string(),
      amount: z.number(), // positive = deposit, negative = withdrawal
      transferType: z.enum(["deposit", "withdrawal", "transfer_in", "transfer_out"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [result] = await db.insert(accountTransfers).values({
        userId: OWNER_USER_ID,
        accountId: input.accountId,
        accountLabel: input.accountLabel,
        transferDate: input.transferDate,
        amount: String(input.amount),
        transferType: input.transferType,
        notes: input.notes ?? null,
        createdAt: Date.now(),
      });
      return { id: (result as any).insertId };
    }),

  getTransfers: protectedProcedure
    .input(z.object({
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
      accountId: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const conditions = [eq(accountTransfers.userId, OWNER_USER_ID)];
      if (input?.fromDate) conditions.push(gte(accountTransfers.transferDate, input.fromDate));
      if (input?.toDate) conditions.push(lte(accountTransfers.transferDate, input.toDate));
      if (input?.accountId) conditions.push(eq(accountTransfers.accountId, input.accountId));

      return db
        .select()
        .from(accountTransfers)
        .where(and(...conditions))
        .orderBy(desc(accountTransfers.transferDate));
    }),

  deleteTransfer: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.delete(accountTransfers)
        .where(and(eq(accountTransfers.id, input.id), eq(accountTransfers.userId, OWNER_USER_ID)));
      return { ok: true };
    }),

  // ─── Ticker Setup Signals ──────────────────────────────────────────────────
  /**
   * Fetch live IV data for Sri's 8 tickers and compute a setup signal:
   *   green  = IV Rank >= 40  (ready to sell premium)
   *   yellow = IV Rank 20-39  (watch, IV rising)
   *   red    = IV Rank < 20   (skip, IV too low)
   *   gray   = data unavailable
   */
  getTickerSetupSignals: protectedProcedure.query(async () => {
    const results = await Promise.allSettled(
      UNIVERSE_TICKERS.map(async ({ ticker, ivLow, ivHigh }) => {
        try {
          const quote = await getTradierQuote(ticker);
          const price = quote?.last ?? 0;
          if (!price) return { ticker, status: "gray" as const, ivRank: null, iv: null, change: null };

          const chain = await getTradierAtmChain(ticker, price);
          // Use the average mid_iv of ATM calls and puts as current IV
          const contracts = [
            ...(chain?.calls ?? []),
            ...(chain?.puts ?? []),
          ].filter(c => c.greeks?.mid_iv && c.greeks.mid_iv > 0);

          let iv: number | null = null;
          if (contracts.length > 0) {
            const sum = contracts.reduce((acc, c) => acc + (c.greeks?.mid_iv ?? 0), 0);
            iv = sum / contracts.length;
          }

          let ivRank: number | null = null;
          let status: "green" | "yellow" | "red" | "gray" = "gray";

          if (iv !== null && ivHigh > ivLow) {
            // Clamp IV to known range for rank calculation
            ivRank = Math.round(((iv - ivLow) / (ivHigh - ivLow)) * 100);
            ivRank = Math.max(0, Math.min(100, ivRank));
            if (ivRank >= 40) status = "green";
            else if (ivRank >= 20) status = "yellow";
            else status = "red";
          }

          return {
            ticker,
            status,
            ivRank,
            iv: iv !== null ? Math.round(iv * 100) : null, // as percentage
            change: quote?.change_percentage ?? null,
            price: quote?.last ?? null,
          };
        } catch {
          return { ticker, status: "gray" as const, ivRank: null, iv: null, change: null, price: null };
        }
      })
    );

    return results.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : { ticker: UNIVERSE_TICKERS[i].ticker, status: "gray" as const, ivRank: null, iv: null, change: null, price: null }
    );
  }),

  // ─── Auto Trade Analysis ──────────────────────────────────────────────────
  /**
   * Analyze a position using AI — plain-English breakdown:
   * what the trade is, max profit/loss/breakeven, what needs to happen to win,
   * key risks, and a playbook fit check.
   */
  analyzePosition: protectedProcedure
    .input(z.object({
      ticker: z.string(),
      strategy: z.enum(["iron_condor", "strangle", "naked_put", "naked_call", "other"]),
      expiry: z.string(),
      creditCollected: z.number(),
      contracts: z.number(),
      shortCallStrike: z.number().optional(),
      shortPutStrike: z.number().optional(),
      maxRisk: z.number().optional(),
      entryDate: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const {
        ticker, strategy, expiry, creditCollected, contracts,
        shortCallStrike, shortPutStrike, maxRisk, entryDate, notes,
      } = input;

      const totalCredit = creditCollected * contracts * 100;
      const profitTarget = totalCredit * 0.5;
      const lossStop = totalCredit * 2;
      const today = new Date();
      const expiryDate = new Date(expiry + "T20:00:00Z");
      const dte = Math.max(0, Math.round((expiryDate.getTime() - today.getTime()) / 86400000));

      const strategyMap: Record<string, string> = {
        iron_condor: "Iron Condor (4-leg defined-risk spread)",
        strangle: "Short Strangle (naked call + naked put)",
        naked_put: "Naked Put (cash-secured put)",
        naked_call: "Naked Call (uncovered call)",
        other: "Custom options structure",
      };
      const strategyLabel = strategyMap[strategy] ?? strategy;

      const strikesDesc = [
        shortCallStrike ? `Short Call at $${shortCallStrike}` : null,
        shortPutStrike ? `Short Put at $${shortPutStrike}` : null,
      ].filter(Boolean).join(", ");

      const prompt = `You are Pit Advisor, an expert options trading analyst for PitDesk.

Analyze this trade and return a JSON object with the exact fields below.

## Trade Details
- Ticker: ${ticker}
- Strategy: ${strategyLabel}
- Expiry: ${expiry} (${dte} days to expiry)
- Entry Date: ${entryDate}
- Credit Collected: $${creditCollected.toFixed(2)} per share
- Contracts: ${contracts}
- Total Credit: $${totalCredit.toFixed(2)}
${strikesDesc ? `- Strikes: ${strikesDesc}` : ""}
${maxRisk ? `- Max Risk (spread width): $${maxRisk.toFixed(2)}` : ""}
${notes ? `- Trader Notes: ${notes}` : ""}

## Sri's Playbook Rules (check against these)
- Entry window: 10:00–11:00 AM EST only
- Iron Condor: IV Rank > 40, min 10 DTE, max $10k risk, 50% profit target, 2× loss stop
- Strangle: IV Rank > 60, no binary events in next 10 days, min 10 DTE, max 2–3 contracts
- Naked Put/Call: Directional conviction required, IV Rank > 40
- All strategies: Take profit at 50% of credit. Close if loss = 2× credit.

## Required JSON Response
Return ONLY this JSON object (no markdown, no explanation outside the JSON):
{
  "summary": "One sentence plain-English description of what this trade is",
  "maxProfit": number,
  "maxLoss": number,
  "breakeven": "e.g. $145–$165 or below $145",
  "whatNeedsToHappen": "Plain English: what price action needs to occur for max profit",
  "playbookFit": {
    "pass": boolean,
    "score": number,
    "reason": "Specific reason why it passes or fails the playbook rules",
    "warnings": ["list of specific concerns or rule violations"]
  },
  "risks": ["risk 1", "risk 2", "risk 3"],
  "tradingBuddyTake": "2-3 sentences of honest assessment from your trading mentor perspective",
  "adjustmentStrategy": {
    "needed": boolean,
    "headline": "One sentence: what is the primary adjustment action (e.g. 'Roll the short call up and out to reduce delta risk')",
    "steps": [
      "Step 1: specific action with strikes/expiry guidance",
      "Step 2: specific action",
      "Step 3: specific action"
    ],
    "hedgeOption": "One sentence describing an alternative hedge (e.g. buy a protective put, add a long call wing, reduce contracts)",
    "doNothing": "One sentence on when it is acceptable to hold without adjusting"
  }
}`;

      try {
        const result = await invokeLLM({
          messages: [{ role: "user", content: prompt }],
          responseFormat: { type: "json_object" },
          maxTokens: 1200,
        });
        const content = typeof result.choices[0]?.message?.content === "string"
          ? result.choices[0].message.content : "{}";
        const parsed = JSON.parse(content);
        return {
          ok: true,
          analysis: {
            summary: parsed.summary ?? "",
            maxProfit: parsed.maxProfit ?? totalCredit,
            maxLoss: parsed.maxLoss ?? (maxRisk ? maxRisk * contracts : lossStop),
            breakeven: parsed.breakeven ?? "N/A",
            whatNeedsToHappen: parsed.whatNeedsToHappen ?? "",
            playbookFit: {
              pass: parsed.playbookFit?.pass ?? true,
              score: parsed.playbookFit?.score ?? 70,
              reason: parsed.playbookFit?.reason ?? "",
              warnings: (parsed.playbookFit?.warnings ?? []) as string[],
            },
            risks: (parsed.risks ?? []) as string[],
            tradingBuddyTake: parsed.tradingBuddyTake ?? "",
            adjustmentStrategy: {
              needed: parsed.adjustmentStrategy?.needed ?? !parsed.playbookFit?.pass,
              headline: parsed.adjustmentStrategy?.headline ?? "",
              steps: (parsed.adjustmentStrategy?.steps ?? []) as string[],
              hedgeOption: parsed.adjustmentStrategy?.hedgeOption ?? "",
              doNothing: parsed.adjustmentStrategy?.doNothing ?? "",
            },
          },
        };
      } catch (err) {
        console.error("[analyzePosition] LLM error:", (err as Error).message);
        return {
          ok: true,
          analysis: {
            summary: `${contracts} contract ${strategyLabel} on ${ticker} expiring ${expiry}`,
            maxProfit: totalCredit,
            maxLoss: maxRisk ? maxRisk * contracts : lossStop,
            breakeven: strikesDesc || "See strikes",
            whatNeedsToHappen: `${ticker} stays between the short strikes through ${expiry}`,
            playbookFit: {
              pass: dte >= 10,
              score: dte >= 10 ? 70 : 30,
              reason: dte >= 10 ? "DTE requirement met" : "DTE < 10 days — below playbook minimum",
              warnings: dte < 10 ? ["Less than 10 days to expiry"] : [] as string[],
            },
            risks: [
              "Gap risk on earnings or macro event",
              "IV expansion can increase unrealized loss",
              "Assignment risk if stock moves through short strike",
            ] as string[],
            tradingBuddyTake: "Analysis unavailable — check your connection and try again.",
            adjustmentStrategy: {
              needed: dte < 10,
              headline: dte < 10 ? "Consider rolling out to a later expiry to buy more time" : "No adjustment needed at this time",
              steps: dte < 10
                ? [
                    "Buy back the current short options to close the position",
                    "Sell the same strikes in the next available expiry (1–2 weeks out)",
                    "Collect a net credit or debit-neutral roll if possible",
                  ] as string[]
                : ["Monitor position daily", "Re-evaluate if stock moves within 5% of short strike"] as string[],
              hedgeOption: "Buy a further OTM option as a wing to cap max loss",
              doNothing: "Hold if the position is within the profit zone and DTE > 5",
            },
          },
        };
      }
    }),
});
