/**
 * Pit Advisor Router — AI Trading Research Assistant
 *
 * Procedures:
 *   pitAdvisor.chat              — multi-turn chat with PitDesk Trading Buddy persona
 *   pitAdvisor.analyzeMyTrades   — AI analysis of user's uploaded CSV trades
 *   pitAdvisor.quickResearch     — single-shot research on a ticker or strategy question
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import type { Message } from "../_core/llm";
import { callDataApi } from "../_core/dataApi";
import { getDb } from "../db";
import { uploadedTrades, manualTrades } from "../../drizzle/schema";
import { desc, eq } from "drizzle-orm";

// ─── System Prompt ─────────────────────────────────────────────────────────────

const PIT_ADVISOR_SYSTEM = `You are Pit Advisor — the AI trading research assistant built into PitDesk, a personal trading intelligence platform used by Sridhar Akula (a serious retail trader).

## Your Persona
- You are a confident, experienced trading mentor and research partner
- You analyze trades across 5 dimensions: Technical, Fundamental, Geopolitical, Sentiment, and Quantitative/Math
- You are proactive — you challenge bad setups, point out risks the trader might be ignoring
- You speak plainly and directly — no fluff, no generic disclaimers
- You give specific, actionable insights — not vague platitudes

## PitDesk Context
The platform includes:
- **PCR Dashboard**: Put/Call ratio signals for 60 tickers (EXTREME_GREED < 0.5, GREED 0.5–0.7, NEUTRAL 0.7–0.9, FEAR 0.9–1.2, EXTREME_FEAR > 1.2)
- **Velez Scanner**: Fibonacci retracement + EMA confluence signals (38.2%, 50%, 61.8% levels with EMA-9/20/50/200)
- **Opening Range Scalper (ORS)**: First 30-min range breakout strategy, entry window 10am–3pm ET
- **Previous Range Pullback (PRP)**: ICT/SMC-based BOS + pullback to 30/50/70% retracement zones
- **VCP Strategy**: Volatility Contraction Pattern (Minervini method)
- **Catalyst Breakout Watch (BCOS)**: Major S/R levels + news catalyst breakout strategy
- **IVR Alerts**: Implied Volatility Rank alerts for options premium selling
- **COT Dashboard**: Commitment of Traders data for institutional positioning
- **Trade Log**: Personal trade journal with post-trade notes and lessons
- **Trade Upload**: CSV upload of brokerage trade history for AI analysis
- **Okala 80/20 NQ System**: Integrated in ORS tab — 200s chart, 80/20 levels, NY Open only

## Brokerage Accounts
- E*TRADE -4723 (primary), E*TRADE -2738, Schwab

## Analysis Framework
When analyzing any ticker or trade, structure your response across these 5 dimensions:
1. **Technical**: Price structure, key levels, trend, momentum indicators, chart patterns
2. **Fundamental**: Earnings, revenue growth, sector health, competitive position
3. **Geopolitical**: Macro environment, sector-specific policy risks, global events
4. **Sentiment**: Options flow (PCR), institutional positioning (COT), retail sentiment
5. **Quantitative/Math**: R:R ratio, position sizing, Kelly criterion, probability of profit

## Key Rules
- Always state the R:R ratio when discussing a trade setup
- If R:R < 2:1, flag it as a concern
- For options trades, always mention IV rank (high IV = sell premium, low IV = buy premium)
- Challenge any setup where the stop is unclear or the position size is too large
- Reference PitDesk scanner signals when relevant (e.g., "PCR for NVDA is currently EXTREME_GREED — bullish")

## Response Format
- Use markdown with headers for multi-part analysis
- Keep responses focused and actionable — avoid walls of text
- Use bullet points for lists of factors
- Bold the most important insight in each section
- End complex analyses with a "Bottom Line" summary

## Okala NQ Scalping System (Built into PitDesk ORS Tab)
Sridhar has studied and integrated Okala's NQ futures scalping system. You have full knowledge of this system:

### Core Concept
- NQ price always gravitates toward the **80 and 20 levels** of every hundred (e.g., when NQ is at 21,450, key levels are 21,480 and 21,420)
- These levels act as heavy support/resistance and "magnets" for price action due to unfilled institutional orders
- Chart timeframe: **200-second candles** (not 3-min or 5-min — specifically 200s to see micro-structure)
- Trade window: **NY Open only, 9:30–10:30 AM ET** — avoid lunch hour (choppy, grinding)

### Risk Management (Non-Negotiable)
- **Stop Loss**: Hard 10-point stop on every trade, no exceptions, no widening
- **TP1**: 15 points — sell 50% of position, immediately move SL to break-even
- **Runners**: Let remaining contracts run to 30–50+ points on capitulation/trend days; 20–25 pts on choppy days
- **NQ point value**: $20/point/contract
- **Miss by >3 ticks**: Cancel the limit order, do not chase

### The 4 Setups
**Setup A — The Fork (Mean Reversion Reversal)**
1. Strong capitulatory move into an 80 or 20 level (100+ point drop/rally)
2. Capitulation candle: long wick, small body at the level
3. Initiation candle: strong bull/bear candle with NO wick on the entry side (pure buying/selling pressure)
4. Entry: next candle pulls back to initiation candle's low/high but holds → confirms higher low (long) or lower high (short)

**Setup B — The Repair Entry (Magnet)**
1. Price approaches 80/20 level but misses by 1–3 ticks (bounces at 81 or 19)
2. This leaves "unfilled orders" and poor structure (flat bottom/top, no wick)
3. As price bounces away then rolls back, enter on continuation targeting the exact missed level
4. The missed level is now a guaranteed magnet — it WILL be filled

**Setup C — The Cross Section (Pullback Rejection)**
1. Identify the dominant trend direction
2. Price pulls back against trend with 2+ strong candles
3. Mark the "cross section": the gap between close of candle 1 and open of candle 2 during the pullback
4. When price rolls back with trend and makes one more push against trend, enter on rejection of the cross section zone

**Setup D — The Lowercase h Pattern (Combination)**
1. Strong move down forms the left stem of the 'h'
2. Bounce creates a Cross Section or Repair level below
3. Price rolls over — forms the hump of the 'h'
4. One more push up fails to break the previous high (the hump)
5. Enter short at the hump top (often aligns with an 80/20 level or Cross Section)
6. Target: bottom of the left stem or the unfilled 80/20 level below

### Confluence with PitDesk Signals
- **Highest conviction**: 80/20 level aligns with PCR EXTREME_GREED on QQQ → strong long bias at 20 level
- **Highest conviction short**: 80/20 level aligns with PCR EXTREME_FEAR on QQQ → strong short bias at 80 level
- **COT alignment**: When institutional positioning (COT) aligns with the 80/20 setup direction, treat as A+ setup

### Application to Options (SPY/QQQ)
- When SPY/QQQ approaches a whole number ($550, $545) but bounces at $549.80 → that $550 becomes a magnet
- Buy 0DTE/1DTE calls/puts on the rollover targeting the exact whole-number strike
- Use the 10-point NQ equivalent (~$1 SPY move) for stop sizing
- Best on NY Open only — same timing rules apply

### Win Rate & Edge
- Okala's documented win rate: ~70% with strict rules
- Edge comes from: (1) institutional order flow at 80/20 levels, (2) strict risk management, (3) runner asymmetry
- In choppy markets (most of the time), TP1 at 15 pts is the primary profit source
- On trend days (NY Open capitulation moves), runners at 30–50+ pts generate outsized returns
- **Critical**: This is a NY Open-only system. Trading it outside 9:30–10:30 AM ET destroys the edge.`;

// ─── Market Data Helpers ───────────────────────────────────────────────────────

async function getQuote(ticker: string): Promise<string> {
  try {
    const res: any = await callDataApi("YahooFinance/get_stock_chart", {
      query: { symbol: ticker.toUpperCase(), region: "US", interval: "1d", range: "5d" },
    });
    const result = res?.chart?.result?.[0];
    if (!result) return `No data available for ${ticker}`;
    const meta = result.meta;
    const price = meta.regularMarketPrice ?? meta.previousClose;
    const prevClose = meta.previousClose ?? meta.chartPreviousClose;
    const change = prevClose ? ((price - prevClose) / prevClose * 100).toFixed(2) : "N/A";
    const hi52 = meta.fiftyTwoWeekHigh?.toFixed(2) ?? "N/A";
    const lo52 = meta.fiftyTwoWeekLow?.toFixed(2) ?? "N/A";
    return `${ticker}: $${price?.toFixed(2)} (${change}% today) | 52W Range: $${lo52}–$${hi52} | Vol: ${(meta.regularMarketVolume / 1e6).toFixed(1)}M`;
  } catch {
    return `Could not fetch quote for ${ticker}`;
  }
}

// ─── Trade Context Builder ─────────────────────────────────────────────────────

async function getUserTradeContext(userId: number, fullHistory = false): Promise<string> {
  try {
    const db = await getDb();
    if (!db) return "No trade data available";

    const limit = fullHistory ? 500 : 50;

    // 1. Uploaded CSV trades
    const csvTrades = await db
      .select()
      .from(uploadedTrades)
      .where(eq(uploadedTrades.userId, userId))
      .orderBy(desc(uploadedTrades.tradeDate))
      .limit(limit);

    // 2. Manual trades from Trade Log
    const logTrades = await db
      .select()
      .from(manualTrades)
      .where(eq(manualTrades.userId, userId))
      .orderBy(desc(manualTrades.createdAt))
      .limit(fullHistory ? 200 : 20);

    if (csvTrades.length === 0 && logTrades.length === 0) {
      return "No trade data found. Upload a CSV from the Trade Upload page or log trades in the Trade Log first.";
    }

    const parts: string[] = [];

    // ── CSV Trades Summary ──
    if (csvTrades.length > 0) {
      const withPnl = csvTrades.filter(t => t.pnl !== null);
      const wins = withPnl.filter(t => t.isWin === true);
      const totalPnl = withPnl.reduce((s, t) => s + parseFloat(t.pnl as string), 0);
      const winRate = withPnl.length > 0 ? (wins.length / withPnl.length * 100).toFixed(1) : "N/A";

      // Ticker breakdown
      const byTicker: Record<string, { count: number; pnl: number; wins: number }> = {};
      for (const t of withPnl) {
        if (!byTicker[t.ticker]) byTicker[t.ticker] = { count: 0, pnl: 0, wins: 0 };
        byTicker[t.ticker].count++;
        byTicker[t.ticker].pnl += parseFloat(t.pnl as string);
        if (t.isWin) byTicker[t.ticker].wins++;
      }
      const topTickers = Object.entries(byTicker)
        .sort((a, b) => Math.abs(b[1].pnl) - Math.abs(a[1].pnl))
        .slice(0, 5)
        .map(([ticker, d]) => `${ticker}: ${d.count} trades, ${(d.wins / d.count * 100).toFixed(0)}% WR, $${d.pnl.toFixed(0)} P&L`)
        .join("; ");

      // Strategy breakdown
      const byStrategy: Record<string, { count: number; pnl: number; wins: number }> = {};
      for (const t of withPnl) {
        const strat = t.strategy || "Unknown";
        if (!byStrategy[strat]) byStrategy[strat] = { count: 0, pnl: 0, wins: 0 };
        byStrategy[strat].count++;
        byStrategy[strat].pnl += parseFloat(t.pnl as string);
        if (t.isWin) byStrategy[strat].wins++;
      }
      const topStrategies = Object.entries(byStrategy)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 3)
        .map(([s, d]) => `${s}: ${d.count} trades, ${(d.wins / d.count * 100).toFixed(0)}% WR`)
        .join("; ");

      // Day of week breakdown
      const byDay: Record<string, { count: number; pnl: number; wins: number }> = {};
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      for (const t of withPnl) {
        const d = new Date(t.tradeDate);
        const dayName = dayNames[d.getUTCDay()];
        if (!byDay[dayName]) byDay[dayName] = { count: 0, pnl: 0, wins: 0 };
        byDay[dayName].count++;
        byDay[dayName].pnl += parseFloat(t.pnl as string);
        if (t.isWin) byDay[dayName].wins++;
      }
      const dayBreakdown = Object.entries(byDay)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([day, d]) => `${day}: ${d.count} trades, ${(d.wins / d.count * 100).toFixed(0)}% WR, $${d.pnl.toFixed(0)}`)
        .join("; ");

      let csvSection = `## UPLOADED BROKERAGE TRADES (${csvTrades.length} trades)
- Win Rate: ${winRate}% (${wins.length}W / ${withPnl.length - wins.length}L)
- Total P&L: $${totalPnl.toFixed(2)} | Avg per trade: $${withPnl.length > 0 ? (totalPnl / withPnl.length).toFixed(2) : "0"}
- Best trade: $${withPnl.length > 0 ? Math.max(...withPnl.map(t => parseFloat(t.pnl as string))).toFixed(2) : "0"} | Worst: $${withPnl.length > 0 ? Math.min(...withPnl.map(t => parseFloat(t.pnl as string))).toFixed(2) : "0"}
- Top Tickers: ${topTickers || "N/A"}
- Top Strategies: ${topStrategies || "N/A"}
- Day of Week P&L: ${dayBreakdown || "N/A"}`;

      if (fullHistory) {
        const header = "Date | Ticker | Side | Qty | Entry | Exit | P&L | P&L% | Strategy | Notes";
        const rows = csvTrades.map(t =>
          `${t.tradeDate} | ${t.ticker} | ${t.side} | ${t.qty} | ${t.entryPrice} | ${t.exitPrice ?? "open"} | ${t.pnl != null ? `$${parseFloat(t.pnl as string).toFixed(2)}` : "—"} | ${t.pnlPct != null ? `${parseFloat(t.pnlPct as string).toFixed(1)}%` : "—"} | ${t.strategy ?? "—"} | ${t.notes ?? ""}`
        ).join("\n");
        csvSection += `\n\nFULL TRADE TABLE:\n${header}\n${rows}`;
      } else {
        csvSection += `\n- Recent: ${csvTrades.slice(0, 5).map(t => `${t.ticker} ${t.side} ${t.tradeDate} ${t.pnl != null ? `$${parseFloat(t.pnl as string).toFixed(0)}` : ""}`).join(", ")}`;
      }

      parts.push(csvSection);
    }

    // ── Manual Trade Log ──
    if (logTrades.length > 0) {
      const closed = logTrades.filter(r => r.status === "closed" && r.realizedPnl != null);
      const wins = closed.filter(r => parseFloat(r.realizedPnl as string) > 0);
      const totalPnl = closed.reduce((s, r) => s + parseFloat(r.realizedPnl as string), 0);

      let logSection = `## PITDESK TRADE LOG (${logTrades.length} trades, ${closed.length} closed)
- Win Rate: ${closed.length > 0 ? (wins.length / closed.length * 100).toFixed(1) : "N/A"}% | Total P&L: $${totalPnl.toFixed(2)}`;

      if (fullHistory) {
        const header = "Date | Time | Ticker | Strategy | Entry | Exit | P&L | Notes | Lessons";
        const rows = logTrades.map(r =>
          `${r.entryDate ?? "—"} | ${r.entryTime ?? "—"} | ${r.ticker} | ${r.strategyType} | ${r.entryPrice ?? "—"} | ${r.exitPrice ?? "open"} | ${r.realizedPnl != null ? `$${parseFloat(r.realizedPnl as string).toFixed(2)}` : "—"} | ${r.notes ?? ""} | ${r.lessonsLearned ?? ""}`
        ).join("\n");
        logSection += `\n\nFULL LOG TABLE:\n${header}\n${rows}`;
      } else {
        const recentWithNotes = logTrades
          .filter(r => r.notes || r.lessonsLearned)
          .slice(0, 3)
          .map(r => `${r.ticker} (${r.strategyType}): ${r.notes ?? ""} | Lesson: ${r.lessonsLearned ?? ""}`)
          .join("\n");
        if (recentWithNotes) logSection += `\n- Recent notes:\n${recentWithNotes}`;
      }

      parts.push(logSection);
    }

    return parts.join("\n\n");
  } catch (err) {
    console.error("getUserTradeContext error:", err);
    return "Error fetching trade data";
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const pitAdvisorRouter = router({
  // Multi-turn chat
  chat: protectedProcedure
    .input(z.object({
      messages: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })),
      includeTradeContext: z.boolean().default(false),
      fullTradeHistory: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      let systemContent = PIT_ADVISOR_SYSTEM;

      // Inject trade context (summary or full history)
      if (input.includeTradeContext) {
        const tradeContext = await getUserTradeContext(ctx.user.id, input.fullTradeHistory);
        systemContent += `\n\n# USER TRADE DATA\n${tradeContext}`;
      }

      const messages: Message[] = [
        { role: "system", content: systemContent },
        ...input.messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      ];

      const result = await invokeLLM({
        messages,
        maxTokens: 2500,
      });

      const content = typeof result.choices[0]?.message?.content === "string"
        ? result.choices[0].message.content
        : "";
      return { content, usage: result.usage };
    }),

  // Analyze user's uploaded trades with AI
  analyzeMyTrades: protectedProcedure
    .input(z.object({
      focus: z.enum(["overall", "winners", "losers", "strategies", "tickers", "timing", "dayofweek"]).default("overall"),
    }))
    .mutation(async ({ ctx, input }) => {
      const tradeContext = await getUserTradeContext(ctx.user.id, true);

      if (tradeContext.startsWith("No trade data")) {
        return { content: tradeContext };
      }

      const focusPrompts: Record<string, string> = {
        overall: "Give me a comprehensive analysis of my trading performance. What are my strengths and weaknesses? What patterns do you see? Be specific and direct.",
        winners: "Analyze my winning trades in detail. What strategies, setups, tickers, and times of day are working best? How can I do more of what's working?",
        losers: "Analyze my losing trades. What are the common mistakes, bad setups, or recurring errors? What should I stop doing immediately?",
        strategies: "Which trading strategies are working best for me based on my full trade history? Which should I abandon? Give me a ranked list with specific win rates.",
        tickers: "Which tickers am I trading best and worst? Should I focus on fewer tickers? Which ones should I cut from my watchlist?",
        timing: "Are there patterns in my trade timing? Am I better at certain times of day? When should I avoid trading based on my history?",
        dayofweek: "Analyze my performance by day of the week. Which days am I most profitable? Which days should I trade smaller or not at all? Give me a specific day-by-day breakdown with win rates and P&L.",
      };

      const messages: Message[] = [
        { role: "system", content: PIT_ADVISOR_SYSTEM + `\n\n# USER TRADE DATA\n${tradeContext}` },
        { role: "user", content: focusPrompts[input.focus] },
      ];

      const result = await invokeLLM({ messages, maxTokens: 2500 });
      const content = typeof result.choices[0]?.message?.content === "string"
        ? result.choices[0].message.content : "";
      return { content };
    }),

  // Quick research on a ticker
  quickResearch: protectedProcedure
    .input(z.object({
      ticker: z.string().max(10),
      question: z.string().max(500).default("Give me a full 5-dimension analysis for a potential options trade"),
    }))
    .mutation(async ({ input }) => {
      const quote = await getQuote(input.ticker.toUpperCase());

      const messages: Message[] = [
        { role: "system", content: PIT_ADVISOR_SYSTEM },
        {
          role: "user",
          content: `Ticker: ${input.ticker.toUpperCase()}\nCurrent Data: ${quote}\n\nQuestion: ${input.question}`,
        },
      ];

      const result = await invokeLLM({ messages, maxTokens: 2000 });
      const content = typeof result.choices[0]?.message?.content === "string"
        ? result.choices[0].message.content : "";
      return { content, ticker: input.ticker.toUpperCase(), quote };
    }),
});
