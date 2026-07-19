import React, { useState, useMemo, useRef, useEffect } from "react";
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
  BarChart2,
  SlidersHorizontal,
  RotateCcw,
  Save,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
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
  direction: "Bullish" | "Bearish" | "Neutral" | "bullish" | "bearish" | "neutral";
  score: number;
  maxScore: number;
  grade: "A" | "B" | "C" | "D";
  criteria: CriterionResult[] | Record<string, CriterionResult>;
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

function normalizeDirection(direction: string): "Bullish" | "Bearish" | "Neutral" {
  const d = direction.toLowerCase();
  if (d === "bullish") return "Bullish";
  if (d === "bearish") return "Bearish";
  return "Neutral";
}

function normalizeCriteria(criteria: CriterionResult[] | Record<string, CriterionResult> | null | undefined): CriterionResult[] {
  if (!criteria) return [];
  if (Array.isArray(criteria)) {
    // Ensure each item has safe scalar values
    return criteria.map((c: any) => ({
      name: String(c.name ?? c.description ?? ''),
      passed: Boolean(c.passed ?? c.pass ?? false),
      weight: Number(c.weight ?? 1),
      points: Number(c.points ?? 0),
      value: typeof c.value === 'object' ? JSON.stringify(c.value) : String(c.value ?? ''),
      description: String(c.description ?? ''),
    }));
  }
  // Legacy: convert Record<string, CriterionResult> to array
  return Object.entries(criteria).map(([key, c]: [string, any]) => ({
    name: String(c.name ?? c.description ?? key),
    passed: Boolean(c.passed ?? c.pass ?? false),
    weight: Number(c.weight ?? 1),
    points: Number(c.points ?? 0),
    value: typeof c.value === 'object' ? JSON.stringify(c.value) : String(c.value ?? ''),
    description: String(c.description ?? ''),
  }));
}

function directionIcon(direction: string) {
  const d = normalizeDirection(direction);
  if (d === "Bullish") return <TrendingUp className="w-4 h-4 text-green-600" />;
  if (d === "Bearish") return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-gray-400" />;
}

function directionBadge(direction: string) {
  const d = normalizeDirection(direction);
  if (d === "Bullish") return "bg-green-100 text-green-800";
  if (d === "Bearish") return "bg-red-100 text-red-800";
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
  const criteriaArr = normalizeCriteria(card.criteria);
  const passCount = criteriaArr.filter((c) => c.passed).length;
  const dir = normalizeDirection(card.direction);
  return (
    <Dialog open={!!card} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="text-xl font-bold">{card.ticker}</span>
            <span className={`px-2 py-0.5 rounded-full text-sm font-semibold border ${gradeColor(card.grade)}`}>
              Grade {card.grade}
            </span>
            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-sm ${directionBadge(dir)}`}>
              {directionIcon(dir)} {dir}
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
          {criteriaArr.map((c) => (
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
          {passCount} of {criteriaArr.length} criteria passed · ATR ${card.atr.toFixed(2)}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Record Outcome Dialog ──────────────────────────────────────────────────

function RecordOutcomeDialog({
  card,
  onClose,
}: {
  card: IntradayScorecard | null;
  onClose: () => void;
}) {
  const [exitPrice, setExitPrice] = useState("");
  const utils = trpc.useUtils();
  const recordMutation = trpc.intraday.recordOutcome.useMutation({
    onSuccess: (result) => {
      const emoji = result.outcome === "win" ? "✅" : result.outcome === "loss" ? "❌" : "➡️";
      toast.success(`${emoji} ${card?.ticker} — ${result.outcome.toUpperCase()} (${result.pnlPct.toFixed(2)}% P&L)`);
      utils.intraday.getBacktestStats.invalidate();
      setExitPrice("");
      onClose();
    },
    onError: (e) => toast.error(`Failed to record outcome: ${e.message}`),
  });
  if (!card) return null;
  const entryPrice = card.currentPrice ?? 0;
  const exit = parseFloat(exitPrice);
  const pnlPct = exitPrice && !isNaN(exit) && entryPrice > 0
    ? ((exit - entryPrice) / entryPrice) * (card.direction === "Bearish" ? -1 : 1) * 100
    : null;
  return (
    <Dialog open={!!card} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Record Outcome — {card.ticker}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Entry price (at scan)</span>
            <span className="font-mono font-bold">${entryPrice.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Direction</span>
            <span className={`font-semibold ${
              card.direction === "Bullish" ? "text-green-600" : card.direction === "Bearish" ? "text-red-500" : "text-gray-500"
            }`}>{card.direction}</span>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exit-price">Exit price</Label>
            <input
              id="exit-price"
              type="number"
              step="0.01"
              placeholder="e.g. 185.50"
              value={exitPrice}
              onChange={(e) => setExitPrice(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          {pnlPct !== null && (
            <div className={`text-center text-lg font-bold ${
              pnlPct > 0.5 ? "text-green-600" : pnlPct < -0.5 ? "text-red-500" : "text-gray-500"
            }`}>
              {pnlPct > 0 ? "+" : ""}{pnlPct.toFixed(2)}% → {pnlPct > 0.5 ? "WIN" : pnlPct < -0.5 ? "LOSS" : "NEUTRAL"}
            </div>
          )}
          <Button
            className="w-full bg-green-600 hover:bg-green-700 text-white"
            disabled={!exitPrice || isNaN(exit) || exit <= 0 || recordMutation.isPending}
            onClick={() => {
              if (!entryPrice) return;
              recordMutation.mutate({
                scanResultId: 0,
                ticker: card.ticker,
                grade: (card.grade === "A" || card.grade === "B" || card.grade === "C" ? card.grade : "none") as "A" | "B" | "C" | "none",
                direction: card.direction.toLowerCase() as "bullish" | "bearish" | "neutral",
                entryPrice,
                exitPrice: exit,
              });
            }}
          >
            {recordMutation.isPending ? "Saving…" : "Record Outcome"}
          </Button>
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
  const [outcomeCard, setOutcomeCard] = useState<IntradayScorecard | null>(null);

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
    <>
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
                      <div className={`flex items-center justify-center gap-1 px-2 py-0.5 rounded-full text-xs w-fit mx-auto ${directionBadge(normalizeDirection(r.direction))}`}>
                        {directionIcon(r.direction)}
                        <span>{normalizeDirection(r.direction)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[160px]">{scoreBar(r.score, r.maxScore ?? 11)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">${r.currentPrice?.toFixed(2) ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-gray-500">${r.vwap?.toFixed(2) ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs text-green-700 hover:underline" onClick={() => onSelect(r)}>Details →</span>
                        <button
                          className="px-2 py-0.5 text-xs border border-gray-300 rounded hover:border-green-500 hover:text-green-700 transition-colors"
                          onClick={() => setOutcomeCard(r)}
                        >
                          Record
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
    <RecordOutcomeDialog card={outcomeCard} onClose={() => setOutcomeCard(null)} />
    </>
  );
}

// ─── Backtest Stats Panel ───────────────────────────────────────────────────────

function BacktestStatsPanel() {
  const { data, isLoading } = trpc.intraday.getBacktestStats.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const byGrade = (data?.byGrade ?? []) as any[];
  const byDirection = (data?.byDirection ?? []) as any[];

  if (byGrade.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BarChart2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No backtest data yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Record trade outcomes after scans to build backtest statistics.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* By Grade */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-green-600" />
            Win Rate by Grade
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead>Grade</TableHead>
                <TableHead className="text-right">Trades</TableHead>
                <TableHead className="text-right">Wins</TableHead>
                <TableHead className="text-right">Losses</TableHead>
                <TableHead className="text-right">Win Rate</TableHead>
                <TableHead className="text-right">Avg P&L %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byGrade.map((row: any) => {
                const total = Number(row.total) || 0;
                const wins = Number(row.wins) || 0;
                const losses = Number(row.losses) || 0;
                const winRate = total > 0 ? (wins / total) * 100 : 0;
                const avgPnl = Number(row.avgPnlPct) || 0;
                return (
                  <TableRow key={row.grade}>
                    <TableCell>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded border ${
                        row.grade === 'A' ? 'bg-green-100 text-green-800 border-green-300' :
                        row.grade === 'B' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                        row.grade === 'C' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                        'bg-red-100 text-red-800 border-red-300'
                      }`}>{row.grade}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono">{total}</TableCell>
                    <TableCell className="text-right font-mono text-green-700">{wins}</TableCell>
                    <TableCell className="text-right font-mono text-red-600">{losses}</TableCell>
                    <TableCell className="text-right font-mono">
                      <span className={winRate >= 60 ? 'text-green-700 font-semibold' : winRate >= 40 ? 'text-yellow-700' : 'text-red-600'}>
                        {winRate.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      <span className={avgPnl >= 0 ? 'text-green-700' : 'text-red-600'}>
                        {avgPnl >= 0 ? '+' : ''}{avgPnl.toFixed(2)}%
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* By Direction */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-600" />
            Win Rate by Direction
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead>Direction</TableHead>
                <TableHead className="text-right">Trades</TableHead>
                <TableHead className="text-right">Wins</TableHead>
                <TableHead className="text-right">Win Rate</TableHead>
                <TableHead className="text-right">Avg P&L %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byDirection.map((row: any) => {
                const total = Number(row.total) || 0;
                const wins = Number(row.wins) || 0;
                const winRate = total > 0 ? (wins / total) * 100 : 0;
                const avgPnl = Number(row.avgPnlPct) || 0;
                return (
                  <TableRow key={row.direction}>
                    <TableCell className="capitalize">
                      {row.direction === 'bullish' ? <span className="flex items-center gap-1 text-green-700"><TrendingUp className="w-3.5 h-3.5" /> Bullish</span> :
                       row.direction === 'bearish' ? <span className="flex items-center gap-1 text-red-600"><TrendingDown className="w-3.5 h-3.5" /> Bearish</span> :
                       <span className="flex items-center gap-1 text-gray-500"><Minus className="w-3.5 h-3.5" /> Neutral</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono">{total}</TableCell>
                    <TableCell className="text-right font-mono text-green-700">{wins}</TableCell>
                    <TableCell className="text-right font-mono">
                      <span className={winRate >= 60 ? 'text-green-700 font-semibold' : winRate >= 40 ? 'text-yellow-700' : 'text-red-600'}>
                        {winRate.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      <span className={avgPnl >= 0 ? 'text-green-700' : 'text-red-600'}>
                        {avgPnl >= 0 ? '+' : ''}{avgPnl.toFixed(2)}%
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Weight Sliders Panel ─────────────────────────────────────────────────────

const CRITERIA_META: { name: string; description: string }[] = [
  { name: "Daily Trend", description: "Price above/below 20-day SMA" },
  { name: "EMA Stack 15m", description: "9 EMA > 20 EMA > 50 EMA on 15-min chart" },
  { name: "VWAP", description: "Price above VWAP" },
  { name: "RVOL", description: "Relative volume > 1.5x average" },
  { name: "RSI", description: "RSI 14 between 40–70 (bullish) or 30–60 (bearish)" },
  { name: "Price Structure", description: "Higher highs/lows (bullish) or lower highs/lows (bearish)" },
  { name: "Entry Quality", description: "Within 0.5% of key level (Fib, VWAP, EMA)" },
  { name: "Candle Confirm", description: "Bullish/bearish engulfing or pin bar on 5-min" },
  { name: "ATR Expansion", description: "Current ATR > 1.2x 10-day average ATR" },
];

function WeightSlidersPanel() {
  const utils = trpc.useUtils();
  const { data: weights, isLoading } = trpc.intraday.getWeights.useQuery(undefined, {
    staleTime: 60 * 1000,
  });
  const [localWeights, setLocalWeights] = useState<Record<string, number>>({});
  const [dirty, setDirty] = useState(false);

  // Sync from server on load
  const prevWeightsRef = useRef<Record<string, number> | null>(null);
  useEffect(() => {
    if (weights && prevWeightsRef.current !== weights) {
      prevWeightsRef.current = weights;
      setLocalWeights({ ...(weights as Record<string, number>) });
      setDirty(false);
    }
  }, [weights]);

  const updateWeights = trpc.intraday.updateWeights.useMutation({
    onSuccess: () => {
      toast.success("Weights saved");
      setDirty(false);
      void utils.intraday.getWeights.invalidate();
    },
    onError: (err) => toast.error("Save failed", { description: err.message }),
  });

  function handleSlider(name: string, val: number[]) {
    setLocalWeights((prev) => ({ ...prev, [name]: val[0] }));
    setDirty(true);
  }

  function handleReset() {
    if (weights) {
      setLocalWeights({ ...(weights as Record<string, number>) });
      setDirty(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-green-600" />
            Criteria Weights
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={!dirty}
              className="gap-1.5 h-7 text-xs"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </Button>
            <Button
              size="sm"
              onClick={() => updateWeights.mutate(localWeights)}
              disabled={!dirty || updateWeights.isPending}
              className="gap-1.5 h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
            >
              <Save className="w-3 h-3" /> Save Weights
            </Button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Adjust how much each criterion contributes to the final score. Range: 0.1 (minimal) to 5.0 (critical).
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {CRITERIA_META.map(({ name, description }) => {
          const val = localWeights[name] ?? 1.0;
          return (
            <div key={name}>
              <div className="flex items-center justify-between mb-1.5">
                <div>
                  <span className="text-sm font-semibold text-gray-800">{name}</span>
                  <span className="text-xs text-gray-400 ml-2">{description}</span>
                </div>
                <span className="text-sm font-mono font-bold text-green-700 w-10 text-right">
                  {val.toFixed(1)}x
                </span>
              </div>
              <Slider
                min={0.1}
                max={5}
                step={0.1}
                value={[val]}
                onValueChange={(v) => handleSlider(name, v)}
                className="w-full"
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ─── Scan History Panel ───────────────────────────────────────────────────────

function ScanHistoryPanel() {
  // getHistory requires a ticker — use a batch-level history approach via getLatestScans
  // For the history tab, we use getLatestScans and group by scannedAt
  const { data: historyRaw, isLoading, refetch } = trpc.intraday.getLatestScans.useQuery(undefined, {
    staleTime: 2 * 60 * 1000,
  });

  // Build synthetic batches from the raw data (group by scannedAt rounded to minute)
  const batches: ScanBatch[] = (() => {
    if (!historyRaw || historyRaw.length === 0) return [];
    const batchMap = new Map<string, { scannedAt: number; rows: any[] }>();
    for (const r of historyRaw as any[]) {
      const ts = new Date(r.scannedAt);
      const key = `${ts.getFullYear()}-${ts.getMonth()}-${ts.getDate()}-${ts.getHours()}-${Math.floor(ts.getMinutes() / 15)}`;
      if (!batchMap.has(key)) batchMap.set(key, { scannedAt: ts.getTime(), rows: [] });
      batchMap.get(key)!.rows.push(r);
    }
    return Array.from(batchMap.values()).slice(0, 8).map(({ scannedAt, rows }) => {
      const gradeCounts = { A: 0, B: 0, C: 0, D: 0 };
      for (const r of rows) {
        const g = r.grade as keyof typeof gradeCounts;
        if (g in gradeCounts) gradeCounts[g]++;
      }
      const topA = rows
        .filter((r: any) => r.grade === "A")
        .map((r: any) => ({ ticker: r.ticker, score: parseFloat(r.weightedScore ?? "0"), direction: r.direction }));
      return { scannedAt, total: rows.length, gradeCounts, topA };
    });
  })();

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
  const { data: lastScanRaw, isFetching: lastScanLoading, refetch: refetchLastScan } = trpc.intraday.getLatestScans.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  // Normalize getLatestScans output to match the shape IntradayScorecard expects
  const lastScan = lastScanRaw ? {
    results: lastScanRaw.map((r: any) => ({
      ticker: r.ticker,
      score: parseFloat(r.weightedScore ?? "0"),
      grade: r.grade,
      direction: normalizeDirection(r.direction ?? "neutral"),
      criteria: Array.isArray(r.criteria) ? r.criteria : [],
      currentPrice: parseFloat(r.price ?? "0"),
      vwap: parseFloat(r.vwap ?? "0"),
      atr: parseFloat(r.atr ?? "0"),
      maxScore: parseFloat(r.maxScore ?? "11"),
      error: null,
    })),
    scannedAt: lastScanRaw[0] ? new Date(lastScanRaw[0].scannedAt).getTime() : null,
  } : null;

  // On-demand full scan mutation
  const runScan = trpc.intraday.runScan.useMutation({
    onSuccess: (data) => {
      const normalized = data.results.map((r: any) => ({
        ticker: r.ticker,
        score: r.score,
        grade: r.grade,
        direction: normalizeDirection(r.direction ?? "neutral"),
        criteria: r.criteria ?? {},
        currentPrice: parseFloat(r.price ?? r.currentPrice ?? "0"),
        vwap: parseFloat(r.vwap ?? "0"),
        atr: parseFloat(r.atr ?? "0"),
        maxScore: r.maxScore ?? 11,
        error: null,
      }));
      setLiveResults(normalized as any as IntradayScorecard[]);
      setLiveScannedAt(Date.now());
      void utils.intraday.getLatestScans.invalidate();
      void utils.intraday.getLatestScans.invalidate();
      const gradeA = data.results.filter((r: any) => r.grade === "A").length;
      if (gradeA > 0) {
        toast.success(`Scan complete — ${gradeA} Grade A signal${gradeA > 1 ? "s" : ""} found!`, {
          description: `${data.scanned} tickers scanned`,
        });
      } else {
        toast.info(`Scan complete — no Grade A signals`, {
          description: `${data.scanned} tickers scanned · Best grades: B/C`,
        });
      }
    },
    onError: (err) => {
      toast.error("Scan failed", { description: err.message });
    },
  });

  // Single ticker score
  const { data: singleData, isFetching: singleLoading, refetch: refetchSingle } = trpc.intraday.getScanResult.useQuery(
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

  // Normalize single-ticker response from server shape (price/weightedScore) to client shape (currentPrice/score)
  const singleCard: IntradayScorecard | undefined = singleData ? {
    ...singleData,
    ticker: singleData.ticker ?? singleTicker.toUpperCase(),
    currentPrice: parseFloat(String((singleData as any).price ?? (singleData as any).currentPrice ?? 0)),
    score: parseFloat(String((singleData as any).weightedScore ?? (singleData as any).score ?? 0)),
    maxScore: parseFloat(String((singleData as any).maxScore ?? 11)),
    vwap: parseFloat(String((singleData as any).vwap ?? 0)),
    atr: parseFloat(String((singleData as any).atr ?? 0)),
    direction: normalizeDirection((singleData as any).direction ?? "neutral"),
    criteria: (singleData as any).criteria ?? {},
    grade: (singleData as any).grade ?? "F",
    error: (singleData as any).error ?? null,
  } as IntradayScorecard : undefined;

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
            onClick={() => runScan.mutate({})}
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

      {/* Tabs: Scanner / History / Backtest / Weights */}
      <Tabs defaultValue="scanner">
        <TabsList className="mb-4">
          <TabsTrigger value="scanner" className="gap-1.5">
            <Zap className="w-3.5 h-3.5" /> Scanner
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="w-3.5 h-3.5" /> History
          </TabsTrigger>
          <TabsTrigger value="backtest" className="gap-1.5">
            <BarChart2 className="w-3.5 h-3.5" /> Backtest Stats
          </TabsTrigger>
          <TabsTrigger value="weights" className="gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5" /> Weight Tuning
          </TabsTrigger>
        </TabsList>

        {/* ── History Tab ── */}
        <TabsContent value="history" className="mt-0">
          <ScanHistoryPanel />
        </TabsContent>

        {/* ── Backtest Stats Tab ── */}
        <TabsContent value="backtest" className="mt-0">
          <BacktestStatsPanel />
        </TabsContent>

        {/* ── Weight Tuning Tab ── */}
        <TabsContent value="weights" className="mt-0">
          <WeightSlidersPanel />
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
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-sm ${directionBadge(normalizeDirection(singleCard.direction))}`}>
                          {directionIcon(singleCard.direction)} {normalizeDirection(singleCard.direction)}
                        </span>
                        <span className="text-sm text-gray-500 ml-auto">
                          ${singleCard.currentPrice.toFixed(2)} · VWAP ${singleCard.vwap.toFixed(2)}
                        </span>
                      </div>
                      {scoreBar(singleCard.score, singleCard.maxScore)}
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {normalizeCriteria(singleCard.criteria).map((c) => (
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
                  onClick={() => runScan.mutate({})}
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
