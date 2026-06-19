/**
 * Agent & Broker tRPC router
 *
 * Procedures:
 *   broker.getConnections     - list connected brokers for current user
 *   broker.disconnectBroker   - remove a broker connection
 *   broker.getSchwabAuthUrl   - start Schwab OAuth2 PKCE flow
 *   broker.getEtradeAuthUrl   - start E*TRADE OAuth1.0a flow
 *
 *   agent.run                 - manually trigger the trading agent
 *   agent.listProposals       - list pending/recent trade proposals
 *   agent.approveProposal     - approve a proposal and execute the trade
 *   agent.rejectProposal      - reject a proposal with optional reason
 *   agent.listRuns            - list recent agent runs
 *
 *   tradeLog.list             - list executed trades
 *   tradeLog.updateStatus     - mark a trade as closed/expired with P&L
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  agentRuns,
  brokerConnections,
  tradeLog,
  tradeProposals,
} from "../../drizzle/schema";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { runTradingAgent } from "../agentEngine";
import {
  buildSchwabAuthUrl,
  disconnectSchwab,
  generatePkce,
  getSchwabAccounts,
  getSchwabConnection,
  getValidSchwabToken,
  placeSchwabOrder,
  saveSchwabConnection,
  type SchwabOptionLeg,
} from "../brokers/schwab";
import {
  buildEtradeAuthUrl,
  disconnectEtrade,
  getEtradeAccounts,
  getEtradeConnection,
  getEtradeRequestToken,
  getEtradeTokens,
  placeEtradeOrder,
  type EtradeOrderLeg,
} from "../brokers/etrade";

// In-memory PKCE verifier store (keyed by state, TTL 10 min)
// In production this should be Redis/DB; for now it's per-process memory
const pkceStore = new Map<string, { verifier: string; userId: number; expiresAt: number }>();
const etradeRequestTokenStore = new Map<string, { oauthToken: string; oauthTokenSecret: string; userId: number; expiresAt: number }>();

function cleanExpiredEntries() {
  const now = Date.now();
  Array.from(pkceStore.entries()).forEach(([k, v]) => { if (v.expiresAt < now) pkceStore.delete(k); });
  Array.from(etradeRequestTokenStore.entries()).forEach(([k, v]) => { if (v.expiresAt < now) etradeRequestTokenStore.delete(k); });
}

// ── Broker router ─────────────────────────────────────────────────────────────

export const brokerRouter = router({
  getConnections: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({
        id: brokerConnections.id,
        broker: brokerConnections.broker,
        accountId: brokerConnections.accountId,
        accountLabel: brokerConnections.accountLabel,
        tokenExpiry: brokerConnections.tokenExpiry,
        isActive: brokerConnections.isActive,
        createdAt: brokerConnections.createdAt,
      })
      .from(brokerConnections)
      .where(and(eq(brokerConnections.userId, ctx.user.id), eq(brokerConnections.isActive, true)));
    return rows;
  }),

  getSchwabAuthUrl: protectedProcedure
    .input(z.object({ redirectUri: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      cleanExpiredEntries();
      const { verifier, challenge } = generatePkce();
      const state = `schwab_${ctx.user.id}_${Date.now()}`;
      pkceStore.set(state, { verifier, userId: ctx.user.id, expiresAt: Date.now() + 10 * 60 * 1000 });
      const url = buildSchwabAuthUrl(input.redirectUri, state, challenge);
      return { url, state };
    }),

  completeSchwabAuth: protectedProcedure
    .input(z.object({ code: z.string(), state: z.string(), redirectUri: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      cleanExpiredEntries();
      const entry = pkceStore.get(input.state);
      if (!entry || entry.userId !== ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired OAuth state" });
      }
      pkceStore.delete(input.state);

      const { exchangeSchwabCode } = await import("../brokers/schwab");
      const tokens = await exchangeSchwabCode(input.code, input.redirectUri, entry.verifier);

      // Fetch account info
      let accountId: string | undefined;
      let accountLabel: string | undefined;
      try {
        const accounts = await getSchwabAccounts(tokens.access_token);
        const first = accounts?.[0];
        if (first) {
          accountId = first.hashValue ?? first.accountNumber;
          accountLabel = first.accountPreferences?.nickName ?? `Schwab ${first.type ?? "Account"}`;
        }
      } catch {
        // Non-fatal: save connection without account info
      }

      await saveSchwabConnection(ctx.user.id, tokens, accountId, accountLabel);
      return { success: true, accountLabel: accountLabel ?? "Schwab Account" };
    }),

  getEtradeAuthUrl: protectedProcedure
    .input(z.object({ callbackUrl: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      cleanExpiredEntries();
      const { oauthToken, oauthTokenSecret } = await getEtradeRequestToken(input.callbackUrl);
      const stateKey = `etrade_${ctx.user.id}_${Date.now()}`;
      etradeRequestTokenStore.set(stateKey, {
        oauthToken,
        oauthTokenSecret,
        userId: ctx.user.id,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });
      const url = buildEtradeAuthUrl(oauthToken);
      return { url, stateKey };
    }),

  completeEtradeAuth: protectedProcedure
    .input(z.object({ oauthToken: z.string(), oauthVerifier: z.string(), stateKey: z.string() }))
    .mutation(async ({ ctx, input }) => {
      cleanExpiredEntries();
      const entry = etradeRequestTokenStore.get(input.stateKey);
      if (!entry || entry.userId !== ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired OAuth state" });
      }
      etradeRequestTokenStore.delete(input.stateKey);

      const { exchangeEtradeVerifier } = await import("../brokers/etrade");
      const { accessToken, accessTokenSecret } = await exchangeEtradeVerifier(
        entry.oauthToken,
        entry.oauthTokenSecret,
        input.oauthVerifier
      );

      // Fetch account info
      let accountId: string | undefined;
      let accountLabel: string | undefined;
      try {
        const accounts = await getEtradeAccounts(accessToken, accessTokenSecret);
        const first = accounts?.AccountListResponse?.Accounts?.Account?.[0];
        if (first) {
          accountId = first.accountIdKey;
          accountLabel = first.accountDesc ?? `E*TRADE ${first.accountType ?? "Account"}`;
        }
      } catch {
        // Non-fatal
      }

      const { saveEtradeConnection } = await import("../brokers/etrade");
      await saveEtradeConnection(ctx.user.id, accessToken, accessTokenSecret, accountId, accountLabel);
      return { success: true, accountLabel: accountLabel ?? "E*TRADE Account" };
    }),

  disconnectBroker: protectedProcedure
    .input(z.object({ broker: z.enum(["schwab", "etrade"]) }))
    .mutation(async ({ ctx, input }) => {
      if (input.broker === "schwab") {
        await disconnectSchwab(ctx.user.id);
      } else {
        await disconnectEtrade(ctx.user.id);
      }
      return { success: true };
    }),
});

// ── Agent router ──────────────────────────────────────────────────────────────

export const agentRouter = router({
  run: protectedProcedure
    .input(z.object({
      accountSize: z.number().positive().default(25000),
      targetDte: z.number().int().min(7).max(90).default(30),
    }))
    .mutation(async ({ ctx, input }) => {
      const { agentRunId, proposals } = await runTradingAgent(
        ctx.user.id,
        "manual",
        input.accountSize,
        input.targetDte
      );
      return { agentRunId, proposalCount: proposals.length };
    }),

  listRuns: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(agentRuns)
        .where(eq(agentRuns.userId, ctx.user.id))
        .orderBy(desc(agentRuns.createdAt))
        .limit(input.limit);
    }),

  listProposals: protectedProcedure
    .input(z.object({
      status: z.enum(["pending", "approved", "rejected", "executed", "failed", "all"]).default("pending"),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [eq(tradeProposals.userId, ctx.user.id)];
      if (input.status !== "all") {
        conditions.push(eq(tradeProposals.status, input.status));
      }
      return db
        .select()
        .from(tradeProposals)
        .where(and(...conditions))
        .orderBy(desc(tradeProposals.createdAt))
        .limit(input.limit);
    }),

  approveProposal: protectedProcedure
    .input(z.object({
      proposalId: z.number().int(),
      broker: z.enum(["schwab", "etrade"]),
      accountSize: z.number().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Load proposal
      const rows = await db
        .select()
        .from(tradeProposals)
        .where(and(eq(tradeProposals.id, input.proposalId), eq(tradeProposals.userId, ctx.user.id)))
        .limit(1);

      const proposal = rows[0];
      if (!proposal) throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
      if (proposal.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Proposal is already ${proposal.status}` });
      }

      const legs = JSON.parse(proposal.legsJson) as Array<{
        action: "BUY" | "SELL";
        putCall: "PUT" | "CALL";
        strike: number;
        expiry: string;
      }>;

      const netCredit = parseFloat(proposal.netCredit);
      const contracts = proposal.contracts;

      let brokerOrderId: string | null = null;
      let fillPrice: number | null = null;

      // Mark as approved first
      await db.update(tradeProposals)
        .set({ status: "approved", broker: input.broker, reviewedAt: new Date() })
        .where(eq(tradeProposals.id, input.proposalId));

      try {
        if (input.broker === "schwab") {
          const accessToken = await getValidSchwabToken(ctx.user.id);
          if (!accessToken) throw new Error("Schwab not connected or token expired");

          const conn = await getSchwabConnection(ctx.user.id);
          if (!conn?.accountId) throw new Error("No Schwab account ID found");

          // Build OCC symbols for each leg
          const expiryDate = new Date(proposal.expiryDate);
          const yy = String(expiryDate.getFullYear()).slice(-2);
          const mm = String(expiryDate.getMonth() + 1).padStart(2, "0");
          const dd = String(expiryDate.getDate()).padStart(2, "0");

          const schwabLegs: SchwabOptionLeg[] = legs.map(leg => {
            const strikeStr = String(Math.round(leg.strike * 1000)).padStart(8, "0");
            const occSymbol = `${proposal.ticker.padEnd(6)}${yy}${mm}${dd}${leg.putCall[0]}${strikeStr}`;
            return {
              instruction: leg.action === "SELL" ? "SELL_TO_OPEN" : "BUY_TO_OPEN",
              quantity: contracts,
              instrument: {
                symbol: occSymbol,
                assetType: "OPTION",
                putCall: leg.putCall,
              },
            };
          });

          const result = await placeSchwabOrder(accessToken, conn.accountId, schwabLegs, netCredit);
          brokerOrderId = result.orderId;
          fillPrice = netCredit; // Will be updated when filled

        } else {
          // E*TRADE
          const tokens = await getEtradeTokens(ctx.user.id);
          if (!tokens) throw new Error("E*TRADE not connected");

          const conn = await getEtradeConnection(ctx.user.id);
          if (!conn?.accountId) throw new Error("No E*TRADE account ID found");

          const expiryDate = new Date(proposal.expiryDate);
          const clientOrderId = `OSA_${input.proposalId}_${Date.now()}`;

          const etradeLegs: EtradeOrderLeg[] = legs.map(leg => ({
            orderAction: leg.action === "SELL" ? "SELL_OPEN" : "BUY_OPEN",
            quantity: contracts,
            instrument: {
              Product: {
                securityType: "OPTN",
                symbol: proposal.ticker,
                callPut: leg.putCall,
                expiryYear: expiryDate.getFullYear(),
                expiryMonth: expiryDate.getMonth() + 1,
                expiryDay: expiryDate.getDate(),
                strikePrice: leg.strike,
              },
            },
          }));

          const result = await placeEtradeOrder(
            tokens.token,
            tokens.secret,
            conn.accountId,
            etradeLegs,
            netCredit,
            clientOrderId
          );
          brokerOrderId = result.orderId;
          fillPrice = netCredit;
        }

        // Mark as executed and create trade log entry
        await db.update(tradeProposals)
          .set({ status: "executed" })
          .where(eq(tradeProposals.id, input.proposalId));

        await db.insert(tradeLog).values({
          proposalId: input.proposalId,
          userId: ctx.user.id,
          broker: input.broker,
          brokerOrderId: brokerOrderId ?? undefined,
          ticker: proposal.ticker,
          strategy: (proposal as any).strategy ?? proposal.ticker,
          legsJson: proposal.legsJson,
          contracts,
          fillPrice: fillPrice?.toFixed(4) ?? null,
          maxLoss: proposal.maxLoss,
          status: "open",
        });

        return { success: true, brokerOrderId, fillPrice };

      } catch (err) {
        // Mark as failed
        await db.update(tradeProposals)
          .set({ status: "failed", rejectionReason: err instanceof Error ? err.message : "Order placement failed" })
          .where(eq(tradeProposals.id, input.proposalId));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Order placement failed",
        });
      }
    }),

  rejectProposal: protectedProcedure
    .input(z.object({
      proposalId: z.number().int(),
      reason: z.string().max(256).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const rows = await db
        .select()
        .from(tradeProposals)
        .where(and(eq(tradeProposals.id, input.proposalId), eq(tradeProposals.userId, ctx.user.id)))
        .limit(1);

      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
      if (rows[0].status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Proposal is already ${rows[0].status}` });
      }

      await db.update(tradeProposals)
        .set({ status: "rejected", rejectionReason: input.reason ?? null, reviewedAt: new Date() })
        .where(eq(tradeProposals.id, input.proposalId));

      return { success: true };
    }),
});

// ── Trade Log router ──────────────────────────────────────────────────────────

export const tradeLogRouter = router({
  list: protectedProcedure
    .input(z.object({
      status: z.enum(["open", "closed", "expired", "all"]).default("all"),
      broker: z.enum(["schwab", "etrade", "all"]).default("all"),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [eq(tradeLog.userId, ctx.user.id)];
      if (input.status !== "all") conditions.push(eq(tradeLog.status, input.status));
      if (input.broker !== "all") conditions.push(eq(tradeLog.broker, input.broker));
      return db
        .select()
        .from(tradeLog)
        .where(and(...conditions))
        .orderBy(desc(tradeLog.executedAt))
        .limit(input.limit);
    }),

  updateStatus: protectedProcedure
    .input(z.object({
      tradeId: z.number().int(),
      status: z.enum(["closed", "expired", "cancelled"]),
      closedPnl: z.number().optional(),
      notes: z.string().max(512).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const rows = await db
        .select()
        .from(tradeLog)
        .where(and(eq(tradeLog.id, input.tradeId), eq(tradeLog.userId, ctx.user.id)))
        .limit(1);

      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });

      await db.update(tradeLog)
        .set({
          status: input.status === "cancelled" ? "closed" : input.status as "open" | "closed" | "expired",
          closedPnl: input.closedPnl !== undefined ? input.closedPnl.toFixed(4) : null,
          closedAt: new Date(),
          notes: input.notes ?? null,
        })
        .where(eq(tradeLog.id, input.tradeId));

      return { success: true };
    }),
});
