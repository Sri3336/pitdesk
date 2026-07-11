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
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { ROUTES } from "@/lib/routes";

const SIDEBAR_WIDTH_KEY = "pitdesk-sidebar-width";
const SIDEBAR_SECTIONS_KEY = "pitdesk-sidebar-sections-v3";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 380;

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_SECTIONS = [
  {
    key: "analysis",
    label: "Analysis",
    defaultOpen: true,
    items: [
      { icon: Home, label: "Dashboard", path: "/dashboard" },
      { icon: BarChart2, label: "PCR Dashboard", path: "/pcr-dashboard" },
      { icon: CandlestickChart, label: "Charts", path: "/charts" },
      { icon: Scan, label: "Scan All", path: "/scan-all" },
      { icon: Activity, label: "Options Analyzer", path: "/analyzer" },
      { icon: ClipboardList, label: "Watchlist", path: "/watchlist" },
      { icon: Radio, label: "Earnings Calendar", path: "/earnings-calendar" },
    ],
  },
  {
    key: "strategies",
    label: "Strategies",
    defaultOpen: true,
    items: [
      { icon: TrendingUp, label: "PCR Strategy", path: "/pcr-strategy" },
      { icon: GitMerge, label: "VCP Strategy", path: "/vcp-strategy" },
      { icon: LineChart, label: "Velez Scanner", path: "/velez-scanner" },
      { icon: Activity, label: "Intraday Scanner", path: "/intraday-scanner" },
      { icon: Zap, label: "Catalyst Watch", path: "/catalyst-watch" },
      { icon: TrendingDown, label: "ICT Supply Zone", path: "/ict-supply-zone" },
      { icon: TrendingUp, label: "EMA Pullback", path: "/ema-pullback" },
      { icon: BookOpen, label: "Chart Patterns", path: "/chart-patterns" },
      { icon: Timer, label: "Theta Machine", path: "/theta-machine" },
      { icon: Crosshair, label: "Decision Bench", path: "/decision-bench" },
      { icon: Rss, label: "Live Trader Feed", path: "/live-trader-feed" },
      { icon: Zap, label: "Nour Scanner", path: "/nour-scanner" },
      { icon: Target, label: "Opening Range Scalper", path: "/velez-scanner?tab=ors" },
    ],
  },
  {
    key: "alerts",
    label: "Alerts",
    defaultOpen: true,
    items: [
      { icon: Bell, label: "IVR Alerts", path: "/ivr-alerts" },
      { icon: Bell, label: "VCP Alerts", path: "/vcp-alerts" },
      { icon: Sparkles, label: "Fib+EMA Alerts", path: "/fib-ema-alerts" },
    ],
  },
  {
    key: "execution",
    label: "Execution",
    defaultOpen: true,
    items: [
      { icon: MessageSquare, label: "Pit Advisor", path: "/pit-advisor" },
      { icon: Zap, label: "AI Agent", path: "/agent" },
      { icon: Shield, label: "Pre-Market Checklist", path: "/pre-market" },
      { icon: Sunrise, label: "Morning Session", path: "/morning-session" },
      { icon: ListChecks, label: "Swing Watchlist", path: "/swing-watchlist" },
      { icon: MapPin, label: "Liquidity Map", path: "/liquidity-map" },
      { icon: ClipboardList, label: "Trade Log", path: "/trade-log" },
      { icon: Upload, label: "Analyze My Trades", path: "/trade-upload" },
      { icon: BarChart2, label: "Performance", path: "/performance" },
      { icon: BookOpen, label: "Trade Proposals", path: "/trade-proposals" },
    ],
  },
  {
    key: "playbook",
    label: "Sri's Playbook",
    defaultOpen: true,
    items: [
      { icon: BookMarked, label: "Playbook & Tracker", path: "/sri-playbook" },
    ],
  },
  {
    key: "backtesting",
    label: "Backtesting",
    defaultOpen: true,
    items: [
      { icon: FlaskConical, label: "Backtester", path: "/backtester" },
      { icon: Calculator, label: "Position Sizer", path: "/position-sizer" },
    ],
  },
  {
    key: "data",
    label: "Data & Settings",
    defaultOpen: true,
    items: [
      { icon: Zap, label: "Options Flow", path: "/options-flow" },
      { icon: Database, label: "COT Dashboard", path: "/cot-dashboard" },
      { icon: HardDrive, label: "Historical Data", path: "/historical-data" },
      { icon: Building2, label: "Broker Settings", path: "/broker-settings" },
      { icon: Chrome, label: "Extension Settings", path: "/extension-settings" },
    ],
  },
  {
    key: "reference",
    label: "Reference",
    defaultOpen: true,
    items: [
      { icon: BookOpen, label: "Methodology", path: "/methodology" },
      { icon: HelpCircle, label: "Glossary", path: "/glossary" },
      { icon: HelpCircle, label: "How-To", path: "/how-to" },
    ],
  },
] as const;

type SectionKey = (typeof NAV_SECTIONS)[number]["key"];

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
  items: readonly { icon: React.ElementType; label: string; path: string }[];
  isOpen: boolean;
  onToggle: (key: SectionKey) => void;
}) {
  const [location, navigate] = useLocation();

  return (
    <div className="w-full">
      <Collapsible open={isOpen} onOpenChange={() => onToggle(sectionKey)}>
        <CollapsibleTrigger asChild>
          <button
            className="flex items-center justify-between w-full px-2 py-1.5 mt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 hover:text-muted-foreground transition-colors rounded-md group"
          >
            <span>{label}</span>
            <ChevronDown
              className={`h-3 w-3 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-0" : "-rotate-90"}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenu className="px-1 pb-1">
            {items.map((item) => {
              const [, itemQuery] = item.path.split("?");
              const fullLocation =
                typeof window !== "undefined"
                  ? window.location.pathname + (window.location.search || "")
                  : location;
              const isActive = itemQuery
                ? fullLocation === item.path || fullLocation.startsWith(item.path)
                : location === item.path;
              return (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={isActive}
                    onClick={() => navigate(item.path)}
                    className={`cursor-pointer h-8 text-sm transition-all duration-150 ${isActive ? 'text-green-700 font-semibold' : ''}`}
                    style={isActive ? { background: 'oklch(0.60 0.175 145 / 10%)', borderLeft: '2px solid oklch(0.60 0.175 145)' } : {}}
                  >
                    <item.icon className="h-3.5 w-3.5 shrink-0" />
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

  // Persist which sections are open/closed
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
                  <DropdownMenuItem     onClick={() => navigate("/admin/users")} className="cursor-pointer">
                    <Shield className="h-4 w-4 mr-2 text-green-600" />
                    User Management
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem     onClick={() => navigate("/profile")} className="cursor-pointer">
                <Settings className="h-4 w-4 mr-2" />
                Account Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-red-600 cursor-pointer">
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>

      {/* Desktop resize handle */}
      {!isMobile && (
        <div
          className="w-1 cursor-col-resize bg-transparent hover:bg-green-400 transition-colors z-10 shrink-0"
          onMouseDown={handleMouseDown}
        />
      )}

      <SidebarInset className="flex flex-col h-screen overflow-hidden">
        {/* Mobile top bar with hamburger */}
        {isMobile && (
          <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background shrink-0 z-10">
            <SidebarTrigger className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-accent transition-colors">
              <PanelLeft className="h-5 w-5" />
            </SidebarTrigger>
            <div className="flex items-center gap-2">
              <PitDeskLogo size={28} />
              <span className="font-semibold text-sm">PitDesk</span>
            </div>
          </header>
        )}
        <main className="flex-1 overflow-hidden min-h-0">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
