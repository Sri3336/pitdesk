/**
 * PitDesk — Intraday Ticker Detail Drawer
 * Shows: criteria scorecard, intraday price chart with VWAP/EMA9/EMA21,
 * institutional trap warning, stock trade setup, options P&L table.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle, TrendingUp, TrendingDown, Minus, CheckCircle2, XCircle,
  RefreshCw, Loader2, Target, Shield, DollarSign, BarChart2
} from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip,
  ResponsiveContainer, ReferenceLine, Legend, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis
} from "recharts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gradeColor(grade: string) {
  if (grade === "A") return "bg-green-500 text-white";
  if (grade === "B") return "bg-yellow-500 text-black";
  if (grade === "C") return "bg-orange-500 text-white";
  return "bg-muted text-muted-foreground";
}

function gradeRing(grade: string) {
  if (grade === "A") return "ring-green-500";
  if (grade === "B") return "ring-yellow-500";
  if (grade === "C") return "ring-orange-500";
  return "ring-muted";
}

function directionBadge(direction: string) {
  if (direction === "bullish") return <Badge className="bg-green-100 text-green-800 border-green-300">▲ Bullish</Badge>;
  if (direction === "bearish") return <Badge className="bg-red-100 text-red-800 border-red-300">▼ Bearish</Badge>;
  return <Badge variant="outline">— Neutral</Badge>;
}

function fmt(n: number | undefined | null, decimals = 2) {
  if (n == null || isNaN(n)) return "—";
  return n.toFixed(decimals);
}

function fmtPct(n: number | undefined | null) {
  if (n == null || isNaN(n)) return "—";
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

// ─── Criteria Scorecard ───────────────────────────────────────────────────────

const CRITERIA_LABELS: Record<string, string> = {
  aboveVwap: "Above VWAP",
  rvolSpike: "RVOL Spike ≥1.5×",
  ema9Trend: "EMA9 > EMA21",
  rsiMomentum: "RSI Momentum",
  atrExpansion: "ATR Expansion",
  priceAcceleration: "Price Acceleration",
  highOfDay: "Near High of Day",
  gapAndGo: "Gap & Go",
  institutionalFlow: "Institutional Flow",
};

function CriteriaScorecard({ criteria }: { criteria: Record<string, any> }) {
  const entries = Object.entries(criteria).map(([key, val]) => ({
    key,
    label: CRITERIA_LABELS[key] ?? key,
    pass: val.pass,
    value: val.value,
    weight: val.weight,
    points: val.points,
    description: val.description,
  }));

  const totalPoints = entries.reduce((s, e) => s + e.points, 0);
  const maxPoints = entries.reduce((s, e) => s + e.weight, 0);
  const pct = maxPoints > 0 ? (totalPoints / maxPoints) * 100 : 0;

  // Radar data
  const radarData = entries.map(e => ({
    subject: e.label.replace(" ", "\n"),
    score: e.points,
    max: e.weight,
    fullMark: e.weight,
  }));

  return (
    <div className="space-y-4">
      {/* Score bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Weighted Score</span>
            <span className="font-mono font-semibold text-foreground">{fmt(totalPoints)} / {fmt(maxPoints)}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full transition-all ${pct >= 60 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-orange-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <span className="text-sm font-semibold text-muted-foreground">{pct.toFixed(0)}%</span>
      </div>

      {/* Radar chart */}
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData}>
            <PolarGrid stroke="hsl(var(--border))" />
            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
            <PolarRadiusAxis angle={30} domain={[0, 1.5]} tick={false} axisLine={false} />
            <Radar name="Score" dataKey="score" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} />
            <Radar name="Max" dataKey="max" stroke="hsl(var(--border))" fill="transparent" strokeDasharray="3 3" />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Criteria rows */}
      <div className="space-y-1.5">
        {entries.map(e => (
          <div key={e.key} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${e.pass ? "bg-green-50 dark:bg-green-950/20" : "bg-muted/30"}`}>
            {e.pass
              ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              : <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />}
            <span className={`flex-1 ${e.pass ? "text-foreground" : "text-muted-foreground"}`}>{e.label}</span>
            <span className="text-xs font-mono text-muted-foreground">{typeof e.value === "number" ? fmt(e.value) : e.value}</span>
            <span className={`text-xs font-semibold font-mono w-10 text-right ${e.pass ? "text-green-600" : "text-muted-foreground"}`}>
              {e.points.toFixed(1)}/{e.weight.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Intraday Price Chart ─────────────────────────────────────────────────────

function IntradayChart({ bars, vwap }: { bars: any[]; vwap: number }) {
  if (!bars || bars.length === 0) {
    return <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No intraday bars available</div>;
  }

  // Compute EMA9 and EMA21 on closes
  const closes = bars.map(b => b.close);
  function ema(data: number[], period: number): number[] {
    const k = 2 / (period + 1);
    const result: number[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i === 0) { result.push(data[0]); continue; }
      result.push(data[i] * k + result[i - 1] * (1 - k));
    }
    return result;
  }
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);

  const chartData = bars.map((b, i) => ({
    time: new Date(b.time * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
    ema9: ema9[i],
    ema21: ema21[i],
    vwap,
  }));

  // Candlestick-like: use bar as a range bar (low to high), color by open/close
  const chartDataWithColor = chartData.map(d => ({
    ...d,
    barLow: Math.min(d.open, d.close),
    barHigh: Math.max(d.open, d.close),
    isGreen: d.close >= d.open,
  }));

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartDataWithColor} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
          <XAxis dataKey="time" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" />
          <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} width={55} tickFormatter={v => `$${v.toFixed(0)}`} />
          <RechartTooltip
            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }}
            formatter={(value: any, name: string) => [`$${Number(value).toFixed(2)}`, name]}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          {/* Price bars (simplified as close line + high/low range) */}
          <Line type="monotone" dataKey="close" stroke="#22c55e" dot={false} strokeWidth={1.5} name="Close" />
          <Line type="monotone" dataKey="ema9" stroke="#f59e0b" dot={false} strokeWidth={1} name="EMA9" strokeDasharray="4 2" />
          <Line type="monotone" dataKey="ema21" stroke="#3b82f6" dot={false} strokeWidth={1} name="EMA21" strokeDasharray="4 2" />
          <ReferenceLine y={vwap} stroke="#a855f7" strokeDasharray="5 3" label={{ value: `VWAP $${vwap.toFixed(2)}`, position: "right", fontSize: 9, fill: "#a855f7" }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Stock Trade Setup Card ───────────────────────────────────────────────────

function StockSetupCard({ setup }: { setup: any }) {
  const rr = setup.stopLevel > 0 && setup.entryHigh > 0
    ? ((setup.target1 - setup.entryHigh) / (setup.entryHigh - setup.stopLevel))
    : 0;

  const isLong = setup.direction === "bullish";
  const entryMid = (setup.entryLow + setup.entryHigh) / 2;
  const riskPct = entryMid > 0 ? Math.abs((entryMid - setup.stopLevel) / entryMid) * 100 : 0;
  const t1Pct = entryMid > 0 ? Math.abs((setup.target1 - entryMid) / entryMid) * 100 : 0;
  const t2Pct = entryMid > 0 ? Math.abs((setup.target2 - entryMid) / entryMid) * 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Target className="h-4 w-4 text-green-500" />
          Stock Trade Setup
          <Badge variant="outline" className="ml-auto text-xs">{isLong ? "Long" : "Short"}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-muted/40 rounded p-2">
            <div className="text-xs text-muted-foreground">Entry Zone</div>
            <div className="font-semibold font-mono">${fmt(setup.entryLow)} – ${fmt(setup.entryHigh)}</div>
          </div>
          <div className="bg-red-50 dark:bg-red-950/20 rounded p-2">
            <div className="text-xs text-muted-foreground">Stop Loss</div>
            <div className="font-semibold font-mono text-red-600">${fmt(setup.stopLevel)}</div>
            <div className="text-xs text-muted-foreground">{fmtPct(-riskPct)} risk</div>
          </div>
          <div className="bg-green-50 dark:bg-green-950/20 rounded p-2">
            <div className="text-xs text-muted-foreground">Target 1</div>
            <div className="font-semibold font-mono text-green-600">${fmt(setup.target1)}</div>
            <div className="text-xs text-muted-foreground">+{t1Pct.toFixed(1)}%</div>
          </div>
          <div className="bg-green-50 dark:bg-green-950/20 rounded p-2">
            <div className="text-xs text-muted-foreground">Target 2</div>
            <div className="font-semibold font-mono text-green-600">${fmt(setup.target2)}</div>
            <div className="text-xs text-muted-foreground">+{t2Pct.toFixed(1)}%</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Risk/Reward:</span>
          <span className={`font-semibold ${rr >= 2 ? "text-green-600" : rr >= 1 ? "text-yellow-600" : "text-red-500"}`}>
            1 : {rr.toFixed(1)}
          </span>
          {rr >= 2 && <Badge className="bg-green-100 text-green-800 text-xs">Favorable</Badge>}
        </div>
        {/* Visual price ladder */}
        <div className="relative h-8 rounded bg-muted overflow-hidden">
          {setup.price > 0 && setup.stopLevel > 0 && setup.target2 > 0 && (() => {
            const lo = Math.min(setup.stopLevel, setup.price) * 0.998;
            const hi = Math.max(setup.target2, setup.price) * 1.002;
            const range = hi - lo;
            const pct = (v: number) => ((v - lo) / range) * 100;
            return (
              <>
                <div className="absolute inset-y-0 bg-red-200/60 dark:bg-red-900/30" style={{ left: 0, width: `${pct(setup.stopLevel)}%` }} />
                <div className="absolute inset-y-0 bg-green-200/60 dark:bg-green-900/30" style={{ left: `${pct(setup.entryLow)}%`, width: `${pct(setup.target2) - pct(setup.entryLow)}%` }} />
                <div className="absolute inset-y-0 w-0.5 bg-red-500" style={{ left: `${pct(setup.stopLevel)}%` }} />
                <div className="absolute inset-y-0 w-0.5 bg-blue-500" style={{ left: `${pct(setup.price)}%` }} />
                <div className="absolute inset-y-0 w-0.5 bg-green-500" style={{ left: `${pct(setup.target1)}%` }} />
                <div className="absolute inset-y-0 w-0.5 bg-green-700" style={{ left: `${pct(setup.target2)}%` }} />
              </>
            );
          })()}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span className="text-red-500">Stop ${fmt(setup.stopLevel)}</span>
          <span className="text-blue-500">Now ${fmt(setup.price)}</span>
          <span className="text-green-500">T1 ${fmt(setup.target1)}</span>
          <span className="text-green-700">T2 ${fmt(setup.target2)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Options Setup Card ───────────────────────────────────────────────────────

function OptionsSetupCard({ setup }: { setup: any }) {
  const isCall = setup.direction === "bullish";
  const strategyName = setup.optionStrategy ?? (isCall ? "Bull Call Spread" : "Bear Put Spread");
  const debit = setup.optionDebit ?? 0;
  const maxProfit = setup.optionMaxProfit ?? 0;
  const maxLoss = setup.optionMaxLoss ?? 0;
  const breakeven = isCall
    ? (setup.optionStrike ?? 0) + debit
    : (setup.optionStrike ?? 0) - debit;

  // P&L table: price scenarios
  const strike = setup.optionStrike ?? setup.price ?? 0;
  const scenarios = [-10, -7, -5, -3, -1, 0, 1, 3, 5, 7, 10].map(pctMove => {
    const targetPrice = setup.price * (1 + pctMove / 100);
    let pnl = 0;
    if (isCall) {
      const intrinsic = Math.max(0, targetPrice - strike);
      pnl = Math.min(maxProfit, Math.max(-maxLoss, intrinsic * 100 - debit * 100));
    } else {
      const intrinsic = Math.max(0, strike - targetPrice);
      pnl = Math.min(maxProfit, Math.max(-maxLoss, intrinsic * 100 - debit * 100));
    }
    return { pctMove, targetPrice, pnl };
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-blue-500" />
          Options Setup
          <Badge variant="outline" className="ml-auto text-xs">{strategyName}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="bg-muted/40 rounded p-2 text-center">
            <div className="text-xs text-muted-foreground">Strike</div>
            <div className="font-semibold font-mono">${fmt(strike)}</div>
          </div>
          <div className="bg-muted/40 rounded p-2 text-center">
            <div className="text-xs text-muted-foreground">Expiry</div>
            <div className="font-semibold text-xs">{setup.optionExpiry ?? "~2 weeks"}</div>
          </div>
          <div className="bg-muted/40 rounded p-2 text-center">
            <div className="text-xs text-muted-foreground">Debit</div>
            <div className="font-semibold font-mono text-red-500">${fmt(debit)}</div>
          </div>
          <div className="bg-green-50 dark:bg-green-950/20 rounded p-2 text-center">
            <div className="text-xs text-muted-foreground">Max Profit</div>
            <div className="font-semibold font-mono text-green-600">${fmt(maxProfit)}</div>
          </div>
          <div className="bg-red-50 dark:bg-red-950/20 rounded p-2 text-center">
            <div className="text-xs text-muted-foreground">Max Loss</div>
            <div className="font-semibold font-mono text-red-600">${fmt(maxLoss)}</div>
          </div>
          <div className="bg-muted/40 rounded p-2 text-center">
            <div className="text-xs text-muted-foreground">Breakeven</div>
            <div className="font-semibold font-mono">${fmt(breakeven)}</div>
          </div>
        </div>

        {/* P&L table */}
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1.5">P&L Scenarios (per contract)</div>
          <div className="rounded border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40 border-b">
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Move</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Price</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">P&L</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map(s => (
                  <tr key={s.pctMove} className={`border-b ${s.pnl > 0 ? "bg-green-50/50 dark:bg-green-950/10" : s.pnl < 0 ? "bg-red-50/50 dark:bg-red-950/10" : "bg-muted/20"}`}>
                    <td className="px-2 py-1 font-mono">{s.pctMove >= 0 ? "+" : ""}{s.pctMove}%</td>
                    <td className="px-2 py-1 text-right font-mono">${s.targetPrice.toFixed(2)}</td>
                    <td className={`px-2 py-1 text-right font-semibold font-mono ${s.pnl > 0 ? "text-green-600" : s.pnl < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                      {s.pnl >= 0 ? "+" : ""}${s.pnl.toFixed(0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Trap Warning ─────────────────────────────────────────────────────────────

function TrapWarning({ trap }: { trap: any }) {
  if (!trap?.detected) return null;
  const typeLabels: Record<string, string> = {
    stop_hunt: "Stop Hunt",
    false_breakout: "False Breakout",
    absorption: "Absorption",
    gap_fill: "Gap Fill Trap",
  };
  return (
    <Card className="border-amber-400 bg-amber-50 dark:bg-amber-950/20">
      <CardContent className="py-3 px-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
            Institutional Trap Detected: {typeLabels[trap.type] ?? trap.type}
          </div>
          <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{trap.details}</div>
          <div className="text-xs text-amber-600 dark:text-amber-500 mt-1 font-medium">
            ⚠ Grade downgraded one level due to trap signal. Exercise caution.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Scan History Mini Chart ──────────────────────────────────────────────────

function ScanHistoryChart({ ticker }: { ticker: string }) {
  const { data: history, isLoading } = trpc.intradayScanner.getHistory.useQuery({ ticker });

  if (isLoading) return <div className="flex items-center justify-center h-24"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!history || history.length === 0) return <div className="text-center text-sm text-muted-foreground py-6">No history yet</div>;

  const chartData = [...history].reverse().slice(-20).map(h => ({
    time: new Date(h.scannedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    score: parseFloat(h.weightedScore as string),
    grade: h.grade,
  }));

  return (
    <div className="h-28">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
          <XAxis dataKey="time" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" />
          <YAxis domain={[0, 12]} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} width={24} />
          <RechartTooltip contentStyle={{ fontSize: 11 }} />
          <ReferenceLine y={6} stroke="#22c55e" strokeDasharray="4 2" label={{ value: "A", position: "right", fontSize: 9, fill: "#22c55e" }} />
          <ReferenceLine y={4} stroke="#f59e0b" strokeDasharray="4 2" label={{ value: "B", position: "right", fontSize: 9, fill: "#f59e0b" }} />
          <Bar dataKey="score" fill="#22c55e" opacity={0.7} radius={[2, 2, 0, 0]} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Record Outcome Form ──────────────────────────────────────────────────────

function RecordOutcomeForm({ setup }: { setup: any }) {
  const [exitPrice, setExitPrice] = useState("");
  const utils = trpc.useUtils();
  const mutation = trpc.intradayScanner.recordOutcome.useMutation({
    onSuccess: () => {
      setExitPrice("");
      utils.intradayScanner.getBacktestStats.invalidate();
    },
  });

  if (!setup) return null;

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">Record Trade Outcome</div>
      <div className="flex gap-2">
        <input
          type="number"
          placeholder={`Exit price (entry ~$${Number(setup.entryHigh).toFixed(2)})`}
          value={exitPrice}
          onChange={e => setExitPrice(e.target.value)}
          className="flex-1 text-sm border rounded px-2 py-1.5 bg-background"
        />
        <Button
          size="sm"
          onClick={() => mutation.mutate({
            scanResultId: 0,
            ticker: setup.ticker,
            grade: setup.grade,
            direction: setup.direction,
            entryPrice: setup.entryHigh ?? setup.price,
            exitPrice: parseFloat(exitPrice),
          })}
          disabled={!exitPrice || mutation.isPending}
        >
          {mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
        </Button>
      </div>
    </div>
  );
}

// ─── Main Drawer ──────────────────────────────────────────────────────────────

interface IntradayTickerDetailProps {
  ticker: string;
  onClose: () => void;
}

export default function IntradayTickerDetail({ ticker, onClose }: IntradayTickerDetailProps) {
  const [tab, setTab] = useState("setup");

  const { data: setup, isLoading, refetch, isFetching } = trpc.intradayScanner.getScanResult.useQuery(
    { ticker },
    { staleTime: 60_000 }
  );

  return (
    <Sheet open onOpenChange={open => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b px-5 py-4">
          <SheetHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full ring-2 flex items-center justify-center text-sm font-bold ${gradeColor(setup?.grade ?? "none")} ${gradeRing(setup?.grade ?? "none")}`}>
                  {isLoading ? "…" : (setup?.grade ?? "—")}
                </div>
                <div>
                  <SheetTitle className="text-lg">{ticker}</SheetTitle>
                  <div className="flex items-center gap-2 mt-0.5">
                    {setup ? directionBadge(setup.direction) : null}
                    {setup && (
                      <span className="text-xs text-muted-foreground font-mono">
                        ${fmt(setup.price)} · RSI {fmt(setup.rsi, 0)} · RVOL {fmt(setup.rvol)}×
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </SheetHeader>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : !setup ? (
            <div className="text-center py-12 text-muted-foreground">
              <BarChart2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No scan data for {ticker}</p>
              <p className="text-sm mt-1">Run a scan first to see the setup analysis.</p>
            </div>
          ) : (
            <>
              {/* Trap warning (always visible) */}
              <TrapWarning trap={setup.trap} />

              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="w-full">
                  <TabsTrigger value="setup" className="flex-1">Setup</TabsTrigger>
                  <TabsTrigger value="criteria" className="flex-1">Criteria</TabsTrigger>
                  <TabsTrigger value="chart" className="flex-1">Chart</TabsTrigger>
                  <TabsTrigger value="history" className="flex-1">History</TabsTrigger>
                </TabsList>

                {/* ── Setup Tab ── */}
                <TabsContent value="setup" className="space-y-4 mt-4">
                  {/* Key metrics strip */}
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: "Price", value: `$${fmt(setup.price)}` },
                      { label: "VWAP", value: `$${fmt(setup.vwap)}` },
                      { label: "ATR", value: `$${fmt(setup.atr)}` },
                      { label: "Score", value: `${fmt(setup.weightedScore)}/${fmt(setup.maxScore)}` },
                    ].map(m => (
                      <div key={m.label} className="bg-muted/40 rounded p-2 text-center">
                        <div className="text-xs text-muted-foreground">{m.label}</div>
                        <div className="text-sm font-semibold font-mono">{m.value}</div>
                      </div>
                    ))}
                  </div>

                  <StockSetupCard setup={setup} />
                  <OptionsSetupCard setup={setup} />
                </TabsContent>

                {/* ── Criteria Tab ── */}
                <TabsContent value="criteria" className="mt-4">
                  {setup.criteria ? (
                    <CriteriaScorecard criteria={setup.criteria} />
                  ) : (
                    <div className="text-center text-muted-foreground py-8">No criteria data available</div>
                  )}
                </TabsContent>

                {/* ── Chart Tab ── */}
                <TabsContent value="chart" className="mt-4 space-y-4">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">15-min Intraday · Close + EMA9 + EMA21 + VWAP</div>
                    <IntradayChart bars={setup.intradayBars ?? []} vwap={setup.vwap} />
                  </div>
                  <Separator />
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">Daily Bars (last 21 days)</div>
                    {setup.dailyBars && setup.dailyBars.length > 0 ? (
                      <div className="h-40">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={setup.dailyBars.slice(-21).map(b => ({
                            date: new Date(b.time * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                            close: b.close,
                            volume: b.volume,
                          }))} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" />
                            <YAxis yAxisId="price" domain={["auto", "auto"]} tick={{ fontSize: 9 }} width={50} tickFormatter={v => `$${v.toFixed(0)}`} />
                            <YAxis yAxisId="vol" orientation="right" tick={{ fontSize: 9 }} width={40} tickFormatter={v => `${(v / 1e6).toFixed(0)}M`} />
                            <RechartTooltip contentStyle={{ fontSize: 11 }} />
                            <Bar yAxisId="vol" dataKey="volume" fill="hsl(var(--muted))" opacity={0.5} radius={[1, 1, 0, 0]} />
                            <Line yAxisId="price" type="monotone" dataKey="close" stroke="#22c55e" dot={false} strokeWidth={1.5} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="text-center text-sm text-muted-foreground py-6">No daily bars available</div>
                    )}
                  </div>
                </TabsContent>

                {/* ── History Tab ── */}
                <TabsContent value="history" className="mt-4 space-y-4">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">Score History (last 20 scans)</div>
                    <ScanHistoryChart ticker={ticker} />
                  </div>
                  <Separator />
                  <RecordOutcomeForm setup={setup} />
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
