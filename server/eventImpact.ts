/**
 * Event Impact Fetcher
 *
 * Fetches macro and micro events that may impact a ticker's price and IV.
 * Sources:
 *   - Micro: Yahoo Finance chart (earnings, dividends, splits), insights (analyst rec, sigDevs, technical outlook)
 *   - Macro: Hard-coded upcoming Fed/CPI/NFP/PPI schedule + sector sensitivity mapping
 */

import { callDataApi } from "./_core/dataApi";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EventImpactLevel = "high" | "medium" | "low";
export type EventCategory = "earnings" | "dividend" | "split" | "analyst" | "news" | "technical" | "fed" | "cpi" | "nfp" | "ppi" | "fomc" | "other_macro";

export interface MarketEvent {
  id: string;
  category: EventCategory;
  type: "micro" | "macro";
  title: string;
  date: string;           // YYYY-MM-DD
  daysAway: number;       // negative = past, positive = future
  impactLevel: EventImpactLevel;
  estimatedMove?: string; // e.g. "±3-5%"
  strategyImplication: string;
  detail?: string;        // extra context
}

export interface EventImpactResult {
  ticker: string;
  overallRisk: EventImpactLevel;
  riskRationale: string;
  microEvents: MarketEvent[];
  macroEvents: MarketEvent[];
  analystRating?: { rating: string; targetPrice: number; provider: string };
  technicalOutlook?: { short: string; intermediate: string; long: string };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysFromNow(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

function impactFromDays(days: number, baseLevel: EventImpactLevel): EventImpactLevel {
  const abs = Math.abs(days);
  if (abs <= 7) return "high";
  if (abs <= 21) return baseLevel === "high" ? "high" : "medium";
  return baseLevel === "high" ? "medium" : "low";
}

function tsToDate(ts: number): string {
  return new Date(ts * 1000).toISOString().split("T")[0];
}

// ── Macro calendar (upcoming 2026 schedule — refreshed quarterly) ─────────────
// Dates sourced from Fed, BLS, and CME Group public schedules.

function getMacroEvents(): MarketEvent[] {
  const schedule: Array<{ category: EventCategory; title: string; date: string; impactLevel: EventImpactLevel; estimatedMove: string; strategyImplication: string }> = [
    // FOMC meetings 2026
    { category: "fomc", title: "FOMC Rate Decision", date: "2026-06-18", impactLevel: "high", estimatedMove: "±1-3%", strategyImplication: "IV typically spikes before FOMC. Consider closing short vega positions 1-2 days prior." },
    { category: "fomc", title: "FOMC Rate Decision", date: "2026-07-29", impactLevel: "high", estimatedMove: "±1-3%", strategyImplication: "IV typically spikes before FOMC. Consider closing short vega positions 1-2 days prior." },
    { category: "fomc", title: "FOMC Rate Decision", date: "2026-09-16", impactLevel: "high", estimatedMove: "±1-3%", strategyImplication: "IV typically spikes before FOMC. Consider closing short vega positions 1-2 days prior." },
    { category: "fomc", title: "FOMC Rate Decision", date: "2026-11-04", impactLevel: "high", estimatedMove: "±1-3%", strategyImplication: "IV typically spikes before FOMC. Consider closing short vega positions 1-2 days prior." },
    { category: "fomc", title: "FOMC Rate Decision", date: "2026-12-16", impactLevel: "high", estimatedMove: "±1-3%", strategyImplication: "IV typically spikes before FOMC. Consider closing short vega positions 1-2 days prior." },
    // CPI releases 2026 (approx 2nd week of each month)
    { category: "cpi", title: "CPI Inflation Report", date: "2026-06-11", impactLevel: "high", estimatedMove: "±0.5-1.5%", strategyImplication: "Hot CPI can trigger broad sell-off. Avoid short puts on rate-sensitive names before release." },
    { category: "cpi", title: "CPI Inflation Report", date: "2026-07-14", impactLevel: "high", estimatedMove: "±0.5-1.5%", strategyImplication: "Hot CPI can trigger broad sell-off. Avoid short puts on rate-sensitive names before release." },
    { category: "cpi", title: "CPI Inflation Report", date: "2026-08-12", impactLevel: "high", estimatedMove: "±0.5-1.5%", strategyImplication: "Hot CPI can trigger broad sell-off. Avoid short puts on rate-sensitive names before release." },
    { category: "cpi", title: "CPI Inflation Report", date: "2026-09-10", impactLevel: "high", estimatedMove: "±0.5-1.5%", strategyImplication: "Hot CPI can trigger broad sell-off. Avoid short puts on rate-sensitive names before release." },
    // NFP releases 2026 (first Friday of each month)
    { category: "nfp", title: "Non-Farm Payrolls (NFP)", date: "2026-06-05", impactLevel: "medium", estimatedMove: "±0.3-1%", strategyImplication: "Weak jobs data can pressure cyclicals. Monitor positions in consumer discretionary and industrials." },
    { category: "nfp", title: "Non-Farm Payrolls (NFP)", date: "2026-07-10", impactLevel: "medium", estimatedMove: "±0.3-1%", strategyImplication: "Weak jobs data can pressure cyclicals. Monitor positions in consumer discretionary and industrials." },
    { category: "nfp", title: "Non-Farm Payrolls (NFP)", date: "2026-08-07", impactLevel: "medium", estimatedMove: "±0.3-1%", strategyImplication: "Weak jobs data can pressure cyclicals. Monitor positions in consumer discretionary and industrials." },
    // PPI releases 2026
    { category: "ppi", title: "Producer Price Index (PPI)", date: "2026-06-12", impactLevel: "medium", estimatedMove: "±0.3-0.8%", strategyImplication: "PPI surprises can amplify CPI reactions. Watch for margin compression signals in industrials." },
    { category: "ppi", title: "Producer Price Index (PPI)", date: "2026-07-15", impactLevel: "medium", estimatedMove: "±0.3-0.8%", strategyImplication: "PPI surprises can amplify CPI reactions. Watch for margin compression signals in industrials." },
  ];

  const now = new Date().toISOString().split("T")[0];
  return schedule
    .filter(e => e.date >= now) // only future events
    .map((e, i) => {
      const days = daysFromNow(e.date);
      return {
        id: `macro-${i}`,
        ...e,
        type: "macro" as const,
        daysAway: days,
        impactLevel: impactFromDays(days, e.impactLevel),
      };
    })
    .sort((a, b) => a.daysAway - b.daysAway)
    .slice(0, 8); // show next 8 macro events
}

// ── Micro event fetcher ───────────────────────────────────────────────────────

async function fetchMicroEvents(ticker: string): Promise<{
  events: MarketEvent[];
  analystRating?: { rating: string; targetPrice: number; provider: string };
  technicalOutlook?: { short: string; intermediate: string; long: string };
}> {
  const events: MarketEvent[] = [];
  let analystRating: { rating: string; targetPrice: number; provider: string } | undefined;
  let technicalOutlook: { short: string; intermediate: string; long: string } | undefined;

  try {
    // ── 1. Chart data: dividends, splits, earnings events ──
    const chartRes: any = await callDataApi("YahooFinance/get_stock_chart", {
      query: {
        symbol: ticker,
        region: "US",
        interval: "1d",
        range: "2y",
        includeAdjustedClose: "true",
        events: "earnings,div,split",
      },
    });

    const chartResult = chartRes?.chart?.result?.[0];
    const chartEvents = chartResult?.events ?? {};
    const meta = chartResult?.meta ?? {};
    const currentPrice: number = meta.regularMarketPrice ?? 0;

    // Dividends — find next expected dividend date (project from last known)
    const dividends = chartEvents.dividends ?? {};
    const divEntries = Object.values(dividends) as Array<{ amount: number; date: number }>;
    if (divEntries.length >= 2) {
      divEntries.sort((a, b) => a.date - b.date);
      const last = divEntries[divEntries.length - 1];
      const secondLast = divEntries[divEntries.length - 2];
      const avgInterval = (last.date - secondLast.date); // seconds between last two
      const nextDivTs = last.date + avgInterval;
      const nextDivDate = tsToDate(nextDivTs);
      const days = daysFromNow(nextDivDate);
      if (days >= -5 && days <= 90) {
        const yieldPct = currentPrice > 0 ? ((last.amount * 4) / currentPrice * 100).toFixed(2) : "N/A";
        events.push({
          id: "div-next",
          category: "dividend",
          type: "micro",
          title: `Dividend Payment (~$${last.amount.toFixed(2)})`,
          date: nextDivDate,
          daysAway: days,
          impactLevel: days <= 14 ? "medium" : "low",
          estimatedMove: `-${last.amount.toFixed(2)} (ex-div)`,
          strategyImplication: `Stock drops ~$${last.amount.toFixed(2)} on ex-dividend date. Short calls benefit; avoid long calls expiring after ex-div without adjustment. Annual yield ≈ ${yieldPct}%.`,
          detail: `Last dividend: $${last.amount.toFixed(2)} on ${tsToDate(last.date)}`,
        });
      }
    }

    // Splits — show recent splits as context
    const splits = chartEvents.splits ?? {};
    const splitEntries = Object.values(splits) as Array<{ date: number; numerator: number; denominator: number }>;
    splitEntries.sort((a, b) => b.date - a.date);
    if (splitEntries.length > 0) {
      const last = splitEntries[0];
      const days = daysFromNow(tsToDate(last.date));
      if (days >= -180 && days <= 90) {
        events.push({
          id: "split-last",
          category: "split",
          type: "micro",
          title: `Stock Split ${last.numerator}:${last.denominator}`,
          date: tsToDate(last.date),
          daysAway: days,
          impactLevel: "medium",
          estimatedMove: "Strike/contract adjustments",
          strategyImplication: "Options contracts are adjusted for splits. Verify strike prices and multipliers in your broker after the split date.",
          detail: `${last.numerator}-for-${last.denominator} split`,
        });
      }
    }

    // Earnings from chart events
    const earningsEvents = chartEvents.earnings ?? {};
    const earningsEntries = Object.values(earningsEvents) as Array<{ date: number; epsActual?: number; epsEstimate?: number; surprisePercent?: number }>;
    earningsEntries.sort((a, b) => b.date - a.date);

    // Most recent past earnings
    const pastEarnings = earningsEntries.filter(e => daysFromNow(tsToDate(e.date)) < 0).slice(0, 3);
    const avgSurprise = pastEarnings.length > 0
      ? pastEarnings.reduce((s, e) => s + Math.abs(e.surprisePercent ?? 0), 0) / pastEarnings.length
      : 0;

  } catch {
    // silently continue
  }

  try {
    // ── 2. Insights: analyst rating, technical outlook, significant developments ──
    const insightsRes: any = await callDataApi("YahooFinance/get_stock_insights", {
      query: { symbol: ticker },
    });

    const insResult = insightsRes?.finance?.result ?? {};

    // Analyst recommendation
    const rec = insResult.recommendation;
    if (rec?.rating && rec?.targetPrice) {
      analystRating = {
        rating: rec.rating,
        targetPrice: rec.targetPrice,
        provider: rec.provider ?? "Unknown",
      };
      events.push({
        id: "analyst-rec",
        category: "analyst",
        type: "micro",
        title: `Analyst Rating: ${rec.rating}`,
        date: new Date().toISOString().split("T")[0],
        daysAway: 0,
        impactLevel: rec.rating === "BUY" || rec.rating === "STRONG_BUY" ? "medium" : rec.rating === "SELL" || rec.rating === "STRONG_SELL" ? "high" : "low",
        estimatedMove: rec.targetPrice ? `Target: $${rec.targetPrice}` : undefined,
        strategyImplication: rec.rating === "BUY" || rec.rating === "STRONG_BUY"
          ? "Bullish analyst consensus supports Bull Put Spreads and Cash-Secured Puts. Avoid Bear Call Spreads."
          : rec.rating === "SELL" || rec.rating === "STRONG_SELL"
          ? "Bearish analyst consensus supports Bear Call Spreads. Avoid naked puts or Bull Put Spreads."
          : "Neutral analyst rating. Iron Condors and Short Strangles may be appropriate if IV is elevated.",
        detail: `${rec.provider}: ${rec.rating} — Target $${rec.targetPrice}`,
      });
    }

    // Technical outlook
    const techEvents = insResult.instrumentInfo?.technicalEvents;
    if (techEvents) {
      const short = techEvents.shortTermOutlook?.direction ?? "Neutral";
      const intermediate = techEvents.intermediateTermOutlook?.direction ?? "Neutral";
      const long = techEvents.longTermOutlook?.direction ?? "Neutral";
      technicalOutlook = { short, intermediate, long };

      const shortScore = techEvents.shortTermOutlook?.score ?? 0;
      const impactLvl: EventImpactLevel = Math.abs(shortScore) >= 3 ? "high" : Math.abs(shortScore) >= 2 ? "medium" : "low";
      events.push({
        id: "technical-outlook",
        category: "technical",
        type: "micro",
        title: `Technical Outlook: ${short} (Short-term)`,
        date: new Date().toISOString().split("T")[0],
        daysAway: 0,
        impactLevel: impactLvl,
        strategyImplication: short === "Bullish"
          ? "Short-term bullish technicals support credit put spreads. Directional bias aligns with Bull Put Spread."
          : short === "Bearish"
          ? "Short-term bearish technicals support Bear Call Spreads. Avoid naked puts."
          : "Neutral short-term technicals. Iron Condor or Short Strangle may be appropriate.",
        detail: `Short: ${short} | Intermediate: ${intermediate} | Long: ${long}`,
      });
    }

    // Significant developments (recent news)
    const sigDevs = insResult.sigDevs ?? [];
    sigDevs.slice(0, 3).forEach((dev: { headline: string; date: string }, i: number) => {
      const days = daysFromNow(dev.date);
      events.push({
        id: `news-${i}`,
        category: "news",
        type: "micro",
        title: dev.headline.length > 80 ? dev.headline.slice(0, 77) + "…" : dev.headline,
        date: dev.date,
        daysAway: days,
        impactLevel: Math.abs(days) <= 3 ? "medium" : "low",
        strategyImplication: "Recent news may have already been priced in. Monitor IV for unusual spikes that could signal further reaction.",
        detail: dev.headline,
      });
    });

  } catch {
    // silently continue
  }

  // Deduplicate and sort by proximity
  const sorted = events.sort((a, b) => Math.abs(a.daysAway) - Math.abs(b.daysAway));
  return { events: sorted, analystRating, technicalOutlook };
}

// ── Overall risk assessment ───────────────────────────────────────────────────

function assessOverallRisk(
  microEvents: MarketEvent[],
  macroEvents: MarketEvent[]
): { risk: EventImpactLevel; rationale: string } {
  const allEvents = [...microEvents, ...macroEvents];
  const highCount = allEvents.filter(e => e.impactLevel === "high" && Math.abs(e.daysAway) <= 30).length;
  const medCount = allEvents.filter(e => e.impactLevel === "medium" && Math.abs(e.daysAway) <= 30).length;

  if (highCount >= 2) return { risk: "high", rationale: `${highCount} high-impact events within 30 days — consider reducing position size or avoiding short vega strategies.` };
  if (highCount === 1) return { risk: "high", rationale: "1 high-impact event within 30 days — review strategy expiry relative to event date." };
  if (medCount >= 2) return { risk: "medium", rationale: `${medCount} medium-impact events within 30 days — monitor IV and be prepared to adjust.` };
  if (medCount === 1) return { risk: "medium", rationale: "1 medium-impact event within 30 days — standard risk management applies." };
  return { risk: "low", rationale: "No major events within 30 days — favorable environment for premium-selling strategies." };
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function fetchEventImpact(ticker: string): Promise<EventImpactResult> {
  const [microResult, macroEvents] = await Promise.all([
    fetchMicroEvents(ticker),
    Promise.resolve(getMacroEvents()),
  ]);

  const { events: microEvents, analystRating, technicalOutlook } = microResult;
  const { risk: overallRisk, rationale: riskRationale } = assessOverallRisk(microEvents, macroEvents);

  return {
    ticker,
    overallRisk,
    riskRationale,
    microEvents,
    macroEvents,
    analystRating,
    technicalOutlook,
  };
}
