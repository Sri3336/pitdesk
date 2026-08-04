import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Calendar, AlertTriangle, Clock, List, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────────
interface EarningsEntry {
  ticker: string;
  date: string;
  daysAway: number;
  confirmed: boolean;
  inPortfolio: boolean;
  isEtf: boolean;
}

// ── Sector color map ───────────────────────────────────────────────────────────
const COLORS: Record<string, string> = {
  AAPL:"bg-blue-500", MSFT:"bg-blue-600", NVDA:"bg-green-600", AMZN:"bg-orange-500",
  GOOGL:"bg-blue-400", META:"bg-blue-700", TSLA:"bg-red-500", AVGO:"bg-purple-600",
  ORCL:"bg-red-600", AMD:"bg-red-400", INTC:"bg-blue-500", CRM:"bg-sky-500",
  ADBE:"bg-red-500", NFLX:"bg-red-600", PYPL:"bg-blue-500", UBER:"bg-gray-600",
  LYFT:"bg-pink-500", SQ:"bg-gray-700", PLTR:"bg-purple-600", ZS:"bg-blue-500",
  MU:"bg-blue-600", WDC:"bg-gray-600", SNDK:"bg-gray-500",
  JPM:"bg-blue-800", BAC:"bg-red-700", GS:"bg-blue-900", MS:"bg-blue-700",
  WFC:"bg-red-800", C:"bg-blue-600", V:"bg-blue-600", MA:"bg-orange-600", AXP:"bg-blue-500",
  JNJ:"bg-red-600", PFE:"bg-blue-500", MRNA:"bg-red-500", UNH:"bg-blue-700",
  AMGN:"bg-blue-600", GILD:"bg-orange-600", BIIB:"bg-purple-500",
  BA:"bg-blue-600", CAT:"bg-yellow-600", DE:"bg-green-700", GE:"bg-blue-500",
  XOM:"bg-red-700", CVX:"bg-blue-700", OXY:"bg-orange-700",
  WMT:"bg-blue-600", COST:"bg-blue-500",
};

function tickerColor(ticker: string) { return COLORS[ticker] || "bg-slate-500"; }

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export default function EarningsWatch() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [view, setView] = useState<"cal" | "list">("cal");
  const [selected, setSelected] = useState<string | null>(null);
  const [portfolioOnly, setPortfolioOnly] = useState(false);

  const { data, isLoading, error } = trpc.earningsWatch.getAll.useQuery(undefined, {
    staleTime: 30 * 60 * 1000, // 30 min client-side stale
    refetchOnWindowFocus: false,
  });

  const refreshMutation = trpc.earningsWatch.refresh.useMutation({
    onSuccess: () => {
      toast.success("Earnings dates refreshed from Yahoo Finance");
      utils.earningsWatch.getAll.invalidate();
    },
    onError: () => toast.error("Refresh failed — try again"),
  });
  const utils = trpc.useUtils();

  const entries: EarningsEntry[] = data?.entries ?? [];

  const filtered = useMemo(() =>
    portfolioOnly ? entries.filter(e => e.inPortfolio) : entries,
  [entries, portfolioOnly]);

  // date → entries
  const byDate = useMemo(() => {
    const m: Record<string, EarningsEntry[]> = {};
    for (const e of filtered) {
      if (!m[e.date]) m[e.date] = [];
      m[e.date].push(e);
    }
    return m;
  }, [filtered]);

  // upcoming 30 days
  const upcoming = useMemo(() =>
    filtered.filter(e => e.daysAway >= 0 && e.daysAway <= 30)
      .sort((a,b) => a.date.localeCompare(b.date)),
  [filtered]);

  const prevMonth = () => { if (month===0){setYear(y=>y-1);setMonth(11);}else setMonth(m=>m-1); };
  const nextMonth = () => { if (month===11){setYear(y=>y+1);setMonth(0);}else setMonth(m=>m+1); };

  const daysInMonth = new Date(year, month+1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const todayStr = today.toISOString().split("T")[0];

  const cells: (number|null)[] = [];
  for (let i=0;i<firstDay;i++) cells.push(null);
  for (let d=1;d<=daysInMonth;d++) cells.push(d);

  const selectedEntry = selected
    ? filtered.find(e => e.ticker === selected)
    : null;

  // Unique months with data for list view
  const monthsWithData = useMemo(() => {
    const seen = new Set<string>();
    for (const e of filtered) {
      const d = new Date(e.date);
      seen.add(`${d.getFullYear()}-${d.getMonth()}`);
    }
    return Array.from(seen).sort().map(k => {
      const [y, m] = k.split("-").map(Number);
      return { year: y, month: m, label: `${MONTHS[m]} ${y}` };
    });
  }, [filtered]);

  if (error) {
    return (
      <div className="p-6 text-center text-red-400">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
        <p>Failed to load earnings data. Check your connection and try again.</p>
        <Button className="mt-3" onClick={() => refreshMutation.mutate()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Calendar className="w-6 h-6 text-green-400" />
            Earnings Watch
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Live earnings dates from Yahoo Finance
            {data?.fetchedAt && (
              <span className="ml-2 text-slate-500">
                · Updated {new Date(data.fetchedAt).toLocaleTimeString()}
                {data.cached && " (cached)"}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            variant={portfolioOnly ? "default" : "outline"}
            onClick={() => setPortfolioOnly(p => !p)}
            className={portfolioOnly ? "bg-green-600 hover:bg-green-700" : ""}
          >
            Portfolio Only
          </Button>
          <Button size="sm" variant={view==="cal"?"default":"outline"} onClick={()=>setView("cal")}>
            <Calendar className="w-3.5 h-3.5 mr-1" /> Calendar
          </Button>
          <Button size="sm" variant={view==="list"?"default":"outline"} onClick={()=>setView("list")}>
            <List className="w-3.5 h-3.5 mr-1" /> List
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full bg-slate-800" />
          <Skeleton className="h-64 w-full bg-slate-800" />
        </div>
      )}

      {!isLoading && (
        <>
          {/* Upcoming strip */}
          {upcoming.length > 0 && (
            <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3">
              <div className="text-xs text-slate-400 font-semibold mb-2 flex items-center gap-1 uppercase tracking-wide">
                <Clock className="w-3 h-3" /> Next 30 Days ({upcoming.length} earnings)
              </div>
              <div className="flex flex-wrap gap-2">
                {upcoming.map(e => (
                  <button
                    key={e.ticker}
                    onClick={() => setSelected(selected===e.ticker ? null : e.ticker)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-all border
                      ${selected===e.ticker ? "ring-2 ring-green-400" : ""}
                      ${e.daysAway===0 ? "bg-red-900/60 text-red-200 border-red-600" :
                        e.daysAway<=2  ? "bg-red-900/40 text-red-300 border-red-700" :
                        e.daysAway<=7  ? "bg-orange-900/40 text-orange-300 border-orange-700" :
                                        "bg-slate-700 text-slate-200 border-slate-600"}`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${tickerColor(e.ticker)}`} />
                    {e.ticker}
                    <span className="text-slate-400 text-xs">{e.daysAway===0?"today":`${e.daysAway}d`}</span>
                    {!e.confirmed && <span className="text-slate-500">~</span>}
                    {e.inPortfolio && <span className="text-green-400">★</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* No data state */}
          {entries.length === 0 && !isLoading && (
            <div className="text-center py-12 text-slate-400">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No upcoming earnings dates found.</p>
              <p className="text-sm mt-1">Yahoo Finance may not have scheduled dates yet for the next quarter.</p>
              <Button className="mt-3" size="sm" onClick={() => refreshMutation.mutate()}>
                Try Refresh
              </Button>
            </div>
          )}

          {/* Selected ticker detail */}
          {selectedEntry && (
            <div className={`rounded-lg border p-4 flex items-start justify-between gap-3
              ${selectedEntry.daysAway<=7 ? "border-orange-600 bg-orange-900/20" : "border-slate-600 bg-slate-800/50"}`}>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`w-3 h-3 rounded-full ${tickerColor(selectedEntry.ticker)}`} />
                  <span className="text-white font-bold text-lg">{selectedEntry.ticker}</span>
                  {selectedEntry.inPortfolio && <Badge className="bg-green-700 text-white text-xs">In Portfolio</Badge>}
                  {selectedEntry.confirmed && <Badge className="bg-blue-700 text-white text-xs">Confirmed</Badge>}
                  {!selectedEntry.confirmed && <Badge className="bg-slate-600 text-white text-xs">Estimated</Badge>}
                  {selectedEntry.daysAway===0 && <Badge className="bg-red-600 text-white">TODAY</Badge>}
                  {selectedEntry.daysAway===1 && <Badge className="bg-red-500 text-white">TOMORROW</Badge>}
                  {selectedEntry.daysAway>1 && selectedEntry.daysAway<=7 && (
                    <Badge className="bg-orange-600 text-white">This Week</Badge>
                  )}
                </div>
                <p className="text-slate-300 text-sm">
                  <strong>{selectedEntry.date}</strong> &nbsp;·&nbsp;
                  {selectedEntry.daysAway===0 ? "Earnings TODAY" :
                   selectedEntry.daysAway===1 ? "Earnings TOMORROW" :
                   `${selectedEntry.daysAway} days away`}
                  {!selectedEntry.confirmed && " (estimated — verify on Yahoo Finance before trading)"}
                </p>
                {selectedEntry.daysAway <= 14 && (
                  <div className="mt-2 p-2 bg-yellow-900/30 border border-yellow-700/50 rounded text-xs text-yellow-300 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span><strong>Options alert:</strong> IV is likely elevated into earnings. Do NOT sell naked premium. Consider closing existing short premium positions before the event.</span>
                  </div>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={()=>setSelected(null)} className="text-slate-400 flex-shrink-0">✕</Button>
            </div>
          )}

          {view==="cal" ? (
            <Card className="bg-slate-900 border-slate-700">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={prevMonth}><ChevronLeft className="w-4 h-4"/></Button>
                  <CardTitle className="text-white text-lg">{MONTHS[month]} {year}</CardTitle>
                  <Button variant="ghost" size="sm" onClick={nextMonth}><ChevronRight className="w-4 h-4"/></Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 mb-1">
                  {DAYS_SHORT.map(d => (
                    <div key={d} className="text-center text-xs text-slate-500 font-medium py-1">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {cells.map((day, idx) => {
                    if (!day) return <div key={`e-${idx}`} className="min-h-[80px] md:min-h-[90px]" />;
                    const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                    const dayEntries = byDate[dateStr] || [];
                    const isToday = dateStr === todayStr;
                    const isWeekend = idx%7===0 || idx%7===6;
                    const hasPortfolio = dayEntries.some(e=>e.inPortfolio);

                    return (
                      <div
                        key={dateStr}
                        className={`min-h-[80px] md:min-h-[90px] p-1 rounded border transition-colors
                          ${isToday ? "border-green-500 bg-green-900/20" : "border-slate-800 hover:border-slate-600"}
                          ${isWeekend ? "bg-slate-900/40" : "bg-slate-800/20"}
                          ${hasPortfolio ? "ring-1 ring-green-600/40" : ""}`}
                      >
                        <div className={`text-xs font-medium mb-1 ${isToday?"text-green-400":"text-slate-400"}`}>{day}</div>
                        <div className="space-y-0.5">
                          {dayEntries.slice(0,4).map(e=>(
                            <button
                              key={e.ticker}
                              onClick={()=>setSelected(selected===e.ticker?null:e.ticker)}
                              className={`w-full text-left px-1 py-0.5 rounded text-xs font-medium truncate transition-all
                                ${tickerColor(e.ticker)} text-white
                                ${!e.confirmed?"opacity-60":"opacity-90 hover:opacity-100"}
                                ${selected===e.ticker?"ring-1 ring-white":""}
                                ${e.inPortfolio?"ring-1 ring-green-400":""}`}
                              title={`${e.ticker} — ${!e.confirmed?"estimated":"confirmed"}`}
                            >
                              {e.ticker}{!e.confirmed&&<span className="opacity-70">~</span>}
                              {e.inPortfolio&&<span className="ml-0.5">★</span>}
                            </button>
                          ))}
                          {dayEntries.length>4&&<div className="text-xs text-slate-500">+{dayEntries.length-4}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-700 text-xs text-slate-400 flex-wrap">
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-600"/><span>Confirmed</span></div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-slate-500 opacity-60"/><span>~ Estimated</span></div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded border border-green-500 bg-green-900/20"/><span>Today</span></div>
                  <div className="flex items-center gap-1"><span className="text-green-400">★</span><span>Your portfolio</span></div>
                  <div className="ml-auto text-slate-500">Source: Yahoo Finance · {entries.length} tickers tracked</div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {monthsWithData.map(({ year: my, month: mm, label }) => {
                const rows = filtered
                  .filter(e => { const d=new Date(e.date); return d.getMonth()===mm && d.getFullYear()===my; })
                  .sort((a,b)=>a.date.localeCompare(b.date));
                if (!rows.length) return null;
                return (
                  <Card key={label} className="bg-slate-900 border-slate-700">
                    <CardHeader className="py-2 px-4">
                      <CardTitle className="text-sm text-slate-300 font-semibold">{label}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3 space-y-1">
                      {rows.map(e => {
                        const dateObj = new Date(e.date);
                        const dayName = DAYS_SHORT[dateObj.getDay()];
                        return (
                          <button
                            key={e.ticker}
                            onClick={()=>setSelected(selected===e.ticker?null:e.ticker)}
                            className={`w-full flex items-center justify-between py-1.5 px-2 rounded text-left transition-colors
                              ${selected===e.ticker?"bg-slate-700":"hover:bg-slate-800/60"}
                              ${e.daysAway>=0&&e.daysAway<=7?"border border-orange-800/50 bg-orange-900/10":""}`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${tickerColor(e.ticker)}`}/>
                              <span className="text-white font-semibold text-sm w-14">{e.ticker}</span>
                              {e.inPortfolio && <span className="text-green-400 text-xs">★</span>}
                              <span className="text-slate-400 text-xs">{dayName}, {e.date.slice(5).replace("-","/")}</span>
                              {!e.confirmed&&<span className="text-xs text-slate-500 flex items-center gap-0.5"><AlertTriangle className="w-3 h-3"/>est</span>}
                            </div>
                            <div className="flex items-center gap-1">
                              {e.daysAway===0&&<Badge className="bg-red-600 text-white text-xs">TODAY</Badge>}
                              {e.daysAway===1&&<Badge className="bg-red-500 text-white text-xs">TOMORROW</Badge>}
                              {e.daysAway>1&&e.daysAway<=7&&<Badge className="bg-orange-500 text-white text-xs">{e.daysAway}d</Badge>}
                              {e.daysAway>7&&e.daysAway<=14&&<Badge className="bg-yellow-600 text-white text-xs">{e.daysAway}d</Badge>}
                            </div>
                          </button>
                        );
                      })}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
