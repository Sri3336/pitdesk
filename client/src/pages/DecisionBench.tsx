/**
 * Decision Bench — Two-Stage Pre-Trade Workflow
 *
 * Tab 1: Watchlist Manager — 20-ticker cross-sector list, add/remove
 * Tab 2: Morning Scan     — Run scan, see top 3 ranked setups
 * Tab 3: Pre-Trade Gate   — 5-gate GO/WAIT/NO-GO before entering
 */

import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Crosshair,
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp,
  BarChart2,
  Shield,
  Clock,
  Loader2,
  ChevronDown,
  ChevronUp,
  Layers,
} from "lucide-react";

// ─── Types (mirrors server types) ─────────────────────────────────────────────

interface WatchlistItem {
  id: number;
  ticker: string;
  sector: string;
  isActive: number;
  sortOrder: number;
}

interface TradeSetupSpecifics {
  strategy: string;
  expiry: string | null;
  atmStrike: number | null;
  shortStrike: number | null;
  longStrike: number | null;
  estimatedCredit: number | null;
  breakeven: number | null;
  maxLoss: number | null;
  targetDelta: number | null;
  ivUsed: number | null;
  note: string;
}

interface MorningScanResult {
  ticker: string;
  sector: string;
  currentPrice: number | null;
  dayChangePct: number | null;
  ivRank: number | null;
  ivStatus: "green" | "yellow" | "red" | "gray";
  signalStrength: "STRONG" | "MODERATE" | "WATCH" | "NONE";
  signals: string[];
  recommendedStrategy: string;
  entryWindow: string;
  tradeRationale: string;
  score: number;
  tradeSetup: TradeSetupSpecifics | null;
}

interface GateResult {
  gateNumber: number;
  gateName: string;
  status: "PASS" | "WARN" | "FAIL";
  detail: string;
}

interface PreTradeGateResult {
  ticker: string;
  strategy: string;
  overallVerdict: "GO" | "WAIT" | "NO-GO";
  gates: GateResult[];
  summary: string;
}

// ─── Sector options ────────────────────────────────────────────────────────────

const SECTORS = [
  "Memory/Storage",
  "Semiconductors",
  "AdTech/Mobile",
  "Cloud/Software",
  "Financials",
  "Healthcare/Biotech",
  "Energy",
  "ETF",
  "High Volatility",
  "Consumer",
  "Industrials",
  "Other",
];

const STRATEGIES = [
  { value: "iron_condor",   label: "Iron Condor" },
  { value: "strangle",      label: "Strangle" },
  { value: "naked_put",     label: "Naked Put" },
  { value: "naked_call",    label: "Naked Call" },
  { value: "credit_spread", label: "Credit Spread" },
  { value: "other",         label: "Other" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ivStatusColor(status: string) {
  if (status === "green") return "bg-green-100 text-green-800 border-green-200";
  if (status === "yellow") return "bg-yellow-100 text-yellow-800 border-yellow-200";
  if (status === "red") return "bg-red-100 text-red-800 border-red-200";
  return "bg-gray-100 text-gray-600 border-gray-200";
}

function signalBadgeColor(strength: string) {
  if (strength === "STRONG") return "bg-green-500 text-white";
  if (strength === "MODERATE") return "bg-blue-500 text-white";
  if (strength === "WATCH") return "bg-yellow-500 text-white";
  return "bg-gray-300 text-gray-700";
}

function verdictColor(verdict: string) {
  if (verdict === "GO") return "bg-green-500 text-white";
  if (verdict === "WAIT") return "bg-yellow-500 text-white";
  return "bg-red-500 text-white";
}

function gateStatusIcon(status: string) {
  if (status === "PASS") return <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />;
  if (status === "WARN") return <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0" />;
  return <XCircle className="w-4 h-4 text-red-600 shrink-0" />;
}

function gateRowColor(status: string) {
  if (status === "PASS") return "border-green-200 bg-green-50";
  if (status === "WARN") return "border-yellow-200 bg-yellow-50";
  return "border-red-200 bg-red-50";
}

// ─── Watchlist Tab ─────────────────────────────────────────────────────────────

function WatchlistTab() {
  const utils = trpc.useUtils();
  const { data: watchlist, isLoading } = trpc.decisionBench.getWatchlist.useQuery();
  const seedMutation = trpc.decisionBench.seedDefaultWatchlist.useMutation({
    onSuccess: (data) => {
      utils.decisionBench.getWatchlist.invalidate();
      toast.success(data.message);
    },
    onError: (e) => toast.error(e.message),
  });
  const addMutation = trpc.decisionBench.addTicker.useMutation({
    onSuccess: () => {
      utils.decisionBench.getWatchlist.invalidate();
      setNewTicker("");
      setNewSector("");
      toast.success("Ticker added");
    },
    onError: (e) => toast.error(e.message),
  });
  const removeMutation = trpc.decisionBench.removeTicker.useMutation({
    onSuccess: () => {
      utils.decisionBench.getWatchlist.invalidate();
      toast.success("Ticker removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const [newTicker, setNewTicker] = useState("");
  const [newSector, setNewSector] = useState("");

  // Group by sector
  const bySector: Record<string, WatchlistItem[]> = {};
  for (const item of (watchlist ?? [])) {
    if (!bySector[item.sector]) bySector[item.sector] = [];
    bySector[item.sector].push(item);
  }

  return (
    <div className="space-y-4">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {watchlist?.length ?? 0} tickers across {Object.keys(bySector).length} sectors
          </p>
        </div>
        {(!watchlist || watchlist.length === 0) && (
          <Button
            size="sm"
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {seedMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Layers className="w-4 h-4 mr-2" />}
            Seed Default 20 Tickers
          </Button>
        )}
      </div>

      {/* Add ticker form */}
      <Card className="border border-dashed border-green-300 bg-green-50/30">
        <CardContent className="pt-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Ticker</label>
              <Input
                placeholder="e.g. AAPL"
                value={newTicker}
                onChange={e => setNewTicker(e.target.value.toUpperCase())}
                className="uppercase"
                maxLength={10}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Sector</label>
              <Select value={newSector} onValueChange={setNewSector}>
                <SelectTrigger>
                  <SelectValue placeholder="Select sector" />
                </SelectTrigger>
                <SelectContent>
                  {SECTORS.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => {
                if (!newTicker || !newSector) {
                  toast.error("Enter ticker and sector");
                  return;
                }
                addMutation.mutate({ ticker: newTicker, sector: newSector });
              }}
              disabled={addMutation.isPending}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Watchlist by sector */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin text-green-500" />
        </div>
      ) : watchlist?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Crosshair className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No tickers yet</p>
          <p className="text-sm mt-1">Click "Seed Default 20 Tickers" to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(bySector).map(([sector, items]) => (
            <Card key={sector} className="border border-border">
              <CardHeader className="py-2 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    {sector}
                  </CardTitle>
                  <Badge variant="outline" className="text-xs">{items.length}</Badge>
                </div>
              </CardHeader>
              <CardContent className="py-2 px-4">
                <div className="flex flex-wrap gap-2">
                  {items.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center gap-1 bg-white border border-border rounded-md px-2 py-1 text-sm font-medium"
                    >
                      <span>{item.ticker}</span>
                      <button
                        onClick={() => removeMutation.mutate({ id: item.id })}
                        className="text-muted-foreground hover:text-red-500 transition-colors ml-1"
                        title="Remove"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Morning Scan Tab ──────────────────────────────────────────────────────────

function MorningScanTab() {
  const [scanResult, setScanResult] = useState<{
    setups: MorningScanResult[];
    allResults: MorningScanResult[];
    scannedAt: string;
    message: string;
  } | null>(null);
  const [showAll, setShowAll] = useState(false);

  const scanMutation = trpc.decisionBench.runMorningScan.useMutation({
    onSuccess: (data) => {
      setScanResult(data as any);
      toast.success(data.message);
    },
    onError: (e) => toast.error(`Scan failed: ${e.message}`),
  });

  const displayResults = showAll
    ? (scanResult?.allResults ?? [])
    : (scanResult?.setups ?? []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Scans your 20-ticker watchlist and surfaces the top 3 setups ranked by IV Rank + signal strength.
          </p>
        </div>
        <Button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          {scanMutation.isPending
            ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Scanning...</>
            : <><RefreshCw className="w-4 h-4 mr-2" />Run Morning Scan</>
          }
        </Button>
      </div>

      {/* Scan results */}
      {!scanResult && !scanMutation.isPending && (
        <div className="text-center py-16 text-muted-foreground">
          <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Ready to scan</p>
          <p className="text-sm mt-1">Click "Run Morning Scan" to identify today's top setups</p>
        </div>
      )}

      {scanMutation.isPending && (
        <div className="text-center py-16 text-muted-foreground">
          <Loader2 className="w-10 h-10 mx-auto mb-3 animate-spin text-green-500" />
          <p className="font-medium">Scanning {20} tickers...</p>
          <p className="text-sm mt-1">Fetching IV, price, and EMA trend data</p>
        </div>
      )}

      {scanResult && (
        <>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Scanned at {new Date(scanResult.scannedAt).toLocaleTimeString()}</span>
            <button
              className="text-blue-600 hover:underline"
              onClick={() => setShowAll(v => !v)}
            >
              {showAll ? "Show top 3 only" : `Show all ${scanResult.allResults?.length ?? 0} results`}
            </button>
          </div>

          {displayResults.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No tickers returned data. Check your watchlist or try again during market hours.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayResults.map((setup, idx) => (
                <ScanResultCard key={setup.ticker} setup={setup} rank={showAll ? idx + 1 : idx + 1} isTop={!showAll && idx < 3} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ScanResultCard({ setup, rank, isTop }: { setup: MorningScanResult; rank: number; isTop: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={`border ${isTop ? "border-green-300 shadow-sm" : "border-border"}`}>
      <CardContent className="pt-3 pb-3">
        <div className="flex items-center gap-3">
          {/* Rank badge */}
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
            rank === 1 ? "bg-yellow-400 text-yellow-900" :
            rank === 2 ? "bg-gray-300 text-gray-700" :
            rank === 3 ? "bg-orange-300 text-orange-900" :
            "bg-gray-100 text-gray-500"
          }`}>
            {rank}
          </div>

          {/* Ticker + sector */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-base">{setup.ticker}</span>
              <span className="text-xs text-muted-foreground">{setup.sector}</span>
              <Badge className={`text-xs ${signalBadgeColor(setup.signalStrength)}`}>
                {setup.signalStrength}
              </Badge>
              <Badge variant="outline" className={`text-xs ${ivStatusColor(setup.ivStatus)}`}>
                IVR {setup.ivRank !== null ? `${setup.ivRank}%` : "N/A"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{setup.tradeRationale}</p>
          </div>

          {/* Price */}
          <div className="text-right shrink-0">
            {setup.currentPrice !== null && (
              <div className="font-semibold text-sm">${setup.currentPrice.toFixed(2)}</div>
            )}
            {setup.dayChangePct !== null && (
              <div className={`text-xs ${setup.dayChangePct >= 0 ? "text-green-600" : "text-red-600"}`}>
                {setup.dayChangePct >= 0 ? "+" : ""}{setup.dayChangePct.toFixed(2)}%
              </div>
            )}
          </div>

          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-border space-y-3">
            {/* Strategy + Entry Window */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Recommended Strategy</span>
                <p className="font-semibold mt-0.5">{setup.recommendedStrategy}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Entry Window</span>
                <p className="font-medium mt-0.5">{setup.entryWindow}</p>
              </div>
            </div>

            {/* Trade Setup Specifics */}
            {setup.tradeSetup && (
              <div className="rounded-lg bg-green-50 border border-green-200 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-green-700" />
                  <span className="text-xs font-semibold text-green-800">Trade Setup — {setup.tradeSetup.strategy}</span>
                  {setup.tradeSetup.expiry && (
                    <Badge variant="outline" className="text-xs border-green-300 text-green-700 ml-auto">
                      {setup.tradeSetup.expiry}
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Short Strike</span>
                    <p className="font-bold text-sm mt-0.5">
                      {setup.tradeSetup.shortStrike ? `$${setup.tradeSetup.shortStrike}` : "—"}
                    </p>
                  </div>
                  {setup.tradeSetup.longStrike && (
                    <div>
                      <span className="text-muted-foreground">Long Strike</span>
                      <p className="font-bold text-sm mt-0.5">${setup.tradeSetup.longStrike}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Est. Credit</span>
                    <p className="font-bold text-sm mt-0.5 text-green-700">
                      {setup.tradeSetup.estimatedCredit ? `$${setup.tradeSetup.estimatedCredit}` : "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Breakeven</span>
                    <p className="font-bold text-sm mt-0.5">
                      {setup.tradeSetup.breakeven ? `$${setup.tradeSetup.breakeven}` : "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Max Loss</span>
                    <p className="font-bold text-sm mt-0.5 text-red-600">
                      {setup.tradeSetup.maxLoss ? `$${setup.tradeSetup.maxLoss.toLocaleString()}` : "—"}
                    </p>
                  </div>
                  {setup.tradeSetup.targetDelta && (
                    <div>
                      <span className="text-muted-foreground">Delta</span>
                      <p className="font-bold text-sm mt-0.5">{setup.tradeSetup.targetDelta}</p>
                    </div>
                  )}
                </div>
                <p className="text-xs text-green-800 italic border-t border-green-200 pt-2 mt-1">
                  {setup.tradeSetup.note}
                </p>
              </div>
            )}

            {/* Signals */}
            {setup.signals.length > 0 && (
              <div>
                <span className="text-xs text-muted-foreground">Signals</span>
                <ul className="mt-1 space-y-1">
                  {setup.signals.map((s, i) => (
                    <li key={i} className="text-xs flex items-start gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-green-500 mt-0.5 shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <TrendingUp className="w-3 h-3" />
              Score: {setup.score}/100
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Pre-Trade Gate Tab ────────────────────────────────────────────────────────

function PreTradeGateTab() {
  const [ticker, setTicker] = useState("");
  const [strategy, setStrategy] = useState<string>("");
  const [entryTime, setEntryTime] = useState("");
  const [gateResult, setGateResult] = useState<PreTradeGateResult | null>(null);

  const gateMutation = trpc.decisionBench.runPreTradeGate.useMutation({
    onSuccess: (data) => {
      setGateResult(data as any);
    },
    onError: (e) => toast.error(`Gate check failed: ${e.message}`),
  });

  const handleRun = useCallback(() => {
    if (!ticker.trim()) {
      toast.error("Enter a ticker symbol");
      return;
    }
    if (!strategy) {
      toast.error("Select a strategy");
      return;
    }
    gateMutation.mutate({
      ticker: ticker.toUpperCase(),
      strategy: strategy as any,
      entryTime: entryTime || undefined,
    });
  }, [ticker, strategy, entryTime, gateMutation]);

  return (
    <div className="space-y-4">
      {/* Input form */}
      <Card className="border border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4 text-green-600" />
            Pre-Trade Gate Check
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Ticker</label>
              <Input
                placeholder="e.g. NVDA"
                value={ticker}
                onChange={e => setTicker(e.target.value.toUpperCase())}
                className="uppercase"
                maxLength={10}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Strategy</label>
              <Select value={strategy} onValueChange={setStrategy}>
                <SelectTrigger>
                  <SelectValue placeholder="Select strategy" />
                </SelectTrigger>
                <SelectContent>
                  {STRATEGIES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Entry Time (ET, optional)</label>
              <Input
                type="time"
                value={entryTime}
                onChange={e => setEntryTime(e.target.value)}
                placeholder="HH:MM"
              />
            </div>
          </div>
          <Button
            onClick={handleRun}
            disabled={gateMutation.isPending}
            className="w-full bg-green-600 hover:bg-green-700 text-white"
          >
            {gateMutation.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Running Gate Check...</>
              : <><Crosshair className="w-4 h-4 mr-2" />Run 5-Gate Check</>
            }
          </Button>
        </CardContent>
      </Card>

      {/* Gate results */}
      {!gateResult && !gateMutation.isPending && (
        <div className="text-center py-12 text-muted-foreground">
          <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Enter a ticker and strategy above</p>
          <p className="text-sm mt-1">The system will check 5 gates: Market Context, Technical Setup, IV/Catalyst, Strategy Math, Playbook Rules</p>
        </div>
      )}

      {gateMutation.isPending && (
        <div className="text-center py-12 text-muted-foreground">
          <Loader2 className="w-10 h-10 mx-auto mb-3 animate-spin text-green-500" />
          <p className="font-medium">Checking all 5 gates...</p>
        </div>
      )}

      {gateResult && (
        <div className="space-y-3">
          {/* Verdict banner */}
          <Card className={`border-2 ${
            gateResult.overallVerdict === "GO" ? "border-green-400 bg-green-50" :
            gateResult.overallVerdict === "WAIT" ? "border-yellow-400 bg-yellow-50" :
            "border-red-400 bg-red-50"
          }`}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold">{gateResult.ticker}</span>
                    <span className="text-sm text-muted-foreground">
                      {STRATEGIES.find(s => s.value === gateResult.strategy)?.label ?? gateResult.strategy}
                    </span>
                  </div>
                  <p className="text-sm mt-1">{gateResult.summary}</p>
                </div>
                <div className={`px-4 py-2 rounded-lg text-xl font-black ${verdictColor(gateResult.overallVerdict)}`}>
                  {gateResult.overallVerdict}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Gate-by-gate results */}
          <div className="space-y-2">
            {gateResult.gates.map(gate => (
              <div
                key={gate.gateNumber}
                className={`flex items-start gap-3 p-3 rounded-lg border ${gateRowColor(gate.status)}`}
              >
                {gateStatusIcon(gate.status)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">Gate {gate.gateNumber}</span>
                    <span className="text-sm font-medium">{gate.gateName}</span>
                    <Badge
                      variant="outline"
                      className={`text-xs ml-auto ${
                        gate.status === "PASS" ? "border-green-400 text-green-700" :
                        gate.status === "WARN" ? "border-yellow-400 text-yellow-700" :
                        "border-red-400 text-red-700"
                      }`}
                    >
                      {gate.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{gate.detail}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Entry window reminder */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>Playbook rule: Enter naked puts/calls only between <strong>10:00–11:00 AM ET</strong>. Iron condors and strangles: same window.</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function DecisionBench() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
          <Crosshair className="w-5 h-5 text-green-700" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Decision Bench</h1>
          <p className="text-sm text-muted-foreground">
            Two-stage pre-trade workflow: Morning Scan → Pre-Trade Gate → Execute with confidence
          </p>
        </div>
      </div>

      {/* Philosophy card */}
      <Card className="border border-green-200 bg-green-50/40">
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-3 gap-4 text-center text-sm">
            <div>
              <div className="font-semibold text-green-700 mb-1">Stage 1 — Morning Scan</div>
              <p className="text-xs text-muted-foreground">System scans 20 tickers, ranks by IV Rank + signal strength, surfaces top 3 setups</p>
            </div>
            <div className="border-x border-green-200">
              <div className="font-semibold text-green-700 mb-1">Stage 2 — Pre-Trade Gate</div>
              <p className="text-xs text-muted-foreground">5 gates: Market Context, Technical, IV/Catalyst, Strategy Math, Playbook Rules → GO / WAIT / NO-GO</p>
            </div>
            <div>
              <div className="font-semibold text-green-700 mb-1">Execute</div>
              <p className="text-xs text-muted-foreground">Only enter if all 5 gates pass. Record rationale in Voice Journal. No FOMO, no exceptions.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="watchlist">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="watchlist">
            <Layers className="w-4 h-4 mr-2" />
            Watchlist
          </TabsTrigger>
          <TabsTrigger value="morning-scan">
            <BarChart2 className="w-4 h-4 mr-2" />
            Morning Scan
          </TabsTrigger>
          <TabsTrigger value="pre-trade-gate">
            <Shield className="w-4 h-4 mr-2" />
            Pre-Trade Gate
          </TabsTrigger>
        </TabsList>

        <TabsContent value="watchlist" className="mt-4">
          <WatchlistTab />
        </TabsContent>

        <TabsContent value="morning-scan" className="mt-4">
          <MorningScanTab />
        </TabsContent>

        <TabsContent value="pre-trade-gate" className="mt-4">
          <PreTradeGateTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
