/**
 * ActionLayout — slim top-nav shell for the 6 core action pages.
 * No sidebar. Clean, focused, distraction-free.
 * Includes: PitDesk logo (→ /), current tool name, All Tools dropdown, Ask Pit Advisor shortcut.
 *
 * Route strings come from ROUTES / ALL_TOOLS_MENU in @/lib/routes — never hardcoded here.
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
import { ROUTES, ALL_TOOLS_MENU } from "@/lib/routes";

interface ActionLayoutProps {
  toolName: string;
  toolColor?: string;
  children: React.ReactNode;
}

// Map path → Lucide icon for the dropdown menu
const TOOL_ICONS: Record<string, React.ElementType> = {
  [ROUTES.TICKER_ANALYSIS]: BarChart2,
  [ROUTES.DAY_PICKS]: Zap,
  [ROUTES.SWING_PICKS]: TrendingUp,
  [ROUTES.TRADE_UPLOAD]: Upload,
  [ROUTES.GLOSSARY]: BookOpen,
  [ROUTES.PIT_ADVISOR]: MessageSquare,
  [ROUTES.PCR_STRATEGY]: Radio,
  [ROUTES.ANALYZER]: Activity,
  [ROUTES.OPTIONS_FLOW]: BarChart2,
  [ROUTES.IVR_ALERTS]: AlertTriangle,
  [ROUTES.DASHBOARD]: Grid3X3,
};

export function ActionLayout({ toolName, toolColor = "#22c55e", children }: ActionLayoutProps) {
  const [, navigate] = useLocation();

  // Group tools by their group label
  const groups = ALL_TOOLS_MENU.reduce<Record<string, typeof ALL_TOOLS_MENU[number][]>>(
    (acc, item) => {
      if (!acc[item.group]) acc[item.group] = [];
      acc[item.group].push(item);
      return acc;
    },
    {}
  );

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
          onClick={() => navigate(ROUTES.HOME)}
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
          onClick={() => navigate(ROUTES.PIT_ADVISOR)}
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
            {Object.entries(groups).map(([groupName, items], gi) => (
              <div key={groupName}>
                {gi > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-xs text-muted-foreground font-medium">
                  {groupName}
                </DropdownMenuLabel>
                {items.map((item) => {
                  const Icon = TOOL_ICONS[item.path] ?? Activity;
                  return (
                    <DropdownMenuItem
                      key={item.path}
                      onClick={() => navigate(item.path)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                      <span className="text-sm">{item.label}</span>
                    </DropdownMenuItem>
                  );
                })}
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
