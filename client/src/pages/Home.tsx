import React, { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { PitDeskLogo } from "@/components/PitDeskLogo";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { ROUTES, HOME_ACTIONS } from "@/lib/routes";
import {
  Activity,
  BarChart2,
  Bell,
  BookMarked,
  BookOpen,
  Building2,
  Calculator,
  CalendarDays,
  CandlestickChart,
  ChevronRight,
  ClipboardList,
  Database,
  FlaskConical,
  GitMerge,
  HardDrive,
  HelpCircle,
  LineChart,
  ListChecks,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  Radio,
  Scan,
  Settings,
  Shield,
  Sparkles,
  Sunrise,
  Target,
  TrendingDown,
  TrendingUp,
  Upload,
  X,
  Zap,
} from "lucide-react";

// ─── All features for Quick Access grid ──────────────────────────────────────

const ALL_FEATURES = [
  // Scanners & Analysis
  { icon: BarChart2,       label: "PCR Dashboard",        path: "/pcr-dashboard",       group: "Analysis",   color: "#22c55e" },
  { icon: TrendingUp,      label: "PCR Strategy",         path: "/pcr-strategy",        group: "Analysis",   color: "#22c55e" },
  { icon: CandlestickChart,label: "Charts",               path: "/charts",              group: "Analysis",   color: "#3b82f6" },
  { icon: Scan,            label: "Scan All",             path: "/scan-all",            group: "Analysis",   color: "#3b82f6" },
  { icon: Activity,        label: "Options Analyzer",     path: "/analyzer",            group: "Analysis",   color: "#8b5cf6" },
  { icon: ClipboardList,   label: "Watchlist",            path: "/watchlist",           group: "Analysis",   color: "#6366f1" },
  { icon: Radio,           label: "Earnings Calendar",    path: "/earnings-calendar",   group: "Analysis",   color: "#f59e0b" },

  // Strategies
  { icon: LineChart,       label: "Velez Scanner",        path: "/velez-scanner",       group: "Strategies", color: "#22c55e" },
  { icon: Activity,        label: "Intraday Scanner",     path: "/intraday-scanner",    group: "Strategies", color: "#3b82f6" },
  { icon: GitMerge,        label: "VCP Strategy",         path: "/vcp-strategy",        group: "Strategies", color: "#8b5cf6" },
  { icon: Zap,             label: "Catalyst Watch",       path: "/catalyst-watch",      group: "Strategies", color: "#f59e0b" },
  { icon: TrendingDown,    label: "ICT Supply Zone",      path: "/ict-supply-zone",     group: "Strategies", color: "#ef4444" },
  { icon: TrendingUp,      label: "EMA Pullback",         path: "/ema-pullback",        group: "Strategies", color: "#22c55e" },
  { icon: Target,          label: "Opening Range Scalper",path: "/velez-scanner?tab=ors",group:"Strategies", color: "#f97316" },

  // Alerts
  { icon: Bell,            label: "IVR Alerts",           path: "/ivr-alerts",          group: "Alerts",     color: "#f59e0b" },
  { icon: Bell,            label: "VCP Alerts",           path: "/vcp-alerts",          group: "Alerts",     color: "#f59e0b" },
  { icon: Sparkles,        label: "Fib+EMA Alerts",       path: "/fib-ema-alerts",      group: "Alerts",     color: "#8b5cf6" },

  // Execution
  { icon: MessageSquare,   label: "Pit Advisor",          path: "/pit-advisor",         group: "Execution",  color: "#22c55e" },
  { icon: Zap,             label: "AI Agent",             path: "/agent",               group: "Execution",  color: "#8b5cf6" },
  { icon: Shield,          label: "Pre-Market Checklist", path: "/pre-market",          group: "Execution",  color: "#3b82f6" },
  { icon: Sunrise,         label: "Morning Session",      path: "/morning-session",     group: "Execution",  color: "#f59e0b" },
  { icon: ListChecks,      label: "Swing Watchlist",      path: "/swing-watchlist",     group: "Execution",  color: "#22c55e" },
  { icon: MapPin,          label: "Liquidity Map",        path: "/liquidity-map",       group: "Execution",  color: "#6366f1" },
  { icon: ClipboardList,   label: "Trade Log",            path: "/trade-log",           group: "Execution",  color: "#3b82f6" },
  { icon: Upload,          label: "Analyze My Trades",    path: "/trade-upload",        group: "Execution",  color: "#f97316" },
  { icon: BarChart2,       label: "Performance",          path: "/performance",         group: "Execution",  color: "#22c55e" },
  { icon: BookOpen,        label: "Trade Proposals",      path: "/trade-proposals",     group: "Execution",  color: "#8b5cf6" },

  // Playbook
  { icon: BookMarked,      label: "Playbook & Tracker",   path: "/sri-playbook",        group: "Playbook",   color: "#22c55e" },

  // Backtesting
  { icon: FlaskConical,    label: "Backtester",           path: "/backtester",          group: "Backtesting",color: "#6366f1" },
  { icon: Calculator,      label: "Position Sizer",       path: "/position-sizer",      group: "Backtesting",color: "#3b82f6" },

  // Data
  { icon: Zap,             label: "Options Flow",         path: "/options-flow",        group: "Data",       color: "#f59e0b" },
  { icon: Database,        label: "COT Dashboard",        path: "/cot-dashboard",       group: "Data",       color: "#6366f1" },
  { icon: HardDrive,       label: "Historical Data",      path: "/historical-data",     group: "Data",       color: "#3b82f6" },
  { icon: Building2,       label: "Broker Settings",      path: "/broker-settings",     group: "Data",       color: "#6b7280" },
  { icon: HelpCircle,      label: "Methodology",          path: "/methodology",         group: "Data",       color: "#6b7280" },
  { icon: HelpCircle,      label: "Glossary",             path: "/glossary",            group: "Data",       color: "#6b7280" },
];

const GROUPS = ["Analysis", "Strategies", "Alerts", "Execution", "Playbook", "Backtesting", "Data"];

// Map action key → Lucide icon component
const ACTION_ICONS: Record<string, React.ElementType> = {
  "ticker-analysis": BarChart2,
  "day-picks": Zap,
  "swing-picks": TrendingUp,
  "trade-upload": Upload,
  "glossary": BookOpen,
  "pit-advisor": MessageSquare,
};

// ─── Top Nav Bar ──────────────────────────────────────────────────────────────

function TopNavBar() {
  const [, navigate] = useLocation();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const quickLinks = [
    { label: "Dashboard",    path: "/dashboard" },
    { label: "Playbook",     path: "/sri-playbook" },
    { label: "PCR",          path: "/pcr-dashboard" },
    { label: "Velez",        path: "/velez-scanner" },
    { label: "Intraday",     path: "/intraday-scanner" },
    { label: "Pit Advisor",  path: "/pit-advisor" },
    { label: "Trade Log",    path: "/trade-log" },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-border/60 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 h-12 flex items-center justify-between">
        {/* Logo */}
        <button
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          onClick={() => navigate("/")}
        >
          <PitDeskLogo size={28} />
          <span className="font-bold text-sm text-foreground">PitDesk</span>
        </button>

        {/* Quick links — desktop */}
        <div className="hidden md:flex items-center gap-0.5">
          {quickLinks.map(link => (
            <button
              key={link.path}
              onClick={() => navigate(link.path)}
              className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-all duration-150"
            >
              {link.label}
            </button>
          ))}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/dashboard")}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            All Tools
            <ChevronRight className="h-3 w-3" />
          </button>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden p-1.5 rounded-md hover:bg-muted/60 transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>

          {/* User avatar */}
          {user && (
            <div className="relative group">
              <button className="w-7 h-7 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center hover:bg-green-200 transition-colors">
                {user.name?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) ?? "SA"}
              </button>
              <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-border rounded-xl shadow-lg py-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
                <div className="px-3 py-2 border-b border-border/60">
                  <div className="text-xs font-semibold truncate">{user.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{user.email}</div>
                </div>
                <button
                  onClick={() => navigate("/profile")}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted/60 transition-colors"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Account Settings
                </button>
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden border-t border-border/60 bg-white/95 backdrop-blur-md px-4 py-3">
          <div className="grid grid-cols-2 gap-1">
            {quickLinks.map(link => (
              <button
                key={link.path}
                onClick={() => { navigate(link.path); setMenuOpen(false); }}
                className="px-3 py-2 text-xs font-medium text-left text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-all"
              >
                {link.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}

// ─── Quick Access Grid ────────────────────────────────────────────────────────

function QuickAccessGrid() {
  const [, navigate] = useLocation();
  const [activeGroup, setActiveGroup] = useState<string>("All");

  const filtered = activeGroup === "All"
    ? ALL_FEATURES
    : ALL_FEATURES.filter(f => f.group === activeGroup);

  return (
    <div className="w-full max-w-5xl mt-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-foreground/80 uppercase tracking-wider">All Tools</h2>
        <span className="text-xs text-muted-foreground">{ALL_FEATURES.length} features</span>
      </div>

      {/* Group filter pills */}
      <div className="flex items-center gap-1.5 flex-wrap mb-4">
        {["All", ...GROUPS].map(g => (
          <button
            key={g}
            onClick={() => setActiveGroup(g)}
            className={`px-2.5 py-1 text-[10px] font-semibold rounded-full border transition-all duration-150 ${
              activeGroup === g
                ? "bg-green-600 text-white border-green-600"
                : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Feature grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {filtered.map(feature => {
          const Icon = feature.icon;
          return (
            <button
              key={feature.path}
              onClick={() => navigate(feature.path)}
              className="group flex flex-col items-start gap-2 p-3 rounded-xl border border-border/60 bg-white hover:border-border hover:shadow-sm transition-all duration-150 text-left"
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = feature.color + "60";
                (e.currentTarget as HTMLElement).style.background = feature.color + "08";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = "";
                (e.currentTarget as HTMLElement).style.background = "";
              }}
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-110"
                style={{ background: feature.color + "18" }}
              >
                <Icon className="h-3.5 w-3.5" style={{ color: feature.color }} />
              </div>
              <div>
                <div className="text-xs font-medium text-foreground leading-tight">{feature.label}</div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5">{feature.group}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  // Fetch watchlist tickers for earnings scan
  const { data: watchlistItems } = trpc.watchlist.list.useQuery(undefined, { retry: 1 });
  const watchlistTickers = React.useMemo(
    () => (watchlistItems ?? []).map((w: { ticker: string }) => w.ticker),
    [watchlistItems]
  );

  // Scan watchlist for earnings this week (≤7 days)
  const earningsMutation = trpc.earningsCalendar.scanTickers.useMutation();
  React.useEffect(() => {
    if (watchlistTickers.length > 0 && !earningsMutation.data && !earningsMutation.isPending) {
      earningsMutation.mutate({ tickers: watchlistTickers.slice(0, 20) });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlistTickers.join(",")]);

  const thisWeekEarnings = (earningsMutation.data ?? []).filter(
    (r: { daysToEarnings: number | null; ticker: string }) =>
      r.daysToEarnings != null && r.daysToEarnings >= 0 && r.daysToEarnings <= 7
  ).sort((a: { daysToEarnings: number | null }, b: { daysToEarnings: number | null }) =>
    (a.daysToEarnings ?? 99) - (b.daysToEarnings ?? 99)
  );

  const firstName = user?.name?.split(" ")[0] ?? "Sridhar";
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      {/* Persistent top nav */}
      <TopNavBar />

      <div
        className="min-h-screen flex flex-col items-center px-4 pt-20 pb-16"
        style={{ background: "var(--background)" }}
      >
        {/* ── Brand header ─────────────────────────────────────────────── */}
        <div className="flex flex-col items-center mb-8 select-none mt-6">
          <div className="mb-4">
            <PitDeskLogo size={56} className="rounded-2xl shadow-lg" />
          </div>
          <h1
            className="text-3xl font-bold tracking-tight"
            style={{ color: "var(--foreground)" }}
          >
            PitDesk
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
            {greeting}, {firstName} — what do you want to do today?
          </p>
        </div>

        {/* ── Two Workflow Sections ────────────────── */}
        <div className="w-full max-w-3xl space-y-6">

          {/* Workflow 1: Find the Best Trade */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 rounded-full" style={{ background: "#22c55e33" }} />
              <span className="text-[11px] font-bold uppercase tracking-widest px-2" style={{ color: "#22c55e" }}>
                🎯 Find the Best Trade
              </span>
              <div className="h-px flex-1 rounded-full" style={{ background: "#22c55e33" }} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {HOME_ACTIONS.filter((a: any) => a.workflow === "find").map((action, i) => {
                const Icon = ACTION_ICONS[action.key] ?? BarChart2;
                const accentBg = action.color + "10";
                const accentBorder = action.color + "35";
                return (
                  <button
                    key={action.key}
                    onClick={() => navigate(action.path)}
                    className="group w-full text-left rounded-xl border transition-all duration-200 p-4"
                    style={{ background: accentBg, borderColor: accentBorder }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
                      (e.currentTarget as HTMLElement).style.boxShadow = `0 6px 24px ${action.color}20`;
                      (e.currentTarget as HTMLElement).style.borderColor = action.color;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                      (e.currentTarget as HTMLElement).style.boxShadow = "none";
                      (e.currentTarget as HTMLElement).style.borderColor = accentBorder;
                    }}
                    onMouseDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.98)"; }}
                    onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center mb-3 transition-transform duration-200 group-hover:scale-110"
                      style={{ background: action.color + "20" }}
                    >
                      <Icon className="w-4.5 h-4.5" style={{ color: action.color }} />
                    </div>
                    <div className="font-semibold text-sm leading-tight text-foreground mb-1">{action.label}</div>
                    <div className="text-xs leading-snug text-muted-foreground">{action.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Workflow 2: Test & Visualize Payout */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 rounded-full" style={{ background: "#8b5cf633" }} />
              <span className="text-[11px] font-bold uppercase tracking-widest px-2" style={{ color: "#8b5cf6" }}>
                🧪 Test & Visualize Payout
              </span>
              <div className="h-px flex-1 rounded-full" style={{ background: "#8b5cf633" }} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {HOME_ACTIONS.filter((a: any) => a.workflow === "test").map((action, i) => {
                const Icon = ACTION_ICONS[action.key] ?? BarChart2;
                const accentBg = action.color + "10";
                const accentBorder = action.color + "35";
                return (
                  <button
                    key={action.key}
                    onClick={() => navigate(action.path)}
                    className="group w-full text-left rounded-xl border transition-all duration-200 p-4"
                    style={{ background: accentBg, borderColor: accentBorder }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
                      (e.currentTarget as HTMLElement).style.boxShadow = `0 6px 24px ${action.color}20`;
                      (e.currentTarget as HTMLElement).style.borderColor = action.color;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                      (e.currentTarget as HTMLElement).style.boxShadow = "none";
                      (e.currentTarget as HTMLElement).style.borderColor = accentBorder;
                    }}
                    onMouseDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.98)"; }}
                    onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center mb-3 transition-transform duration-200 group-hover:scale-110"
                      style={{ background: action.color + "20" }}
                    >
                      <Icon className="w-4.5 h-4.5" style={{ color: action.color }} />
                    </div>
                    <div className="font-semibold text-sm leading-tight text-foreground mb-1">{action.label}</div>
                    <div className="text-xs leading-snug text-muted-foreground">{action.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick shortcut to Options Analyzer */}
          <button
            onClick={() => navigate("/analyzer")}
            className="w-full flex items-center justify-between px-5 py-3.5 rounded-xl border transition-all duration-200 group"
            style={{ background: "#8b5cf608", borderColor: "#8b5cf633" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "#8b5cf6";
              (e.currentTarget as HTMLElement).style.background = "#8b5cf610";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "#8b5cf633";
              (e.currentTarget as HTMLElement).style.background = "#8b5cf608";
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#8b5cf620" }}>
                <Activity className="w-4 h-4" style={{ color: "#8b5cf6" }} />
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold text-foreground">Options Analyzer + Payoff Lab</div>
                <div className="text-xs text-muted-foreground">15-strategy engine · Jade Lizard · BWB · Iron Condor · visual payoff chart</div>
              </div>
            </div>
            <svg className="w-4 h-4 opacity-40 group-hover:opacity-100 group-hover:translate-x-1 transition-all" style={{ color: "#8b5cf6" }} fill="none" viewBox="0 0 16 16">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

        </div>

        {/* ── This Week's Earnings ──────────────────────────────────── */}
        {thisWeekEarnings.length > 0 && (
          <div className="w-full max-w-3xl mt-6">
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="w-4 h-4" style={{ color: "#f59e0b" }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#f59e0b" }}>
                Earnings This Week — Your Watchlist
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {thisWeekEarnings.map((r: { ticker: string; daysToEarnings: number | null }) => (
                <button
                  key={r.ticker}
                  onClick={() => navigate(`${ROUTES.TICKER_ANALYSIS}?ticker=${r.ticker}`)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-medium transition-all duration-150 hover:scale-105 active:scale-95"
                  style={{
                    background: r.daysToEarnings != null && r.daysToEarnings <= 2
                      ? "rgba(239,68,68,0.10)"
                      : r.daysToEarnings != null && r.daysToEarnings <= 4
                      ? "rgba(249,115,22,0.10)"
                      : "rgba(245,158,11,0.10)",
                    borderColor: r.daysToEarnings != null && r.daysToEarnings <= 2
                      ? "rgba(239,68,68,0.35)"
                      : r.daysToEarnings != null && r.daysToEarnings <= 4
                      ? "rgba(249,115,22,0.35)"
                      : "rgba(245,158,11,0.35)",
                    color: r.daysToEarnings != null && r.daysToEarnings <= 2
                      ? "#dc2626"
                      : r.daysToEarnings != null && r.daysToEarnings <= 4
                      ? "#ea580c"
                      : "#b45309",
                  }}
                >
                  <span className="font-bold">{r.ticker}</span>
                  <span className="opacity-70 text-xs">
                    {r.daysToEarnings === 0 ? "today" : r.daysToEarnings === 1 ? "tomorrow" : `in ${r.daysToEarnings}d`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Full Quick Access Grid ──────────────────────────────────── */}
        <QuickAccessGrid />
      </div>
    </>
  );
}
