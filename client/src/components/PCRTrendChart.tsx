/**
 * PCRTrendChart.tsx - Interactive PCR trend chart for the PCR Strategy page.
 * Shows PCR history over time with signal zone bands, dual-axis price overlay,
 * and ticker/date-range selector.
 */
import { useState, useMemo } from "react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ReferenceArea, ResponsiveContainer,
} from "recharts";
import { trpc } from "@/lib/trpc";
import { PCR_TICKERS } from "@shared/tickers";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus, RefreshCw, BarChart2 } from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const SIGNAL_ZONES = [
  { min: 1.5, max: 3.0, label: "Extreme Fear", color: "#22c55e", opacity: 0.08 },
  { min: 1.2, max: 1.5, label: "Fear", color: "#86efac", opacity: 0.08 },
  { min: 0.8, max: 1.2, label: "Neutral", color: "#94a3b8", opacity: 0.06 },
  { min: 0.5, max: 0.8, label: "Greed", color: "#fbbf24", opacity: 0.08 },
  { min: 0.0, max: 0.5, label: "Extreme Greed", color: "#ef4444", opacity: 0.08 },
];

const SIGNAL_COLORS: Record<string, string> = {
  EXTREME_FEAR: "#22c55e", FEAR: "#86efac", NEUTRAL: "#94a3b8",
  GREED: "#fbbf24", EXTREME_GREED: "#ef4444",
};

const SIGNAL_LABELS: Record<string, string> = {
  EXTREME_FEAR: "Extreme Fear", FEAR: "Fear", NEUTRAL: "Neutral",
  GREED: "Greed", EXTREME_GREED: "Extreme Greed",
};

const RANGE_OPTIONS = [
  { label: "7D", days: 7 }, { label: "14D", days: 14 }, { label: "30D", days: 30 },
  { label: "60D", days: 60 }, { label: "90D", days: 90 },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChartDataPoint {
  date: string;
  dateLabel: string;
  pcrVolume: number;
  pcrOI: number;
  price: number | null;
  signal: string;
  putVolume: number;
  callVolume: number;
  ivSkew: number | null;
}

interface TooltipPayloadItem {
  payload: Record<string, unknown>;
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const signal = d.signal as string;
  const signalColor = SIGNAL_COLORS[signal] ?? "#94a3b8";
  const signalLabel = SIGNAL_LABELS[signal] ?? signal;
  return (
    <div className="bg-white border border-border rounded-lg shadow-lg p-3 text-xs min-w-[180px]">
      <p className="font-semibold text-slate-800 mb-2">{d.dateLabel as string}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">PCR (Vol)</span>
          <span className="font-mono font-semibold text-blue-700">{(d.pcrVolume as number)?.toFixed(3)}</span>
        </div>
        {d.pcrOI !== undefined && (
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">PCR (OI)</span>
            <span className="font-mono text-slate-700">{(d.pcrOI as number)?.toFixed(3)}</span>
          </div>
        )}
        {d.price !== null && d.price !== undefined && (
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Price</span>
            <span className="font-mono text-slate-700">${(d.price as number)?.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between gap-4 pt-1 border-t border-slate-100">
          <span className="text-slate-500">Signal</span>
          <span className="font-semibold" style={{ color: signalColor }}>{signalLabel}</span>
        </div>
        {Boolean(d.putVolume || d.callVolume) && (
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Put/Call Vol</span>
            <span className="font-mono text-slate-600">
              {((d.putVolume as number) / 1000).toFixed(0)}K / {((d.callVolume as number) / 1000).toFixed(0)}K
            </span>
          </div>
        )}
        {d.ivSkew !== null && d.ivSkew !== undefined && (
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">IV Skew</span>
            <span className="font-mono text-slate-600">{(d.ivSkew as number)?.toFixed(2)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ ticker, onRunScan }: { ticker: string; onRunScan: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
      <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center">
        <BarChart2 className="w-7 h-7 text-blue-400" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700">No trend data yet for {ticker}</p>
        <p className="text-xs text-slate-500 mt-1">
          PCR history builds automatically from daily scans (11:30 AM ET).<br />
          Run a live scan now to capture today's data point.
        </p>
      </div>
      <Button size="sm" variant="outline" className="gap-2" onClick={onRunScan}>
        <RefreshCw className="w-3.5 h-3.5" />
        Run Live Scan for {ticker}
      </Button>
    </div>
  );
}

// ─── Signal Badge ─────────────────────────────────────────────────────────────

function SignalBadge({ signal }: { signal: string }) {
  const color = SIGNAL_COLORS[signal] ?? "#94a3b8";
  const label = SIGNAL_LABELS[signal] ?? signal;
  const Icon = signal.includes("FEAR") ? TrendingDown : signal.includes("GREED") ? TrendingUp : Minus;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ backgroundColor: `${color}20`, color }}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface PCRTrendChartProps {
  defaultTicker?: string;
}

export function PCRTrendChart({ defaultTicker = "SPY" }: PCRTrendChartProps) {
  const [ticker, setTicker] = useState(defaultTicker);
  const [days, setDays] = useState(30);
  const [showOI, setShowOI] = useState(false);
  const [showPrice, setShowPrice] = useState(true);

  const { data, isLoading, refetch, isFetching } = trpc.pcrScheduled.getPCRTrend.useQuery(
    { ticker, days },
    { refetchOnWindowFocus: false }
  );

  const triggerScan = trpc.pcrScheduled.triggerIntradayScan.useMutation({
    onSuccess: () => refetch(),
  });

  const chartData = useMemo<ChartDataPoint[]>(() => {
    if (!data?.length) return [];
    return (data as Array<Omit<ChartDataPoint, "dateLabel">>).map(d => ({
      ...d,
      dateLabel: new Date(d.date + "T12:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
    }));
  }, [data]);

  const latestPoint = chartData[chartData.length - 1];

  const priceMin = useMemo(() => {
    const prices = chartData
      .map((d: ChartDataPoint) => d.price)
      .filter((p): p is number => p !== null);
    return prices.length ? Math.floor(Math.min(...prices) * 0.98) : undefined;
  }, [chartData]);

  const priceMax = useMemo(() => {
    const prices = chartData
      .map((d: ChartDataPoint) => d.price)
      .filter((p): p is number => p !== null);
    return prices.length ? Math.ceil(Math.max(...prices) * 1.02) : undefined;
  }, [chartData]);

  const hasPrice = chartData.some((d: ChartDataPoint) => d.price !== null);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={ticker} onValueChange={setTicker}>
          <SelectTrigger className="w-28 h-8 text-xs font-mono">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {[...PCR_TICKERS].map(t => (
              <SelectItem key={t} value={t} className="text-xs font-mono">{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex gap-1">
          {RANGE_OPTIONS.map(opt => (
            <button
              key={opt.days}
              onClick={() => setDays(opt.days)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                days === opt.days
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 ml-auto">
          {hasPrice && (
            <button
              onClick={() => setShowPrice(p => !p)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                showPrice ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              Price
            </button>
          )}
          <button
            onClick={() => setShowOI(p => !p)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              showOI ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            PCR (OI)
          </button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 gap-1 text-xs"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Current signal summary */}
      {latestPoint && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
          <span className="font-semibold text-slate-800">{ticker}</span>
          <span>
            Latest PCR:{" "}
            <span className="font-mono font-semibold text-blue-700">
              {latestPoint.pcrVolume?.toFixed(3)}
            </span>
          </span>
          <SignalBadge signal={latestPoint.signal} />
          {latestPoint.price && (
            <span>
              Price: <span className="font-mono">${latestPoint.price?.toFixed(2)}</span>
            </span>
          )}
          <span className="text-slate-400 ml-auto">{latestPoint.date}</span>
        </div>
      )}

      {/* Chart */}
      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : chartData.length === 0 ? (
        <EmptyState ticker={ticker} onRunScan={() => triggerScan.mutate()} />
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart
            data={chartData}
            margin={{ top: 8, right: hasPrice && showPrice ? 60 : 16, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />

            {/* Signal zone bands */}
            {SIGNAL_ZONES.map(zone => (
              <ReferenceArea
                key={zone.label}
                y1={zone.min}
                y2={zone.max}
                yAxisId="pcr"
                fill={zone.color}
                fillOpacity={zone.opacity}
                ifOverflow="extendDomain"
              />
            ))}

            {/* PCR = 1.0 neutral line */}
            <ReferenceLine
              y={1.0}
              yAxisId="pcr"
              stroke="#94a3b8"
              strokeDasharray="4 4"
              strokeWidth={1}
            />

            <XAxis
              dataKey="dateLabel"
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />

            {/* PCR Y-axis (left) */}
            <YAxis
              yAxisId="pcr"
              domain={[0, 2.5]}
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(v: number) => v.toFixed(1)}
              label={{
                value: "PCR",
                angle: -90,
                position: "insideLeft",
                offset: 10,
                style: { fontSize: 10, fill: "#94a3b8" },
              }}
            />

            {/* Price Y-axis (right) */}
            {hasPrice && showPrice && (
              <YAxis
                yAxisId="price"
                orientation="right"
                domain={[priceMin ?? "auto", priceMax ?? "auto"]}
                tick={{ fontSize: 11, fill: "#7c3aed" }}
                tickLine={false}
                axisLine={false}
                width={55}
                tickFormatter={(v: number) => `$${v}`}
              />
            )}

            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              formatter={(value: string) => {
                const map: Record<string, string> = {
                  pcrVolume: "PCR (Volume)",
                  pcrOI: "PCR (OI)",
                  price: "Stock Price",
                };
                return map[value] ?? value;
              }}
            />

            {/* PCR Volume line — primary signal, dots colored by zone */}
            <Line
              yAxisId="pcr"
              type="monotone"
              dataKey="pcrVolume"
              stroke="#2563eb"
              strokeWidth={2}
              dot={(props: { cx: number; cy: number; payload: ChartDataPoint }) => {
                const { cx, cy, payload } = props;
                const color = SIGNAL_COLORS[payload.signal] ?? "#94a3b8";
                return (
                  <circle
                    key={`dot-${payload.date}`}
                    cx={cx}
                    cy={cy}
                    r={3.5}
                    fill={color}
                    stroke="white"
                    strokeWidth={1.5}
                  />
                );
              }}
              activeDot={{ r: 5, strokeWidth: 2 }}
            />

            {/* PCR OI line — optional overlay */}
            {showOI && (
              <Line
                yAxisId="pcr"
                type="monotone"
                dataKey="pcrOI"
                stroke="#f97316"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                dot={false}
              />
            )}

            {/* Price area — optional overlay */}
            {hasPrice && showPrice && (
              <Area
                yAxisId="price"
                type="monotone"
                dataKey="price"
                stroke="#7c3aed"
                strokeWidth={1.5}
                fill="#7c3aed"
                fillOpacity={0.04}
                dot={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {/* Signal zone legend */}
      <div className="flex flex-wrap gap-2 text-xs">
        {SIGNAL_ZONES.map(zone => (
          <span key={zone.label} className="flex items-center gap-1 text-slate-600">
            <span
              className="w-3 h-3 rounded-sm inline-block"
              style={{ backgroundColor: zone.color, opacity: 0.7 }}
            />
            {zone.label}
            <span className="text-slate-400">
              ({zone.min === 1.5 ? "1.5+" : `${zone.min}–${zone.max}`})
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
