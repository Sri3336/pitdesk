/**
 * Nour Method Scanner
 *
 * Based on the "Titans of Tomorrow" interview with Nour Trades.
 * Strategy: IV Compression + Consolidation Breakout + Relative Strength vs QQQ
 *
 * Nour's core rules:
 * 1. Never trade inside a consolidation range — wait for the break
 * 2. Wait for retest of breakout level before entering
 * 3. Confirm with tape: volume surge (2.5×+) + buyers hitting ask
 * 4. IV compression = cheap options before the breakout
 * 5. Relative strength vs QQQ = find the strongest candidates
 * 6. Exit when tape shows exhaustion, not at a fixed R:R
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Zap,
  Volume2,
  BarChart2,
  Target,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  AlertCircle,
  BookOpen,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import type { NourSignal, NourSetupPhase, TapeChecklist } from "../../../server/routers/nourScanner";

// ─── Phase config ─────────────────────────────────────────────────────────────

const PHASE_CONFIG: Record<NourSetupPhase, {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
  priority: number;
}> = {
  BREAKOUT_NOW: {
    label: "🚨 BREAKOUT NOW",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/40",
    icon: <Zap className="h-4 w-4 text-red-400" />,
    priority: 4,
  },
  RETEST_ENTRY: {
    label: "✅ RETEST ENTRY",
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/40",
    icon: <Target className="h-4 w-4 text-green-400" />,
    priority: 3,
  },
  CONSOLIDATING: {
    label: "⏳ CONSOLIDATING",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/40",
    icon: <BarChart2 className="h-4 w-4 text-yellow-400" />,
    priority: 2,
  },
  WATCH: {
    label: "👀 WATCH",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/40",
    icon: <AlertCircle className="h-4 w-4 text-blue-400" />,
    priority: 1,
  },
  NO_SETUP: {
    label: "—",
    color: "text-muted-foreground",
    bg: "bg-muted/20",
    border: "border-border",
    icon: null,
    priority: 0,
  },
};

// ─── Tape Checklist Item ──────────────────────────────────────────────────────

function TapeItem({
  label,
  value,
  passed,
  detail,
}: {
  label: string;
  value: string;
  passed: boolean;
  detail?: string;
}) {
  return (
    <div className="flex items-start gap-2 py-1">
      {passed ? (
        <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm ${passed ? "text-foreground" : "text-muted-foreground"}`}>
            {label}
          </span>
          <span className={`text-xs font-mono font-semibold ${passed ? "text-green-400" : "text-muted-foreground"}`}>
            {value}
          </span>
        </div>
        {detail && (
          <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
        )}
      </div>
    </div>
  );
}

// ─── Signal Card ──────────────────────────────────────────────────────────────

function SignalCard({ signal }: { signal: NourSignal }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = PHASE_CONFIG[signal.phase];
  const tape = signal.tape;
  const checksPassed = [
    tape.ivCompressed,
    tape.rangeTightening,
    tape.relativeStrength,
    tape.volumeSurge,
    tape.breakoutConfirmed || tape.retestOpportunity,
  ].filter(Boolean).length;

  const isPositiveDay = signal.dayChangePct >= 0;

  return (
    <Card className={`border ${cfg.border} ${cfg.bg} transition-all duration-200`}>
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold font-mono">{signal.ticker}</span>
                <Badge variant="outline" className={`text-xs ${cfg.color} border-current`}>
                  {cfg.label}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-sm font-mono text-foreground">
                  ${signal.currentPrice.toFixed(2)}
                </span>
                <span className={`text-xs font-mono flex items-center gap-0.5 ${isPositiveDay ? "text-green-400" : "text-red-400"}`}>
                  {isPositiveDay ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {isPositiveDay ? "+" : ""}{signal.dayChangePct.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          {/* Score + checks */}
          <div className="text-right">
            <div className={`text-2xl font-bold font-mono ${cfg.color}`}>
              {signal.score}
            </div>
            <div className="text-xs text-muted-foreground">{checksPassed}/5 checks</div>
          </div>
        </div>

        {/* Setup note */}
        <p className="text-sm mt-3 text-foreground/80 leading-relaxed">
          {signal.setupNote}
        </p>

        {/* Consolidation zone bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Consolidation Zone</span>
            <span className="font-mono">${signal.zone.low.toFixed(2)} – ${signal.zone.high.toFixed(2)} ({signal.zone.widthPct.toFixed(1)}% wide)</span>
          </div>
          <div className="relative h-2 bg-muted rounded-full overflow-hidden">
            {/* Zone bar */}
            <div
              className="absolute h-full bg-yellow-500/30 rounded-full"
              style={{ left: "10%", right: "10%" }}
            />
            {/* Current price indicator */}
            {(() => {
              const range = signal.zone.high - signal.zone.low;
              const pct = range > 0
                ? Math.max(0, Math.min(100, ((signal.currentPrice - signal.zone.low) / range) * 80 + 10))
                : 50;
              return (
                <div
                  className={`absolute top-0 w-1 h-full rounded-full ${signal.tape.breakoutConfirmed ? "bg-green-400" : "bg-white"}`}
                  style={{ left: `${pct}%` }}
                />
              );
            })()}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
            <span>Zone Low</span>
            {signal.tape.breakoutConfirmed && (
              <span className="text-green-400 font-semibold">ABOVE ZONE ↑</span>
            )}
            {signal.tape.retestOpportunity && (
              <span className="text-yellow-400 font-semibold">RETEST ZONE</span>
            )}
            <span>Zone High</span>
          </div>
        </div>

        {/* Expand button */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-3 h-7 text-xs text-muted-foreground"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
          {expanded ? "Hide" : "Show"} Tape Checklist & Options Play
        </Button>

        {/* Expanded details */}
        {expanded && (
          <div className="mt-3 space-y-4">
            <Separator />

            {/* Tape Checklist */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Tape Checklist (Nour's 5 Gates)
              </h4>
              <div className="space-y-0.5">
                <TapeItem
                  label="IV Compression"
                  value={tape.ivCompressed ? `${tape.ivCompressionPct.toFixed(0)}% below avg` : `${tape.ivCompressionPct.toFixed(0)}% (need 10%+)`}
                  passed={tape.ivCompressed}
                  detail="HV below 20-day avg → options are cheap pre-breakout"
                />
                <TapeItem
                  label="Range Tightening"
                  value={tape.rangeTightening ? `ATR ${tape.rangeTightnessPct.toFixed(0)}% contracted` : `${tape.rangeTightnessPct.toFixed(0)}% (need 15%+)`}
                  passed={tape.rangeTightening}
                  detail="ATR contracting vs 20-day avg → price coiling"
                />
                <TapeItem
                  label="Relative Strength vs QQQ"
                  value={`RS5d: ${tape.rsScore5d > 0 ? "+" : ""}${tape.rsScore5d.toFixed(1)}% | RS10d: ${tape.rsScore10d > 0 ? "+" : ""}${tape.rsScore10d.toFixed(1)}%`}
                  passed={tape.relativeStrength}
                  detail="Nour: only trade the strongest names vs QQQ"
                />
                <TapeItem
                  label="Volume Surge"
                  value={tape.volumeSurge ? `${tape.volumeSurgeMultiple.toFixed(1)}× avg volume` : `${tape.volumeSurgeMultiple.toFixed(1)}× (need 2.5×+)`}
                  passed={tape.volumeSurge}
                  detail="Breakout candle needs 2.5× 10-day avg volume"
                />
                <TapeItem
                  label="Breakout / Retest"
                  value={tape.breakoutConfirmed ? "Above zone high ✓" : tape.retestOpportunity ? "Retesting zone high" : `Below $${signal.zone.high.toFixed(2)}`}
                  passed={tape.breakoutConfirmed || tape.retestOpportunity}
                  detail={tape.retestOpportunity ? "Ideal Nour entry: retest of breakout level" : "Wait for close above zone high with volume"}
                />
              </div>
            </div>

            {/* Volume & ATR stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-muted/30 rounded-lg p-2 text-center">
                <div className="text-xs text-muted-foreground">ATR-14</div>
                <div className="text-sm font-mono font-semibold">${signal.atr14.toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">avg ${signal.atr14Avg20.toFixed(2)}</div>
              </div>
              <div className="bg-muted/30 rounded-lg p-2 text-center">
                <div className="text-xs text-muted-foreground">Volume</div>
                <div className="text-sm font-mono font-semibold">
                  {signal.latestVolume > 1_000_000
                    ? `${(signal.latestVolume / 1_000_000).toFixed(1)}M`
                    : `${(signal.latestVolume / 1_000).toFixed(0)}K`}
                </div>
                <div className="text-xs text-muted-foreground">
                  avg {signal.avgVolume10d > 1_000_000
                    ? `${(signal.avgVolume10d / 1_000_000).toFixed(1)}M`
                    : `${(signal.avgVolume10d / 1_000).toFixed(0)}K`}
                </div>
              </div>
              <div className="bg-muted/30 rounded-lg p-2 text-center">
                <div className="text-xs text-muted-foreground">RS vs QQQ</div>
                <div className={`text-sm font-mono font-semibold ${tape.rsScore5d > 0 ? "text-green-400" : "text-red-400"}`}>
                  {tape.rsScore5d > 0 ? "+" : ""}{tape.rsScore5d.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">5-day</div>
              </div>
            </div>

            {/* Options Play */}
            {signal.optionsPlay && (
              <div className={`rounded-lg p-3 border ${signal.optionsPlay.type === "CALL" ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"}`}>
                <div className="flex items-center gap-2 mb-2">
                  {signal.optionsPlay.type === "CALL" ? (
                    <TrendingUp className="h-4 w-4 text-green-400" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-400" />
                  )}
                  <span className={`text-sm font-semibold ${signal.optionsPlay.type === "CALL" ? "text-green-400" : "text-red-400"}`}>
                    Options Play: Buy {signal.optionsPlay.type} ~${signal.optionsPlay.atmStrike} ({signal.optionsPlay.suggestedDTE} DTE)
                  </span>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p><span className="text-foreground/70">Rationale:</span> {signal.optionsPlay.rationale}</p>
                  <p><span className="text-foreground/70">Entry:</span> {signal.optionsPlay.entryTiming}</p>
                  <p><span className="text-foreground/70">Stop:</span> {signal.optionsPlay.stopNote}</p>
                  <p><span className="text-foreground/70">Target:</span> {signal.optionsPlay.targetNote}</p>
                  <p className="mt-1 italic">{signal.optionsPlay.ivNote}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Relative Strength Table ──────────────────────────────────────────────────

function RelativeStrengthTab() {
  const [period, setPeriod] = useState<"5d" | "10d" | "20d">("5d");
  const { data, isLoading, refetch } = trpc.nourScanner.relativeStrengthRanking.useQuery({ period });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Relative Strength vs QQQ</h3>
          <p className="text-sm text-muted-foreground">
            Nour's rule: only trade names that are outperforming QQQ. Leaders go up more, fall less.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(["5d", "10d", "20d"] as const).map(p => (
            <Button
              key={p}
              variant={period === p ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriod(p)}
            >
              {p}
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Calculating relative strength...</div>
      ) : data ? (
        <div className="space-y-2">
          {/* QQQ baseline */}
          <div className="flex items-center gap-3 px-3 py-2 bg-muted/30 rounded-lg text-sm">
            <span className="font-mono font-bold w-16">QQQ</span>
            <span className="text-muted-foreground text-xs">Benchmark</span>
            <span className="ml-auto font-mono text-xs">
              {data.qqqChangePct > 0 ? "+" : ""}{data.qqqChangePct.toFixed(2)}%
            </span>
            <span className="text-xs text-muted-foreground w-16 text-right">RS: 0.00%</span>
          </div>

          {data.rankings.map((r, i) => (
            <div
              key={r.ticker}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm border ${
                r.isLeader ? "border-green-500/20 bg-green-500/5" : "border-border bg-muted/10"
              }`}
            >
              <span className="text-muted-foreground text-xs w-5">{i + 1}</span>
              <span className="font-mono font-bold w-16">{r.ticker}</span>
              <div className="flex-1">
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${r.isLeader ? "bg-green-400" : "bg-red-400"}`}
                    style={{ width: `${Math.min(100, Math.abs(r.rsScore) * 5 + 20)}%` }}
                  />
                </div>
              </div>
              <span className={`font-mono text-xs w-20 text-right ${r.changePct >= 0 ? "text-green-400" : "text-red-400"}`}>
                {r.changePct > 0 ? "+" : ""}{r.changePct.toFixed(2)}%
              </span>
              <span className={`font-mono text-xs font-semibold w-20 text-right ${r.isLeader ? "text-green-400" : "text-red-400"}`}>
                RS: {r.rsScore > 0 ? "+" : ""}{r.rsScore.toFixed(2)}%
              </span>
              {r.isLeader && (
                <Badge variant="outline" className="text-green-400 border-green-500/30 text-xs">
                  LEADER
                </Badge>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─── Learn Mode ──────────────────────────────────────────────────────────────

function LearnMode() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-lg">The Nour Method — Plain English</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        From the "Titans of Tomorrow" podcast. Nour went from 10 trades/day to 1 high-quality setup per day — and made millions doing it.
      </p>

      <div className="space-y-4">
        {[
          {
            step: "1",
            title: "Find the Consolidation",
            color: "text-yellow-400",
            bg: "bg-yellow-500/10",
            border: "border-yellow-500/20",
            body: "Look for a stock that's been stuck in a tight range for 5–15 days. During this time, IV drops (options get cheap) and ATR contracts. This is the coiling phase. Nour abandoned chart patterns (H&S, flags) because they explain shapes, not mechanics.",
          },
          {
            step: "2",
            title: "Check Relative Strength vs QQQ",
            color: "text-blue-400",
            bg: "bg-blue-500/10",
            border: "border-blue-500/20",
            body: "Only trade names outperforming QQQ. If NVDA is up 3% while QQQ is up 1%, NVDA has +2% RS. Leaders go up more and fall less. This is your sector filter — skip the laggards.",
          },
          {
            step: "3",
            title: "Wait for the Breakout",
            color: "text-orange-400",
            bg: "bg-orange-500/10",
            border: "border-orange-500/20",
            body: "Never trade inside the range. Wait for price to close ABOVE the consolidation high with a volume surge (2.5×+ the 10-day average). The volume surge confirms real buyers — not just stop-loss triggers. When IV was compressed, the breakout causes an IV spike that makes your options explode in value.",
          },
          {
            step: "4",
            title: "Wait for the Retest (Ideal Entry)",
            color: "text-green-400",
            bg: "bg-green-500/10",
            border: "border-green-500/20",
            body: "After the initial breakout surge, price often pulls back to retest the breakout level. This is Nour's ideal entry — the risk is defined (stop below the zone), and you're buying after confirmation. Confirm with tape: look for buyers aggressively hitting the ask on the retest.",
          },
          {
            step: "5",
            title: "Read the Tape for Exit",
            color: "text-purple-400",
            bg: "bg-purple-500/10",
            border: "border-purple-500/20",
            body: "Don't use a fixed R:R target. Exit when the tape shows exhaustion: volume drying up, buyers no longer hitting the ask, sellers stepping in at lower prices. Nour uses Level 2, Time & Sales, and options volume to read this in real time.",
          },
        ].map(item => (
          <div key={item.step} className={`rounded-lg p-4 border ${item.bg} ${item.border}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${item.bg} ${item.color} border ${item.border}`}>
                {item.step}
              </div>
              <h4 className={`font-semibold ${item.color}`}>{item.title}</h4>
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed">{item.body}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg p-4 bg-muted/30 border border-border">
        <h4 className="font-semibold mb-2 text-sm">Nour's Key Insight on IV</h4>
        <p className="text-sm text-muted-foreground">
          "During consolidation, IV drops because there's no movement — options get cheap. Then when the breakout happens, IV spikes back up. You get the directional move <em>and</em> the IV expansion. That's why buying options before a breakout (not during) is so powerful."
        </p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NourScanner() {
  const [tab, setTab] = useState("scanner");
  const [minPhase, setMinPhase] = useState<NourSetupPhase>("WATCH");
  const [learnMode, setLearnMode] = useState(false);

  const { data, isLoading, refetch, dataUpdatedAt } = trpc.nourScanner.scan.useQuery(
    { minPhase },
    { staleTime: 5 * 60 * 1000 }
  );

  const phaseFilters: { value: NourSetupPhase; label: string }[] = [
    { value: "BREAKOUT_NOW", label: "🚨 Breakout" },
    { value: "RETEST_ENTRY", label: "✅ Retest" },
    { value: "CONSOLIDATING", label: "⏳ Consolidating" },
    { value: "WATCH", label: "👀 All Setups" },
  ];

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : null;

  const summary = data?.summary;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Nour Method Scanner</h1>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            IV Compression + Consolidation Breakout + Relative Strength vs QQQ
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Based on Nour Trades' strategy from the "Titans of Tomorrow" podcast
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLearnMode(!learnMode)}
          >
            <BookOpen className="h-3 w-3 mr-1" />
            {learnMode ? "Hide" : "Learn"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${isLoading ? "animate-spin" : ""}`} />
            Scan
          </Button>
        </div>
      </div>

      {/* Learn Mode */}
      {learnMode && (
        <Card>
          <CardContent className="p-6">
            <LearnMode />
          </CardContent>
        </Card>
      )}

      {/* Summary bar */}
      {summary && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Breakout Now", value: summary.breakoutCount, color: "text-red-400", bg: "bg-red-500/10" },
            { label: "Retest Entry", value: summary.retestCount, color: "text-green-400", bg: "bg-green-500/10" },
            { label: "Consolidating", value: summary.consolidatingCount, color: "text-yellow-400", bg: "bg-yellow-500/10" },
            { label: "Watch", value: summary.watchCount, color: "text-blue-400", bg: "bg-blue-500/10" },
          ].map(item => (
            <div key={item.label} className={`rounded-lg p-3 ${item.bg} text-center`}>
              <div className={`text-2xl font-bold font-mono ${item.color}`}>{item.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{item.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="scanner">Scanner</TabsTrigger>
            <TabsTrigger value="rs">Relative Strength</TabsTrigger>
          </TabsList>

          {tab === "scanner" && (
            <div className="flex items-center gap-1">
              {phaseFilters.map(f => (
                <Button
                  key={f.value}
                  variant={minPhase === f.value ? "default" : "outline"}
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setMinPhase(f.value)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          )}
        </div>

        <TabsContent value="scanner" className="mt-4">
          {isLoading ? (
            <div className="text-center py-16 text-muted-foreground">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3 opacity-40" />
              <p>Scanning for IV compression + consolidation setups...</p>
              <p className="text-xs mt-1">Fetching price history + QQQ relative strength for all tickers</p>
            </div>
          ) : data?.signals && data.signals.length > 0 ? (
            <div className="space-y-3">
              {lastUpdated && (
                <p className="text-xs text-muted-foreground">
                  Last scanned: {lastUpdated} · {data.scannedCount} tickers · {data.signalCount} setups found
                </p>
              )}
              {data.signals.map(signal => (
                <SignalCard key={signal.ticker} signal={signal} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <BarChart2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No setups found</p>
              <p className="text-sm mt-1">
                {data?.scannedCount
                  ? `Scanned ${data.scannedCount} tickers — no ${minPhase.replace("_", " ").toLowerCase()} setups right now.`
                  : "Click Scan to run the scanner."}
              </p>
              <p className="text-xs mt-2">Try lowering the filter to "All Setups" to see more.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="rs" className="mt-4">
          <RelativeStrengthTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
