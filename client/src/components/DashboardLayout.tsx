/**
 * DashboardLayout.tsx — PitDesk Navigation Shell
 *
 * Architecture: 6-verb outcome-first navigation
 * Scan | Analyze | Lab | Advisor | Journal | Playbook
 *
 * Each verb maps to a trader intent, not a tool name.
 * Tools live inside each section — the trader never needs to know which engine ran.
 */
import { useAuth } from "@/_core/hooks/useAuth";
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
import { useIsMobile } from "@/hooks/useMobile";
import {
  Bell,
  Building2,
  Calculator,
  CandlestickChart,
  ChevronDown,
  ChevronRight,
  Chrome,
  ClipboardList,
  Database,
  FlaskConical,
  HardDrive,
  HelpCircle,
  Home,
  LayoutDashboard,
  LogOut,
  Radio,
  Settings,
  Shield,
  Sparkles,
  Timer,
  TrendingUp,
  Upload,
  Zap,
  Activity,
  BarChart2,
  BookOpen,
  BookMarked,
  Flame,
  GitMerge,
  Layers,
  LineChart,
  ListChecks,
  MapPin,
  MessageSquare,
  Rss,
  Scan,
  Sunrise,
  Target,
  TrendingDown,
  Crosshair,
  BarChart3,
  Search,
  Command,
  ShieldAlert,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { PitDeskLogo } from "./PitDeskLogo";
import { ROUTES } from "@/lib/routes";
import {
  ScanIcon,
  AnalyzeIcon,
  LabIcon,
  AdvisorIcon,
  JournalIcon,
  PlaybookIcon,
} from "./TradingIcons";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { trpc } from "@/lib/trpc";

const SIDEBAR_WIDTH_KEY = "pitdesk-sidebar-width";
const SIDEBAR_SECTIONS_KEY = "pitdesk-sidebar-sections-v5";
const DEFAULT_WIDTH = 256;
const MIN_WIDTH = 200;
const MAX_WIDTH = 360;

// ─── 6-Verb Navigation Architecture ──────────────────────────────────────────
// Each section = one trader intent. Tools are grouped inside, not exposed as nav.

const NAV_SECTIONS = [
  {
    key: "scan",
    label: "Scan",
    icon: ScanIcon,
    tagline: "What's worth trading today?",
    defaultOpen: true,
    color: "#22c55e",
    items: [
      { icon: LayoutDashboard, label: "Dashboard",        path: "/dashboard",         desc: "Daily briefing & open positions" },
      { icon: BarChart3,       label: "Daily Scan",       path: "/daily-scan",        desc: "60 tickers ranked by confluence score" },
      { icon: ShieldAlert,     label: "Trade Monitor",    path: "/active-monitor",   desc: "Live confluence health on open trades" },
      { icon: Search,          label: "Scan All",         path: "/scan",              desc: "Multi-strategy unified scanner" },
      { icon: LineChart,       label: "Velez Scanner",    path: "/velez-scanner",     desc: "Daily Fib+EMA pullback signals" },
      { icon: Activity,        label: "Intraday Scanner", path: "/intraday-scanner",  desc: "5-min Grade-A intraday setups" },
      { icon: GitMerge,        label: "VCP Strategy",     path: "/vcp-strategy",      desc: "Volatility contraction patterns" },
      { icon: Flame,           label: "Catalyst Watch",   path: "/catalyst-watch",    desc: "BCOS breakout signals" },
      { icon: BarChart2,       label: "PCR Dashboard",    path: "/pcr-dashboard",     desc: "Put/Call ratio signals" },
      { icon: Radio,           label: "Earnings Calendar",path: "/earnings-calendar", desc: "Upcoming earnings events" },
      { icon: ClipboardList,   label: "Watchlist",        path: "/watchlist",         desc: "Your tracked tickers" },
    ],
  },
  {
    key: "analyze",
    label: "Analyze",
    icon: AnalyzeIcon,
    tagline: "I have a ticker — what's the best trade?",
    defaultOpen: true,
    color: "#3b82f6",
    items: [
      { icon: Target,          label: "Ticker Analysis",  path: "/ticker-analysis",   desc: "Full 5-dimension trade analysis" },
      { icon: CandlestickChart,label: "Charts",           path: "/charts",            desc: "TradingView interactive charts" },
      { icon: BarChart2,       label: "PCR Strategy",     path: "/pcr-strategy",      desc: "PCR-based trade signals" },
      { icon: Zap,             label: "Options Flow",     path: "/options-flow",      desc: "Unusual options activity" },
      { icon: Database,        label: "COT Dashboard",    path: "/cot-dashboard",     desc: "Commitment of traders data" },
    ],
  },
  {
    key: "lab",
    label: "Lab",
    icon: LabIcon,
    tagline: "Test a strategy structure visually.",
    defaultOpen: false,
    color: "#8b5cf6",
    items: [
      { icon: Activity,        label: "Options Analyzer", path: "/analyzer",          desc: "15-strategy engine with payoff curves" },
      { icon: FlaskConical,    label: "Payoff Lab",       path: "/analyzer?tab=payoff", desc: "Build any options structure visually" },
      { icon: Calculator,      label: "Position Sizer",   path: "/position-sizer",    desc: "Risk & position size calculator" },
      { icon: FlaskConical,    label: "Backtester",       path: "/backtester",        desc: "Strategy backtesting on local data" },
      { icon: Timer,           label: "Theta Machine",    path: "/theta-machine",     desc: "Premium decay tracker" },
      { icon: Crosshair,       label: "Decision Bench",   path: "/decision-bench",    desc: "Trade decision framework" },
      { icon: TrendingDown,    label: "ICT Supply Zone",  path: "/ict-supply-zone",   desc: "Supply & demand zones" },
      { icon: Layers,          label: "ICT Liquidity",    path: "/ict-liquidity",     desc: "Liquidity level scanner" },
    ],
  },
  {
    key: "advisor",
    label: "Advisor",
    icon: AdvisorIcon,
    tagline: "Talk me through this trade.",
    defaultOpen: false,
    color: "#f59e0b",
    items: [
      { icon: MessageSquare,   label: "Pit Advisor",      path: "/pit-advisor",       desc: "AI trade analysis & second opinion" },
      { icon: BookOpen,        label: "Trade Proposals",  path: "/trade-proposals",   desc: "Pre-trade structured plans" },
      { icon: Shield,          label: "Pre-Market",       path: "/pre-market",        desc: "Daily prep checklist" },
      { icon: Sunrise,         label: "Morning Session",  path: "/morning-session",   desc: "Session planning & goals" },
    ],
  },
  {
    key: "journal",
    label: "Journal",
    icon: JournalIcon,
    tagline: "Review my trades and learn.",
    defaultOpen: false,
    color: "#06b6d4",
    items: [
      { icon: ClipboardList,   label: "Trade Log",        path: "/trade-log",         desc: "All trades with journal notes" },
      { icon: Upload,          label: "Analyze My Trades",path: "/trade-upload",      desc: "Upload brokerage CSV" },
      { icon: BarChart3,       label: "Performance",      path: "/performance",       desc: "P&L analytics & win rate" },
      { icon: ListChecks,      label: "Swing Watchlist",  path: "/swing-watchlist",   desc: "Multi-day position tracking" },
      { icon: MapPin,          label: "Liquidity Map",    path: "/liquidity-map",     desc: "Key price levels" },
    ],
  },
  {
    key: "playbook",
    label: "Playbook",
    icon: PlaybookIcon,
    tagline: "My rules, my style, my edge.",
    defaultOpen: false,
    color: "#14b8a6",
    items: [
      { icon: Shield,          label: "My Playbook",      path: "/my-playbook",       desc: "Personal rules & style profile" },
      { icon: BookMarked,      label: "Sri's Playbook",   path: "/sri-playbook",      desc: "Master strategy guide" },
      { icon: BookOpen,        label: "Methodology",      path: "/methodology",       desc: "System documentation" },
      { icon: HelpCircle,      label: "Glossary",         path: "/glossary",          desc: "Options terminology" },
      { icon: HelpCircle,      label: "How-To",           path: "/how-to",            desc: "Usage guides" },
      { icon: HardDrive,       label: "Historical Data",  path: "/historical-data",   desc: "Price history & sync" },
      { icon: Building2,       label: "Broker Settings",  path: "/broker-settings",   desc: "E*TRADE / Schwab accounts" },
      { icon: Chrome,          label: "Extension",        path: "/extension-settings",desc: "Browser extension settings" },
    ],
  },
] as const;

type SectionKey = (typeof NAV_SECTIONS)[number]["key"];

// ─── CollapsibleNavSection ────────────────────────────────────────────────────

function CollapsibleNavSection({
  sectionKey,
  label,
  icon: SectionIcon,
  tagline,
  color,
  items,
  isOpen,
  onToggle,
}: {
  sectionKey: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tagline: string;
  color: string;
  items: readonly { icon: React.ComponentType<any>; label: string; path: string; desc: string }[];
  isOpen: boolean;
  onToggle: (key: string) => void;
}) {
  const [location, navigate] = useLocation();

  const hasActive = items.some(item => {
    const itemPath = item.path.split("?")[0];
    return location === itemPath || location.startsWith(itemPath + "/");
  });

  return (
    <Collapsible open={isOpen} onOpenChange={() => onToggle(sectionKey)}>
      <CollapsibleTrigger asChild>
        <button
          className="flex items-center gap-2 w-full px-2 py-2 rounded-lg hover:bg-muted/60 transition-all group mb-0.5"
          style={{ color: hasActive ? color : undefined }}
        >
          <div
            className="flex items-center justify-center w-7 h-7 rounded-md transition-all shrink-0"
            style={{
              background: hasActive ? `${color}18` : "transparent",
              color: hasActive ? color : "var(--muted-foreground)",
            }}
          >
            <SectionIcon size={16} />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div
              className="text-xs font-bold uppercase tracking-wider leading-tight"
              style={{ color: hasActive ? color : "var(--foreground)" }}
            >
              {label}
            </div>
          </div>
          {hasActive && (
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
          )}
          <ChevronDown
            className="h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-200"
            style={{ transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenu className="mb-2 ml-1">
          {items.map((item) => {
            const itemPath = item.path.split("?")[0];
            const isActive = location === itemPath || location.startsWith(itemPath + "/");
            const ItemIcon = item.icon;
            return (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton
                  isActive={isActive}
                  onClick={() => navigate(item.path)}
                  className="relative group/item text-xs h-8 px-2 rounded-md transition-all"
                  style={isActive ? {
                    background: `${color}12`,
                    color,
                    borderLeft: `2px solid ${color}`,
                  } : {}}
                  title={item.desc}
                >
                  <ItemIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Main Layout ──────────────────────────────────────────────────────────────

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, loading } = useAuth();
  const [location, navigate] = useLocation();
  const isMobile = useIsMobile();

  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return stored ? parseInt(stored, 10) : DEFAULT_WIDTH;
  });

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_SECTIONS_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    return Object.fromEntries(NAV_SECTIONS.map(s => [s.key, s.defaultOpen]));
  });

  const toggleSection = useCallback((key: string) => {
    setOpenSections(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(SIDEBAR_SECTIONS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Persist sidebar width
  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  // Auto-open the section containing the active route
  useEffect(() => {
    for (const section of NAV_SECTIONS) {
      const hasActive = section.items.some(item => {
        const itemPath = item.path.split("?")[0];
        return location === itemPath || location.startsWith(itemPath + "/");
      });
      if (hasActive && !openSections[section.key]) {
        setOpenSections(prev => ({ ...prev, [section.key]: true }));
      }
    }
  }, [location]);

  // Drag-to-resize
  const isDragging = useRef(false);
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    e.preventDefault();
    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, ev.clientX));
      setSidebarWidth(newWidth);
    };
    const onMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
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
    ? user.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : "SA";

  return (
    <SidebarProvider
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <Sidebar variant="inset" collapsible={isMobile ? "offcanvas" : "none"}>
        {/* ── Header ── */}
        <SidebarHeader className="border-b border-border px-3 py-3 shrink-0">
          <button
            className="flex items-center gap-2 w-full text-left rounded-lg hover:bg-muted/50 transition-colors px-1 py-0.5 group"
            onClick={() => navigate(ROUTES.HOME)}
            title="Home"
          >
            <PitDeskLogo size={36} />
            <div>
              <div className="font-bold text-sm leading-tight group-hover:text-green-600 transition-colors">PitDesk</div>
              <div className="text-[10px] text-muted-foreground leading-tight">Trading Intelligence</div>
            </div>
          </button>

          {/* Quick-access: Scan + Analyze — the two most common entry points */}
          <div className="flex gap-1.5 mt-2.5">
            <button
              onClick={() => navigate("/scan")}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: "#22c55e18", color: "#22c55e", border: "1px solid #22c55e33" }}
              title="Scan — what's worth trading today?"
            >
              <ScanIcon size={12} />
              Scan
            </button>
            <button
              onClick={() => navigate(ROUTES.TICKER_ANALYSIS)}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: "#3b82f618", color: "#3b82f6", border: "1px solid #3b82f633" }}
              title="Analyze — I have a ticker"
            >
              <AnalyzeIcon size={12} />
              Analyze
            </button>
            <button
              onClick={() => navigate("/analyzer")}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: "#8b5cf618", color: "#8b5cf6", border: "1px solid #8b5cf633" }}
              title="Lab — test a strategy"
            >
              <LabIcon size={12} />
              Lab
            </button>
          </div>
        </SidebarHeader>

        {/* ── Nav — 6 verb sections ── */}
        <SidebarContent className="overflow-y-auto px-2 py-2 gap-0 scrollbar-thin">
          {NAV_SECTIONS.map((section) => (
            <CollapsibleNavSection
              key={section.key}
              sectionKey={section.key}
              label={section.label}
              icon={section.icon}
              tagline={section.tagline}
              color={section.color}
              items={section.items}
              isOpen={openSections[section.key] ?? section.defaultOpen}
              onToggle={toggleSection}
            />
          ))}
        </SidebarContent>

        {/* ── Footer — user profile ── */}
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
        <div className="h-full">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
