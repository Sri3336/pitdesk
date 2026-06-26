import { useAuth } from "@/_core/hooks/useAuth";
import { PitDeskLogo } from "@/components/PitDeskLogo";
import { useLocation } from "wouter";
import {
  BarChart2,
  BookOpen,
  MessageSquare,
  TrendingUp,
  Upload,
  Zap,
} from "lucide-react";

const actions = [
  {
    id: "analyze-ticker",
    icon: BarChart2,
    label: "Analyze a Ticker",
    desc: "Full chart analysis, options strategy recommendation, entry & exit levels across all 5 dimensions.",
    path: "/ticker-analysis",
    accent: "#22c55e",
    accentBg: "rgba(34,197,94,0.08)",
    accentBorder: "rgba(34,197,94,0.25)",
    number: "01",
  },
  {
    id: "day-trading",
    icon: Zap,
    label: "Day Trading Picks",
    desc: "Apply all strategies across our watchlist. Get the top 5 Grade-A intraday setups for today.",
    path: "/day-picks",
    accent: "#f59e0b",
    accentBg: "rgba(245,158,11,0.08)",
    accentBorder: "rgba(245,158,11,0.25)",
    number: "02",
  },
  {
    id: "swing-trading",
    icon: TrendingUp,
    label: "Swing Trading Picks",
    desc: "Multi-day setups — VCP, Velez signals, BCOS breakouts. Best tickers for the next 3–10 days.",
    path: "/swing-picks",
    accent: "#6366f1",
    accentBg: "rgba(99,102,241,0.08)",
    accentBorder: "rgba(99,102,241,0.25)",
    number: "03",
  },
  {
    id: "analyze-trades",
    icon: Upload,
    label: "Analyze My Trades",
    desc: "Upload your brokerage CSV or paste trade data. Get a full breakdown of performance and strategy gaps.",
    path: "/trade-upload",
    accent: "#ec4899",
    accentBg: "rgba(236,72,153,0.08)",
    accentBorder: "rgba(236,72,153,0.25)",
    number: "04",
  },
  {
    id: "education",
    icon: BookOpen,
    label: "Glossary & Education",
    desc: "Options terminology, strategy playbooks, PCR signal zones, Okala rules, and Velez methodology.",
    path: "/glossary",
    accent: "#14b8a6",
    accentBg: "rgba(20,184,166,0.08)",
    accentBorder: "rgba(20,184,166,0.25)",
    number: "05",
  },
  {
    id: "pit-advisor",
    icon: MessageSquare,
    label: "Ask Pit Advisor",
    desc: "Your AI trading buddy. Get a full trade plan — entry, stop, targets, position sizing, and risk assessment.",
    path: "/pit-advisor",
    accent: "#8b5cf6",
    accentBg: "rgba(139,92,246,0.08)",
    accentBorder: "rgba(139,92,246,0.25)",
    number: "06",
  },
];

export default function Home() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

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

      {/* ── 5 Action Cards ───────────────────────────────────────────── */}
      <div className="w-full max-w-3xl grid grid-cols-1 gap-3">
        {actions.map((action, i) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              onClick={() => navigate(action.path)}
              className="group w-full text-left rounded-2xl border transition-all duration-200"
              style={{
                background: action.accentBg,
                borderColor: action.accentBorder,
                animationDelay: `${i * 60}ms`,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
                (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 32px ${action.accent}22`;
                (e.currentTarget as HTMLElement).style.borderColor = action.accent;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                (e.currentTarget as HTMLElement).style.boxShadow = "none";
                (e.currentTarget as HTMLElement).style.borderColor = action.accentBorder;
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
                  style={{ color: action.accent }}
                >
                  {action.number}
                </span>

                {/* Icon */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110"
                  style={{ background: action.accent + "22" }}
                >
                  <Icon className="w-5 h-5" style={{ color: action.accent }} />
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
                    {action.desc}
                  </div>
                </div>

                {/* Arrow */}
                <svg
                  className="w-4 h-4 shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:translate-x-1"
                  style={{ color: action.accent }}
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

      {/* ── Footer hint ──────────────────────────────────────────────── */}
      <p
        className="mt-10 text-xs text-center"
        style={{ color: "var(--muted-foreground)", opacity: 0.5 }}
      >
        All power tools available at{" "}
        <button
          className="underline hover:opacity-80 transition-opacity"
          onClick={() => navigate("/dashboard")}
        >
          /dashboard
        </button>
      </p>
    </div>
  );
}
