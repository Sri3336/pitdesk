/**
 * playbookRules router — per-user Playbook rules, style profile, compliance
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { eq, and, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";

// ─── Default starter rules ────────────────────────────────────────────────────
const STARTER_RULES = [
  { ruleText: "Only trade Stage 2 stocks (above 50-day MA, trending up)", category: "entry", ruleType: "hard_block" as const },
  { ruleText: "Minimum Open Interest of 500 contracts before entering any options trade", category: "liquidity", ruleType: "hard_block" as const },
  { ruleText: "Never enter a new position within 5 days of earnings unless it's an earnings play", category: "risk", ruleType: "soft_warn" as const },
  { ruleText: "Bid/ask spread must be less than 5% of the mid price", category: "liquidity", ruleType: "soft_warn" as const },
  { ruleText: "IVR above 30 before selling premium", category: "entry", ruleType: "soft_warn" as const },
  { ruleText: "Max position size: 5% of portfolio per trade", category: "risk", ruleType: "guideline" as const },
  { ruleText: "Take 50% profit at 50% of max gain — don't get greedy", category: "exit", ruleType: "guideline" as const },
  { ruleText: "Close position at 2x credit received (max loss = 2x premium collected)", category: "exit", ruleType: "hard_block" as const },
];

export const playbookRulesRouter = router({
  // ── List all rules for the current user ─────────────────────────────────────
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const rows = await db.execute(
      sql`SELECT * FROM playbook_rules WHERE user_id = ${ctx.user.id} ORDER BY sort_order ASC, id ASC`
    );
    return (rows as any).rows ?? rows ?? [];
  }),

  // ── Add a rule ───────────────────────────────────────────────────────────────
  add: protectedProcedure
    .input(z.object({
      ruleText: z.string().min(1).max(512),
      ruleType: z.enum(["hard_block", "soft_warn", "guideline"]).default("soft_warn"),
      category: z.string().max(64).default("general"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const now = Date.now();
      await db.execute(
        sql`INSERT INTO playbook_rules (user_id, rule_text, ruleType, category, is_active, times_triggered, times_overridden, sort_order, created_at, updated_at)
            VALUES (${ctx.user.id}, ${input.ruleText}, ${input.ruleType}, ${input.category}, 1, 0, 0, 0, ${now}, ${now})`
      );
      return { ok: true };
    }),

  // ── Delete a rule ────────────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.execute(
        sql`DELETE FROM playbook_rules WHERE id = ${input.id} AND user_id = ${ctx.user.id}`
      );
      return { ok: true };
    }),

  // ── Toggle active/inactive ───────────────────────────────────────────────────
  toggle: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.execute(
        sql`UPDATE playbook_rules SET is_active = ${input.isActive ? 1 : 0}, updated_at = ${Date.now()}
            WHERE id = ${input.id} AND user_id = ${ctx.user.id}`
      );
      return { ok: true };
    }),

  // ── Seed default starter rules ───────────────────────────────────────────────
  seedDefaults: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const now = Date.now();
    for (let i = 0; i < STARTER_RULES.length; i++) {
      const r = STARTER_RULES[i];
      await db.execute(
        sql`INSERT IGNORE INTO playbook_rules (user_id, rule_text, ruleType, category, is_active, times_triggered, times_overridden, sort_order, created_at, updated_at)
            VALUES (${ctx.user.id}, ${r.ruleText}, ${r.ruleType}, ${r.category}, 1, 0, 0, ${i}, ${now}, ${now})`
      );
    }
    return { ok: true, count: STARTER_RULES.length };
  }),

  // ── Get style profile (auto-computed from trade log) ─────────────────────────
  getStyleProfile: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;

    // Try to get existing profile
    const profileRows = await db.execute(
      sql`SELECT * FROM playbook_style_profile WHERE user_id = ${ctx.user.id} LIMIT 1`
    );
    const existing = ((profileRows as any).rows ?? profileRows ?? [])[0] as any;

    // If profile is fresh (< 1 hour old), return it
    if (existing && (Date.now() - (existing.computed_at ?? 0)) < 3600000) {
      return existing;
    }

    // Compute from trade log
    const tradesRows = await db.execute(
      sql`SELECT strategy, pnl, entry_date FROM manual_trades WHERE user_id = ${ctx.user.id} AND status = 'closed' ORDER BY entry_date DESC LIMIT 200`
    );
    const trades = ((tradesRows as any).rows ?? tradesRows ?? []) as any[];

    if (trades.length === 0) {
      return existing ?? null;
    }

    // Win rate
    const winners = trades.filter((t: any) => parseFloat(t.pnl ?? "0") > 0);
    const winRate = (winners.length / trades.length) * 100;
    const avgWin = winners.length > 0 ? winners.reduce((s: number, t: any) => s + parseFloat(t.pnl ?? "0"), 0) / winners.length : 0;
    const losers = trades.filter((t: any) => parseFloat(t.pnl ?? "0") <= 0);
    const avgLoss = losers.length > 0 ? Math.abs(losers.reduce((s: number, t: any) => s + parseFloat(t.pnl ?? "0"), 0) / losers.length) : 0;
    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;

    // Strategy breakdown
    const stratMap: Record<string, { wins: number; total: number }> = {};
    for (const t of trades) {
      const s = t.strategy ?? "Unknown";
      if (!stratMap[s]) stratMap[s] = { wins: 0, total: 0 };
      stratMap[s].total++;
      if (parseFloat(t.pnl ?? "0") > 0) stratMap[s].wins++;
    }
    const stratRanked = Object.entries(stratMap)
      .map(([name, v]) => ({ name, winRate: (v.wins / v.total) * 100, total: v.total }))
      .filter(s => s.total >= 2)
      .sort((a, b) => b.winRate - a.winRate);

    // Style tag
    const stratNames = trades.map((t: any) => (t.strategy ?? "").toLowerCase());
    const premiumCount = stratNames.filter((s: string) => s.includes("put") || s.includes("strangle") || s.includes("condor") || s.includes("lizard") || s.includes("butterfly")).length;
    const breakoutCount = stratNames.filter((s: string) => s.includes("call") || s.includes("breakout") || s.includes("momentum")).length;
    let styleTag = "Unknown";
    if (trades.length >= 5) {
      if (premiumCount / trades.length > 0.5) styleTag = "Premium Seller";
      else if (breakoutCount / trades.length > 0.4) styleTag = "Breakout Trader";
      else styleTag = "Swing Trader";
    }

    // Weak spots (simple heuristics)
    const weakSpots: string[] = [];
    const earningsTrades = trades.filter((t: any) => t.strategy?.toLowerCase().includes("earnings"));
    if (earningsTrades.length > 0) {
      const earningsWR = earningsTrades.filter((t: any) => parseFloat(t.pnl ?? "0") > 0).length / earningsTrades.length;
      if (earningsWR < 0.4) weakSpots.push(`Earnings trades: ${(earningsWR * 100).toFixed(0)}% win rate — consider avoiding or using defined-risk structures`);
    }
    if (losers.length > 0 && avgLoss > avgWin * 2) {
      weakSpots.push(`Average loss ($${avgLoss.toFixed(0)}) is more than 2x average win ($${avgWin.toFixed(0)}) — tighten stop losses`);
    }
    if (winRate < 45 && trades.length >= 10) {
      weakSpots.push(`Win rate is ${winRate.toFixed(0)}% — review entry criteria and consider being more selective`);
    }

    const now = Date.now();
    const profileData = {
      userId: ctx.user.id,
      styleTag,
      topStrategy1: stratRanked[0]?.name ?? null,
      topStrategy1WinRate: stratRanked[0]?.winRate?.toFixed(2) ?? null,
      topStrategy2: stratRanked[1]?.name ?? null,
      topStrategy2WinRate: stratRanked[1]?.winRate?.toFixed(2) ?? null,
      topStrategy3: stratRanked[2]?.name ?? null,
      topStrategy3WinRate: stratRanked[2]?.winRate?.toFixed(2) ?? null,
      weakSpot1: weakSpots[0] ?? null,
      weakSpot2: weakSpots[1] ?? null,
      weakSpot3: weakSpots[2] ?? null,
      totalTrades: trades.length,
      winRate: winRate.toFixed(2),
      avgWin: avgWin.toFixed(2),
      avgLoss: avgLoss.toFixed(2),
      profitFactor: profitFactor.toFixed(2),
      ruleCompliancePct: "100.00",
      computedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    // Upsert
    await db.execute(
      sql`INSERT INTO playbook_style_profile
          (user_id, style_tag, top_strategy_1, top_strategy_1_win_rate, top_strategy_2, top_strategy_2_win_rate,
           top_strategy_3, top_strategy_3_win_rate, weak_spot_1, weak_spot_2, weak_spot_3,
           total_trades, win_rate, avg_win, avg_loss, profit_factor, rule_compliance_pct,
           rules_checked_this_month, rules_violated_this_month, computed_at, created_at, updated_at)
          VALUES (${profileData.userId}, ${profileData.styleTag}, ${profileData.topStrategy1}, ${profileData.topStrategy1WinRate},
                  ${profileData.topStrategy2}, ${profileData.topStrategy2WinRate}, ${profileData.topStrategy3}, ${profileData.topStrategy3WinRate},
                  ${profileData.weakSpot1}, ${profileData.weakSpot2}, ${profileData.weakSpot3},
                  ${profileData.totalTrades}, ${profileData.winRate}, ${profileData.avgWin}, ${profileData.avgLoss},
                  ${profileData.profitFactor}, ${profileData.ruleCompliancePct}, 0, 0,
                  ${profileData.computedAt}, ${profileData.createdAt}, ${profileData.updatedAt})
          ON DUPLICATE KEY UPDATE
            style_tag = VALUES(style_tag), top_strategy_1 = VALUES(top_strategy_1),
            top_strategy_1_win_rate = VALUES(top_strategy_1_win_rate), top_strategy_2 = VALUES(top_strategy_2),
            top_strategy_2_win_rate = VALUES(top_strategy_2_win_rate), top_strategy_3 = VALUES(top_strategy_3),
            top_strategy_3_win_rate = VALUES(top_strategy_3_win_rate), weak_spot_1 = VALUES(weak_spot_1),
            weak_spot_2 = VALUES(weak_spot_2), weak_spot_3 = VALUES(weak_spot_3),
            total_trades = VALUES(total_trades), win_rate = VALUES(win_rate), avg_win = VALUES(avg_win),
            avg_loss = VALUES(avg_loss), profit_factor = VALUES(profit_factor),
            computed_at = VALUES(computed_at), updated_at = VALUES(updated_at)`
    );

    return profileData;
  }),

  // ── Check rules against a trade context (for Playbook badges) ───────────────
  checkTrade: protectedProcedure
    .input(z.object({
      ticker: z.string(),
      strategy: z.string(),
      daysToEarnings: z.number().optional(),
      openInterest: z.number().optional(),
      bidAskSpreadPct: z.number().optional(),
      ivrRank: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { violations: [], warnings: [], passed: true };

      const rulesRows = await db.execute(
        sql`SELECT * FROM playbook_rules WHERE user_id = ${ctx.user.id} AND is_active = 1`
      );
      const rules = ((rulesRows as any).rows ?? rulesRows ?? []) as any[];

      const violations: { ruleId: number; ruleText: string; ruleType: string }[] = [];
      const warnings: { ruleId: number; ruleText: string; ruleType: string }[] = [];

      for (const rule of rules) {
        let triggered = false;
        const text = (rule.rule_text ?? "").toLowerCase();

        // Earnings check
        if ((text.includes("earnings") || text.includes("5 days")) && input.daysToEarnings != null && input.daysToEarnings <= 5) {
          triggered = true;
        }
        // OI check
        if (text.includes("open interest") && text.includes("500") && input.openInterest != null && input.openInterest < 500) {
          triggered = true;
        }
        // Bid/ask check
        if (text.includes("bid/ask") && text.includes("5%") && input.bidAskSpreadPct != null && input.bidAskSpreadPct > 5) {
          triggered = true;
        }
        // IVR check
        if (text.includes("ivr") && text.includes("30") && input.ivrRank != null && input.ivrRank < 30) {
          triggered = true;
        }

        if (triggered) {
          const entry = { ruleId: rule.id, ruleText: rule.rule_text, ruleType: rule.ruleType };
          if (rule.ruleType === "hard_block") violations.push(entry);
          else warnings.push(entry);
        }
      }

      return {
        violations,
        warnings,
        passed: violations.length === 0,
        badge: violations.length > 0 ? "block" : warnings.length > 0 ? "warn" : "pass",
      };
    }),
});
