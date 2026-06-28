import React from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { PitDeskLogo } from "@/components/PitDeskLogo";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { ROUTES, HOME_ACTIONS } from "@/lib/routes";
import {
  BarChart2,
  BookOpen,
  CalendarDays,
  MessageSquare,
  TrendingUp,
  Upload,
  Zap,
} from "lucide-react";

// Map action key → Lucide icon component
const ACTION_ICONS: Record<string, React.ElementType> = {
  "ticker-analysis": BarChart2,
  "day-picks": Zap,
  "swing-picks": TrendingUp,
  "trade-upload": Upload,
  "glossary": BookOpen,
  "pit-advisor": MessageSquare,
};

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
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: "var(--background)" }}
    >
      {/* ── Brand header ─────────────────────────────────────────────── */}
      <div className="flex flex-col items-center mb-10 select-none">
        {/* Real PitDesk logo */}
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

      {/* ── 6 Action Cards (from ROUTES.HOME_ACTIONS) ────────────────── */}
      <div className="w-full max-w-3xl grid grid-cols-1 gap-3">
        {HOME_ACTIONS.map((action, i) => {
          const Icon = ACTION_ICONS[action.key] ?? BarChart2;
          const accentBg = action.color + "14";
          const accentBorder = action.color + "40";
          return (
            <button
              key={action.key}
              onClick={() => navigate(action.path)}
              className="group w-full text-left rounded-2xl border transition-all duration-200"
              style={{
                background: accentBg,
                borderColor: accentBorder,
                animationDelay: `${i * 60}ms`,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
                (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 32px ${action.color}22`;
                (e.currentTarget as HTMLElement).style.borderColor = action.color;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                (e.currentTarget as HTMLElement).style.boxShadow = "none";
                (e.currentTarget as HTMLElement).style.borderColor = accentBorder;
              }}
              onMouseDown={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "scale(0.99)";
              }}
              onMouseUp={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
              }}
            >
              <div className="flex items-center gap-5 px-6 py-5">
                {/* Number badge */}
                <span
                  className="text-xs font-mono font-bold opacity-30 w-6 shrink-0"
                  style={{ color: action.color }}
                >
                  {action.number}
                </span>

                {/* Icon */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110"
                  style={{ background: action.color + "22" }}
                >
                  <Icon className="w-5 h-5" style={{ color: action.color }} />
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div
                    className="font-semibold text-base leading-tight"
                    style={{ color: "var(--foreground)" }}
                  >
                    {action.label}
                  </div>
                  <div
                    className="text-sm mt-0.5 leading-snug"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {action.description}
                  </div>
                </div>

                {/* Arrow */}
                <svg
                  className="w-4 h-4 shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:translate-x-1"
                  style={{ color: action.color }}
                  fill="none"
                  viewBox="0 0 16 16"
                >
                  <path
                    d="M3 8h10M9 4l4 4-4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </button>
          );
        })}
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

      {/* ── Footer hint ──────────────────────────────────────────────── */}
      <p
        className="mt-10 text-xs text-center"
        style={{ color: "var(--muted-foreground)", opacity: 0.5 }}
      >
        All power tools available at{" "}
        <button
          className="underline hover:opacity-80 transition-opacity"
          onClick={() => navigate(ROUTES.DASHBOARD)}
        >
          /dashboard
        </button>
      </p>
    </div>
  );
}
