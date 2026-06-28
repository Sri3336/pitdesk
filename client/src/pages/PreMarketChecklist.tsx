import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  BookOpen,
  Brain,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  Eye,
  Flame,
  Loader2,
  RefreshCw,
  Shield,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ITEM_ICONS: Record<string, React.ReactNode> = {
  market_bias:  <TrendingUp className="h-4 w-4 text-blue-500" />,
  news_check:   <BookOpen className="h-4 w-4 text-purple-500" />,
  account_pnl:  <DollarSign className="h-4 w-4 text-green-500" />,
  watchlist:    <Eye className="h-4 w-4 text-orange-500" />,
  risk_sizing:  <Shield className="h-4 w-4 text-red-500" />,
  mindset:      <Brain className="h-4 w-4 text-pink-500" />,
};

const ITEM_TIPS: Record<string, string> = {
  market_bias:  "Check S&P 500 & Nasdaq futures. Is the market gapping up or down? What sectors are leading? Align your bias before touching any position.",
  news_check:   "Scan Bloomberg, Reuters, or CNBC. Any Fed speakers today? Earnings surprises? Geopolitical events? Don't trade blind.",
  account_pnl:  "What is your P&L so far this week? Are you near your daily loss limit? If you hit -2% today, step away.",
  watchlist:    "Review your top 5 setups. Are the patterns still intact? Any overnight news that invalidates the thesis?",
  risk_sizing:  "Calculate your max position size for today. Use Rajan's formula: 0.66% risk per trade. Know your stop before you enter.",
  mindset:      "Are you calm? Did you sleep? Are you trading to recover yesterday's loss? If yes to the last one — don't trade today.",
};

function ProgressRing({ pct, size = 80 }: { pct: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = pct === 100 ? "#22c55e" : pct >= 66 ? "#f59e0b" : pct >= 33 ? "#3b82f6" : "#e5e7eb";

  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={6} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={6}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.5s ease, stroke 0.3s ease" }}
      />
    </svg>
  );
}

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

  const handleSave = () => {
    const md = parseFloat(maxDD || String(currentMaxDD));
    const rp = parseFloat(riskPT || String(currentRisk));
    const cap = parseFloat(capital || String(currentCap));
    if (isNaN(md) || isNaN(rp) || isNaN(cap)) { toast.error("Invalid values"); return; }
    saveMutation.mutate({ maxDrawdownPct: md, riskPerTradePct: rp, totalCapital: cap });
  };

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
              <Input
                type="number" className="h-8 text-sm mt-1"
                placeholder={String(currentMaxDD)}
                value={maxDD} onChange={e => setMaxDD(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Risk Per Trade %</Label>
              <Input
                type="number" step="0.01" className="h-8 text-sm mt-1"
                placeholder={String(currentRisk)}
                value={riskPT} onChange={e => setRiskPT(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Total Capital ($)</Label>
              <Input
                type="number" className="h-8 text-sm mt-1"
                placeholder={String(currentCap)}
                value={capital} onChange={e => setCapital(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Formula: {(parseFloat(maxDD || String(currentMaxDD)) / 30).toFixed(2)}% risk/trade
              = ${((parseFloat(capital || String(currentCap))) * (parseFloat(maxDD || String(currentMaxDD)) / 100) / 30).toFixed(0)} max loss/trade
            </p>
            <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Save
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ─── History Bar ──────────────────────────────────────────────────────────────

function HistoryBar() {
  const historyQuery = trpc.preMarket.history.useQuery({ days: 14 });
  const history = historyQuery.data ?? [];
  if (history.length === 0) return null;

  return (
    <Card className="shadow-none border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" /> Last 14 Days
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex gap-1.5 flex-wrap">
          {[...history].reverse().map(d => (
            <div key={d.date} className="flex flex-col items-center gap-0.5">
              <div
                className="w-6 rounded-sm"
                style={{
                  height: 24,
                  background: d.pct === 100 ? "#22c55e" : d.pct >= 66 ? "#f59e0b" : d.pct >= 33 ? "#3b82f6" : "#e5e7eb",
                  opacity: d.pct === 0 ? 0.3 : 1,
                }}
                title={`${d.date}: ${d.completed}/${d.total} (${d.pct}%)`}
              />
              <span className="text-[9px] text-muted-foreground">{d.date.slice(5)}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-4 mt-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500 inline-block" /> 100%</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-400 inline-block" /> 66%+</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500 inline-block" /> 33%+</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-gray-200 inline-block" /> &lt;33%</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PreMarketChecklist() {
  const checklistQuery = trpc.preMarket.todayChecklist.useQuery();
  const completeMutation = trpc.preMarket.completeItem.useMutation({
    onSuccess: () => checklistQuery.refetch(),
    onError: (e) => toast.error(e.message),
  });
  const uncompleteMutation = trpc.preMarket.uncompleteItem.useMutation({
    onSuccess: () => checklistQuery.refetch(),
    onError: (e) => toast.error(e.message),
  });
  const resetMutation = trpc.preMarket.resetDay.useMutation({
    onSuccess: () => { toast.success("Checklist reset"); checklistQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const [expandedTip, setExpandedTip] = useState<string | null>(null);

  const data = checklistQuery.data;
  const items = data?.items ?? [];
  const completedCount = data?.completedCount ?? 0;
  const totalCount = data?.totalCount ?? 6;
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const allDone = completedCount === totalCount && totalCount > 0;

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York",
  });

  if (checklistQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 p-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-green-500" />
            Pre-Market Routine
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{today} · ET</p>
        </div>
        <Button
          variant="outline" size="sm" className="h-8 text-xs gap-1.5"
          onClick={() => resetMutation.mutate()}
          disabled={resetMutation.isPending}
        >
          {resetMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Reset
        </Button>
      </div>

      {/* Progress ring + summary */}
      <Card className={`shadow-none border-2 transition-colors ${allDone ? "border-green-400 bg-green-50/40" : "border-border"}`}>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              <ProgressRing pct={pct} size={80} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold" style={{ color: pct === 100 ? "#22c55e" : "#374151" }}>
                  {pct}%
                </span>
              </div>
            </div>
            <div className="flex-1">
              {allDone ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="font-semibold text-green-700">Pre-market complete. You're ready to trade.</p>
                    <p className="text-xs text-muted-foreground mt-0.5">All {totalCount} items checked. Trade with discipline.</p>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="font-semibold text-foreground">
                    {completedCount} of {totalCount} items complete
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {totalCount - completedCount} remaining before market open
                  </p>
                  {completedCount === 0 && (
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Don't trade until you complete your routine
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="text-right shrink-0">
              <Badge variant={allDone ? "default" : "secondary"} className={`text-xs ${allDone ? "bg-green-500 text-white" : ""}`}>
                {allDone ? "READY" : `${completedCount}/${totalCount}`}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Checklist items */}
      <div className="space-y-2">
        {items.map((item) => {
          const isExpanded = expandedTip === item.itemKey;
          const tip = ITEM_TIPS[item.itemKey];

          return (
            <div
              key={item.id || item.itemKey}
              className={`rounded-xl border transition-all ${
                item.completed
                  ? "border-green-200 bg-green-50/50"
                  : "border-border bg-card hover:border-foreground/20"
              }`}
            >
              <div className="flex items-center gap-3 p-3">
                {/* Checkbox */}
                <button
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                    item.completed
                      ? "bg-green-500 border-green-500"
                      : "border-gray-300 hover:border-green-400"
                  }`}
                  onClick={() => {
                    if (item.id) {
                      if (item.completed) {
                        uncompleteMutation.mutate({ id: item.id });
                      } else {
                        completeMutation.mutate({ id: item.id });
                      }
                    }
                  }}
                  disabled={completeMutation.isPending || uncompleteMutation.isPending}
                >
                  {item.completed && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                </button>

                {/* Icon */}
                <div className="shrink-0">{ITEM_ICONS[item.itemKey] ?? <Zap className="h-4 w-4 text-muted-foreground" />}</div>

                {/* Label */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium leading-snug ${item.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                    {item.label}
                  </p>
                  {item.completedAt && (
                    <p className="text-[10px] text-green-600 mt-0.5">
                      ✓ {new Date(item.completedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" })} ET
                    </p>
                  )}
                </div>

                {/* Tip toggle */}
                {tip && (
                  <button
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setExpandedTip(isExpanded ? null : item.itemKey)}
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                )}
              </div>

              {/* Expanded tip */}
              {isExpanded && tip && (
                <div className="px-3 pb-3 pt-0 ml-8">
                  <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2.5 leading-relaxed">
                    {tip}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Rajan quote */}
      <Card className="shadow-none border-border bg-muted/30">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3">
            <Flame className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-foreground mb-1">Rajan Daal — 33% Rule</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                "Strategy is only 33% of trading success. Risk management is 33%. Psychology is 33%.
                Most traders obsess over strategy and ignore the other two-thirds. Your pre-market routine
                is how you protect the 66% that actually determines whether you survive."
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Settings + History */}
      <DrawdownSettingsPanel />
      <HistoryBar />
    </div>
  );
}
