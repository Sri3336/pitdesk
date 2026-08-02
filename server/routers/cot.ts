// ─── COT (Commitment of Traders) Router ───────────────────────────────────────
// Larry Williams methodology: COT Index ≥75 = BULLISH, ≤25 = BEARISH
// Data source: CFTC Socrata API (free, no auth required)

import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { callDataApi } from "../_core/dataApi";
import {
  COT_INSTRUMENTS,
  type CotWeeklyData,
  type CotIndexResult,
  type CotScanResult,
  type CotSignal,
} from "../../shared/cotTypes";

interface PricePoint {
  date: string;
  close: number;
}

const CFTC_API = "https://publicreporting.cftc.gov/resource/jun7-fc8e.json";
const LOOKBACK_WEEKS = 52; // Larry Williams uses 52-week lookback for COT Index
const BULLISH_THRESHOLD = 75;
const BEARISH_THRESHOLD = 25;

// ─── CFTC API fetch ────────────────────────────────────────────────────────────
async function fetchCotHistory(cftcCode: string, weeks: number = LOOKBACK_WEEKS + 4): Promise<CotWeeklyData[]> {
  const limit = weeks;
  const url = `${CFTC_API}?$limit=${limit}&$order=report_date_as_yyyy_mm_dd+DESC&$where=cftc_contract_market_code='${cftcCode}'`;

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`CFTC API error: ${res.status}`);

  const raw = (await res.json()) as Array<Record<string, string>>;
  if (!raw || raw.length === 0) return [];

  return raw.map((row) => {
    const commLong = parseInt(row.comm_positions_long_all ?? "0", 10);
    const commShort = parseInt(row.comm_positions_short_all ?? "0", 10);
    const nonCommLong = parseInt(row.noncomm_positions_long_all ?? "0", 10);
    const nonCommShort = parseInt(row.noncomm_positions_short_all ?? "0", 10);
    const oi = parseInt(row.open_interest_all ?? "0", 10);
    const dateStr = (row.report_date_as_yyyy_mm_dd ?? "").substring(0, 10);

    return {
      reportDate: dateStr,
      commercialLong: commLong,
      commercialShort: commShort,
      nonCommercialLong: nonCommLong,
      nonCommercialShort: nonCommShort,
      openInterest: oi,
      commercialNet: commLong - commShort,
      nonCommercialNet: nonCommLong - nonCommShort,
    } satisfies CotWeeklyData;
  });
}

// ─── Larry Williams COT Index ─────────────────────────────────────────────────
// COT Index = (Current CommNet - Min CommNet over N weeks) / (Max - Min) * 100
// Uses commercial net positions (the "smart money")
function computeCotIndex(history: CotWeeklyData[], lookback: number = LOOKBACK_WEEKS): number {
  if (history.length < 2) return 50;

  const window = history.slice(0, Math.min(lookback, history.length));
  const nets = window.map((w) => w.commercialNet);
  const current = nets[0];
  const min = Math.min(...nets);
  const max = Math.max(...nets);

  if (max === min) return 50;
  return Math.round(((current - min) / (max - min)) * 100);
}

function cotSignal(index: number): CotSignal {
  if (index >= BULLISH_THRESHOLD) return "BULLISH";
  if (index <= BEARISH_THRESHOLD) return "BEARISH";
  return "NEUTRAL";
}

// ─── Single instrument analysis ───────────────────────────────────────────────
export async function analyzeCotInstrument(cftcCode: string): Promise<CotIndexResult> {
  const instrument = COT_INSTRUMENTS.find((i) => i.cftcCode === cftcCode);
  if (!instrument) throw new Error(`Unknown CFTC code: ${cftcCode}`);

  const history = await fetchCotHistory(cftcCode, LOOKBACK_WEEKS + 4);
  if (history.length === 0) {
    return {
      instrument,
      latestDate: "",
      cotIndex: 50,
      signal: "NEUTRAL",
      commercialNet: 0,
      nonCommercialNet: 0,
      openInterest: 0,
      weeklyHistory: [],
      cotIndexChange: 0,
      commercialNetChange: 0,
      dataAge: 999,
      lookbackWeeks: LOOKBACK_WEEKS,
    };
  }

  const latest = history[0];
  const prior = history[1] ?? history[0];

  const cotIndex = computeCotIndex(history, LOOKBACK_WEEKS);
  const priorCotIndex = computeCotIndex(history.slice(1), LOOKBACK_WEEKS);

  // Data age in days
  const latestDate = new Date(latest.reportDate);
  const dataAge = Math.floor((Date.now() - latestDate.getTime()) / (1000 * 60 * 60 * 24));

  return {
    instrument,
    latestDate: latest.reportDate,
    cotIndex,
    signal: cotSignal(cotIndex),
    commercialNet: latest.commercialNet,
    nonCommercialNet: latest.nonCommercialNet,
    openInterest: latest.openInterest,
    weeklyHistory: history.slice(0, 52),
    cotIndexChange: cotIndex - priorCotIndex,
    commercialNetChange: latest.commercialNet - prior.commercialNet,
    dataAge,
    lookbackWeeks: LOOKBACK_WEEKS,
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────
export const cotRouter = router({
  // Scan all 19 instruments
  scanAll: publicProcedure.query(async (): Promise<CotScanResult> => {
    const results = await Promise.allSettled(
      COT_INSTRUMENTS.map((inst) => analyzeCotInstrument(inst.cftcCode))
    );

    const resolved = results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      // Return a fallback on error
      return {
        instrument: COT_INSTRUMENTS[i],
        latestDate: "",
        cotIndex: 50,
        signal: "NEUTRAL" as CotSignal,
        commercialNet: 0,
        nonCommercialNet: 0,
        openInterest: 0,
        weeklyHistory: [],
        cotIndexChange: 0,
        commercialNetChange: 0,
        dataAge: 999,
        lookbackWeeks: LOOKBACK_WEEKS,
      } satisfies CotIndexResult;
    });

    const bullishCount = resolved.filter((r) => r.signal === "BULLISH").length;
    const bearishCount = resolved.filter((r) => r.signal === "BEARISH").length;
    const neutralCount = resolved.filter((r) => r.signal === "NEUTRAL").length;

    return {
      results: resolved,
      scannedAt: new Date().toISOString(),
      bullishCount,
      bearishCount,
      neutralCount,
      dataSource: "CFTC",
    };
  }),

  // Single instrument detail
  getInstrument: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }): Promise<CotIndexResult> => {
      const instrument = COT_INSTRUMENTS.find((i) => i.id === input.id);
      if (!instrument) throw new Error(`Unknown instrument: ${input.id}`);
      return analyzeCotInstrument(instrument.cftcCode);
    }),

  // List all instruments (no data fetch — just metadata)
  listInstruments: publicProcedure.query(() => COT_INSTRUMENTS),

  // Fetch 1-year daily price history for an ETF ticker (for price overlay)
  getEtfPriceHistory: publicProcedure
    .input(z.object({ ticker: z.string().min(1) }))
    .query(async ({ input }): Promise<PricePoint[]> => {
      try {
        const result = await callDataApi("YahooFinance/get_stock_chart", {
          query: {
            symbol: input.ticker,
            region: "US",
            interval: "1wk",
            range: "1y",
            includeAdjustedClose: false,
          },
        });

        const chart = (result as any)?.chart?.result?.[0];
        if (!chart) return [];

        const timestamps: number[] = chart.timestamp ?? [];
        const closes: (number | null)[] = chart.indicators?.quote?.[0]?.close ?? [];

        return timestamps
          .map((ts, i) => ({
            date: new Date(ts * 1000).toISOString().substring(0, 10),
            close: closes[i] ?? 0,
          }))
          .filter((p) => p.close > 0);
      } catch {
        return [];
      }
    }),
});
