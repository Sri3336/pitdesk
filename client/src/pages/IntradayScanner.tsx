import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Activity,
  AlertTriangle,
  Clock,
  Zap,
  Bell,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { INTRADAY_TICKER_SYMBOLS } from "@shared/intradayTickers";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CriterionResult {
  name: string;
  weight: number;
  passed: boolean;
  value: string;
  points: number;
}

interface IntradayScorecard {
  ticker: string;
  direction: "Bullish" | "Bearish" | "Neutral";
  score: number;
  maxScore: number;
  grade: "A" | "B" | "C" | "D";
  criteria: CriterionResult[];
  currentPrice: number;
  vwap: number;
  atr: number;
  error?: string | null;
}

interface ScanBatch {
  scannedAt: number;
  total: number;
  gradeCounts: { A: number; B: number; C: number; D: number };
  topA: { ticker: string; score: number; direction: string }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function gradeColor(grade: string) {
  switch (grade) {
    case "A": return "bg-green-100 text-green-800 border-green-300";
    case "B": return "bg-blue-100 text-blue-800 border-blue-300";
    case "C": return "bg-yellow-100 text-yellow-800 border-yellow-300";
    default:  return "bg-red-100 text-red-800 border-red-300";
  }
}

function gradeRingColor(grade: string) {
  switch (grade) {
    case "A": return "ring-green-400";
    case "B": return "ring-blue-400";
    case "C": return "ring-yellow-400";
    default:  return "ring-red-300";
  }
}

function directionIcon(direction: string) {
  if (direction === "Bullish") return <TrendingUp className="w-4 h-4 text-green-600" />;
  if (direction === "Bearish") return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-gray-400" />;
}

function directionBadge(direction: string) {
  if (direction === "Bullish") return "bg-green-100 text-green-800";
  if (direction === "Bearish") return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-600";
}

function scoreBar(score: number, max: number) {
  const pct = Math.min((score / max) * 100, 100);
  const color = pct >= 82 ? "bg-green-500" : pct >= 64 ? "bg-blue-500" : pct >= 45 ? "bg-yellow-500" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-gray-600 w-16 text-right">
        {score.toFixed(1)}/{max.toFixed(1)}
      </span>
    </div>
  );
}

function formatScanTime(ts: number | null) {
  if (!ts) return null;
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " " + d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ─── Scorecard Detail Modal ───────────────────────────────────────────────────

function ScorecardModal({ card, onClose }: { card: IntradayScorecard | null; onClose: () => void }) {
  if (!card) return null;
  const passCount = card.criteria.filter((c) => c.passed).length;
  return (
    <Dialog open={!!card} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="text-xl font-bold">{card.ticker}</span>
            <span className={`px-2 py-0.5 rounded-full text-sm font-semibold border ${gradeColor(card.grade)}`}>
              Grade {card.grade}
            </span>
            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-sm ${directionBadge(card.direction)}`}>
              {directionIcon(card.direction)} {card.direction}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3 py-2">
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-0.5">Score</div>
            <div className="text-lg font-bold">{card.score.toFixed(1)} <span className="text-sm text-gray-400">/ {card.maxScore}</span></div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-0.5">Price</div>
            <div className="text-lg font-bold">${card.currentPrice.toFixed(2)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-0.5">VWAP</div>
            <div className="text-lg font-bold">${card.vwap.toFixed(2)}</div>
          </div>
        </div>
        <Separator />
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {card.criteria.map((c) => (
            <div key={c.name} className={`flex items-start gap-3 px-3 py-2 rounded-lg ${c.passed ? "bg-green-50" : "bg-red-50"}`}>
              <div className="mt-0.5 flex-shrink-0">
                {c.passed ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800">{c.name}</span>
                  <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                    {c.passed ? `+${c.weight}` : "0"} / {c.weight} pts
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5 truncate">{c.value}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-400 text-center pt-1">
          {passCount} of {card.criteria.length} criteria passed · ATR ${card.atr.toFixed(2)}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Results Table ────────────────────────────────────────────────────────────

function ResultsTable({
  results,
  onSelect,
  title,
  scannedAt,
}: {
  results: IntradayScorecard[];
  onSelect: (c: IntradayScorecard) => void;
  title: string;
  scannedAt?: number | null;
}) {
  const [filter, setFilter] = useState<"all" | "A" | "B" | "C" | "D">("all");
  const [search, setSearch] = useState("");

  const sorted = useMemo(() => {
    return [...results]
      .filter((r) => !r.error)
      .filter((r) => filter === "all" || r.grade === filter)
      .filter((r) => !search || r.ticker.includes(search.toUpperCase()))
      .sort((a, b) => b.score - a.score);
  }, [results, filter, search]);

  const gradeA = results.filter((r) => r.grade === "A" && !r.error).length;
  const gradeB = results.filter((r) => r.grade === "B" && !r.error).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {scannedAt && (
              <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Last scan: {formatScanTime(scannedAt)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {gradeA > 0 && (
              <Badge className="bg-green-100 text-green-800 border border-green-300 gap-1">
                <Bell className="w-3 h-3" /> {gradeA} Grade A
              </Badge>
            )}
            {gradeB > 0 && (
              <Badge className="bg-blue-100 text-blue-800 border border-blue-300">{gradeB} Grade B</Badge>
            )}
            <span className="text-xs text-gray-400">{results.filter((r) => !r.error).length} tickers</span>
          </div>
        </div>
        {/* Filters */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Input
            placeholder="Filter ticker…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-32 h-7 text-xs font-mono"
          />
          {(["all", "A", "B", "C", "D"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setFilter(g)}
              className={`px-2.5 py-0.5 rounded text-xs font-semibold border transition-colors ${
                filter === g
                  ? g === "all" ? "bg-gray-800 text-white border-gray-800"
                    : g === "A" ? "bg-green-600 text-white border-green-600"
                    : g === "B" ? "bg-blue-600 text-white border-blue-600"
                    : g === "C" ? "bg-yellow-500 text-white border-yellow-500"
                    : "bg-red-500 text-white border-red-500"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {g === "all" ? "All" : `Grade ${g}`}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {sorted.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">No results match the filter</div>
        ) : (
          <div className="rounded-b-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="w-20">Ticker</TableHead>
                  <TableHead className="w-16 text-center">Grade</TableHead>
                  <TableHead className="w-24 text-center">Direction</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead className="w-20 text-right">Price</TableHead>
                  <TableHead className="w-20 text-right">VWAP</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r) => (
                  <TableRow
                    key={r.ticker}
                    className={`cursor-pointer hover:bg-gray-50 transition-colors ${r.grade === "A" ? "bg-green-50/40" : ""}`}
                    onClick={() => onSelect(r)}
                  >
                    <TableCell className="font-mono font-bold text-gray-900">{r.ticker}</TableCell>
                    <TableCell className="text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold border ring-1 ${gradeColor(r.grade)} ${gradeRingColor(r.grade)}`}>
                        {r.grade}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className={`flex items-center justify-center gap-1 px-2 py-0.5 rounded-full text-xs w-fit mx-auto ${directionBadge(r.direction)}`}>
                        {directionIcon(r.direction)}
                        <span>{r.direction}</span>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[160px]">{scoreBar(r.score, r.maxScore ?? 11)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">${r.currentPrice?.toFixed(2) ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-gray-500">${r.vwap?.toFixed(2) ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <span className="text-xs text-green-700 hover:underline">Details →</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Scan History Panel ───────────────────────────────────────────────────────

function ScanHistoryPanel() {
  const { data, isLoading, refetch } = trpc.intraday.getScanHistory.useQuery(
    { limit: 8 },
    { staleTime: 2 * 60 * 1000 }
  );

  const batches = (data?.batches ?? []) as ScanBatch[];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <History className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No scan history yet</p>
          <p className="text-sm text-gray-400 mt-1">Run a scan to start building history</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Last {batches.length} scan batches</p>
        <Button variant="ghost" size="sm" onClick={() => void refetch()} className="gap-1.5 h-7 text-xs">
          <RefreshCw className="w-3 h-3" /> Refresh
        </Button>
      </div>
      {batches.map((batch, idx) => (
        <Card key={batch.scannedAt} className={idx === 0 ? "border-green-200 bg-green-50/30" : ""}>
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                {idx === 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-600 text-white">LATEST</span>
                )}
                <span className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  {new Date(batch.scannedAt).toLocaleString([], {
                    month: "short", day: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </span>
                <span className="text-xs text-gray-400">{batch.total} tickers</span>
              </div>
              <div className="flex items-center gap-1.5">
                {batch.gradeCounts.A > 0 && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-300">
                    {batch.gradeCounts.A}A
                  </span>
                )}
                {batch.gradeCounts.B > 0 && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300">
                    {batch.gradeCounts.B}B
                  </span>
                )}
                {batch.gradeCounts.C > 0 && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300">
                    {batch.gradeCounts.C}C
                  </span>
                )}
                {batch.gradeCounts.D > 0 && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-300">
                    {batch.gradeCounts.D}D
                  </span>
                )}
              </div>
            </div>
            {batch.topA.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide self-center">Grade A:</span>
                {batch.topA.map((t) => (
                  <span
                    key={t.ticker}
                    className="flex items-center gap-1 text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-green-600 text-white"
                  >
                    {t.ticker}
                    {t.direction === "Bullish" ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : t.direction === "Bearish" ? (
                      <TrendingDown className="w-3 h-3" />
                    ) : (
                      <Minus className="w-3 h-3" />
                    )}
                    <span className="font-normal opacity-80">{t.score.toFixed(1)}</span>
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const QUICK_TICKERS = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META", "GOOGL", "AMD"];

export default function IntradayScanner() {
  const [selectedCard, setSelectedCard] = useState<IntradayScorecard | null>(null);
  const [singleTicker, setSingleTicker] = useState("");
  const [singleEnabled, setSingleEnabled] = useState(false);
  const [liveResults, setLiveResults] = useState<IntradayScorecard[] | null>(null);
  const [liveScannedAt, setLiveScannedAt] = useState<number | null>(null);

  const utils = trpc.useUtils();

  // Last scheduled scan from DB
  const { data: lastScan, isFetching: lastScanLoading, refetch: refetchLastScan } = trpc.intraday.getLastScan.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  // On-demand full scan mutation
  const runScan = trpc.intraday.runFullScan.useMutation({
    onSuccess: (data) => {
      setLiveResults(data.results as IntradayScorecard[]);
      setLiveScannedAt(data.scannedAt);
      void utils.intraday.getLastScan.invalidate();
      void utils.intraday.getScanHistory.invalidate();
      const gradeA = data.gradeA;
      if (gradeA > 0) {
        toast.success(`Scan complete — ${gradeA} Grade A signal${gradeA > 1 ? "s" : ""} found!`, {
          description: `${data.total} tickers scanned`,
        });
      } else {
        toast.info(`Scan complete — no Grade A signals`, {
          description: `${data.total} tickers scanned · Best grades: B/C`,
        });
      }
    },
    onError: (err) => {
      toast.error("Scan failed", { description: err.message });
    },
  });

  // Single ticker score
  const { data: singleData, isFetching: singleLoading, refetch: refetchSingle } = trpc.intraday.score.useQuery(
    { ticker: singleTicker.toUpperCase() },
    { enabled: singleEnabled && singleTicker.length >= 1, staleTime: 60 * 1000 }
  );

  function handleSingleScore() {
    if (!singleTicker.trim()) return;
    setSingleEnabled(true);
    setTimeout(() => void refetchSingle(), 50);
  }

  function handleQuickTicker(t: string) {
    setSingleTicker(t);
    setSingleEnabled(true);
    setTimeout(() => void refetchSingle(), 50);
  }

  const singleCard = singleData as IntradayScorecard | undefined;

  // Decide which results to show: live scan takes priority over last DB scan
  const displayResults = liveResults ?? (lastScan?.results as IntradayScorecard[] | undefined) ?? [];
  const displayScannedAt = liveScannedAt ?? lastScan?.scannedAt ?? null;
  const hasResults = displayResults.length > 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-green-600" />
            Intraday Scanner
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            9-criteria weighted scorecard · 50 tickers · Auto-scans every 15 min during market hours
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetchLastScan()}
            disabled={lastScanLoading}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${lastScanLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => runScan.mutate()}
            disabled={runScan.isPending}
            className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
          >
            <Zap className={`w-3.5 h-3.5 ${runScan.isPending ? "animate-pulse" : ""}`} />
            {runScan.isPending ? `Scanning ${INTRADAY_TICKER_SYMBOLS.length} tickers…` : "Run Full Scan Now"}
          </Button>
        </div>
      </div>

      {/* Auto-scan info banner */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-100 text-sm text-blue-800">
        <Bell className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
        <div>
          <span className="font-semibold">Auto-scan active</span> — PitDesk scans all {INTRADAY_TICKER_SYMBOLS.length} tickers every 15 minutes
          during market hours (Mon–Fri 9:30–4:00 PM ET). You'll receive an email at{" "}
          <span className="font-mono">akulasridhar@gmail.com</span> whenever a ticker grades{" "}
          <span className="font-semibold text-green-700">A</span>.
        </div>
      </div>

      {/* Tabs: Scanner / History */}
      <Tabs defaultValue="scanner">
        <TabsList className="mb-4">
          <TabsTrigger value="scanner" className="gap-1.5">
            <Zap className="w-3.5 h-3.5" /> Scanner
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="w-3.5 h-3.5" /> History
          </TabsTrigger>
        </TabsList>

        {/* ── History Tab ── */}
        <TabsContent value="history" className="mt-0">
          <ScanHistoryPanel />
        </TabsContent>

        {/* ── Scanner Tab ── */}
        <TabsContent value="scanner" className="mt-0 space-y-6">

          {/* Single ticker scorer */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Score a Single Ticker</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-3">
                <Input
                  placeholder="e.g. NVDA"
                  value={singleTicker}
                  onChange={(e) => setSingleTicker(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleSingleScore()}
                  className="w-40 font-mono"
                  maxLength={10}
                />
                <Button onClick={handleSingleScore} disabled={singleLoading || !singleTicker.trim()} className="gap-1.5 bg-green-600 hover:bg-green-700 text-white">
                  <Search className="w-3.5 h-3.5" />
                  {singleLoading ? "Scoring…" : "Score"}
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_TICKERS.map((t) => (
                  <button
                    key={t}
                    onClick={() => handleQuickTicker(t)}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium border transition-colors ${
                      singleTicker === t
                        ? "bg-green-600 text-white border-green-600"
                        : "bg-white text-gray-700 border-gray-200 hover:border-green-400 hover:text-green-700"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {singleLoading && (
                <div className="mt-4 space-y-2">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              )}
              {singleCard && !singleLoading && (
                <div className="mt-4 border rounded-xl p-4 bg-gray-50">
                  {singleCard.error ? (
                    <div className="flex items-center gap-2 text-red-600 text-sm">
                      <AlertTriangle className="w-4 h-4" />
                      {singleCard.error}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 mb-3 flex-wrap">
                        <span className="text-xl font-bold">{singleCard.ticker}</span>
                        <span className={`px-2 py-0.5 rounded-full text-sm font-semibold border ${gradeColor(singleCard.grade)}`}>
                          Grade {singleCard.grade}
                        </span>
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-sm ${directionBadge(singleCard.direction)}`}>
                          {directionIcon(singleCard.direction)} {singleCard.direction}
                        </span>
                        <span className="text-sm text-gray-500 ml-auto">
                          ${singleCard.currentPrice.toFixed(2)} · VWAP ${singleCard.vwap.toFixed(2)}
                        </span>
                      </div>
                      {scoreBar(singleCard.score, singleCard.maxScore)}
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {singleCard.criteria.map((c) => (
                          <div
                            key={c.name}
                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs ${c.passed ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}
                          >
                            {c.passed
                              ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                              : <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                            }
                            <span className="font-medium">{c.name}</span>
                            <span className="text-gray-500 ml-auto">{c.weight}pt</span>
                          </div>
                        ))}
                      </div>
                      <button
                        className="mt-3 text-xs text-green-700 hover:underline"
                        onClick={() => setSelectedCard(singleCard)}
                      >
                        View full scorecard →
                      </button>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Scan results */}
          {runScan.isPending && (
            <Card>
              <CardContent className="py-10">
                <div className="text-center space-y-3">
                  <div className="flex justify-center">
                    <RefreshCw className="w-8 h-8 text-green-600 animate-spin" />
                  </div>
                  <p className="text-sm font-medium text-gray-700">Scanning {INTRADAY_TICKER_SYMBOLS.length} tickers…</p>
                  <p className="text-xs text-gray-400">Fetching 15-min OHLCV data, computing VWAP, EMA stack, RSI, ATR…</p>
                  <div className="flex flex-wrap gap-1 justify-center max-w-lg mx-auto">
                    {INTRADAY_TICKER_SYMBOLS.slice(0, 20).map((t) => (
                      <span key={t} className="text-xs font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{t}</span>
                    ))}
                    <span className="text-xs text-gray-400">+{INTRADAY_TICKER_SYMBOLS.length - 20} more</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {!runScan.isPending && hasResults && (
            <ResultsTable
              results={displayResults}
              onSelect={setSelectedCard}
              title={liveResults ? "Live Scan Results" : "Last Scheduled Scan Results"}
              scannedAt={displayScannedAt}
            />
          )}

          {!runScan.isPending && !hasResults && !lastScanLoading && (
            <Card>
              <CardContent className="py-12 text-center">
                <Activity className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No scan results yet</p>
                <p className="text-sm text-gray-400 mt-1 mb-4">
                  Click "Run Full Scan Now" to scan all {INTRADAY_TICKER_SYMBOLS.length} tickers immediately,
                  or wait for the auto-scan at the next 15-min mark during market hours.
                </p>
                <Button
                  onClick={() => runScan.mutate()}
                  disabled={runScan.isPending}
                  className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
                >
                  <Zap className="w-4 h-4" />
                  Run Full Scan Now
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Watchlist info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-600">50-Ticker Watchlist</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {INTRADAY_TICKER_SYMBOLS.map((t) => (
                  <span
                    key={t}
                    className="text-xs font-mono px-2 py-0.5 bg-gray-100 text-gray-600 rounded border border-gray-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200 cursor-pointer transition-colors"
                    onClick={() => { setSingleTicker(t); setSingleEnabled(true); setTimeout(() => void refetchSingle(), 50); }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

        </TabsContent>
      </Tabs>

      <ScorecardModal card={selectedCard} onClose={() => setSelectedCard(null)} />
    </div>
  );
}
