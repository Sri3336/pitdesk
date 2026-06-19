import { useState, useCallback, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowDownCircle, BarChart2, CalendarDays, ChevronDown, ChevronUp,
  Download, Info, Loader2, RefreshCw, TrendingDown, TrendingUp, Zap, Share2, Play,
} from "lucide-react";
import { useState as useStateLocal, useRef as useRefLocal } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import type { AnalysisResult, StrategyResult, EarningsInfo } from "../../../server/analysisEngine";
import { EventImpactPanel } from "@/components/EventImpactPanel";
import { TICKER_UNIVERSE } from "../../../shared/tickerUniverse";

// ─── Quantum & AI tickers set ─────────────────────────────────────────────────
const QMAI_TICKERS = new Set(
  TICKER_UNIVERSE.filter(t => t.sector === "Quantum & AI").map(t => t.symbol)
);

// ─── Analyzer Explainer Video Section ────────────────────────────────────────
function AnalyzerExplainerSection() {
  const [open, setOpen] = useStateLocal(false);
  const videoRef = useRefLocal<HTMLVideoElement>(null);

  const handleToggle = () => {
    setOpen(prev => {
      if (prev && videoRef.current) videoRef.current.pause();
      return !prev;
    });
  };

  return (
    <Card className="border-violet-200 bg-violet-50/50">
      <CardContent className="pt-4 pb-3">
        <button
          onClick={handleToggle}
          className="w-full flex items-center justify-between gap-3 text-left group"
        >
          <div className="flex items-center gap-3">
            {/* Thumbnail preview — always visible */}
            <div className="relative shrink-0 w-24 h-14 rounded-md overflow-hidden border border-violet-200 shadow-sm">
              <img
                src="/manus-storage/analyzer_frame1_title_e8351eca.png"
                alt="Analyzer explainer thumbnail"
                className="w-full h-full object-cover"
              />
              {!open && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <div className="flex items-center justify-center w-7 h-7 rounded-full bg-violet-600/90 text-white">
                    <svg className="w-3.5 h-3.5 ml-0.5" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2.5l10 5.5-10 5.5V2.5z"/></svg>
                  </div>
                </div>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-violet-900">How the Analyzer Works</p>
              <p className="text-xs text-violet-700">Watch a 2-minute explainer — Black-Scholes pricing, 7-dimension scoring, and strategy ranking</p>
            </div>
          </div>
          <svg className={`w-4 h-4 text-violet-600 transition-transform duration-200 ${open ? "rotate-180" : ""}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6l4 4 4-4"/></svg>
        </button>

        {open && (
          <div className="mt-4">
            <video
              ref={videoRef}
              src="/manus-storage/analyzer_explainer_4536fb74.mp4"
              poster="/manus-storage/analyzer_frame1_title_e8351eca.png"
              controls
              autoPlay
              className="w-full rounded-lg shadow-md max-h-[420px] bg-slate-900"
              style={{ aspectRatio: "16/9" }}
            />
            {/* Share button */}
            <div className="mt-2 flex justify-end">
              <button
                onClick={() => {
                  const url = `${window.location.origin}/`;
                  navigator.clipboard.writeText(url).then(() => toast.success("Link copied to clipboard!"));
                }}
                className="inline-flex items-center gap-1.5 text-xs text-violet-700 hover:text-violet-900 transition-colors px-2 py-1 rounded hover:bg-violet-100"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share this explainer
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {[
                { label: "Black-Scholes Engine", hint: "Synthetic chain with 20-delta targeting", color: "text-violet-700 bg-violet-50 border-violet-200" },
                { label: "7-Dimension Score", hint: "POP, liquidity, risk, fit, IV/RV, theta, vega", color: "text-blue-700 bg-blue-50 border-blue-200" },
                { label: "13 Strategies", hint: "Credit and debit — all ranked simultaneously", color: "text-amber-700 bg-amber-50 border-amber-200" },
                { label: "Regime Detection", hint: "IVR, RSI-14, MACD, directional bias", color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
              ].map(item => (
                <div key={item.label} className={`rounded border p-2 ${item.color}`}>
                  <p className="font-semibold leading-tight">{item.label}</p>
                  <p className="mt-0.5 opacity-80">{item.hint}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Form schema ──────────────────────────────────────────────────────────────
const formSchema = z.object({
  ticker: z.string().min(1).max(10),
  targetDte: z.coerce.number().int().min(1).max(365),
  accountSize: z.coerce.number().min(1000).max(10_000_000),
  minCredit: z.coerce.number().min(0).max(10000).optional(),
  strategyCategory: z.enum(["all", "credit", "debit"]).default("all"),
});
type FormValues = z.infer<typeof formSchema>;
type FormValuesStrict = { ticker: string; targetDte: number; accountSize: number; minCredit?: number; strategyCategory: "all" | "credit" | "debit" };

// ─── Strategy color map ───────────────────────────────────────────────────────
const STRATEGY_COLORS: Record<string, string> = {
  "Naked Put": "#22c55e",
  "Naked Call": "#ef4444",
  "Short Strangle": "#a855f7",
  "Iron Condor": "#f59e0b",
  "Bull Put Spread": "#10b981",
  "Bear Call Spread": "#f43f5e",
  "Bull Call Spread": "#3b82f6",
  "Bear Put Spread": "#ec4899",
  "Long Straddle": "#06b6d4",
  "Long Strangle": "#0ea5e9",
  "Cash-Secured Put": "#84cc16",
  "Covered Call": "#fb923c",
  "Butterfly Spread": "#8b5cf6",
};

const STRATEGY_BADGES: Record<string, string> = {
  "Naked Put": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Naked Call": "bg-red-50 text-red-700 border-red-200",
  "Short Strangle": "bg-purple-50 text-purple-700 border-purple-200",
  "Iron Condor": "bg-amber-50 text-amber-700 border-amber-200",
  "Bull Put Spread": "bg-teal-50 text-teal-700 border-teal-200",
  "Bear Call Spread": "bg-rose-50 text-rose-700 border-rose-200",
  "Bull Call Spread": "bg-blue-50 text-blue-700 border-blue-200",
  "Bear Put Spread": "bg-pink-50 text-pink-700 border-pink-200",
  "Long Straddle": "bg-cyan-50 text-cyan-700 border-cyan-200",
  "Long Strangle": "bg-sky-50 text-sky-700 border-sky-200",
  "Cash-Secured Put": "bg-lime-50 text-lime-700 border-lime-200",
  "Covered Call": "bg-orange-50 text-orange-700 border-orange-200",
  "Butterfly Spread": "bg-violet-50 text-violet-700 border-violet-200",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined, decimals = 2, prefix = ""): string {
  if (n == null) return "—";
  return `${prefix}${n.toFixed(decimals)}`;
}
function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}
function fmtDollar(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricPill({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2 rounded-lg bg-muted/40 border border-border/40 min-w-[90px]">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className={`text-sm font-semibold num ${color ?? "text-foreground"}`}>{value}</span>
    </div>
  );
}

function StrategyTag({ name }: { name: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${STRATEGY_BADGES[name] ?? ""}`}>
      {name}
    </span>
  );
}

// ─── Trade Action Box ───────────────────────────────────────────────────────
function TradeActionBox({ rec, ticker, expiry }: { rec: StrategyResult; ticker: string; expiry: string }) {
  const legRows = rec.legs.map((leg: StrategyResult["legs"][0] & { position?: string }, i: number) => {
    const pos = (leg as { position?: string }).position ?? "short";
    const action = pos === "long" ? "BUY" : "SELL";
    const actionColor = pos === "long" ? "text-blue-700 bg-blue-50 border-blue-200" : "text-emerald-700 bg-emerald-50 border-emerald-200";
    return (
      <div key={i} className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0">
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${actionColor}`}>
          {action}
        </span>
        <span className="text-sm font-semibold num text-foreground">
          1 {leg.type.toUpperCase()} @ ${leg.strike.toFixed(2)}
        </span>
        <span className="text-xs text-muted-foreground">exp. {expiry}</span>
        <span className="text-xs text-muted-foreground ml-auto">
          mid <span className="num font-medium text-foreground">${leg.mid.toFixed(2)}</span>
          {" "}· IV <span className="num">{(leg.iv * 100).toFixed(1)}%</span>
          {" "}· Δ <span className="num">{leg.delta.toFixed(2)}</span>
        </span>
      </div>
    );
  });

  const summaryMap: Record<string, string> = {
    "Naked Put": `Sell 1 put on ${ticker} to collect premium. Profit if price stays above breakeven at expiration.`,
    "Naked Call": `Sell 1 call on ${ticker} to collect premium. Profit if price stays below breakeven at expiration.`,
    "Short Strangle": `Sell 1 put and 1 call on ${ticker} simultaneously. Profit if price stays between both breakevens at expiration.`,
    "Iron Condor": `Sell a put spread and a call spread on ${ticker}. Defined-risk trade; profit if price stays inside the short strikes at expiration.`,
  };
  const summary = summaryMap[rec.name] ?? "Sell premium to collect net credit.";

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <ArrowDownCircle className="h-4 w-4 text-primary shrink-0" />
        <span className="text-xs font-bold text-primary uppercase tracking-widest">Trade Order Summary</span>
        <span className="ml-auto text-xs text-muted-foreground">
          Net Credit: <span className="num font-bold text-profit">${rec.netCredit.toFixed(2)}</span>
          <span className="text-muted-foreground"> / contract</span>
        </span>
      </div>
      <div className="divide-y divide-border/20">{legRows}</div>
      <p className="mt-3 text-xs text-muted-foreground leading-relaxed border-t border-border/20 pt-3">
        <span className="font-semibold text-foreground">What this means: </span>{summary}
      </p>
      <div className="flex flex-wrap gap-2 mt-3">
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-profit/10 text-profit text-[11px] font-semibold border border-profit/20">
          Max Profit: {rec.maxProfit == null ? "Unlimited" : `$${rec.maxProfit.toFixed(2)}`}
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-loss/10 text-loss text-[11px] font-semibold border border-loss/20">
          Max Loss: {rec.maxLoss == null ? "Unlimited" : `$${rec.maxLoss.toFixed(2)}`}
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted/50 text-foreground text-[11px] font-semibold border border-border/30">
          POP: {(rec.pop * 100).toFixed(1)}%
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted/50 text-foreground text-[11px] font-semibold border border-border/30">
          BP Required: ${rec.buyingPower.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

// ─── Score Radar Chart ────────────────────────────────────────────────────────
function ScoreRadarChart({ rec }: { rec: StrategyResult }) {
  const color = STRATEGY_COLORS[rec.name] ?? "#f59e0b";
  const data = [
    { dimension: "POP", value: rec.scores.pop, max: 20 },
    { dimension: "Liquidity", value: rec.scores.liquidity, max: 20 },
    { dimension: "Risk Def.", value: rec.scores.riskDefinition, max: 20 },
    { dimension: "Dir. Fit", value: rec.scores.directionalFit, max: 20 },
    { dimension: "IV/RV", value: rec.scores.ivRvRatio, max: 20 },
    { dimension: "Theta", value: rec.scores.theta, max: 10 },
    { dimension: "Vega", value: rec.scores.vega, max: 10 },
  ].map(d => ({
    dimension: d.dimension,
    // Normalise to 0-100 scale so all axes are comparable
    score: parseFloat(((d.value / d.max) * 100).toFixed(1)),
    raw: d.value.toFixed(1),
  }));

  return (
    <div className="mt-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">Score Radar</p>
      <ResponsiveContainer width="100%" height={220}>
        <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <PolarGrid stroke="rgba(100,116,139,0.2)" />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fontSize: 10, fill: "#64748b" }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fontSize: 8, fill: "#64748b" }}
            tickCount={4}
          />
          <Radar
            name={rec.name}
            dataKey="score"
            stroke={color}
            fill={color}
            fillOpacity={0.18}
            strokeWidth={2}
          />
          <Tooltip
            contentStyle={{ background: "#0d1117", border: "1px solid #2d3748", borderRadius: 8, fontSize: 11 }}
            formatter={(v: number, _: string, entry: any) => [`${v.toFixed(0)}% (${entry.payload.raw}pts)`, "Score"]}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Recommendation Card ──────────────────────────────────────────────────────
function RecommendationCard({ result }: { result: AnalysisResult }) {
  const rec = result.recommendation;
  const r = result.regime;
  const color = STRATEGY_COLORS[rec.name] ?? "#f59e0b";

  // IVR colour: green > 50 (elevated, good for selling), amber 30-50, red < 30
  const ivrColor = r.ivPercentileRank >= 50 ? "text-profit" : r.ivPercentileRank >= 30 ? "text-neutral-gold" : "text-loss";

  return (
    <Card className="border-border/50 bg-card overflow-hidden" style={{ borderTopColor: color, borderTopWidth: 3 }}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">Primary Recommendation</p>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold tracking-tight" style={{ color }}>{rec.name}</h2>
              <Badge variant="outline" className="text-xs" style={{ borderColor: color + "50", color }}>
                Rank #{rec.rank}
              </Badge>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground mb-1">Composite Score</p>
            <p className="text-3xl font-bold num" style={{ color }}>{rec.compositeScore.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">/100</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed mt-2">{rec.rationale}</p>
      </CardHeader>

      <Separator className="bg-border/40" />

      <CardContent className="pt-4">
        {/* Trade Action Box */}
        <TradeActionBox rec={rec} ticker={result.ticker} expiry={result.expiryUsed} />

        {/* Quantum & AI high-IV Iron Condor badge */}
        {QMAI_TICKERS.has(result.ticker) && r.medianIV > 0.80 && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50">
            <Zap className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-800">
              <span className="font-semibold">Iron Condor Candidate</span> — {result.ticker} is a Quantum & AI ticker with IV {(r.medianIV * 100).toFixed(0)}% (above 80%). High IV favors defined-risk spreads like Iron Condors.
            </p>
          </div>
        )}

        {/* Regime metrics */}
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Regime Metrics</p>
        <div className="flex flex-wrap gap-2 mb-4">
          <MetricPill
            label="IV/RV Ratio"
            value={r.ivRvRatio.toFixed(2)}
            color={r.ivRvRatio > 1.1 ? "text-profit" : r.ivRvRatio < 0.9 ? "text-loss" : "text-neutral-gold"}
          />
          <MetricPill
            label="IVR"
            value={`${r.ivPercentileRank}%`}
            color={ivrColor}
          />
          <MetricPill
            label="Directional Bias"
            value={r.directionalBias}
            color={r.directionalBias === "Bullish" ? "text-profit" : r.directionalBias === "Bearish" ? "text-loss" : "text-neutral-gold"}
          />
          <MetricPill
            label="RSI-14"
            value={r.rsi14.toFixed(1)}
            color={r.rsi14 > 70 ? "text-loss" : r.rsi14 < 30 ? "text-profit" : "text-foreground"}
          />
          <MetricPill
            label="MACD Hist"
            value={r.macdHist.toFixed(3)}
            color={r.macdHist > 0 ? "text-profit" : "text-loss"}
          />
          <MetricPill label="Last Price" value={`$${r.lastPrice.toFixed(2)}`} />
          <MetricPill label="Median IV" value={`${(r.medianIV * 100).toFixed(1)}%`} />
          <MetricPill label="RV-20" value={`${(r.rv20 * 100).toFixed(1)}%`} />
          <MetricPill label="DTE" value={`${result.dte}d`} />
        </div>

        {/* Breakevens */}
        {rec.breakevens.length > 0 && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/30">
            <span className="text-xs text-muted-foreground font-medium">Breakeven{rec.breakevens.length > 1 ? "s" : ""}:</span>
            {rec.breakevens.map((be, i) => (
              <span key={i} className="text-sm num font-semibold text-foreground">${be.toFixed(2)}</span>
            ))}
            <span className="text-xs text-muted-foreground ml-auto">
              Net Credit: <span className="text-profit font-semibold num">${rec.netCredit.toFixed(2)}</span>
            </span>
          </div>
        )}

        {/* Score Radar Chart */}
        <ScoreRadarChart rec={rec} />
      </CardContent>
    </Card>
  );
}

// ─── DTE Suitability Badge ───────────────────────────────────────────────────
const DTE_SUITABILITY: Record<string, { label: string; color: string }> = {
  "Naked Put":       { label: "Weekly+",   color: "text-emerald-600" },
  "Naked Call":      { label: "Weekly+",   color: "text-red-500" },
  "Short Strangle":  { label: "21-45d",    color: "text-purple-500" },
  "Iron Condor":     { label: "21-45d",    color: "text-amber-500" },
  "Bull Put Spread": { label: "Weekly+",   color: "text-teal-600" },
  "Bear Call Spread":{ label: "Weekly+",   color: "text-rose-500" },
  "Bull Call Spread":{ label: "30-60d",    color: "text-blue-500" },
  "Bear Put Spread": { label: "30-60d",    color: "text-pink-500" },
  "Long Straddle":   { label: "7-21d",     color: "text-cyan-500" },
  "Long Strangle":   { label: "7-21d",     color: "text-sky-500" },
  "Cash-Secured Put":{ label: "30-45d",    color: "text-lime-600" },
  "Covered Call":    { label: "30-45d",    color: "text-orange-500" },
  "Butterfly Spread":{ label: "7-21d",     color: "text-violet-500" },
};

function DteBadge({ name }: { name: string }) {
  const info = DTE_SUITABILITY[name];
  if (!info) return null;
  return (
    <span className={`text-[9px] font-semibold uppercase tracking-wider ml-4 ${info.color}`}>
      {info.label}
    </span>
  );
}

// ─── Strategy Comparison Table ────────────────────────────────────────────────
function ComparisonTable({ strategies, recommendation }: { strategies: StrategyResult[]; recommendation: StrategyResult }) {
  // Show all strategies returned by the engine, sorted by rank
  const sorted = [...strategies].sort((a, b) => a.rank - b.rank);

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-primary" />
          Strategy Comparison
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Strategy</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Rank</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Net Credit</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Max Profit</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Max Loss</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">BP Req.</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">POP</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Delta</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Theta</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Vega</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Score</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(s => {
                const isRec = s.name === recommendation.name;
                const color = STRATEGY_COLORS[s.name];
                return (
                  <tr
                    key={s.name}
                    className={`border-b border-border/30 transition-colors ${isRec ? "bg-primary/5" : "hover:bg-muted/20"}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          <StrategyTag name={s.name} />
                          {isRec && <span className="text-[9px] font-bold text-primary uppercase tracking-wider">★ Pick</span>}
                        </div>
                        <DteBadge name={s.name} />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right num font-medium">#{s.rank}</td>
                    <td className="px-3 py-3 text-right num text-profit">${s.netCredit.toFixed(2)}</td>
                    <td className="px-3 py-3 text-right num text-profit">{s.maxProfit == null ? <span className="text-profit font-semibold">Unlimited</span> : fmtDollar(s.maxProfit)}</td>
                    <td className="px-3 py-3 text-right num text-loss">
                      {s.maxLoss == null ? <span className="text-loss font-semibold">Unlimited</span> : fmtDollar(s.maxLoss)}
                    </td>
                    <td className="px-3 py-3 text-right num text-muted-foreground">{fmtDollar(s.buyingPower)}</td>
                    <td className="px-3 py-3 text-right num">{fmtPct(s.pop)}</td>
                    <td className="px-3 py-3 text-right num">{s.delta.toFixed(3)}</td>
                    <td className="px-3 py-3 text-right num text-profit">{s.theta.toFixed(4)}</td>
                    <td className="px-3 py-3 text-right num">{s.vega.toFixed(4)}</td>
                    <td className="px-3 py-3 text-right">
                      <span className="num font-bold" style={{ color }}>{s.compositeScore.toFixed(1)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── P&L Chart ────────────────────────────────────────────────────────────────
function PnlChart({ strategies, lastPrice }: { strategies: StrategyResult[]; lastPrice: number }) {
  const priceSet = new Set<number>();
  strategies.forEach(s => s.pnlCurve.forEach(p => priceSet.add(p.price)));
  const prices = Array.from(priceSet).sort((a, b) => a - b);

  const data = prices.map(price => {
    const row: Record<string, number> = { price };
    strategies.forEach(s => {
      const pt = s.pnlCurve.find(p => p.price === price);
      row[s.name] = pt?.pnl ?? 0;
    });
    return row;
  });

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          P&amp;L at Expiration
        </CardTitle>
        <p className="text-xs text-muted-foreground">Expiration payoff per 1-lot contract (×100 multiplier applied)</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="price"
              tickFormatter={v => `$${v}`}
              tick={{ fontSize: 10, fill: "#64748b" }}
              axisLine={{ stroke: "#2d3748" }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={v => `$${v}`}
              tick={{ fontSize: 10, fill: "#64748b" }}
              axisLine={{ stroke: "#2d3748" }}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ background: "#0d1117", border: "1px solid #2d3748", borderRadius: 8, fontSize: 11 }}
              labelFormatter={v => `Price: $${v}`}
              formatter={(v: number, name: string) => [`$${v.toFixed(2)}`, name]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine x={lastPrice} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "Current", fill: "#f59e0b", fontSize: 10 }} />
            <ReferenceLine y={0} stroke="#475569" strokeDasharray="2 2" />
            {strategies.map(s => (
              <Line
                key={s.name}
                type="monotone"
                dataKey={s.name}
                stroke={STRATEGY_COLORS[s.name]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ─── Price Trend Chart ────────────────────────────────────────────────────────
function PriceTrendChart({ result }: { result: AnalysisResult }) {
  const closes = result.priceHistory.map(b => b.close);

  function sma(arr: number[], period: number): (number | null)[] {
    return arr.map((_, i) => {
      if (i < period - 1) return null;
      return arr.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
    });
  }

  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);

  const display = result.priceHistory.slice(-252);
  const offset = result.priceHistory.length - display.length;

  // Build probability cone: project ±1σ and ±2σ bands forward from last bar
  const lastPrice = result.regime.lastPrice;
  const em = result.expectedMove;   // ±1σ to expiry
  const dte = result.dte;
  const lastDate = display[display.length - 1]?.date ?? "";

  // Generate forward cone points (one per 5 trading days)
  const coneSteps = Math.min(dte, 45);
  const conePoints: { date: string; upper1: number; lower1: number; upper2: number; lower2: number }[] = [];
  for (let d = 0; d <= coneSteps; d += Math.max(1, Math.floor(coneSteps / 8))) {
    const frac = d / dte;
    const move1 = em * Math.sqrt(frac);
    const move2 = em * 2 * Math.sqrt(frac);
    // Approximate future date
    const futureMs = new Date(lastDate).getTime() + d * 1.4 * 86400000; // 1.4× for calendar days
    const futureDate = new Date(futureMs).toISOString().split("T")[0];
    conePoints.push({
      date: futureDate,
      upper1: parseFloat((lastPrice + move1).toFixed(2)),
      lower1: parseFloat((lastPrice - move1).toFixed(2)),
      upper2: parseFloat((lastPrice + move2).toFixed(2)),
      lower2: parseFloat((lastPrice - move2).toFixed(2)),
    });
  }

  const data = display.map((bar, i) => ({
    date: bar.date,
    close: bar.close,
    sma20: sma20[offset + i],
    sma50: sma50[offset + i],
    sma200: sma200[offset + i],
    upper1: null as number | null,
    lower1: null as number | null,
    upper2: null as number | null,
    lower2: null as number | null,
  }));

  // Merge cone data (append after last historical bar)
  const merged = [
    ...data,
    ...conePoints.map(c => ({ ...c, close: null as number | null, sma20: null, sma50: null, sma200: null })),
  ];

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            {result.ticker} — Price Trend (1Y)
          </CardTitle>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">±1σ ({dte}d):</span>
            <span className="font-bold num text-primary">${em.toFixed(0)} ({result.expectedMovePct.toFixed(1)}%)</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Daily close with SMA overlays + probability cone (±1σ green, ±2σ amber)</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={merged} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="cone2Grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.04} />
              </linearGradient>
              <linearGradient id="cone1Grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0.06} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: "#64748b" }}
              axisLine={{ stroke: "#2d3748" }}
              tickLine={false}
              interval={Math.floor(merged.length / 6)}
            />
            <YAxis
              tickFormatter={v => `$${v}`}
              tick={{ fontSize: 10, fill: "#64748b" }}
              axisLine={{ stroke: "#2d3748" }}
              tickLine={false}
              domain={["auto", "auto"]}
            />
            <Tooltip
              contentStyle={{ background: "#0d1117", border: "1px solid #2d3748", borderRadius: 8, fontSize: 11 }}
              formatter={(v: number, name: string) => v != null ? [`$${v?.toFixed(2)}`, name] : [null, name]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {/* ±2σ cone */}
            <Area type="monotone" dataKey="upper2" stroke="#f59e0b" strokeWidth={1} strokeDasharray="3 2" fill="url(#cone2Grad)" dot={false} name="+2σ" connectNulls />
            <Area type="monotone" dataKey="lower2" stroke="#f59e0b" strokeWidth={1} strokeDasharray="3 2" fill="transparent" dot={false} name="-2σ" connectNulls />
            {/* ±1σ cone */}
            <Area type="monotone" dataKey="upper1" stroke="#22c55e" strokeWidth={1.5} strokeDasharray="4 2" fill="url(#cone1Grad)" dot={false} name="+1σ" connectNulls />
            <Area type="monotone" dataKey="lower1" stroke="#22c55e" strokeWidth={1.5} strokeDasharray="4 2" fill="transparent" dot={false} name="-1σ" connectNulls />
            {/* Price and SMAs */}
            <Area type="monotone" dataKey="close" stroke="#f59e0b" strokeWidth={1.5} fill="url(#priceGrad)" dot={false} name="Close" connectNulls />
            <Line type="monotone" dataKey="sma20" stroke="#22c55e" strokeWidth={1.5} dot={false} name="SMA-20" connectNulls />
            <Line type="monotone" dataKey="sma50" stroke="#3b82f6" strokeWidth={1.5} dot={false} name="SMA-50" connectNulls />
            <Line type="monotone" dataKey="sma200" stroke="#a855f7" strokeWidth={1.5} dot={false} name="SMA-200" connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ─── RSI Chart ────────────────────────────────────────────────────────────────
function RsiChart({ result }: { result: AnalysisResult }) {
  const data = result.regime.rsiHistory;
  const currentRsi = result.regime.rsi14;
  const rsiColor = currentRsi > 70 ? "#ef4444" : currentRsi < 30 ? "#22c55e" : "#3b82f6";

  // Sample to last 120 bars for readability
  const display = data.slice(-120);

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-primary" />
            RSI-14
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Current:</span>
            <span className="text-sm font-bold num" style={{ color: rsiColor }}>{currentRsi.toFixed(1)}</span>
            <Badge
              variant="outline"
              className="text-[10px]"
              style={{ borderColor: rsiColor + "60", color: rsiColor }}
            >
              {currentRsi > 70 ? "Overbought" : currentRsi < 30 ? "Oversold" : "Neutral"}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">14-period Relative Strength Index — overbought &gt;70, oversold &lt;30</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={display} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="rsiGradOB" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="rsiGradOS" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: "#64748b" }}
              axisLine={{ stroke: "#2d3748" }}
              tickLine={false}
              interval={Math.floor(display.length / 5)}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 30, 50, 70, 100]}
              tick={{ fontSize: 10, fill: "#64748b" }}
              axisLine={{ stroke: "#2d3748" }}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ background: "#0d1117", border: "1px solid #2d3748", borderRadius: 8, fontSize: 11 }}
              formatter={(v: number) => [v.toFixed(1), "RSI-14"]}
            />
            {/* Overbought band */}
            <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="4 2" strokeOpacity={0.6}
              label={{ value: "70", position: "right", fill: "#ef4444", fontSize: 9 }} />
            {/* Oversold band */}
            <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="4 2" strokeOpacity={0.6}
              label={{ value: "30", position: "right", fill: "#22c55e", fontSize: 9 }} />
            {/* Midline */}
            <ReferenceLine y={50} stroke="#475569" strokeDasharray="2 2" strokeOpacity={0.4} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3, fill: "#3b82f6" }}
              name="RSI-14"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ─── MACD Chart ───────────────────────────────────────────────────────────────
function MacdChart({ result }: { result: AnalysisResult }) {
  const data = result.regime.macdHistory;
  const currentHist = result.regime.macdHist;

  // Sample to last 120 bars for readability
  const display = data.slice(-120);

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-primary" />
            MACD (12, 26, 9)
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Histogram:</span>
            <span className={`text-sm font-bold num ${currentHist > 0 ? "text-profit" : "text-loss"}`}>
              {currentHist.toFixed(4)}
            </span>
            <Badge
              variant="outline"
              className="text-[10px]"
              style={{
                borderColor: currentHist > 0 ? "#22c55e60" : "#ef444460",
                color: currentHist > 0 ? "#22c55e" : "#ef4444",
              }}
            >
              {currentHist > 0 ? "Bullish" : "Bearish"}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">MACD line (12-26 EMA), Signal line (9-EMA), and Histogram</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={display} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: "#64748b" }}
              axisLine={{ stroke: "#2d3748" }}
              tickLine={false}
              interval={Math.floor(display.length / 5)}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#64748b" }}
              axisLine={{ stroke: "#2d3748" }}
              tickLine={false}
              tickFormatter={v => v.toFixed(2)}
            />
            <Tooltip
              contentStyle={{ background: "#0d1117", border: "1px solid #2d3748", borderRadius: 8, fontSize: 11 }}
              formatter={(v: number, name: string) => [v.toFixed(4), name]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#475569" strokeDasharray="2 2" />
            {/* Histogram bars — green above zero, red below */}
            <Bar
              dataKey="hist"
              name="Histogram"
              radius={[1, 1, 0, 0]}
            >
              {display.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.hist >= 0 ? "#22c55e" : "#ef4444"}
                  fillOpacity={0.75}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {/* MACD and Signal lines as a separate LineChart overlay */}
        <ResponsiveContainer width="100%" height={100}>
          <LineChart data={display} margin={{ top: 0, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: "#64748b" }}
              axisLine={{ stroke: "#2d3748" }}
              tickLine={false}
              interval={Math.floor(display.length / 5)}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#64748b" }}
              axisLine={{ stroke: "#2d3748" }}
              tickLine={false}
              tickFormatter={v => v.toFixed(2)}
            />
            <Tooltip
              contentStyle={{ background: "#0d1117", border: "1px solid #2d3748", borderRadius: 8, fontSize: 11 }}
              formatter={(v: number, name: string) => [v.toFixed(4), name]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#475569" strokeDasharray="2 2" />
            <Line type="monotone" dataKey="macd" stroke="#3b82f6" strokeWidth={1.5} dot={false} name="MACD" />
            <Line type="monotone" dataKey="signal" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="Signal" strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ─── Regime Alert Banner ─────────────────────────────────────────────────────
function RegimeAlertBanner({ result }: { result: AnalysisResult }) {
  const r = result.regime;
  const alerts: { level: "warn" | "info"; icon: React.ReactNode; title: string; body: string }[] = [];

  if (r.ivPercentileRank < 30) {
    alerts.push({
      level: "warn",
      icon: <AlertTriangle className="h-4 w-4 shrink-0" />,
      title: "Low IV Environment (IVR < 30%)",
      body: `IV is in the bottom ${r.ivPercentileRank}% of its 52-week range. Premium-selling strategies collect less credit than usual. Consider waiting for IVR > 50% or favouring debit spreads.`,
    });
  }
  if (r.rsi14 > 75) {
    alerts.push({
      level: "warn",
      icon: <TrendingUp className="h-4 w-4 shrink-0" />,
      title: `RSI Overbought (${r.rsi14.toFixed(1)})`,
      body: "RSI-14 is above 75 — the stock may be extended. Bear Call Spreads or Iron Condors with a bearish skew may be better positioned than pure bullish strategies.",
    });
  }
  if (r.rsi14 < 25) {
    alerts.push({
      level: "info",
      icon: <TrendingDown className="h-4 w-4 shrink-0" />,
      title: `RSI Oversold (${r.rsi14.toFixed(1)})`,
      body: "RSI-14 is below 25 — the stock may be oversold. Bull Put Spreads or Cash-Secured Puts may offer a favourable risk/reward if a mean-reversion bounce is expected.",
    });
  }
  if (result.earningsInfo?.daysToEarnings != null && result.earningsInfo.daysToEarnings <= result.dte) {
    alerts.push({
      level: "warn",
      icon: <CalendarDays className="h-4 w-4 shrink-0" />,
      title: `Earnings Within DTE Window (${result.earningsInfo.daysToEarnings}d away)`,
      body: `${result.ticker} reports earnings before your target expiry. IV will likely spike then crush after the event. Consider closing positions before earnings or using a shorter DTE to avoid the event.`,
    });
  }

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((a, i) => (
        <div
          key={i}
          className={`flex gap-3 p-3 rounded-lg border text-sm ${
            a.level === "warn"
              ? "bg-amber-50 border-amber-200 text-amber-900"
              : "bg-blue-50 border-blue-200 text-blue-900"
          }`}
        >
          <span className={a.level === "warn" ? "text-amber-600 mt-0.5" : "text-blue-600 mt-0.5"}>{a.icon}</span>
          <div>
            <p className="font-semibold text-[13px]">{a.title}</p>
            <p className="text-xs mt-0.5 opacity-80 leading-relaxed">{a.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Expected Move Panel ──────────────────────────────────────────────────────
function ExpectedMovePanel({ result }: { result: AnalysisResult }) {
  const r = result.regime;
  const em = result.expectedMove;
  const emPct = result.expectedMovePct;
  const upper = r.lastPrice + em;
  const lower = r.lastPrice - em;
  const upper2 = r.lastPrice + em * 2;
  const lower2 = r.lastPrice - em * 2;

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-primary" />
          Expected Move to Expiry ({result.dte}d)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          ±1σ and ±2σ price range implied by current IV ({(r.medianIV * 100).toFixed(1)}%)
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3 mb-4">
          <MetricPill label="±1σ Move" value={`$${em.toFixed(2)} (${emPct.toFixed(1)}%)`} color="text-primary" />
          <MetricPill label="±2σ Move" value={`$${(em * 2).toFixed(2)} (${(emPct * 2).toFixed(1)}%)`} color="text-muted-foreground" />
          <MetricPill label="1σ Upper" value={`$${upper.toFixed(2)}`} color="text-profit" />
          <MetricPill label="1σ Lower" value={`$${lower.toFixed(2)}`} color="text-loss" />
          <MetricPill label="2σ Upper" value={`$${upper2.toFixed(2)}`} color="text-profit" />
          <MetricPill label="2σ Lower" value={`$${lower2.toFixed(2)}`} color="text-loss" />
        </div>
        {/* Probability cone visualisation */}
        <div className="relative h-16 rounded-lg bg-muted/20 border border-border/30 overflow-hidden">
          {/* 2σ band */}
          <div
            className="absolute top-0 bottom-0 bg-amber-100/40 border-x border-amber-300/40"
            style={{
              left: `${Math.max(0, ((lower2 - r.lastPrice * 0.7) / (r.lastPrice * 0.6)) * 100)}%`,
              right: `${Math.max(0, 100 - ((upper2 - r.lastPrice * 0.7) / (r.lastPrice * 0.6)) * 100)}%`,
            }}
          />
          {/* 1σ band */}
          <div
            className="absolute top-0 bottom-0 bg-primary/10 border-x border-primary/30"
            style={{
              left: `${Math.max(0, ((lower - r.lastPrice * 0.7) / (r.lastPrice * 0.6)) * 100)}%`,
              right: `${Math.max(0, 100 - ((upper - r.lastPrice * 0.7) / (r.lastPrice * 0.6)) * 100)}%`,
            }}
          />
          {/* Current price line */}
          <div className="absolute top-0 bottom-0 w-0.5 bg-amber-500" style={{ left: "50%" }} />
          {/* Labels */}
          <div className="absolute inset-0 flex items-center justify-between px-2 text-[9px] font-semibold text-muted-foreground">
            <span className="text-loss">${lower2.toFixed(0)}</span>
            <span className="text-loss">${lower.toFixed(0)}</span>
            <span className="text-amber-600 font-bold">${r.lastPrice.toFixed(0)}</span>
            <span className="text-profit">${upper.toFixed(0)}</span>
            <span className="text-profit">${upper2.toFixed(0)}</span>
          </div>
        </div>
        <div className="flex gap-4 mt-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded bg-primary/20 border border-primary/40" /> 68% probability (±1σ)</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded bg-amber-100/60 border border-amber-300/60" /> 95% probability (±2σ)</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Greek column header with beginner tooltip ───────────────────────────────
const GREEK_TOOLTIPS: Record<string, { symbol: string; name: string; plain: string; positive: string; negative: string; example: string }> = {
  delta: {
    symbol: "Δ",
    name: "Delta",
    plain: "How much the option's value changes when the stock moves $1.",
    positive: "Positive → you profit when the stock rises.",
    negative: "Negative → you profit when the stock falls.",
    example: "Delta 0.30 means the option gains ~$0.30 for every $1 the stock goes up.",
  },
  gamma: {
    symbol: "Γ",
    name: "Gamma",
    plain: "How fast Delta itself changes as the stock moves. Think of it as the 'acceleration' of your position.",
    positive: "Positive Gamma → your Delta grows in your favour as the stock moves (long options).",
    negative: "Negative Gamma → your Delta works against you on big moves (short options). Risky near expiry.",
    example: "Gamma 0.02 means Delta increases by 0.02 for every $1 the stock moves.",
  },
  theta: {
    symbol: "Θ",
    name: "Theta",
    plain: "How much value the position loses (or gains) each calendar day purely from time passing — even if the stock doesn't move.",
    positive: "Positive Theta → time decay works in your favour. You collect premium as each day passes (short options).",
    negative: "Negative Theta → you lose value every day the stock stays still (long options).",
    example: "Theta −0.05 means the option loses $5 per contract per day from time decay alone.",
  },
  vega: {
    symbol: "V",
    name: "Vega",
    plain: "How much the position's value changes when implied volatility (IV) moves by 1 percentage point.",
    positive: "Positive Vega → you profit if IV rises (long options, straddles). Good before earnings.",
    negative: "Negative Vega → you profit if IV falls (short options, iron condors). Good after earnings.",
    example: "Vega −0.10 means the position loses $10 per contract if IV rises by 1%.",
  },
  rho: {
    symbol: "ρ",
    name: "Rho",
    plain: "How much the position's value changes when interest rates move by 1 percentage point.",
    positive: "Positive Rho → you benefit if interest rates rise (long calls, bull spreads).",
    negative: "Negative Rho → you benefit if interest rates fall (long puts, bear spreads).",
    example: "Rho 0.05 means the position gains $5 per contract if rates rise by 1%. Usually the smallest Greek.",
  },
  thetaVega: {
    symbol: "Θ/V",
    name: "Theta/Vega Ratio",
    plain: "How much daily time decay you collect relative to your volatility risk. Higher is better for premium sellers.",
    positive: "Higher ratio → more efficient premium collection per unit of vol risk.",
    negative: "Lower ratio → you're taking on more vol risk relative to what you earn each day.",
    example: "Ratio 0.5 means you earn $0.50 in daily theta for every $1 of vega exposure.",
  },
};

function GreekHeader({ greek, align = "right" }: { greek: keyof typeof GREEK_TOOLTIPS; align?: "left" | "right" }) {
  const info = GREEK_TOOLTIPS[greek];
  return (
    <TooltipProvider delayDuration={200}>
      <UITooltip>
        <TooltipTrigger asChild>
          <th
            className={`px-3 py-2.5 font-semibold text-muted-foreground cursor-help select-none ${
              align === "right" ? "text-right" : "text-left"
            }`}
          >
            <span className="inline-flex items-center gap-1 group">
              {align === "right" && <span className="opacity-0 group-hover:opacity-100 transition-opacity"><Info className="h-3 w-3 text-primary/60" /></span>}
              <span>{info.symbol} {info.name}</span>
              {align === "left" && <span className="opacity-0 group-hover:opacity-100 transition-opacity"><Info className="h-3 w-3 text-primary/60" /></span>}
            </span>
          </th>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[280px] p-3 space-y-2 text-left"
        >
          <p className="font-bold text-sm">{info.symbol} {info.name}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{info.plain}</p>
          <div className="space-y-1 border-t border-border/40 pt-2">
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400">✓ {info.positive}</p>
            <p className="text-[11px] text-rose-600 dark:text-rose-400">✗ {info.negative}</p>
          </div>
          <p className="text-[11px] text-primary/80 italic border-t border-border/40 pt-2">{info.example}</p>
        </TooltipContent>
      </UITooltip>
    </TooltipProvider>
  );
}

// ─── Greeks Dashboard ─────────────────────────────────────────────────────────
function GreeksDashboard({ strategies, recommendation }: { strategies: StrategyResult[]; recommendation: StrategyResult }) {
  const sorted = [...strategies].sort((a, b) => a.rank - b.rank);

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Info className="h-4 w-4 text-primary" />
          Greeks Dashboard
        </CardTitle>
        <p className="text-xs text-muted-foreground">Aggregate position Greeks per 1-lot contract at current price</p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Strategy</th>
                <GreekHeader greek="delta" />
                <GreekHeader greek="gamma" />
                <GreekHeader greek="theta" />
                <GreekHeader greek="vega" />
                <GreekHeader greek="rho" />
                <GreekHeader greek="thetaVega" />
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Score</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(s => {
                const isRec = s.name === recommendation.name;
                const color = STRATEGY_COLORS[s.name];
                const gamma = s.gamma ?? 0;
                const rho = s.rho ?? 0;
                const thetaVegaRatio = s.vega !== 0 ? Math.abs(s.theta / s.vega) : 0;
                return (
                  <tr
                    key={s.name}
                    className={`border-b border-border/30 transition-colors ${
                      isRec ? "bg-primary/5" : "hover:bg-muted/20"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <StrategyTag name={s.name} />
                        {isRec && <span className="text-[9px] font-bold text-primary uppercase tracking-wider">★ Pick</span>}
                      </div>
                    </td>
                    <td className={`px-3 py-3 text-right num font-medium ${
                      s.delta > 0 ? "text-profit" : s.delta < 0 ? "text-loss" : "text-muted-foreground"
                    }`}>{s.delta.toFixed(3)}</td>
                    <td className={`px-3 py-3 text-right num ${
                      gamma > 0 ? "text-profit" : gamma < 0 ? "text-loss" : "text-muted-foreground"
                    }`}>{gamma.toFixed(4)}</td>
                    <td className={`px-3 py-3 text-right num ${
                      s.theta > 0 ? "text-profit" : "text-loss"
                    }`}>{s.theta.toFixed(4)}</td>
                    <td className={`px-3 py-3 text-right num ${
                      s.vega < 0 ? "text-profit" : "text-loss"
                    }`}>{s.vega.toFixed(4)}</td>
                    <td className={`px-3 py-3 text-right num ${
                      rho > 0 ? "text-profit" : rho < 0 ? "text-loss" : "text-muted-foreground"
                    }`}>{rho.toFixed(4)}</td>
                    <td className="px-3 py-3 text-right num text-muted-foreground">{thetaVegaRatio.toFixed(3)}</td>
                    <td className="px-3 py-3 text-right">
                      <span className="num font-bold" style={{ color }}>{s.compositeScore.toFixed(1)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Earnings Move Analyzer ───────────────────────────────────────────────────
function EarningsAnalyzer({ earningsInfo, ticker, lastPrice }: { earningsInfo: EarningsInfo | null; ticker: string; lastPrice: number }) {
  if (!earningsInfo) return null;

  const { nextEarningsDate, daysToEarnings, expectedEarningsMove, historicalEarningsMoves, avgHistoricalMove } = earningsInfo;

  const hasData = nextEarningsDate || historicalEarningsMoves.length > 0;
  if (!hasData) return null;

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          Earnings Move Analyzer
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Expected move around earnings vs. historical actual moves
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3 mb-4">
          {nextEarningsDate && (
            <MetricPill
              label="Next Earnings"
              value={nextEarningsDate}
              color={daysToEarnings != null && daysToEarnings <= 14 ? "text-loss" : "text-foreground"}
            />
          )}
          {daysToEarnings != null && (
            <MetricPill
              label="Days Away"
              value={`${daysToEarnings}d`}
              color={daysToEarnings <= 14 ? "text-loss" : daysToEarnings <= 30 ? "text-neutral-gold" : "text-foreground"}
            />
          )}
          {expectedEarningsMove != null && (
            <MetricPill
              label="Expected Move"
              value={`±${expectedEarningsMove.toFixed(1)}%`}
              color="text-primary"
            />
          )}
          {avgHistoricalMove != null && (
            <MetricPill
              label="Avg Historical"
              value={`±${avgHistoricalMove.toFixed(1)}%`}
              color="text-muted-foreground"
            />
          )}
        </div>

        {historicalEarningsMoves.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">Last {historicalEarningsMoves.length} Earnings Moves</p>
            <div className="flex gap-2 flex-wrap">
              {historicalEarningsMoves.map((move, i) => {
                const dollarMove = (move / 100) * lastPrice;
                const isLarge = avgHistoricalMove != null && move > avgHistoricalMove * 1.3;
                return (
                  <div
                    key={i}
                    className={`flex flex-col items-center px-3 py-2 rounded-lg border text-center min-w-[70px] ${
                      isLarge
                        ? "bg-amber-50 border-amber-200"
                        : "bg-muted/30 border-border/40"
                    }`}
                  >
                    <span className={`text-sm font-bold num ${
                      isLarge ? "text-amber-700" : "text-foreground"
                    }`}>±{move.toFixed(1)}%</span>
                    <span className="text-[10px] text-muted-foreground">${dollarMove.toFixed(0)}</span>
                  </div>
                );
              })}
            </div>
            {avgHistoricalMove != null && expectedEarningsMove != null && (
              <div className={`mt-3 p-3 rounded-lg border text-xs ${
                expectedEarningsMove > avgHistoricalMove * 1.2
                  ? "bg-amber-50 border-amber-200 text-amber-800"
                  : "bg-muted/20 border-border/30 text-muted-foreground"
              }`}>
                {expectedEarningsMove > avgHistoricalMove * 1.2
                  ? `⚠ IV is pricing in a ±${expectedEarningsMove.toFixed(1)}% move, which is larger than the ${avgHistoricalMove.toFixed(1)}% historical average. Premium may be elevated — consider selling the expected move.`
                  : `IV is pricing in a ±${expectedEarningsMove.toFixed(1)}% move, roughly in line with the ${avgHistoricalMove.toFixed(1)}% historical average.`
                }
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Position Sizer ──────────────────────────────────────────────────────────
function PositionSizer({ strategies, recommendation, accountSize }: {
  strategies: StrategyResult[];
  recommendation: StrategyResult;
  accountSize: number;
}) {
  const [maxRiskPct, setMaxRiskPct] = useState(2); // % of account to risk per trade
  const sorted = [...strategies].sort((a, b) => a.rank - b.rank);

  const maxRiskDollars = accountSize * (maxRiskPct / 100);

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-primary" />
          Position Sizer
        </CardTitle>
        <p className="text-xs text-muted-foreground">Recommended contract count based on account size and max risk per trade</p>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 mb-5">
          <div className="flex flex-col gap-1 flex-1">
            <div className="flex justify-between">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Max Risk Per Trade</Label>
              <span className="text-sm font-bold num text-primary">{maxRiskPct}% = ${maxRiskDollars.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={10}
              step={0.5}
              value={maxRiskPct}
              onChange={e => setMaxRiskPct(parseFloat(e.target.value))}
              className="w-full accent-amber-500 h-2 rounded cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0.5% (Conservative)</span>
              <span>5% (Moderate)</span>
              <span>10% (Aggressive)</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Strategy</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Max Loss/Contract</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Contracts</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Total BP Used</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">% of Account</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Max Total Profit</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Max Total Loss</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(s => {
                const isRec = s.name === recommendation.name;
                const color = STRATEGY_COLORS[s.name];
                // Use maxLoss for risk sizing; if unlimited (null), use buyingPower as proxy
                const riskPerContract = s.maxLoss != null ? s.maxLoss : s.buyingPower;
                const contracts = riskPerContract > 0 ? Math.max(1, Math.floor(maxRiskDollars / riskPerContract)) : 1;
                const totalBp = contracts * s.buyingPower;
                const bpPct = (totalBp / accountSize) * 100;
                const totalProfit = s.maxProfit != null ? contracts * s.maxProfit : null;
                const totalLoss = s.maxLoss != null ? contracts * s.maxLoss : null;

                return (
                  <tr
                    key={s.name}
                    className={`border-b border-border/30 transition-colors ${
                      isRec ? "bg-primary/5" : "hover:bg-muted/20"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <StrategyTag name={s.name} />
                        {isRec && <span className="text-[9px] font-bold text-primary uppercase tracking-wider">★ Pick</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right num text-loss">
                      {s.maxLoss != null ? `$${s.maxLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : <span className="text-muted-foreground text-[10px]">Unlimited</span>}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="num font-bold text-lg" style={{ color }}>{contracts}</span>
                    </td>
                    <td className="px-3 py-3 text-right num text-muted-foreground">${totalBp.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="px-3 py-3 text-right">
                      <span className={`num text-xs font-semibold ${
                        bpPct > 20 ? "text-loss" : bpPct > 10 ? "text-neutral-gold" : "text-profit"
                      }`}>{bpPct.toFixed(1)}%</span>
                    </td>
                    <td className="px-3 py-3 text-right num text-profit">
                      {totalProfit != null ? `$${totalProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : <span className="text-profit font-semibold">Unlimited</span>}
                    </td>
                    <td className="px-3 py-3 text-right num text-loss">
                      {totalLoss != null ? `$${totalLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : <span className="text-loss font-semibold">Unlimited</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-muted-foreground mt-3">
          Contracts = floor(Max Risk $ ÷ Max Loss per contract). For unlimited-risk strategies, Buying Power is used as the risk proxy.
          BP % &gt; 20% is highlighted red as a concentration warning.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Scenario Analysis ────────────────────────────────────────────────────────
// Black-Scholes helpers (browser-side, no server call)
function bsPrice(S: number, K: number, T: number, r: number, sigma: number, isCall: boolean): number {
  if (T <= 0) return Math.max(0, isCall ? S - K : K - S);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  const nd1 = normalCdf(d1);
  const nd2 = normalCdf(d2);
  if (isCall) return S * nd1 - K * Math.exp(-r * T) * nd2;
  return K * Math.exp(-r * T) * (1 - nd2) - S * (1 - nd1);
}
function normalCdf(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + p * Math.abs(x) / 1);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2);
  return 0.5 * (1 + sign * y);
}

function ScenarioAnalysis({ strategies, result }: { strategies: StrategyResult[]; result: AnalysisResult }) {
  const [ivShift, setIvShift] = useState(0);   // percentage points shift in IV (e.g. +10 = IV+10%)
  const [priceShift, setPriceShift] = useState(0); // % shift in stock price

  const lastPrice = result.regime.lastPrice;
  const medianIV = result.regime.medianIV;
  const dte = result.dte;
  const r = 0.045;
  const T = dte / 365;

  const scenarioPrice = lastPrice * (1 + priceShift / 100);
  const scenarioIV = Math.max(0.01, medianIV + ivShift / 100);

  // Re-compute P&L for each strategy under scenario conditions
  const scenarioData = strategies.map(s => {
    let scenarioPnl = 0;
    s.legs.forEach((leg: any) => {
      const isCall = leg.type === "call";
      const origPrice = bsPrice(lastPrice, leg.strike, T, r, medianIV, isCall);
      const newPrice = bsPrice(scenarioPrice, leg.strike, T, r, scenarioIV, isCall);
      const priceDiff = (newPrice - origPrice) * 100; // per contract
      scenarioPnl += leg.position === "short" ? -priceDiff : priceDiff;
    });
    return { name: s.name, scenarioPnl, color: STRATEGY_COLORS[s.name] };
  });

  const sorted = [...scenarioData].sort((a, b) => b.scenarioPnl - a.scenarioPnl);

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Scenario Analysis
        </CardTitle>
        <p className="text-xs text-muted-foreground">Drag sliders to see how each strategy's P&L changes under different price and IV conditions</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Price shift slider */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Price Shift</Label>
              <span className={`text-sm font-bold num ${
                priceShift > 0 ? "text-profit" : priceShift < 0 ? "text-loss" : "text-muted-foreground"
              }`}>
                {priceShift > 0 ? "+" : ""}{priceShift}% → ${scenarioPrice.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={-30}
              max={30}
              step={1}
              value={priceShift}
              onChange={e => setPriceShift(parseFloat(e.target.value))}
              className="w-full accent-amber-500 h-2 rounded cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>-30%</span>
              <span className="text-amber-500">Current: ${lastPrice.toFixed(2)}</span>
              <span>+30%</span>
            </div>
          </div>

          {/* IV shift slider */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">IV Shift</Label>
              <span className={`text-sm font-bold num ${
                ivShift > 0 ? "text-loss" : ivShift < 0 ? "text-profit" : "text-muted-foreground"
              }`}>
                {ivShift > 0 ? "+" : ""}{ivShift}pp → {((medianIV + ivShift / 100) * 100).toFixed(1)}%
              </span>
            </div>
            <input
              type="range"
              min={-30}
              max={50}
              step={1}
              value={ivShift}
              onChange={e => setIvShift(parseFloat(e.target.value))}
              className="w-full accent-amber-500 h-2 rounded cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>-30pp (IV crush)</span>
              <span className="text-amber-500">Current: {(medianIV * 100).toFixed(1)}%</span>
              <span>+50pp (IV spike)</span>
            </div>
          </div>
        </div>

        {/* Scenario P&L bars */}
        <div className="space-y-2">
          {sorted.map(s => {
            const maxAbs = Math.max(...scenarioData.map(d => Math.abs(d.scenarioPnl)), 1);
            const barPct = Math.min(100, (Math.abs(s.scenarioPnl) / maxAbs) * 100);
            const isPos = s.scenarioPnl >= 0;
            return (
              <div key={s.name} className="flex items-center gap-3">
                <div className="w-36 shrink-0">
                  <StrategyTag name={s.name} />
                </div>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 h-6 bg-muted/30 rounded overflow-hidden">
                    <div
                      className="h-full rounded transition-all duration-300"
                      style={{
                        width: `${barPct}%`,
                        backgroundColor: isPos ? "#22c55e" : "#ef4444",
                        opacity: 0.75,
                        marginLeft: isPos ? "50%" : `calc(50% - ${barPct / 2}%)`,
                      }}
                    />
                  </div>
                  <span className={`text-xs num font-semibold w-20 text-right ${
                    isPos ? "text-profit" : "text-loss"
                  }`}>
                    {isPos ? "+" : ""}${s.scenarioPnl.toFixed(0)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground mt-3">
          P&L computed via Black-Scholes repricing of each leg under scenario conditions. Assumes no time decay change (DTE fixed at {dte}d). Values are per 1-lot contract (×100 multiplier).
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Main Analyzer Page ───────────────────────────────────────────────────────
export default function Analyzer() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [showMethodology, setShowMethodology] = useState(false);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormValuesStrict>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: { ticker: "", targetDte: 30, accountSize: 50000, strategyCategory: "all" },
  });

  // Pre-fill ticker from ?ticker= query param (e.g. from Watch List one-click analyze)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("ticker");
    if (t) setValue("ticker", t.toUpperCase());
  }, [setValue]);

  const runMutation = trpc.analysis.run.useMutation({
    onSuccess: (data) => {
      setResult(data as unknown as AnalysisResult);
      toast.success(`Analysis complete for ${data.ticker}`, {
        description: `Recommendation: ${data.recommendation.name} (Score: ${data.recommendation.compositeScore.toFixed(1)})`,
      });
    },
    onError: (err) => {
      toast.error("Analysis failed", { description: err.message });
    },
  });

  const exportMutation = trpc.analysis.exportExcel.useMutation({
    onSuccess: ({ base64 }) => {
      if (!result) return;
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Options_Analysis_${result.ticker}_${new Date().toISOString().split("T")[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Excel report downloaded");
    },
    onError: (err) => toast.error("Export failed", { description: err.message }),
  });

  const onSubmit = useCallback((values: FormValuesStrict) => {
    setResult(null);
    const payload: typeof values = { ...values };
    if (!payload.minCredit || payload.minCredit <= 0) delete payload.minCredit;
    runMutation.mutate(payload);
  }, [runMutation]) as (values: FormValuesStrict) => void;

  const handleExport = useCallback(() => {
    if (!result) return;
    exportMutation.mutate({ resultJson: JSON.stringify(result) });
  }, [result, exportMutation]);

  return (
    <div className="min-h-screen p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gradient-gold">PitDesk</h1>
          <p className="text-sm text-muted-foreground mt-1">
            13-strategy analysis — credit and debit — ranked by composite score across POP, IV/RV, directional fit, theta, and more.
          </p>
        </div>
        {result && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exportMutation.isPending}
            className="shrink-0 border-border/50 hover:border-primary/50"
          >
            {exportMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
            Export Excel
          </Button>
        )}
      </div>

      {/* Analysis Form */}
      <Card className="border-border/50 bg-card">
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit(onSubmit as any)} className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1.5 min-w-[120px]">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ticker</Label>
              <Input
                {...register("ticker")}
                placeholder="AAPL"
                className="font-mono uppercase bg-input border-border/50 focus:border-primary/50 h-9 w-28"
                onChange={e => setValue("ticker", e.target.value.toUpperCase())}
              />
              {errors.ticker && <p className="text-xs text-destructive">{errors.ticker.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Target DTE</Label>
              <Select
                defaultValue="30"
                onValueChange={v => setValue("targetDte", parseInt(v))}
              >
                <SelectTrigger className="w-32 h-9 bg-input border-border/50 focus:border-primary/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    { v: 7, label: "7 days (weekly)" },
                    { v: 14, label: "14 days" },
                    { v: 21, label: "21 days" },
                    { v: 30, label: "30 days" },
                    { v: 42, label: "42 days (6 weeks)" },
                    { v: 45, label: "45 days" },
                    { v: 60, label: "60 days" },
                    { v: 90, label: "90 days" },
                  ].map(({ v, label }) => (
                    <SelectItem key={v} value={String(v)}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5 min-w-[160px]">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Account Size ($)</Label>
              <Input
                {...register("accountSize")}
                type="number"
                placeholder="50000"
                className="num bg-input border-border/50 focus:border-primary/50 h-9 w-40"
              />
              {errors.accountSize && <p className="text-xs text-destructive">{errors.accountSize.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Strategy Type</Label>
              <Select
                defaultValue="all"
                onValueChange={v => setValue("strategyCategory", v as "all" | "credit" | "debit")}
              >
                <SelectTrigger className="w-36 h-9 bg-input border-border/50 focus:border-primary/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Strategies</SelectItem>
                  <SelectItem value="credit">Credit Only</SelectItem>
                  <SelectItem value="debit">Debit Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5 min-w-[140px]">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Min Credit ($/contract)
              </Label>
              <Input
                {...register("minCredit")}
                type="number"
                placeholder="0 (no filter)"
                className="num bg-input border-border/50 focus:border-primary/50 h-9 w-40"
                min={0}
                step={0.5}
              />
              {errors.minCredit && <p className="text-xs text-destructive">{errors.minCredit.message}</p>}
            </div>

            <Button
              type="submit"
              disabled={runMutation.isPending}
              className="h-9 px-6 font-semibold glow-gold"
            >
              {runMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Analyzing…
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Analyze
                </>
              )}
            </Button>

            {result && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setResult(null)}
                className="h-9 text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Clear
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Loading state */}
      {runMutation.isPending && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="relative">
            <div className="h-16 w-16 rounded-full border-2 border-primary/20 animate-pulse" />
            <Loader2 className="h-8 w-8 text-primary animate-spin absolute inset-0 m-auto" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">Fetching market data & running analysis…</p>
            <p className="text-xs text-muted-foreground mt-1">Computing Greeks, indicators, and strategy scores</p>
          </div>
        </div>
      )}

      {/* Analyzer Explainer Video */}
      {!result && !runMutation.isPending && <AnalyzerExplainerSection />}

      {/* Results */}
      {result && !runMutation.isPending && (
        <div className="space-y-6">
          {/* Top row: Recommendation + Comparison */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <RecommendationCard result={result} />
            <ComparisonTable strategies={result.strategies} recommendation={result.recommendation} />
          </div>

          {/* Regime Alert Banner */}
          <RegimeAlertBanner result={result} />

          {/* Expected Move + Earnings Analyzer */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <ExpectedMovePanel result={result} />
            <EarningsAnalyzer
              earningsInfo={result.earningsInfo}
              ticker={result.ticker}
              lastPrice={result.regime.lastPrice}
            />
          </div>

          {/* Event Impact */}
          <EventImpactPanel ticker={result.ticker} />

          {/* Charts row 1: P&L + Price Trend */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <PnlChart strategies={result.strategies} lastPrice={result.regime.lastPrice} />
            <PriceTrendChart result={result} />
          </div>

          {/* Charts row 2: RSI + MACD */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <RsiChart result={result} />
            <MacdChart result={result} />
          </div>

          {/* Position Sizer + Scenario Analysis */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <PositionSizer
              strategies={result.strategies}
              recommendation={result.recommendation}
              accountSize={watch("accountSize") || 50000}
            />
            <ScenarioAnalysis strategies={result.strategies} result={result} />
          </div>

          {/* Greeks Dashboard */}
          <GreeksDashboard strategies={result.strategies} recommendation={result.recommendation} />

          {/* Methodology panel */}
          <Collapsible open={showMethodology} onOpenChange={setShowMethodology}>
            <Card className="border-border/50 bg-card">
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/20 transition-colors rounded-t-lg pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Info className="h-4 w-4 text-primary" />
                      Scoring Methodology
                    </CardTitle>
                    {showMethodology ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                    Each strategy is scored across seven independent dimensions totaling 100 points.
                    The strategy with the highest composite score becomes the primary recommendation.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      { name: "POP", max: 20, desc: "Probability of profit derived from absolute delta. Higher POP = higher score." },
                      { name: "Liquidity", max: 20, desc: "Composite of bid/ask spread tightness (0–10) and open interest depth (0–10)." },
                      { name: "Risk Definition", max: 20, desc: "Iron Condor scores 20 (defined risk). Naked Call scores 4 (unlimited upside risk)." },
                      { name: "Directional Fit", max: 20, desc: "Alignment between strategy bias and regime signals (RSI, MACD, SMA cross)." },
                      { name: "IV/RV Ratio", max: 20, desc: "Implied vs. realized vol premium. IV/RV > 1.2 indicates rich premium to sell." },
                      { name: "Theta", max: 10, desc: "Daily theta decay per unit of risk. Higher theta = faster premium erosion." },
                      { name: "Vega", max: 10, desc: "Inverse vega exposure. Lower net vega = less sensitivity to IV changes." },
                    ].map(d => (
                      <div key={d.name} className="flex gap-3 p-3 rounded-lg bg-muted/20 border border-border/30">
                        <div className="shrink-0">
                          <span className="text-xs font-bold text-primary">{d.name}</span>
                          <span className="text-xs text-muted-foreground ml-1">/{d.max}pts</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{d.desc}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 p-3 rounded-lg border border-amber-200 bg-amber-50">
                    <p className="text-xs text-amber-800 leading-relaxed">
                      <span className="font-semibold text-amber-900">Model Assumptions:</span>{" "}
                      Black-Scholes pricing with constant volatility. Risk-free rate fixed at 4.5%. Greeks computed at time of analysis.
                      POP derived from delta (not Monte Carlo). Liquidity scores use reported bid/ask and open interest.
                      IVR compares current median IV against 252-day rolling IV estimates.
                      This model does not account for early assignment, dividends, borrow costs, or commissions.
                    </p>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </div>
      )}

      {/* Empty state */}
      {!result && !runMutation.isPending && (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <BarChart2 className="h-8 w-8 text-primary/60" />
          </div>
          <div>
            <p className="text-base font-medium text-foreground">Enter a ticker to begin analysis</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              The model will fetch live market data, compute Greeks and regime indicators,
              score all 13 strategies (credit and debit), and recommend the optimal approach for current conditions.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
