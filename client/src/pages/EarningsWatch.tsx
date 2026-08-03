import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Calendar, AlertTriangle, Clock, List } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface EarningsEntry {
  ticker: string;
  date: string; // YYYY-MM-DD
  time: "BMO" | "AMC" | "TNS";
  confirmed: boolean;
  inPortfolio?: boolean;
}

// ── All earnings dates (Aug–Nov 2026) ─────────────────────────────────────────
const EARNINGS: EarningsEntry[] = [
  // ── Already reported (Jul 2026) ──
  { ticker: "TSLA",  date: "2026-07-22", time: "AMC", confirmed: true },
  { ticker: "GOOGL", date: "2026-07-22", time: "AMC", confirmed: true },
  { ticker: "MSFT",  date: "2026-07-29", time: "AMC", confirmed: true },
  { ticker: "META",  date: "2026-07-29", time: "AMC", confirmed: true },
  { ticker: "AAPL",  date: "2026-07-30", time: "AMC", confirmed: true },
  { ticker: "AMZN",  date: "2026-07-30", time: "AMC", confirmed: true },
  { ticker: "PYPL",  date: "2026-07-28", time: "AMC", confirmed: true },
  // ── Aug 3–8 ──
  { ticker: "PLTR",  date: "2026-08-03", time: "AMC", confirmed: true },
  { ticker: "AMGN",  date: "2026-08-04", time: "AMC", confirmed: true },
  { ticker: "UBER",  date: "2026-08-05", time: "AMC", confirmed: true },
  { ticker: "SQ",    date: "2026-08-05", time: "AMC", confirmed: true },
  { ticker: "LYFT",  date: "2026-08-06", time: "AMC", confirmed: true },
  // ── Aug 11–15 ──
  { ticker: "TEM",   date: "2026-08-11", time: "AMC", confirmed: false },
  // ── Aug 18–22 ──
  { ticker: "WMT",   date: "2026-08-20", time: "BMO", confirmed: true, inPortfolio: false },
  // ── Aug 25–29 ──
  { ticker: "NVDA",  date: "2026-08-26", time: "AMC", confirmed: true },
  // ── Sep 1–5 ──
  { ticker: "ZS",    date: "2026-09-01", time: "AMC", confirmed: false, inPortfolio: true },
  { ticker: "AVGO",  date: "2026-09-02", time: "AMC", confirmed: true, inPortfolio: true },
  { ticker: "CRM",   date: "2026-09-02", time: "AMC", confirmed: true },
  // ── Sep 8–12 ──
  { ticker: "ORCL",  date: "2026-09-09", time: "AMC", confirmed: false },
  { ticker: "ADBE",  date: "2026-09-10", time: "AMC", confirmed: true },
  // ── Sep 22–26 ──
  { ticker: "MU",    date: "2026-09-24", time: "AMC", confirmed: false, inPortfolio: true },
  { ticker: "COST",  date: "2026-09-25", time: "AMC", confirmed: false },
  // ── Oct ──
  { ticker: "JPM",   date: "2026-10-13", time: "BMO", confirmed: false },
  { ticker: "BAC",   date: "2026-10-14", time: "BMO", confirmed: false },
  { ticker: "GS",    date: "2026-10-14", time: "BMO", confirmed: false },
  { ticker: "WFC",   date: "2026-10-13", time: "BMO", confirmed: false },
  { ticker: "C",     date: "2026-10-13", time: "BMO", confirmed: false },
  { ticker: "JNJ",   date: "2026-10-14", time: "BMO", confirmed: false },
  { ticker: "UNH",   date: "2026-10-14", time: "BMO", confirmed: false },
  { ticker: "AXP",   date: "2026-10-17", time: "AMC", confirmed: false },
  { ticker: "NFLX",  date: "2026-10-20", time: "AMC", confirmed: false },
  { ticker: "INTC",  date: "2026-10-22", time: "AMC", confirmed: false },
  { ticker: "BA",    date: "2026-10-22", time: "BMO", confirmed: false },
  { ticker: "GE",    date: "2026-10-22", time: "BMO", confirmed: false },
  { ticker: "GILD",  date: "2026-10-22", time: "AMC", confirmed: false },
  { ticker: "BIIB",  date: "2026-10-22", time: "AMC", confirmed: false },
  { ticker: "V",     date: "2026-10-22", time: "AMC", confirmed: false },
  { ticker: "MS",    date: "2026-10-15", time: "BMO", confirmed: false },
  { ticker: "AMD",   date: "2026-10-28", time: "AMC", confirmed: false },
  { ticker: "CAT",   date: "2026-10-28", time: "BMO", confirmed: false },
  { ticker: "MA",    date: "2026-10-29", time: "AMC", confirmed: false },
  { ticker: "PFE",   date: "2026-10-29", time: "BMO", confirmed: false },
  { ticker: "WDC",   date: "2026-10-29", time: "AMC", confirmed: false, inPortfolio: true },
  { ticker: "XOM",   date: "2026-10-31", time: "BMO", confirmed: false },
  { ticker: "CVX",   date: "2026-10-31", time: "BMO", confirmed: false },
  { ticker: "MRNA",  date: "2026-10-31", time: "AMC", confirmed: false },
  // ── Nov ──
  { ticker: "OXY",   date: "2026-11-03", time: "AMC", confirmed: false },
  { ticker: "DE",    date: "2026-11-19", time: "BMO", confirmed: false },
  // SNDK — follows WDC fiscal calendar
  { ticker: "SNDK",  date: "2026-10-29", time: "AMC", confirmed: false, inPortfolio: true },
];

// ── Sector color map ───────────────────────────────────────────────────────────
const COLORS: Record<string, string> = {
  AAPL:"bg-blue-500", MSFT:"bg-blue-600", NVDA:"bg-green-600", AMZN:"bg-orange-500",
  GOOGL:"bg-blue-400", META:"bg-blue-700", TSLA:"bg-red-500", AVGO:"bg-purple-600",
  ORCL:"bg-red-600", AMD:"bg-red-400", INTC:"bg-blue-500", CRM:"bg-sky-500",
  ADBE:"bg-red-500", NFLX:"bg-red-600", PYPL:"bg-blue-500", UBER:"bg-gray-600",
  LYFT:"bg-pink-500", SQ:"bg-gray-700", PLTR:"bg-purple-600", ZS:"bg-blue-500",
  MU:"bg-blue-600", WDC:"bg-gray-600", SNDK:"bg-gray-500", TEM:"bg-green-600",
  JPM:"bg-blue-800", BAC:"bg-red-700", GS:"bg-blue-900", MS:"bg-blue-700",
  WFC:"bg-red-800", C:"bg-blue-600", V:"bg-blue-600", MA:"bg-orange-600", AXP:"bg-blue-500",
  JNJ:"bg-red-600", PFE:"bg-blue-500", MRNA:"bg-red-500", UNH:"bg-blue-700",
  AMGN:"bg-blue-600", GILD:"bg-orange-600", BIIB:"bg-purple-500",
  BA:"bg-blue-600", CAT:"bg-yellow-600", DE:"bg-green-700", GE:"bg-blue-500",
  XOM:"bg-red-700", CVX:"bg-blue-700", OXY:"bg-orange-700",
  WMT:"bg-blue-600", COST:"bg-blue-500",
};

function color(ticker: string) { return COLORS[ticker] || "bg-slate-500"; }

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0,0,0,0);
  const t = new Date(dateStr); t.setHours(0,0,0,0);
  return Math.round((t.getTime() - today.getTime()) / 86400000);
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export default function EarningsWatch() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [view, setView] = useState<"cal" | "list">("cal");
  const [selected, setSelected] = useState<string | null>(null);
  const [portfolioOnly, setPortfolioOnly] = useState(false);

  const filtered = useMemo(() =>
    portfolioOnly ? EARNINGS.filter(e => e.inPortfolio) : EARNINGS,
  [portfolioOnly]);

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
    filtered.filter(e => { const d = daysUntil(e.date); return d >= 0 && d <= 30; })
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

  // selected ticker detail
  const selectedEntry = selected
    ? filtered.filter(e => e.ticker === selected).find(e => daysUntil(e.date) >= 0)
    : null;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Calendar className="w-6 h-6 text-green-400" />
            Earnings Watch
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">All tickers — earnings dates, IV risk alerts</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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

      {/* Upcoming strip */}
      {upcoming.length > 0 && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3">
          <div className="text-xs text-slate-400 font-semibold mb-2 flex items-center gap-1 uppercase tracking-wide">
            <Clock className="w-3 h-3" /> Next 30 Days
          </div>
          <div className="flex flex-wrap gap-2">
            {upcoming.map(e => {
              const d = daysUntil(e.date);
              return (
                <button
                  key={`${e.ticker}-${e.date}`}
                  onClick={() => setSelected(selected===e.ticker ? null : e.ticker)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-all border
                    ${selected===e.ticker ? "ring-2 ring-green-400" : ""}
                    ${d===0 ? "bg-red-900/60 text-red-200 border-red-600" :
                      d<=2  ? "bg-red-900/40 text-red-300 border-red-700" :
                      d<=7  ? "bg-orange-900/40 text-orange-300 border-orange-700" :
                              "bg-slate-700 text-slate-200 border-slate-600"}`}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color(e.ticker)}`} />
                  {e.ticker}
                  <span className="text-slate-400 text-xs">{d===0?"today":`${d}d`}</span>
                  {!e.confirmed && <span className="text-slate-500">~</span>}
                  {e.inPortfolio && <span className="text-green-400">★</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected ticker alert */}
      {selectedEntry && (
        <div className={`rounded-lg border p-4 flex items-start justify-between gap-3
          ${daysUntil(selectedEntry.date)<=7 ? "border-orange-600 bg-orange-900/20" : "border-slate-600 bg-slate-800/50"}`}>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`w-3 h-3 rounded-full ${color(selectedEntry.ticker)}`} />
              <span className="text-white font-bold text-lg">{selectedEntry.ticker}</span>
              {selectedEntry.inPortfolio && <Badge className="bg-green-700 text-white text-xs">In Portfolio</Badge>}
              {daysUntil(selectedEntry.date)===0 && <Badge className="bg-red-600 text-white">TODAY</Badge>}
              {daysUntil(selectedEntry.date)===1 && <Badge className="bg-red-500 text-white">TOMORROW</Badge>}
              {daysUntil(selectedEntry.date)>1 && daysUntil(selectedEntry.date)<=7 && (
                <Badge className="bg-orange-600 text-white">This Week</Badge>
              )}
            </div>
            <p className="text-slate-300 text-sm">
              <strong>{selectedEntry.date}</strong> &nbsp;·&nbsp;
              {selectedEntry.time==="BMO" ? "Before Market Open" : selectedEntry.time==="AMC" ? "After Market Close" : "Time TBD"}
              &nbsp;·&nbsp;
              {daysUntil(selectedEntry.date)===0 ? "Earnings TODAY" :
               daysUntil(selectedEntry.date)===1 ? "Earnings TOMORROW" :
               `${daysUntil(selectedEntry.date)} days away`}
              {!selectedEntry.confirmed && " (estimated — verify before trading)"}
            </p>
            {daysUntil(selectedEntry.date) <= 14 && (
              <div className="mt-2 p-2 bg-yellow-900/30 border border-yellow-700/50 rounded text-xs text-yellow-300 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span><strong>Options alert:</strong> IV is likely elevated into earnings. Do NOT sell naked premium. Consider an earnings spread or close existing short premium positions before the event.</span>
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
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {DAYS_SHORT.map(d => (
                <div key={d} className="text-center text-xs text-slate-500 font-medium py-1">{d}</div>
              ))}
            </div>
            {/* Grid */}
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((day, idx) => {
                if (!day) return <div key={`e-${idx}`} className="min-h-[80px] md:min-h-[90px]" />;
                const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                const entries = byDate[dateStr] || [];
                const isToday = dateStr === todayStr;
                const isWeekend = idx%7===0 || idx%7===6;
                const hasPortfolio = entries.some(e=>e.inPortfolio);

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
                      {entries.slice(0,4).map(e=>(
                        <button
                          key={e.ticker}
                          onClick={()=>setSelected(selected===e.ticker?null:e.ticker)}
                          className={`w-full text-left px-1 py-0.5 rounded text-xs font-medium truncate transition-all
                            ${color(e.ticker)} text-white
                            ${!e.confirmed?"opacity-60":"opacity-90 hover:opacity-100"}
                            ${selected===e.ticker?"ring-1 ring-white":""}
                            ${e.inPortfolio?"ring-1 ring-green-400":""}`}
                          title={`${e.ticker} — ${e.time} ${!e.confirmed?"(estimated)":"(confirmed)"}`}
                        >
                          {e.ticker}{!e.confirmed&&<span className="opacity-70">~</span>}
                          {e.inPortfolio&&<span className="ml-0.5">★</span>}
                        </button>
                      ))}
                      {entries.length>4&&<div className="text-xs text-slate-500">+{entries.length-4}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-700 text-xs text-slate-400 flex-wrap">
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-600"/><span>Confirmed</span></div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-slate-500 opacity-60"/><span>~ Estimated</span></div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded border border-green-500 bg-green-900/20"/><span>Today</span></div>
              <div className="flex items-center gap-1"><span className="text-green-400">★</span><span>Your portfolio</span></div>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* List view */
        <div className="space-y-3">
          {["August 2026","September 2026","October 2026","November 2026"].map(label => {
            const [mName, mYear] = label.split(" ");
            const mIdx = MONTHS.indexOf(mName);
            const mYearNum = parseInt(mYear);
            const rows = filtered
              .filter(e => { const d=new Date(e.date); return d.getMonth()===mIdx && d.getFullYear()===mYearNum; })
              .sort((a,b)=>a.date.localeCompare(b.date));
            if (!rows.length) return null;
            return (
              <Card key={label} className="bg-slate-900 border-slate-700">
                <CardHeader className="py-2 px-4">
                  <CardTitle className="text-sm text-slate-300 font-semibold">{label}</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 space-y-1">
                  {rows.map(e => {
                    const d = daysUntil(e.date);
                    const dateObj = new Date(e.date);
                    const dayName = DAYS_SHORT[dateObj.getDay()];
                    return (
                      <button
                        key={`${e.ticker}-${e.date}`}
                        onClick={()=>setSelected(selected===e.ticker?null:e.ticker)}
                        className={`w-full flex items-center justify-between py-1.5 px-2 rounded text-left transition-colors
                          ${selected===e.ticker?"bg-slate-700":"hover:bg-slate-800/60"}
                          ${d>=0&&d<=7?"border border-orange-800/50 bg-orange-900/10":""}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color(e.ticker)}`}/>
                          <span className="text-white font-semibold text-sm w-14">{e.ticker}</span>
                          {e.inPortfolio && <span className="text-green-400 text-xs">★</span>}
                          <span className="text-slate-400 text-xs">{dayName}, {e.date.slice(5).replace("-","/")}</span>
                          <span className={`text-xs px-1 rounded ${
                            e.time==="BMO"?"bg-blue-900/50 text-blue-300":
                            e.time==="AMC"?"bg-purple-900/50 text-purple-300":
                            "bg-slate-700 text-slate-400"}`}>{e.time}</span>
                          {!e.confirmed&&<span className="text-xs text-slate-500 flex items-center gap-0.5"><AlertTriangle className="w-3 h-3"/>est</span>}
                        </div>
                        <div className="flex items-center gap-1">
                          {d===0&&<Badge className="bg-red-600 text-white text-xs">TODAY</Badge>}
                          {d===1&&<Badge className="bg-red-500 text-white text-xs">TOMORROW</Badge>}
                          {d>1&&d<=7&&<Badge className="bg-orange-500 text-white text-xs">{d}d</Badge>}
                          {d>7&&d<=14&&<Badge className="bg-yellow-600 text-white text-xs">{d}d</Badge>}
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
    </div>
  );
}
