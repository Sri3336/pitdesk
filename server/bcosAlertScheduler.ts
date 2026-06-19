/**
 * bcosAlertScheduler.ts
 *
 * Runs the BCOS (Breakout Catalyst Options Strategy) near-break alert check.
 * Called by the Heartbeat cron every 30 min during market hours (Mon–Fri, 9:30–4:00 PM ET).
 *
 * Logic:
 *  1. Fetch all non-invalidated catalyst_breakout_watch rows
 *  2. Pull latest price for each ticker via Yahoo Finance
 *  3. If any ticker is within 1% of its key level, or has broken through, fire a notifyOwner alert
 *  4. Update status + lastPrice in DB
 */

import { getDb } from "./db";
import { catalystBreakoutWatch } from "../drizzle/schema";
import { callDataApi } from "./_core/dataApi";
import { notifyOwner } from "./_core/notification";
import { eq } from "drizzle-orm";

async function fetchCurrentPrice(ticker: string): Promise<{ price: number; error?: string }> {
  try {
    const resp = await callDataApi("YahooFinance/get_stock_chart", {
      query: {
        symbol: ticker,
        region: "US",
        interval: "1d",
        range: "5d",
        includeAdjustedClose: false,
      },
    });

    const respAny = resp as any;
    const result = respAny?.chart?.result?.[0];
    if (!result) return { price: 0, error: "No data" };

    const closes: number[] = result.indicators.quote[0].close ?? [];
    const n = closes.length;
    if (n === 0) return { price: 0, error: "No closes" };

    return { price: closes[n - 1] ?? 0 };
  } catch (e) {
    return { price: 0, error: String(e) };
  }
}

function computeStatus(
  price: number,
  keyLevel: number,
  direction: "resistance" | "support"
): { status: "watching" | "near_break" | "broken_out" | "broken_down"; distancePct: number } {
  const distancePct = keyLevel > 0 ? Math.abs((price - keyLevel) / keyLevel) * 100 : 0;

  if (direction === "resistance") {
    if (price > keyLevel * 1.005) return { status: "broken_out", distancePct };
    if (distancePct <= 2.0) return { status: "near_break", distancePct };
    return { status: "watching", distancePct };
  } else {
    if (price < keyLevel * 0.995) return { status: "broken_down", distancePct };
    if (distancePct <= 2.0) return { status: "near_break", distancePct };
    return { status: "watching", distancePct };
  }
}

export async function runBcosAlertCheck(): Promise<{
  checked: number;
  alerts: number;
  details: string[];
}> {
  const db = await getDb();
  if (!db) return { checked: 0, alerts: 0, details: [] };

  const items = await db.select().from(catalystBreakoutWatch);
  const alertLines: string[] = [];

  await Promise.all(
    items.map(async (item) => {
      if (item.status === "invalidated") return;

      const keyLevel = parseFloat(item.keyLevel ?? "0");
      if (keyLevel === 0) return;

      const { price, error } = await fetchCurrentPrice(item.ticker);
      if (error || price === 0) return;

      const { status: newStatus, distancePct } = computeStatus(price, keyLevel, item.direction);

      // Update DB
      await db
        .update(catalystBreakoutWatch)
        .set({
          lastPrice: String(price),
          distancePct: String(distancePct.toFixed(4)),
          status: newStatus,
          lastScannedAt: new Date(),
        })
        .where(eq(catalystBreakoutWatch.id, item.id));

      // Alert threshold: within 1% OR just broke through
      if (distancePct <= 1.0 || newStatus === "broken_out" || newStatus === "broken_down") {
        const emoji =
          newStatus === "broken_out" ? "🚀" : newStatus === "broken_down" ? "📉" : "⚠️";
        const action =
          newStatus === "broken_out"
            ? "BROKE OUT above"
            : newStatus === "broken_down"
            ? "BROKE DOWN below"
            : `within ${distancePct.toFixed(2)}% of`;

        const line = `${emoji} ${item.ticker} is ${action} key level $${keyLevel} | Price: $${price.toFixed(2)} | ${item.catalystNotes ?? item.levelLabel ?? ""}`;
        alertLines.push(line);
      }
    })
  );

  if (alertLines.length > 0) {
    const etTime = new Date().toLocaleString("en-US", {
      timeZone: "America/New_York",
      dateStyle: "medium",
      timeStyle: "short",
    });

    const content = [
      `BCOS Near-Break Alert — ${etTime} ET`,
      "",
      ...alertLines,
      "",
      "Strategy reminder: Wait for the catalyst, then buy ATM/OTM options with 30–90+ DTE.",
      "Sell 50% at +40–50% gain, let the runner ride.",
      "",
      "→ View Catalyst Watch: https://pitdesk.ai",
    ].join("\n");

    await notifyOwner({
      title: `⚡ BCOS: ${alertLines.length} level${alertLines.length > 1 ? "s" : ""} near break`,
      content,
    });
  }

  return { checked: items.length, alerts: alertLines.length, details: alertLines };
}
