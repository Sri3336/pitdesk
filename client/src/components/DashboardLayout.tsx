import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  Activity,
  AlertTriangle,
  BarChart2,
  Bell,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  GitMerge,
  HelpCircle,
  Home,
  LineChart,
  LogOut,
  PanelLeft,
  Radio,
  Scan,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";

const SIDEBAR_WIDTH_KEY = "pitdesk-sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 380;

// ─── Nav items ────────────────────────────────────────────────────────────────

const analysisItems = [
  { icon: Home, label: "Dashboard", path: "/" },
  { icon: BarChart2, label: "PCR Dashboard", path: "/pcr-dashboard" },
  { icon: Scan, label: "Scan All", path: "/scan-all" },
  { icon: Activity, label: "Options Analyzer", path: "/analyzer" },
  { icon: ClipboardList, label: "Watchlist", path: "/watchlist" },
  { icon: Radio, label: "Earnings Calendar", path: "/earnings-calendar" },
];

const strategyItems = [
  { icon: TrendingUp, label: "PCR Strategy", path: "/pcr-strategy" },
  { icon: GitMerge, label: "VCP Strategy", path: "/vcp-strategy" },
  { icon: LineChart, label: "Velez Scanner", path: "/velez-scanner" },
  { icon: Zap, label: "Catalyst Watch", path: "/catalyst-watch" },
];

const alertItems = [
  { icon: Bell, label: "IVR Alerts", path: "/ivr-alerts" },
  { icon: Bell, label: "VCP Alerts", path: "/vcp-alerts" },
  { icon: Sparkles, label: "Fib+EMA Alerts", path: "/fib-ema-alerts" },
];

const executionItems = [
  { icon: Zap, label: "AI Agent", path: "/agent" },
  { icon: ClipboardList, label: "Trade Log", path: "/trade-log" },
  { icon: BarChart2, label: "Performance", path: "/performance" },
];

const referenceItems = [
  { icon: BookOpen, label: "Methodology", path: "/methodology" },
  { icon: HelpCircle, label: "Glossary", path: "/glossary" },
  { icon: HelpCircle, label: "How-To", path: "/how-to" },
];

// ─── NavGroup ─────────────────────────────────────────────────────────────────

function NavGroup({
  items,
}: {
  items: { icon: React.ElementType; label: string; path: string }[];
}) {
  const [location, navigate] = useLocation();
  return (
    <SidebarMenu>
      {items.map((item) => {
        const isActive = location === item.path;
        return (
          <SidebarMenuItem key={item.path}>
            <SidebarMenuButton
              isActive={isActive}
              onClick={() => navigate(item.path)}
              className="cursor-pointer"
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

// ─── Main Layout ─────────────────────────────────────────────────────────────

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const [refOpen, setRefOpen] = useState(false);
  const { loading, user, logout } = useAuth();
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

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-green-500 flex items-center justify-center shadow-lg">
              <TrendingUp className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-center">PitDesk</h1>
            <p className="text-sm text-muted-foreground text-center">
              Your personal trading intelligence platform. Sign in to access your dashboard.
            </p>
          </div>
          <Button
            onClick={() => { window.location.href = getLoginUrl(); }}
            size="lg"
            className="w-full bg-green-500 hover:bg-green-600 text-white shadow-lg"
          >
            Sign in to PitDesk
          </Button>
        </div>
      </div>
    );
  }

  const initials = user.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "SA";

  return (
    <SidebarProvider
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <Sidebar variant="inset" collapsible={isMobile ? "offcanvas" : "none"}>
        {/* Header — PitDesk logo */}
        <SidebarHeader className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center shrink-0">
              <TrendingUp className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="font-bold text-sm leading-tight">PitDesk</div>
              <div className="text-[10px] text-muted-foreground leading-tight">Trading Intelligence</div>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="overflow-y-auto">
          {/* ANALYSIS */}
          <SidebarGroup>
            <SidebarGroupLabel>Analysis</SidebarGroupLabel>
            <SidebarGroupContent>
              <NavGroup items={analysisItems} />
            </SidebarGroupContent>
          </SidebarGroup>

          {/* STRATEGIES */}
          <SidebarGroup>
            <SidebarGroupLabel>Strategies</SidebarGroupLabel>
            <SidebarGroupContent>
              <NavGroup items={strategyItems} />
            </SidebarGroupContent>
          </SidebarGroup>

          {/* ALERTS */}
          <SidebarGroup>
            <SidebarGroupLabel>Alerts</SidebarGroupLabel>
            <SidebarGroupContent>
              <NavGroup items={alertItems} />
            </SidebarGroupContent>
          </SidebarGroup>

          {/* EXECUTION */}
          <SidebarGroup>
            <SidebarGroupLabel>Execution</SidebarGroupLabel>
            <SidebarGroupContent>
              <NavGroup items={executionItems} />
            </SidebarGroupContent>
          </SidebarGroup>

          {/* REFERENCE — collapsible */}
          <SidebarGroup>
            <Collapsible open={refOpen} onOpenChange={setRefOpen}>
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="cursor-pointer flex items-center justify-between w-full">
                  <span>Reference</span>
                  {refOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <NavGroup items={referenceItems} />
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>
        </SidebarContent>

        {/* Footer — user profile */}
        <SidebarFooter className="border-t border-border p-3">
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
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={logout} className="text-red-600 cursor-pointer">
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>

      {/* Resize handle */}
      {!isMobile && (
        <div
          className="w-1 cursor-col-resize bg-transparent hover:bg-green-400 transition-colors z-10 shrink-0"
          onMouseDown={handleMouseDown}
        />
      )}

      <SidebarInset className="flex flex-col min-h-screen">
        {/* Top bar */}
        {isMobile && (
          <header className="flex items-center gap-2 px-4 py-3 border-b border-border bg-background sticky top-0 z-10">
            <SidebarTrigger>
              <PanelLeft className="h-5 w-5" />
            </SidebarTrigger>
            <span className="font-semibold text-sm">PitDesk</span>
          </header>
        )}
        <main className="flex-1 overflow-auto">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
