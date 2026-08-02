/**
 * tradeSetup.ts — Trade Setup Card backend
 * Signals: Trend, MA20/50, RelVol, RSI, ATR, IVR, VWAP, CTA Flow
 * Unified scoring → GO / CAUTION / NO-GO verdict + execution summary
 */
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { callDataApi } from "../_core/dataApi";

interface PriceBar { date: string; open: number; high: number; low: number; close: number; volume: number; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseBarsFromResult(result: unknown): PriceBar[] {
  const data = result as any;
  const chart = data?.chart?.result?.[0];
  if (!chart) return [];
  const timestamps: number[] = chart.timestamp ?? [];
  const q = chart.indicators?.quote?.[0] ?? {};
  return timestamps.map((ts: number, i: number) => ({
    date: new Date(ts * 1000).toISOString(),
    open: q.open?.[i] ?? 0, high: q.high?.[i] ?? 0,
    low: q.low?.[i] ?? 0, close: q.close?.[i] ?? 0, volume: q.volume?.[i] ?? 0,
  })).filter((b) => b.close > 0);
}

async function fetchBars(ticker: string, interval: "1d" | "5m", range: string): Promise<PriceBar[]> {
  // Retry up to 3 times with delay to handle Yahoo Finance throttling
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await callDataApi("YahooFinance/get_stock_chart", { query: { symbol: ticker, interval, range } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dbg = result as any;
      console.log(`[tradeSetup] fetchBars ${ticker} ${interval} attempt=${attempt} chart=${!!dbg?.chart?.result?.[0]} timestamps=${dbg?.chart?.result?.[0]?.timestamp?.length ?? 0} error=${JSON.stringify(dbg?.chart?.error ?? null)}`);
      const bars = parseBarsFromResult(result);
      if (bars.length > 0) return bars;
    } catch (e) { console.log(`[tradeSetup] fetchBars ${ticker} attempt=${attempt} EXCEPTION:`, e); }
    if (attempt < 2) await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
  }
  // Fallback: try a longer range for daily bars to ensure enough history for MA50
  if (interval === "1d") {
    const fallbackRange = range === "3mo" ? "6mo" : range === "6mo" ? "1y" : null;
    if (fallbackRange) {
      try {
        const result = await callDataApi("YahooFinance/get_stock_chart", { query: { symbol: ticker, interval, range: fallbackRange } });
        const bars = parseBarsFromResult(result);
        if (bars.length > 0) return bars;
      } catch { /* ignore */ }
    }
  }
  return [];
}

function calcRSI(bars: PriceBar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const closes = bars.map((b) => b.close);
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses += Math.abs(diff);
  }
  const avgGain = gains / period, avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return Math.round(100 - 100 / (1 + avgGain / avgLoss));
}

function calcATR(bars: PriceBar[], period = 14): number {
  if (bars.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    trs.push(Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i-1].close), Math.abs(bars[i].low - bars[i-1].close)));
  }
  const slice = trs.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

function calcRelVolume(bars: PriceBar[]): number {
  if (bars.length < 2) return 1;
  const today = bars[bars.length - 1].volume;
  const lookback = bars.slice(-21, -1);
  if (!lookback.length) return 1;
  const avg = lookback.reduce((s, b) => s + b.volume, 0) / lookback.length;
  return avg === 0 ? 1 : Math.round((today / avg) * 100) / 100;
}

function calcVWAP(bars: PriceBar[]): number | null {
  if (!bars.length) return null;
  let cumPV = 0, cumVol = 0;
  for (const b of bars) { const t = (b.high + b.low + b.close) / 3; cumPV += t * b.volume; cumVol += b.volume; }
  return cumVol === 0 ? null : Math.round((cumPV / cumVol) * 100) / 100;
}

function detectTrend(bars: PriceBar[]): {
  trend: "UPTREND" | "DOWNTREND" | "CONSOLIDATION"; structure: string;
  ma20: number; ma50: number; priceVsMa20: "ABOVE" | "BELOW"; priceVsMa50: "ABOVE" | "BELOW";
} {
  if (bars.length < 10) return { trend: "CONSOLIDATION", structure: "Insufficient data", ma20: 0, ma50: 0, priceVsMa20: "BELOW", priceVsMa50: "BELOW" };
  const closes = bars.map((b) => b.close);
  const current = closes[closes.length - 1];
  const ma20Slice = closes.slice(-20);
  const ma20 = ma20Slice.length > 0 ? Math.round(ma20Slice.reduce((s, v) => s + v, 0) / ma20Slice.length * 100) / 100 : 0;
  const ma50Slice = closes.slice(-50);
  const ma50 = ma50Slice.length > 0 ? Math.round(ma50Slice.reduce((s, v) => s + v, 0) / ma50Slice.length * 100) / 100 : 0;
  const half = Math.floor(closes.length / 2);
  const firstHalfAvg = closes.slice(0, half).reduce((s, v) => s + v, 0) / half;
  const secondHalfAvg = closes.slice(half).reduce((s, v) => s + v, 0) / (closes.length - half);
  const pctChange = (secondHalfAvg - firstHalfAvg) / firstHalfAvg;
  const recent = bars.slice(-10), prior = bars.slice(-20, -10);
  const hhhl = Math.max(...recent.map(b => b.high)) > Math.max(...prior.map(b => b.high)) && Math.min(...recent.map(b => b.low)) > Math.min(...prior.map(b => b.low));
  const lhll = Math.max(...recent.map(b => b.high)) < Math.max(...prior.map(b => b.high)) && Math.min(...recent.map(b => b.low)) < Math.min(...prior.map(b => b.low));
  let trend: "UPTREND" | "DOWNTREND" | "CONSOLIDATION";
  let structure: string;
  if (pctChange > 0.03 || hhhl) { trend = "UPTREND"; structure = hhhl ? "Higher Highs + Higher Lows (HH/HL)" : "Rising price action"; }
  else if (pctChange < -0.03 || lhll) { trend = "DOWNTREND"; structure = lhll ? "Lower Highs + Lower Lows (LH/LL)" : "Falling price action"; }
  else { trend = "CONSOLIDATION"; structure = "Range-bound / No clear direction"; }
  return { trend, structure, ma20, ma50, priceVsMa20: current >= ma20 ? "ABOVE" : "BELOW", priceVsMa50: current >= ma50 ? "ABOVE" : "BELOW" };
}

/**
 * CTA Flow Detection — 50-day MA cross detection
 * CTAs (systematic trend-following hedge funds) trigger coordinated entries on 50-day MA crosses.
 */
function detectCTAFlow(bars: PriceBar[], ma50: number): {
  ctaSignal: "TAILWIND" | "HEADWIND" | "APPROACHING_FLIP" | "NEUTRAL";
  ctaLabel: string; ctaDetail: string;
  recentCross: boolean; crossDirection: "UP" | "DOWN" | "NONE"; distanceFromMa50Pct: number;
} {
  if (bars.length < 6 || ma50 === 0) {
    return { ctaSignal: "NEUTRAL", ctaLabel: "No CTA Data", ctaDetail: "Insufficient price history", recentCross: false, crossDirection: "NONE", distanceFromMa50Pct: 0 };
  }
  const current = bars[bars.length - 1].close;
  const distanceFromMa50Pct = Math.round(((current - ma50) / ma50) * 10000) / 100;
  const aboveNow = current >= ma50;
  // Detect cross in last 5 bars by checking rolling MA50
  let recentCross = false;
  let crossDirection: "UP" | "DOWN" | "NONE" = "NONE";
  const closes = bars.map((b) => b.close);
  for (let i = Math.max(50, bars.length - 5); i < bars.length; i++) {
    if (i < 50) continue;
    const prevMa = closes.slice(i - 50, i).reduce((s, v) => s + v, 0) / 50;
    const currMa = closes.slice(i - 49, i + 1).reduce((s, v) => s + v, 0) / 50;
    const prevClose = closes[i - 1], currClose = closes[i];
    if (prevClose < prevMa && currClose >= currMa) { recentCross = true; crossDirection = "UP"; }
    else if (prevClose > prevMa && currClose <= currMa) { recentCross = true; crossDirection = "DOWN"; }
  }
  const nearFlip = Math.abs(distanceFromMa50Pct) <= 2.0;
  let ctaSignal: "TAILWIND" | "HEADWIND" | "APPROACHING_FLIP" | "NEUTRAL";
  let ctaLabel: string, ctaDetail: string;
  if (nearFlip) {
    ctaSignal = "APPROACHING_FLIP";
    ctaLabel = "Approaching CTA Flip";
    ctaDetail = `Price is ${Math.abs(distanceFromMa50Pct)}% from the 50-day MA ($${ma50.toFixed(2)}). CTA funds may trigger a coordinated entry soon — watch for volume surge.`;
  } else if (aboveNow) {
    ctaSignal = "TAILWIND";
    ctaLabel = recentCross ? "CTA Tailwind (Fresh Cross)" : "CTA Tailwind";
    ctaDetail = recentCross
      ? `Price just crossed ABOVE the 50-day MA ($${ma50.toFixed(2)}) — CTA funds are likely entering long. Ride the momentum.`
      : `Price is ${distanceFromMa50Pct}% above the 50-day MA ($${ma50.toFixed(2)}). CTA flows are supporting the uptrend.`;
  } else {
    ctaSignal = "HEADWIND";
    ctaLabel = recentCross ? "CTA Headwind (Fresh Cross)" : "CTA Headwind";
    ctaDetail = recentCross
      ? `Price just crossed BELOW the 50-day MA ($${ma50.toFixed(2)}) — CTA funds are likely entering short. Get out of the way of longs.`
      : `Price is ${Math.abs(distanceFromMa50Pct)}% below the 50-day MA ($${ma50.toFixed(2)}). CTA flows are pressuring the downtrend.`;
  }
  return { ctaSignal, ctaLabel, ctaDetail, recentCross, crossDirection, distanceFromMa50Pct };
}

/**
 * Unified Signal Scoring Engine
 * Max 10 points → GO (>=7) / CAUTION (>=4) / NO-GO (<4)
 */
function computeVerdict(params: {
  trend: "UPTREND" | "DOWNTREND" | "CONSOLIDATION";
  ctaSignal: "TAILWIND" | "HEADWIND" | "APPROACHING_FLIP" | "NEUTRAL";
  volLabel: "STRONG" | "NORMAL" | "WEAK";
  vwapSignal: "ABOVE" | "BELOW" | "N/A";
  rsiLabel: "OVERSOLD" | "NEUTRAL" | "OVERBOUGHT" | "N/A";
  ivrLabel: "RICH" | "NORMAL" | "CHEAP";
  priceVsMa20: "ABOVE" | "BELOW";
  recentCross: boolean; crossDirection: "UP" | "DOWN" | "NONE";
  suggestedStrategy: string; atr: number; currentPrice: number;
}): {
  verdict: "GO" | "CAUTION" | "NO-GO"; score: number; maxScore: number;
  signals: Array<{ label: string; value: string; status: "green" | "yellow" | "red" | "gray" }>;
  executionSummary: string; conflictWarning: string | null;
} {
  const { trend, ctaSignal, volLabel, vwapSignal, rsiLabel, ivrLabel, priceVsMa20, recentCross, crossDirection, suggestedStrategy, atr, currentPrice } = params;
  const trendScore = trend === "UPTREND" ? 3 : trend === "CONSOLIDATION" ? 1 : 0;
  const ctaScore = ctaSignal === "TAILWIND" ? 2 : ctaSignal === "APPROACHING_FLIP" ? 1 : ctaSignal === "NEUTRAL" ? 1 : 0;
  const volScore = volLabel === "STRONG" ? 2 : volLabel === "NORMAL" ? 1 : 0;
  const vwapScore = vwapSignal === "ABOVE" ? 1 : vwapSignal === "N/A" ? 0.5 : 0;
  const rsiScore = rsiLabel === "NEUTRAL" ? 1 : 0.5;
  const ivrScore = ivrLabel === "NORMAL" ? 1 : 0.5;
  // Round to nearest integer so the score bar renders cleanly (no fractional bars)
  const score = Math.round(trendScore + ctaScore + volScore + vwapScore + rsiScore + ivrScore);
  const verdict: "GO" | "CAUTION" | "NO-GO" = score >= 7 ? "GO" : score >= 4 ? "CAUTION" : "NO-GO";

  const signals: Array<{ label: string; value: string; status: "green" | "yellow" | "red" | "gray" }> = [
    { label: "Price Action", value: trend === "UPTREND" ? "Uptrend (HH/HL)" : trend === "DOWNTREND" ? "Downtrend (LH/LL)" : "Consolidation", status: trend === "UPTREND" ? "green" : trend === "DOWNTREND" ? "red" : "yellow" },
    { label: "CTA Flow (50d)", value: ctaSignal === "TAILWIND" ? (recentCross ? "Tailwind — Fresh Cross Up" : "Tailwind") : ctaSignal === "HEADWIND" ? (recentCross ? "Headwind — Fresh Cross Down" : "Headwind") : ctaSignal === "APPROACHING_FLIP" ? "Approaching Flip Zone" : "Neutral", status: ctaSignal === "TAILWIND" ? "green" : ctaSignal === "HEADWIND" ? "red" : "yellow" },
    { label: "Volume", value: `${volLabel} (Rel Vol)`, status: volLabel === "STRONG" ? "green" : volLabel === "NORMAL" ? "yellow" : "red" },
    { label: "VWAP", value: vwapSignal === "N/A" ? "Pre-market / N/A" : `Price ${vwapSignal} VWAP`, status: vwapSignal === "ABOVE" ? "green" : vwapSignal === "BELOW" ? "red" : "gray" },
    { label: "RSI(14)", value: rsiLabel === "NEUTRAL" ? "Neutral (30–70)" : rsiLabel === "OVERSOLD" ? "Oversold (<30)" : rsiLabel === "OVERBOUGHT" ? "Overbought (>70)" : "N/A", status: rsiLabel === "NEUTRAL" ? "green" : rsiLabel === "N/A" ? "gray" : "yellow" },
    { label: "IV Rank", value: ivrLabel === "RICH" ? "Rich — sell premium" : ivrLabel === "CHEAP" ? "Cheap — buy premium" : "Normal", status: ivrLabel === "NORMAL" ? "green" : "yellow" },
    { label: "vs MA20", value: priceVsMa20 === "ABOVE" ? "Price above MA20" : "Price below MA20", status: priceVsMa20 === "ABOVE" ? "green" : "red" },
  ];

  let conflictWarning: string | null = null;
  if (ctaSignal === "HEADWIND" && trend === "UPTREND") conflictWarning = "CTA Conflict: Uptrend but price is below 50-day MA. CTA funds may be selling — wait for reclaim before entering longs.";
  else if (ctaSignal === "TAILWIND" && trend === "DOWNTREND") conflictWarning = "CTA Conflict: Downtrend but price is above 50-day MA. Mixed signals — reduce size or wait for clarity.";
  else if (crossDirection === "DOWN" && recentCross) conflictWarning = "Fresh CTA Sell Signal: Price just crossed below the 50-day MA. Systematic selling may be incoming — get out of the way.";

  const atrStr = `$${atr.toFixed(2)}`;
  const stopStr = `$${(currentPrice - atr * 1.5).toFixed(2)}`;
  let executionSummary = "";
  if (verdict === "GO") executionSummary = `All systems aligned. ${suggestedStrategy}. Size per ATR (${atrStr}): suggested stop at ${stopStr}. CTA flow is ${ctaSignal === "TAILWIND" ? "supporting" : "not opposing"} the trade.`;
  else if (verdict === "CAUTION") executionSummary = `Mixed signals — reduce size or wait for one more confirmation. ${suggestedStrategy}. Key watch: ${ctaSignal === "APPROACHING_FLIP" ? "50-day MA flip zone — volume surge = entry trigger" : volLabel === "WEAK" ? "volume needs to pick up" : "trend needs to clarify"}.`;
  else executionSummary = `Do not enter. ${ctaSignal === "HEADWIND" ? "CTA flows are against you — fighting systematic selling." : "Price action and indicators are not aligned."} Wait for trend + CTA to agree before risking capital.`;

  return { verdict, score, maxScore: 10, signals, executionSummary, conflictWarning };
}

const IV_RANGES: Record<string, { low: number; high: number }> = {
  SPY: { low: 10, high: 35 }, QQQ: { low: 12, high: 40 }, IWM: { low: 15, high: 45 },
  AAPL: { low: 18, high: 55 }, MSFT: { low: 18, high: 50 }, NVDA: { low: 35, high: 90 },
  AMZN: { low: 22, high: 60 }, GOOGL: { low: 20, high: 55 }, META: { low: 25, high: 70 },
  TSLA: { low: 45, high: 120 }, AMD: { low: 40, high: 95 }, INTC: { low: 25, high: 70 },
  MU: { low: 35, high: 85 }, SNDK: { low: 40, high: 130 }, WDC: { low: 35, high: 90 },
  AVGO: { low: 25, high: 65 }, ORCL: { low: 20, high: 55 }, CRM: { low: 25, high: 65 },
  NFLX: { low: 28, high: 75 }, UBER: { low: 35, high: 80 }, COIN: { low: 60, high: 150 },
  MSTR: { low: 70, high: 180 }, PLTR: { low: 50, high: 120 }, SMCI: { low: 55, high: 140 },
  GLD: { low: 8, high: 22 }, TLT: { low: 10, high: 28 }, XLE: { low: 18, high: 45 },
  SOXL: { low: 80, high: 200 }, TQQQ: { low: 50, high: 130 }, DRAM: { low: 30, high: 80 },
};

function computeIVR(ticker: string, currentIV: number): number {
  const range = IV_RANGES[ticker.toUpperCase()] ?? { low: 20, high: 80 };
  if (range.high === range.low) return 50;
  return Math.round(Math.max(0, Math.min(100, ((currentIV - range.low) / (range.high - range.low)) * 100)));
}

function strategyFromSignals(trend: string, rsi: number | null, ivr: number, relVol: number): { strategy: string; rationale: string; confidence: "HIGH" | "MEDIUM" | "LOW" } {
  const highIV = ivr >= 50, lowIV = ivr < 30;
  const oversold = rsi !== null && rsi < 30, overbought = rsi !== null && rsi > 70;
  const strongVol = relVol >= 1.5;
  if (trend === "UPTREND" && highIV && !overbought) return { strategy: "Sell Cash-Secured Put or Bull Put Spread", rationale: `Uptrend + IV Rank ${ivr}% (rich). Sell puts below support to collect elevated premium with bullish bias.`, confidence: "HIGH" };
  if (trend === "UPTREND" && strongVol && oversold) return { strategy: "Buy Call Debit Spread", rationale: `Oversold bounce in uptrend with strong volume (${relVol}x avg). Low IV favors buying spreads.`, confidence: "HIGH" };
  if (trend === "DOWNTREND" && highIV && !oversold) return { strategy: "Sell Bear Call Spread", rationale: `Downtrend + IV Rank ${ivr}% (rich). Sell calls above resistance with bearish bias.`, confidence: "HIGH" };
  if (trend === "CONSOLIDATION" && highIV) return { strategy: "Short Strangle or Iron Condor", rationale: `Range-bound + IV Rank ${ivr}% (rich). Sell both sides to collect theta.`, confidence: "MEDIUM" };
  if (trend === "UPTREND" && lowIV && strongVol) return { strategy: "Buy Call or Call Debit Spread", rationale: `Uptrend + low IV (${ivr}%) + strong volume (${relVol}x). Cheap options — buy directional exposure.`, confidence: "MEDIUM" };
  if (trend === "DOWNTREND" && lowIV) return { strategy: "Buy Put or Put Debit Spread", rationale: `Downtrend with cheap IV. Favorable to buy directional puts.`, confidence: "MEDIUM" };
  if (oversold && trend !== "DOWNTREND") return { strategy: "Wait for Bounce Confirmation", rationale: `RSI ${rsi} (oversold). Wait for price to reclaim MA20 before entering.`, confidence: "LOW" };
  if (overbought && trend !== "UPTREND") return { strategy: "Watch for Fade — Bear Call Spread on Confirmation", rationale: `RSI ${rsi} (overbought) in non-uptrend. Wait for break below MA20.`, confidence: "LOW" };
  return { strategy: "No Clear Setup — Wait", rationale: "Mixed signals. Price action, volume, and IV do not align. Sit on hands.", confidence: "LOW" };
}

export const tradeSetupRouter = router({
  getSetup: publicProcedure
    .input(z.object({ ticker: z.string().min(1).max(10).toUpperCase() }))
    .query(async ({ input }) => {
      const { ticker } = input;
      const dailyBars = await fetchBars(ticker, "1d", "3mo");
      const intradayBars = await fetchBars(ticker, "5m", "1d");
      const currentPrice = dailyBars.length > 0 ? dailyBars[dailyBars.length - 1].close : 0;
      const todayBar = dailyBars[dailyBars.length - 1];
      const trendData = detectTrend(dailyBars);
      const rsi = calcRSI(dailyBars);
      const atr = Math.round(calcATR(dailyBars) * 100) / 100;
      const atrPct = currentPrice > 0 ? Math.round((atr / currentPrice) * 10000) / 100 : 0;
      const suggestedStrangleDistance = Math.round(atr * 1.5);
      const suggestedSpreadDistance = Math.round(atr * 1.0);
      const relVol = calcRelVolume(dailyBars);
      const vwap = calcVWAP(intradayBars);
      const vwapSignal: "ABOVE" | "BELOW" | "N/A" = vwap === null ? "N/A" : currentPrice >= vwap ? "ABOVE" : "BELOW";
      let iv30 = 0, ivr = 0;
      try {
        const quoteResult = await callDataApi("YahooFinance/get_stock_quote", { query: { symbol: ticker } });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const q: any = (quoteResult as any)?.quoteResponse?.result?.[0] ?? quoteResult;
        iv30 = Math.round((q?.impliedSharesOutstanding ?? q?.impliedVolatility ?? 0) * 100) / 100;
        if (iv30 === 0 && dailyBars.length >= 21) {
          const closes = dailyBars.slice(-21).map((b) => b.close);
          const returns = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
          const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
          const variance = returns.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / returns.length;
          iv30 = Math.round(Math.sqrt(variance * 252) * 100);
        }
        ivr = computeIVR(ticker, iv30);
      } catch { ivr = 50; }

      let rsiLabel: "OVERSOLD" | "NEUTRAL" | "OVERBOUGHT" | "N/A" = "N/A";
      if (rsi !== null) { if (rsi < 30) rsiLabel = "OVERSOLD"; else if (rsi > 70) rsiLabel = "OVERBOUGHT"; else rsiLabel = "NEUTRAL"; }
      let volLabel: "STRONG" | "NORMAL" | "WEAK";
      if (relVol >= 1.5) volLabel = "STRONG"; else if (relVol >= 0.7) volLabel = "NORMAL"; else volLabel = "WEAK";
      const ivrLabel: "RICH" | "NORMAL" | "CHEAP" = ivr >= 50 ? "RICH" : ivr >= 30 ? "NORMAL" : "CHEAP";

      const ctaData = detectCTAFlow(dailyBars, trendData.ma50);
      const suggestion = strategyFromSignals(trendData.trend, rsi, ivr, relVol);
      const verdictData = computeVerdict({
        trend: trendData.trend, ctaSignal: ctaData.ctaSignal, volLabel, vwapSignal, rsiLabel, ivrLabel,
        priceVsMa20: trendData.priceVsMa20, recentCross: ctaData.recentCross, crossDirection: ctaData.crossDirection,
        suggestedStrategy: suggestion.strategy, atr, currentPrice,
      });

      return {
        ticker, currentPrice,
        dayChange: todayBar ? Math.round((todayBar.close - todayBar.open) * 100) / 100 : 0,
        dayChangePct: todayBar && todayBar.open > 0 ? Math.round(((todayBar.close - todayBar.open) / todayBar.open) * 10000) / 100 : 0,
        trend: trendData.trend, trendStructure: trendData.structure,
        ma20: trendData.ma20, ma50: trendData.ma50, priceVsMa20: trendData.priceVsMa20, priceVsMa50: trendData.priceVsMa50,
        relVol, volLabel, rsi, rsiLabel,
        atr, atrPct, suggestedStrangleDistance, suggestedSpreadDistance,
        iv30, ivr, ivrLabel, vwap, vwapSignal,
        ctaSignal: ctaData.ctaSignal, ctaLabel: ctaData.ctaLabel, ctaDetail: ctaData.ctaDetail,
        ctaRecentCross: ctaData.recentCross, ctaCrossDirection: ctaData.crossDirection, ctaDistanceFromMa50Pct: ctaData.distanceFromMa50Pct,
        verdict: verdictData.verdict, verdictScore: verdictData.score, verdictMaxScore: verdictData.maxScore,
        verdictSignals: verdictData.signals, executionSummary: verdictData.executionSummary, conflictWarning: verdictData.conflictWarning,
        suggestedStrategy: suggestion.strategy, strategyRationale: suggestion.rationale,
        // Cap strategy confidence by overall verdict — can't be HIGH when overall is CAUTION/NO-GO
        strategyConfidence: (verdictData.verdict === "GO" ? suggestion.confidence : verdictData.verdict === "CAUTION" ? (suggestion.confidence === "HIGH" ? "MEDIUM" : suggestion.confidence) : "LOW") as "HIGH" | "MEDIUM" | "LOW",
        dataAsOf: new Date().toISOString(),
      };
    }),
});
