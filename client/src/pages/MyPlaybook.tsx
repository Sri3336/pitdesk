/**
 * MyPlaybook — Personal per-user trading playbook
 * Auto-populated from trade log + user-defined rules
 * Playbook compliance badges wire into all strategy recommendations
 */
import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  AlertTriangle,
  BookMarked,
  CheckCircle2,
  ChevronRight,
  Edit3,
  FlaskConical,
  MessageSquare,
  Plus,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Star,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  XCircle,
  Zap,
  BarChart2,
  Clock,
  Activity,
} from "lucide-react";

// ─── Default Playbook Rules (starter kit) ────────────────────────────────────
const DEFAULT_RULES = [
  { ruleText: "Only trade Stage 2 stocks (above 50-day MA, trending up)", category: "entry", ruleType: "hard_block" as const },
  { ruleText: "Minimum Open Interest of 500 contracts before entering any options trade", category: "liquidity", ruleType: "hard_block" as const },
  { ruleText: "Never enter a new position within 5 days of earnings unless it's an earnings play", category: "risk", ruleType: "soft_warn" as const },
  { ruleText: "Bid/ask spread must be less than 5% of the mid price", category: "liquidity", ruleType: "soft_warn" as const },
  { ruleText: "IVR above 30 before selling premium", category: "entry", ruleType: "soft_warn" as const },
  { ruleText: "Max position size: 5% of portfolio per trade", category: "risk", ruleType: "guideline" as const },
  { ruleText: "Take 50% profit at 50% of max gain — don't get greedy", category: "exit", ruleType: "guideline" as const },
  { ruleText: "Close position at 2x credit received (max loss = 2x premium collected)", category: "exit", ruleType: "hard_block" as const },
];

// ─── Rule type config ─────────────────────────────────────────────────────────
const RULE_TYPE_CONFIG = {
  hard_block: { label: "Hard Block", icon: XCircle, color: "#ef4444", bg: "rgba(239,68,68,0.1)", desc: "Always enforced — trade blocked if violated" },
  soft_warn:  { label: "Warning",    icon: AlertTriangle, color: "#f59e0b", bg: "rgba(245,158,11,0.1)", desc: "Shows a warning but allows override" },
  guideline:  { label: "Guideline",  icon: CheckCircle2, color: "#22c55e", bg: "rgba(34,197,94,0.1)", desc: "Best practice reminder" },
};

const CATEGORIES = ["entry", "exit", "risk", "liquidity", "psychology", "general"];

// ─── Style tags ───────────────────────────────────────────────────────────────
const STYLE_TAGS: Record<string, { icon: React.ElementType; color: string; label: string; desc: string }> = {
  "Premium Seller":   { icon: Clock,      color: "#22c55e", label: "Premium Seller",   desc: "Theta decay is your edge. You sell time." },
  "Breakout Trader":  { icon: Zap,        color: "#f97316", label: "Breakout Trader",  desc: "You trade momentum and technical breaks." },
  "Swing Trader":     { icon: TrendingUp, color: "#3b82f6", label: "Swing Trader",     desc: "Multi-day setups, technical + fundamental." },
  "Earnings Trader":  { icon: BarChart2,  color: "#8b5cf6", label: "Earnings Trader",  desc: "You play IV crush and directional moves." },
  "Unknown":          { icon: Activity,   color: "#6b7280", label: "Building Style",   desc: "Trade more to unlock your style profile." },
};

// ─── Compliance ring ──────────────────────────────────────────────────────────
function ComplianceRing({ pct }: { pct: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 80 ? "#22c55e" : pct >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/30" />
        <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <div className="text-center">
        <div className="text-xl font-bold" style={{ color }}>{pct}%</div>
        <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Compliance</div>
      </div>
    </div>
  );
}

// ─── Rule card ────────────────────────────────────────────────────────────────
function RuleCard({
  rule,
  onDelete,
  onToggle,
}: {
  rule: { id: number; ruleText: string; ruleType: string; category: string; isActive: number; timesTriggered: number; timesOverridden: number };
  onDelete: (id: number) => void;
  onToggle: (id: number, active: boolean) => void;
}) {
  const cfg = RULE_TYPE_CONFIG[rule.ruleType as keyof typeof RULE_TYPE_CONFIG] ?? RULE_TYPE_CONFIG.guideline;
  const Icon = cfg.icon;
  const isActive = !!rule.isActive;

  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border transition-all duration-150 ${isActive ? "bg-background" : "bg-muted/30 opacity-60"}`}
      style={{ borderColor: isActive ? cfg.color + "30" : "var(--border)" }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: cfg.bg }}>
        <Icon className="h-4 w-4" style={{ color: cfg.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground leading-snug">{rule.ruleText}</div>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
            style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
          <span className="text-[10px] text-muted-foreground capitalize">{rule.category}</span>
          {rule.timesTriggered > 0 && (
            <span className="text-[10px] text-muted-foreground">
              Triggered {rule.timesTriggered}× {rule.timesOverridden > 0 && `· Overridden ${rule.timesOverridden}×`}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => onToggle(rule.id, !isActive)}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors text-xs">
          {isActive ? "Pause" : "Enable"}
        </button>
        <button onClick={() => onDelete(rule.id)}
          className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors">
          <XCircle className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Add Rule Form ────────────────────────────────────────────────────────────
function AddRuleForm({ onAdd }: { onAdd: () => void }) {
  const [open, setOpen] = useState(false);
  const [ruleText, setRuleText] = useState("");
  const [ruleType, setRuleType] = useState<"hard_block" | "soft_warn" | "guideline">("soft_warn");
  const [category, setCategory] = useState("general");

  const addMutation = trpc.playbookRules.add.useMutation({
    onSuccess: () => {
      setRuleText("");
      setRuleType("soft_warn");
      setCategory("general");
      setOpen(false);
      onAdd();
      toast.success("Rule added to your Playbook");
    },
    onError: (e) => toast.error(e.message),
  });

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-border hover:border-green-400 hover:bg-green-50/50 dark:hover:bg-green-950/20 transition-all duration-150 text-muted-foreground hover:text-green-600 text-sm font-medium">
        <Plus className="h-4 w-4" /> Add a Rule
      </button>
    );
  }

  return (
    <div className="p-4 rounded-xl border-2 border-green-300 bg-green-50/40 dark:bg-green-950/20 space-y-3">
      <div className="text-sm font-semibold text-foreground">New Playbook Rule</div>
      <Textarea
        value={ruleText}
        onChange={e => setRuleText(e.target.value)}
        placeholder="e.g. Never trade a stock below its 50-day moving average"
        className="text-sm resize-none"
        rows={2}
      />
      <div className="grid grid-cols-2 gap-2">
        <Select value={ruleType} onValueChange={v => setRuleType(v as any)}>
          <SelectTrigger className="text-xs h-9">
            <SelectValue placeholder="Rule type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hard_block">🚫 Hard Block</SelectItem>
            <SelectItem value="soft_warn">⚠️ Warning</SelectItem>
            <SelectItem value="guideline">✅ Guideline</SelectItem>
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="text-xs h-9">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(c => (
              <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => addMutation.mutate({ ruleText, ruleType, category })}
          disabled={!ruleText.trim() || addMutation.isPending}
          className="bg-green-600 hover:bg-green-700 text-white text-xs">
          {addMutation.isPending ? "Adding..." : "Add Rule"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} className="text-xs">Cancel</Button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MyPlaybook() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  // Fetch playbook rules
  const { data: rules, isLoading: rulesLoading } = trpc.playbookRules.list.useQuery(undefined, { retry: 1 });

  // Fetch style profile (auto-computed from trade log)
  const { data: profile, isLoading: profileLoading } = trpc.playbookRules.getStyleProfile.useQuery(undefined, { retry: 1 });

  // Fetch trade analytics for weak spots
  // analytics from trade log (unused directly — profile includes weak spots)
  // const { data: analytics } = trpc.tradeAnalytics.getSummary.useQuery(undefined, { retry: 1 });

  const deleteMutation = trpc.playbookRules.delete.useMutation({
    onSuccess: () => { utils.playbookRules.list.invalidate(); toast.success("Rule removed"); },
    onError: (e) => toast.error(e.message),
  });

  const toggleMutation = trpc.playbookRules.toggle.useMutation({
    onSuccess: () => utils.playbookRules.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const seedDefaultsMutation = trpc.playbookRules.seedDefaults.useMutation({
    onSuccess: () => { utils.playbookRules.list.invalidate(); toast.success("Starter rules added to your Playbook!"); },
    onError: (e) => toast.error(e.message),
  });

  const firstName = user?.name?.split(" ")[0] ?? "Trader";
  const styleTag = profile?.styleTag ?? "Unknown";
  const styleConfig = STYLE_TAGS[styleTag] ?? STYLE_TAGS["Unknown"];
  const StyleIcon = styleConfig.icon;
  const compliancePct = profile?.ruleCompliancePct ?? 100;
  const totalTrades = profile?.totalTrades ?? 0;
  const winRate = profile?.winRate ?? 0;

  const activeRules = (rules ?? []).filter((r: any) => r.isActive);
  const hardBlocks = activeRules.filter((r: any) => r.ruleType === "hard_block");
  const warnings = activeRules.filter((r: any) => r.ruleType === "soft_warn");
  const guidelines = activeRules.filter((r: any) => r.ruleType === "guideline");

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookMarked className="h-5 w-5 text-green-600" />
            <h1 className="text-2xl font-bold text-foreground">My Playbook</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Your personal trading rules, style profile, and performance insights — updated automatically from your trade log.
          </p>
        </div>
        <Button onClick={() => navigate("/pit-advisor")} variant="outline" size="sm"
          className="flex items-center gap-1.5 shrink-0">
          <MessageSquare className="h-3.5 w-3.5" /> Ask Pit Advisor
        </Button>
      </div>

      {/* ── Style Profile Card ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Style tag */}
        <Card className="md:col-span-1 border-2" style={{ borderColor: styleConfig.color + "30" }}>
          <CardContent className="p-5 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: styleConfig.color + "18" }}>
              <StyleIcon className="h-7 w-7" style={{ color: styleConfig.color }} />
            </div>
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Your Style</div>
              <div className="text-xl font-bold text-foreground">{styleConfig.label}</div>
              <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{styleConfig.desc}</div>
            </div>
            {totalTrades < 10 && (
              <div className="text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 rounded-full border border-amber-200 dark:border-amber-800/50">
                Log {10 - totalTrades} more trades to unlock full profile
              </div>
            )}
          </CardContent>
        </Card>

        {/* Compliance + stats */}
        <Card className="md:col-span-2">
          <CardContent className="p-5">
            <div className="flex items-start gap-6">
              <ComplianceRing pct={Math.round(compliancePct)} />
              <div className="flex-1">
                <div className="text-sm font-semibold text-foreground mb-3">Rule Compliance — This Month</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Total Trades", value: totalTrades.toString(), color: "var(--foreground)" },
                    { label: "Win Rate", value: totalTrades > 0 ? `${winRate.toFixed(0)}%` : "—", color: winRate >= 50 ? "#22c55e" : "#ef4444" },
                    { label: "Active Rules", value: activeRules.length.toString(), color: "#3b82f6" },
                    { label: "Hard Blocks", value: hardBlocks.length.toString(), color: "#ef4444" },
                  ].map(s => (
                    <div key={s.label} className="flex flex-col gap-0.5">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.label}</div>
                      <div className="text-lg font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>

                {/* Best strategies from trade log */}
                {profile?.topStrategy1 && (
                  <div className="mt-4">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Your Best Strategies (from trade log)</div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { name: profile.topStrategy1, wr: profile.topStrategy1WinRate },
                        { name: profile.topStrategy2, wr: profile.topStrategy2WinRate },
                        { name: profile.topStrategy3, wr: profile.topStrategy3WinRate },
                      ].filter(s => s.name).map((s, i) => (
                        <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800/50">
                          <Trophy className="h-3 w-3 text-green-600" />
                          <span className="text-xs font-semibold text-green-700 dark:text-green-400">{s.name}</span>
                          {s.wr != null && (
                            <span className="text-[10px] text-green-600/70">{Number(s.wr).toFixed(0)}% WR</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Weak Spots ──────────────────────────────────────────────────── */}
      {(profile?.weakSpot1 || profile?.weakSpot2 || profile?.weakSpot3) && (
        <Card className="border-amber-200 dark:border-amber-800/50 bg-amber-50/40 dark:bg-amber-950/20">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <div className="text-sm font-semibold text-amber-700 dark:text-amber-400">Your Weak Spots — Auto-detected from Trade Log</div>
            </div>
            <div className="space-y-2">
              {[profile.weakSpot1, profile.weakSpot2, profile.weakSpot3].filter(Boolean).map((spot, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
                  <span className="text-amber-500 mt-0.5">⚠</span>
                  <span>{spot}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Tabs: Rules / Lessons ────────────────────────────────────────── */}
      <Tabs defaultValue="rules">
        <TabsList className="mb-4">
          <TabsTrigger value="rules" className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" /> My Rules
            {rules && <span className="ml-1 text-[10px] bg-muted rounded-full px-1.5 py-0.5">{rules.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="lessons" className="flex items-center gap-1.5">
            <BookMarked className="h-3.5 w-3.5" /> Trader Lessons
          </TabsTrigger>
          <TabsTrigger value="gate" className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Gate Checks
          </TabsTrigger>
        </TabsList>

        {/* ── Rules Tab ─────────────────────────────────────────────────── */}
        <TabsContent value="rules" className="space-y-4">

          {/* Seed defaults CTA */}
          {!rulesLoading && (!rules || rules.length === 0) && (
            <div className="text-center py-10 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-green-50 dark:bg-green-950/30 flex items-center justify-center mx-auto">
                <Shield className="h-8 w-8 text-green-600" />
              </div>
              <div>
                <div className="text-base font-semibold text-foreground">No rules yet</div>
                <div className="text-sm text-muted-foreground mt-1">Start with Sri's proven starter rules or write your own.</div>
              </div>
              <div className="flex items-center justify-center gap-3">
                <Button onClick={() => seedDefaultsMutation.mutate()}
                  disabled={seedDefaultsMutation.isPending}
                  className="bg-green-600 hover:bg-green-700 text-white">
                  {seedDefaultsMutation.isPending ? "Adding..." : "Load Starter Rules"}
                </Button>
                <Button variant="outline" onClick={() => {}}>Write My Own</Button>
              </div>
            </div>
          )}

          {/* Rules by type */}
          {rules && rules.length > 0 && (
            <div className="space-y-6">
              {/* Summary badges */}
              <div className="flex flex-wrap gap-2">
                {[
                  { label: `${hardBlocks.length} Hard Blocks`, color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
                  { label: `${warnings.length} Warnings`, color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
                  { label: `${guidelines.length} Guidelines`, color: "#22c55e", bg: "rgba(34,197,94,0.1)" },
                ].map(b => (
                  <span key={b.label} className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ background: b.bg, color: b.color }}>{b.label}</span>
                ))}
              </div>

              {/* Rule list */}
              <div className="space-y-2">
                {(rules as any[]).map((rule: any) => (
                  <RuleCard key={rule.id} rule={rule}
                    onDelete={(id) => deleteMutation.mutate({ id })}
                    onToggle={(id, active) => toggleMutation.mutate({ id, isActive: active })}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Add rule form */}
          <AddRuleForm onAdd={() => utils.playbookRules.list.invalidate()} />

          {/* How rules work */}
          <div className="p-4 rounded-xl bg-muted/40 border border-border/60">
            <div className="text-xs font-semibold text-foreground mb-2">How Playbook Rules Work</div>
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <div className="flex items-start gap-2"><XCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" /> <span><strong className="text-foreground">Hard Block</strong> — Strategy card shows a red 🚫 badge. You're warned before entering.</span></div>
              <div className="flex items-start gap-2"><AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" /> <span><strong className="text-foreground">Warning</strong> — Strategy card shows an amber ⚠️ badge. You can override with one click.</span></div>
              <div className="flex items-start gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" /> <span><strong className="text-foreground">Guideline</strong> — Green ✅ badge on strategy cards that match your best practices.</span></div>
            </div>
          </div>
        </TabsContent>

        {/* ── Lessons Tab ───────────────────────────────────────────────── */}
        <TabsContent value="lessons">
          <div className="text-center py-10 text-muted-foreground">
            <BookMarked className="h-10 w-10 opacity-20 mx-auto mb-3" />
            <div className="text-sm font-medium">Trader Lessons</div>
            <div className="text-xs mt-1">Visit Sri's Playbook for the full lesson library and gate checks.</div>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/sri-playbook")}>
              Open Sri's Playbook <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </TabsContent>

        {/* ── Gate Checks Tab ───────────────────────────────────────────── */}
        <TabsContent value="gate">
          <div className="text-center py-10 text-muted-foreground">
            <ShieldCheck className="h-10 w-10 opacity-20 mx-auto mb-3" />
            <div className="text-sm font-medium">Trade Gate Checks</div>
            <div className="text-xs mt-1">Run a 4-gate check before entering any trade: IV, Regime, Range, Catalyst.</div>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/sri-playbook")}>
              Run Gate Check <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
