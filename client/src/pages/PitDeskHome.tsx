import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp, TrendingDown, Activity, BarChart2, Target,
  Calendar, Zap, ArrowRight, Clock, AlertTriangle, CheckCircle2,
  LineChart, Scan, Globe,
} from "lucide-react";
import { useLocation } from "wouter";

// ─── Market index card ────────────────────────────────────────────────────────
function IndexCard({ name, value, change, pct }: {
  name: string; value: string; change: number; pct: number;
}) {
  const up = change >= 0;
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 rounded-xl border bg-white"
      style={{ borderColor: "oklch(0.92 0.006 240)" }}>
      <span className="text-[11px] font-medium uppercase tracking-wider"
        style={{ color: "oklch(0.55 0.016 240)" }}>{name}</span>
      <span className="text-lg font-bold" style={{ color: "oklch(0.12 0.012 240)" }}>{value}</span>
      <span className={`text-xs font-semibold flex items-center gap-0.5 ${up ? "text-green-600" : "text-red-500"}`}>
        {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {up ? "+" : ""}{change.toFixed(2)} ({up ? "+" : ""}{pct.toFixed(2)}%)
      </span>
    </div>
  );
}

// ─── Quick action card ────────────────────────────────────────────────────────
function QuickAction({ icon: Icon, label, desc, path, accent }: {
  icon: React.ElementType; label: string; desc: string; path: string; accent: string;
}) {
  const [, setLocation] = useLocation();
  return (
    <button
      onClick={() => setLocation(path)}
      className="group flex items-center gap-4 p-4 rounded-xl border text-left w-full transition-all hover:shadow-md bg-white"
      style={{ borderColor: "oklch(0.92 0.006 240)" }}
    >
      <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
        style={{ background: accent + "18" }}>
        <Icon className="h-5 w-5" style={{ color: accent }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold" style={{ color: "oklch(0.12 0.012 240)" }}>{label}</p>
        <p className="text-xs mt-0.5 truncate" style={{ color: "oklch(0.55 0.016 240)" }}>{desc}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
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
    <div className="flex items-center justify-between px-4 py-3 rounded-xl border bg-white"
      style={{ borderColor: "oklch(0.92 0.006 240)" }}>
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg flex items-center justify-center font-bold text-xs"
          style={{ background: "oklch(0.95 0.045 145)", color: "oklch(0.40 0.160 145)" }}>
          {ticker.slice(0, 2)}
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: "oklch(0.12 0.012 240)" }}>{ticker}</p>
          <p className="text-[11px]" style={{ color: "oklch(0.55 0.016 240)" }}>{strategy} · {account}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-sm font-bold ${up ? "text-green-600" : "text-red-500"}`}>
          {up ? "+" : ""}${pnl.toFixed(0)}
        </p>
        <p className="text-[11px]" style={{ color: "oklch(0.60 0.016 240)" }}>Exp {expiry}</p>
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
      className="group flex items-center gap-3 px-4 py-3 rounded-xl border bg-white text-left w-full transition-all hover:shadow-md"
      style={{ borderColor: isBull ? "#bbf7d0" : isBear ? "#fecaca" : "oklch(0.92 0.006 240)" }}
    >
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm ${
        isBull ? "bg-green-100 text-green-700" : isBear ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-500"
      }`}>
        {cotIndex}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold truncate" style={{ color: "oklch(0.12 0.012 240)" }}>{name}</p>
        <p className="text-[10px] mt-0.5" style={{ color: "oklch(0.55 0.016 240)" }}>{category}</p>
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

// ─── Main home page ───────────────────────────────────────────────────────────
export default function PitDeskHome() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data: tradeStats } = trpc.manualTrades.stats.useQuery();
  const { data: activeTrades } = trpc.manualTrades.list.useQuery({ status: "open", limit: 5 });
  const { data: cotScan, isLoading: cotLoading } = trpc.cot.scanAll.useQuery(undefined, {
    staleTime: 30 * 60 * 1000, // 30 min — COT data is weekly
  });

  // Top 3 extreme COT signals: highest (most bullish) + lowest (most bearish)
  const cotResults = cotScan?.results ?? [];
  const topCotSignals = cotResults.length > 0
    ? [
        ...cotResults.filter(r => r.cotIndex !== null).sort((a, b) => (b.cotIndex ?? 0) - (a.cotIndex ?? 0)).slice(0, 2),
        ...cotResults.filter(r => r.cotIndex !== null).sort((a, b) => (a.cotIndex ?? 0) - (b.cotIndex ?? 0)).slice(0, 1),
      ]
    : [];

  const firstName = user?.name?.split(" ")[0] ?? "Trader";
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const day = now.getDay();
  const isMarketOpen = day >= 1 && day <= 5 && hour >= 9 && hour < 16;

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: "oklch(0.975 0.004 240)" }}>

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "oklch(0.12 0.012 240)" }}>
            {greeting}, {firstName}
          </h1>
          <p className="text-sm mt-1 flex items-center gap-2" style={{ color: "oklch(0.55 0.016 240)" }}>
            <Clock className="h-3.5 w-3.5" />
            {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            <span className="inline-flex items-center gap-1.5 ml-1">
              <span className={`h-2 w-2 rounded-full ${isMarketOpen ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
              <span className={isMarketOpen ? "text-green-600 font-medium" : ""}>
                {isMarketOpen ? "Market Open" : "Market Closed"}
              </span>
            </span>
          </p>
        </div>
        <Button
          onClick={() => setLocation("/scan-all")}
          className="gap-2 font-semibold"
          style={{ background: "oklch(0.72 0.200 145)", color: "#fff" }}
        >
          <Scan className="h-4 w-4" />
          Run Market Scan
        </Button>
      </div>

      {/* ── Market indices ── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-3"
          style={{ color: "oklch(0.55 0.016 240)" }}>Market Overview</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <IndexCard name="S&P 500"  value="7,325"  change={-61.12}  pct={-0.83} />
          <IndexCard name="NASDAQ"   value="25,389" change={-289.52} pct={-1.13} />
          <IndexCard name="DOW"      value="50,316" change={-556.01} pct={-1.09} />
          <IndexCard name="VIX"      value="18.42"  change={1.24}    pct={7.22}  />
        </div>
      </div>

      {/* ── Portfolio + Quick actions ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left — portfolio snapshot */}
        <div className="lg:col-span-1 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "oklch(0.55 0.016 240)" }}>Your Portfolio</p>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Open Trades", value: activeTrades?.length ?? 0, color: "oklch(0.12 0.012 240)" },
              { label: "Win Rate",    value: tradeStats?.winRate != null ? `${tradeStats.winRate.toFixed(0)}%` : "—", color: "#16a34a" },
              {
                label: "Total P&L",
                value: tradeStats?.totalPnl != null
                  ? `${tradeStats.totalPnl >= 0 ? "+" : ""}$${Math.abs(tradeStats.totalPnl).toFixed(0)}`
                  : "—",
                color: (tradeStats?.totalPnl ?? 0) >= 0 ? "#16a34a" : "#ef4444",
              },
              { label: "Total Trades", value: tradeStats?.totalTrades ?? 0, color: "oklch(0.12 0.012 240)" },
            ].map(stat => (
              <Card key={stat.label} className="border" style={{ borderColor: "oklch(0.92 0.006 240)" }}>
                <CardContent className="p-4">
                  <p className="text-[11px] uppercase tracking-wider" style={{ color: "oklch(0.55 0.016 240)" }}>{stat.label}</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: stat.color }}>{stat.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Active trades */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: "oklch(0.55 0.016 240)" }}>Active Trades</p>
              <button className="text-xs font-medium hover:underline"
                style={{ color: "oklch(0.72 0.200 145)" }}
                onClick={() => setLocation("/trade-log")}>
                View all →
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
                <CheckCircle2 className="h-8 w-8 mb-2" style={{ color: "oklch(0.72 0.200 145)" }} />
                <p className="text-sm font-medium" style={{ color: "oklch(0.42 0.014 240)" }}>No open trades</p>
                <button className="text-xs mt-1 hover:underline" style={{ color: "oklch(0.72 0.200 145)" }}
                  onClick={() => setLocation("/trade-log")}>
                  Log a trade →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right — quick actions + focus */}
        <div className="lg:col-span-2 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "oklch(0.55 0.016 240)" }}>Quick Actions</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <QuickAction icon={Activity}  label="PCR Dashboard"     desc="Put/Call ratio signals for 60 tickers"       path="/scan-all"          accent="#00C805" />
            <QuickAction icon={Target}    label="Velez Scanner"     desc="25%/50% retracement bounce setups"           path="/velez-scanner"     accent="#6366f1" />
            <QuickAction icon={BarChart2} label="Strategy Analyzer" desc="Rank 13 options strategies by score"         path="/analyzer"          accent="#f59e0b" />
            <QuickAction icon={Calendar}  label="Earnings Calendar" desc="Upcoming earnings & IV crush plays"          path="/earnings-calendar" accent="#ec4899" />
            <QuickAction icon={LineChart} label="Trade Log"         desc="Log and track your trades"                   path="/trade-log"         accent="#14b8a6" />
            <QuickAction icon={Zap}       label="Trading Agent"     desc="AI-powered trade proposals"                  path="/agent"             accent="#8b5cf6" />
          </div>

          {/* Today's focus */}
          <Card className="border" style={{ borderColor: "oklch(0.92 0.006 240)" }}>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2"
                style={{ color: "oklch(0.12 0.012 240)" }}>
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Today's Focus
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-0">
                {[
                  { ticker: "MU",   note: "Iron Condor $830/$840/$980/$990 — Jun 12 expiry. Close at 50% profit (~$177).", urgency: "high"   },
                  { ticker: "TSLA", note: "Iron Condor Jun 12 — watch $428 call spread trigger level.",                    urgency: "medium" },
                  { ticker: "ORCL", note: "Post-earnings — check Jun 11 realized P&L vs $650 calendar spread backtest.",   urgency: "medium" },
                  { ticker: "SNDK", note: "Short $2400 Call Aug 21 — monitor if SNDK continues rally above $1,750.",       urgency: "high"   },
                ].map((item, i, arr) => (
                  <div key={item.ticker}
                    className={`flex items-start gap-3 py-2.5 ${i < arr.length - 1 ? "border-b" : ""}`}
                    style={{ borderColor: "oklch(0.95 0.004 240)" }}>
                    <Badge variant="outline" className="shrink-0 text-[11px] font-bold mt-0.5"
                      style={{
                        borderColor: item.urgency === "high" ? "#ef4444" : "#f59e0b",
                        color:       item.urgency === "high" ? "#ef4444" : "#f59e0b",
                        background:  item.urgency === "high" ? "#fef2f2" : "#fffbeb",
                      }}>
                      {item.ticker}
                    </Badge>
                    <p className="text-xs leading-relaxed" style={{ color: "oklch(0.42 0.014 240)" }}>
                      {item.note}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Top COT Signals ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2"
            style={{ color: "oklch(0.55 0.016 240)" }}>
            <Globe className="h-3.5 w-3.5" />
            Top COT Signals (Larry Williams)
          </p>
          <button className="text-xs font-medium hover:underline"
            style={{ color: "oklch(0.72 0.200 145)" }}
            onClick={() => setLocation("/cot")}>
            View all 19 markets →
          </button>
        </div>
        {cotLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        ) : topCotSignals.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {topCotSignals.map(r => (
              <COTSignalCard
                key={r.instrument.id}
                id={r.instrument.id}
                name={r.instrument.name}
                cotIndex={r.cotIndex ?? 50}
                signal={r.signal}
                category={r.instrument.category}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-white text-sm"
            style={{ borderColor: "oklch(0.92 0.006 240)", color: "oklch(0.55 0.016 240)" }}>
            <Globe className="h-4 w-4 shrink-0" />
            COT data loads on first visit to the COT Dashboard. Click "View all 19 markets" to fetch.
          </div>
        )}
      </div>
    </div>
  );
}
