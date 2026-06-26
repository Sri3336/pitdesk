/**
 * TickerAnalysis — Decision Hub
 * Search → Instant Recommendation Hero (options + stock direction)
 * → Drill-down cards: Chart, PCR, Greeks, Earnings, Pit Advisor
 */
import { ActionLayout } from "@/components/ActionLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart2,
  BookOpen,
  Brain,
  Calendar,
  ChevronDown,
  ChevronUp,
  Minus,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";

// ── Quick-pick tickers ────────────────────────────────────────────────────────
const QUICK_TICKERS = ["NVDA", "AAPL", "TSLA", "PLTR", "AMD", "META", "SPY", "QQQ", "APP", "SOFI"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function pcrColor(signal: string) {
  if (!signal) return "#94a3b8";
  if (signal.includes("EXTREME_FEAR") || signal.includes("FEAR")) return "#22c55e";
  if (signal.includes("EXTREME_GREED") || signal.includes("GREED")) return "#ef4444";
  return "#f59e0b";
}
function pcrLabel(signal: string) {
  if (!signal) return "No Signal";
  return signal.replace(/_/g, " ");
}
function biasColor(bias: string) {
  if (bias === "Bullish") return "#22c55e";
  if (bias === "Bearish") return "#ef4444";
  return "#94a3b8";
}
function biasIcon(bias: string) {
  if (bias === "Bullish") return <ArrowUp className="w-5 h-5" />;
  if (bias === "Bearish") return <ArrowDown className="w-5 h-5" />;
  return <Minus className="w-5 h-5" />;
}
function ivLabel(ivRv: number) {
  if (ivRv > 1.3) return { label: "IV Elevated — sell premium", color: "#ef4444" };
  if (ivRv > 0.9) return { label: "IV Fair — balanced", color: "#f59e0b" };
  return { label: "IV Compressed — buy premium", color: "#22c55e" };
}
function strategyColor(name: string) {
  if (name?.includes("Bull") || name?.includes("Naked Put") || name?.includes("Cash-Secured")) return "#22c55e";
  if (name?.includes("Bear") || name?.includes("Naked Call")) return "#ef4444";
  if (name?.includes("Condor") || name?.includes("Strangle") || name?.includes("Butterfly")) return "#6366f1";
  if (name?.includes("Straddle") || name?.includes("Long")) return "#f59e0b";
  return "#3b82f6";
}

// ── TradingView Chart ─────────────────────────────────────────────────────────
// Key-based remount: when ticker changes, React unmounts the old instance
// entirely and mounts a fresh one — no stale widget residue.
function TradingViewChart({ ticker }: { ticker: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !ticker) return;
    // Wipe any previous content (scripts, iframes, divs) completely
    container.innerHTML = "";
    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetDiv.style.height = "100%";
    widgetDiv.style.width = "100%";
    container.appendChild(widgetDiv);
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: ticker,
      interval: "D",
      timezone: "America/New_York",
      theme: "light",
      style: "1",
      locale: "en",
      enable_publishing: false,
      allow_symbol_change: false,
      calendar: false,
      support_host: "https://www.tradingview.com",
      studies: ["RSI@tv-basicstudies", "MACD@tv-basicstudies", "Volume@tv-basicstudies"],
    });
    container.appendChild(script);
    return () => {
      container.innerHTML = "";
    };
  }, [ticker]);
  return <div ref={containerRef} className="tradingview-widget-container w-full" style={{ height: 520, minHeight: 520 }} />;
}

// ── Collapsible drill-down card ───────────────────────────────────────────────
function DrillCard({
  icon, title, accent, children, defaultOpen = false,
}: {
  icon: React.ReactNode;
  title: string;
  accent: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className="rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md"
      style={{ borderColor: open ? accent + "44" : "var(--border)" }}
    >
      <button
        className="w-full flex items-center justify-between px-5 py-4 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: accent + "18", color: accent }}>
            {icon}
          </div>
          <span className="font-semibold text-sm text-foreground">{title}</span>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5 pt-1 border-t" style={{ borderColor: accent + "22" }}>{children}</div>}
    </div>
  );
}

// ── Stat cell ─────────────────────────────────────────────────────────────────
function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="font-semibold text-sm font-mono" style={{ color: color ?? "var(--foreground)" }}>{value}</div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TickerAnalysis() {
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const initialTicker = params.get("ticker")?.toUpperCase() ?? "";

  const [inputValue, setInputValue] = useState(initialTicker);
  const [activeTicker, setActiveTicker] = useState(initialTicker);
  const [, navigate] = useLocation();

  // PCR data
  const { data: pcrBatch, isLoading: pcrLoading } = trpc.pcr.getBatch.useQuery(
    { tickers: [activeTicker] },
    { enabled: !!activeTicker, retry: 1 }
  );
  const pcrData = pcrBatch?.[0] ?? null;

  // Options + regime analysis
  const analysisMutation = trpc.analysis.run.useMutation();
  const analysisData = analysisMutation.data;
  const analysisLoading = analysisMutation.isPending;

  function handleSearch(ticker?: string) {
    const t = (ticker ?? inputValue).toUpperCase().trim();
    if (!t) return;
    setActiveTicker(t);
    setInputValue(t);
    analysisMutation.mutate({ ticker: t });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSearch();
  }

  function openPitAdvisor() {
    if (!activeTicker) return;
    const bias = analysisData?.regime?.directionalBias ?? "N/A";
    const strategy = analysisData?.recommendation?.name ?? "N/A";
    const pcrSignal = pcrData?.signal ?? "N/A";
    const rsi = analysisData?.regime?.rsi14?.toFixed(0) ?? "N/A";
    const prompt = `Analyze ${activeTicker} for a trade decision right now.\n\nKey signals:\n- Stock direction bias: ${bias}\n- RSI(14): ${rsi}\n- PCR signal: ${pcrSignal}\n- Top options strategy: ${strategy}\n\nGive me:\n1. Stock trade recommendation (long/short/skip) with entry, stop, T1, T2\n2. Options trade setup with specific strikes, expiry, entry price, max loss, target exit\n3. Key risks I should know before entering`;
    navigate(`/pit-advisor?prompt=${encodeURIComponent(prompt)}`);
  }

  const regime = analysisData?.regime;
  const rec = analysisData?.recommendation;
  const earnings = analysisData?.earningsInfo;
  const hasData = !!activeTicker;
  const isLoading = analysisLoading || pcrLoading;

  return (
    <ActionLayout toolName="Analyze a Ticker" toolColor="#22c55e">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* ── Search ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-4">
          <div className="text-center space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {activeTicker ? activeTicker : "Analyze a Ticker"}
            </h1>
            {!activeTicker && (
              <p className="text-sm text-muted-foreground">
                Get an instant trade recommendation — options strategy + stock direction + all the signals to decide.
              </p>
            )}
          </div>

          <div className="flex gap-2 w-full max-w-sm">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9 h-12 text-base font-mono uppercase tracking-widest"
                placeholder="NVDA, AAPL, TSLA..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value.toUpperCase())}
                onKeyDown={handleKeyDown}
                autoFocus
              />
            </div>
            <Button
              className="h-12 px-6 font-semibold text-white"
              style={{ background: "#22c55e" }}
              onClick={() => handleSearch()}
              disabled={analysisLoading}
            >
              {analysisLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : "Analyze"}
            </Button>
          </div>

          {/* Quick picks */}
          <div className="flex flex-wrap gap-1.5 justify-center">
            {QUICK_TICKERS.map((t) => (
              <button
                key={t}
                onClick={() => handleSearch(t)}
                className="px-2.5 py-1 rounded-md text-xs font-mono font-medium border transition-all hover:scale-105"
                style={{
                  borderColor: activeTicker === t ? "#22c55e" : "var(--border)",
                  color: activeTicker === t ? "#22c55e" : "var(--muted-foreground)",
                  background: activeTicker === t ? "rgba(34,197,94,0.08)" : "transparent",
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* ── Empty state ─────────────────────────────────────────────────── */}
        {!hasData && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <BarChart2 className="w-14 h-14 opacity-15" />
            <p className="text-sm">Enter a ticker above — get a trade recommendation in seconds</p>
          </div>
        )}

        {/* ── Results ─────────────────────────────────────────────────────── */}
        {hasData && (
          <div className="space-y-4">

            {/* ══ EARNINGS COUNTDOWN BANNER ════════════════════════════════ */}
            {earnings?.daysToEarnings != null && earnings.daysToEarnings <= 21 && (
              <div
                className="rounded-2xl border-2 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3"
                style={{
                  background: earnings.daysToEarnings <= 7
                    ? "rgba(239,68,68,0.08)"
                    : earnings.daysToEarnings <= 14
                    ? "rgba(249,115,22,0.08)"
                    : "rgba(234,179,8,0.07)",
                  borderColor: earnings.daysToEarnings <= 7
                    ? "rgba(239,68,68,0.45)"
                    : earnings.daysToEarnings <= 14
                    ? "rgba(249,115,22,0.40)"
                    : "rgba(234,179,8,0.38)",
                }}
              >
                {/* Icon + countdown */}
                <div className="flex items-center gap-3 flex-1">
                  <div
                    className="w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 font-bold"
                    style={{
                      background: earnings.daysToEarnings <= 7
                        ? "rgba(239,68,68,0.15)"
                        : earnings.daysToEarnings <= 14
                        ? "rgba(249,115,22,0.15)"
                        : "rgba(234,179,8,0.15)",
                      color: earnings.daysToEarnings <= 7 ? "#dc2626"
                        : earnings.daysToEarnings <= 14 ? "#ea580c"
                        : "#b45309",
                    }}
                  >
                    <span className="text-xl leading-none">{earnings.daysToEarnings}</span>
                    <span className="text-[9px] uppercase tracking-wide leading-none mt-0.5">days</span>
                  </div>
                  <div>
                    <div
                      className="font-bold text-base leading-tight"
                      style={{
                        color: earnings.daysToEarnings <= 7 ? "#dc2626"
                          : earnings.daysToEarnings <= 14 ? "#ea580c"
                          : "#b45309",
                      }}
                    >
                      {earnings.daysToEarnings === 0
                        ? `${activeTicker} reports TODAY`
                        : earnings.daysToEarnings === 1
                        ? `${activeTicker} reports TOMORROW`
                        : `${activeTicker} earnings in ${earnings.daysToEarnings} days`}
                      {earnings.nextEarningsDate && (
                        <span className="font-normal text-sm ml-2 opacity-70">({earnings.nextEarningsDate})</span>
                      )}
                    </div>
                    <div className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                      {earnings.daysToEarnings <= 7
                        ? "High risk — avoid new positions or use defined-risk strategies only"
                        : earnings.daysToEarnings <= 14
                        ? "Consider shorter DTE or defined-risk spreads to limit earnings exposure"
                        : "Earnings approaching — factor implied move into your position sizing"}
                    </div>
                    {/* Earnings Play suggestion */}
                    {earnings.daysToEarnings <= 7 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(() => {
                          const ivRank = regime?.ivPercentileRank ?? 50;
                          const impliedMove = earnings.expectedEarningsMove ?? 0;
                          const plays: { label: string; color: string }[] = [];
                          if (ivRank >= 60) {
                            // IV elevated — sell premium around the move
                            plays.push({ label: "Iron Condor (sell the move)", color: "#dc2626" });
                            plays.push({ label: "Short Strangle (if high conviction range)", color: "#dc2626" });
                          } else if (ivRank <= 35) {
                            // IV compressed — buy the move
                            plays.push({ label: "Long Straddle (buy the move)", color: "#16a34a" });
                            plays.push({ label: "Long Strangle (cheaper, wider strikes)", color: "#16a34a" });
                          } else {
                            // Neutral IV — directional or calendar
                            plays.push({ label: "Calendar Spread (sell near, buy back)", color: "#7c3aed" });
                            plays.push({ label: "Bull/Bear Spread (if directional bias)", color: "#7c3aed" });
                          }
                          if (impliedMove > 0.08) {
                            plays.push({ label: `Implied ±${(impliedMove * 100).toFixed(0)}% — set strikes outside this range`, color: "#b45309" });
                          }
                          return plays.map((p, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
                              style={{ borderColor: p.color + "55", background: p.color + "12", color: p.color }}>
                              ⚡ {p.label}
                            </span>
                          ));
                        })()}
                      </div>
                    )}
                  </div>
                </div>

                {/* Implied move stats */}
                {(earnings.expectedEarningsMove != null || earnings.avgHistoricalMove != null) && (
                  <div className="flex gap-4 shrink-0 sm:border-l sm:pl-4" style={{ borderColor: "var(--border)" }}>
                    {earnings.expectedEarningsMove != null && (
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground">Implied Move</div>
                        <div
                          className="text-lg font-bold font-mono"
                          style={{ color: earnings.daysToEarnings <= 7 ? "#dc2626" : "#ea580c" }}
                        >
                          ±{(earnings.expectedEarningsMove * 100).toFixed(1)}%
                        </div>
                      </div>
                    )}
                    {earnings.avgHistoricalMove != null && (
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground">Avg Historical</div>
                        <div className="text-lg font-bold font-mono text-muted-foreground">
                          ±{(earnings.avgHistoricalMove * 100).toFixed(1)}%
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ══ HERO: Instant Recommendation ════════════════════════════ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Stock Direction */}
              <div
                className="rounded-2xl p-5 border-2 flex flex-col gap-3"
                style={{
                  borderColor: regime ? biasColor(regime.directionalBias) + "44" : "var(--border)",
                  background: regime ? biasColor(regime.directionalBias) + "08" : "var(--card)",
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Stock Direction</div>
                  {regime && (
                    <div
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold"
                      style={{
                        background: biasColor(regime.directionalBias) + "18",
                        color: biasColor(regime.directionalBias),
                      }}
                    >
                      {biasIcon(regime.directionalBias)}
                      {regime.directionalBias}
                    </div>
                  )}
                </div>

                {isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                ) : regime ? (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <Stat label="Price" value={`$${regime.lastPrice.toFixed(2)}`} />
                      <Stat label="RSI 14" value={regime.rsi14.toFixed(0)}
                        color={regime.rsi14 > 70 ? "#ef4444" : regime.rsi14 < 30 ? "#22c55e" : undefined} />
                      <Stat label="vs SMA50"
                        value={regime.lastPrice > regime.sma50 ? "Above ↑" : "Below ↓"}
                        color={regime.lastPrice > regime.sma50 ? "#22c55e" : "#ef4444"} />
                      <Stat label="MACD"
                        value={regime.macdHist > 0 ? "Bullish ↑" : "Bearish ↓"}
                        color={regime.macdHist > 0 ? "#22c55e" : "#ef4444"} />
                      <Stat label="SMA20" value={`$${regime.sma20.toFixed(2)}`} />
                      <Stat label="SMA200" value={`$${regime.sma200.toFixed(2)}`} />
                    </div>
                    <div className="text-xs text-muted-foreground pt-1 border-t" style={{ borderColor: "var(--border)" }}>
                      Directional score: <span className="font-semibold" style={{ color: biasColor(regime.directionalBias) }}>{regime.directionalScore > 0 ? "+" : ""}{regime.directionalScore}/3</span>
                      {" · "}Expected ±move: <span className="font-semibold">{analysisData?.expectedMovePct != null ? `${(analysisData.expectedMovePct * 100).toFixed(1)}%` : "—"}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No regime data</p>
                )}
              </div>

              {/* Options Trade Recommendation */}
              <div
                className="rounded-2xl p-5 border-2 flex flex-col gap-3"
                style={{
                  borderColor: rec ? strategyColor(rec.name) + "44" : "var(--border)",
                  background: rec ? strategyColor(rec.name) + "06" : "var(--card)",
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Options Trade</div>
                  {rec && (
                    <Badge
                      className="text-xs font-bold px-3 py-1"
                      style={{
                        background: strategyColor(rec.name) + "18",
                        color: strategyColor(rec.name),
                        border: `1px solid ${strategyColor(rec.name)}44`,
                      }}
                    >
                      {rec.name}
                    </Badge>
                  )}
                </div>

                {isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ) : rec ? (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <Stat label="Max Profit"
                        value={rec.maxProfit != null ? `$${rec.maxProfit.toFixed(0)}` : "Unlimited"}
                        color="#22c55e" />
                      <Stat label="Max Loss"
                        value={rec.maxLoss != null ? `$${rec.maxLoss.toFixed(0)}` : "Unlimited"}
                        color="#ef4444" />
                      <Stat label="Prob Profit" value={`${(rec.pop * 100).toFixed(0)}%`} />
                      <Stat label="Net Credit" value={rec.netCredit > 0 ? `+$${rec.netCredit.toFixed(2)}` : `-$${Math.abs(rec.netCredit).toFixed(2)}`}
                        color={rec.netCredit > 0 ? "#22c55e" : "#f59e0b"} />
                      <Stat label="Score" value={`${rec.compositeScore.toFixed(1)}/10`} />
                      <Stat label="Expiry" value={analysisData?.expiryUsed ?? "—"} />
                    </div>
                    <div className="text-xs text-muted-foreground leading-relaxed pt-1 border-t" style={{ borderColor: "var(--border)" }}>
                      {rec.rationale}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Run analysis to see recommendation</p>
                )}
              </div>
            </div>

            {/* ══ IV Environment banner ════════════════════════════════════ */}
            {regime && (
              <div
                className="rounded-xl px-5 py-3 flex items-center justify-between gap-4 border"
                style={{
                  background: ivLabel(regime.ivRvRatio).color + "0d",
                  borderColor: ivLabel(regime.ivRvRatio).color + "33",
                }}
              >
                <div className="flex items-center gap-2.5">
                  <Zap className="w-4 h-4 shrink-0" style={{ color: ivLabel(regime.ivRvRatio).color }} />
                  <div>
                    <span className="text-sm font-semibold" style={{ color: ivLabel(regime.ivRvRatio).color }}>
                      {ivLabel(regime.ivRvRatio).label}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      IV/RV: {regime.ivRvRatio.toFixed(2)} · Median IV: {(regime.medianIV * 100).toFixed(1)}% · IV Rank: {regime.ivPercentileRank.toFixed(0)}
                    </span>
                  </div>
                </div>
                {pcrData && (
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-xs text-muted-foreground">PCR:</div>
                    <div className="text-sm font-bold" style={{ color: pcrColor(pcrData.signal) }}>
                      {pcrLabel(pcrData.signal)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ══ Earnings warning ════════════════════════════════════════ */}
            {earnings?.daysToEarnings != null && earnings.daysToEarnings <= 14 && (
              <div className="rounded-xl px-5 py-3 flex items-center gap-3 border border-amber-200 bg-amber-50">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <div className="text-sm">
                  <span className="font-semibold text-amber-700">Earnings in {earnings.daysToEarnings} days</span>
                  {earnings.expectedEarningsMove != null && (
                    <span className="text-amber-600 ml-2">
                      — implied move ±{(earnings.expectedEarningsMove * 100).toFixed(1)}%
                      {earnings.avgHistoricalMove != null && ` (avg historical: ±${(earnings.avgHistoricalMove * 100).toFixed(1)}%)`}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* ══ Ask Pit Advisor CTA ══════════════════════════════════════ */}
            <button
              onClick={openPitAdvisor}
              className="w-full rounded-xl px-5 py-4 flex items-center gap-4 border-2 transition-all hover:shadow-md active:scale-[0.99]"
              style={{ borderColor: "#8b5cf644", background: "#8b5cf608" }}
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: "#8b5cf618" }}>
                <Sparkles className="w-5 h-5" style={{ color: "#8b5cf6" }} />
              </div>
              <div className="flex-1 text-left">
                <div className="font-semibold text-sm" style={{ color: "#8b5cf6" }}>Ask Pit Advisor for a full trade plan</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Get specific entry price, stop loss, T1/T2 targets, position sizing, and risk assessment — pre-filled with {activeTicker}'s signals
                </div>
              </div>
              <ArrowRight className="w-4 h-4 shrink-0" style={{ color: "#8b5cf6" }} />
            </button>

            {/* ══ Drill-down cards ════════════════════════════════════════ */}
            <div className="space-y-3">

              {/* Chart */}
              <DrillCard icon={<Activity className="w-4 h-4" />} title={`${activeTicker} — Daily Chart (RSI · MACD · Volume)`} accent="#22c55e" defaultOpen>
                <TradingViewChart ticker={activeTicker} />
              </DrillCard>

              {/* Options Strategy Detail */}
              {rec && (
                <DrillCard icon={<Zap className="w-4 h-4" />} title="Options Strategy — Full Breakdown" accent={strategyColor(rec.name)}>
                  <div className="space-y-4">
                    {/* Legs */}
                    {rec.legs.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Trade Legs</div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-muted-foreground border-b">
                                <th className="text-left pb-1.5 pr-3">Type</th>
                                <th className="text-right pb-1.5 pr-3">Strike</th>
                                <th className="text-left pb-1.5 pr-3">Expiry</th>
                                <th className="text-right pb-1.5 pr-3">Mid</th>
                                <th className="text-right pb-1.5 pr-3">Delta</th>
                                <th className="text-right pb-1.5 pr-3">IV</th>
                                <th className="text-right pb-1.5">OI</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rec.legs.map((leg, i) => (
                                <tr key={i} className="border-b border-border/50">
                                  <td className="py-1.5 pr-3">
                                    <span className={`font-semibold capitalize ${leg.type === "call" ? "text-green-600" : "text-red-500"}`}>
                                      {leg.type}
                                    </span>
                                  </td>
                                  <td className="py-1.5 pr-3 text-right font-mono">${leg.strike}</td>
                                  <td className="py-1.5 pr-3">{leg.expiry}</td>
                                  <td className="py-1.5 pr-3 text-right font-mono">${leg.mid.toFixed(2)}</td>
                                  <td className="py-1.5 pr-3 text-right font-mono">{leg.delta.toFixed(2)}</td>
                                  <td className="py-1.5 pr-3 text-right font-mono">{(leg.iv * 100).toFixed(0)}%</td>
                                  <td className="py-1.5 text-right font-mono">{leg.openInterest.toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    {/* Breakevens */}
                    {rec.breakevens.length > 0 && (
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-xs text-muted-foreground uppercase tracking-wide">Breakeven{rec.breakevens.length > 1 ? "s" : ""}:</span>
                        {rec.breakevens.map((be, i) => (
                          <span key={i} className="font-mono font-semibold">${be.toFixed(2)}</span>
                        ))}
                      </div>
                    )}
                    {/* Score breakdown */}
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Score Breakdown</div>
                      <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
                        {Object.entries(rec.scores).map(([k, v]) => (
                          <div key={k} className="text-center">
                            <div className="text-[10px] text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1")}</div>
                            <div className="font-bold text-sm font-mono">{(v as number).toFixed(1)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* All 13 strategies ranked */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">All 13 Strategies Ranked</div>
                        <button
                          className="text-xs text-blue-500 hover:underline"
                          onClick={() => navigate(`/analyzer?ticker=${activeTicker}`)}
                        >
                          Open full analyzer →
                        </button>
                      </div>
                      <div className="space-y-1">
                        {analysisData?.strategies
                          .sort((a, b) => b.compositeScore - a.compositeScore)
                          .slice(0, 5)
                          .map((s, i) => (
                            <div key={s.name} className="flex items-center gap-3 text-xs">
                              <span className="text-muted-foreground w-4 shrink-0">#{i + 1}</span>
                              <div className="flex-1 bg-muted/40 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${(s.compositeScore / 10) * 100}%`,
                                    background: strategyColor(s.name),
                                  }}
                                />
                              </div>
                              <span className="font-medium w-36 shrink-0">{s.name}</span>
                              <span className="font-mono text-muted-foreground w-10 text-right">{s.compositeScore.toFixed(1)}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                </DrillCard>
              )}

              {/* Greeks */}
              {rec && (
                <DrillCard icon={<Brain className="w-4 h-4" />} title="Greeks & Risk Metrics" accent="#6366f1">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                    <Stat label="Delta" value={rec.delta.toFixed(3)} color={rec.delta > 0 ? "#22c55e" : "#ef4444"} />
                    <Stat label="Gamma" value={rec.gamma.toFixed(4)} />
                    <Stat label="Theta" value={`$${rec.theta.toFixed(2)}/day`} color="#22c55e" />
                    <Stat label="Vega" value={rec.vega.toFixed(3)} />
                    <Stat label="Rho" value={rec.rho.toFixed(3)} />
                    <Stat label="Buying Power" value={`$${rec.buyingPower.toFixed(0)}`} />
                    <Stat label="IV Rank" value={`${regime?.ivPercentileRank?.toFixed(0) ?? "—"}`} />
                    <Stat label="IV/RV Ratio" value={regime?.ivRvRatio?.toFixed(2) ?? "—"} />
                    <Stat label="Realized Vol" value={regime ? `${(regime.rv20 * 100).toFixed(1)}%` : "—"} />
                    <Stat label="Median IV" value={regime ? `${(regime.medianIV * 100).toFixed(1)}%` : "—"} />
                  </div>
                </DrillCard>
              )}

              {/* PCR Signal */}
              {pcrData && (
                <DrillCard icon={<TrendingUp className="w-4 h-4" />} title="PCR Signal — Put/Call Ratio" accent={pcrColor(pcrData.signal)}>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <Stat label="PCR" value={Number(pcrData.pcr).toFixed(2)} />
                      <Stat label="Signal" value={pcrLabel(pcrData.signal)} color={pcrColor(pcrData.signal)} />
                      {pcrData.totalCallVolume != null && <Stat label="Call Vol" value={Number(pcrData.totalCallVolume).toLocaleString()} />}
                      {pcrData.totalPutVolume != null && <Stat label="Put Vol" value={Number(pcrData.totalPutVolume).toLocaleString()} />}
                    </div>
                    {pcrData.strategyHint && (
                      <div className="text-sm text-foreground bg-muted/40 rounded-lg px-4 py-3">
                        {pcrData.strategyHint}
                      </div>
                    )}
                    <button
                      className="text-xs text-blue-500 hover:underline"
                      onClick={() => navigate(`/pcr-strategy?ticker=${activeTicker}`)}
                    >
                      View full PCR dashboard →
                    </button>
                  </div>
                </DrillCard>
              )}

              {/* Earnings */}
              {earnings && (
                <DrillCard icon={<Calendar className="w-4 h-4" />} title="Earnings Info" accent="#f59e0b">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <Stat label="Next Earnings" value={earnings.nextEarningsDate ?? "Unknown"} />
                    <Stat label="Days Away" value={earnings.daysToEarnings != null ? `${earnings.daysToEarnings}d` : "—"}
                      color={earnings.daysToEarnings != null && earnings.daysToEarnings <= 7 ? "#ef4444" : undefined} />
                    <Stat label="Implied Move" value={earnings.expectedEarningsMove != null ? `±${(earnings.expectedEarningsMove * 100).toFixed(1)}%` : "—"} />
                    <Stat label="Avg Historical" value={earnings.avgHistoricalMove != null ? `±${(earnings.avgHistoricalMove * 100).toFixed(1)}%` : "—"} />
                  </div>
                  {earnings.historicalEarningsMoves.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs text-muted-foreground mb-1.5">Last {earnings.historicalEarningsMoves.length} earnings moves:</div>
                      <div className="flex gap-2">
                        {earnings.historicalEarningsMoves.map((m, i) => (
                          <div key={i} className="px-2.5 py-1 rounded-md text-xs font-mono font-semibold"
                            style={{ background: "#f59e0b18", color: "#f59e0b" }}>
                            ±{(m * 100).toFixed(1)}%
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </DrillCard>
              )}

              {/* More tools */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                {[
                  { label: "Full Options Analyzer", desc: "All 13 strategies ranked", icon: <Zap className="w-4 h-4" />, color: "#3b82f6", path: `/analyzer?ticker=${activeTicker}` },
                  { label: "Velez Scanner", desc: "Daily Fib + EMA signals", icon: <TrendingUp className="w-4 h-4" />, color: "#22c55e", path: "/velez-scanner" },
                  { label: "Intraday Scanner", desc: "5-min Grade-A setups", icon: <Activity className="w-4 h-4" />, color: "#f59e0b", path: "/intraday-scanner" },
                  { label: "VCP Strategy", desc: "Volatility contraction", icon: <BarChart2 className="w-4 h-4" />, color: "#6366f1", path: "/vcp-strategy" },
                  { label: "Catalyst Watch", desc: "BCOS breakout signals", icon: <TrendingDown className="w-4 h-4" />, color: "#ec4899", path: "/catalyst-watch" },
                  { label: "Glossary", desc: "Options terminology", icon: <BookOpen className="w-4 h-4" />, color: "#14b8a6", path: "/glossary" },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => navigate(item.path)}
                    className="rounded-xl border p-4 text-left flex items-start gap-3 transition-all hover:shadow-md hover:scale-[1.02] active:scale-[0.99]"
                    style={{ borderColor: item.color + "33", background: item.color + "06" }}
                  >
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: item.color + "18", color: item.color }}>
                      {item.icon}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">{item.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{item.desc}</div>
                    </div>
                  </button>
                ))}
              </div>

            </div>
          </div>
        )}
      </div>
    </ActionLayout>
  );
}
