import React, { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { PitDeskLogo } from "@/components/PitDeskLogo";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import {
  Bell,
  CalendarDays,
  ChevronRight,
  Clock,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  Shield,
  Sun,
  TrendingUp,
  X,
  Zap,
  CalendarCheck,
  ArrowRight,
  Flame,
  Target,
  BarChart3,
  Activity,
} from "lucide-react";
import { ROUTES } from "@/lib/routes";

// ─── Default watchlist ────────────────────────────────────────────────────────
const DEFAULT_WATCHLIST = ["SNDK", "NVDA", "WDC", "MU", "TSLA", "AAPL", "AMD", "PLTR"];

// ─── Goal types ───────────────────────────────────────────────────────────────
const GOALS = [
  { key: "theta",    label: "Theta Income",   icon: Clock,         color: "#22c55e", desc: "Sell premium, collect time decay" },
  { key: "breakout", label: "Breakout Play",  icon: Zap,           color: "#f97316", desc: "Ride momentum on a technical break" },
  { key: "hedge",    label: "Hedge Position", icon: Shield,        color: "#3b82f6", desc: "Protect existing holdings" },
  { key: "earnings", label: "Earnings Trade", icon: CalendarCheck, color: "#8b5cf6", desc: "Play the IV crush or directional move" },
];

// ─── Custom SVG Icons ─────────────────────────────────────────────────────────
function RadarSweepIcon({ size = 18, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.5" strokeOpacity="0.3"/>
      <circle cx="12" cy="12" r="5.5" stroke={color} strokeWidth="1.5" strokeOpacity="0.5"/>
      <circle cx="12" cy="12" r="2" fill={color}/>
      <line x1="12" y1="12" x2="18.5" y2="5.5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeOpacity="0.9"/>
      <circle cx="18.5" cy="5.5" r="1.5" fill={color}/>
    </svg>
  );
}

function CrosshairCandleIcon({ size = 18, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="7" y="5" width="3.5" height="14" rx="1" fill={color} fillOpacity="0.8"/>
      <rect x="13" y="8" width="3.5" height="9" rx="1" fill={color} fillOpacity="0.5"/>
      <line x1="2" y1="12" x2="22" y2="12" stroke={color} strokeWidth="1.2" strokeOpacity="0.35" strokeDasharray="2 2"/>
      <line x1="12" y1="2" x2="12" y2="22" stroke={color} strokeWidth="1.2" strokeOpacity="0.35" strokeDasharray="2 2"/>
      <circle cx="12" cy="12" r="2.5" stroke={color} strokeWidth="1.5"/>
    </svg>
  );
}

// ─── Market Pulse Banner ──────────────────────────────────────────────────────
function MarketPulseBanner() {
  // Always use Eastern Time (ET) for market hours — NYSE/NASDAQ operate on ET
  const now = new Date();
  const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "numeric", hour12: false });
  const [etHourStr, etMinStr] = etStr.split(":");
  const etHour = parseInt(etHourStr, 10);
  const etMin = parseInt(etMinStr, 10);
  const dayOfWeek = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" })).getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isPreMarket = !isWeekend && (etHour < 9 || (etHour === 9 && etMin < 30));
  const isAfterHours = isWeekend || etHour >= 16;
  const isMarketOpen = !isWeekend && !isPreMarket && !isAfterHours;

  const session = isPreMarket ? "Pre-Market" : isAfterHours ? "After Hours" : "Market Open";
  const sessionColor = isMarketOpen ? "#22c55e" : "#f59e0b";

  // Static market context — in a real impl this would come from a live data feed
  const context = isPreMarket
    ? "Futures are active. Review your watchlist before the open."
    : isAfterHours
    ? "Market closed. Good time to plan tomorrow's trades."
    : "Market is live. Your setups are ready to analyze.";

  return (
    <div className="w-full max-w-4xl rounded-2xl border px-5 py-3.5 flex items-center gap-4"
      style={{ background: sessionColor + "08", borderColor: sessionColor + "25" }}>
      <div className="flex items-center gap-2 shrink-0">
        <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: sessionColor }} />
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: sessionColor }}>{session}</span>
      </div>
      <div className="w-px h-4 bg-border shrink-0" />
      <p className="text-sm text-muted-foreground">{context}</p>
      <button className="ml-auto shrink-0 text-xs font-semibold flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => window.location.href = "/scan"}>
        Scan now <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  );
}

// ─── Top Nav Bar ──────────────────────────────────────────────────────────────
function TopNavBar() {
  const [, navigate] = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  const quickLinks = [
    { label: "Home",      path: "/" },
    { label: "Scan",      path: "/scan" },
    { label: "Analyze",   path: "/ticker-analysis" },
    { label: "Lab",       path: "/analyzer" },
    { label: "Advisor",   path: "/pit-advisor" },
    { label: "Journal",   path: "/trade-log" },
    { label: "Playbook",  path: "/my-playbook" },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-b border-border/60">
      <div className="max-w-5xl mx-auto px-4 h-13 flex items-center justify-between gap-4">
        <button className="flex items-center gap-2.5 hover:opacity-80 transition-opacity shrink-0" onClick={() => navigate("/")}>
          <PitDeskLogo size={28} />
          <span className="font-black text-sm text-foreground tracking-tight">PitDesk</span>
        </button>

        <div className="hidden md:flex items-center gap-0.5">
          {quickLinks.map(link => (
            <button key={link.path} onClick={() => navigate(link.path)}
              className="px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-lg transition-all duration-150">
              {link.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {toggleTheme && (
            <button onClick={toggleTheme}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
              title={theme === "dark" ? "Light mode" : "Dark mode"}>
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          )}

          <button onClick={() => navigate("/dashboard")}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg text-white transition-all active:scale-95"
            style={{ background: "oklch(0.55 0.175 145)" }}>
            All Tools <ChevronRight className="h-3 w-3" />
          </button>

          <button className="md:hidden p-1.5 rounded-lg hover:bg-muted/60 transition-colors" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>

          {user && (
            <div className="relative group">
              <button className="w-7 h-7 rounded-full bg-green-100 text-green-700 text-xs font-black flex items-center justify-center hover:bg-green-200 transition-colors">
                {user.name?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) ?? "SA"}
              </button>
              <div className="absolute right-0 top-full mt-1 w-44 bg-background border border-border rounded-2xl shadow-lg py-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
                <div className="px-3 py-2 border-b border-border/60">
                  <div className="text-xs font-bold truncate">{user.name}</div>
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
          <div className="grid grid-cols-3 gap-1">
            {quickLinks.map(link => (
              <button key={link.path} onClick={() => { navigate(link.path); setMenuOpen(false); }}
                className="px-3 py-2 text-xs font-semibold text-left text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-lg transition-all">
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
    <div className="flex-1 rounded-2xl border-2 p-6 flex flex-col gap-5 transition-all duration-200 hover:shadow-lg"
      style={{ borderColor: "#22c55e30", background: "oklch(0.98 0.005 145)" }}>
      <div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-3"
          style={{ background: "#22c55e15", color: "#16a34a" }}>
          <CrosshairCandleIcon size={11} color="#16a34a" />
          Start with a Ticker
        </div>
        <h2 className="text-xl font-black text-foreground leading-tight">I have a ticker in mind</h2>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
          Type any ticker. Answer 3 quick questions. Get the best strategy, liquidity check, and payoff curve — instantly.
        </p>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <input
            ref={inputRef}
            value={ticker}
            onChange={e => setTicker(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            placeholder="SNDK, NVDA, AAPL…"
            className="w-full pl-9 pr-3 py-2.5 text-sm font-semibold rounded-xl border border-border bg-white focus:outline-none focus:ring-2 focus:border-green-500 transition-all placeholder:text-muted-foreground/40 placeholder:font-normal"
            style={{ "--tw-ring-color": "#22c55e40" } as React.CSSProperties}
          />
        </div>
        <button
          onClick={() => handleSubmit()}
          className="px-4 py-2.5 text-white text-sm font-bold rounded-xl transition-all duration-150 active:scale-95 flex items-center gap-1.5"
          style={{ background: "oklch(0.55 0.175 145)" }}>
          <Search className="h-3.5 w-3.5" />
          Analyze
        </button>
      </div>

      <div>
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Your watchlist</div>
        <div className="flex flex-wrap gap-1.5">
          {displayTickers.map(t => (
            <button key={t} onClick={() => handleSubmit(t)}
              className="px-2.5 py-1 text-xs font-bold rounded-lg border transition-all duration-150 active:scale-95"
              style={{ background: "#22c55e10", color: "#16a34a", borderColor: "#22c55e30" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#22c55e20"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#22c55e10"; }}>
              {t}
            </button>
          ))}
          <button onClick={() => navigate("/watchlist")}
            className="px-2.5 py-1 text-xs font-bold rounded-lg border border-dashed border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-all flex items-center gap-1">
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

  return (
    <div className="flex-1 rounded-2xl border-2 p-6 flex flex-col gap-5 transition-all duration-200 hover:shadow-lg"
      style={{ borderColor: "#8b5cf630", background: "oklch(0.98 0.005 270)" }}>
      <div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-3"
          style={{ background: "#8b5cf615", color: "#7c3aed" }}>
          <RadarSweepIcon size={11} color="#7c3aed" />
          Start with a Goal
        </div>
        <h2 className="text-xl font-black text-foreground leading-tight">I have a trading goal</h2>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
          Tell PitDesk what you want to achieve. It finds the best tickers and strategies that match your objective.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 flex-1">
        {GOALS.map(goal => {
          const Icon = goal.icon;
          return (
            <button key={goal.key}
              onClick={() => navigate(`/goal-scan?goal=${goal.key}`)}
              className="group flex flex-col items-start gap-2.5 p-3.5 rounded-xl border-2 bg-white hover:shadow-sm transition-all duration-150 active:scale-95 text-left"
              style={{ borderColor: goal.color + "25" }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = goal.color + "70";
                (e.currentTarget as HTMLElement).style.background = goal.color + "06";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = goal.color + "25";
                (e.currentTarget as HTMLElement).style.background = "white";
              }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center transition-transform duration-150 group-hover:scale-110"
                style={{ background: goal.color + "15" }}>
                <Icon className="h-4 w-4" style={{ color: goal.color }} />
              </div>
              <div>
                <div className="text-sm font-bold text-foreground leading-tight">{goal.label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{goal.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Today's Setups — outcome-first, no tool names ────────────────────────────
function TodaysSetups({ watchlistTickers }: { watchlistTickers: string[] }) {
  const [, navigate] = useLocation();
  const tickers = useMemo(() => (watchlistTickers.length > 0 ? watchlistTickers.slice(0, 5) : DEFAULT_WATCHLIST.slice(0, 5)), [watchlistTickers.join(",")]);

  const { data: pcrData } = trpc.pcr.getBatch.useQuery(
    { tickers },
    { retry: 1, staleTime: 5 * 60 * 1000 }
  );

  const setups = useMemo(() => {
    if (!pcrData?.length) return [];
    return (pcrData as any[])
      .filter((d: any) => d.pcrOI != null)
      .map((d: any) => {
        const pcr = d.pcrOI as number;
        const isBullish = pcr > 1.15;
        const isBearish = pcr < 0.85;
        const isNeutral = !isBullish && !isBearish;
        const signal = isBullish ? "Premium Selling Setup" : isBearish ? "Directional Opportunity" : "Neutral — Wait or Straddle";
        const reason = isBullish
          ? `Put/call ratio ${pcr.toFixed(2)} — elevated put buying suggests oversold conditions`
          : isBearish
          ? `Put/call ratio ${pcr.toFixed(2)} — call buying dominant, bullish momentum`
          : `Put/call ratio ${pcr.toFixed(2)} — balanced, low directional edge`;
        const color = isBullish ? "#22c55e" : isBearish ? "#ef4444" : "#6b7280";
        const strength = isBullish || isBearish ? "Strong" : "Weak";
        return { ticker: d.ticker, signal, reason, color, strength, pcr };
      })
      .sort((a: any, b: any) => {
        const scoreA = Math.abs(a.pcr - 1);
        const scoreB = Math.abs(b.pcr - 1);
        return scoreB - scoreA;
      })
      .slice(0, 3);
  }, [pcrData]);

  if (!setups.length) return null;

  return (
    <div className="w-full max-w-4xl mt-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-500" />
          <h3 className="text-sm font-black text-foreground uppercase tracking-wider">Today's Best Setups</h3>
          <span className="text-[10px] text-muted-foreground font-medium">from your watchlist</span>
        </div>
        <button onClick={() => navigate("/scan")}
          className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
          See all signals <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {setups.map((setup: any) => (
          <button key={setup.ticker}
            onClick={() => navigate(`/ticker-analysis?ticker=${setup.ticker}`)}
            className="group text-left p-4 rounded-2xl border bg-background hover:shadow-md transition-all duration-200 active:scale-[0.98]"
            style={{ borderColor: setup.color + "30" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = setup.color + "70"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = setup.color + "30"; }}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-lg font-black text-foreground">{setup.ticker}</div>
                <div className="text-xs font-bold mt-0.5" style={{ color: setup.color }}>{setup.signal}</div>
              </div>
              <div className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                style={{ background: setup.color + "15", color: setup.color }}>
                {setup.strength}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">{setup.reason}</p>
            <div className="flex items-center gap-1 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: setup.color }}>
              Analyze this trade <ArrowRight className="h-3 w-3" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Earnings Alert Strip ─────────────────────────────────────────────────────
function EarningsAlerts({ watchlistTickers }: { watchlistTickers: string[] }) {
  const [, navigate] = useLocation();
  const earningsMutation = trpc.earningsCalendar.scanTickers.useMutation();

  useEffect(() => {
    if (watchlistTickers.length > 0 && !earningsMutation.data && !earningsMutation.isPending) {
      earningsMutation.mutate({ tickers: watchlistTickers.slice(0, 20) });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlistTickers.join(",")]);

  const thisWeek = (earningsMutation.data ?? [])
    .filter((r: { daysToEarnings: number | null }) => r.daysToEarnings != null && r.daysToEarnings >= 0 && r.daysToEarnings <= 7)
    .sort((a: { daysToEarnings: number | null }, b: { daysToEarnings: number | null }) =>
      (a.daysToEarnings ?? 99) - (b.daysToEarnings ?? 99));

  if (!thisWeek.length) return null;

  return (
    <div className="w-full max-w-4xl mt-6">
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays className="w-4 h-4 text-amber-500" />
        <span className="text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
          Earnings This Week — Your Watchlist
        </span>
        <span className="text-[10px] text-muted-foreground">Watch for IV crush opportunities</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {thisWeek.map((r: { ticker: string; daysToEarnings: number | null }) => {
          const urgency = r.daysToEarnings != null && r.daysToEarnings <= 2 ? "#ef4444"
            : r.daysToEarnings != null && r.daysToEarnings <= 4 ? "#f97316" : "#f59e0b";
          return (
            <button key={r.ticker}
              onClick={() => navigate(`${ROUTES.TICKER_ANALYSIS}?ticker=${r.ticker}`)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-bold transition-all duration-150 hover:scale-105 active:scale-95"
              style={{ background: urgency + "12", borderColor: urgency + "35", color: urgency }}>
              {r.ticker}
              <span className="opacity-70 text-xs font-medium">
                {r.daysToEarnings === 0 ? "today" : r.daysToEarnings === 1 ? "tomorrow" : `in ${r.daysToEarnings}d`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Quick Nav Shortcuts ──────────────────────────────────────────────────────
function QuickNav() {
  const [, navigate] = useLocation();

  const shortcuts = [
    { icon: <RadarSweepIcon size={16} color="#22c55e" />, label: "Scan for Setups", sub: "All signals, ranked", path: "/scan", color: "#22c55e" },
    { icon: <CrosshairCandleIcon size={16} color="#6366f1" />, label: "Analyze a Ticker", sub: "Best strategy + payoff", path: "/ticker-analysis", color: "#6366f1" },
    { icon: <Activity className="h-4 w-4" style={{ color: "#f59e0b" }} />, label: "Test a Structure", sub: "Build & visualize payout", path: "/analyzer", color: "#f59e0b" },
    { icon: <BarChart3 className="h-4 w-4" style={{ color: "#ec4899" }} />, label: "Review My Trades", sub: "Journal + performance", path: "/trade-log", color: "#ec4899" },
    { icon: <Target className="h-4 w-4" style={{ color: "#3b82f6" }} />, label: "My Playbook", sub: "Rules + style profile", path: "/my-playbook", color: "#3b82f6" },
    { icon: <TrendingUp className="h-4 w-4" style={{ color: "#8b5cf6" }} />, label: "Ask the Advisor", sub: "5-dimension coaching", path: "/pit-advisor", color: "#8b5cf6" },
  ];

  return (
    <div className="w-full max-w-4xl mt-10">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-black text-muted-foreground uppercase tracking-wider">Quick Access</h3>
        <button onClick={() => navigate("/dashboard")}
          className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
          All tools <ChevronRight className="h-3 w-3" />
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {shortcuts.map(s => (
          <button key={s.path} onClick={() => navigate(s.path)}
            className="group flex flex-col items-start gap-2 p-3.5 rounded-2xl border border-border/60 bg-background hover:shadow-sm transition-all duration-150 text-left"
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = s.color + "60";
              (e.currentTarget as HTMLElement).style.background = s.color + "06";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = "";
              (e.currentTarget as HTMLElement).style.background = "";
            }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center transition-transform duration-150 group-hover:scale-110"
              style={{ background: s.color + "15" }}>
              {s.icon}
            </div>
            <div>
              <div className="text-xs font-bold text-foreground leading-tight">{s.label}</div>
              <div className="text-[10px] text-muted-foreground/70 mt-0.5 leading-tight">{s.sub}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Home() {
  const { user } = useAuth();

  const { data: watchlistItems } = trpc.watchlist.list.useQuery(undefined, { retry: 1 });
  const watchlistTickers = useMemo(
    () => (watchlistItems ?? []).map((w: { ticker: string }) => w.ticker),
    [watchlistItems]
  );

  const firstName = user?.name?.split(" ")[0] ?? "Sridhar";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <TopNavBar />

      <div className="min-h-screen flex flex-col items-center px-4 pt-20 pb-16 bg-background">

        {/* ── Hero greeting ─────────────────────────────────────────────── */}
        <div className="w-full max-w-4xl mt-8 mb-5">
          <h1 className="text-3xl font-black text-foreground tracking-tight">
            {greeting}, {firstName} —{" "}
            <span className="text-muted-foreground font-normal">what's your move today?</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Start with a ticker or a goal. PitDesk handles the rest.
          </p>
        </div>

        {/* ── Market pulse banner ───────────────────────────────────────── */}
        <MarketPulseBanner />

        {/* ── Dual entry cards ──────────────────────────────────────────── */}
        <div className="w-full max-w-4xl flex flex-col md:flex-row gap-4 mt-5">
          <TickerEntryCard watchlistTickers={watchlistTickers} />
          <GoalEntryCard />
        </div>

        {/* ── Earnings alerts ───────────────────────────────────────────── */}
        <EarningsAlerts watchlistTickers={watchlistTickers} />

        {/* ── Today's setups ────────────────────────────────────────────── */}
        <TodaysSetups watchlistTickers={watchlistTickers} />

        {/* ── Quick nav shortcuts ───────────────────────────────────────── */}
        <QuickNav />

      </div>
    </>
  );
}
