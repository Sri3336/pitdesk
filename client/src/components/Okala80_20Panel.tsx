/**
 * Okala 80/20 Level Calculator
 *
 * Based on Okala's NQ scalping system:
 * - Key levels: last two digits 80 and 20 of every hundred
 * - 200-second chart timeframe
 * - 10-point SL / 15-point TP1 / runners to 30-50+ points
 * - NY Open only (9:30–10:30 AM ET)
 * - 4 setups: Fork, Repair Entry, Cross Section, Lowercase h
 */
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
  Info,
  RefreshCw,
  Target,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Given any price, compute the nearest 80 and 20 levels (within ±200 points) */
function compute8020Levels(price: number): {
  levels: { value: number; type: "80" | "20"; distance: number; direction: "above" | "below" | "at" }[];
  currentHundred: number;
  nearest80: number;
  nearest20: number;
} {
  const base = Math.floor(price / 100) * 100;
  const levels: { value: number; type: "80" | "20"; distance: number; direction: "above" | "below" | "at" }[] = [];

  // Generate 80 and 20 levels for ±3 hundreds around current price
  for (let offset = -3; offset <= 3; offset++) {
    const hundred = base + offset * 100;
    const level80 = hundred + 80;
    const level20 = hundred + 20;

    for (const { val, type } of [{ val: level80, type: "80" as const }, { val: level20, type: "20" as const }]) {
      const dist = Math.round((val - price) * 100) / 100;
      const direction = Math.abs(dist) < 0.5 ? "at" as const : dist > 0 ? "above" as const : "below" as const;
      levels.push({ value: val, type, distance: dist, direction });
    }
  }

  // Sort by absolute distance
  levels.sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance));

  const nearest80 = levels.find(l => l.type === "80")!.value;
  const nearest20 = levels.find(l => l.type === "20")!.value;

  return { levels: levels.slice(0, 8), currentHundred: base, nearest80, nearest20 };
}

/** Check if current time is within NY Open window (9:30–10:30 AM ET) */
function isNYOpenWindow(): { inWindow: boolean; label: string; minutesLeft: number } {
  const now = new Date();
  // Convert to ET (UTC-4 in EDT, UTC-5 in EST)
  const etOffset = -4; // EDT (summer)
  const etHour = (now.getUTCHours() + etOffset + 24) % 24;
  const etMinute = now.getUTCMinutes();
  const etMinutes = etHour * 60 + etMinute;

  const openStart = 9 * 60 + 30; // 9:30 AM
  const openEnd = 10 * 60 + 30;  // 10:30 AM

  if (etMinutes >= openStart && etMinutes < openEnd) {
    return { inWindow: true, label: "NY Open Window", minutesLeft: openEnd - etMinutes };
  } else if (etMinutes < openStart) {
    return { inWindow: false, label: `Opens in ${openStart - etMinutes}m`, minutesLeft: openStart - etMinutes };
  } else {
    return { inWindow: false, label: "Window closed", minutesLeft: 0 };
  }
}

// ─── Setup Checklist ──────────────────────────────────────────────────────────

const SETUPS = [
  {
    id: "fork",
    name: "The Fork",
    description: "Mean reversion reversal at 80/20 level",
    steps: [
      "Strong capitulatory move into an 80 or 20 level",
      "Capitulation candle: long wick, small body",
      "Initiation candle: strong bull/bear, NO wick on entry side",
      "Entry: next candle pulls back to initiation candle low/high but holds",
      "Confirms higher low (long) or lower high (short)",
    ],
    direction: "both" as const,
  },
  {
    id: "repair",
    name: "The Repair Entry",
    description: "Missed level becomes a magnet",
    steps: [
      "Price approaches 80/20 level but misses by 1–3 ticks",
      "Bounces away — leaves 'unfilled orders' and poor structure",
      "Wait for price to roll back toward the missed level",
      "Enter on the continuation targeting the exact 80/20 level",
      "Poor structure (flat bottom/top) confirms the magnet",
    ],
    direction: "both" as const,
  },
  {
    id: "crosssection",
    name: "The Cross Section",
    description: "Pullback rejection during trend",
    steps: [
      "Identify the dominant trend direction",
      "Price pulls back against trend with 2+ strong candles",
      "Mark the 'cross section': gap between close of candle 1 and open of candle 2",
      "Price rolls back with trend, then makes one more push against",
      "Enter on rejection of the cross section zone",
    ],
    direction: "both" as const,
  },
  {
    id: "lowercase_h",
    name: "The Lowercase h",
    description: "Structural combination pattern",
    steps: [
      "Strong move down forms the left stem of the 'h'",
      "Bounce creates a Cross Section or Repair level below",
      "Price rolls over — forms the hump of the 'h'",
      "One more push up fails to break the previous high",
      "Enter short at the hump top (often at an 80/20 level)",
      "Target: bottom of the left stem or the unfilled 80/20 below",
    ],
    direction: "short" as const,
  },
];

// ─── R:R Calculator ───────────────────────────────────────────────────────────

function RRCalculator({ currentPrice }: { currentPrice: number }) {
  const [entry, setEntry] = useState(currentPrice.toFixed(2));
  const [stop, setStop] = useState((currentPrice - 10).toFixed(2));
  const [target1, setTarget1] = useState((currentPrice + 15).toFixed(2));
  const [target2, setTarget2] = useState((currentPrice + 40).toFixed(2));
  const [contracts, setContracts] = useState("2");

  const entryN = parseFloat(entry) || 0;
  const stopN = parseFloat(stop) || 0;
  const t1N = parseFloat(target1) || 0;
  const t2N = parseFloat(target2) || 0;
  const contractsN = parseInt(contracts) || 1;

  const risk = Math.abs(entryN - stopN);
  const rr1 = risk > 0 ? Math.abs(t1N - entryN) / risk : 0;
  const rr2 = risk > 0 ? Math.abs(t2N - entryN) / risk : 0;

  // NQ point value = $20/point
  const NQ_POINT_VALUE = 20;
  const riskDollars = risk * NQ_POINT_VALUE * contractsN;
  const t1Dollars = Math.abs(t1N - entryN) * NQ_POINT_VALUE * contractsN;
  const t2Dollars = Math.abs(t2N - entryN) * NQ_POINT_VALUE * contractsN;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <label className="text-muted-foreground block mb-1">Entry</label>
          <Input value={entry} onChange={e => setEntry(e.target.value)} className="h-7 text-xs" />
        </div>
        <div>
          <label className="text-muted-foreground block mb-1">Stop (-10 pts)</label>
          <Input value={stop} onChange={e => setStop(e.target.value)} className="h-7 text-xs" />
        </div>
        <div>
          <label className="text-muted-foreground block mb-1">TP1 (+15 pts)</label>
          <Input value={target1} onChange={e => setTarget1(e.target.value)} className="h-7 text-xs" />
        </div>
        <div>
          <label className="text-muted-foreground block mb-1">Runner (+40 pts)</label>
          <Input value={target2} onChange={e => setTarget2(e.target.value)} className="h-7 text-xs" />
        </div>
      </div>
      <div>
        <label className="text-muted-foreground text-xs block mb-1">Contracts</label>
        <Input value={contracts} onChange={e => setContracts(e.target.value)} className="h-7 text-xs w-20" />
      </div>

      <div className="bg-muted/40 rounded-lg p-3 space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Risk (SL)</span>
          <span className="text-red-500 font-semibold">{risk.toFixed(1)} pts / ${riskDollars.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">TP1 R:R</span>
          <span className={rr1 >= 1.5 ? "text-green-600 font-semibold" : "text-yellow-600 font-semibold"}>
            {rr1.toFixed(2)}:1 / ${t1Dollars.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Runner R:R</span>
          <span className="text-green-600 font-semibold">{rr2.toFixed(2)}:1 / ${t2Dollars.toLocaleString()}</span>
        </div>
        <Separator />
        <div className="text-[10px] text-muted-foreground">
          NQ = $20/point/contract. At TP1: sell 50%, move SL to BE. Let runners run.
        </div>
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function Okala80_20Panel() {
  const [selectedSetup, setSelectedSetup] = useState<string | null>(null);
  const [manualPrice, setManualPrice] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"levels" | "setups" | "rr">("levels");

  const { data: futuresData, isLoading, refetch, dataUpdatedAt } = trpc.openingRangeScalper.getFuturesPrice.useQuery(
    undefined,
    { staleTime: 30_000, refetchInterval: 60_000 }
  );

  const nqData = futuresData?.["NQ=F"];
  const esData = futuresData?.["ES=F"];

  const nqPrice = nqData?.price ?? 0;
  const displayPrice = manualPrice ? parseFloat(manualPrice) : nqPrice;

  const { levels, nearest80, nearest20 } = useMemo(
    () => compute8020Levels(displayPrice || 20000),
    [displayPrice]
  );

  const nyWindow = isNYOpenWindow();
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : null;

  // Auto-update manual price when live price loads
  useEffect(() => {
    if (nqPrice > 0 && !manualPrice) {
      // just use live price
    }
  }, [nqPrice, manualPrice]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-sm flex items-center gap-2">
            <Target className="h-4 w-4 text-green-600" />
            Okala 80/20 Level Calculator
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            NQ scalping system — 200s chart, NY Open only
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* NY Open Window indicator */}
          <Badge
            variant={nyWindow.inWindow ? "default" : "outline"}
            className={`text-[10px] ${nyWindow.inWindow ? "bg-green-600 hover:bg-green-600" : ""}`}
          >
            <Clock className="h-3 w-3 mr-1" />
            {nyWindow.label}
          </Badge>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => refetch()}>
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Live Futures Prices */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { sym: "NQ=F", label: "NQ Futures", data: nqData },
          { sym: "ES=F", label: "ES Futures", data: esData },
        ].map(({ label, data }) => (
          <div key={label} className="bg-muted/30 rounded-lg p-3 border border-border">
            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{label}</div>
            {isLoading ? (
              <div className="h-6 bg-muted animate-pulse rounded mt-1" />
            ) : data ? (
              <>
                <div className="text-lg font-bold tabular-nums mt-0.5">
                  {data.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className={`text-xs flex items-center gap-1 ${data.change >= 0 ? "text-green-600" : "text-red-500"}`}>
                  {data.change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {data.change >= 0 ? "+" : ""}{data.change.toFixed(2)} ({data.changePct >= 0 ? "+" : ""}{data.changePct.toFixed(2)}%)
                </div>
              </>
            ) : (
              <div className="text-xs text-muted-foreground mt-1">No data</div>
            )}
          </div>
        ))}
      </div>

      {/* Manual price override */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground shrink-0">Override NQ price:</label>
        <Input
          value={manualPrice}
          onChange={e => setManualPrice(e.target.value)}
          placeholder={nqPrice ? nqPrice.toFixed(2) : "e.g. 21450"}
          className="h-7 text-xs w-32"
        />
        {manualPrice && (
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setManualPrice("")}>
            Reset
          </Button>
        )}
        {lastUpdated && (
          <span className="text-[10px] text-muted-foreground ml-auto">Updated {lastUpdated}</span>
        )}
      </div>

      {/* Tab selector */}
      <div className="flex gap-1 bg-muted/30 rounded-lg p-1">
        {(["levels", "setups", "rr"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
              activeTab === tab
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "levels" ? "80/20 Levels" : tab === "setups" ? "Setups" : "R:R Calc"}
          </button>
        ))}
      </div>

      {/* ── LEVELS TAB ── */}
      {activeTab === "levels" && (
        <div className="space-y-3">
          {/* Nearest levels highlight */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3 text-center">
              <div className="text-[10px] text-green-700 dark:text-green-400 font-semibold uppercase tracking-wide flex items-center justify-center gap-1">
                <ArrowUp className="h-3 w-3" /> Nearest 80
              </div>
              <div className="text-xl font-bold text-green-700 dark:text-green-400 tabular-nums mt-1">
                {nearest80.toLocaleString()}
              </div>
              <div className="text-xs text-green-600 dark:text-green-500">
                {(nearest80 - (displayPrice || 0)).toFixed(1)} pts away
              </div>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-center">
              <div className="text-[10px] text-blue-700 dark:text-blue-400 font-semibold uppercase tracking-wide flex items-center justify-center gap-1">
                <ArrowDown className="h-3 w-3" /> Nearest 20
              </div>
              <div className="text-xl font-bold text-blue-700 dark:text-blue-400 tabular-nums mt-1">
                {nearest20.toLocaleString()}
              </div>
              <div className="text-xs text-blue-600 dark:text-blue-500">
                {(nearest20 - (displayPrice || 0)).toFixed(1)} pts away
              </div>
            </div>
          </div>

          {/* All levels table */}
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="bg-muted/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground grid grid-cols-4 gap-2">
              <span>Level</span>
              <span>Type</span>
              <span>Distance</span>
              <span>Direction</span>
            </div>
            {levels.map((level) => (
              <div
                key={level.value}
                className={`px-3 py-2 text-xs grid grid-cols-4 gap-2 border-t border-border transition-colors ${
                  level.direction === "at"
                    ? "bg-yellow-50 dark:bg-yellow-950/30"
                    : "hover:bg-muted/30"
                }`}
              >
                <span className="font-bold tabular-nums">{level.value.toLocaleString()}</span>
                <span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 ${
                      level.type === "80"
                        ? "border-green-300 text-green-700 bg-green-50 dark:bg-green-950/30"
                        : "border-blue-300 text-blue-700 bg-blue-50 dark:bg-blue-950/30"
                    }`}
                  >
                    {level.type}
                  </Badge>
                </span>
                <span className={`tabular-nums font-medium ${
                  level.distance > 0 ? "text-green-600" : level.distance < 0 ? "text-red-500" : "text-yellow-600"
                }`}>
                  {level.distance > 0 ? "+" : ""}{level.distance.toFixed(1)}
                </span>
                <span className="text-muted-foreground capitalize">{level.direction}</span>
              </div>
            ))}
          </div>

          {/* Rules reminder */}
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 space-y-1">
            <div className="text-xs font-semibold text-amber-800 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Okala Rules
            </div>
            <ul className="text-[11px] text-amber-700 dark:text-amber-500 space-y-0.5">
              <li>• Chart: 200-second timeframe only</li>
              <li>• SL: Hard 10 points, no exceptions</li>
              <li>• TP1: 15 points → sell 50%, move SL to BE</li>
              <li>• Runners: 30–50+ points on capitulation days</li>
              <li>• Time: NY Open 9:30–10:30 AM ET only</li>
              <li>• Miss by &gt;3 ticks? Cancel, do not chase</li>
            </ul>
          </div>
        </div>
      )}

      {/* ── SETUPS TAB ── */}
      {activeTab === "setups" && (
        <div className="space-y-2">
          {SETUPS.map((setup) => (
            <div
              key={setup.id}
              className="border border-border rounded-lg overflow-hidden"
            >
              <button
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/30 transition-colors text-left"
                onClick={() => setSelectedSetup(selectedSetup === setup.id ? null : setup.id)}
              >
                <div>
                  <div className="text-sm font-semibold">{setup.name}</div>
                  <div className="text-xs text-muted-foreground">{setup.description}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      setup.direction === "short"
                        ? "border-red-300 text-red-600"
                        : "border-purple-300 text-purple-600"
                    }`}
                  >
                    {setup.direction === "both" ? "Long/Short" : "Short"}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    {selectedSetup === setup.id ? "▲" : "▼"}
                  </span>
                </div>
              </button>
              {selectedSetup === setup.id && (
                <div className="border-t border-border bg-muted/20 px-3 py-3">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Entry Checklist
                  </div>
                  <div className="space-y-1.5">
                    {setup.steps.map((step, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className="shrink-0 w-4 h-4 rounded-full bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 text-[10px] font-bold flex items-center justify-center mt-0.5">
                          {i + 1}
                        </span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Confluence tip */}
          <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
            <div className="text-xs font-semibold text-green-800 dark:text-green-400 flex items-center gap-1 mb-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              High-Conviction Confluence
            </div>
            <p className="text-[11px] text-green-700 dark:text-green-500">
              Best setups occur when the 80/20 level aligns with PCR extreme signal on QQQ/SPY.
              Check the PCR Dashboard before entering — EXTREME_GREED PCR + 80 level = strong long bias.
            </p>
          </div>
        </div>
      )}

      {/* ── R:R CALC TAB ── */}
      {activeTab === "rr" && (
        <div className="space-y-3">
          <RRCalculator currentPrice={displayPrice || 20000} />
          <div className="bg-muted/30 rounded-lg p-3 space-y-1.5">
            <div className="text-xs font-semibold flex items-center gap-1">
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
              Trade Management Protocol
            </div>
            <div className="text-[11px] text-muted-foreground space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-yellow-100 text-yellow-700 text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
                <span>Enter with full position at limit order on setup confirmation</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center shrink-0">2</span>
                <span>At +15 pts: sell 50% of position, move SL to break-even</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-green-100 text-green-700 text-[10px] font-bold flex items-center justify-center shrink-0">3</span>
                <span>Runners: target 30–50+ pts on trend days, 20–25 pts on choppy days</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-red-100 text-red-700 text-[10px] font-bold flex items-center justify-center shrink-0">!</span>
                <span>Hard 10-pt stop on ALL contracts — no exceptions, no widening</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
