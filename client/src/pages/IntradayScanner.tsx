import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
} from "lucide-react";

// ─── Types (mirrored from server) ────────────────────────────────────────────

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
  error?: string;
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

// ─── Scorecard Detail Modal ───────────────────────────────────────────────────

function ScorecardModal({
  card,
  onClose,
}: {
  card: IntradayScorecard | null;
  onClose: () => void;
}) {
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

        {/* Summary row */}
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

        {/* Criteria table */}
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {card.criteria.map((c) => (
            <div
              key={c.name}
              className={`flex items-start gap-3 px-3 py-2 rounded-lg ${c.passed ? "bg-green-50" : "bg-red-50"}`}
            >
              <div className="mt-0.5 flex-shrink-0">
                {c.passed
                  ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                  : <XCircle className="w-4 h-4 text-red-500" />
                }
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

// ─── Main Page ────────────────────────────────────────────────────────────────

const QUICK_TICKERS = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META", "GOOGL", "AMD"];

export default function IntradayScanner() {
  const [customTickers, setCustomTickers] = useState("");
  const [scanInput, setScanInput] = useState<string[] | undefined>(undefined);
  const [selectedCard, setSelectedCard] = useState<IntradayScorecard | null>(null);
  const [singleTicker, setSingleTicker] = useState("");
  const [singleEnabled, setSingleEnabled] = useState(false);

  // Bulk scan
  const { data: scanData, isFetching: scanLoading, refetch: refetchScan } = trpc.intraday.scan.useQuery(
    scanInput ? { tickers: scanInput } : undefined,
    { enabled: true, staleTime: 2 * 60 * 1000 }
  );

  // Single ticker score
  const { data: singleData, isFetching: singleLoading, refetch: refetchSingle } = trpc.intraday.score.useQuery(
    { ticker: singleTicker.toUpperCase() },
    { enabled: singleEnabled && singleTicker.length >= 1, staleTime: 60 * 1000 }
  );

  const results = useMemo(() => scanData ?? [], [scanData]);

  function handleScan() {
    if (customTickers.trim()) {
      const tickers = customTickers.split(/[\s,]+/).map((t) => t.toUpperCase()).filter(Boolean);
      setScanInput(tickers);
    } else {
      setScanInput(undefined);
    }
    refetchScan();
  }

  function handleSingleScore() {
    if (!singleTicker.trim()) return;
    setSingleEnabled(true);
    setTimeout(() => refetchSingle(), 50);
  }

  function handleQuickTicker(t: string) {
    setSingleTicker(t);
    setSingleEnabled(true);
    setTimeout(() => refetchSingle(), 50);
  }

  const singleCard = singleData as IntradayScorecard | undefined;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-green-600" />
            Intraday Scanner
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            9-criteria weighted scorecard · Max 11.0 pts · Grade A ≥ 9.0
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetchScan()}
          disabled={scanLoading}
          className="gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${scanLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

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

          {/* Single result */}
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
                  <div className="flex items-center gap-3 mb-3">
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

      {/* Bulk scanner */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Bulk Scan</span>
            <span className="text-xs font-normal text-gray-400">
              {results.length > 0 ? `${results.length} results` : "Scanning 60 PCR tickers by default"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Input
              placeholder="Optional: AAPL, TSLA, NVDA (leave blank for all 60 PCR tickers)"
              value={customTickers}
              onChange={(e) => setCustomTickers(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleScan()}
              className="font-mono text-sm"
            />
            <Button onClick={handleScan} disabled={scanLoading} className="gap-1.5 bg-green-600 hover:bg-green-700 text-white whitespace-nowrap">
              <Search className="w-3.5 h-3.5" />
              {scanLoading ? "Scanning…" : "Run Scan"}
            </Button>
          </div>

          {scanLoading && (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          )}

          {!scanLoading && results.length > 0 && (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="w-20">Ticker</TableHead>
                    <TableHead className="w-20">Grade</TableHead>
                    <TableHead className="w-28">Direction</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead className="w-24 text-right">Price</TableHead>
                    <TableHead className="w-24 text-right">VWAP</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r: IntradayScorecard) => (
                    <TableRow
                      key={r.ticker}
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => setSelectedCard(r)}
                    >
                      <TableCell className="font-mono font-semibold text-gray-900">
                        {r.ticker}
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${gradeColor(r.grade)}`}>
                          {r.grade}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full w-fit ${directionBadge(r.direction)}`}>
                          {directionIcon(r.direction)} {r.direction}
                        </span>
                      </TableCell>
                      <TableCell className="min-w-[160px]">
                        {scoreBar(r.score, r.maxScore)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        ${r.currentPrice.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-gray-500">
                        ${r.vwap.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs cursor-pointer hover:bg-green-50">
                          Details
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {!scanLoading && results.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Click "Run Scan" to score tickers with the 9-criteria scorecard</p>
              <p className="text-xs mt-1 text-gray-300">Results sorted by score descending · Grades A/B are actionable setups</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Criteria legend */}
      <Card className="bg-gray-50 border-dashed">
        <CardContent className="pt-4">
          <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Scoring Criteria (11.0 pts max)</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs text-gray-500">
            <span>Daily Trend — 1.5 pts</span>
            <span>EMA Stack 15m — 1.5 pts</span>
            <span>VWAP Position — 1.0 pts</span>
            <span>Relative Volume — 1.5 pts</span>
            <span>RSI Momentum — 1.0 pts</span>
            <span>Price Structure — 1.0 pts</span>
            <span>Entry Quality — 1.0 pts</span>
            <span>Candle Confirm — 1.5 pts</span>
            <span>ATR Expansion — 1.0 pts</span>
          </div>
          <div className="flex gap-4 mt-3 text-xs">
            <span className="text-green-700 font-medium">A ≥ 9.0 — Strong setup</span>
            <span className="text-blue-700 font-medium">B 7.0–8.5 — Watch</span>
            <span className="text-yellow-700 font-medium">C 5.0–6.5 — Weak</span>
            <span className="text-red-700 font-medium">D &lt;5.0 — Skip</span>
          </div>
        </CardContent>
      </Card>

      {/* Detail modal */}
      <ScorecardModal card={selectedCard} onClose={() => setSelectedCard(null)} />
    </div>
  );
}
