/**
 * ActionLayout — slim top-nav shell for the 5 core action pages.
 * No sidebar. Clean, focused, distraction-free.
 * Includes: PitDesk logo (→ /), current tool name, All Tools dropdown, Ask Pit Advisor shortcut.
 */
import { PitDeskLogo } from "@/components/PitDeskLogo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Activity,
  AlertTriangle,
  BarChart2,
  BookOpen,
  ChevronDown,
  Grid3X3,
  MessageSquare,
  Radio,
  TrendingUp,
  Upload,
  Zap,
} from "lucide-react";
import { useLocation } from "wouter";

interface ActionLayoutProps {
  toolName: string;
  toolColor?: string;
  children: React.ReactNode;
}

const ALL_TOOLS = [
  {
    group: "Core Actions",
    items: [
      { label: "Analyze a Ticker", path: "/ticker-analysis", icon: BarChart2, color: "#22c55e" },
      { label: "Day Trading Picks", path: "/day-picks", icon: Zap, color: "#f59e0b" },
      { label: "Swing Trading Picks", path: "/swing-picks", icon: TrendingUp, color: "#6366f1" },
      { label: "Analyze My Trades", path: "/trade-upload", icon: Upload, color: "#ec4899" },
      { label: "Glossary & Education", path: "/glossary", icon: BookOpen, color: "#14b8a6" },
      { label: "Ask Pit Advisor", path: "/pit-advisor", icon: MessageSquare, color: "#8b5cf6" },
    ],
  },
  {
    group: "Power Tools",
    items: [
      { label: "PCR Signal Board", path: "/pcr-strategy", icon: Radio, color: "#a855f7" },
      { label: "Options Analyzer", path: "/analyzer", icon: Activity, color: "#06b6d4" },
      { label: "Options Flow", path: "/options-flow", icon: BarChart2, color: "#f97316" },
      { label: "IVR Alerts", path: "/ivr-alerts", icon: AlertTriangle, color: "#ef4444" },
      { label: "Full Dashboard", path: "/dashboard", icon: Grid3X3, color: "#64748b" },
    ],
  },
];

export function ActionLayout({ toolName, toolColor = "#22c55e", children }: ActionLayoutProps) {
  const [, navigate] = useLocation();

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--background)" }}>
      {/* ── Top nav bar ─────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-50 flex items-center gap-3 px-4 h-14 border-b"
        style={{
          background: "var(--background)",
          borderColor: "var(--border)",
          backdropFilter: "blur(8px)",
        }}
      >
        {/* Logo → Home */}
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2.5 shrink-0 group"
          title="Back to Home"
        >
          <PitDeskLogo size={32} className="rounded-lg transition-transform duration-150 group-hover:scale-105" />
          <span
            className="font-bold text-sm hidden sm:block"
            style={{ color: "var(--foreground)" }}
          >
            PitDesk
          </span>
        </button>

        {/* Divider */}
        <span className="text-border hidden sm:block">/</span>

        {/* Current tool name */}
        <span
          className="font-semibold text-sm truncate"
          style={{ color: toolColor }}
        >
          {toolName}
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Ask Pit Advisor shortcut */}
        <Button
          size="sm"
          variant="outline"
          className="hidden sm:flex items-center gap-1.5 h-8 text-xs"
          style={{ borderColor: "#8b5cf644", color: "#8b5cf6" }}
          onClick={() => navigate("/pit-advisor")}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Ask Pit Advisor
        </Button>

        {/* All Tools dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="flex items-center gap-1.5 h-8 text-xs"
            >
              <Grid3X3 className="w-3.5 h-3.5" />
              <span className="hidden sm:block">All Tools</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {ALL_TOOLS.map((group) => (
              <div key={group.group}>
                <DropdownMenuLabel className="text-xs text-muted-foreground font-medium">
                  {group.group}
                </DropdownMenuLabel>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <DropdownMenuItem
                      key={item.path}
                      onClick={() => navigate(item.path)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: item.color }} />
                      <span className="text-sm">{item.label}</span>
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* ── Page content ────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
