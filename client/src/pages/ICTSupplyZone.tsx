/**
 * ICT Pro-Trend Supply Zone Scanner
 *
 * Full implementation of the strategy from the YouTube video with all the
 * missing pieces: stop placement, take-profit, zone invalidation, position
 * sizing, R:R math, and trade guidance.
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Minus,
  Target,
  Shield,
  DollarSign,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Search,
  Info,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types (mirrored from server) ─────────────────────────────────────────────

interface SupplyZone {
  high: number;
  low: number;
  midpoint: number;
  formedAt: string;
  testedCount: number;
  fresh: boolean;
  strength: "strong" | "moderate" | "weak";
  invalidated: boolean;
}

interface AsianRange {
  high: number;
  low: number;
  midpoint: number;
  rangeSize: number;
  rangePct: number;
  tight: boolean;
}

interface SetupResult {
  ticker: string;
  status: "READY" | "WATCHING" | "INVALID" | "NO_ZONE";
  currentPrice: number;
  trend: "downtrend" | "uptrend" | "sideways";
  supplyZone: SupplyZone | null;
  asianRange: AsianRange | null;
  entryPrice: number | null;
  stopLoss: number | null;
  target1: number | null;
  target2: number | null;
  riskReward1: number | null;
  riskReward2: number | null;
  stopDistancePct: number | null;
  positionSize: { shares: number; riskAmount: number; accountSize: number } | null;
  londonInducementDetected: boolean;
  zoneInvalidated: boolean;
  newsWarning: boolean;
  invalidationNote: string;
  setupNotes: string[];
  atr14: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number | null | undefined, decimals = 2) {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function statusBadge(status: SetupResult["status"]) {
  switch (status) {
    case "READY":
      return <Badge className="bg-green-500/20 text-green-400 border-green-500/40 text-xs font-bold">🎯 READY</Badge>;
    case "WATCHING":
      return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 text-xs">👁 WATCHING</Badge>;
    case "NO_ZONE":
      return <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/40 text-xs">NO ZONE</Badge>;
    case "INVALID":
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/40 text-xs">INVALID</Badge>;
  }
}

function trendIcon(trend: SetupResult["trend"]) {
  if (trend === "downtrend") return <TrendingDown className="w-3.5 h-3.5 text-green-400" />;
  if (trend === "uptrend") return <TrendingUp className="w-3.5 h-3.5 text-red-400" />;
  return <Minus className="w-3.5 h-3.5 text-slate-400" />;
}

function trendLabel(trend: SetupResult["trend"]) {
  if (trend === "downtrend") return <span className="text-green-400 text-xs font-medium">Downtrend ✅</span>;
  if (trend === "uptrend") return <span className="text-red-400 text-xs font-medium">Uptrend 🚨</span>;
  return <span className="text-slate-400 text-xs">Sideways</span>;
}

function strengthBadge(strength: SupplyZone["strength"]) {
  if (strength === "strong") return <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-xs">Strong Zone</Badge>;
  if (strength === "moderate") return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-xs">Moderate Zone</Badge>;
  return <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-xs">Weak Zone</Badge>;
}

// ─── Single Result Card ────────────────────────────────────────────────────────

// Pattern Badge — lazy-loaded per ticker
function PatternBadge({ ticker }: { ticker: string }) {
  const { data } = trpc.emaPullback.detectPattern.useQuery(
    { ticker },
    { staleTime: 10 * 60 * 1000 }
  );
  if (!data || data.pattern === "NONE") return null;
  return (
    <Badge
      className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-xs cursor-help"
      title={data.plainEnglish + " | " + data.traderNote}
    >
      {data.emoji} {data.label} {data.confidence}%
    </Badge>
  );
}

function ResultCard({ result }: { result: SetupResult }) {
  const [expanded, setExpanded] = useState(result.status === "READY");

  return (
    <Card className={`border-border transition-all ${
      result.status === "READY" ? "border-green-500/40 bg-green-500/5 shadow-green-500/10 shadow-md" :
      result.status === "WATCHING" ? "border-amber-500/20" : ""
    }`}>
      <CardContent className="py-3">
        {/* Header row */}
        <div
          className="flex items-center gap-3 cursor-pointer select-none"
          onClick={() => setExpanded(e => !e)}
        >
          <div className="flex items-center gap-2 min-w-0">
            {trendIcon(result.trend)}
            <span className="font-bold text-base">{result.ticker}</span>
            {statusBadge(result.status)}
            <PatternBadge ticker={result.ticker} />
            {result.londonInducementDetected && (
              <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-xs animate-pulse">
                ⚡ INDUCEMENT
              </Badge>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{fmt$(result.currentPrice)}</span>
            {result.supplyZone && (
              <span className="text-xs text-muted-foreground hidden sm:block">
                Zone: {fmt$(result.supplyZone.low)}–{fmt$(result.supplyZone.high)}
              </span>
            )}
            {result.riskReward2 && (
              <span className={`text-xs font-medium ${result.riskReward2 >= 2 ? "text-green-400" : result.riskReward2 >= 1.5 ? "text-amber-400" : "text-red-400"}`}>
                R:R {result.riskReward2}:1
              </span>
            )}
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>

        {expanded && (
          <div className="mt-4 space-y-4">
            <Separator className="opacity-30" />

            {/* Zone + Trend row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Trend</div>
                <div className="flex items-center gap-1">{trendIcon(result.trend)}{trendLabel(result.trend)}</div>
              </div>
              {result.supplyZone && (
                <>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Supply Zone</div>
                    <div className="text-sm font-medium">{fmt$(result.supplyZone.low)} – {fmt$(result.supplyZone.high)}</div>
                    <div className="mt-0.5">{strengthBadge(result.supplyZone.strength)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Zone Status</div>
                    <div className="text-sm">
                      {result.supplyZone.fresh
                        ? <span className="text-green-400 font-medium">✅ Fresh (untested)</span>
                        : <span className="text-amber-400">Tested {result.supplyZone.testedCount}×</span>
                      }
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">Formed {result.supplyZone.formedAt}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">ATR-14</div>
                    <div className="text-sm font-medium">{fmt$(result.atr14)}</div>
                    <div className="text-xs text-muted-foreground">Daily volatility</div>
                  </div>
                </>
              )}
            </div>

            {/* Asian Range */}
            {result.asianRange && (
              <div className={`p-2.5 rounded-md border text-sm ${result.asianRange.tight ? "bg-blue-500/10 border-blue-500/20" : "bg-muted/20 border-border"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Asian Range</span>
                  {result.asianRange.tight && <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-xs">Tight ✅</Badge>}
                </div>
                <div className="flex gap-4 text-xs">
                  <span>High: <span className="font-medium">{fmt$(result.asianRange.high)}</span></span>
                  <span>Low: <span className="font-medium">{fmt$(result.asianRange.low)}</span></span>
                  <span>Range: <span className="font-medium">{result.asianRange.rangePct}%</span></span>
                </div>
              </div>
            )}

            {/* Trade Math Panel */}
            {result.entryPrice && result.stopLoss && (
              <div className="rounded-md border border-border bg-muted/10 overflow-hidden">
                <div className="px-3 py-2 bg-muted/20 border-b border-border">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5" /> Trade Math
                  </span>
                </div>
                <div className="p-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="text-center p-2 rounded bg-blue-500/10 border border-blue-500/20">
                    <div className="text-xs text-muted-foreground mb-1">Entry (Zone Mid)</div>
                    <div className="font-bold text-blue-400">{fmt$(result.entryPrice)}</div>
                  </div>
                  <div className="text-center p-2 rounded bg-red-500/10 border border-red-500/20">
                    <div className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                      <Shield className="w-3 h-3" /> Stop Loss
                    </div>
                    <div className="font-bold text-red-400">{fmt$(result.stopLoss)}</div>
                    <div className="text-xs text-muted-foreground">{result.stopDistancePct}% above entry</div>
                  </div>
                  <div className="text-center p-2 rounded bg-amber-500/10 border border-amber-500/20">
                    <div className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                      <Target className="w-3 h-3" /> T1 (Asian Low)
                    </div>
                    <div className="font-bold text-amber-400">{fmt$(result.target1)}</div>
                    {result.riskReward1 && <div className="text-xs text-muted-foreground">R:R {result.riskReward1}:1</div>}
                  </div>
                  <div className="text-center p-2 rounded bg-green-500/10 border border-green-500/20">
                    <div className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                      <Target className="w-3 h-3" /> T2 (Swing Low)
                    </div>
                    <div className="font-bold text-green-400">{fmt$(result.target2)}</div>
                    {result.riskReward2 && (
                      <div className={`text-xs font-medium ${result.riskReward2 >= 2 ? "text-green-400" : result.riskReward2 >= 1.5 ? "text-amber-400" : "text-red-400"}`}>
                        R:R {result.riskReward2}:1
                      </div>
                    )}
                  </div>
                </div>

                {/* Position sizing */}
                {result.positionSize && result.positionSize.shares > 0 && (
                  <div className="px-3 pb-3">
                    <div className="p-2 rounded bg-slate-500/10 border border-slate-500/20 text-xs flex flex-wrap gap-4">
                      <span className="text-muted-foreground">Account: <span className="text-foreground font-medium">{fmt$(result.positionSize.accountSize, 0)}</span></span>
                      <span className="text-muted-foreground">Risk (1%): <span className="text-red-400 font-medium">{fmt$(result.positionSize.riskAmount)}</span></span>
                      <span className="text-muted-foreground">Position Size: <span className="text-foreground font-medium">{result.positionSize.shares} shares</span></span>
                      <span className="text-muted-foreground">Position Value: <span className="text-foreground font-medium">{fmt$(result.positionSize.shares * result.entryPrice, 0)}</span></span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Setup Notes */}
            {result.setupNotes.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" /> Setup Notes
                </div>
                <ul className="space-y-1.5">
                  {result.setupNotes.map((note, i) => (
                    <li key={i} className="text-sm leading-relaxed">{note}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Invalidation warning */}
            {result.invalidationNote && (
              <div className="flex items-start gap-2 p-2.5 rounded-md bg-red-500/10 border border-red-500/20 text-sm text-red-300">
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                {result.invalidationNote}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ICTSupplyZone() {
  const [accountSize, setAccountSize] = useState(10000);
  const [customTicker, setCustomTicker] = useState("");
  const [singleResult, setSingleResult] = useState<SetupResult | null>(null);
  const [singleLoading, setSingleLoading] = useState(false);

  const { data, isLoading, refetch, isFetching, dataUpdatedAt } = trpc.ictSupplyZone.scan.useQuery(
    { accountSize },
    { staleTime: 5 * 60 * 1000 }
  );

  const singleScan = trpc.ictSupplyZone.scanOne.useQuery(
    { ticker: customTicker.toUpperCase(), accountSize },
    { enabled: false }
  );

  const results = data?.results ?? [];
  const readyCount = results.filter(r => r.status === "READY").length;
  const watchingCount = results.filter(r => r.status === "WATCHING").length;

  const handleSingleScan = async () => {
    if (!customTicker.trim()) return;
    setSingleLoading(true);
    try {
      const res = await singleScan.refetch();
      if (res.data) setSingleResult(res.data);
    } catch {
      toast.error("Failed to scan ticker");
    } finally {
      setSingleLoading(false);
    }
  };

  const scannedAt = data?.scannedAt ? new Date(data.scannedAt).toLocaleTimeString() : null;

  return (
    <TooltipProvider>
      <div className="max-w-5xl mx-auto space-y-6 p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TrendingDown className="w-6 h-6 text-green-400" />
              ICT Supply Zone Scanner
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Pro-Trend Supply Zone setup — Asian range + London inducement + M1 BOS
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {scannedAt && <span className="text-xs text-muted-foreground">Updated {scannedAt}</span>}
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
              className="border-green-500/40 text-green-400 hover:bg-green-500/10"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Strategy Summary Card */}
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
              <div className="text-sm space-y-1">
                <p className="font-medium text-blue-300">ICT Pro-Trend Supply Zone — Full Rule Set</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  <strong>Entry sequence:</strong> Identify HTF supply zone → Refine to M15 POI → Asian range builds below zone → London open induces price into zone (stop hunt) → M1 break of structure to downside → Enter short at zone midpoint.
                  <br />
                  <strong>Stop:</strong> Above zone high + 0.5× ATR buffer.{" "}
                  <strong>T1:</strong> Asian range low (quick scalp).{" "}
                  <strong>T2:</strong> Previous swing low (full target).{" "}
                  <strong>Invalidation:</strong> Daily close above zone high → exit immediately.{" "}
                  <strong>Filter:</strong> Pro-trend only (downtrend). Skip counter-trend setups.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground whitespace-nowrap">Account Size:</label>
            <Input
              type="number"
              value={accountSize}
              onChange={e => setAccountSize(Math.max(1000, parseInt(e.target.value) || 10000))}
              className="w-32 h-8 text-sm"
              step={1000}
            />
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Single ticker (e.g. NVDA)"
              value={customTicker}
              onChange={e => setCustomTicker(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && handleSingleScan()}
              className="w-44 h-8 text-sm"
            />
            <Button size="sm" variant="outline" onClick={handleSingleScan} disabled={singleLoading || !customTicker}>
              <Search className="w-3.5 h-3.5 mr-1" />
              {singleLoading ? "Scanning..." : "Scan"}
            </Button>
          </div>
        </div>

        {/* Single ticker result */}
        {singleResult && (
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Single Ticker Scan</div>
            <ResultCard result={singleResult} />
          </div>
        )}

        {/* Summary stats */}
        {!isLoading && results.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-green-500/20 bg-green-500/5">
              <CardContent className="pt-3 pb-3 text-center">
                <div className="text-2xl font-bold text-green-400">{readyCount}</div>
                <div className="text-xs text-muted-foreground">READY setups</div>
              </CardContent>
            </Card>
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardContent className="pt-3 pb-3 text-center">
                <div className="text-2xl font-bold text-amber-400">{watchingCount}</div>
                <div className="text-xs text-muted-foreground">WATCHING</div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="pt-3 pb-3 text-center">
                <div className="text-2xl font-bold">{results.length}</div>
                <div className="text-xs text-muted-foreground">Total scanned</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Results */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            Scanning {DEFAULT_WATCHLIST_SIZE} tickers for supply zones...
          </div>
        ) : results.length === 0 ? (
          <Card className="border-border">
            <CardContent className="py-12 text-center text-muted-foreground">
              No results yet. Click Refresh to scan.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {/* READY setups first */}
            {readyCount > 0 && (
              <div>
                <div className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" /> Ready to Trade
                </div>
                {results.filter(r => r.status === "READY").map(r => (
                  <div key={r.ticker} className="mb-3"><ResultCard result={r} /></div>
                ))}
              </div>
            )}

            {/* WATCHING setups */}
            {watchingCount > 0 && (
              <div>
                <div className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Watching — Setup Developing
                </div>
                {results.filter(r => r.status === "WATCHING").map(r => (
                  <div key={r.ticker} className="mb-2"><ResultCard result={r} /></div>
                ))}
              </div>
            )}

            {/* No zone / Invalid */}
            {results.filter(r => r.status === "NO_ZONE" || r.status === "INVALID").length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">No Active Setup</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {results.filter(r => r.status === "NO_ZONE" || r.status === "INVALID").map(r => (
                    <Card key={r.ticker} className="border-border">
                      <CardContent className="py-2 px-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {trendIcon(r.trend)}
                          <span className="font-medium text-sm">{r.ticker}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">{fmt$(r.currentPrice)}</span>
                          {statusBadge(r.status)}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Playbook rules footer */}
        <Card className="border-border bg-muted/5">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-muted-foreground" />
              ICT Supply Zone Playbook Rules
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-xs text-muted-foreground">
              <div>✅ <strong>Pro-trend only</strong> — downtrend on daily (EMA20 &lt; EMA50)</div>
              <div>✅ <strong>Fresh zones preferred</strong> — untested supply zones have higher hit rate</div>
              <div>✅ <strong>Asian range</strong> must build below zone before London open</div>
              <div>✅ <strong>London inducement</strong> — wait for stop hunt INTO zone before entering</div>
              <div>✅ <strong>M1 BOS</strong> — enter only after 1-min break of structure to downside</div>
              <div>✅ <strong>Stop</strong> — above zone high + 0.5× ATR (not at zone high — too tight)</div>
              <div>✅ <strong>T1</strong> — Asian range low (take 50% off)</div>
              <div>✅ <strong>T2</strong> — previous swing low (trail stop to breakeven after T1)</div>
              <div>✅ <strong>Min R:R</strong> — 1.5:1 to T1, 2.5:1+ to T2</div>
              <div>🚫 <strong>Invalidation</strong> — daily close above zone high → exit immediately</div>
              <div>🚫 <strong>Counter-trend</strong> — never short into a supply zone in an uptrend</div>
              <div>🚫 <strong>Over-tested zones</strong> — skip zones tested 2+ times (liquidity consumed)</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

const DEFAULT_WATCHLIST_SIZE = 21; // matches server default watchlist length
