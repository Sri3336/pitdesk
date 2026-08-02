/**
 * ConfluencePanel — Unified 4-tier signal synthesis panel
 * Shows: Structural | Directional | Tactical | Event Risk
 * Verdict: ALIGNED | PARTIAL | CONFLICTED
 */
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2,
  XCircle, Clock, RefreshCw, ChevronDown, ChevronUp, Info,
  Zap, BarChart3, Target, Calendar
} from "lucide-react";
import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";

// ── Types (mirrored from backend) ─────────────────────────────────────────────
type TierStatus = "BULLISH" | "BEARISH" | "NEUTRAL" | "N/A";
type Verdict = "ALIGNED" | "PARTIAL" | "CONFLICTED";
type SignalColor = "green" | "yellow" | "red" | "gray";

interface TierSignal {
  name: string;
  value: string;
  status: SignalColor;
}

interface TierResult {
  tier: 1 | 2 | 3 | 4;
  label: string;
  status: TierStatus;
  score: number;
  signals: TierSignal[];
  summary: string;
}

interface ConfluenceResult {
  ticker: string;
  tiers: TierResult[];
  verdict: Verdict;
  verdictScore: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  whatWeLookFor: string;
  whatWeFound: string;
  whatToDo: string;
  suggestedStrategy: string;
  eventRisk: string | null;
  dataAsOf: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIER_ICONS = [Zap, TrendingUp, BarChart3, Calendar];
const TIER_COLORS = ["from-violet-500/10 to-violet-500/5", "from-blue-500/10 to-blue-500/5", "from-emerald-500/10 to-emerald-500/5", "from-amber-500/10 to-amber-500/5"];
const TIER_BORDER = ["border-violet-200", "border-blue-200", "border-emerald-200", "border-amber-200"];
const TIER_ICON_COLOR = ["text-violet-600", "text-blue-600", "text-emerald-600", "text-amber-600"];

function statusIcon(status: TierStatus) {
  if (status === "BULLISH") return <TrendingUp className="w-4 h-4 text-green-600" />;
  if (status === "BEARISH") return <TrendingDown className="w-4 h-4 text-red-500" />;
  if (status === "NEUTRAL") return <Minus className="w-4 h-4 text-yellow-500" />;
  return <Minus className="w-4 h-4 text-gray-400" />;
}

function statusBadge(status: TierStatus) {
  const cls = status === "BULLISH" ? "bg-green-100 text-green-700 border-green-200"
    : status === "BEARISH" ? "bg-red-100 text-red-700 border-red-200"
    : status === "NEUTRAL" ? "bg-yellow-100 text-yellow-700 border-yellow-200"
    : "bg-gray-100 text-gray-500 border-gray-200";
  return <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border", cls)}>{status}</span>;
}

function signalDot(color: SignalColor) {
  const cls = color === "green" ? "bg-green-500"
    : color === "red" ? "bg-red-500"
    : color === "yellow" ? "bg-yellow-400"
    : "bg-gray-300";
  return <span className={cn("inline-block w-2 h-2 rounded-full flex-shrink-0 mt-1", cls)} />;
}

function verdictConfig(verdict: Verdict) {
  if (verdict === "ALIGNED") return {
    icon: <CheckCircle2 className="w-5 h-5" />,
    label: "ALIGNED",
    cls: "bg-green-50 border-green-300 text-green-800",
    badgeCls: "bg-green-600 text-white",
    barCls: "bg-green-500",
  };
  if (verdict === "PARTIAL") return {
    icon: <AlertTriangle className="w-5 h-5" />,
    label: "PARTIAL",
    cls: "bg-yellow-50 border-yellow-300 text-yellow-800",
    badgeCls: "bg-yellow-500 text-white",
    barCls: "bg-yellow-400",
  };
  return {
    icon: <XCircle className="w-5 h-5" />,
    label: "CONFLICTED",
    cls: "bg-red-50 border-red-300 text-red-800",
    badgeCls: "bg-red-500 text-white",
    barCls: "bg-red-400",
  };
}

function confidenceBadge(confidence: "HIGH" | "MEDIUM" | "LOW") {
  const cls = confidence === "HIGH" ? "bg-green-100 text-green-700 border-green-200"
    : confidence === "MEDIUM" ? "bg-yellow-100 text-yellow-700 border-yellow-200"
    : "bg-gray-100 text-gray-500 border-gray-200";
  return <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border", cls)}>{confidence}</span>;
}

// ── Score Bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ score, max = 8, barCls }: { score: number; max?: number; barCls: string }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-2 flex-1 rounded-sm transition-all duration-300",
            i < score ? barCls : "bg-gray-200"
          )}
        />
      ))}
    </div>
  );
}

// ── Tier Card ─────────────────────────────────────────────────────────────────
function TierCard({ tier, expanded, onToggle }: { tier: TierResult; expanded: boolean; onToggle: () => void }) {
  const idx = tier.tier - 1;
  const Icon = TIER_ICONS[idx];
  const scoreBarCls = tier.status === "BULLISH" ? "bg-green-500" : tier.status === "BEARISH" ? "bg-red-400" : "bg-yellow-400";

  return (
    <div className={cn("rounded-xl border bg-gradient-to-br", TIER_COLORS[idx], TIER_BORDER[idx], "overflow-hidden")}>
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-black/5 transition-colors text-left"
      >
        <Icon className={cn("w-4 h-4 flex-shrink-0", TIER_ICON_COLOR[idx])} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Tier {tier.tier}</span>
            <span className="text-sm font-semibold text-gray-800">{tier.label}</span>
          </div>
          {/* Mini score dots */}
          <div className="flex gap-0.5 mt-1">
            {[0, 1, 2].map(i => (
              <div key={i} className={cn("w-3 h-1.5 rounded-sm", i < tier.score ? scoreBarCls : "bg-gray-200")} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {statusBadge(tier.status)}
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-black/5 pt-3 space-y-3">
          {/* Signals */}
          <div className="space-y-2">
            {tier.signals.map((sig, i) => (
              <div key={i} className="flex items-start gap-2">
                {signalDot(sig.status)}
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-gray-500 font-medium">{sig.name}</span>
                  <span className="mx-1.5 text-gray-300">›</span>
                  <span className={cn("text-xs font-semibold",
                    sig.status === "green" ? "text-green-700"
                    : sig.status === "red" ? "text-red-600"
                    : sig.status === "yellow" ? "text-yellow-700"
                    : "text-gray-500"
                  )}>{sig.value}</span>
                </div>
              </div>
            ))}
          </div>
          {/* Summary */}
          <p className="text-xs text-gray-600 leading-relaxed bg-white/60 rounded-lg px-3 py-2 border border-black/5">
            {tier.summary}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
interface ConfluencePanelProps {
  ticker: string;
}

export function ConfluencePanel({ ticker }: ConfluencePanelProps) {
  const [expandedTiers, setExpandedTiers] = useState<Set<number>>(new Set([1, 2]));
  const [showNarrative, setShowNarrative] = useState(true);

  const { data, isLoading, error, refetch, isFetching } = trpc.confluence.getConfluence.useQuery(
    { ticker },
    { enabled: !!ticker, staleTime: 2 * 60 * 1000 }
  );

  const toggleTier = useCallback((tier: number) => {
    setExpandedTiers(prev => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier); else next.add(tier);
      return next;
    });
  }, []);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3 animate-pulse">
        <div className="h-6 bg-gray-100 rounded w-48" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl" />)}
        </div>
        <div className="h-24 bg-gray-100 rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-red-700">Confluence data unavailable</p>
          <p className="text-xs text-red-500 mt-0.5">{error?.message ?? "Unable to fetch signal data"}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="ml-auto">Retry</Button>
      </div>
    );
  }

  const vc = verdictConfig(data.verdict);
  const lastUpdated = new Date(data.dataAsOf).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* ── Header ── */}
      <div className={cn("px-5 py-4 border-b flex items-center gap-3", vc.cls)}>
        <div className="flex items-center gap-2 flex-1">
          <span className={cn("flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold", vc.badgeCls)}>
            {vc.icon}
            {vc.label}
          </span>
          <span className="text-sm font-semibold text-gray-700">
            Signal Score: {data.verdictScore} / 8
          </span>
          <div className="w-24 hidden sm:block">
            <ScoreBar score={data.verdictScore} max={8} barCls={vc.barCls} />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {confidenceBadge(data.confidence)}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="p-1.5 rounded-lg hover:bg-black/10 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn("w-3.5 h-3.5 text-current", isFetching && "animate-spin")} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Refresh signals</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* ── Event Risk Banner ── */}
        {data.eventRisk && (
          <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs font-semibold text-orange-700">{data.eventRisk}</p>
          </div>
        )}

        {/* ── 4-Tier Grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.tiers.map(tier => (
            <TierCard
              key={tier.tier}
              tier={tier}
              expanded={expandedTiers.has(tier.tier)}
              onToggle={() => toggleTier(tier.tier)}
            />
          ))}
        </div>

        {/* ── Plain-English Narrative ── */}
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => setShowNarrative(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-semibold text-gray-700">Plain-English Summary</span>
            </div>
            {showNarrative ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>

          {showNarrative && (
            <div className="p-4 space-y-3 bg-white">
              {/* What we found */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">What We Found</p>
                <p className="text-sm text-gray-700 leading-relaxed">{data.whatWeFound}</p>
              </div>

              {/* What to do */}
              <div className={cn("rounded-lg px-4 py-3 border",
                data.verdict === "ALIGNED" ? "bg-green-50 border-green-200"
                : data.verdict === "PARTIAL" ? "bg-yellow-50 border-yellow-200"
                : "bg-gray-50 border-gray-200"
              )}>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">What To Do</p>
                <p className={cn("text-sm font-semibold leading-relaxed",
                  data.verdict === "ALIGNED" ? "text-green-800"
                  : data.verdict === "PARTIAL" ? "text-yellow-800"
                  : "text-gray-700"
                )}>{data.whatToDo}</p>
              </div>

              {/* Suggested strategy pill */}
              <div className="flex items-center gap-2 flex-wrap">
                <Target className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-xs text-gray-500">Suggested:</span>
                <span className="text-xs font-bold text-gray-800 bg-gray-100 px-2.5 py-1 rounded-full border border-gray-200">
                  {data.suggestedStrategy}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>Updated {lastUpdated}</span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="flex items-center gap-1 hover:text-gray-600 transition-colors">
                <Info className="w-3 h-3" />
                <span>How scoring works</span>
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              <p className="font-semibold mb-1">4-Tier Confluence Scoring (0–8)</p>
              <p>Tier 1 Structural (CTA+COT): 0–2 pts</p>
              <p>Tier 2 Directional (Trend+PCR): 0–2 pts</p>
              <p>Tier 3 Tactical (Vol+VWAP+IVR): 0–2 pts</p>
              <p>Tier 4 Event Risk: 0–2 pts</p>
              <p className="mt-1 text-gray-300">≥6 = ALIGNED · 3–5 = PARTIAL · &lt;3 = CONFLICTED</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
