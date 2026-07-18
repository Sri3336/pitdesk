import { useAuth } from "@/_core/hooks/useAuth";
import { PitDeskLogo } from "./PitDeskLogo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { useIsMobile } from "@/hooks/useMobile";
import {
  Activity,
  BarChart2,
  Bell,
  BookOpen,
  Building2,
  CandlestickChart,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Database,
  GitMerge,
  HelpCircle,
  Home,
  LineChart,
  LogOut,
  MessageSquare,
  PanelLeft,
  Radio,
  Scan,
  Settings,
  Shield,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Upload,
  Zap,
  Sunrise,
  ListChecks,
  MapPin,
  HardDrive,
  Calculator,
  FlaskConical,
  BookMarked,
  Chrome,
  Timer,
  Crosshair,
  Rss,
  Layers,
  GitBranch,
  Search,
  FlaskRound,
  LayoutDashboard,
  AlertCircle,
  BarChart3,
  Telescope,
  Flame,
  BookCheck,
  Gauge,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { ROUTES } from "@/lib/routes";

const SIDEBAR_WIDTH_KEY = "pitdesk-sidebar-width";
const SIDEBAR_SECTIONS_KEY = "pitdesk-sidebar-sections-v4";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 380;

// ─── Nav structure: two primary workflows + supporting sections ────────────────

const NAV_SECTIONS = [
  {
    key: "find_trade",
    label: "🎯 Find the Best Trade",
    defaultOpen: true,
    accent: "#22c55e",
    items: [
      { icon: Home,           label: "Dashboard",          path: "/dashboard",         desc: "Overview & quick stats" },
      { icon: Search,         label: "Analyze a Ticker",   path: "/ticker-analysis",   desc: "Full 5-dimension analysis" },
      { icon: Zap,            label: "Day Picks",          path: "/day-picks",         desc: "Top intraday setups today" },
      { icon: TrendingUp,     label: "Swing Picks",        path: "/swing-picks",       desc: "Best 3–10 day setups" },
      { icon: BarChart2,      label: "PCR Dashboard",      path: "/pcr-dashboard",     desc: "Put/Call ratio signals" },
      { icon: CandlestickChart, label: "Charts",           path: "/charts",            desc: "TradingView charts" },
      { icon: Scan,           label: "Scan All",           path: "/scan-all",          desc: "Multi-strategy scanner" },
      { icon: LineChart,      label: "Velez Scanner",      path: "/velez-scanner",     desc: "Daily Fib+EMA signals" },
      { icon: Activity,       label: "Intraday Scanner",   path: "/intraday-scanner",  desc: "5-min Grade-A setups" },
      { icon: GitMerge,       label: "VCP Strategy",       path: "/vcp-strategy",      desc: "Volatility contraction" },
      { icon: Flame,          label: "Catalyst Watch",     path: "/catalyst-watch",    desc: "BCOS breakout signals" },
      { icon: Radio,          label: "Earnings Calendar",  path: "/earnings-calendar", desc: "Upcoming earnings" },
      { icon: ClipboardList,  label: "Watchlist",          path: "/watchlist",         desc: "Your tracked tickers" },
    ],
  },
  {
    key: "test_trade",
    label: "🧪 Test & Visualize Payout",
    defaultOpen: true,
    accent: "#8b5cf6",
    items: [
      { icon: Activity,       label: "Options Analyzer",   path: "/analyzer",          desc: "15-strategy engine" },
      { icon: FlaskConical,   label: "Payoff Lab",         path: "/analyzer?tab=payoff", desc: "Visual payoff builder" },
      { icon: MessageSquare,  label: "Pit Advisor",        path: "/pit-advisor",       desc: "AI trade analysis" },
      { icon: Calculator,     label: "Position Sizer",     path: "/position-sizer",    desc: "Risk & size calculator" },
      { icon: FlaskRound,     label: "Backtester",         path: "/backtester",        desc: "Strategy backtesting" },
      { icon: TrendingDown,   label: "ICT Supply Zone",    path: "/ict-supply-zone",   desc: "Supply/demand zones" },
      { icon: Layers,         label: "ICT Liquidity",      path: "/ict-liquidity",     desc: "Liquidity scanner" },
      { icon: TrendingUp,     label: "EMA Pullback",       path: "/ema-pullback",      desc: "EMA reversion setups" },
      { icon: Timer,          label: "Theta Machine",      path: "/theta-machine",     desc: "Premium decay tracker" },
      { icon: Crosshair,      label: "Decision Bench",     path: "/decision-bench",    desc: "Trade decision tool" },
    ],
  },
  {
    key: "execution",
    label: "Execute & Track",
    defaultOpen: true,
    accent: "#f59e0b",
    items: [
      { icon: Shield,         label: "Pre-Market Checklist", path: "/pre-market",      desc: "Daily prep routine" },
      { icon: Sunrise,        label: "Morning Session",    path: "/morning-session",   desc: "Session planning" },
      { icon: ClipboardList,  label: "Trade Log",          path: "/trade-log",         desc: "Journal & review" },
      { icon: Upload,         label: "Analyze My Trades",  path: "/trade-upload",      desc: "Upload brokerage CSV" },
      { icon: BarChart3,      label: "Performance",        path: "/performance",       desc: "P&L analytics" },
      { icon: BookOpen,       label: "Trade Proposals",    path: "/trade-proposals",   desc: "Pre-trade plans" },
      { icon: ListChecks,     label: "Swing Watchlist",    path: "/swing-watchlist",   desc: "Multi-day tracking" },
      { icon: MapPin,         label: "Liquidity Map",      path: "/liquidity-map",     desc: "Key price levels" },
    ],
  },
  {
    key: "alerts",
    label: "Alerts",
    defaultOpen: false,
    accent: "#f97316",
    items: [
      { icon: Bell,           label: "IVR Alerts",         path: "/ivr-alerts",        desc: "IV rank alerts" },
      { icon: Bell,           label: "VCP Alerts",         path: "/vcp-alerts",        desc: "VCP pattern alerts" },
      { icon: Sparkles,       label: "Fib+EMA Alerts",     path: "/fib-ema-alerts",    desc: "Fibonacci alerts" },
      { icon: Zap,            label: "AI Agent",           path: "/agent",             desc: "Autonomous agent" },
      { icon: Rss,            label: "Live Trader Feed",   path: "/live-trader-feed",  desc: "Real-time feed" },
      { icon: Zap,            label: "Nour Scanner",       path: "/nour-scanner",      desc: "Nour signals" },
    ],
  },
  {
    key: "playbook",
    label: "Playbook & Reference",
    defaultOpen: false,
    accent: "#14b8a6",
    items: [
      { icon: Shield,         label: "My Playbook",        path: "/my-playbook",       desc: "Your personal rules & style profile" },
      { icon: BookMarked,     label: "Sri's Playbook",     path: "/sri-playbook",      desc: "Personal strategy guide" },
      { icon: BookOpen,       label: "Methodology",        path: "/methodology",       desc: "System documentation" },
      { icon: HelpCircle,     label: "Glossary",           path: "/glossary",          desc: "Options terminology" },
      { icon: HelpCircle,     label: "How-To",             path: "/how-to",            desc: "Usage guides" },
    ],
  },
  {
    key: "data",
    label: "Data & Settings",
    defaultOpen: false,
    accent: "#6b7280",
    items: [
      { icon: Zap,            label: "Options Flow",       path: "/options-flow",      desc: "Unusual options activity" },
      { icon: Database,       label: "COT Dashboard",      path: "/cot-dashboard",     desc: "Commitment of traders" },
      { icon: HardDrive,      label: "Historical Data",    path: "/historical-data",   desc: "Price history" },
      { icon: Building2,      label: "Broker Settings",    path: "/broker-settings",   desc: "E*TRADE / Schwab" },
      { icon: Chrome,         label: "Extension Settings", path: "/extension-settings", desc: "Browser extension" },
    ],
  },
] as const;

type SectionKey = (typeof NAV_SECTIONS)[number]["key"];

// ─── Workflow badge colors ─────────────────────────────────────────────────────
const SECTION_ACCENT: Record<string, string> = {
  find_trade: "#22c55e",
  test_trade: "#8b5cf6",
  execution: "#f59e0b",
  alerts: "#f97316",
  playbook: "#14b8a6",
  data: "#6b7280",
};

// ─── CollapsibleNavSection ─────────────────────────────────────────────────────

function CollapsibleNavSection({
  sectionKey,
  label,
  items,
  isOpen,
  onToggle,
}: {
  sectionKey: SectionKey;
  label: string;
  items: readonly { icon: React.ElementType; label: string; path: string; desc: string }[];
  isOpen: boolean;
  onToggle: (key: SectionKey) => void;
}) {
  const [location, navigate] = useLocation();
  const accent = SECTION_ACCENT[sectionKey] ?? "#22c55e";
  const isPrimary = sectionKey === "find_trade" || sectionKey === "test_trade";

  return (
    <div className="w-full">
      <Collapsible open={isOpen} onOpenChange={() => onToggle(sectionKey)}>
        <CollapsibleTrigger asChild>
          <button
            className="flex items-center justify-between w-full px-2 py-1.5 mt-2 rounded-md group transition-colors hover:bg-muted/40"
          >
            <span
              className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${
                isPrimary ? "text-foreground/80" : "text-muted-foreground/70 group-hover:text-muted-foreground"
              }`}
              style={isPrimary ? { color: accent } : {}}
            >
              {label}
            </span>
            <ChevronDown
              className={`h-3 w-3 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-0" : "-rotate-90"}`}
              style={{ color: isPrimary ? accent : undefined }}
            />
          </button>
        </CollapsibleTrigger>
        {isPrimary && (
          <div
            className="h-px mx-2 mb-1 rounded-full opacity-30"
            style={{ background: accent }}
          />
        )}
        <CollapsibleContent>
          <SidebarMenu className="px-1 pb-1">
            {items.map((item) => {
              const [itemPath, itemQuery] = item.path.split("?");
              const fullLocation =
                typeof window !== "undefined"
                  ? window.location.pathname + (window.location.search || "")
                  : location;
              const isActive = itemQuery
                ? fullLocation === item.path || fullLocation.startsWith(item.path)
                : location === itemPath;
              return (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={isActive}
                    onClick={() => navigate(item.path)}
                    className={`cursor-pointer h-8 text-sm transition-all duration-150 group/item ${isActive ? "font-semibold" : ""}`}
                    style={isActive ? {
                      background: accent + "14",
                      borderLeft: `2px solid ${accent}`,
                      color: accent,
                    } : {}}
                    title={item.desc}
                  >
                    <item.icon className="h-3.5 w-3.5 shrink-0" style={isActive ? { color: accent } : {}} />
                    <span className="truncate">{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ─── Main Layout ─────────────────────────────────────────────────────────────

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });

  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_SECTIONS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return Object.fromEntries(
      NAV_SECTIONS.map((s) => [s.key, s.defaultOpen])
    ) as Record<SectionKey, boolean>;
  });

  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(SIDEBAR_SECTIONS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const { loading, user, logout } = useAuth();
  const [, navigate] = useLocation();
  const isMobile = useIsMobile();
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(DEFAULT_WIDTH);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = e.clientX - startX.current;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta));
      setSidebarWidth(newWidth);
    };
    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) return <DashboardLayoutSkeleton />;

  const initials = user.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "SA";

  return (
    <SidebarProvider
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <Sidebar variant="inset" collapsible={isMobile ? "offcanvas" : "none"}>
        {/* Header */}
        <SidebarHeader className="border-b border-border px-4 py-3 shrink-0">
          <button
            className="flex items-center gap-2 w-full text-left rounded-lg hover:bg-muted/50 transition-colors -mx-1 px-1 py-0.5 group"
            onClick={() => navigate(ROUTES.HOME)}
            title="Back to Home"
          >
            <PitDeskLogo size={40} />
            <div>
              <div className="font-bold text-sm leading-tight group-hover:text-green-600 transition-colors">PitDesk</div>
              <div className="text-[10px] text-muted-foreground leading-tight">← Home</div>
            </div>
          </button>

          {/* Two workflow quick-access buttons */}
          <div className="flex gap-1.5 mt-3">
            <button
              onClick={() => navigate(ROUTES.TICKER_ANALYSIS)}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: "#22c55e18", color: "#22c55e", border: "1px solid #22c55e33" }}
            >
              <Target className="h-3 w-3" />
              Find Trade
            </button>
            <button
              onClick={() => navigate(ROUTES.ANALYZER)}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: "#8b5cf618", color: "#8b5cf6", border: "1px solid #8b5cf633" }}
            >
              <FlaskConical className="h-3 w-3" />
              Test Payout
            </button>
          </div>
        </SidebarHeader>

        {/* Nav — all sections collapsible */}
        <SidebarContent className="overflow-y-auto px-2 py-2 gap-0 scrollbar-thin">
          {NAV_SECTIONS.map((section) => (
            <CollapsibleNavSection
              key={section.key}
              sectionKey={section.key}
              label={section.label}
              items={section.items}
              isOpen={openSections[section.key] ?? section.defaultOpen}
              onToggle={toggleSection}
            />
          ))}
        </SidebarContent>

        {/* Footer — user profile */}
        <SidebarFooter className="border-t border-border p-3 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 w-full rounded-lg px-2 py-1.5 hover:bg-accent transition-colors text-left">
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarFallback className="text-xs bg-green-100 text-green-700">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{user.name ?? "Sridhar"}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{user.email ?? ""}</div>
                </div>
                <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5 border-b border-border mb-1">
                <div className="text-xs font-semibold truncate">{user.name ?? "Sridhar"}</div>
                <div className="text-[10px] text-muted-foreground truncate">{user.email ?? ""}</div>
                {user.role === "admin" && (
                  <div className="flex items-center gap-1 mt-1">
                    <Shield className="h-3 w-3 text-green-600" />
                    <span className="text-[10px] font-medium text-green-600 uppercase tracking-wide">Admin</span>
                  </div>
                )}
              </div>
              {user.role === "admin" && (
                <>
                  <DropdownMenuItem onClick={() => navigate("/admin/users")} className="cursor-pointer">
                    <Shield className="h-4 w-4 mr-2 text-green-600" />
                    User Management
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={() => navigate("/profile")} className="cursor-pointer">
                <Settings className="h-4 w-4 mr-2" />
                Account Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="cursor-pointer text-red-600 focus:text-red-600">
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>

      {/* Drag handle */}
      <div
        className="fixed top-0 bottom-0 w-1 cursor-col-resize z-50 hover:bg-primary/20 transition-colors"
        style={{ left: `${sidebarWidth}px` }}
        onMouseDown={handleMouseDown}
      />

      <SidebarInset>
        {isMobile && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-background sticky top-0 z-40">
            <SidebarTrigger className="h-8 w-8" />
            <PitDeskLogo size={24} />
            <span className="font-bold text-sm">PitDesk</span>
          </div>
        )}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
