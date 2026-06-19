import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ComposedChart, LineChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, ResponsiveContainer, ReferenceLine, Area
} from "recharts";
import {
  CheckCircle2, XCircle, AlertCircle, TrendingUp, TrendingDown,
  Calendar, DollarSign, BarChart3, BookOpen, Search, Loader2,
  ChevronRight, Info
} from "lucide-react";
import { TICKER_SYMBOLS } from "@shared/tickerUniverse";

// ─── Types ────────────────────────────────────────────────────────────────────

type AnalyzeResult = {
  ticker: string;
  lastPrice: number;
  atmStrike: number;
  nextEarningsDate: string | null;
  daysToEarnings: number | null;
  entryDate: string | null;
  exitDate: string | null;
  filter: {
    termStructurePass: boolean;
    liquidityPass: boolean;
    ivRvRatioPass: boolean;
    allPass: boolean;
    termStructureSlope: number;
    termStructureSlopeDecile: number;
    avgVolume30d: number;
    volumeDecile: number;
    iv30: number;
    rv30: number;
    ivRvRatio: number;
    ivRvDecile: number;
  };
  shortLeg: { type: string; position: string; strike: number; expiry: string; dte: number; bid: number; ask: number; mid: number; iv: number; delta: number; theta: number; vega: number };
  longLeg: { type: string; position: string; strike: number; expiry: string; dte: number; bid: number; ask: number; mid: number; iv: number; delta: number; theta: number; vega: number };
  netDebit: number;
  maxLoss: number;
  theoreticalMaxProfit: number;
  breakEvenLow: number;
  breakEvenHigh: number;
  expectedReturn: number;
  winRate: number;
  kellyFraction: number;
  portfolioAllocation: number;
  portfolioSize: number;
  allocationAmount: number;
  recommendedContracts: number;
  contractsFor10k: number;
  contractsFor50k: number;
  contractsFor100k: number;
  pnlCurve: Array<{ price: number; pnl: number }>;
  historicalMoves: number[];
  avgHistoricalMove: number;
  expectedMove: number;
  priceHistory: Array<{ date: string; close: number; volume: number }>;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function FilterBadge({ pass, label, detail }: { pass: boolean; label: string; detail: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-help transition-colors ${
            pass
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}>
            {pass
              ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              : <XCircle className="w-4 h-4 text-red-500 shrink-0" />
            }
            <span className="text-sm font-medium">{label}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="text-xs">{detail}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function DecileBar({ value, label, invert = false }: { value: number; label: string; invert?: boolean }) {
  const pct = (value / 9) * 100;
  const color = invert
    ? (value <= 4 ? "bg-emerald-500" : value <= 6 ? "bg-amber-400" : "bg-red-500")
    : (value >= 5 ? "bg-emerald-500" : value >= 3 ? "bg-amber-400" : "bg-red-500");
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span className="font-mono font-medium text-slate-700">{value + 1}/10</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.max(5, pct)}%` }} />
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "green" | "red" | "blue" | "amber" }) {
  const colors = {
    green: "text-emerald-700 bg-emerald-50 border-emerald-200",
    red: "text-red-700 bg-red-50 border-red-200",
    blue: "text-blue-700 bg-blue-50 border-blue-200",
    amber: "text-amber-700 bg-amber-50 border-amber-200",
  };
  return (
    <div className={`rounded-xl border p-4 ${accent ? colors[accent] : "bg-white border-slate-200"}`}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold font-mono ${accent ? "" : "text-slate-900"}`}>{value}</p>
      {sub && <p className="text-xs mt-1 opacity-70">{sub}</p>}
    </div>
  );
}

// ─── Scan row ─────────────────────────────────────────────────────────────────

type ScanRow = {
  ticker: string;
  lastPrice: number;
  nextEarningsDate: string | null;
  daysToEarnings: number | null;
  allPass: boolean;
  termStructurePass: boolean;
  liquidityPass: boolean;
  ivRvRatioPass: boolean;
  ivRvRatio: number;
  netDebit: number;
  error?: string;
};

function ScanResultRow({ row, onSelect }: { row: ScanRow; onSelect: (t: string) => void }) {
  const passCount = [row.termStructurePass, row.liquidityPass, row.ivRvRatioPass].filter(Boolean).length;
  return (
    <tr
      className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors ${row.allPass ? "bg-emerald-50/40" : ""}`}
      onClick={() => onSelect(row.ticker)}
    >
      <td className="px-4 py-3 font-mono font-bold text-slate-800">{row.ticker}</td>
      <td className="px-4 py-3 font-mono text-slate-600">${row.lastPrice.toFixed(2)}</td>
      <td className="px-4 py-3 text-sm text-slate-500">{row.nextEarningsDate ?? "—"}</td>
      <td className="px-4 py-3 text-sm">{row.daysToEarnings != null ? `${row.daysToEarnings}d` : "—"}</td>
      <td className="px-4 py-3">
        <div className="flex gap-1">
          {[row.termStructurePass, row.liquidityPass, row.ivRvRatioPass].map((p, i) => (
            <span key={i} className={`w-5 h-5 rounded-full flex items-center justify-center ${p ? "bg-emerald-500" : "bg-slate-200"}`}>
              {p ? <CheckCircle2 className="w-3 h-3 text-white" /> : <XCircle className="w-3 h-3 text-slate-400" />}
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-3">
        <Badge variant={row.allPass ? "default" : passCount >= 2 ? "secondary" : "outline"} className={row.allPass ? "bg-emerald-600" : ""}>
          {row.allPass ? "✓ All Pass" : `${passCount}/3`}
        </Badge>
      </td>
      <td className="px-4 py-3 font-mono text-sm">{row.ivRvRatio.toFixed(2)}x</td>
      <td className="px-4 py-3 font-mono text-sm text-blue-700">${row.netDebit.toFixed(2)}</td>
      <td className="px-4 py-3">
        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onSelect(row.ticker); }}>
          Analyze <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      </td>
    </tr>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EarningsCalendar() {
  const [ticker, setTicker] = useState("");
  const [portfolioSize, setPortfolioSize] = useState(10000);
  const [earningsDateOverride, setEarningsDateOverride] = useState("");
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [scanTickers, setScanTickers] = useState(TICKER_SYMBOLS.slice(0, 10).join(", "));
  const [scanResults, setScanResults] = useState<ScanRow[]>([]);

  const analyzeMut = trpc.earningsCalendar.analyze.useMutation({
    onSuccess: (data) => setResult(data as AnalyzeResult),
  });

  const scanMut = trpc.earningsCalendar.scanTickers.useMutation({
    onSuccess: (data) => setScanResults(data as ScanRow[]),
  });

  function handleAnalyze() {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setResult(null);
    const override = earningsDateOverride.trim() || undefined;
    analyzeMut.mutate({ ticker: t, portfolioSize, earningsDateOverride: override });
  }

  function handleScan() {
    const tickers = scanTickers.split(/[,\s]+/).map(t => t.trim().toUpperCase()).filter(Boolean);
    if (tickers.length === 0) return;
    setScanResults([]);
    scanMut.mutate({ tickers: tickers.slice(0, 20) });
  }

  function handleSelectFromScan(t: string) {
    setTicker(t);
    setResult(null);
    analyzeMut.mutate({ ticker: t, portfolioSize });
    // Scroll to top
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const r = result;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-blue-600" />
            Earnings Calendar Spread
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Long Calendar Spread strategy — capture IV crush around earnings. 66% win rate · 7.3% mean return · Sharpe 3.5
            <span className="ml-2 text-xs text-slate-400">(Backtest: 72k events, 2007–2019)</span>
          </p>
        </div>
        <Badge variant="outline" className="text-blue-700 border-blue-300 bg-blue-50">
          Debit Strategy
        </Badge>
      </div>

      {/* Strategy explainer */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="pt-4 pb-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">1</div>
              <div>
                <p className="font-semibold text-slate-800">Entry</p>
                <p className="text-slate-600">15 min before close, day before earnings. Buy ATM calendar spread (short front-month, long back-month, 30-day gap).</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">2</div>
              <div>
                <p className="font-semibold text-slate-800">Hold</p>
                <p className="text-slate-600">Through earnings announcement. Front-month IV collapses (crush). Back-month retains value.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">3</div>
              <div>
                <p className="font-semibold text-slate-800">Exit</p>
                <p className="text-slate-600">15 min after open, day after earnings. Close entire spread regardless of P&L direction.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="analyze">
        <TabsList>
          <TabsTrigger value="analyze">Single Ticker</TabsTrigger>
          <TabsTrigger value="scan">Scan Multiple</TabsTrigger>
          <TabsTrigger value="methodology">Methodology</TabsTrigger>
        </TabsList>

        {/* ── Single Ticker Tab ── */}
        <TabsContent value="analyze" className="space-y-6 mt-4">
          {/* Input form */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Ticker Symbol</label>
                  <Input
                    placeholder="e.g. NVDA"
                    value={ticker}
                    onChange={e => setTicker(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === "Enter" && handleAnalyze()}
                    className="w-36 font-mono uppercase"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Portfolio Size ($)</label>
                  <Input
                    type="number"
                    placeholder="10000"
                    value={portfolioSize}
                    onChange={e => setPortfolioSize(Number(e.target.value))}
                    className="w-36 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">
                    Earnings Date
                    <span className="ml-1 text-slate-400 font-normal">(override)</span>
                  </label>
                  <Input
                    type="date"
                    value={earningsDateOverride}
                    onChange={e => setEarningsDateOverride(e.target.value)}
                    className="w-40 font-mono text-sm"
                    placeholder="YYYY-MM-DD"
                  />
                </div>
                <Button
                  onClick={handleAnalyze}
                  disabled={analyzeMut.isPending || !ticker.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {analyzeMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                  Analyze
                </Button>
              </div>
              {analyzeMut.isError && (
                <p className="text-sm text-red-600 mt-2 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" /> {analyzeMut.error.message}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Results */}
          {r && (
            <div className="space-y-5">
              {/* Signal banner */}
              <div className={`rounded-xl border-2 p-4 flex items-center justify-between ${
                r.filter.allPass
                  ? "bg-emerald-50 border-emerald-400"
                  : "bg-amber-50 border-amber-300"
              }`}>
                <div className="flex items-center gap-3">
                  {r.filter.allPass
                    ? <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                    : <AlertCircle className="w-8 h-8 text-amber-500" />
                  }
                  <div>
                    <p className={`text-lg font-bold ${r.filter.allPass ? "text-emerald-800" : "text-amber-800"}`}>
                      {r.filter.allPass ? "✓ Trade Signal — All 3 Filters Pass" : "⚠ Partial Signal — Not All Filters Pass"}
                    </p>
                    <p className="text-sm text-slate-600">
                      {r.ticker} · ${r.lastPrice.toFixed(2)} · ATM Strike: ${r.atmStrike}
                      {r.nextEarningsDate && ` · Earnings: ${r.nextEarningsDate} (${r.daysToEarnings}d)`}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Net Debit</p>
                  <p className="text-2xl font-bold font-mono text-blue-700">${r.netDebit.toFixed(2)}</p>
                  <p className="text-xs text-slate-500">per contract: ${(r.netDebit * 100).toFixed(0)}</p>
                </div>
              </div>

              {/* Filter scorecard */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" /> Filter Scorecard
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <FilterBadge
                      pass={r.filter.termStructurePass}
                      label="Term Structure Backwardation"
                      detail={`Near-term IV slope: ${(r.filter.termStructureSlope * 100).toFixed(1)}%. Decile ${r.filter.termStructureSlopeDecile + 1}/10. Pass if ≤ 5th decile (near-term IV elevated vs back-month).`}
                    />
                    <FilterBadge
                      pass={r.filter.liquidityPass}
                      label="Liquidity (30d Avg Volume)"
                      detail={`30-day avg volume: ${(r.filter.avgVolume30d / 1e6).toFixed(1)}M. Decile ${r.filter.volumeDecile + 1}/10. Pass if ≥ 6th decile.`}
                    />
                    <FilterBadge
                      pass={r.filter.ivRvRatioPass}
                      label="IV30/RV30 Ratio"
                      detail={`IV30/RV30: ${r.filter.ivRvRatio.toFixed(2)}x. Decile ${r.filter.ivRvDecile + 1}/10. Pass if ≥ 5th decile (IV overpriced vs realized).`}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                    <DecileBar value={r.filter.termStructureSlopeDecile} label="Term Structure Slope" invert />
                    <DecileBar value={r.filter.volumeDecile} label="Liquidity Decile" />
                    <DecileBar value={r.filter.ivRvDecile} label="IV/RV Decile" />
                  </div>
                  <div className="grid grid-cols-3 gap-3 pt-1">
                    <div className="text-center">
                      <p className="text-xs text-slate-500">IV30</p>
                      <p className="font-mono font-bold text-slate-800">{(r.filter.iv30 * 100).toFixed(1)}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-500">RV30</p>
                      <p className="font-mono font-bold text-slate-800">{(r.filter.rv30 * 100).toFixed(1)}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-500">IV/RV Ratio</p>
                      <p className={`font-mono font-bold ${r.filter.ivRvRatio >= 1.2 ? "text-emerald-700" : "text-slate-800"}`}>
                        {r.filter.ivRvRatio.toFixed(2)}x
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Key stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Net Debit" value={`$${r.netDebit.toFixed(2)}`} sub="Max loss per share" accent="blue" />
                <StatCard label="Max Profit (Theory)" value={`$${r.theoreticalMaxProfit.toFixed(2)}`} sub="If stock pins ATM" accent="green" />
                <StatCard label="Win Rate" value={`${r.winRate}%`} sub="Backtest 2007–2019" accent="green" />
                <StatCard label="Mean Return" value={`${r.expectedReturn}%`} sub="Per trade (backtest)" accent="amber" />
              </div>

              {/* Timing + sizing */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Trade timing */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <Calendar className="w-4 h-4" /> Trade Timing
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Next Earnings</span>
                      <span className="font-mono font-medium">{r.nextEarningsDate ?? "Not found"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Days to Earnings</span>
                      <span className="font-mono font-medium">{r.daysToEarnings != null ? `${r.daysToEarnings} days` : "—"}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Entry Date</span>
                      <span className="font-mono font-medium text-blue-700">{r.entryDate ?? "—"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Entry Time</span>
                      <span className="font-mono font-medium text-blue-700">15 min before close</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Exit Date</span>
                      <span className="font-mono font-medium text-emerald-700">{r.exitDate ?? "—"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Exit Time</span>
                      <span className="font-mono font-medium text-emerald-700">15 min after open</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Expected Move (±1σ)</span>
                      <span className="font-mono font-medium">±${r.expectedMove.toFixed(2)}</span>
                    </div>
                    {r.historicalMoves.length > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Avg Historical Move</span>
                        <span className="font-mono font-medium">{(r.avgHistoricalMove * 100).toFixed(1)}%</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Kelly sizing */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <DollarSign className="w-4 h-4" /> Kelly Position Sizing
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Kelly Fraction</span>
                      <span className="font-mono font-medium">10% (conservative)</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Portfolio Allocation</span>
                      <span className="font-mono font-medium text-blue-700">6% per trade</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Your Portfolio</span>
                      <span className="font-mono font-medium">${portfolioSize.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Allocation Amount</span>
                      <span className="font-mono font-medium text-blue-700">${r.allocationAmount.toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Cost per Contract</span>
                      <span className="font-mono font-medium">${(r.netDebit * 100).toFixed(0)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-sm font-semibold">
                      <span className="text-slate-700">Recommended Contracts</span>
                      <span className="font-mono text-blue-700 text-lg">{r.recommendedContracts}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      {[
                        { label: "$10k", val: r.contractsFor10k },
                        { label: "$50k", val: r.contractsFor50k },
                        { label: "$100k", val: r.contractsFor100k },
                      ].map(({ label, val }) => (
                        <div key={label} className="text-center bg-slate-50 rounded-lg p-2">
                          <p className="text-xs text-slate-500">{label}</p>
                          <p className="font-mono font-bold text-slate-800">{val}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Legs table */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-700">Calendar Spread Legs</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
                          <th className="text-left pb-2 pr-4">Leg</th>
                          <th className="text-right pb-2 pr-4">Strike</th>
                          <th className="text-right pb-2 pr-4">Expiry</th>
                          <th className="text-right pb-2 pr-4">DTE</th>
                          <th className="text-right pb-2 pr-4">Bid</th>
                          <th className="text-right pb-2 pr-4">Ask</th>
                          <th className="text-right pb-2 pr-4">Mid</th>
                          <th className="text-right pb-2 pr-4">IV</th>
                          <th className="text-right pb-2 pr-4">Delta</th>
                          <th className="text-right pb-2">Theta</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {[r.shortLeg, r.longLeg].map((leg, i) => (
                          <tr key={i} className={i === 0 ? "bg-red-50/40" : "bg-emerald-50/40"}>
                            <td className="py-2 pr-4">
                              <Badge variant={i === 0 ? "destructive" : "default"} className={i === 0 ? "" : "bg-emerald-600"}>
                                {i === 0 ? "SHORT" : "LONG"} {leg.type.toUpperCase()}
                              </Badge>
                            </td>
                            <td className="py-2 pr-4 text-right font-mono font-bold">${leg.strike}</td>
                            <td className="py-2 pr-4 text-right font-mono text-slate-600">{leg.expiry}</td>
                            <td className="py-2 pr-4 text-right font-mono">{leg.dte}d</td>
                            <td className="py-2 pr-4 text-right font-mono text-slate-600">${leg.bid.toFixed(2)}</td>
                            <td className="py-2 pr-4 text-right font-mono text-slate-600">${leg.ask.toFixed(2)}</td>
                            <td className="py-2 pr-4 text-right font-mono font-medium">${leg.mid.toFixed(2)}</td>
                            <td className="py-2 pr-4 text-right font-mono">{(leg.iv * 100).toFixed(1)}%</td>
                            <td className="py-2 pr-4 text-right font-mono">{leg.delta.toFixed(3)}</td>
                            <td className="py-2 text-right font-mono">{leg.theta.toFixed(4)}</td>
                          </tr>
                        ))}
                        <tr className="bg-blue-50 font-semibold">
                          <td className="py-2 pr-4 text-blue-700">NET DEBIT</td>
                          <td colSpan={5} />
                          <td className="py-2 pr-4 text-right font-mono text-blue-700">${r.netDebit.toFixed(2)}</td>
                          <td colSpan={3} />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* P&L chart */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-700">P&L at Front-Month Expiry</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={r.pnlCurve} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="price" tickFormatter={v => `$${v.toFixed(0)}`} tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={v => `$${v.toFixed(2)}`} tick={{ fontSize: 11 }} />
                      <ReTooltip formatter={(v: number) => [`$${v.toFixed(2)}`, "P&L"]} labelFormatter={v => `Price: $${Number(v).toFixed(2)}`} />
                      <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1.5} />
                      <ReferenceLine x={r.lastPrice} stroke="#3b82f6" strokeDasharray="4 2" label={{ value: "Current", position: "top", fontSize: 10 }} />
                      <ReferenceLine x={r.breakEvenLow} stroke="#f59e0b" strokeDasharray="3 3" />
                      <ReferenceLine x={r.breakEvenHigh} stroke="#f59e0b" strokeDasharray="3 3" />
                      <Area type="monotone" dataKey="pnl" fill="#dbeafe" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 text-xs text-slate-500 mt-2 justify-center">
                    <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-400 inline-block" /> Breakeven: ${r.breakEvenLow.toFixed(2)} / ${r.breakEvenHigh.toFixed(2)}</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-500 inline-block" /> Current: ${r.lastPrice.toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Historical earnings moves */}
              {r.historicalMoves.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-slate-700">Historical Earnings Moves</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {r.historicalMoves.map((m, i) => (
                        <Badge key={i} variant="outline" className="font-mono">
                          {(m * 100).toFixed(1)}%
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      Avg: {(r.avgHistoricalMove * 100).toFixed(1)}% · Expected move (IV): ±${r.expectedMove.toFixed(2)}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {analyzeMut.isPending && (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin mr-3" />
              Fetching price history, computing IV, evaluating filters…
            </div>
          )}
        </TabsContent>

        {/* ── Scan Tab ── */}
        <TabsContent value="scan" className="space-y-4 mt-4">
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-3">
                <label className="text-xs font-medium text-slate-600">Tickers to scan (comma or space separated, max 20)</label>
                <textarea
                  className="w-full border border-slate-200 rounded-lg p-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                  rows={3}
                  value={scanTickers}
                  onChange={e => setScanTickers(e.target.value)}
                  placeholder="AAPL, NVDA, TSLA, MSFT, AMZN..."
                />
                <Button
                  onClick={handleScan}
                  disabled={scanMut.isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {scanMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                  Scan for Opportunities
                </Button>
              </div>
            </CardContent>
          </Card>

          {scanResults.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-700">
                  Scan Results — {scanResults.filter(r => r.allPass).length} of {scanResults.length} pass all filters
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide bg-slate-50">
                        <th className="text-left px-4 py-2">Ticker</th>
                        <th className="text-left px-4 py-2">Price</th>
                        <th className="text-left px-4 py-2">Earnings</th>
                        <th className="text-left px-4 py-2">Days</th>
                        <th className="text-left px-4 py-2">Filters</th>
                        <th className="text-left px-4 py-2">Signal</th>
                        <th className="text-left px-4 py-2">IV/RV</th>
                        <th className="text-left px-4 py-2">Debit</th>
                        <th className="text-left px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {scanResults
                        .sort((a, b) => {
                          if (a.allPass !== b.allPass) return a.allPass ? -1 : 1;
                          const aPass = [a.termStructurePass, a.liquidityPass, a.ivRvRatioPass].filter(Boolean).length;
                          const bPass = [b.termStructurePass, b.liquidityPass, b.ivRvRatioPass].filter(Boolean).length;
                          return bPass - aPass;
                        })
                        .map(row => (
                          <ScanResultRow key={row.ticker} row={row} onSelect={handleSelectFromScan} />
                        ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {scanMut.isPending && (
            <div className="flex items-center justify-center py-12 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Scanning tickers… this may take 30–60 seconds
            </div>
          )}
        </TabsContent>

        {/* ── Methodology Tab ── */}
        <TabsContent value="methodology" className="mt-4">
          <Card>
            <CardContent className="pt-5 space-y-5">
              <div>
                <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2"><BookOpen className="w-4 h-4" /> Strategy Overview</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  The Earnings Calendar Spread exploits the well-documented phenomenon that near-term implied volatility (IV) is systematically overpriced before earnings announcements relative to back-month IV. By buying a calendar spread (short front-month, long back-month, both ATM), you profit when the front-month IV collapses after earnings while the back-month retains most of its value.
                </p>
              </div>
              <Separator />
              <div>
                <h3 className="font-semibold text-slate-800 mb-3">Three-Filter Model</h3>
                <div className="space-y-3">
                  {[
                    {
                      num: 1, title: "Term Structure Backwardation (≤ 5th decile)",
                      desc: "The slope between near-term and back-month IV must be sufficiently negative — near-term options are overpriced relative to back-month. This is the core condition for the calendar to profit from IV crush. Measured as nearIV − backIV; lower (more negative) is better."
                    },
                    {
                      num: 2, title: "30-Day Average Volume (≥ 6th decile)",
                      desc: "High liquidity ensures tight bid-ask spreads on both legs. Illiquid options have wide spreads that eat into the calendar's thin edge. The 30-day average volume must be in the top 40% of the universe."
                    },
                    {
                      num: 3, title: "IV30/RV30 Ratio (≥ 5th decile)",
                      desc: "Implied volatility must be overpriced relative to realized volatility. When IV30/RV30 ≥ 1.0, the market is paying a premium for options — this premium is what the calendar spread harvests. The ratio must be at or above the 5th decile."
                    }
                  ].map(f => (
                    <div key={f.num} className="flex gap-3 p-3 bg-slate-50 rounded-lg">
                      <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">{f.num}</div>
                      <div>
                        <p className="font-semibold text-sm text-slate-800">{f.title}</p>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">{f.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <Separator />
              <div>
                <h3 className="font-semibold text-slate-800 mb-2">Kelly Criterion Sizing</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  The strategy uses a 10% Kelly fraction (conservative half-Kelly equivalent), translating to 6% of portfolio capital per trade. With a 66% win rate and 7.3% mean return, the full Kelly would be higher — but 10% Kelly protects against estimation error and model risk. Monte Carlo simulation on a $10k account over 10 years (2007–2019) showed a mean ending portfolio of ~$6M with a mean Sharpe of 3.5 and max drawdown of ~20%.
                </p>
              </div>
              <Separator />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Backtest Period", value: "2007–2019" },
                  { label: "Events Analyzed", value: "72,000+" },
                  { label: "Win Rate", value: "66%" },
                  { label: "Mean Return/Trade", value: "7.3%" },
                  { label: "Sharpe Ratio", value: "3.5" },
                  { label: "Mean Max Drawdown", value: "~20%" },
                  { label: "CAGR (10% Kelly)", value: "~90%" },
                  { label: "Stocks Covered", value: "4,500+" },
                ].map(s => (
                  <div key={s.label} className="text-center bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500">{s.label}</p>
                    <p className="font-mono font-bold text-slate-800">{s.value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
