/**
 * CommandPalette.tsx — ⌘K instant access for PitDesk
 *
 * Expert mode: type anything, get there instantly.
 * - Type a ticker → go to Ticker Analysis
 * - Type a page name → navigate instantly
 * - Type a strategy → open Options Analyzer with that strategy
 * - Keyboard: ⌘K (Mac) / Ctrl+K (Win) to open, Escape to close
 */
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Activity,
  BarChart2,
  Bell,
  BookMarked,
  BookOpen,
  Building2,
  Calculator,
  CandlestickChart,
  Chrome,
  ClipboardList,
  Database,
  FlaskConical,
  Flame,
  GitMerge,
  HardDrive,
  HelpCircle,
  Home,
  Layers,
  LineChart,
  ListChecks,
  MapPin,
  MessageSquare,
  Radio,
  Search,
  Shield,
  Sunrise,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Upload,
  Zap,
  Crosshair,
  BarChart3,
  LayoutDashboard,
} from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { ScanIcon, AnalyzeIcon, LabIcon, AdvisorIcon, JournalIcon, PlaybookIcon } from "./TradingIcons";

// ─── All navigable destinations ──────────────────────────────────────────────

const ALL_COMMANDS = [
  // Scan
  { group: "Scan", label: "Dashboard",          path: "/dashboard",          icon: LayoutDashboard, keywords: ["home", "overview", "briefing"] },
  { group: "Scan", label: "Scan All",            path: "/scan-all",           icon: Search,          keywords: ["scan", "signals", "all"] },
  { group: "Scan", label: "Velez Scanner",       path: "/velez-scanner",      icon: LineChart,       keywords: ["velez", "fib", "ema", "daily"] },
  { group: "Scan", label: "Intraday Scanner",    path: "/intraday-scanner",   icon: Activity,        keywords: ["intraday", "5min", "grade"] },
  { group: "Scan", label: "VCP Strategy",        path: "/vcp-strategy",       icon: GitMerge,        keywords: ["vcp", "volatility", "contraction"] },
  { group: "Scan", label: "Catalyst Watch",      path: "/catalyst-watch",     icon: Flame,           keywords: ["catalyst", "bcos", "breakout"] },
  { group: "Scan", label: "PCR Dashboard",       path: "/pcr-dashboard",      icon: BarChart2,       keywords: ["pcr", "put", "call", "ratio"] },
  { group: "Scan", label: "Earnings Calendar",   path: "/earnings-calendar",  icon: Radio,           keywords: ["earnings", "calendar", "events"] },
  { group: "Scan", label: "Watchlist",           path: "/watchlist",          icon: ClipboardList,   keywords: ["watchlist", "tickers", "watch"] },

  // Analyze
  { group: "Analyze", label: "Ticker Analysis",  path: "/ticker-analysis",    icon: Target,          keywords: ["ticker", "analyze", "trade", "best"] },
  { group: "Analyze", label: "Charts",           path: "/charts",             icon: CandlestickChart,keywords: ["chart", "candlestick", "tradingview"] },
  { group: "Analyze", label: "PCR Strategy",     path: "/pcr-strategy",       icon: BarChart2,       keywords: ["pcr", "strategy", "signal"] },
  { group: "Analyze", label: "Options Flow",     path: "/options-flow",       icon: Zap,             keywords: ["flow", "unusual", "options", "activity"] },
  { group: "Analyze", label: "COT Dashboard",    path: "/cot-dashboard",      icon: Database,        keywords: ["cot", "commitment", "traders"] },

  // Lab
  { group: "Lab", label: "Options Analyzer",     path: "/analyzer",           icon: Activity,        keywords: ["options", "analyzer", "strategy", "15"] },
  { group: "Lab", label: "Payoff Lab",           path: "/analyzer?tab=payoff",icon: FlaskConical,    keywords: ["payoff", "lab", "curve", "visualize"] },
  { group: "Lab", label: "Position Sizer",       path: "/position-sizer",     icon: Calculator,      keywords: ["position", "size", "risk", "calculator"] },
  { group: "Lab", label: "Backtester",           path: "/backtester",         icon: FlaskConical,    keywords: ["backtest", "history", "test"] },
  { group: "Lab", label: "Theta Machine",        path: "/theta-machine",      icon: Timer,           keywords: ["theta", "decay", "premium"] },
  { group: "Lab", label: "Decision Bench",       path: "/decision-bench",     icon: Crosshair,       keywords: ["decision", "bench", "gate", "check"] },
  { group: "Lab", label: "ICT Supply Zone",      path: "/ict-supply-zone",    icon: TrendingDown,    keywords: ["ict", "supply", "demand", "zone"] },
  { group: "Lab", label: "ICT Liquidity",        path: "/ict-liquidity",      icon: Layers,          keywords: ["ict", "liquidity", "levels"] },

  // Advisor
  { group: "Advisor", label: "Pit Advisor",      path: "/pit-advisor",        icon: MessageSquare,   keywords: ["advisor", "ai", "chat", "pit"] },
  { group: "Advisor", label: "Trade Proposals",  path: "/trade-proposals",    icon: BookOpen,        keywords: ["proposal", "plan", "trade"] },
  { group: "Advisor", label: "Pre-Market",       path: "/pre-market",         icon: Shield,          keywords: ["pre", "market", "checklist", "prep"] },
  { group: "Advisor", label: "Morning Session",  path: "/morning-session",    icon: Sunrise,         keywords: ["morning", "session", "plan"] },

  // Journal
  { group: "Journal", label: "Trade Log",        path: "/trade-log",          icon: ClipboardList,   keywords: ["log", "journal", "trades", "history"] },
  { group: "Journal", label: "Analyze My Trades",path: "/trade-upload",       icon: Upload,          keywords: ["upload", "analyze", "brokerage", "csv"] },
  { group: "Journal", label: "Performance",      path: "/performance",        icon: BarChart3,       keywords: ["performance", "pnl", "win", "rate"] },
  { group: "Journal", label: "Swing Watchlist",  path: "/swing-watchlist",    icon: ListChecks,      keywords: ["swing", "watchlist", "multi", "day"] },
  { group: "Journal", label: "Liquidity Map",    path: "/liquidity-map",      icon: MapPin,          keywords: ["liquidity", "map", "levels", "key"] },

  // Playbook
  { group: "Playbook", label: "My Playbook",     path: "/my-playbook",        icon: Shield,          keywords: ["playbook", "rules", "style", "personal"] },
  { group: "Playbook", label: "Sri's Playbook",  path: "/sri-playbook",       icon: BookMarked,      keywords: ["sri", "playbook", "master", "strategy"] },
  { group: "Playbook", label: "Methodology",     path: "/methodology",        icon: BookOpen,        keywords: ["methodology", "docs", "system"] },
  { group: "Playbook", label: "Glossary",        path: "/glossary",           icon: HelpCircle,      keywords: ["glossary", "terms", "options"] },
  { group: "Playbook", label: "Historical Data", path: "/historical-data",    icon: HardDrive,       keywords: ["historical", "data", "price", "sync"] },
  { group: "Playbook", label: "Broker Settings", path: "/broker-settings",    icon: Building2,       keywords: ["broker", "etrade", "schwab", "settings"] },
];

// Top watchlist tickers for quick navigation
const QUICK_TICKERS = ["SNDK", "NVDA", "WDC", "MU", "TSLA", "AAPL", "AMD", "PLTR", "META", "GOOGL", "SOFI", "INTC", "HOOD", "IONQ", "RGTI", "RKLB", "APP", "SPY", "QQQ"];

const GROUP_ICONS: Record<string, React.ComponentType<any>> = {
  Scan: ScanIcon,
  Analyze: AnalyzeIcon,
  Lab: LabIcon,
  Advisor: AdvisorIcon,
  Journal: JournalIcon,
  Playbook: PlaybookIcon,
};

const GROUP_COLORS: Record<string, string> = {
  Scan: "#22c55e",
  Analyze: "#3b82f6",
  Lab: "#8b5cf6",
  Advisor: "#f59e0b",
  Journal: "#06b6d4",
  Playbook: "#14b8a6",
};

// ─── CommandPalette component ─────────────────────────────────────────────────

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");

  const handleSelect = useCallback((path: string) => {
    onOpenChange(false);
    setQuery("");
    navigate(path);
  }, [navigate, onOpenChange]);

  const handleTickerSelect = useCallback((ticker: string) => {
    onOpenChange(false);
    setQuery("");
    navigate(`/ticker-analysis?ticker=${ticker}`);
  }, [navigate, onOpenChange]);

  // Filter commands by query
  const q = query.toLowerCase().trim();
  const filteredCommands = q
    ? ALL_COMMANDS.filter(cmd =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.group.toLowerCase().includes(q) ||
        cmd.keywords.some(k => k.includes(q))
      )
    : ALL_COMMANDS;

  // Check if query looks like a ticker (1-5 uppercase-ish letters)
  const looksLikeTicker = /^[a-zA-Z]{1,5}$/.test(q) && q.length >= 1;

  // Group filtered commands
  const groups = Array.from(new Set(filteredCommands.map(c => c.group)));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search pages, type a ticker (e.g. SNDK), or describe what you want..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {looksLikeTicker ? (
            <div className="py-4 text-center">
              <div className="text-sm font-medium mb-2">Analyze {query.toUpperCase()}?</div>
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                onClick={() => handleTickerSelect(query.toUpperCase())}
              >
                → Analyze {query.toUpperCase()}
              </button>
            </div>
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No results. Try a page name or ticker symbol.
            </div>
          )}
        </CommandEmpty>

        {/* Ticker quick-navigate when query looks like a ticker */}
        {looksLikeTicker && (
          <>
            <CommandGroup heading="Analyze Ticker">
              <CommandItem
                onSelect={() => handleTickerSelect(query.toUpperCase())}
                className="flex items-center gap-3"
              >
                <div className="flex items-center justify-center w-6 h-6 rounded bg-blue-100 text-blue-600">
                  <Target className="h-3.5 w-3.5" />
                </div>
                <div>
                  <div className="font-medium">Analyze {query.toUpperCase()}</div>
                  <div className="text-xs text-muted-foreground">Full 5-dimension analysis → best strategy</div>
                </div>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Quick tickers when no query */}
        {!q && (
          <>
            <CommandGroup heading="Quick Tickers">
              <div className="flex flex-wrap gap-1.5 px-2 py-1.5">
                {QUICK_TICKERS.map(ticker => (
                  <button
                    key={ticker}
                    className="px-2 py-0.5 text-xs font-mono font-semibold rounded border border-border hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                    onClick={() => handleTickerSelect(ticker)}
                  >
                    {ticker}
                  </button>
                ))}
              </div>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Navigation commands grouped by verb */}
        {groups.map(group => {
          const cmds = filteredCommands.filter(c => c.group === group);
          if (!cmds.length) return null;
          const GroupIcon = GROUP_ICONS[group];
          const color = GROUP_COLORS[group];
          return (
            <CommandGroup key={group} heading={group}>
              {cmds.map(cmd => {
                const CmdIcon = cmd.icon;
                return (
                  <CommandItem
                    key={cmd.path}
                    onSelect={() => handleSelect(cmd.path)}
                    className="flex items-center gap-3"
                  >
                    <div
                      className="flex items-center justify-center w-6 h-6 rounded shrink-0"
                      style={{ background: `${color}15`, color }}
                    >
                      <CmdIcon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{cmd.label}</div>
                    </div>
                    <div
                      className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
                      style={{ background: `${color}15`, color }}
                    >
                      {group}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}

// ─── Hook to wire ⌘K / Ctrl+K globally ───────────────────────────────────────

export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return { open, setOpen };
}
