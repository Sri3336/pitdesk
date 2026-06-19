import { useParams, Link } from "wouter";
import { ArrowLeft, ExternalLink, TrendingUp, TrendingDown, Minus, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { SignalBadge } from "@/components/SignalBadge";
import { DataFreshnessBanner } from "@/components/DataFreshnessBanner";
import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import {
  ComposedChart,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from "recharts";

function formatNet(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function StatBox({
  label,
  value,
  sub,
  positive,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
}) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div
        className={`text-xl font-bold ${
          positive === true
            ? "text-green-700"
            : positive === false
            ? "text-red-600"
            : "text-gray-900"
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// Fetch ETF price history from Yahoo Finance via tRPC
function usePriceHistory(ticker: string | undefined) {
  const { data, isLoading } = trpc.cot.getEtfPriceHistory.useQuery(
    { ticker: ticker ?? "" },
    { enabled: !!ticker, staleTime: 10 * 60 * 1000, refetchOnWindowFocus: false }
  );
  return { priceHistory: data ?? [], priceLoading: isLoading };
}

export default function COTMarketDetail() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, error } = trpc.cot.getInstrument.useQuery(
    { id: id ?? "" },
    { enabled: !!id, staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false }
  );

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-lg" />
        <Skeleton className="h-72 rounded-lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Link href="/cot">
          <Button variant="ghost" size="sm" className="gap-1.5 mb-4">
            <ArrowLeft className="h-4 w-4" />
            Back to COT Dashboard
          </Button>
        </Link>
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium">Instrument not found</p>
          <p className="text-sm mt-1">"{id}" is not a tracked COT instrument.</p>
        </div>
      </div>
    );
  }

  const { instrument, cotIndex, signal, commercialNet, nonCommercialNet, openInterest,
    weeklyHistory, cotIndexChange, commercialNetChange, dataAge, latestDate, lookbackWeeks } = data;

  // Build chart data (reverse so oldest first)
  const chartData = [...weeklyHistory].reverse().map((w) => ({
    date: w.reportDate.substring(5), // MM-DD
    fullDate: w.reportDate,
    cotIndex: 0, // computed below
    commNet: w.commercialNet,
    nonCommNet: w.nonCommercialNet,
    oi: w.openInterest,
    price: undefined as number | undefined,
  }));

  // Compute rolling COT index for each point in the chart
  const allNets = weeklyHistory.map((w) => w.commercialNet);
  const reversedHistory = [...weeklyHistory].reverse();
  chartData.forEach((d, i) => {
    const windowEnd = reversedHistory.length - 1 - i;
    const windowStart = Math.max(0, windowEnd - lookbackWeeks + 1);
    const window = allNets.slice(windowStart, windowEnd + 1);
    const cur = window[window.length - 1] ?? 0;
    const min = Math.min(...window);
    const max = Math.max(...window);
    d.cotIndex = max === min ? 50 : Math.round(((cur - min) / (max - min)) * 100);
  });

  // ETF price overlay
  const { priceHistory, priceLoading } = usePriceHistory(instrument.ticker);

  // Merge price data into chartData by nearest date
  const overlayData = chartData.map((d) => {
    if (!priceHistory.length) return d;
    // Find closest price date to the COT report date
    const cotDate = new Date(d.fullDate).getTime();
    let closest = priceHistory[0];
    let minDiff = Math.abs(new Date(closest.date).getTime() - cotDate);
    for (const p of priceHistory) {
      const diff = Math.abs(new Date(p.date).getTime() - cotDate);
      if (diff < minDiff) { minDiff = diff; closest = p; }
    }
    return { ...d, price: closest.close };
  });

  const hasPriceData = priceHistory.length > 0;
  const priceMin = hasPriceData ? Math.min(...overlayData.map((d) => d.price ?? Infinity)) * 0.97 : 0;
  const priceMax = hasPriceData ? Math.max(...overlayData.map((d) => d.price ?? 0)) * 1.03 : 100;

  const changeIcon =
    cotIndexChange > 0 ? (
      <TrendingUp className="h-4 w-4 text-green-600" />
    ) : cotIndexChange < 0 ? (
      <TrendingDown className="h-4 w-4 text-red-500" />
    ) : (
      <Minus className="h-4 w-4 text-gray-400" />
    );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Back nav */}
      <Link href="/cot">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          COT Dashboard
        </Button>
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{instrument.name}</h1>
            <SignalBadge signal={signal} cotIndex={cotIndex} size="lg" />
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {instrument.exchange} · {instrument.category} · {instrument.description}
          </p>
        </div>
        {instrument.ticker && (
          <a
            href={`https://finance.yahoo.com/quote/${instrument.ticker}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm" className="gap-1.5">
              <ExternalLink className="h-4 w-4" />
              {instrument.ticker}
            </Button>
          </a>
        )}
      </div>

      {/* Data freshness */}
      <DataFreshnessBanner latestDate={latestDate} dataAge={dataAge} />

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatBox
          label="COT Index"
          value={`${cotIndex} / 100`}
          sub={`${cotIndexChange >= 0 ? "+" : ""}${cotIndexChange} vs last week`}
          positive={cotIndex >= 75 ? true : cotIndex <= 25 ? false : undefined}
        />
        <StatBox
          label="Commercial Net"
          value={formatNet(commercialNet)}
          sub={`${commercialNetChange >= 0 ? "+" : ""}${formatNet(commercialNetChange)} wk`}
          positive={commercialNet >= 0 ? true : false}
        />
        <StatBox
          label="Non-Commercial Net"
          value={formatNet(nonCommercialNet)}
          sub="Speculator positioning"
          positive={nonCommercialNet >= 0 ? true : false}
        />
        <StatBox
          label="Open Interest"
          value={formatNet(openInterest)}
          sub={`${lookbackWeeks}-wk lookback`}
        />
      </div>

      {/* COT Index + Price Overlay chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">COT Index + {instrument.ticker ?? "Price"} Overlay</CardTitle>
              <p className="text-xs text-gray-500 mt-0.5">
                Larry Williams formula: (CommNet − Min) / (Max − Min) × 100. Green zone ≥75 = Bullish, Red zone ≤25 = Bearish.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {priceLoading && <span className="text-xs text-gray-400">Loading price…</span>}
              {!priceLoading && !hasPriceData && instrument.ticker && (
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Price unavailable
                </Badge>
              )}
              {hasPriceData && instrument.ticker && (
                <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">
                  {instrument.ticker} price overlay
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={overlayData} margin={{ top: 8, right: 48, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                interval={Math.floor(overlayData.length / 8)}
              />
              {/* Left axis: COT Index 0–100 */}
              <YAxis
                yAxisId="cot"
                domain={[0, 100]}
                tick={{ fontSize: 10 }}
                width={32}
                label={{ value: "COT", angle: -90, position: "insideLeft", fontSize: 10, fill: "#6b7280" }}
              />
              {/* Right axis: ETF price */}
              {hasPriceData && (
                <YAxis
                  yAxisId="price"
                  orientation="right"
                  domain={[priceMin, priceMax]}
                  tick={{ fontSize: 10 }}
                  width={48}
                  tickFormatter={(v) => `$${v.toFixed(0)}`}
                  label={{ value: instrument.ticker, angle: 90, position: "insideRight", fontSize: 10, fill: "#6b7280" }}
                />
              )}
              <Tooltip
                formatter={(v: number, name: string) => {
                  if (name === "cotIndex") return [`${v}`, "COT Index"];
                  if (name === "price") return [`$${v.toFixed(2)}`, instrument.ticker ?? "Price"];
                  return [v, name];
                }}
                labelStyle={{ fontSize: 11 }}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend
                formatter={(v) => v === "cotIndex" ? "COT Index" : (instrument.ticker ?? "Price")}
                wrapperStyle={{ fontSize: 11 }}
              />
              {/* Threshold bands */}
              <ReferenceLine yAxisId="cot" y={75} stroke="#16a34a" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: "75", fontSize: 10, fill: "#16a34a" }} />
              <ReferenceLine yAxisId="cot" y={25} stroke="#dc2626" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: "25", fontSize: 10, fill: "#dc2626" }} />
              <Line
                yAxisId="cot"
                type="monotone"
                dataKey="cotIndex"
                stroke="#2563eb"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              {hasPriceData && (
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="price"
                  stroke="#f59e0b"
                  strokeWidth={1.5}
                  dot={false}
                  strokeDasharray="5 3"
                  activeDot={{ r: 3 }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Commercial vs Non-Commercial net positions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Commercial vs Non-Commercial Net Positions</CardTitle>
          <p className="text-xs text-gray-500">
            Commercial (hedgers) = smart money. Non-commercial (speculators) = trend followers.
          </p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                interval={Math.floor(chartData.length / 8)}
              />
              <YAxis
                tickFormatter={(v) => formatNet(v)}
                tick={{ fontSize: 10 }}
                width={48}
              />
              <Tooltip
                formatter={(v: number, name: string) => [
                  formatNet(v),
                  name === "commNet" ? "Commercial Net" : "Non-Comm Net",
                ]}
                labelStyle={{ fontSize: 11 }}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend
                formatter={(v) => (v === "commNet" ? "Commercial Net" : "Non-Comm Net")}
                wrapperStyle={{ fontSize: 11 }}
              />
              <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1} />
              <Bar dataKey="commNet" fill="#2563eb" opacity={0.75} radius={[2, 2, 0, 0]} />
              <Bar dataKey="nonCommNet" fill="#f59e0b" opacity={0.65} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Signal interpretation */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Signal Interpretation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-gray-700">
          {signal === "BULLISH" && (
            <div className="flex gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
              <TrendingUp className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-green-800">Bullish Signal — Commercials are heavily net long</p>
                <p className="text-green-700 mt-1 text-xs">
                  COT Index of {cotIndex} indicates commercial hedgers (smart money) are near their most bullish
                  positioning in the past {lookbackWeeks} weeks. Larry Williams considers this a high-probability
                  long setup. Consider bullish options strategies (long calls, bull call spreads, cash-secured puts).
                </p>
              </div>
            </div>
          )}
          {signal === "BEARISH" && (
            <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
              <TrendingDown className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-800">Bearish Signal — Commercials are heavily net short</p>
                <p className="text-red-700 mt-1 text-xs">
                  COT Index of {cotIndex} indicates commercial hedgers are near their most bearish positioning
                  in the past {lookbackWeeks} weeks. Larry Williams considers this a high-probability short setup.
                  Consider bearish options strategies (long puts, bear put spreads, covered calls).
                </p>
              </div>
            </div>
          )}
          {signal === "NEUTRAL" && (
            <div className="flex gap-2 p-3 bg-gray-50 border border-gray-200 rounded-md">
              <Minus className="h-5 w-5 text-gray-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-700">Neutral — No strong commercial conviction</p>
                <p className="text-gray-600 mt-1 text-xs">
                  COT Index of {cotIndex} is in the neutral zone (25–74). Commercial positioning does not
                  provide a strong directional signal at this time. Use other indicators for trade direction.
                </p>
              </div>
            </div>
          )}
          <p className="text-xs text-gray-400">
            Note: COT data is released weekly (Friday) with a 3-day lag. Always confirm with price action and other
            technical signals before entering a trade.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
