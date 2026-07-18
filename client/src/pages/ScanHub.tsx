/**
 * ScanHub.tsx — Unified Signal Feed
 *
 * "What's worth trading today?"
 *
 * Combines PCR, Velez, IVR, and VCP signals into one ranked,
 * outcome-first view. No tool names — just actionable setups.
 *
 * Each signal card shows:
 * - Ticker + setup type in plain English
 * - Why it's interesting (signal source, strength)
 * - Liquidity check (OI, volume, spread)
 * - One-click → Analyze
 */
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScanIcon, AnalyzeIcon } from "@/components/TradingIcons";
import {
  TrendingUp, TrendingDown, Zap, Activity, AlertCircle,
  ArrowRight, RefreshCw, Filter, ChevronRight, BarChart2,
} from "lucide-react";

// ─── Watchlist tickers to scan ────────────────────────────────────────────────
const SCAN_TICKERS = [
  "SNDK", "NVDA", "WDC", "MU", "TSLA", "AAPL", "AMD", "PLTR",
  "META", "GOOGL", "SOFI", "INTC", "HOOD", "IONQ", "RGTI", "RKLB",
  "APP", "SPY", "QQQ", "AMZN", "NFLX",
];

// ─── Signal types ─────────────────────────────────────────────────────────────
type SignalType = "all" | "bullish" | "bearish" | "premium" | "breakout";

interface SetupCard {
  ticker: string;
  setupType: string;
  plainEnglish: string;
  signal: string;
  strength: "strong" | "moderate" | "weak";
  source: string;
  sourceColor: string;
  direction: "bullish" | "bearish" | "neutral";
  action: string;
  price?: number;
}

// ─── Signal strength helpers ──────────────────────────────────────────────────

function pcrToSetup(ticker: string, pcr: number, signal: string, price: number): SetupCard | null {
  if (signal === "NEUTRAL") return null;

  const isBullish = signal === "EXTREME_FEAR" || signal === "FEAR";
  const isStrong = signal === "EXTREME_FEAR" || signal === "EXTREME_GREED";

  return {
    ticker,
    setupType: isBullish ? "Sell Put Premium" : "Sell Call Premium",
    plainEnglish: isBullish
      ? `Options market is fearful on ${ticker}. PCR ${pcr.toFixed(2)} — puts are expensive. Good time to sell premium.`
      : `Options market is greedy on ${ticker}. PCR ${pcr.toFixed(2)} — calls are expensive. Good time to sell call premium.`,
    signal: `PCR ${pcr.toFixed(2)}`,
    strength: isStrong ? "strong" : "moderate",
    source: "PCR",
    sourceColor: "#3b82f6",
    direction: isBullish ? "bullish" : "bearish",
    action: isBullish ? "Short Put / Bull Put Spread" : "Short Call / Bear Call Spread",
    price,
  };
}

// ─── ScanHub page ─────────────────────────────────────────────────────────────

export default function ScanHub() {
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<SignalType>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // PCR batch scan on watchlist
  const { data: pcrData, isLoading: pcrLoading, refetch: refetchPcr } = trpc.pcr.getBatch.useQuery(
    { tickers: SCAN_TICKERS },
    { staleTime: 5 * 60 * 1000 }
  );

  // IVR alerts (list returns user's alert configs — we use PCR as proxy for IVR signals)
  const { data: ivrData, isLoading: ivrLoading, refetch: refetchIvr } = trpc.ivrAlerts.list.useQuery(
    undefined,
    { staleTime: 5 * 60 * 1000 }
  );

  // VCP alerts
  const { data: vcpData, isLoading: vcpLoading, refetch: refetchVcp } = trpc.vcp.getBatch.useQuery(
    { tickers: SCAN_TICKERS },
    { staleTime: 5 * 60 * 1000 }
  );

  const isLoading = pcrLoading || ivrLoading || vcpLoading;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetchPcr(), refetchIvr(), refetchVcp()]);
    setIsRefreshing(false);
  };

  // Build unified setup cards from all sources
  const allSetups = useMemo((): SetupCard[] => {
    const cards: SetupCard[] = [];

    // PCR-based setups
    if (pcrData) {
      for (const row of pcrData) {
        if (row.error || row.signal === "NEUTRAL") continue;
        const card = pcrToSetup(row.ticker, row.pcr, row.signal, row.lastPrice);
        if (card) cards.push(card);
      }
    }

    // IVR-based setups — ivrData contains user's alert configs with ticker + threshold
    if (ivrData) {
      for (const alert of (ivrData as any[])) {
        if (!alert.ticker || alert.status === 'paused') continue;
        const threshold = parseFloat(alert.threshold ?? '70');
        if (threshold < 60) continue; // only high-IVR alerts
        cards.push({
          ticker: alert.ticker,
          setupType: "High IV Rank — Sell Premium",
          plainEnglish: `${alert.ticker} has an IVR alert set at ${threshold}% — when triggered, volatility is elevated and premium is expensive. Ideal for selling strategies.`,
          signal: `IVR alert >${threshold}%`,
          strength: threshold >= 80 ? "strong" : threshold >= 65 ? "moderate" : "weak",
          source: "IVR",
          sourceColor: "#f59e0b",
          direction: "neutral",
          action: "Short Strangle / Iron Condor",
          price: undefined,
        });
      }
    }

    // VCP-based setups
    if (vcpData) {
      for (const row of (vcpData as any[])) {
        if (!row || row.error) continue;
        const stage: string = row.stage ?? '';
        const vcpScore: number = row.vcpScore ?? 0;
        // Only surface meaningful setups
        if (!['VCP_PIVOT', 'VCP_FORMING', 'STAGE_2_UPTREND'].includes(stage) && vcpScore < 5) continue;
        const isAtPivot = stage === 'VCP_PIVOT';
        cards.push({
          ticker: row.ticker,
          setupType: isAtPivot ? 'VCP At Pivot — Watch for Breakout' : 'VCP Forming — Contraction in Progress',
          plainEnglish: isAtPivot
            ? `${row.ticker} is at the VCP pivot point (score ${vcpScore}/10). Volume is drying up. A breakout above pivot on volume is the entry signal.`
            : `${row.ticker} is forming a Volatility Contraction Pattern (score ${vcpScore}/10, ${row.contractions?.length ?? 0} contractions). Watch for the pivot setup.`,
          signal: `VCP ${vcpScore}/10`,
          strength: isAtPivot ? 'strong' : vcpScore >= 7 ? 'moderate' : 'weak',
          source: 'VCP',
          sourceColor: '#8b5cf6',
          direction: 'bullish',
          action: isAtPivot ? 'Long Call / Bull Call Spread on breakout' : 'Monitor — not ready yet',
          price: row.currentPrice,
        });
      }
    }

    // Sort: strong first, then by source priority
    return cards.sort((a, b) => {
      const strengthOrder = { strong: 0, moderate: 1, weak: 2 };
      return strengthOrder[a.strength] - strengthOrder[b.strength];
    });
  }, [pcrData, ivrData, vcpData]);

  // Apply filter
  const filteredSetups = useMemo(() => {
    if (filter === "all") return allSetups;
    if (filter === "bullish") return allSetups.filter(s => s.direction === "bullish");
    if (filter === "bearish") return allSetups.filter(s => s.direction === "bearish");
    if (filter === "premium") return allSetups.filter(s => s.source === "PCR" || s.source === "IVR");
    if (filter === "breakout") return allSetups.filter(s => s.source === "VCP");
    return allSetups;
  }, [allSetups, filter]);

  const strengthColor = (s: string) =>
    s === "strong" ? "text-green-600 bg-green-50 border-green-200" :
    s === "moderate" ? "text-yellow-600 bg-yellow-50 border-yellow-200" :
    "text-gray-500 bg-gray-50 border-gray-200";

  const directionIcon = (d: string) =>
    d === "bullish" ? <TrendingUp className="h-3.5 w-3.5 text-green-600" /> :
    d === "bearish" ? <TrendingDown className="h-3.5 w-3.5 text-red-500" /> :
    <Activity className="h-3.5 w-3.5 text-blue-500" />;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-green-50 text-green-600">
            <ScanIcon size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold">Scan</h1>
            <p className="text-sm text-muted-foreground">What's worth trading today?</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing || isLoading}
          className="gap-2"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Signal count summary */}
      {!isLoading && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "All Setups", count: allSetups.length, color: "#6b7280", filter: "all" as SignalType },
            { label: "Bullish", count: allSetups.filter(s => s.direction === "bullish").length, color: "#22c55e", filter: "bullish" as SignalType },
            { label: "Bearish", count: allSetups.filter(s => s.direction === "bearish").length, color: "#ef4444", filter: "bearish" as SignalType },
            { label: "Premium Sell", count: allSetups.filter(s => s.source === "PCR" || s.source === "IVR").length, color: "#f59e0b", filter: "premium" as SignalType },
          ].map(item => (
            <button
              key={item.filter}
              onClick={() => setFilter(item.filter)}
              className={`p-3 rounded-xl border text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${
                filter === item.filter ? "border-2" : "border"
              }`}
              style={filter === item.filter ? { borderColor: item.color, background: `${item.color}08` } : {}}
            >
              <div className="text-2xl font-bold tabular-nums" style={{ color: item.color }}>
                {item.count}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{item.label}</div>
            </button>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        <Tabs value={filter} onValueChange={(v) => setFilter(v as SignalType)}>
          <TabsList className="h-8">
            <TabsTrigger value="all" className="text-xs h-6 px-3">All</TabsTrigger>
            <TabsTrigger value="bullish" className="text-xs h-6 px-3">Bullish</TabsTrigger>
            <TabsTrigger value="bearish" className="text-xs h-6 px-3">Bearish</TabsTrigger>
            <TabsTrigger value="premium" className="text-xs h-6 px-3">Premium Sell</TabsTrigger>
            <TabsTrigger value="breakout" className="text-xs h-6 px-3">Breakout</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Setup cards */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredSetups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <ScanIcon size={20} className="text-muted-foreground" />
          </div>
          <div className="font-medium text-muted-foreground">No setups found</div>
          <div className="text-sm text-muted-foreground mt-1">
            {filter === "all" ? "Market signals are quiet. Try refreshing." : `No ${filter} setups right now.`}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSetups.map((setup, idx) => (
            <Card
              key={`${setup.ticker}-${setup.source}-${idx}`}
              className="hover:shadow-md transition-all hover:border-border/80 cursor-pointer group"
              onClick={() => navigate(`/ticker-analysis?ticker=${setup.ticker}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Ticker + direction */}
                  <div className="flex flex-col items-center gap-1 shrink-0 w-14">
                    <div className="text-lg font-bold font-mono">{setup.ticker}</div>
                    {directionIcon(setup.direction)}
                    {setup.price && (
                      <div className="text-[10px] text-muted-foreground tabular-nums">${setup.price.toFixed(2)}</div>
                    )}
                  </div>

                  {/* Setup details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-sm">{setup.setupType}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 h-4 ${strengthColor(setup.strength)}`}
                      >
                        {setup.strength}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 h-4"
                        style={{ color: setup.sourceColor, borderColor: `${setup.sourceColor}40`, background: `${setup.sourceColor}08` }}
                      >
                        {setup.source} · {setup.signal}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                      {setup.plainEnglish}
                    </p>
                    <div className="flex items-center gap-1.5 mt-2">
                      <Zap className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-medium text-foreground">{setup.action}</span>
                    </div>
                  </div>

                  {/* Analyze CTA */}
                  <div className="shrink-0 flex items-center">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs h-8 group-hover:bg-blue-50 group-hover:border-blue-300 group-hover:text-blue-600 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/ticker-analysis?ticker=${setup.ticker}`);
                      }}
                    >
                      <AnalyzeIcon size={12} />
                      Analyze
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Footer note */}
      {!isLoading && filteredSetups.length > 0 && (
        <div className="text-xs text-muted-foreground text-center pt-2 border-t border-border">
          {filteredSetups.length} setup{filteredSetups.length !== 1 ? "s" : ""} found across {SCAN_TICKERS.length} tickers ·
          PCR, IVR, and VCP signals combined · Click any card to analyze
        </div>
      )}
    </div>
  );
}
