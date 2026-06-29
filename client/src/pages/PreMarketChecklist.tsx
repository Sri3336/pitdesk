/**
 * Pre-Market Checklist — Live Intelligence Dashboard
 *
 * 8 items, each auto-populated from real data:
 *  1. VIX Level          — live Tradier quote + color-coded rule
 *  2. SPY/QQQ Bias       — pre-market % change + direction arrow
 *  3. Top Gappers        — live gap-up/down tickers with % and click-to-trade
 *  4. Account P&L Gate   — today's & week's realized P&L vs daily limit
 *  5. Swing Watchlist    — active setups with day counter
 *  6. Risk Sizing        — auto-calculated from capital settings
 *  7. Liquidity Zones    — active zones within 1.5% of current price
 *  8. Mindset Check      — 1–5 scale logged over time
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart2,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  Clock,
  DollarSign,
  Eye,
  Flame,
  Loader2,
  MapPin,
  RefreshCw,
  Shield,
  Smile,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useLocation } from "wouter";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChecklistItem {
  id: number;
  itemKey: string;
  label: string;
  completed: boolean;
  completedAt: Date | string | null;
  mindsetScore?: number | null;
}

interface IntelData {
  vix: { price: number; label: "calm" | "elevated" | "danger" | "unknown"; changePercent: number };
  spy: { price: number; changePercent: number; preMarketBias: "bullish" | "bearish" | "neutral" };
  qqq: { price: number; changePercent: number; preMarketBias: "bullish" | "bearish" | "neutral" };
  gappers: Array<{ ticker: string; changePercent: number; direction: "up" | "down"; price: number }>;
  accountPnl: { todayPnl: number; weekPnl: number; totalTrades: number; todayTrades: number };
  riskSizing: { capital: number; riskPct: number; riskPerTrade: number; maxTrades: number; totalExposure: number };
  activeSwings: Array<{ id: number; ticker: string; setupType: string; entryPrice: number; stopPrice: number; dayCount: number; direction: string }>;
  nearZones: Array<{ ticker: string; zoneType: string; priceLevel: number; distancePct: number }>;
  portfolioSummary: { totalMarketValue: number; totalUnrealizedPnl: number; positionCount: number };
  fetchedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  const abs = Math.abs(n);
  const s = abs >= 1000 ? `$${(abs / 1000).toFixed(1)}k` : `$${abs.toFixed(0)}`;
  return n < 0 ? `-${s}` : `+${s}`;
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function IntelSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-8 rounded bg-muted" />
      <div className="h-5 rounded bg-muted w-3/4" />
    </div>
  );
}

// ─── Intel panels ─────────────────────────────────────────────────────────────

// IntelData is defined above as an explicit interface

function VixPanel({ intel }: { intel?: IntelData }) {
  if (!intel) return <IntelSkeleton />;
  const { vix } = intel;
  const color = vix.label === "calm" ? "text-green-600" : vix.label === "elevated" ? "text-amber-600" : "text-red-600";
  const bg = vix.label === "calm" ? "bg-green-50 border-green-200" : vix.label === "elevated" ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";
  const rule = vix.label === "calm"
    ? "Normal size — full ORB rules apply"
    : vix.label === "elevated"
    ? "Reduce size 50% — widen stops slightly"
    : "⚠ Skip ORB today — VIX > 25, too volatile";
  return (
    <div className={cn("rounded-lg border p-3 space-y-1.5", bg)}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">VIX</span>
        <span className={cn("text-2xl font-bold tabular-nums", color)}>
          {vix.price > 0 ? vix.price.toFixed(2) : "—"}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {vix.changePercent !== 0 && (
          <span className={cn("text-xs font-medium", vix.changePercent > 0 ? "text-red-600" : "text-green-600")}>
            {fmtPct(vix.changePercent)}
          </span>
        )}
        <Badge variant="outline" className={cn("text-xs capitalize", color)}>{vix.label}</Badge>
      </div>
      <p className="text-xs font-medium">{rule}</p>
    </div>
  );
}

function SpyQqqPanel({ intel }: { intel?: IntelData }) {
  if (!intel) return <IntelSkeleton />;
  const { spy, qqq } = intel;
  const biasColor = (bias: string) =>
    bias === "bullish" ? "text-green-600" : bias === "bearish" ? "text-red-600" : "text-muted-foreground";
  const BiasIcon = ({ bias }: { bias: string }) =>
    bias === "bullish" ? <TrendingUp className="h-3.5 w-3.5" /> : bias === "bearish" ? <TrendingDown className="h-3.5 w-3.5" /> : <Activity className="h-3.5 w-3.5" />;
  return (
    <div className="grid grid-cols-2 gap-2">
      {[{ sym: "SPY", q: spy }, { sym: "QQQ", q: qqq }].map(({ sym, q }) => (
        <div key={sym} className="rounded-lg border bg-muted/30 p-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">{sym}</span>
            <span className={cn("flex items-center gap-0.5 text-xs font-medium", biasColor(q.preMarketBias))}>
              <BiasIcon bias={q.preMarketBias} />
              {q.preMarketBias}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold tabular-nums">{q.price > 0 ? `$${q.price.toFixed(2)}` : "—"}</span>
            <span className={cn("text-xs", q.changePercent >= 0 ? "text-green-600" : "text-red-600")}>
              {q.price > 0 ? fmtPct(q.changePercent) : ""}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function GappersPanel({ intel }: { intel?: IntelData }) {
  const [, navigate] = useLocation();
  if (!intel) return <IntelSkeleton />;
  const { gappers } = intel;
  if (gappers.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No significant gappers (≥1%) detected right now</p>;
  }
  const ups = gappers.filter(g => g.direction === "up").slice(0, 5);
  const downs = gappers.filter(g => g.direction === "down").slice(0, 5);
  return (
    <div className="space-y-2">
      {ups.length > 0 && (
        <div>
          <p className="text-xs text-green-700 font-semibold mb-1.5 flex items-center gap-1"><ArrowUp className="h-3 w-3" /> Gap Up</p>
          <div className="flex flex-wrap gap-1.5">
            {ups.map(g => (
              <button
                key={g.ticker}
                onClick={() => navigate(`${ROUTES.MORNING_SESSION}?ticker=${g.ticker}`)}
                className="flex items-center gap-1 rounded-md bg-green-50 border border-green-200 px-2 py-1 text-xs font-semibold text-green-800 hover:bg-green-100 transition-colors"
                title={`$${g.price.toFixed(2)} — click to open in Morning Session`}
              >
                {g.ticker}
                <span className="text-green-600">{fmtPct(g.changePercent)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {downs.length > 0 && (
        <div>
          <p className="text-xs text-red-700 font-semibold mb-1.5 flex items-center gap-1"><ArrowDown className="h-3 w-3" /> Gap Down</p>
          <div className="flex flex-wrap gap-1.5">
            {downs.map(g => (
              <button
                key={g.ticker}
                onClick={() => navigate(`${ROUTES.MORNING_SESSION}?ticker=${g.ticker}`)}
                className="flex items-center gap-1 rounded-md bg-red-50 border border-red-200 px-2 py-1 text-xs font-semibold text-red-800 hover:bg-red-100 transition-colors"
              >
                {g.ticker}
                <span className="text-red-600">{fmtPct(g.changePercent)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AccountPnlPanel({ intel }: { intel?: IntelData }) {
  if (!intel) return <IntelSkeleton />;
  const { accountPnl, riskSizing } = intel;
  const dailyLimit = -(riskSizing.capital * 0.02);
  const pct = dailyLimit !== 0 ? Math.min(100, Math.abs(accountPnl.todayPnl / dailyLimit) * 100) : 0;
  const isWarning = pct >= 80;
  const isHit = accountPnl.todayPnl <= dailyLimit;
  return (
    <div className="space-y-2">
      {isHit && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
          <p className="text-xs font-semibold text-red-700">Daily loss limit hit — do NOT trade today</p>
        </div>
      )}
      {isWarning && !isHit && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-xs font-semibold text-amber-700">Approaching daily limit — reduce size</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border bg-muted/30 p-2.5">
          <p className="text-muted-foreground">Today P&L</p>
          <p className={cn("text-base font-bold tabular-nums mt-0.5", accountPnl.todayPnl >= 0 ? "text-green-600" : "text-red-600")}>
            {accountPnl.todayTrades > 0 ? fmt$(accountPnl.todayPnl) : "No trades yet"}
          </p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-2.5">
          <p className="text-muted-foreground">This Week</p>
          <p className={cn("text-base font-bold tabular-nums mt-0.5", accountPnl.weekPnl >= 0 ? "text-green-600" : "text-red-600")}>
            {accountPnl.totalTrades > 0 ? fmt$(accountPnl.weekPnl) : "No trades yet"}
          </p>
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Daily limit used</span>
          <span className={cn(isWarning ? "text-amber-600 font-semibold" : "")}>{pct.toFixed(0)}%</span>
        </div>
        <Progress value={pct} className={cn("h-2", isHit ? "[&>div]:bg-red-500" : isWarning ? "[&>div]:bg-amber-500" : "[&>div]:bg-green-500")} />
        <p className="text-xs text-muted-foreground">Limit: {fmt$(dailyLimit)} (2% of ${(riskSizing.capital / 1000).toFixed(0)}k)</p>
      </div>
    </div>
  );
}

function SwingWatchlistPanel({ intel }: { intel?: IntelData }) {
  const [, navigate] = useLocation();
  if (!intel) return <IntelSkeleton />;
  const { activeSwings } = intel;
  if (activeSwings.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        <span>No active swing positions — clean slate for today</span>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {activeSwings.map(s => {
        const dayBadge = s.dayCount === 0 ? "D0" : `D${s.dayCount}`;
        const dayColor = s.dayCount <= 1 ? "bg-green-100 text-green-800" : s.dayCount === 2 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800";
        return (
          <div key={s.id} className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold">{s.ticker}</span>
              <Badge variant="outline" className="text-xs">{s.setupType.replace("_", " ")}</Badge>
              <span className={cn("text-xs font-semibold rounded px-1.5 py-0.5", dayColor)}>{dayBadge}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Entry ${Number(s.entryPrice).toFixed(2)}</span>
              <span>Stop ${Number(s.stopPrice).toFixed(2)}</span>
            </div>
          </div>
        );
      })}
      <button onClick={() => navigate(ROUTES.SWING_WATCHLIST)} className="text-xs text-primary hover:underline">
        Open Swing Watchlist →
      </button>
    </div>
  );
}

function RiskSizingPanel({ intel }: { intel?: IntelData }) {
  if (!intel) return <IntelSkeleton />;
  const { riskSizing } = intel;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 text-xs">
        {[
          { label: "Capital", value: `$${(riskSizing.capital / 1000).toFixed(0)}k` },
          { label: "Risk/Trade", value: `$${riskSizing.riskPerTrade.toLocaleString()}` },
          { label: "Risk %", value: `${riskSizing.riskPct}%` },
          { label: "Max Exposure", value: `$${riskSizing.totalExposure.toLocaleString()}` },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border bg-muted/30 p-2.5">
            <p className="text-muted-foreground">{label}</p>
            <p className="text-base font-bold tabular-nums mt-0.5">{value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg border bg-green-50 border-green-200 px-3 py-2">
        <p className="text-xs text-green-800">Max {riskSizing.maxTrades} trades today = <span className="font-bold">${riskSizing.totalExposure.toLocaleString()}</span> total risk</p>
      </div>
    </div>
  );
}

function LiquidityZonesPanel({ intel }: { intel?: IntelData }) {
  const [, navigate] = useLocation();
  if (!intel) return <IntelSkeleton />;
  const { nearZones } = intel;
  if (nearZones.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        <span>No active zones within 1.5% of current price</span>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {nearZones.map((z, i) => (
        <div key={i} className="flex items-center justify-between rounded-lg border bg-amber-50 border-amber-200 px-3 py-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <span className="text-xs font-bold">{z.ticker}</span>
            <Badge variant="outline" className="text-xs capitalize">{z.zoneType.replace("_", " ")}</Badge>
          </div>
          <div className="text-xs text-right">
            <span className="font-semibold">${z.priceLevel.toFixed(2)}</span>
            <span className="text-muted-foreground ml-1">({z.distancePct}% away)</span>
          </div>
        </div>
      ))}
      <button onClick={() => navigate(ROUTES.LIQUIDITY_MAP)} className="text-xs text-primary hover:underline">
        Open Liquidity Map →
      </button>
    </div>
  );
}

function MindsetPanel({ item, onComplete }: { item?: ChecklistItem; onComplete: (score: number) => void }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const scores = [
    { n: 1, label: "Terrible", color: "text-red-600", bg: "bg-red-50 border-red-200 hover:bg-red-100" },
    { n: 2, label: "Off",      color: "text-orange-600", bg: "bg-orange-50 border-orange-200 hover:bg-orange-100" },
    { n: 3, label: "Neutral",  color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200 hover:bg-yellow-100" },
    { n: 4, label: "Good",     color: "text-lime-600",   bg: "bg-lime-50 border-lime-200 hover:bg-lime-100" },
    { n: 5, label: "Peak",     color: "text-green-600",  bg: "bg-green-50 border-green-200 hover:bg-green-100" },
  ];
  if (item?.completed && item.mindsetScore) {
    const s = scores.find(s => s.n === item.mindsetScore);
    return (
      <div className={cn("rounded-lg border px-4 py-3 text-center", s?.bg ?? "bg-muted/30")}>
        <p className={cn("text-2xl font-bold", s?.color)}>{"★".repeat(item.mindsetScore)}{"☆".repeat(5 - item.mindsetScore)}</p>
        <p className={cn("text-sm font-semibold mt-1", s?.color)}>{s?.label} — Logged</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">How are you feeling right now? (1 = terrible, 5 = peak state)</p>
      <div className="flex gap-2">
        {scores.map(s => (
          <button
            key={s.n}
            onClick={() => onComplete(s.n)}
            onMouseEnter={() => setHovered(s.n)}
            onMouseLeave={() => setHovered(null)}
            className={cn(
              "flex-1 rounded-lg border py-3 flex flex-col items-center gap-1 transition-all",
              s.bg,
              hovered === s.n ? "scale-105 shadow-sm" : "",
            )}
          >
            <span className={cn("text-lg font-bold", s.color)}>{s.n}</span>
            <span className={cn("text-xs", s.color)}>{s.label}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground italic">If you score 1 or 2, consider sitting out today. Mindset is 33% of trading.</p>
    </div>
  );
}

// ─── Item config ──────────────────────────────────────────────────────────────

const ITEM_CONFIG: Record<string, { icon: React.ReactNode; title: string; description: string }> = {
  vix_check:        { icon: <Activity className="h-4 w-4" />,    title: "VIX Level",          description: "Volatility gauge — determines position size for today" },
  spy_bias:         { icon: <TrendingUp className="h-4 w-4" />,  title: "SPY / QQQ Bias",     description: "Pre-market direction — sets your long/short bias" },
  gappers:          { icon: <Zap className="h-4 w-4" />,         title: "Top Gappers",         description: "Significant gap-up/down tickers — click to open in Morning Session" },
  account_gate:     { icon: <Shield className="h-4 w-4" />,      title: "Account P&L Gate",    description: "Daily loss limit check — must be green to trade" },
  setups_confirmed: { icon: <Eye className="h-4 w-4" />,         title: "Swing Watchlist",     description: "Active swing positions — confirm still valid after overnight" },
  risk_sizing:      { icon: <DollarSign className="h-4 w-4" />,  title: "Risk Sizing",         description: "Max risk per trade and total exposure for today" },
  liquidity_zones:  { icon: <MapPin className="h-4 w-4" />,      title: "Liquidity Zones",     description: "Active zones within 1.5% of current price — AJ framework" },
  mindset:          { icon: <Brain className="h-4 w-4" />,       title: "Mindset Check",       description: "Rate your mental state 1–5 — logged over time" },
};

// ─── Settings Panel ───────────────────────────────────────────────────────────

function DrawdownSettingsPanel() {
  const settingsQuery = trpc.tradeAnalytics.getDrawdownSettings.useQuery();
  const saveMutation = trpc.tradeAnalytics.saveDrawdownSettings.useMutation({
    onSuccess: () => { toast.success("Settings saved"); settingsQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const [maxDD, setMaxDD] = useState("");
  const [riskPT, setRiskPT] = useState("");
  const [capital, setCapital] = useState("");
  const [open, setOpen] = useState(false);
  const s = settingsQuery.data;
  const currentMaxDD = s ? parseFloat(s.maxDrawdownPct as string) : 20;
  const currentRisk = s ? parseFloat(s.riskPerTradePct as string) : 0.66;
  const currentCap = s ? parseFloat(s.totalCapital as string) : 350000;
  return (
    <Card className="shadow-none border-border">
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-green-500" /> Risk Settings (Rajan Formula)
          </CardTitle>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3 pt-0">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Max Drawdown %</Label>
              <Input type="number" className="h-8 text-sm mt-1" placeholder={String(currentMaxDD)} value={maxDD} onChange={e => setMaxDD(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Risk Per Trade %</Label>
              <Input type="number" step="0.01" className="h-8 text-sm mt-1" placeholder={String(currentRisk)} value={riskPT} onChange={e => setRiskPT(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Total Capital ($)</Label>
              <Input type="number" className="h-8 text-sm mt-1" placeholder={String(currentCap)} value={capital} onChange={e => setCapital(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Formula: {(parseFloat(maxDD || String(currentMaxDD)) / 30).toFixed(2)}% risk/trade = ${((parseFloat(capital || String(currentCap))) * (parseFloat(maxDD || String(currentMaxDD)) / 100) / 30).toFixed(0)} max loss/trade
            </p>
            <Button size="sm" className="h-7 text-xs" onClick={() => {
              const md = parseFloat(maxDD || String(currentMaxDD));
              const rp = parseFloat(riskPT || String(currentRisk));
              const cap = parseFloat(capital || String(currentCap));
              if (isNaN(md) || isNaN(rp) || isNaN(cap)) { toast.error("Invalid values"); return; }
              saveMutation.mutate({ maxDrawdownPct: md, riskPerTradePct: rp, totalCapital: cap });
            }} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}Save
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PreMarketChecklist() {
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const { data: checklist, isLoading: checklistLoading } = trpc.preMarket.todayChecklist.useQuery();
  const { data: intel, isLoading: intelLoading, refetch: refetchIntel } = trpc.preMarket.intel.useQuery(
    undefined,
    { refetchInterval: 60_000, staleTime: 30_000 },
  );
  const { data: history } = trpc.preMarket.history.useQuery({ days: 14 });

  const completeItem = trpc.preMarket.completeItem.useMutation({
    onSuccess: () => utils.preMarket.todayChecklist.invalidate(),
  });
  const uncompleteItem = trpc.preMarket.uncompleteItem.useMutation({
    onSuccess: () => utils.preMarket.todayChecklist.invalidate(),
  });
  const resetDay = trpc.preMarket.resetDay.useMutation({
    onSuccess: () => { utils.preMarket.todayChecklist.invalidate(); toast.success("Checklist reset for today"); },
  });

  const items: ChecklistItem[] = checklist?.items ?? [];
  const completedCount = items.filter(i => i.completed).length;
  const totalCount = items.length || 8;
  const allDone = completedCount === totalCount && totalCount > 0;

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York",
  });

  function handleToggle(item: ChecklistItem) {
    if (!item.id) return;
    if (item.completed) {
      uncompleteItem.mutate({ id: item.id });
    } else if (item.itemKey === "mindset") {
      setExpandedItem(item.itemKey);
    } else {
      completeItem.mutate({ id: item.id });
      toast.success(`✓ ${ITEM_CONFIG[item.itemKey]?.title ?? item.label}`);
    }
  }

  function handleMindsetComplete(item: ChecklistItem, score: number) {
    if (!item.id) return;
    completeItem.mutate({ id: item.id, mindsetScore: score });
    toast.success(`Mindset: ${score}/5 logged`);
    setExpandedItem(null);
  }

  function renderIntelPanel(key: string) {
    switch (key) {
      case "vix_check":        return <VixPanel intel={intel} />;
      case "spy_bias":         return <SpyQqqPanel intel={intel} />;
      case "gappers":          return <GappersPanel intel={intel} />;
      case "account_gate":     return <AccountPnlPanel intel={intel} />;
      case "setups_confirmed": return <SwingWatchlistPanel intel={intel} />;
      case "risk_sizing":      return <RiskSizingPanel intel={intel} />;
      case "liquidity_zones":  return <LiquidityZonesPanel intel={intel} />;
      case "mindset": {
        const item = items.find(i => i.itemKey === "mindset");
        return <MindsetPanel item={item} onComplete={(score) => item && handleMindsetComplete(item, score)} />;
      }
      default: return null;
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Flame className="h-6 w-6 text-amber-500" />
            Pre-Market Intelligence
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{today} · ET — Live data, auto-refreshes every 60s</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetchIntel()} disabled={intelLoading} className="gap-1.5">
            <RefreshCw className={cn("h-3.5 w-3.5", intelLoading && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => resetDay.mutate()} disabled={resetDay.isPending}>
            Reset
          </Button>
        </div>
      </div>

      {/* Progress */}
      <Card className={cn("transition-all", allDone ? "border-green-300 bg-green-50/40" : "")}>
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{completedCount} / {totalCount} complete</span>
            {allDone ? (
              <Badge className="bg-green-600 text-white gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Ready to trade
              </Badge>
            ) : intel?.vix?.label === "danger" ? (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> Skip today — VIX danger
              </Badge>
            ) : null}
          </div>
          <Progress value={(completedCount / totalCount) * 100} className="h-2.5" />
          {/* 14-day history */}
          {history && history.length > 0 && (
            <div className="flex items-end gap-1 h-7 mt-1">
              {[...history].reverse().map((h, i) => (
                <TooltipProvider key={i}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={cn("flex-1 rounded-sm cursor-default", h.pct === 100 ? "bg-green-500" : h.pct >= 50 ? "bg-amber-400" : "bg-red-300")}
                        style={{ height: `${Math.max(20, h.pct)}%` }}
                      />
                    </TooltipTrigger>
                    <TooltipContent><p className="text-xs">{h.date}: {h.completed}/{h.total} ({h.pct}%)</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Checklist items */}
      <div className="space-y-3">
        {checklistLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl border bg-muted animate-pulse" />
            ))
          : items.map(item => {
              const config = ITEM_CONFIG[item.itemKey];
              const isExpanded = expandedItem === item.itemKey;
              return (
                <Card key={item.itemKey} className={cn("transition-all duration-200", item.completed ? "border-green-200 bg-green-50/40" : "hover:border-primary/30")}>
                  <CardHeader className="p-4 pb-0">
                    <div className="flex items-center gap-3">
                      {/* Checkbox */}
                      <button
                        onClick={() => handleToggle(item)}
                        className={cn(
                          "shrink-0 h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all",
                          item.completed ? "bg-green-500 border-green-500 text-white" : "border-muted-foreground hover:border-primary",
                        )}
                      >
                        {item.completed && <CheckCircle2 className="h-4 w-4" />}
                      </button>
                      {/* Icon */}
                      <div className={cn("p-1.5 rounded-lg", item.completed ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground")}>
                        {config?.icon ?? <Circle className="h-4 w-4" />}
                      </div>
                      {/* Title + desc */}
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-semibold", item.completed && "line-through text-muted-foreground")}>
                          {config?.title ?? item.label}
                        </p>
                        <p className="text-xs text-muted-foreground">{config?.description}</p>
                      </div>
                      {/* Expand toggle */}
                      <button
                        onClick={() => setExpandedItem(isExpanded ? null : item.itemKey)}
                        className="shrink-0 p-1 rounded hover:bg-muted transition-colors"
                      >
                        {isExpanded
                          ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </button>
                    </div>
                  </CardHeader>
                  {/* Expanded intel panel */}
                  {isExpanded && (
                    <CardContent className="pt-3 pb-4 px-4">
                      <Separator className="mb-3" />
                      {renderIntelPanel(item.itemKey)}
                      {item.itemKey !== "mindset" && !item.completed && (
                        <Button
                          size="sm"
                          className="mt-3 w-full bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => { handleToggle(item); setExpandedItem(null); }}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1.5" /> Mark Complete
                        </Button>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })
        }
      </div>

      {/* Risk Settings */}
      <DrawdownSettingsPanel />

      {/* Time reminder */}
      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="pt-4 pb-4 flex items-center gap-3">
          <Clock className="h-5 w-5 text-amber-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Trading Window: 9:30 – 11:30 AM ET</p>
            <p className="text-xs text-amber-700">Stop at 11:30 regardless of P&L. Lunch drift = noise, not signal.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
