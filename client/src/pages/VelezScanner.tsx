import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  BarChart2,
  ChevronDown,
  ChevronRight,
  Info,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FibLevel {
  level: number;
  price: number;
  label: string;
}

interface EmaConfluence {
  fibLevel: number;
  fibPrice: number;
  emaPeriod: number;
  emaValue: number;
  currentPrice: number;
  fibProximityPct: number;
  emaProximityPct: number;
  isConfluent: boolean;
}

interface DailySignal {
  ticker: string;
  signalDate: string;
  entry: number;
  target25: number;
  target50: number;
  stop: number;
  dropPct: number;
  volume: number;
  avgVolume: number;
  volumeRatio: number;
  swingHigh: number;
  swingLow: number;
  fibRetracements: FibLevel[];
  fibExtensions: FibLevel[];
  ema9: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  fibEmaConfluences: EmaConfluence[];
  hasConfluence: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${Number(n).toFixed(2)}`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function fibLevelColor(level: number): string {
  if (level === 38.2) return "text-blue-600 bg-blue-50";
  if (level === 50.0) return "text-yellow-600 bg-yellow-50";
  if (level === 61.8) return "text-green-600 bg-green-50";
  if (level === 78.6) return "text-red-600 bg-red-50";
  return "text-gray-600 bg-gray-50";
}

function extLevelColor(level: number): string {
  if (level === 127.2) return "text-blue-700 bg-blue-100";
  if (level === 161.8) return "text-green-700 bg-green-100";
  if (level === 261.8) return "text-purple-700 bg-purple-100";
  return "text-gray-700 bg-gray-100";
}

// ─── Fib Levels Panel ─────────────────────────────────────────────────────────

function FibLevelsPanel({ signal }: { signal: DailySignal }) {
  const [showExt, setShowExt] = useState(false);

  return (
    <div className="space-y-3">
      {/* Retracements */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Retracement Levels
        </div>
        <div className="grid grid-cols-5 gap-1">
          {signal.fibRetracements.map((f) => (
            <div
              key={f.level}
              className={`rounded-md px-2 py-1.5 text-center text-xs font-medium ${fibLevelColor(f.level)}`}
            >
              <div className="font-bold">{f.level}%</div>
              <div className="text-[10px] mt-0.5">{fmt(f.price)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Extensions */}
      <div>
        <button
          onClick={() => setShowExt((v) => !v)}
          className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 hover:text-foreground transition-colors"
        >
          {showExt ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Extension Targets
        </button>
        {showExt && (
          <div className="grid grid-cols-3 gap-1">
            {signal.fibExtensions.map((f) => (
              <div
                key={f.level}
                className={`rounded-md px-2 py-1.5 text-center text-xs font-medium ${extLevelColor(f.level)}`}
              >
                <div className="font-bold">{f.level}%</div>
                <div className="text-[10px] mt-0.5">{fmt(f.price)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* EMA values */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          EMA Values
        </div>
        <div className="grid grid-cols-4 gap-1">
          {[
            { label: "EMA-9", val: signal.ema9 },
            { label: "EMA-20", val: signal.ema20 },
            { label: "EMA-50", val: signal.ema50 },
            { label: "EMA-200", val: signal.ema200 },
          ].map((e) => (
            <div key={e.label} className="rounded-md px-2 py-1.5 text-center text-xs bg-gray-50 border border-gray-200">
              <div className="font-semibold text-gray-500">{e.label}</div>
              <div className="text-[10px] mt-0.5 text-gray-700">{fmt(e.val)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Confluence */}
      {signal.fibEmaConfluences.length > 0 && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-3">
          <div className="flex items-center gap-1.5 text-green-700 font-semibold text-xs mb-2">
            <Sparkles className="h-3.5 w-3.5" />
            Fib + EMA Confluence Detected
          </div>
          <div className="space-y-1">
            {signal.fibEmaConfluences.map((c, i) => (
              <div key={i} className="text-xs text-green-800">
                {c.fibLevel}% Fib ({fmt(c.fibPrice)}) ↔ EMA-{c.emaPeriod} ({fmt(c.emaValue)}) — within {c.fibProximityPct.toFixed(2)}%
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Signal Row ───────────────────────────────────────────────────────────────

function SignalRow({ signal }: { signal: DailySignal }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className={`border-b border-border hover:bg-accent/50 cursor-pointer transition-colors ${expanded ? "bg-accent/30" : ""}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-foreground">{signal.ticker}</span>
            {signal.hasConfluence && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-400 text-green-700 bg-green-50">
                    <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                    Confluence
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Fib + EMA confluence detected within 1%</TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground">{signal.signalDate}</div>
        </td>
        <td className="px-3 py-2.5 text-right">
          <div className="font-semibold text-sm">{fmt(signal.entry)}</div>
          <div className="text-[10px] text-red-500 flex items-center justify-end gap-0.5">
            <TrendingDown className="h-3 w-3" />
            {fmtPct(signal.dropPct)}
          </div>
        </td>
        <td className="px-3 py-2.5 text-right">
          <div className="text-xs text-muted-foreground">T25</div>
          <div className="text-sm font-medium text-blue-600">{fmt(signal.target25)}</div>
        </td>
        <td className="px-3 py-2.5 text-right">
          <div className="text-xs text-muted-foreground">T50</div>
          <div className="text-sm font-medium text-green-600">{fmt(signal.target50)}</div>
        </td>
        <td className="px-3 py-2.5 text-right hidden sm:table-cell">
          <div className="text-xs text-muted-foreground">Stop</div>
          <div className="text-sm font-medium text-red-500">{fmt(signal.stop)}</div>
        </td>
        <td className="px-3 py-2.5 text-right hidden md:table-cell">
          <div className="text-xs text-muted-foreground">Vol Ratio</div>
          <div className={`text-sm font-medium ${signal.volumeRatio >= 2 ? "text-orange-500" : "text-foreground"}`}>
            {signal.volumeRatio.toFixed(1)}x
          </div>
        </td>
        <td className="px-3 py-2.5 text-center">
          <div className="flex items-center justify-center gap-1">
            {/* Fib level badges */}
            {signal.fibRetracements.slice(1, 3).map((f) => (
              <span key={f.level} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${fibLevelColor(f.level)}`}>
                {f.level}%
              </span>
            ))}
          </div>
        </td>
        <td className="px-3 py-2.5 text-center">
          <div className="text-muted-foreground">
            {expanded ? <ChevronDown className="h-4 w-4 mx-auto" /> : <ChevronRight className="h-4 w-4 mx-auto" />}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-accent/20">
          <td colSpan={8} className="px-4 py-4">
            <FibLevelsPanel signal={signal} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VelezScanner() {
  const [tab, setTab] = useState<"daily" | "intraday">("daily");
  const [thresholdPct, setThresholdPct] = useState(1.0);
  const [enabled, setEnabled] = useState(false);

  const dailyQuery = trpc.velez.scanDaily.useQuery(
    { thresholdPct },
    { enabled: enabled && tab === "daily", staleTime: 5 * 60 * 1000 }
  );

  const intradayQuery = trpc.velez.scanIntraday.useQuery(
    { thresholdPct },
    { enabled: enabled && tab === "intraday", staleTime: 60 * 1000 }
  );

  const query = tab === "daily" ? dailyQuery : intradayQuery;
  const signals = (query.data as DailySignal[] | undefined) ?? [];

  const handleScan = () => {
    setEnabled(true);
    if (tab === "daily") dailyQuery.refetch();
    else intradayQuery.refetch();
    toast.info(`Running ${tab} Velez scan across 60 PCR tickers…`);
  };

  const confluenceCount = signals.filter((s) => s.hasConfluence).length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-blue-500" />
            Velez Scanner
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Scans 60 PCR tickers for Velez drop signals with Fibonacci overlay and EMA confluence
          </p>
        </div>
        <Button
          onClick={handleScan}
          disabled={query.isFetching}
          className="bg-green-500 hover:bg-green-600 text-white shrink-0"
        >
          {query.isFetching ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Zap className="h-4 w-4 mr-2" />
          )}
          {query.isFetching ? "Scanning…" : "Run Scan"}
        </Button>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3 min-w-48">
              <label className="text-sm font-medium whitespace-nowrap">
                Confluence Threshold
              </label>
              <div className="flex items-center gap-2 flex-1">
                <Slider
                  min={0.1}
                  max={3}
                  step={0.1}
                  value={[thresholdPct]}
                  onValueChange={([v]) => setThresholdPct(v)}
                  className="w-32"
                />
                <span className="text-sm font-semibold text-green-600 w-10">
                  {thresholdPct.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              Price must be within this % of both a Fib level AND an EMA simultaneously to flag as confluence
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats bar */}
      {signals.length > 0 && (
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-foreground">
            <TrendingDown className="h-4 w-4 text-red-500" />
            <span className="font-semibold">{signals.length}</span>
            <span className="text-muted-foreground">signals found</span>
          </div>
          {confluenceCount > 0 && (
            <div className="flex items-center gap-1.5 text-green-700">
              <Sparkles className="h-4 w-4" />
              <span className="font-semibold">{confluenceCount}</span>
              <span>with Fib+EMA confluence</span>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as "daily" | "intraday")}>
        <TabsList>
          <TabsTrigger value="daily">Daily Signals</TabsTrigger>
          <TabsTrigger value="intraday">Intraday 5-min</TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="mt-4">
          <ScannerTable signals={signals} loading={query.isFetching} started={enabled} />
        </TabsContent>
        <TabsContent value="intraday" className="mt-4">
          <ScannerTable signals={signals} loading={query.isFetching} started={enabled} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ScannerTable({
  signals,
  loading,
  started,
}: {
  signals: DailySignal[];
  loading: boolean;
  started: boolean;
}) {
  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground border border-dashed border-border rounded-xl">
        <Zap className="h-8 w-8 text-green-400" />
        <div className="text-sm font-medium">Click "Run Scan" to scan 60 PCR tickers</div>
        <div className="text-xs">Results include Fib retracements, extension targets, and EMA confluence</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
        <RefreshCw className="h-8 w-8 animate-spin text-green-500" />
        <div className="text-sm">Scanning 60 tickers and computing Fibonacci levels…</div>
        <div className="text-xs text-muted-foreground">This may take 15–30 seconds</div>
      </div>
    );
  }

  if (signals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground border border-dashed border-border rounded-xl">
        <AlertTriangle className="h-8 w-8 text-yellow-400" />
        <div className="text-sm font-medium">No Velez signals found today</div>
        <div className="text-xs">Market may be in a low-volatility phase</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Ticker</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">Entry / Drop</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">T25%</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">T50%</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground hidden sm:table-cell">Stop</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground hidden md:table-cell">Vol</th>
              <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">Fib Levels</th>
              <th className="px-3 py-2.5 w-8" />
            </tr>
          </thead>
          <tbody>
            {signals.map((s) => (
              <SignalRow key={s.ticker} signal={s} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 bg-muted/30 border-t border-border text-xs text-muted-foreground">
        Click any row to expand Fib retracements, extension targets (127.2%, 161.8%, 261.8%), and EMA values.
        <span className="ml-2 text-green-600 font-medium">Green "Confluence" badge = price within {1}% of both Fib level AND EMA.</span>
      </div>
    </div>
  );
}
