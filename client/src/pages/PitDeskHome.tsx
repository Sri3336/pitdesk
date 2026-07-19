import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp, TrendingDown, Activity, BarChart2, Target,
  Calendar, Zap, ArrowRight, Clock, AlertTriangle, CheckCircle2,
  LineChart, Scan, Globe, MessageSquare, Bell, ChevronRight,
  Flame, RefreshCw,
} from "lucide-react";
import { DrawdownMonitor } from "@/components/pitdesk/DrawdownMonitor";
import { useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";

// ─── Animated ticker tape ─────────────────────────────────────────────────────
const TICKER_ITEMS = [
  { sym: "SPY", val: "741.75", chg: "+0.82%" },
  { sym: "QQQ", val: "721.34", chg: "+1.14%" },
  { sym: "NQ", val: "30,618", chg: "-0.33%" },
  { sym: "VIX", val: "17.44", chg: "+4.21%" },
  { sym: "GLD", val: "387.12", chg: "-0.38%" },
  { sym: "TLT", val: "94.22", chg: "+0.61%" },
  { sym: "DXY", val: "104.8", chg: "-0.22%" },
  { sym: "BTC", val: "107,240", chg: "+2.14%" },
];

function TickerTape() {
  return (
    <div className="overflow-hidden w-full relative" style={{ maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)" }}>
      <div className="flex gap-8 animate-[ticker_30s_linear_infinite] whitespace-nowrap w-max">
        {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => {
          const up = item.chg.startsWith("+");
          return (
            <span key={i} className="inline-flex items-center gap-2 text-sm">
              <span className="font-bold text-white">{item.sym}</span>
              <span className="text-slate-300">{item.val}</span>
              <span className={up ? "text-green-400" : "text-red-400"}>{item.chg}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Market index card ────────────────────────────────────────────────────────
function IndexCard({ name, value, change, pct, loading }: {
  name: string; value: string; change: number; pct: number; loading?: boolean;
}) {
  const up = change >= 0;
  if (loading) return (
    <div className="flex flex-col gap-1 px-4 py-3 rounded-xl border bg-white shadow-sm">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-6 w-20 mt-1" />
      <Skeleton className="h-3 w-14 mt-0.5" />
    </div>
  );
  return (
    <div className="card-hover flex flex-col gap-0.5 px-4 py-3 rounded-xl border bg-white shadow-sm"
      style={{ borderColor: "oklch(0.92 0.006 240)" }}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{name}</span>
      <span className="text-lg font-bold" style={{ color: "oklch(0.12 0.012 240)" }}>{value}</span>
      <span className={`text-xs font-semibold flex items-center gap-0.5 ${up ? "text-green-600" : "text-red-500"}`}>
        {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {up ? "+" : ""}{change.toFixed(2)} ({up ? "+" : ""}{pct.toFixed(2)}%)
      </span>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, icon: Icon, sub }: {
  label: string; value: string | number; color?: string; icon?: React.ElementType; sub?: string;
}) {
  return (
    <Card className="border shadow-sm card-hover" style={{ borderColor: "oklch(0.92 0.006 240)" }}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: color ?? "oklch(0.12 0.012 240)" }}>{value}</p>
            {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          {Icon && (
            <div className="h-8 w-8 rounded-lg flex items-center justify-center"
              style={{ background: (color ?? "#22c55e") + "18" }}>
              <Icon className="h-4 w-4" style={{ color: color ?? "#22c55e" }} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Quick action card ────────────────────────────────────────────────────────
function QuickAction({ icon: Icon, label, desc, path, accent, badge }: {
  icon: React.ElementType; label: string; desc: string; path: string; accent: string; badge?: string;
}) {
  const [, setLocation] = useLocation();
  return (
    <button
      onClick={() => setLocation(path)}
      className="group relative flex items-center gap-4 p-4 rounded-xl border text-left w-full bg-white card-hover"
      style={{ borderColor: "oklch(0.92 0.006 240)" }}
    >
      <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-110"
        style={{ background: accent + "18" }}>
        <Icon className="h-5 w-5" style={{ color: accent }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold" style={{ color: "oklch(0.12 0.012 240)" }}>{label}</p>
          {badge && <Badge className="text-[9px] px-1.5 py-0 h-4" style={{ background: accent + "20", color: accent, border: "none" }}>{badge}</Badge>}
        </div>
        <p className="text-xs mt-0.5 truncate text-muted-foreground">{desc}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
        style={{ color: accent }} />
    </button>
  );
}

// ─── Active trade pill ────────────────────────────────────────────────────────
function TradePill({ ticker, strategy, account, expiry, pnl }: {
  ticker: string; strategy: string; account: string; expiry: string; pnl: number;
}) {
  const up = pnl >= 0;
  return (
    <div className="card-hover flex items-center justify-between px-4 py-3 rounded-xl border bg-white"
      style={{ borderColor: "oklch(0.92 0.006 240)" }}>
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg flex items-center justify-center font-bold text-xs"
          style={{ background: "oklch(0.95 0.045 145)", color: "oklch(0.40 0.160 145)" }}>
          {ticker.slice(0, 2)}
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: "oklch(0.12 0.012 240)" }}>{ticker}</p>
          <p className="text-[11px] text-muted-foreground">{strategy} · {account}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-sm font-bold ${up ? "text-green-600" : "text-red-500"}`}>
          {up ? "+" : ""}${pnl.toFixed(0)}
        </p>
        <p className="text-[11px] text-muted-foreground">Exp {expiry}</p>
      </div>
    </div>
  );
}

// ─── COT Signal mini-card ─────────────────────────────────────────────────────
function COTSignalCard({ name, cotIndex, signal, category, id }: {
  name: string; cotIndex: number; signal: string; category: string; id: string;
}) {
  const [, setLocation] = useLocation();
  const isBull = signal === "BULLISH";
  const isBear = signal === "BEARISH";
  return (
    <button
      onClick={() => setLocation(`/cot/${id}`)}
      className="group card-hover flex items-center gap-3 px-4 py-3 rounded-xl border bg-white text-left w-full"
      style={{ borderColor: isBull ? "#bbf7d0" : isBear ? "#fecaca" : "oklch(0.92 0.006 240)" }}
    >
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm ${
        isBull ? "bg-green-100 text-green-700" : isBear ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-500"
      }`}>
        {cotIndex}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold truncate" style={{ color: "oklch(0.12 0.012 240)" }}>{name}</p>
        <p className="text-[10px] mt-0.5 text-muted-foreground">{category}</p>
      </div>
      <Badge className={`text-[10px] shrink-0 ${
        isBull ? "bg-green-100 text-green-800 border-green-200" :
        isBear ? "bg-red-100 text-red-700 border-red-200" :
        "bg-gray-100 text-gray-600 border-gray-200"
      }`}>
        {isBull ? "▲" : isBear ? "▼" : "—"} {signal}
      </Badge>
    </button>
  );
}

// ─── Focus item ───────────────────────────────────────────────────────────────
function FocusItem({ ticker, note, urgency }: { ticker: string; note: string; urgency: string }) {
  const colors = {
    high: { bg: "#fef2f2", border: "#fecaca", dot: "#ef4444", text: "#dc2626" },
    medium: { bg: "#fffbeb", border: "#fde68a", dot: "#f59e0b", text: "#d97706" },
    low: { bg: "#f0fdf4", border: "#bbf7d0", dot: "#22c55e", text: "#16a34a" },
  }[urgency] ?? { bg: "#f9fafb", border: "#e5e7eb", dot: "#9ca3af", text: "#6b7280" };

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border" style={{ background: colors.bg, borderColor: colors.border }}>
      <div className="h-5 w-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: colors.dot + "20" }}>
        <div className="h-2 w-2 rounded-full" style={{ background: colors.dot }} />
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-xs font-bold mr-2" style={{ color: colors.text }}>{ticker}</span>
        <span className="text-xs text-muted-foreground">{note}</span>
      </div>
    </div>
  );
}

// ─── Main home page ───────────────────────────────────────────────────────────
export default function PitDeskHome() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const { data: tradeStats } = trpc.manualTrades.stats.useQuery();
  const { data: activeTrades } = trpc.manualTrades.list.useQuery({ status: "open", limit: 5 });
  const { data: cotScan, isLoading: cotLoading } = trpc.cot.scanAll.useQuery(undefined, {
    staleTime: 30 * 60 * 1000,
  });

  const cotResults = cotScan?.results ?? [];
  // Filter out entries with 999 sentinel (no data) before sorting
  const validCotResults = cotResults.filter(r => r.dataAge < 999 && r.cotIndex !== null);
  const topCotSignals = validCotResults.length > 0
    ? [
        ...validCotResults.sort((a, b) => (b.cotIndex ?? 0) - (a.cotIndex ?? 0)).slice(0, 2),
        ...validCotResults.sort((a, b) => (a.cotIndex ?? 0) - (b.cotIndex ?? 0)).slice(0, 1),
      ]
    : [];

  const firstName = user?.name?.split(" ")[0] ?? "Trader";
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const day = now.getDay();
  const isMarketOpen = day >= 1 && day <= 5 && hour >= 9 && hour < 16;

  return (
    <div className="min-h-screen overflow-auto bg-dot-grid">
      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">

        {/* ── Header ── */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: "oklch(0.12 0.012 240)" }}>
              {greeting}, {firstName} 👋
            </h1>
            <p className="text-sm mt-1 flex items-center gap-2 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              <span className="inline-flex items-center gap-1.5 ml-1">
                <span className={`h-2 w-2 rounded-full ${isMarketOpen ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
                <span className={isMarketOpen ? "text-green-600 font-semibold" : "font-medium"}>
                  {isMarketOpen ? "Market Open" : "Market Closed"}
                </span>
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/pit-advisor")}
              className="gap-2 font-medium border-green-200 text-green-700 hover:bg-green-50"
            >
              <MessageSquare className="h-4 w-4" />
              Ask Pit Advisor
            </Button>
            <Button
              onClick={() => setLocation("/scan-all")}
              className="gap-2 font-semibold text-white"
              style={{ background: "oklch(0.60 0.175 145)" }}
            >
              <Scan className="h-4 w-4" />
              Run Market Scan
            </Button>
          </div>
        </div>

        {/* ── Market indices ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Market Overview</p>
            <button
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setLastRefresh(new Date())}
            >
              <RefreshCw className="h-3 w-3" />
              {lastRefresh.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <IndexCard name="S&P 500"  value="7,472.79" change={-27.79}  pct={-0.37} />
            <IndexCard name="NASDAQ"   value="26,166.6"  change={-351.33} pct={-1.32} />
            <IndexCard name="DOW"      value="51,721.7"  change={148.01}  pct={0.29}  />
            <IndexCard name="VIX"      value="17.44"     change={0.70}    pct={4.18}  />
          </div>
        </div>

        {/* ── Portfolio + Quick actions ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left — portfolio snapshot */}
          <div className="lg:col-span-1 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Your Portfolio</p>

            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Open Trades"
                value={activeTrades?.length ?? 0}
                icon={Activity}
                color="#6366f1"
              />
              <StatCard
                label="Win Rate"
                value={tradeStats?.winRate != null ? `${tradeStats.winRate.toFixed(0)}%` : "—"}
                icon={Target}
                color="#16a34a"
                sub="All time"
              />
              <StatCard
                label="Total P&L"
                value={tradeStats?.totalPnl != null
                  ? `${tradeStats.totalPnl >= 0 ? "+" : ""}$${Math.abs(tradeStats.totalPnl).toFixed(0)}`
                  : "—"}
                icon={TrendingUp}
                color={(tradeStats?.totalPnl ?? 0) >= 0 ? "#16a34a" : "#ef4444"}
              />
              <StatCard
                label="Total Trades"
                value={tradeStats?.totalTrades ?? 0}
                icon={BarChart2}
                color="#f59e0b"
              />
            </div>

            {/* Drawdown Monitor */}
            <DrawdownMonitor />

            {/* Active trades */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Active Trades</p>
                <button className="text-xs font-semibold text-green-600 hover:text-green-700 flex items-center gap-0.5"
                  onClick={() => setLocation("/trade-log")}>
                  View all <ChevronRight className="h-3 w-3" />
                </button>
              </div>
              {activeTrades && activeTrades.length > 0 ? (
                <div className="space-y-2">
                  {activeTrades.map((t: any) => (
                    <TradePill
                      key={t.id}
                      ticker={t.ticker}
                      strategy={t.strategy}
                      account={t.account}
                      expiry={t.expiryDate
                        ? new Date(t.expiryDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                        : "—"}
                      pnl={t.realizedPnl ?? 0}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 rounded-xl border bg-white"
                  style={{ borderColor: "oklch(0.92 0.006 240)" }}>
                  <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center mb-3">
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  </div>
                  <p className="text-sm font-semibold text-muted-foreground">No open trades</p>
                  <button className="text-xs mt-1.5 font-semibold text-green-600 hover:text-green-700"
                    onClick={() => setLocation("/trade-log")}>
                    Log a trade →
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right — quick actions */}
          <div className="lg:col-span-2 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Quick Access</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <QuickAction icon={Activity}      label="PCR Signal Board"      desc="COI heat map + intraday scan"              path="/scan-all"          accent="#22c55e" badge="Live" />
              <QuickAction icon={LineChart}     label="Velez Scanner"         desc="Daily & intraday Fib signals"              path="/velez-scanner"     accent="#6366f1" />
              <QuickAction icon={Globe}         label="Opening Range Scalper" desc="ATR gate + reversal patterns"              path="/velez-scanner?tab=ors" accent="#f59e0b" badge="New" />
              <QuickAction icon={Target}        label="VCP Strategy"          desc="Volatility contraction patterns"           path="/vcp-strategy"      accent="#8b5cf6" />
              <QuickAction icon={BarChart2}     label="Options Analyzer"      desc="13 strategies, Black-Scholes"              path="/analyzer"          accent="#0ea5e9" />
              <QuickAction icon={Zap}           label="Catalyst Watch"        desc="BCOS breakout setups"                      path="/catalyst-watch"    accent="#ec4899" />
              <QuickAction icon={LineChart}     label="Trade Log"             desc="Log & journal every trade"                 path="/trade-log"         accent="#14b8a6" />
              <QuickAction icon={Bell}          label="IVR Alerts"            desc="IV rank threshold alerts"                  path="/ivr-alerts"        accent="#f97316" />
            </div>
          </div>
        </div>

        {/* ── Bottom row: Today's Focus + COT Signals ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Today's Focus */}
          <div className="rounded-xl border bg-white shadow-sm p-5" style={{ borderColor: "oklch(0.92 0.006 240)" }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="h-7 w-7 rounded-lg bg-amber-50 flex items-center justify-center">
                <Flame className="h-4 w-4 text-amber-500" />
              </div>
              <h3 className="text-sm font-bold" style={{ color: "oklch(0.12 0.012 240)" }}>Today's Focus</h3>
              <Badge className="ml-auto text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </Badge>
            </div>
            <div className="space-y-2">
              <FocusItem ticker="SNDK" note="Short $2,600 Call Jul — monitor if SNDK continues rally above $2,400. Set alert at $2,450." urgency="high" />
              <FocusItem ticker="LITE" note="Covered call $990 Jul — stock at $893. Roll if LITE drops below $850 support." urgency="medium" />
              <FocusItem ticker="FDX"  note="Earnings Tuesday after close. Exit any calls by 2 PM Tuesday to avoid binary risk." urgency="high" />
              <FocusItem ticker="MU"   note="Earnings Tuesday after close. Bear call spread $1,150/$1,200 — IV crush play." urgency="medium" />
            </div>
            <button
              className="mt-4 w-full text-xs font-semibold text-green-600 hover:text-green-700 flex items-center justify-center gap-1 py-2 rounded-lg hover:bg-green-50 transition-colors"
              onClick={() => setLocation("/pit-advisor")}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Ask Pit Advisor about these trades
            </button>
          </div>

          {/* COT Signals */}
          <div className="rounded-xl border bg-white shadow-sm p-5" style={{ borderColor: "oklch(0.92 0.006 240)" }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="h-7 w-7 rounded-lg bg-blue-50 flex items-center justify-center">
                <Globe className="h-4 w-4 text-blue-500" />
              </div>
              <h3 className="text-sm font-bold" style={{ color: "oklch(0.12 0.012 240)" }}>COT Signals</h3>
              <Badge className="ml-auto text-[10px] bg-blue-50 text-blue-700 border-blue-200">Weekly</Badge>
            </div>
            {cotLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
              </div>
            ) : topCotSignals.length > 0 ? (
              <div className="space-y-2">
                {topCotSignals.map((r: any) => (
                  <COTSignalCard
                    key={r.instrument?.id ?? r.id}
                    id={r.instrument?.id ?? r.id ?? ""}
                    name={r.instrument?.name ?? r.name ?? "Unknown"}
                    cotIndex={r.cotIndex ?? 0}
                    signal={r.signal ?? "NEUTRAL"}
                    category={r.instrument?.category ?? r.category ?? ""}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Globe className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No COT data loaded</p>
                <button className="text-xs mt-1.5 font-semibold text-blue-600 hover:text-blue-700"
                  onClick={() => setLocation("/cot-dashboard")}>
                  Load COT Dashboard →
                </button>
              </div>
            )}
            <button
              className="mt-4 w-full text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center justify-center gap-1 py-2 rounded-lg hover:bg-blue-50 transition-colors"
              onClick={() => setLocation("/cot-dashboard")}
            >
              <Globe className="h-3.5 w-3.5" />
              View full COT Dashboard
            </button>
          </div>
        </div>

        {/* ── Strategy rules at a glance ── */}
        <div className="rounded-xl border bg-white shadow-sm p-5" style={{ borderColor: "oklch(0.92 0.006 240)" }}>
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: "oklch(0.12 0.012 240)" }}>
            <Target className="h-4 w-4 text-green-600" />
            Your Strategy Rules at a Glance
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-bold text-green-700 mb-2 uppercase tracking-wide">PCR Signal Zones</p>
              <div className="space-y-1.5">
                {[
                  { zone: "PCR > 1.5", label: "Extreme Fear → contrarian bullish (sell puts)", color: "#16a34a" },
                  { zone: "PCR 1.0–1.5", label: "Fear → bull put spread", color: "#22c55e" },
                  { zone: "PCR 0.7–1.0", label: "Neutral → iron condor", color: "#6b7280" },
                  { zone: "PCR < 0.7", label: "Greed/Extreme Greed → bear call spread", color: "#ef4444" },
                ].map(r => (
                  <div key={r.zone} className="flex items-center gap-2 text-xs">
                    <span className="font-bold shrink-0" style={{ color: r.color }}>• {r.zone}</span>
                    <span className="text-muted-foreground">— {r.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-orange-700 mb-2 uppercase tracking-wide">Opening Range Scalper Rules</p>
              <div className="space-y-1.5">
                {[
                  "First 15-min candle must be ≥ 25% of Daily ATR-14",
                  "Wait for price to break outside the opening range box",
                  "Enter on Hammer / Engulfing reversal back into box",
                  "TP1 = near box edge · TP2 = far box edge · 90-min limit",
                ].map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-orange-400 shrink-0 mt-0.5">•</span>
                    <span className="text-muted-foreground">{r}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>

      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
