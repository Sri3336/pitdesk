import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, Search, Info,
  ChevronDown, ChevronUp, Target, Shield, AlertTriangle, Layers,
  ArrowUpRight, ArrowDownRight, Activity,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type SellZone = "SELL_PUT_ZONE" | "SELL_CALL_ZONE" | "NEUTRAL" | "AVOID";
type DirectionBias = "BULLISH" | "BEARISH" | "SIDEWAYS";

interface IctResult {
  ticker: string;
  currentPrice: number;
  htfBias: DirectionBias;
  ltfBias: DirectionBias;
  combinedBias: DirectionBias;
  prevDayHigh: number;
  prevDayLow: number;
  prevDayMid: number;
  externalHigh: number;
  externalLow: number;
  nearestInternalSupport: number | null;
  nearestInternalResistance: number | null;
  levels: Array<{
    price: number;
    type: string;
    date: string;
    strength: string;
    tested: boolean;
    holding: boolean;
  }>;
  openingRange: {
    high: number;
    low: number;
    mid: number;
    size: number;
    sizePct: number;
    breakoutSide: "above" | "below" | "none";
    retestStatus: string;
    retestLevel: number | null;
  } | null;
  sellZone: SellZone;
  sellZoneReason: string;
  suggestedPutStrike: number | null;
  suggestedCallStrike: number | null;
  distanceToPrevHigh: number;
  distanceToPrevLow: number;
  distanceToExtHigh: number;
  distanceToExtLow: number;
  scanTime: string;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number, decimals = 2) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtPct(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function SellZoneBadge({ zone }: { zone: SellZone }) {
  const cfg: Record<SellZone, { label: string; className: string }> = {
    SELL_PUT_ZONE: { label: "Sell Put Zone", className: "bg-green-500/20 text-green-400 border-green-500/40" },
    SELL_CALL_ZONE: { label: "Sell Call Zone", className: "bg-red-500/20 text-red-400 border-red-500/40" },
    NEUTRAL: { label: "Neutral", className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40" },
    AVOID: { label: "Avoid", className: "bg-orange-500/20 text-orange-400 border-orange-500/40" },
  };
  const { label, className } = cfg[zone];
  return <Badge variant="outline" className={`text-xs font-semibold ${className}`}>{label}</Badge>;
}

function BiasBadge({ bias }: { bias: DirectionBias }) {
  if (bias === "BULLISH") return <span className="flex items-center gap-1 text-green-400 text-xs font-semibold"><TrendingUp className="w-3 h-3" />Bullish</span>;
  if (bias === "BEARISH") return <span className="flex items-center gap-1 text-red-400 text-xs font-semibold"><TrendingDown className="w-3 h-3" />Bearish</span>;
  return <span className="flex items-center gap-1 text-muted-foreground text-xs font-semibold"><Minus className="w-3 h-3" />Sideways</span>;
}

function RetestBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    HOLDING: "text-green-400",
    REJECTED: "text-red-400",
    PENDING: "text-yellow-400",
    NONE: "text-muted-foreground",
  };
  return <span className={`text-xs font-medium ${cfg[status] ?? "text-muted-foreground"}`}>{status}</span>;
}

// ─── Detail Card ──────────────────────────────────────────────────────────────

function TickerDetailCard({ result }: { result: IctResult }) {
  const [expanded, setExpanded] = useState(false);
  const or = result.openingRange;

  return (
    <Card className={`border transition-all ${
      result.sellZone === "SELL_PUT_ZONE" ? "border-green-500/30 bg-green-500/5" :
      result.sellZone === "SELL_CALL_ZONE" ? "border-red-500/30 bg-red-500/5" :
      result.sellZone === "AVOID" ? "border-orange-500/30 bg-orange-500/5" :
      "border-border"
    }`}>
      <CardContent className="pt-4 pb-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base">{result.ticker}</span>
              <span className="text-sm text-muted-foreground">{fmt$(result.currentPrice)}</span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <BiasBadge bias={result.htfBias} />
              <span className="text-muted-foreground text-xs">HTF</span>
              <span className="text-muted-foreground">·</span>
              <BiasBadge bias={result.ltfBias} />
              <span className="text-muted-foreground text-xs">LTF</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <SellZoneBadge zone={result.sellZone} />
            {result.error && <span className="text-xs text-red-400">{result.error}</span>}
          </div>
        </div>

        {/* Key levels row */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-background/60 rounded p-2">
            <div className="text-xs text-muted-foreground mb-1">Prev Day High / Low</div>
            <div className="text-xs font-mono">
              <span className="text-red-400">{fmt$(result.prevDayHigh)}</span>
              <span className="text-muted-foreground mx-1">/</span>
              <span className="text-green-400">{fmt$(result.prevDayLow)}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {fmtPct(result.distanceToPrevHigh)} to H · {fmtPct(result.distanceToPrevLow)} to L
            </div>
          </div>
          <div className="bg-background/60 rounded p-2">
            <div className="text-xs text-muted-foreground mb-1">External Liquidity</div>
            <div className="text-xs font-mono">
              <span className="text-red-400">{fmt$(result.externalHigh)}</span>
              <span className="text-muted-foreground mx-1">/</span>
              <span className="text-green-400">{fmt$(result.externalLow)}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {fmtPct(result.distanceToExtHigh)} to H · {fmtPct(result.distanceToExtLow)} to L
            </div>
          </div>
        </div>

        {/* Opening range */}
        {or && (
          <div className="bg-background/60 rounded p-2 mb-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">Opening Range (5-min)</div>
              <RetestBadge status={or.retestStatus} />
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs font-mono">{fmt$(or.low)} – {fmt$(or.high)}</span>
              <span className="text-xs text-muted-foreground">({(or.sizePct * 100).toFixed(2)}%)</span>
              {or.breakoutSide !== "none" && (
                <span className={`text-xs font-medium ${or.breakoutSide === "above" ? "text-green-400" : "text-red-400"}`}>
                  Broke {or.breakoutSide}
                </span>
              )}
            </div>
            {or.retestLevel && (
              <div className="text-xs text-muted-foreground mt-0.5">
                Retest level: <span className="font-mono text-foreground">{fmt$(or.retestLevel)}</span>
              </div>
            )}
          </div>
        )}

        {/* Sell zone reason */}
        <div className={`text-xs rounded p-2 mb-3 ${
          result.sellZone === "SELL_PUT_ZONE" ? "bg-green-500/10 text-green-300" :
          result.sellZone === "SELL_CALL_ZONE" ? "bg-red-500/10 text-red-300" :
          result.sellZone === "AVOID" ? "bg-orange-500/10 text-orange-300" :
          "bg-muted/40 text-muted-foreground"
        }`}>
          {result.sellZoneReason}
        </div>

        {/* Strike suggestions */}
        {(result.suggestedPutStrike || result.suggestedCallStrike) && (
          <div className="flex gap-2 mb-3">
            {result.suggestedPutStrike && (
              <div className="flex-1 bg-green-500/10 border border-green-500/30 rounded p-2">
                <div className="text-xs text-muted-foreground">Sell Put Below</div>
                <div className="text-sm font-bold text-green-400">{fmt$(result.suggestedPutStrike)}</div>
              </div>
            )}
            {result.suggestedCallStrike && (
              <div className="flex-1 bg-red-500/10 border border-red-500/30 rounded p-2">
                <div className="text-xs text-muted-foreground">Sell Call Above</div>
                <div className="text-sm font-bold text-red-400">{fmt$(result.suggestedCallStrike)}</div>
              </div>
            )}
          </div>
        )}

        {/* Expand for levels */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs h-7 text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
          {expanded ? "Hide" : "Show"} liquidity levels ({result.levels.length})
        </Button>

        {expanded && (
          <div className="mt-2 space-y-1">
            {result.levels.map((lvl, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    lvl.type.includes("support") || lvl.type === "external_low" ? "bg-green-400" : "bg-red-400"
                  }`} />
                  <span className="text-muted-foreground capitalize">{lvl.type.replace(/_/g, " ")}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{lvl.strength}</span>
                </div>
                <div className="flex items-center gap-2">
                  {lvl.holding && <span className="text-green-400 text-xs">holding</span>}
                  {lvl.tested && !lvl.holding && <span className="text-yellow-400 text-xs">tested</span>}
                  <span className="font-mono font-medium">{fmt$(lvl.price)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Summary Stats Bar ────────────────────────────────────────────────────────

function SummaryBar({ results }: { results: IctResult[] }) {
  const counts = useMemo(() => ({
    sellPut: results.filter((r) => r.sellZone === "SELL_PUT_ZONE").length,
    sellCall: results.filter((r) => r.sellZone === "SELL_CALL_ZONE").length,
    neutral: results.filter((r) => r.sellZone === "NEUTRAL").length,
    avoid: results.filter((r) => r.sellZone === "AVOID").length,
    bullish: results.filter((r) => r.combinedBias === "BULLISH").length,
    bearish: results.filter((r) => r.combinedBias === "BEARISH").length,
  }), [results]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
      <Card className="border-green-500/20 bg-green-500/5">
        <CardContent className="pt-3 pb-2">
          <div className="text-xs text-muted-foreground">Sell Put Zone</div>
          <div className="text-2xl font-bold text-green-400">{counts.sellPut}</div>
        </CardContent>
      </Card>
      <Card className="border-red-500/20 bg-red-500/5">
        <CardContent className="pt-3 pb-2">
          <div className="text-xs text-muted-foreground">Sell Call Zone</div>
          <div className="text-2xl font-bold text-red-400">{counts.sellCall}</div>
        </CardContent>
      </Card>
      <Card className="border-yellow-500/20 bg-yellow-500/5">
        <CardContent className="pt-3 pb-2">
          <div className="text-xs text-muted-foreground">Neutral</div>
          <div className="text-2xl font-bold text-yellow-400">{counts.neutral}</div>
        </CardContent>
      </Card>
      <Card className="border-orange-500/20 bg-orange-500/5">
        <CardContent className="pt-3 pb-2">
          <div className="text-xs text-muted-foreground">Avoid</div>
          <div className="text-2xl font-bold text-orange-400">{counts.avoid}</div>
        </CardContent>
      </Card>
      <Card className="border-green-500/20">
        <CardContent className="pt-3 pb-2">
          <div className="text-xs text-muted-foreground">HTF Bullish</div>
          <div className="text-2xl font-bold text-green-400">{counts.bullish}</div>
        </CardContent>
      </Card>
      <Card className="border-red-500/20">
        <CardContent className="pt-3 pb-2">
          <div className="text-xs text-muted-foreground">HTF Bearish</div>
          <div className="text-2xl font-bold text-red-400">{counts.bearish}</div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Learn Mode Panel ─────────────────────────────────────────────────────────

function LearnMode() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="w-4 h-4 text-green-400" />
            ICT Liquidity Framework — How It Works
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <div className="font-semibold text-green-400 mb-1">External Liquidity</div>
            <p className="text-muted-foreground">Swing highs and lows where retail stop losses cluster. Price is drawn to these levels to "hunt" stops before reversing. These are the <strong>targets</strong> — not entries.</p>
          </div>
          <Separator />
          <div>
            <div className="font-semibold text-blue-400 mb-1">Internal Liquidity</div>
            <p className="text-muted-foreground">Old resistance that becomes support after a breakout (or vice versa). When price breaks through a level and comes back to <strong>retest</strong> it, that retest is your entry confirmation.</p>
          </div>
          <Separator />
          <div>
            <div className="font-semibold text-yellow-400 mb-1">The Setup (5 Steps)</div>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Check Daily chart — is the overall trend bullish or bearish?</li>
              <li>Mark previous day's high and low as key liquidity levels</li>
              <li>At 9:35 AM, note the opening 5-min candle range (OR high/low)</li>
              <li>Wait for price to break above OR high (bullish) or below OR low (bearish)</li>
              <li><strong>Don't chase.</strong> Wait for the retest of the broken level, then enter</li>
            </ol>
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-500/10 border border-green-500/30 rounded p-3">
              <div className="font-semibold text-green-400 mb-1">Sell Put Zone</div>
              <p className="text-xs text-muted-foreground">Bullish HTF + price holding above internal support. Sell puts <strong>below</strong> the nearest internal support level. Market structure says price should stay above it.</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded p-3">
              <div className="font-semibold text-red-400 mb-1">Sell Call Zone</div>
              <p className="text-xs text-muted-foreground">Bearish HTF + price holding below internal resistance. Sell calls <strong>above</strong> the nearest internal resistance. Market structure says price should stay below it.</p>
            </div>
          </div>
          <div className="bg-orange-500/10 border border-orange-500/30 rounded p-3">
            <div className="font-semibold text-orange-400 mb-1">⚠️ Avoid Zone</div>
            <p className="text-xs text-muted-foreground">Price is at or near an external liquidity target (swing high/low or prev day H/L). A stop hunt sweep could go either direction — wait for resolution before entering any premium position.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Table View ───────────────────────────────────────────────────────────────

function TableView({ results }: { results: IctResult[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ticker</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>HTF</TableHead>
            <TableHead>LTF</TableHead>
            <TableHead>Prev Day H/L</TableHead>
            <TableHead>OR Status</TableHead>
            <TableHead>Signal</TableHead>
            <TableHead>Strike Guidance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((r) => (
            <TableRow key={r.ticker} className={
              r.sellZone === "SELL_PUT_ZONE" ? "bg-green-500/5" :
              r.sellZone === "SELL_CALL_ZONE" ? "bg-red-500/5" :
              r.sellZone === "AVOID" ? "bg-orange-500/5" : ""
            }>
              <TableCell className="font-bold">{r.ticker}</TableCell>
              <TableCell className="font-mono text-sm">{fmt$(r.currentPrice)}</TableCell>
              <TableCell><BiasBadge bias={r.htfBias} /></TableCell>
              <TableCell><BiasBadge bias={r.ltfBias} /></TableCell>
              <TableCell className="text-xs font-mono">
                <span className="text-red-400">{fmt$(r.prevDayHigh)}</span>
                <span className="text-muted-foreground"> / </span>
                <span className="text-green-400">{fmt$(r.prevDayLow)}</span>
              </TableCell>
              <TableCell>
                {r.openingRange ? (
                  <div className="text-xs">
                    <span className={r.openingRange.breakoutSide === "above" ? "text-green-400" : r.openingRange.breakoutSide === "below" ? "text-red-400" : "text-muted-foreground"}>
                      {r.openingRange.breakoutSide === "none" ? "Inside" : `Broke ${r.openingRange.breakoutSide}`}
                    </span>
                    {r.openingRange.retestStatus !== "NONE" && (
                      <span className="text-muted-foreground ml-1">· <RetestBadge status={r.openingRange.retestStatus} /></span>
                    )}
                  </div>
                ) : <span className="text-muted-foreground text-xs">—</span>}
              </TableCell>
              <TableCell><SellZoneBadge zone={r.sellZone} /></TableCell>
              <TableCell className="text-xs font-mono">
                {r.suggestedPutStrike && <span className="text-green-400">Put ≤ {fmt$(r.suggestedPutStrike)}</span>}
                {r.suggestedCallStrike && <span className="text-red-400">Call ≥ {fmt$(r.suggestedCallStrike)}</span>}
                {!r.suggestedPutStrike && !r.suggestedCallStrike && <span className="text-muted-foreground">—</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const DEFAULT_TICKERS = [
  "SPY", "QQQ", "IWM",
  "NVDA", "TSLA", "AAPL", "META", "AMZN", "MSFT", "GOOGL",
  "WDC", "LITE", "SMCI", "PLTR",
];

export default function IctLiquidity() {
  const [tickerInput, setTickerInput] = useState(DEFAULT_TICKERS.join(", "));
  const [scanTickers, setScanTickers] = useState<string[]>(DEFAULT_TICKERS);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [filterZone, setFilterZone] = useState<SellZone | "ALL">("ALL");

  const { data, isLoading, refetch, dataUpdatedAt } = trpc.ictLiquidity.scan.useQuery(
    { tickers: scanTickers },
    { staleTime: 3 * 60 * 1000 }
  );

  const results: IctResult[] = data?.results ?? [];

  const filtered = useMemo(() => {
    if (filterZone === "ALL") return results;
    return results.filter((r) => r.sellZone === filterZone);
  }, [results, filterZone]);

  function handleScan() {
    const tickers = tickerInput
      .split(/[,\s]+/)
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t.length > 0 && t.length <= 10);
    if (tickers.length === 0) { toast.error("Enter at least one ticker"); return; }
    if (tickers.length > 20) { toast.error("Max 20 tickers at once"); return; }
    setScanTickers(tickers);
    setTimeout(() => refetch(), 100);
  }

  const lastScanTime = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : null;

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Activity className="w-6 h-6 text-green-400" />
              ICT Liquidity Scanner
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Internal vs External Liquidity · Direction Bias · Premium Strike Placement
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {lastScanTime && <span>Last scan: {lastScanTime}</span>}
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
              {isLoading ? "Scanning..." : "Refresh"}
            </Button>
          </div>
        </div>

        {/* Ticker input */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Tickers (comma or space separated, max 20)</label>
                <Input
                  value={tickerInput}
                  onChange={(e) => setTickerInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleScan()}
                  placeholder="SPY, QQQ, NVDA, TSLA..."
                  className="font-mono text-sm"
                />
              </div>
              <Button onClick={handleScan} disabled={isLoading} className="bg-green-600 hover:bg-green-700 text-white">
                <Search className="w-4 h-4 mr-1" />
                Scan
              </Button>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="scanner">
          <TabsList>
            <TabsTrigger value="scanner">Scanner</TabsTrigger>
            <TabsTrigger value="learn">Learn ICT Framework</TabsTrigger>
          </TabsList>

          <TabsContent value="scanner" className="space-y-4 mt-4">
            {/* Summary stats */}
            {results.length > 0 && <SummaryBar results={results} />}

            {/* Filter + view toggle */}
            {results.length > 0 && (
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex gap-2 flex-wrap">
                  {(["ALL", "SELL_PUT_ZONE", "SELL_CALL_ZONE", "NEUTRAL", "AVOID"] as const).map((z) => (
                    <Button
                      key={z}
                      size="sm"
                      variant={filterZone === z ? "default" : "outline"}
                      className={`text-xs h-7 ${filterZone === z ? "bg-green-600 text-white" : ""}`}
                      onClick={() => setFilterZone(z)}
                    >
                      {z === "ALL" ? `All (${results.length})` :
                       z === "SELL_PUT_ZONE" ? `Sell Put (${results.filter(r => r.sellZone === "SELL_PUT_ZONE").length})` :
                       z === "SELL_CALL_ZONE" ? `Sell Call (${results.filter(r => r.sellZone === "SELL_CALL_ZONE").length})` :
                       z === "NEUTRAL" ? `Neutral (${results.filter(r => r.sellZone === "NEUTRAL").length})` :
                       `Avoid (${results.filter(r => r.sellZone === "AVOID").length})`}
                    </Button>
                  ))}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant={view === "cards" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setView("cards")}>Cards</Button>
                  <Button size="sm" variant={view === "table" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setView("table")}>Table</Button>
                </div>
              </div>
            )}

            {/* Loading state */}
            {isLoading && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {scanTickers.map((t) => (
                  <Card key={t} className="border-border animate-pulse">
                    <CardContent className="pt-4 pb-3">
                      <div className="h-4 bg-muted rounded w-16 mb-2" />
                      <div className="h-3 bg-muted rounded w-full mb-1" />
                      <div className="h-3 bg-muted rounded w-3/4" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Results */}
            {!isLoading && filtered.length > 0 && (
              view === "cards" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filtered.map((r) => <TickerDetailCard key={r.ticker} result={r} />)}
                </div>
              ) : (
                <Card>
                  <CardContent className="pt-4 pb-2">
                    <TableView results={filtered} />
                  </CardContent>
                </Card>
              )
            )}

            {/* Empty state */}
            {!isLoading && filtered.length === 0 && results.length > 0 && (
              <div className="text-center py-10 text-muted-foreground">
                <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <div className="font-semibold">No tickers match the selected filter</div>
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => setFilterZone("ALL")}>Show all</Button>
              </div>
            )}

            {!isLoading && results.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">
                <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <div className="font-semibold">Enter tickers and click Scan</div>
                <div className="text-sm mt-1">Analyzes ICT liquidity structure, direction bias, and premium strike placement</div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="learn" className="mt-4">
            <LearnMode />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
