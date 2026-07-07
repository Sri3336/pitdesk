/**
 * EMA Pullback Scanner — 200/50 EMA Trend-Pullback with RSI Confirmation
 *
 * Scans for stocks where:
 *  1. Price > 200 EMA AND 50 EMA > 200 EMA (confirmed uptrend)
 *  2. Price is pulling back to touch the 50 EMA
 *  3. RSI dips near 40 (momentum exhaustion at support)
 *  4. Bullish reversal candle fires at the 50 EMA
 *
 * Also shows Options Bias — whether the setup supports selling puts.
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TrendingUp,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Target,
  BarChart2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type SignalStrength = "STRONG" | "MODERATE" | "WATCH" | "NONE";
type CandlePattern = "BULLISH_ENGULFING" | "HAMMER" | "PIN_BAR" | "NONE";

interface EmaPullbackSignal {
  ticker: string;
  timeframe: "1H" | "1D";
  signalStrength: SignalStrength;
  ema50: number;
  ema200: number;
  currentPrice: number;
  trendConfirmed: boolean;
  emaGap: number;
  touchingEma50: boolean;
  pullbackDepth: number;
  rsi: number;
  rsiExhausted: boolean;
  candlePattern: CandlePattern;
  hasBullishCandle: boolean;
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  riskDollars: number;
  rewardDollars1: number;
  rewardDollars2: number;
  rrRatio1: number;
  rrRatio2: number;
  dayChangePercent: number;
  volume: number;
  avgVolume: number;
  relativeVolume: number;
  optionsBias: "SELL_PUTS" | "WAIT" | "AVOID";
  optionsBiasReason: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt$ = (v: number) =>
  v >= 1000
    ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${v.toFixed(2)}`;

const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

function strengthColor(s: SignalStrength) {
  if (s === "STRONG") return "bg-green-100 text-green-700 border-green-300";
  if (s === "MODERATE") return "bg-blue-100 text-blue-700 border-blue-300";
  if (s === "WATCH") return "bg-amber-100 text-amber-700 border-amber-300";
  return "bg-gray-100 text-gray-500 border-gray-200";
}

function strengthIcon(s: SignalStrength) {
  if (s === "STRONG") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (s === "MODERATE") return <Zap className="h-3.5 w-3.5" />;
  if (s === "WATCH") return <Clock className="h-3.5 w-3.5" />;
  return <AlertTriangle className="h-3.5 w-3.5" />;
}

function candleLabel(p: CandlePattern) {
  if (p === "BULLISH_ENGULFING") return "Bullish Engulfing";
  if (p === "HAMMER") return "Hammer";
  if (p === "PIN_BAR") return "Pin Bar";
  return "No pattern";
}

function optionsBiasColor(b: string) {
  if (b === "SELL_PUTS") return "bg-green-100 text-green-700 border-green-300";
  if (b === "WAIT") return "bg-amber-100 text-amber-700 border-amber-300";
  return "bg-red-100 text-red-600 border-red-300";
}

// ─── Signal Card ──────────────────────────────────────────────────────────────

function SignalCard({ signal }: { signal: EmaPullbackSignal }) {
  const [expanded, setExpanded] = useState(signal.signalStrength === "STRONG");

  const checkRow = (label: string, pass: boolean, value: string) => (
    <div className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {pass
          ? <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
          : <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />}
        {label}
      </div>
      <span className="text-xs font-medium">{value}</span>
    </div>
  );

  return (
    <Card
      className={`border transition-all duration-200 ${
        signal.signalStrength === "STRONG"
          ? "border-green-300 bg-green-50/30"
          : signal.signalStrength === "MODERATE"
          ? "border-blue-200 bg-blue-50/20"
          : "border-border"
      }`}
    >
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight">{signal.ticker}</span>
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 flex items-center gap-1 ${strengthColor(signal.signalStrength)}`}
            >
              {strengthIcon(signal.signalStrength)}
              {signal.signalStrength}
            </Badge>
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 ${optionsBiasColor(signal.optionsBias)}`}
            >
              {signal.optionsBias === "SELL_PUTS" ? "✓ Sell Puts" : signal.optionsBias === "WAIT" ? "⏳ Wait" : "✗ Avoid"}
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-semibold">{fmt$(signal.currentPrice)}</div>
              <div className={`text-[10px] ${signal.dayChangePercent >= 0 ? "text-green-600" : "text-red-500"}`}>
                {fmtPct(signal.dayChangePercent)}
              </div>
            </div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Quick status row */}
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${signal.trendConfirmed ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-600 border-red-200"}`}>
            {signal.trendConfirmed ? "✓ Trend OK" : "✗ No Trend"}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${signal.touchingEma50 ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-500 border-gray-200"}`}>
            {signal.touchingEma50 ? "✓ At 50 EMA" : "Away from 50 EMA"}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${signal.rsiExhausted ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-500 border-gray-200"}`}>
            RSI {signal.rsi.toFixed(0)} {signal.rsiExhausted ? "✓" : ""}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${signal.hasBullishCandle ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-500 border-gray-200"}`}>
            {signal.hasBullishCandle ? `✓ ${candleLabel(signal.candlePattern)}` : "No candle pattern"}
          </span>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="px-4 pb-4 pt-0">
          <div className="grid grid-cols-2 gap-4 mt-2">
            {/* EMA Analysis */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">EMA Analysis</div>
              {checkRow("Price > 200 EMA", signal.currentPrice > signal.ema200, `${fmt$(signal.currentPrice)} vs ${fmt$(signal.ema200)}`)}
              {checkRow("50 EMA > 200 EMA", signal.ema50 > signal.ema200, `${fmt$(signal.ema50)} vs ${fmt$(signal.ema200)}`)}
              {checkRow("EMA Gap (trend strength)", signal.emaGap >= 2, `${signal.emaGap.toFixed(1)}% gap`)}
              {checkRow("Touching 50 EMA", signal.touchingEma50, `${Math.abs(signal.currentPrice - signal.ema50) / signal.ema50 * 100 < 0.01 ? "<0.01" : (Math.abs(signal.currentPrice - signal.ema50) / signal.ema50 * 100).toFixed(1)}% away`)}
              {checkRow("Pullback depth", signal.pullbackDepth >= 3, `${signal.pullbackDepth.toFixed(1)}% from swing high`)}
              {checkRow("RSI exhaustion (≤ 45)", signal.rsiExhausted, `RSI ${signal.rsi.toFixed(1)}`)}
              {checkRow("Reversal candle", signal.hasBullishCandle, candleLabel(signal.candlePattern))}
            </div>

            {/* Trade Math */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Trade Math</div>
              <div className="bg-muted/40 rounded-lg p-3 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Entry</span>
                  <span className="font-semibold">{fmt$(signal.entryPrice)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-red-500">Stop Loss</span>
                  <span className="font-semibold text-red-500">{fmt$(signal.stopLoss)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Risk / share</span>
                  <span className="font-semibold">{fmt$(signal.riskDollars)}</span>
                </div>
                <div className="border-t border-border/40 pt-2 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-green-600">Target 1 (1.5×)</span>
                    <span className="font-semibold text-green-600">{fmt$(signal.target1)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-green-700">Target 2 (2×)</span>
                    <span className="font-semibold text-green-700">{fmt$(signal.target2)}</span>
                  </div>
                </div>
                <div className="border-t border-border/40 pt-2 flex gap-2">
                  <div className="flex-1 text-center bg-green-50 rounded p-1.5">
                    <div className="text-[10px] text-muted-foreground">R:R (T1)</div>
                    <div className="text-sm font-bold text-green-700">{signal.rrRatio1.toFixed(1)}:1</div>
                  </div>
                  <div className="flex-1 text-center bg-green-50 rounded p-1.5">
                    <div className="text-[10px] text-muted-foreground">R:R (T2)</div>
                    <div className="text-sm font-bold text-green-700">{signal.rrRatio2.toFixed(1)}:1</div>
                  </div>
                </div>
              </div>

              {/* Options Bias */}
              <div className={`mt-2 rounded-lg p-2.5 border text-xs ${optionsBiasColor(signal.optionsBias)}`}>
                <div className="font-semibold mb-0.5">
                  {signal.optionsBias === "SELL_PUTS" ? "✓ Options: Sell Puts" : signal.optionsBias === "WAIT" ? "⏳ Options: Wait" : "✗ Options: Avoid"}
                </div>
                <div className="opacity-80 leading-snug">{signal.optionsBiasReason}</div>
              </div>
            </div>
          </div>

          {/* Volume */}
          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground border-t border-border/40 pt-2">
            <span>Vol: {signal.volume.toLocaleString()}</span>
            <span>Avg: {signal.avgVolume.toLocaleString()}</span>
            <span className={signal.relativeVolume >= 1.5 ? "text-green-600 font-medium" : ""}>
              RVol: {signal.relativeVolume.toFixed(1)}×
            </span>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EMAPullbackScanner() {
  const [timeframe, setTimeframe] = useState<"1H" | "1D">("1D");
  const [minStrength, setMinStrength] = useState<"STRONG" | "MODERATE" | "WATCH">("WATCH");
  const [customTicker, setCustomTicker] = useState("");
  const [singleTicker, setSingleTicker] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);

  const { data, isLoading, refetch, isFetching } = trpc.emaPullback.scan.useQuery(
    { timeframe, minStrength },
    { enabled, staleTime: 5 * 60 * 1000 }
  );

  const { data: singleData, isLoading: singleLoading } = trpc.emaPullback.analyzeTicker.useQuery(
    { ticker: singleTicker ?? "", timeframe },
    { enabled: !!singleTicker }
  );

  const signals = data?.signals ?? [];

  const strongCount = useMemo(() => signals.filter(s => s.signalStrength === "STRONG").length, [signals]);
  const moderateCount = useMemo(() => signals.filter(s => s.signalStrength === "MODERATE").length, [signals]);
  const watchCount = useMemo(() => signals.filter(s => s.signalStrength === "WATCH").length, [signals]);
  const sellPutsCount = useMemo(() => signals.filter(s => s.optionsBias === "SELL_PUTS").length, [signals]);

  const handleSingleScan = () => {
    const t = customTicker.trim().toUpperCase();
    if (!t) return;
    setSingleTicker(t);
    toast.info(`Scanning ${t}…`);
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-green-600" />
            EMA Pullback Scanner
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            200/50 EMA trend-pullback with RSI confirmation — buy the dip in a strong uptrend
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Strategy Rules Reference */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardContent className="pt-4 pb-3">
          <div className="text-xs font-semibold text-blue-700 mb-2 uppercase tracking-wide">Entry Checklist (all 4 required for STRONG)</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-blue-800">
            <div className="flex items-start gap-1.5">
              <span className="text-blue-500 font-bold mt-0.5">1.</span>
              <span><strong>Trend:</strong> Price above 200 EMA, 50 EMA above 200 EMA with visible gap</span>
            </div>
            <div className="flex items-start gap-1.5">
              <span className="text-blue-500 font-bold mt-0.5">2.</span>
              <span><strong>Pullback:</strong> Price touches or pierces the 50 EMA (within 2%)</span>
            </div>
            <div className="flex items-start gap-1.5">
              <span className="text-blue-500 font-bold mt-0.5">3.</span>
              <span><strong>RSI:</strong> Dips near/below 40 — momentum exhaustion at support</span>
            </div>
            <div className="flex items-start gap-1.5">
              <span className="text-blue-500 font-bold mt-0.5">4.</span>
              <span><strong>Candle:</strong> Bullish engulfing, hammer, or pin bar closes at 50 EMA</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-blue-200 text-xs text-blue-700">
            <strong>Options use:</strong> When STRONG/MODERATE + "Sell Puts" bias → sell cash-secured puts below the 50 EMA. The trend support makes assignment risk lower.
            Stop: below pullback low + 10% buffer. Target: 1.5× (T1, take 50% off) → 2× (T2, trail stop to breakeven).
          </div>
        </CardContent>
      </Card>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <Tabs value={timeframe} onValueChange={(v) => setTimeframe(v as "1H" | "1D")}>
          <TabsList className="h-8">
            <TabsTrigger value="1D" className="text-xs px-3">Daily</TabsTrigger>
            <TabsTrigger value="1H" className="text-xs px-3">1-Hour</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Min strength:</span>
          {(["STRONG", "MODERATE", "WATCH"] as const).map(s => (
            <button
              key={s}
              onClick={() => setMinStrength(s)}
              className={`px-2 py-1 rounded border text-[10px] font-medium transition-colors ${
                minStrength === s
                  ? strengthColor(s)
                  : "border-border text-muted-foreground hover:border-foreground/30"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Single ticker scan */}
        <div className="flex items-center gap-1.5 ml-auto">
          <Input
            placeholder="AAPL"
            value={customTicker}
            onChange={e => setCustomTicker(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && handleSingleScan()}
            className="h-8 w-24 text-xs uppercase"
          />
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={handleSingleScan}>
            <Search className="h-3.5 w-3.5" />
            Scan
          </Button>
        </div>
      </div>

      {/* Single ticker result */}
      {singleTicker && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">Single Ticker: {singleTicker}</span>
            <button onClick={() => setSingleTicker(null)} className="text-xs text-muted-foreground hover:text-foreground">
              Clear
            </button>
          </div>
          {singleLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <RefreshCw className="h-4 w-4 animate-spin" /> Analyzing {singleTicker}…
            </div>
          ) : singleData ? (
            <SignalCard signal={singleData} />
          ) : (
            <div className="text-sm text-muted-foreground py-4">No data available for {singleTicker}</div>
          )}
        </div>
      )}

      {/* Summary stats */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-green-200 bg-green-50/30">
            <CardContent className="pt-3 pb-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Strong Signals</div>
              <div className="text-2xl font-bold text-green-600">{strongCount}</div>
              <div className="text-[10px] text-muted-foreground">All 4 criteria met</div>
            </CardContent>
          </Card>
          <Card className="border-blue-200 bg-blue-50/20">
            <CardContent className="pt-3 pb-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Moderate</div>
              <div className="text-2xl font-bold text-blue-600">{moderateCount}</div>
              <div className="text-[10px] text-muted-foreground">3 criteria met</div>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50/20">
            <CardContent className="pt-3 pb-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Watch</div>
              <div className="text-2xl font-bold text-amber-600">{watchCount}</div>
              <div className="text-[10px] text-muted-foreground">Trend + pullback only</div>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50/30">
            <CardContent className="pt-3 pb-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Sell Puts Bias</div>
              <div className="text-2xl font-bold text-green-600">{sellPutsCount}</div>
              <div className="text-[10px] text-muted-foreground">Options-friendly setups</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Signal list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 rounded-lg bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : signals.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <BarChart2 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <div className="text-sm font-medium text-muted-foreground">No signals found</div>
            <div className="text-xs text-muted-foreground/70 mt-1">
              Try lowering the minimum strength filter or switching timeframes
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {signals.length} signal{signals.length !== 1 ? "s" : ""} from {data?.scannedCount ?? 0} tickers scanned
            </span>
            <span className="text-xs text-muted-foreground">
              {data?.timeframe} · {data?.scannedAt ? new Date(data.scannedAt).toLocaleTimeString() : ""}
            </span>
          </div>
          {signals.map(signal => (
            <SignalCard key={`${signal.ticker}-${signal.timeframe}`} signal={signal} />
          ))}
        </div>
      )}
    </div>
  );
}
