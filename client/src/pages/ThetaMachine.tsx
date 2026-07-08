import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Timer,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  RefreshCw,
  Search,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarLeg {
  strike: number;
  shortExpiry: string;
  longExpiry: string;
  shortDte: number;
  longDte: number;
  shortTheta: number;
  longTheta: number;
  netTheta: number;
  shortPremium: number;
  longPremium: number;
  netDebit: number;
  maxProfit: number;
  breakEvenLow: number;
  breakEvenHigh: number;
  delta: number;
  vega: number;
  type: "call" | "put";
}

interface ThetaMachineResult {
  ticker: string;
  price: number;
  iv30: number;
  ivRank: number;
  mode: string;
  recommendation: string;
  signal: "STRONG" | "MODERATE" | "WATCH" | "SKIP";
  legs: CalendarLeg[];
  earningsDate?: string;
  daysToEarnings?: number;
  ironButterfly?: {
    strike: number;
    callSell: number;
    putSell: number;
    callBuy: number;
    putBuy: number;
    maxProfit: number;
    maxLoss: number;
    breakEvenLow: number;
    breakEvenHigh: number;
    ivCrushTarget: number;
  };
}

// ─── Tent P&L SVG Diagram ─────────────────────────────────────────────────────

function TentDiagram({
  breakEvenLow,
  breakEvenHigh,
  strike,
  price,
  maxProfit,
  netDebit,
  width = 320,
  height = 120,
}: {
  breakEvenLow: number;
  breakEvenHigh: number;
  strike: number;
  price: number;
  maxProfit: number;
  netDebit: number;
  width?: number;
  height?: number;
}) {
  const pad = { left: 40, right: 20, top: 16, bottom: 28 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;

  // Price range to display: 20% around strike
  const range = strike * 0.20;
  const minP = strike - range;
  const maxP = strike + range;

  const toX = (p: number) => pad.left + ((p - minP) / (maxP - minP)) * w;
  const toY = (pnl: number) => {
    // pnl range: -netDebit to +maxProfit
    const pnlRange = maxProfit + netDebit;
    return pad.top + h - ((pnl + netDebit) / pnlRange) * h;
  };

  const zeroY = toY(0);

  // Build tent path points
  const points: [number, number][] = [
    [minP, -netDebit],
    [breakEvenLow, 0],
    [strike, maxProfit],
    [breakEvenHigh, 0],
    [maxP, -netDebit],
  ];

  const pathD = points
    .map(([p, pnl], i) => `${i === 0 ? "M" : "L"} ${toX(p).toFixed(1)} ${toY(pnl).toFixed(1)}`)
    .join(" ");

  // Fill profit zone
  const profitPoints = [
    [breakEvenLow, 0],
    [strike, maxProfit],
    [breakEvenHigh, 0],
  ] as [number, number][];
  const fillD =
    profitPoints.map(([p, pnl], i) => `${i === 0 ? "M" : "L"} ${toX(p).toFixed(1)} ${toY(pnl).toFixed(1)}`).join(" ") +
    ` L ${toX(breakEvenHigh).toFixed(1)} ${zeroY.toFixed(1)} L ${toX(breakEvenLow).toFixed(1)} ${zeroY.toFixed(1)} Z`;

  const currentX = toX(Math.min(Math.max(price, minP), maxP));

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* Zero line */}
      <line x1={pad.left} y1={zeroY} x2={pad.left + w} y2={zeroY} stroke="#e5e7eb" strokeWidth={1} />

      {/* Profit fill */}
      <path d={fillD} fill="oklch(0.60 0.175 145 / 15%)" />

      {/* Tent outline */}
      <path d={pathD} fill="none" stroke="oklch(0.60 0.175 145)" strokeWidth={2} strokeLinejoin="round" />

      {/* Break-even markers */}
      <line x1={toX(breakEvenLow)} y1={pad.top} x2={toX(breakEvenLow)} y2={pad.top + h} stroke="#f59e0b" strokeWidth={1} strokeDasharray="3,3" />
      <line x1={toX(breakEvenHigh)} y1={pad.top} x2={toX(breakEvenHigh)} y2={pad.top + h} stroke="#f59e0b" strokeWidth={1} strokeDasharray="3,3" />

      {/* Strike marker */}
      <line x1={toX(strike)} y1={pad.top} x2={toX(strike)} y2={pad.top + h} stroke="#6366f1" strokeWidth={1} strokeDasharray="4,2" />

      {/* Current price marker */}
      <line x1={currentX} y1={pad.top} x2={currentX} y2={pad.top + h} stroke="#ef4444" strokeWidth={1.5} />
      <circle cx={currentX} cy={toY(0)} r={3} fill="#ef4444" />

      {/* Labels */}
      <text x={toX(breakEvenLow)} y={pad.top + h + 14} textAnchor="middle" fontSize={9} fill="#f59e0b">${breakEvenLow.toFixed(0)}</text>
      <text x={toX(breakEvenHigh)} y={pad.top + h + 14} textAnchor="middle" fontSize={9} fill="#f59e0b">${breakEvenHigh.toFixed(0)}</text>
      <text x={toX(strike)} y={pad.top - 4} textAnchor="middle" fontSize={9} fill="#6366f1">Strike ${strike.toFixed(0)}</text>

      {/* Y-axis labels */}
      <text x={pad.left - 4} y={toY(maxProfit)} textAnchor="end" fontSize={8} fill="#22c55e" dominantBaseline="middle">+${maxProfit.toFixed(0)}</text>
      <text x={pad.left - 4} y={zeroY} textAnchor="end" fontSize={8} fill="#6b7280" dominantBaseline="middle">0</text>
      <text x={pad.left - 4} y={toY(-netDebit)} textAnchor="end" fontSize={8} fill="#ef4444" dominantBaseline="middle">-${netDebit.toFixed(0)}</text>
    </svg>
  );
}

// ─── Iron Butterfly P&L Diagram ───────────────────────────────────────────────

function IronButterflyDiagram({
  strike,
  callBuy,
  putBuy,
  maxProfit,
  maxLoss,
  breakEvenLow,
  breakEvenHigh,
  price,
  width = 320,
  height = 120,
}: {
  strike: number;
  callBuy: number;
  putBuy: number;
  maxProfit: number;
  maxLoss: number;
  breakEvenLow: number;
  breakEvenHigh: number;
  price: number;
  width?: number;
  height?: number;
}) {
  const pad = { left: 44, right: 20, top: 16, bottom: 28 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;

  const minP = putBuy * 0.95;
  const maxP = callBuy * 1.05;

  const toX = (p: number) => pad.left + ((p - minP) / (maxP - minP)) * w;
  const toY = (pnl: number) => {
    const range = maxProfit + maxLoss;
    return pad.top + h - ((pnl + maxLoss) / range) * h;
  };

  const zeroY = toY(0);

  const points: [number, number][] = [
    [minP, -maxLoss],
    [putBuy, -maxLoss],
    [breakEvenLow, 0],
    [strike, maxProfit],
    [breakEvenHigh, 0],
    [callBuy, -maxLoss],
    [maxP, -maxLoss],
  ];

  const pathD = points
    .map(([p, pnl], i) => `${i === 0 ? "M" : "L"} ${toX(p).toFixed(1)} ${toY(pnl).toFixed(1)}`)
    .join(" ");

  const fillD = [
    [breakEvenLow, 0],
    [strike, maxProfit],
    [breakEvenHigh, 0],
  ].map(([p, pnl], i) => `${i === 0 ? "M" : "L"} ${toX(p).toFixed(1)} ${toY(pnl).toFixed(1)}`).join(" ") +
    ` L ${toX(breakEvenHigh).toFixed(1)} ${zeroY.toFixed(1)} L ${toX(breakEvenLow).toFixed(1)} ${zeroY.toFixed(1)} Z`;

  const currentX = toX(Math.min(Math.max(price, minP), maxP));

  return (
    <svg width={width} height={height} className="overflow-visible">
      <line x1={pad.left} y1={zeroY} x2={pad.left + w} y2={zeroY} stroke="#e5e7eb" strokeWidth={1} />
      <path d={fillD} fill="oklch(0.60 0.175 145 / 15%)" />
      <path d={pathD} fill="none" stroke="oklch(0.60 0.175 145)" strokeWidth={2} strokeLinejoin="round" />
      <line x1={toX(breakEvenLow)} y1={pad.top} x2={toX(breakEvenLow)} y2={pad.top + h} stroke="#f59e0b" strokeWidth={1} strokeDasharray="3,3" />
      <line x1={toX(breakEvenHigh)} y1={pad.top} x2={toX(breakEvenHigh)} y2={pad.top + h} stroke="#f59e0b" strokeWidth={1} strokeDasharray="3,3" />
      <line x1={toX(strike)} y1={pad.top} x2={toX(strike)} y2={pad.top + h} stroke="#6366f1" strokeWidth={1} strokeDasharray="4,2" />
      <line x1={currentX} y1={pad.top} x2={currentX} y2={pad.top + h} stroke="#ef4444" strokeWidth={1.5} />
      <circle cx={currentX} cy={zeroY} r={3} fill="#ef4444" />
      <text x={toX(breakEvenLow)} y={pad.top + h + 14} textAnchor="middle" fontSize={9} fill="#f59e0b">${breakEvenLow.toFixed(0)}</text>
      <text x={toX(breakEvenHigh)} y={pad.top + h + 14} textAnchor="middle" fontSize={9} fill="#f59e0b">${breakEvenHigh.toFixed(0)}</text>
      <text x={toX(strike)} y={pad.top - 4} textAnchor="middle" fontSize={9} fill="#6366f1">ATM ${strike.toFixed(0)}</text>
      <text x={pad.left - 4} y={toY(maxProfit)} textAnchor="end" fontSize={8} fill="#22c55e" dominantBaseline="middle">+${maxProfit.toFixed(0)}</text>
      <text x={pad.left - 4} y={zeroY} textAnchor="end" fontSize={8} fill="#6b7280" dominantBaseline="middle">0</text>
      <text x={pad.left - 4} y={toY(-maxLoss)} textAnchor="end" fontSize={8} fill="#ef4444" dominantBaseline="middle">-${maxLoss.toFixed(0)}</text>
    </svg>
  );
}

// ─── Signal Badge ─────────────────────────────────────────────────────────────

function SignalBadge({ signal }: { signal: string }) {
  const map: Record<string, { color: string; label: string }> = {
    STRONG: { color: "bg-green-100 text-green-700 border-green-200", label: "STRONG" },
    MODERATE: { color: "bg-blue-100 text-blue-700 border-blue-200", label: "MODERATE" },
    WATCH: { color: "bg-amber-100 text-amber-700 border-amber-200", label: "WATCH" },
    SKIP: { color: "bg-red-100 text-red-700 border-red-200", label: "SKIP" },
  };
  const s = map[signal] ?? map.WATCH;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${s.color}`}>
      {s.label}
    </span>
  );
}

// ─── Mode Icon ────────────────────────────────────────────────────────────────

function ModeIcon({ mode }: { mode: string }) {
  if (mode === "BULLISH") return <TrendingUp className="h-4 w-4 text-green-600" />;
  if (mode === "BEARISH") return <TrendingDown className="h-4 w-4 text-red-500" />;
  if (mode === "EARNINGS_BUTTERFLY") return <Zap className="h-4 w-4 text-purple-600" />;
  return <Minus className="h-4 w-4 text-blue-500" />;
}

// ─── Result Card ──────────────────────────────────────────────────────────────

function ThetaResultCard({ result, price }: { result: ThetaMachineResult; price: number }) {
  const [expanded, setExpanded] = useState(result.signal === "STRONG");
  const leg = result.legs[0];

  return (
    <Card className={`border ${result.signal === "STRONG" ? "border-green-200 bg-green-50/30" : result.signal === "SKIP" ? "border-red-200 bg-red-50/20" : "border-border"}`}>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ModeIcon mode={result.mode} />
            <span className="font-bold text-base">{result.ticker}</span>
            <span className="text-sm text-muted-foreground">${result.price.toFixed(2)}</span>
            <SignalBadge signal={result.signal} />
            {result.mode === "EARNINGS_BUTTERFLY" && (
              <Badge variant="outline" className="text-purple-600 border-purple-300 text-xs">
                Earnings {result.daysToEarnings}d
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-muted-foreground">IVR</div>
              <div className={`text-sm font-semibold ${result.ivRank >= 40 ? "text-green-600" : result.ivRank >= 20 ? "text-amber-600" : "text-red-500"}`}>
                {result.ivRank.toFixed(0)}%
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">IV30</div>
              <div className="text-sm font-semibold">{(result.iv30 * 100).toFixed(0)}%</div>
            </div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 hover:bg-muted rounded transition-colors"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{result.recommendation}</p>
      </CardHeader>

      {expanded && (
        <CardContent className="px-4 pb-4 pt-0">
          <Separator className="mb-3" />

          {result.mode === "EARNINGS_BUTTERFLY" && result.ironButterfly ? (
            // ── Earnings Iron Butterfly ──
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="h-3.5 w-3.5 text-purple-600" />
                <span className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Earnings Iron Butterfly — IV Crush Play</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Structure</div>
                  <div className="text-xs space-y-0.5">
                    <div className="flex justify-between"><span className="text-muted-foreground">Sell ATM Call</span><span className="font-medium">${result.ironButterfly.callSell.toFixed(0)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Sell ATM Put</span><span className="font-medium">${result.ironButterfly.putSell.toFixed(0)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Buy OTM Call</span><span className="font-medium">${result.ironButterfly.callBuy.toFixed(0)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Buy OTM Put</span><span className="font-medium">${result.ironButterfly.putBuy.toFixed(0)}</span></div>
                  </div>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">P&L</div>
                  <div className="text-xs space-y-0.5">
                    <div className="flex justify-between"><span className="text-muted-foreground">Max Profit</span><span className="font-semibold text-green-600">+${result.ironButterfly.maxProfit.toFixed(0)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Max Loss</span><span className="font-semibold text-red-500">-${result.ironButterfly.maxLoss.toFixed(0)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">BE Low</span><span className="font-medium">${result.ironButterfly.breakEvenLow.toFixed(0)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">BE High</span><span className="font-medium">${result.ironButterfly.breakEvenHigh.toFixed(0)}</span></div>
                  </div>
                </div>
              </div>
              <div className="flex justify-center mt-2">
                <IronButterflyDiagram
                  strike={result.ironButterfly.strike}
                  callBuy={result.ironButterfly.callBuy}
                  putBuy={result.ironButterfly.putBuy}
                  maxProfit={result.ironButterfly.maxProfit}
                  maxLoss={result.ironButterfly.maxLoss}
                  breakEvenLow={result.ironButterfly.breakEvenLow}
                  breakEvenHigh={result.ironButterfly.breakEvenHigh}
                  price={result.price}
                />
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-2.5 text-xs text-purple-800">
                <span className="font-semibold">IV Crush target:</span> IV drops from {(result.iv30 * 100).toFixed(0)}% to ~{result.ironButterfly.ivCrushTarget.toFixed(0)}% after earnings.
                Enter 1–2 days before earnings. Exit same day as earnings announcement.
              </div>
            </div>
          ) : leg ? (
            // ── Calendar Spread ──
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-muted/50 rounded-lg p-2.5 text-center">
                  <div className="text-xs text-muted-foreground">Net Debit</div>
                  <div className="text-sm font-bold text-red-500">-${leg.netDebit.toFixed(2)}</div>
                  <div className="text-[10px] text-muted-foreground">per contract</div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 text-center">
                  <div className="text-xs text-muted-foreground">Max Profit</div>
                  <div className="text-sm font-bold text-green-600">+${leg.maxProfit.toFixed(2)}</div>
                  <div className="text-[10px] text-muted-foreground">at expiry</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-2.5 text-center">
                  <div className="text-xs text-muted-foreground">Net θ/day</div>
                  <div className="text-sm font-bold text-blue-600">+${Math.abs(leg.netTheta).toFixed(2)}</div>
                  <div className="text-[10px] text-muted-foreground">theta edge</div>
                </div>
              </div>

              {/* Legs detail */}
              <div className="bg-muted/30 rounded-lg p-3 text-xs space-y-1.5">
                <div className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] mb-2">Spread Structure — {leg.type.toUpperCase()} Calendar @ ${leg.strike}</div>
                <div className="grid grid-cols-3 gap-1 text-[10px] text-muted-foreground font-medium border-b pb-1 mb-1">
                  <span>Leg</span><span className="text-right">Premium</span><span className="text-right">θ/day</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-red-600">Sell {leg.shortDte}d</span>
                  <span className="text-right">+${leg.shortPremium.toFixed(2)}</span>
                  <span className="text-right text-green-600">+${Math.abs(leg.shortTheta).toFixed(3)}</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-blue-600">Buy {leg.longDte}d</span>
                  <span className="text-right">-${leg.longPremium.toFixed(2)}</span>
                  <span className="text-right text-red-500">-${Math.abs(leg.longTheta).toFixed(3)}</span>
                </div>
                <div className="grid grid-cols-3 gap-1 border-t pt-1 font-semibold">
                  <span>Net</span>
                  <span className="text-right text-red-500">-${leg.netDebit.toFixed(2)}</span>
                  <span className="text-right text-blue-600">+${Math.abs(leg.netTheta).toFixed(3)}</span>
                </div>
              </div>

              {/* Tent diagram */}
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-1.5">P&L at Short Expiry</div>
                <div className="flex justify-center">
                  <TentDiagram
                    breakEvenLow={leg.breakEvenLow}
                    breakEvenHigh={leg.breakEvenHigh}
                    strike={leg.strike}
                    price={result.price}
                    maxProfit={leg.maxProfit}
                    netDebit={leg.netDebit}
                  />
                </div>
                <div className="flex justify-center gap-4 mt-1 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-amber-400" /> Break-even</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-indigo-400" style={{borderTop: "1px dashed"}} /> Strike</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-red-400" /> Current price</span>
                </div>
              </div>

              {/* Trade rules */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-xs text-blue-800 space-y-1">
                <div className="font-semibold">Ravish's Rules for this trade:</div>
                <div>• Short leg at <strong>20–30 delta</strong> — {(Math.abs(leg.delta) * 100).toFixed(0)}% delta on this setup</div>
                <div>• Exit at <strong>30–50% of max profit</strong> — target ${(leg.maxProfit * 0.4).toFixed(0)}/contract</div>
                <div>• Close entire spread before short leg expires — never hold long leg alone</div>
                <div>• Max loss = net debit paid (${leg.netDebit.toFixed(2)}/contract) — defined risk</div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-4">No spread data available</div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const DEFAULT_TICKERS = ["SPY", "QQQ", "NVDA", "AAPL", "TSLA", "MSFT", "AMZN", "META", "GOOGL", "JPM", "GLD", "TLT", "AMD", "NFLX", "COIN"];

export default function ThetaMachine() {
  const [tab, setTab] = useState<"neutral" | "bullish" | "bearish" | "earnings">("neutral");
  const [customTicker, setCustomTicker] = useState("");
  const [scanTickers, setScanTickers] = useState<string[]>(DEFAULT_TICKERS);
  const [showLearnMode, setShowLearnMode] = useState(false);

  const modeMap = {
    neutral: "NEUTRAL" as const,
    bullish: "BULLISH" as const,
    bearish: "BEARISH" as const,
    earnings: "EARNINGS_BUTTERFLY" as const,
  };

  const { data, isLoading, refetch } = trpc.thetaMachine.scan.useQuery(
    { tickers: scanTickers, mode: modeMap[tab] },
    { staleTime: 5 * 60 * 1000 }
  );

  const results: ThetaMachineResult[] = (data as any) ?? [];

  const sorted = useMemo(() => {
    const order = { STRONG: 0, MODERATE: 1, WATCH: 2, SKIP: 3 };
    return [...results].sort((a, b) => (order[a.signal] ?? 3) - (order[b.signal] ?? 3));
  }, [results]);

  const counts = useMemo(() => ({
    strong: results.filter(r => r.signal === "STRONG").length,
    moderate: results.filter(r => r.signal === "MODERATE").length,
    watch: results.filter(r => r.signal === "WATCH").length,
    skip: results.filter(r => r.signal === "SKIP").length,
  }), [results]);

  const handleAddTicker = () => {
    const t = customTicker.trim().toUpperCase();
    if (!t) return;
    if (scanTickers.includes(t)) {
      toast.info(`${t} is already in the scan list`);
      return;
    }
    setScanTickers(prev => [...prev, t]);
    setCustomTicker("");
    toast.success(`Added ${t} to scan list`);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Timer className="h-6 w-6 text-green-600" />
            <h1 className="text-2xl font-bold">Theta Machine</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Calendar spreads &amp; earnings butterflies — sell time decay, act like the casino.
            Based on Ravish's "Theta Machine" framework.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowLearnMode(!showLearnMode)}
            className="gap-1.5"
          >
            <Info className="h-3.5 w-3.5" />
            {showLearnMode ? "Hide" : "Learn Mode"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Learn Mode Panel */}
      {showLearnMode && (
        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="p-4 space-y-3">
            <div className="font-semibold text-blue-800 flex items-center gap-2">
              <Info className="h-4 w-4" />
              What is a Calendar Spread? (Plain English)
            </div>
            <div className="text-sm text-blue-900 space-y-2">
              <p>
                <strong>The idea:</strong> You sell a short-term option (expires in 1–2 weeks) and buy a longer-term option (expires in 3–4 weeks) at the <em>same strike price</em>. You pay a small net debit upfront.
              </p>
              <p>
                <strong>Why it works:</strong> Short-term options lose value faster than long-term options. The short leg decays quickly (you profit), while the long leg decays slowly (small cost). You're capturing the difference in decay rates — that's the "theta edge."
              </p>
              <p>
                <strong>The tent shape:</strong> The P&L diagram looks like a tent — you profit most if the stock stays near your strike at expiry. You lose if the stock moves too far in either direction.
              </p>
              <p>
                <strong>Earnings Iron Butterfly:</strong> Before earnings, IV (implied volatility) spikes. After the announcement, IV collapses — this is called "IV crush." You sell an ATM call and put (collecting the inflated premium), buy OTM wings for protection, and profit from the IV collapse after earnings.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 pt-1">
              {[
                { label: "Neutral Calendar", desc: "Stock stays flat. Strike at current price.", icon: "↔️" },
                { label: "Bullish Calendar", desc: "Stock drifts up slowly. Strike above price.", icon: "↗️" },
                { label: "Earnings Butterfly", desc: "IV crush after earnings. ATM strike.", icon: "⚡" },
              ].map(item => (
                <div key={item.label} className="bg-white border border-blue-200 rounded-lg p-2.5 text-xs">
                  <div className="text-lg mb-1">{item.icon}</div>
                  <div className="font-semibold text-blue-800">{item.label}</div>
                  <div className="text-blue-700 mt-0.5">{item.desc}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ticker input */}
      <div className="flex gap-2">
        <Input
          placeholder="Add ticker (e.g. SNDK)"
          value={customTicker}
          onChange={e => setCustomTicker(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === "Enter" && handleAddTicker()}
          className="max-w-48"
        />
        <Button size="sm" onClick={handleAddTicker} className="gap-1.5">
          <Search className="h-3.5 w-3.5" />
          Add
        </Button>
        {scanTickers.length !== DEFAULT_TICKERS.length && (
          <Button size="sm" variant="outline" onClick={() => setScanTickers(DEFAULT_TICKERS)}>
            Reset
          </Button>
        )}
      </div>

      {/* Mode tabs */}
      <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)}>
        <TabsList className="grid grid-cols-4 w-full max-w-xl">
          <TabsTrigger value="neutral" className="gap-1.5">
            <Minus className="h-3.5 w-3.5" /> Neutral
          </TabsTrigger>
          <TabsTrigger value="bullish" className="gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" /> Bullish
          </TabsTrigger>
          <TabsTrigger value="bearish" className="gap-1.5">
            <TrendingDown className="h-3.5 w-3.5" /> Bearish
          </TabsTrigger>
          <TabsTrigger value="earnings" className="gap-1.5">
            <Zap className="h-3.5 w-3.5" /> Earnings
          </TabsTrigger>
        </TabsList>

        {/* Mode descriptions */}
        <div className="text-xs text-muted-foreground mt-2 px-1">
          {tab === "neutral" && "Sell short-term option + buy longer-term option at ATM strike. Profits if stock stays flat."}
          {tab === "bullish" && "Strike placed above current price. Profits if stock drifts upward slowly over the next 1–2 weeks."}
          {tab === "bearish" && "Put calendar with strike below current price. Profits if stock drifts downward slowly."}
          {tab === "earnings" && "Iron Butterfly timed for earnings IV crush. Enter 1–2 days before, exit same day as announcement."}
        </div>

        {/* Summary stats */}
        {!isLoading && results.length > 0 && (
          <div className="flex gap-3 mt-3">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
              <span className="font-semibold text-green-700">{counts.strong} Strong</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
              <span className="font-semibold text-blue-700">{counts.moderate} Moderate</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              <span className="font-semibold text-amber-700">{counts.watch} Watch</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
              <span className="text-muted-foreground">{counts.skip} Skip</span>
            </div>
          </div>
        )}

        {/* Results */}
        {["neutral", "bullish", "bearish", "earnings"].map(t => (
          <TabsContent key={t} value={t} className="mt-4 space-y-3">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : sorted.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Timer className="h-8 w-8 mx-auto mb-3 opacity-30" />
                <div>No results. Try refreshing or adding more tickers.</div>
              </div>
            ) : (
              sorted.map(result => (
                <ThetaResultCard key={result.ticker} result={result} price={result.price} />
              ))
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Reference card */}
      <Card className="border-muted">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Timer className="h-3.5 w-3.5" />
            Theta Machine Playbook Rules
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <div className="font-semibold text-foreground">Entry Rules</div>
              <div className="text-muted-foreground space-y-1">
                <div>• Sell short leg at <strong>20–30 delta</strong></div>
                <div>• Short leg: 7–14 DTE | Long leg: 21–35 DTE</div>
                <div>• IV Rank ≥ 20% preferred (more premium)</div>
                <div>• Stock in a defined trend or range</div>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="font-semibold text-foreground">Exit Rules</div>
              <div className="text-muted-foreground space-y-1">
                <div>• <strong>Take profit at 30–50% of max profit</strong></div>
                <div>• Close entire spread — never hold long leg alone</div>
                <div>• Stop loss at 2× net debit paid</div>
                <div>• Always close before short leg expires</div>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="font-semibold text-foreground">Earnings Butterfly</div>
              <div className="text-muted-foreground space-y-1">
                <div>• Enter 1–2 days before earnings</div>
                <div>• Exit same day as announcement</div>
                <div>• Profit from IV crush (not direction)</div>
                <div>• Wings 10–15% OTM for protection</div>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="font-semibold text-foreground">Risk Management</div>
              <div className="text-muted-foreground space-y-1">
                <div>• Max loss = net debit (defined risk)</div>
                <div>• Risk max 1–2% of account per spread</div>
                <div>• Avoid earnings events on calendar spreads</div>
                <div>• Vega risk: IV drop hurts long leg more</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
