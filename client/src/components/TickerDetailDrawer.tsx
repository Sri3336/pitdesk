/**
 * TickerDetailDrawer.tsx
 *
 * Right-side sheet panel that opens when a user clicks a ticker row in PCRDashboard.
 * Shows three tabs:
 *   1. PCR Details — OI breakdown, PCR gauge, delta, signal history, recommendation
 *   2. Fundamentals & Events — EventImpactPanel (earnings, macro, analyst ratings)
 *   3. Option Chain — analysis.run strategy recommendations + option chain summary
 */

import { useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle,
  BarChart2, Activity, ChevronUp, ChevronDown, Zap,
  DollarSign, Target, Shield, Percent,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { EventImpactPanel } from "@/components/EventImpactPanel";
import { toast } from "sonner";
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer,
  Tooltip as RechartsTooltip, ReferenceLine,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────
type PCRSignal = "EXTREME_FEAR" | "FEAR" | "NEUTRAL" | "GREED" | "EXTREME_GREED";

interface LandingRow {
  ticker: string;
  name: string;
  sector: string;
  priorPutOI: number | null;
  priorCallOI: number | null;
  priorPCROI: string | null;
  priorSnapshotDate: string | null;
  closingPrice: string | null;
  hasIntradayScan: boolean;
  currentPCR: string | null;
  currentPCROI: string | null;
  currentSignal: string;
  signalStrength: number;
  strategyHint: string;
  recommendation: string;
  pcrDeltaVsPrior: string | null;
  priorSignal: string | null;
  signalChanged: boolean;
  coiDelta: string | null;
  coiPctChange: string | null;
  ivSkew: string | null;
  totalPutVolume: number;
  totalCallVolume: number;
  pcrHistory: Array<{ runDate: string; pcr: string; signal: string }>;
}

interface Props {
  ticker: string;
  open: boolean;
  onClose: () => void;
  rowData: LandingRow | null;
}

// ─── Signal config ────────────────────────────────────────────────────────────
const SIGNAL_CFG: Record<PCRSignal, {
  label: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
  interpretation: string;
}> = {
  EXTREME_FEAR: {
    label: "Extreme Fear",
    textColor: "text-emerald-400",
    bgColor: "bg-emerald-950/60",
    borderColor: "border-emerald-600/50",
    icon: <TrendingUp className="h-4 w-4" />,
    interpretation: "Heavy put buying signals extreme bearish sentiment — contrarian bullish opportunity. Consider bull put spreads or cash-secured puts.",
  },
  FEAR: {
    label: "Fear",
    textColor: "text-teal-400",
    bgColor: "bg-teal-950/60",
    borderColor: "border-teal-600/50",
    icon: <TrendingUp className="h-4 w-4" />,
    interpretation: "Elevated put buying indicates bearish hedging — mild contrarian bullish signal. Naked puts or bull put spreads favored.",
  },
  NEUTRAL: {
    label: "Neutral",
    textColor: "text-slate-400",
    bgColor: "bg-slate-800/50",
    borderColor: "border-slate-600/40",
    icon: <Minus className="h-4 w-4" />,
    interpretation: "Balanced put/call activity — range-bound expectation. Iron condors and short strangles are well-suited.",
  },
  GREED: {
    label: "Greed",
    textColor: "text-amber-400",
    bgColor: "bg-amber-950/60",
    borderColor: "border-amber-600/50",
    icon: <TrendingDown className="h-4 w-4" />,
    interpretation: "Elevated call buying signals bullish complacency — mild contrarian bearish signal. Bear call spreads or covered calls favored.",
  },
  EXTREME_GREED: {
    label: "Extreme Greed",
    textColor: "text-red-400",
    bgColor: "bg-red-950/60",
    borderColor: "border-red-600/50",
    icon: <AlertTriangle className="h-4 w-4" />,
    interpretation: "Extreme call buying signals euphoria — contrarian bearish signal. Protective puts, bear call spreads, or reducing long exposure warranted.",
  },
};

function getSignalCfg(signal: string) {
  return SIGNAL_CFG[signal as PCRSignal] ?? SIGNAL_CFG.NEUTRAL;
}

// ─── PCR Gauge ────────────────────────────────────────────────────────────────
function PCRGauge({ pcr }: { pcr: number }) {
  // PCR range: 0 (pure greed) → 2.5+ (extreme fear). Normalize to 0-100.
  const clamped = Math.min(Math.max(pcr, 0), 2.5);
  const pct = (clamped / 2.5) * 100;
  const color = pcr >= 1.5 ? "#10b981" : pcr >= 1.0 ? "#14b8a6" : pcr >= 0.7 ? "#64748b" : pcr >= 0.5 ? "#f59e0b" : "#ef4444";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-24 h-12 overflow-hidden">
        <div className="absolute inset-0 rounded-t-full border-4 border-slate-700/60" style={{ borderRadius: "50% 50% 0 0 / 100% 100% 0 0" }} />
        <div
          className="absolute bottom-0 left-1/2 origin-bottom transition-transform duration-500"
          style={{
            width: 2,
            height: 44,
            background: color,
            transformOrigin: "bottom center",
            transform: `translateX(-50%) rotate(${(pct / 100) * 180 - 90}deg)`,
            borderRadius: 2,
          }}
        />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-slate-700 border-2 border-slate-500" />
      </div>
      <span className="text-xl font-bold num" style={{ color }}>{pcr.toFixed(2)}</span>
      <div className="flex justify-between w-24 text-[9px] text-slate-600">
        <span>Greed</span>
        <span>Fear</span>
      </div>
    </div>
  );
}

// ─── Metric Row ───────────────────────────────────────────────────────────────
function MetricRow({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-800/40 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="text-right">
        <span className={`text-sm font-semibold num ${color ?? "text-slate-200"}`}>{value}</span>
        {sub && <div className="text-[10px] text-slate-600">{sub}</div>}
      </div>
    </div>
  );
}

// ─── PCR Details Tab ──────────────────────────────────────────────────────────
function PCRDetailsTab({ row }: { row: LandingRow }) {
  const cfg = getSignalCfg(row.currentSignal);
  const pcr = parseFloat(row.currentPCR ?? row.priorPCROI ?? "0");
  const pcrOI = parseFloat(row.currentPCROI ?? row.priorPCROI ?? "0");
  const delta = row.pcrDeltaVsPrior ? parseFloat(row.pcrDeltaVsPrior) : null;

  const chartData = row.pcrHistory.map(d => ({
    date: d.runDate.slice(5), // MM-DD
    pcr: parseFloat(d.pcr),
    signal: d.signal,
  }));

  const strokeColor = row.currentSignal === "EXTREME_FEAR" || row.currentSignal === "FEAR" ? "#10b981"
    : row.currentSignal === "EXTREME_GREED" || row.currentSignal === "GREED" ? "#ef4444" : "#64748b";

  return (
    <div className="space-y-4 p-4">
      {/* Signal + Gauge */}
      <div className={`flex items-center justify-between p-4 rounded-xl border ${cfg.bgColor} ${cfg.borderColor}`}>
        <div className="space-y-1">
          <div className={`flex items-center gap-2 text-lg font-bold ${cfg.textColor}`}>
            {cfg.icon}
            {cfg.label}
          </div>
          {row.signalChanged && row.priorSignal && (
            <div className="flex items-center gap-1.5 text-xs">
              <Zap className="h-3 w-3 text-violet-400" />
              <span className="text-violet-400 font-medium">Regime change:</span>
              <span className="text-slate-400">{getSignalCfg(row.priorSignal).label} → {cfg.label}</span>
            </div>
          )}
          <p className="text-xs text-slate-400 max-w-[220px] leading-relaxed mt-1">{cfg.interpretation}</p>
        </div>
        <PCRGauge pcr={pcr || pcrOI} />
      </div>

      {/* Core metrics */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800/60 p-3 space-y-0.5">
        <MetricRow label="PCR (Volume)" value={pcr > 0 ? pcr.toFixed(3) : "—"} sub={row.hasIntradayScan ? "Intraday" : "EOD"} color={cfg.textColor} />
        <MetricRow label="PCR (OI)" value={pcrOI > 0 ? pcrOI.toFixed(3) : "—"} sub="Open Interest" />
        {delta !== null && (
          <MetricRow
            label="Δ vs Prior"
            value={(delta >= 0 ? "+" : "") + delta.toFixed(3)}
            color={delta > 0 ? "text-emerald-400" : "text-red-400"}
          />
        )}
        <MetricRow label="Put OI" value={row.priorPutOI?.toLocaleString() ?? "—"} sub={row.priorSnapshotDate ? `EOD ${row.priorSnapshotDate}` : undefined} />
        <MetricRow label="Call OI" value={row.priorCallOI?.toLocaleString() ?? "—"} />
        {row.totalPutVolume > 0 && <MetricRow label="Put Volume" value={row.totalPutVolume.toLocaleString()} />}
        {row.totalCallVolume > 0 && <MetricRow label="Call Volume" value={row.totalCallVolume.toLocaleString()} />}
        {row.coiDelta && <MetricRow label="COI Delta" value={row.coiDelta} sub="Change in OI" />}
        {row.ivSkew && <MetricRow label="IV Skew" value={row.ivSkew} />}
        {row.closingPrice && <MetricRow label="Last Close" value={`$${parseFloat(row.closingPrice).toFixed(2)}`} />}
      </div>

      {/* Recommendation */}
      {row.hasIntradayScan && (
        <div className="bg-slate-900/60 rounded-xl border border-amber-800/30 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Strategy Recommendation</span>
          </div>
          <div className="text-sm font-bold text-amber-300 mb-1">{row.strategyHint}</div>
          <p className="text-xs text-slate-400 leading-relaxed">{row.recommendation}</p>
        </div>
      )}

      {/* 7-day PCR history chart */}
      {chartData.length >= 2 && (
        <div className="bg-slate-900/60 rounded-xl border border-slate-800/60 p-3">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">7-Day PCR Trend</span>
          </div>
          <div className="h-28">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="pcrGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={strokeColor} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={strokeColor} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: "#475569", fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#475569", fontSize: 9 }} axisLine={false} tickLine={false} width={28} />
                <ReferenceLine y={1.0} stroke="#64748b" strokeDasharray="3 3" strokeWidth={1} />
                <RechartsTooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
                  labelStyle={{ color: "#94a3b8" }}
                  itemStyle={{ color: strokeColor }}
                  formatter={(v: number) => [v.toFixed(3), "PCR"]}
                />
                <Area type="monotone" dataKey="pcr" stroke={strokeColor} strokeWidth={2}
                  fill="url(#pcrGrad)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-slate-600 mt-1">Reference line at PCR = 1.0 (neutral threshold)</p>
        </div>
      )}
    </div>
  );
}

// ─── Option Chain Tab ─────────────────────────────────────────────────────────
function OptionChainTab({ ticker, closingPrice }: { ticker: string; closingPrice: string | null }) {
  const [accountSize] = useState(50000);
  const [targetDte] = useState(30);

  const runAnalysis = trpc.analysis.run.useMutation({
    onError: (err) => toast.error(`Analysis failed: ${err.message}`),
  });

  const strategies = runAnalysis.data?.strategies ?? [];
  const topStrategy = strategies[0];
  const regime = runAnalysis.data?.regime;

  return (
    <div className="p-4 space-y-4">
      {/* Run button */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-200">Trading Strategy Analysis</p>
          <p className="text-xs text-slate-500">30-DTE · $50K account · All strategies</p>
        </div>
        <Button
          size="sm"
          onClick={() => runAnalysis.mutate({ ticker, targetDte, accountSize })}
          disabled={runAnalysis.isPending}
          className="bg-amber-600 hover:bg-amber-500 text-white text-xs"
        >
          {runAnalysis.isPending ? "Analyzing…" : "Run Analysis"}
        </Button>
      </div>

      {runAnalysis.isPending && (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full bg-slate-800/50" />)}
        </div>
      )}

      {runAnalysis.isError && (
        <div className="text-xs text-red-400 bg-red-950/30 border border-red-800/40 rounded-lg p-3">
          {runAnalysis.error.message}
        </div>
      )}

      {/* Regime metrics */}
      {regime && (
        <div className="bg-slate-900/60 rounded-xl border border-slate-800/60 p-3 grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] text-slate-600 uppercase tracking-wide">IV/RV Ratio</p>
            <p className="text-sm font-bold num text-slate-200">{regime.ivRvRatio.toFixed(2)}×</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-600 uppercase tracking-wide">IVR</p>
            <p className="text-sm font-bold num text-slate-200">{regime.ivPercentileRank?.toFixed(0) ?? "—"}%</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-600 uppercase tracking-wide">RSI-14</p>
            <p className={`text-sm font-bold num ${regime.rsi14 > 70 ? "text-red-400" : regime.rsi14 < 30 ? "text-emerald-400" : "text-slate-200"}`}>
              {regime.rsi14.toFixed(1)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-600 uppercase tracking-wide">Bias</p>
            <p className={`text-sm font-bold ${regime.directionalBias === "Bullish" ? "text-emerald-400" : regime.directionalBias === "Bearish" ? "text-red-400" : "text-slate-400"}`}>
              {regime.directionalBias}
            </p>
          </div>
        </div>
      )}

      {/* Top strategy */}
      {topStrategy && (
        <div className="bg-amber-950/30 rounded-xl border border-amber-800/30 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Target className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Top Recommendation</span>
            </div>
            <Badge className="bg-amber-700/40 text-amber-300 border-amber-600/40 text-[10px]">
              Score: {topStrategy.compositeScore.toFixed(1)}
            </Badge>
          </div>
          <p className="text-sm font-bold text-amber-300">{topStrategy.name}</p>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">{topStrategy.rationale}</p>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="text-center">
              <p className="text-[9px] text-slate-600 uppercase">Net Credit</p>
              <p className="text-xs font-bold num text-emerald-400">
                {topStrategy.netCredit != null ? `$${topStrategy.netCredit.toFixed(2)}` : "—"}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[9px] text-slate-600 uppercase">POP</p>
              <p className="text-xs font-bold num text-slate-200">
                {topStrategy.pop != null ? `${(topStrategy.pop * 100).toFixed(0)}%` : "—"}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[9px] text-slate-600 uppercase">Max Loss</p>
              <p className="text-xs font-bold num text-red-400">
                {topStrategy.maxLoss != null ? `$${topStrategy.maxLoss.toFixed(0)}` : "Unlimited"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* All strategies table */}
      {strategies.length > 1 && (
        <div className="bg-slate-900/60 rounded-xl border border-slate-800/60 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-3 py-2 text-slate-500 font-semibold uppercase tracking-wide text-[10px]">Strategy</th>
                <th className="text-right px-3 py-2 text-slate-500 font-semibold uppercase tracking-wide text-[10px]">Score</th>
                <th className="text-right px-3 py-2 text-slate-500 font-semibold uppercase tracking-wide text-[10px]">POP</th>
                <th className="text-right px-3 py-2 text-slate-500 font-semibold uppercase tracking-wide text-[10px]">Credit</th>
              </tr>
            </thead>
            <tbody>
              {strategies.slice(0, 8).map((s, i) => (
                <tr key={s.name} className={`border-b border-slate-800/40 ${i === 0 ? "bg-amber-950/20" : ""}`}>
                  <td className="px-3 py-2 text-slate-300 font-medium">{s.name}</td>
                  <td className="px-3 py-2 text-right num text-slate-200">{s.compositeScore.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right num text-slate-400">
                    {s.pop != null ? `${(s.pop * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right num text-emerald-400">
                    {s.netCredit != null ? `$${s.netCredit.toFixed(2)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!runAnalysis.data && !runAnalysis.isPending && (
        <p className="text-xs text-slate-600 text-center py-4">
          Click "Run Analysis" to generate strategy recommendations and option chain data for {ticker}.
        </p>
      )}
    </div>
  );
}

// ─── Main Drawer ──────────────────────────────────────────────────────────────
export default function TickerDetailDrawer({ ticker, open, onClose, rowData }: Props) {
  const [activeTab, setActiveTab] = useState("pcr");
  const cfg = rowData ? getSignalCfg(rowData.currentSignal) : SIGNAL_CFG.NEUTRAL;

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[520px] p-0 bg-slate-950 border-slate-800 flex flex-col overflow-hidden"
      >
        {/* Header */}
        <SheetHeader className="px-4 py-3 border-b border-slate-800/60 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <SheetTitle className="text-xl font-bold text-slate-100 num tracking-wide">{ticker}</SheetTitle>
                {rowData && (
                  <p className="text-xs text-slate-500 mt-0.5">{rowData.name} · {rowData.sector}</p>
                )}
              </div>
              {rowData && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-semibold border ${cfg.bgColor} ${cfg.textColor} ${cfg.borderColor}`}>
                  {cfg.icon}
                  {cfg.label}
                </span>
              )}
            </div>
            {rowData?.closingPrice && (
              <div className="text-right">
                <p className="text-lg font-bold num text-slate-100">
                  ${parseFloat(rowData.closingPrice).toFixed(2)}
                </p>
                <p className="text-[10px] text-slate-600">Last close</p>
              </div>
            )}
          </div>
        </SheetHeader>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
          <TabsList className="shrink-0 mx-4 mt-3 mb-0 bg-slate-900/60 border border-slate-800/60 h-9 rounded-lg p-1">
            <TabsTrigger value="pcr" className="flex-1 text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-slate-100 text-slate-500">
              PCR Details
            </TabsTrigger>
            <TabsTrigger value="events" className="flex-1 text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-slate-100 text-slate-500">
              Fundamentals
            </TabsTrigger>
            <TabsTrigger value="options" className="flex-1 text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-slate-100 text-slate-500">
              Options
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto min-h-0">
            <TabsContent value="pcr" className="mt-0 h-full">
              {rowData ? (
                <PCRDetailsTab row={rowData} />
              ) : (
                <div className="p-4 space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full bg-slate-800/50" />)}
                </div>
              )}
            </TabsContent>

            <TabsContent value="events" className="mt-0 h-full">
              <div className="p-4">
                <EventImpactPanel ticker={ticker} />
              </div>
            </TabsContent>

            <TabsContent value="options" className="mt-0 h-full">
              <OptionChainTab
                ticker={ticker}
                closingPrice={rowData?.closingPrice ?? null}
              />
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
