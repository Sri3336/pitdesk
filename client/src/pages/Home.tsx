import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { PitDeskLogo } from "@/components/PitDeskLogo";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
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
  Clock,
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
  Moon,
  Radio,
  Scan,
  Search,
  Settings,
  Shield,
  Sparkles,
  Sun,
  Sunrise,
  Target,
  TrendingDown,
  TrendingUp,
  Upload,
  X,
  Zap,
  Crosshair,
  FlaskConical as Flask,
  ShieldCheck,
  CalendarCheck,
  Plus,
} from "lucide-react";
import { ROUTES } from "@/lib/routes";

// ─── All features for Quick Access grid ──────────────────────────────────────
const ALL_FEATURES = [
  { icon: BarChart2,        label: "PCR Dashboard",         path: "/pcr-dashboard",        group: "Analysis",    color: "#22c55e" },
  { icon: TrendingUp,       label: "PCR Strategy",          path: "/pcr-strategy",         group: "Analysis",    color: "#22c55e" },
  { icon: CandlestickChart, label: "Charts",                path: "/charts",               group: "Analysis",    color: "#3b82f6" },
  { icon: Scan,             label: "Scan All",              path: "/scan-all",             group: "Analysis",    color: "#3b82f6" },
  { icon: Activity,         label: "Options Analyzer",      path: "/analyzer",             group: "Analysis",    color: "#8b5cf6" },
  { icon: ClipboardList,    label: "Watchlist",             path: "/watchlist",            group: "Analysis",    color: "#6366f1" },
  { icon: Radio,            label: "Earnings Calendar",     path: "/earnings-calendar",    group: "Analysis",    color: "#f59e0b" },
  { icon: LineChart,        label: "Velez Scanner",         path: "/velez-scanner",        group: "Strategies",  color: "#22c55e" },
  { icon: Activity,         label: "Intraday Scanner",      path: "/intraday-scanner",     group: "Strategies",  color: "#3b82f6" },
  { icon: GitMerge,         label: "VCP Strategy",          path: "/vcp-strategy",         group: "Strategies",  color: "#8b5cf6" },
  { icon: Zap,              label: "Catalyst Watch",        path: "/catalyst-watch",       group: "Strategies",  color: "#f59e0b" },
  { icon: TrendingDown,     label: "ICT Supply Zone",       path: "/ict-supply-zone",      group: "Strategies",  color: "#ef4444" },
  { icon: TrendingUp,       label: "EMA Pullback",          path: "/ema-pullback",         group: "Strategies",  color: "#22c55e" },
  { icon: Target,           label: "Opening Range Scalper", path: "/velez-scanner?tab=ors",group: "Strategies",  color: "#f97316" },
  { icon: Bell,             label: "IVR Alerts",            path: "/ivr-alerts",           group: "Alerts",      color: "#f59e0b" },
  { icon: Bell,             label: "VCP Alerts",            path: "/vcp-alerts",           group: "Alerts",      color: "#f59e0b" },
  { icon: Sparkles,         label: "Fib+EMA Alerts",        path: "/fib-ema-alerts",       group: "Alerts",      color: "#8b5cf6" },
  { icon: MessageSquare,    label: "Pit Advisor",           path: "/pit-advisor",          group: "Execution",   color: "#22c55e" },
  { icon: Zap,              label: "AI Agent",              path: "/agent",                group: "Execution",   color: "#8b5cf6" },
  { icon: Shield,           label: "Pre-Market Checklist",  path: "/pre-market",           group: "Execution",   color: "#3b82f6" },
  { icon: Sunrise,          label: "Morning Session",       path: "/morning-session",      group: "Execution",   color: "#f59e0b" },
  { icon: ListChecks,       label: "Swing Watchlist",       path: "/swing-watchlist",      group: "Execution",   color: "#22c55e" },
  { icon: MapPin,           label: "Liquidity Map",         path: "/liquidity-map",        group: "Execution",   color: "#6366f1" },
  { icon: ClipboardList,    label: "Trade Log",             path: "/trade-log",            group: "Execution",   color: "#3b82f6" },
  { icon: Upload,           label: "Analyze My Trades",     path: "/trade-upload",         group: "Execution",   color: "#f97316" },
  { icon: BarChart2,        label: "Performance",           path: "/performance",          group: "Execution",   color: "#22c55e" },
  { icon: BookOpen,         label: "Trade Proposals",       path: "/trade-proposals",      group: "Execution",   color: "#8b5cf6" },
  { icon: BookMarked,       label: "My Playbook",           path: "/my-playbook",          group: "Playbook",    color: "#22c55e" },
  { icon: FlaskConical,     label: "Backtester",            path: "/backtester",           group: "Backtesting", color: "#6366f1" },
  { icon: Calculator,       label: "Position Sizer",        path: "/position-sizer",       group: "Backtesting", color: "#3b82f6" },
  { icon: Zap,              label: "Options Flow",          path: "/options-flow",         group: "Data",        color: "#f59e0b" },
  { icon: Database,         label: "COT Dashboard",         path: "/cot-dashboard",        group: "Data",        color: "#6366f1" },
  { icon: HardDrive,        label: "Historical Data",       path: "/historical-data",      group: "Data",        color: "#3b82f6" },
  { icon: Building2,        label: "Broker Settings",       path: "/broker-settings",      group: "Data",        color: "#6b7280" },
  { icon: HelpCircle,       label: "Methodology",           path: "/methodology",          group: "Data",        color: "#6b7280" },
  { icon: HelpCircle,       label: "Glossary",              path: "/glossary",             group: "Data",        color: "#6b7280" },
];

const GROUPS = ["Analysis", "Strategies", "Alerts", "Execution", "Playbook", "Backtesting", "Data"];

// ─── Default watchlist tickers ────────────────────────────────────────────────
const DEFAULT_WATCHLIST = ["SNDK", "NVDA", "WDC", "MU", "TSLA", "AAPL", "AMD", "PLTR"];

// ─── Goal types ───────────────────────────────────────────────────────────────
const GOALS = [
  { key: "theta",    label: "Theta Income",   icon: Clock,         color: "#22c55e", desc: "Sell premium, collect time decay" },
  { key: "breakout", label: "Breakout Play",  icon: Zap,           color: "#f97316", desc: "Ride momentum on a technical break" },
  { key: "hedge",    label: "Hedge Position", icon: ShieldCheck,   color: "#3b82f6", desc: "Protect existing holdings" },
  { key: "earnings", label: "Earnings Trade", icon: CalendarCheck, color: "#8b5cf6", desc: "Play the IV crush or directional move" },
];

// ─── Top Nav Bar ──────────────────────────────────────────────────────────────
function TopNavBar() {
  const [, navigate] = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  const quickLinks = [
    { label: "Dashboard",   path: "/dashboard" },
    { label: "My Playbook", path: "/my-playbook" },
    { label: "PCR",         path: "/pcr-dashboard" },
    { label: "Velez",       path: "/velez-scanner" },
    { label: "Pit Advisor", path: "/pit-advisor" },
    { label: "Trade Log",   path: "/trade-log" },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border/60 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 h-12 flex items-center justify-between">
        <button className="flex items-center gap-2 hover:opacity-80 transition-opacity" onClick={() => navigate("/")}>
          <PitDeskLogo size={28} />
          <span className="font-bold text-sm text-foreground">PitDesk</span>
        </button>

        <div className="hidden md:flex items-center gap-0.5">
          {quickLinks.map(link => (
            <button key={link.path} onClick={() => navigate(link.path)}
              className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-all duration-150">
              {link.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          {toggleTheme && (
            <button onClick={toggleTheme}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          )}

          <button onClick={() => navigate("/dashboard")}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
            All Tools <ChevronRight className="h-3 w-3" />
          </button>

          <button className="md:hidden p-1.5 rounded-md hover:bg-muted/60 transition-colors" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>

          {user && (
            <div className="relative group">
              <button className="w-7 h-7 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center hover:bg-green-200 transition-colors">
                {user.name?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) ?? "SA"}
              </button>
              <div className="absolute right-0 top-full mt-1 w-44 bg-background border border-border rounded-xl shadow-lg py-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
                <div className="px-3 py-2 border-b border-border/60">
                  <div className="text-xs font-semibold truncate">{user.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{user.email}</div>
                </div>
                <button onClick={() => navigate("/profile")}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted/60 transition-colors">
                  <Settings className="h-3.5 w-3.5" /> Account Settings
                </button>
                <button onClick={logout}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 transition-colors">
                  <LogOut className="h-3.5 w-3.5" /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden border-t border-border/60 bg-background/95 backdrop-blur-md px-4 py-3">
          <div className="grid grid-cols-2 gap-1">
            {quickLinks.map(link => (
              <button key={link.path} onClick={() => { navigate(link.path); setMenuOpen(false); }}
                className="px-3 py-2 text-xs font-medium text-left text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-all">
                {link.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}

// ─── Ticker Entry Card ────────────────────────────────────────────────────────
function TickerEntryCard({ watchlistTickers }: { watchlistTickers: string[] }) {
  const [, navigate] = useLocation();
  const [ticker, setTicker] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const displayTickers = watchlistTickers.length > 0 ? watchlistTickers.slice(0, 8) : DEFAULT_WATCHLIST;

  function handleSubmit(t?: string) {
    const sym = (t ?? ticker).toUpperCase().trim();
    if (!sym) return;
    navigate(`/ticker-analysis?ticker=${sym}`);
  }

  return (
    <div className="flex-1 rounded-2xl border-2 border-green-200 bg-green-50/40 dark:bg-green-950/20 dark:border-green-800/40 p-6 flex flex-col gap-4 transition-all duration-200 hover:border-green-300 hover:shadow-md hover:shadow-green-100/50 dark:hover:shadow-green-900/20">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 text-[10px] font-bold uppercase tracking-widest mb-3">
          <Crosshair className="h-3 w-3" />
          Start with a Ticker
        </div>
        <h2 className="text-xl font-bold text-foreground leading-tight">I have a ticker in mind</h2>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          Type any ticker and answer 3 quick questions. PitDesk finds the best strategy with a full liquidity check and payoff visualization.
        </p>
      </div>

      {/* Search input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
          <input
            ref={inputRef}
            value={ticker}
            onChange={e => setTicker(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            placeholder="Enter ticker... e.g. SNDK, NVDA, AAPL"
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 transition-all placeholder:text-muted-foreground/50"
          />
        </div>
        <button
          onClick={() => handleSubmit()}
          className="px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-all duration-150 active:scale-95 flex items-center gap-1.5"
        >
          <Search className="h-3.5 w-3.5" />
          Analyze
        </button>
      </div>

      {/* Watchlist chips */}
      <div>
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Your watchlist</div>
        <div className="flex flex-wrap gap-1.5">
          {displayTickers.map(t => (
            <button
              key={t}
              onClick={() => handleSubmit(t)}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/50 hover:bg-green-200 dark:hover:bg-green-800/40 hover:border-green-400 transition-all duration-150 active:scale-95"
            >
              {t}
            </button>
          ))}
          <button
            onClick={() => navigate("/watchlist")}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-muted/60 text-muted-foreground border border-border hover:bg-muted transition-all duration-150 flex items-center gap-1"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Goal Entry Card ──────────────────────────────────────────────────────────
function GoalEntryCard() {
  const [, navigate] = useLocation();

  function handleGoal(key: string) {
    navigate(`/ticker-analysis?goal=${key}`);
  }

  return (
    <div className="flex-1 rounded-2xl border-2 border-purple-200 bg-purple-50/40 dark:bg-purple-950/20 dark:border-purple-800/40 p-6 flex flex-col gap-4 transition-all duration-200 hover:border-purple-300 hover:shadow-md hover:shadow-purple-100/50 dark:hover:shadow-purple-900/20">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400 text-[10px] font-bold uppercase tracking-widest mb-3">
          <Target className="h-3 w-3" />
          Start with a Goal
        </div>
        <h2 className="text-xl font-bold text-foreground leading-tight">I have a trading goal</h2>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          Tell PitDesk what you want to achieve. We find the best tickers and strategies that match your objective.
        </p>
      </div>

      {/* Goal buttons 2×2 */}
      <div className="grid grid-cols-2 gap-2 flex-1">
        {GOALS.map(goal => {
          const Icon = goal.icon;
          return (
            <button
              key={goal.key}
              onClick={() => handleGoal(goal.key)}
              className="group flex flex-col items-start gap-2 p-3.5 rounded-xl border-2 bg-background hover:shadow-sm transition-all duration-150 active:scale-95 text-left"
              style={{ borderColor: goal.color + "30" }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = goal.color + "80";
                (e.currentTarget as HTMLElement).style.background = goal.color + "08";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = goal.color + "30";
                (e.currentTarget as HTMLElement).style.background = "";
              }}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-transform duration-150 group-hover:scale-110"
                style={{ background: goal.color + "18" }}>
                <Icon className="h-4 w-4" style={{ color: goal.color }} />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground leading-tight">{goal.label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{goal.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── What's Active Now Strip ──────────────────────────────────────────────────
const HOT_TICKERS = ["NVDA", "TSLA", "AAPL", "AMD", "PLTR"];

function WhatsActiveNow() {
  const [, navigate] = useLocation();

  // Fetch PCR for a handful of hot tickers
  const pcrTickers = React.useMemo(() => HOT_TICKERS, []);
  const { data: pcrData } = trpc.pcr.getBatch.useQuery(
    { tickers: pcrTickers },
    { retry: 1, staleTime: 5 * 60 * 1000 }
  );

  // Fetch IVR alerts
  const { data: ivrAlerts } = trpc.ivrAlerts.list.useQuery(undefined, {
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  // Get top PCR signal (most bullish or bearish)
  const topPcr = React.useMemo(() => {
    if (!pcrData?.length) return null;
    const sorted = [...pcrData].sort((a: any, b: any) => {
      const scoreA = Math.abs((a.pcrOI ?? 1) - 1);
      const scoreB = Math.abs((b.pcrOI ?? 1) - 1);
      return scoreB - scoreA;
    });
    return sorted[0] as any;
  }, [pcrData]);

  // Get top IVR alert (highest IVR)
  const topIvr = React.useMemo(() => {
    if (!ivrAlerts?.length) return null;
    return [...ivrAlerts].sort((a: any, b: any) => (b.currentIvr ?? 0) - (a.currentIvr ?? 0))[0] as any;
  }, [ivrAlerts]);

  const cards = [
    {
      key: "pcr",
      label: "PCR Signal",
      available: !!topPcr,
      content: topPcr ? {
        ticker: topPcr.ticker,
        value: (topPcr.pcrOI ?? 1).toFixed(2),
        signal: (topPcr.pcrOI ?? 1) > 1.1 ? "Bullish" : (topPcr.pcrOI ?? 1) < 0.9 ? "Bearish" : "Neutral",
        color: (topPcr.pcrOI ?? 1) > 1.1 ? "#22c55e" : (topPcr.pcrOI ?? 1) < 0.9 ? "#ef4444" : "#6b7280",
      } : null,
      path: "/pcr-dashboard",
      icon: BarChart2,
      iconColor: "#22c55e",
    },
    {
      key: "velez",
      label: "Top Setup",
      available: false,
      content: null,
      path: "/velez-scanner",
      icon: TrendingUp,
      iconColor: "#3b82f6",
    },
    {
      key: "ivr",
      label: "IVR Alert",
      available: !!topIvr,
      content: topIvr ? {
        ticker: topIvr.ticker,
        value: `IVR ${Math.round(topIvr.currentIvr ?? 0)}`,
        signal: topIvr.currentIvr >= 70 ? "High" : topIvr.currentIvr >= 50 ? "Elevated" : "Normal",
        color: topIvr.currentIvr >= 70 ? "#ef4444" : topIvr.currentIvr >= 50 ? "#f59e0b" : "#22c55e",
      } : null,
      path: "/ivr-alerts",
      icon: Bell,
      iconColor: "#f59e0b",
    },
  ];

  return (
    <div className="w-full max-w-4xl mt-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🔥</span>
          <h3 className="text-sm font-semibold text-foreground">What's Active Now</h3>
        </div>
        <button onClick={() => navigate("/dashboard")}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
          View All <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <button key={card.key} onClick={() => navigate(card.path)}
              className="group flex items-center gap-3 p-4 rounded-xl border border-border bg-background hover:border-border/80 hover:shadow-sm transition-all duration-150 text-left active:scale-[0.98]">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-110"
                style={{ background: card.iconColor + "15" }}>
                <Icon className="h-5 w-5" style={{ color: card.iconColor }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{card.label}</div>
                {card.available && card.content ? (
                  <>
                    <div className="text-sm font-bold text-foreground truncate">{card.content.ticker}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs font-semibold" style={{ color: card.content.color }}>{card.content.signal}</span>
                      <span className="text-xs text-muted-foreground">{card.content.value}</span>
                    </div>
                  </>
                ) : (
                  <div className="text-sm font-medium text-muted-foreground/60 mt-0.5">No active signal</div>
                )}
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Quick Access Grid ────────────────────────────────────────────────────────
function QuickAccessGrid() {
  const [, navigate] = useLocation();
  const [activeGroup, setActiveGroup] = useState<string>("All");

  const filtered = activeGroup === "All" ? ALL_FEATURES : ALL_FEATURES.filter(f => f.group === activeGroup);

  return (
    <div className="w-full max-w-4xl mt-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-foreground/80 uppercase tracking-wider">All Tools</h2>
        <span className="text-xs text-muted-foreground">{ALL_FEATURES.length} features</span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mb-4">
        {["All", ...GROUPS].map(g => (
          <button key={g} onClick={() => setActiveGroup(g)}
            className={`px-2.5 py-1 text-[10px] font-semibold rounded-full border transition-all duration-150 ${
              activeGroup === g
                ? "bg-green-600 text-white border-green-600"
                : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
            }`}>
            {g}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {filtered.map(feature => {
          const Icon = feature.icon;
          return (
            <button key={feature.path} onClick={() => navigate(feature.path)}
              className="group flex flex-col items-start gap-2 p-3 rounded-xl border border-border/60 bg-background hover:border-border hover:shadow-sm transition-all duration-150 text-left"
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = feature.color + "60";
                (e.currentTarget as HTMLElement).style.background = feature.color + "08";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = "";
                (e.currentTarget as HTMLElement).style.background = "";
              }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-110"
                style={{ background: feature.color + "18" }}>
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

  // Fetch user's watchlist
  const { data: watchlistItems } = trpc.watchlist.list.useQuery(undefined, { retry: 1 });
  const watchlistTickers = React.useMemo(
    () => (watchlistItems ?? []).map((w: { ticker: string }) => w.ticker),
    [watchlistItems]
  );

  // Scan watchlist for earnings this week
  const earningsMutation = trpc.earningsCalendar.scanTickers.useMutation();
  useEffect(() => {
    if (watchlistTickers.length > 0 && !earningsMutation.data && !earningsMutation.isPending) {
      earningsMutation.mutate({ tickers: watchlistTickers.slice(0, 20) });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlistTickers.join(",")]);

  const thisWeekEarnings = (earningsMutation.data ?? []).filter(
    (r: { daysToEarnings: number | null }) => r.daysToEarnings != null && r.daysToEarnings >= 0 && r.daysToEarnings <= 7
  ).sort((a: { daysToEarnings: number | null }, b: { daysToEarnings: number | null }) =>
    (a.daysToEarnings ?? 99) - (b.daysToEarnings ?? 99)
  );

  const firstName = user?.name?.split(" ")[0] ?? "Sridhar";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <TopNavBar />

      <div className="min-h-screen flex flex-col items-center px-4 pt-20 pb-16 bg-background">

        {/* ── Hero greeting ─────────────────────────────────────────────── */}
        <div className="w-full max-w-4xl mt-8 mb-6">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            {greeting}, {firstName} —{" "}
            <span className="text-muted-foreground font-normal">what's your move today?</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Start with a ticker or a goal. PitDesk handles the rest.
          </p>
        </div>

        {/* ── Dual entry cards ──────────────────────────────────────────── */}
        <div className="w-full max-w-4xl flex flex-col md:flex-row gap-4">
          <TickerEntryCard watchlistTickers={watchlistTickers} />
          <GoalEntryCard />
        </div>

        {/* ── Earnings this week ────────────────────────────────────────── */}
        {thisWeekEarnings.length > 0 && (
          <div className="w-full max-w-4xl mt-6">
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Earnings This Week — Your Watchlist
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {thisWeekEarnings.map((r: { ticker: string; daysToEarnings: number | null }) => (
                <button key={r.ticker}
                  onClick={() => navigate(`${ROUTES.TICKER_ANALYSIS}?ticker=${r.ticker}`)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-medium transition-all duration-150 hover:scale-105 active:scale-95"
                  style={{
                    background: r.daysToEarnings != null && r.daysToEarnings <= 2 ? "rgba(239,68,68,0.10)" : r.daysToEarnings != null && r.daysToEarnings <= 4 ? "rgba(249,115,22,0.10)" : "rgba(245,158,11,0.10)",
                    borderColor: r.daysToEarnings != null && r.daysToEarnings <= 2 ? "rgba(239,68,68,0.35)" : r.daysToEarnings != null && r.daysToEarnings <= 4 ? "rgba(249,115,22,0.35)" : "rgba(245,158,11,0.35)",
                    color: r.daysToEarnings != null && r.daysToEarnings <= 2 ? "#dc2626" : r.daysToEarnings != null && r.daysToEarnings <= 4 ? "#ea580c" : "#b45309",
                  }}>
                  <span className="font-bold">{r.ticker}</span>
                  <span className="opacity-70 text-xs">
                    {r.daysToEarnings === 0 ? "today" : r.daysToEarnings === 1 ? "tomorrow" : `in ${r.daysToEarnings}d`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── What's Active Now ─────────────────────────────────────────── */}
        <WhatsActiveNow />

        {/* ── Quick Access Grid ─────────────────────────────────────────── */}
        <QuickAccessGrid />
      </div>
    </>
  );
}
