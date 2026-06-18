import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type Time,
} from "lightweight-charts";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { toast } from "sonner";

// ─── EMA helper ──────────────────────────────────────────────────────────────
function calcEma(closes: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  let prev = closes[0];
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) { ema.push(closes[0]); prev = closes[0]; continue; }
    const val = closes[i] * k + prev * (1 - k);
    ema.push(val);
    prev = val;
  }
  return ema;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const INTERVALS = ["1m","5m","15m","30m","1h","1d","1wk","1mo"] as const;
const RANGES    = ["1d","5d","1mo","3mo","6mo","1y","2y","5y"] as const;
type Interval = typeof INTERVALS[number];
type Range    = typeof RANGES[number];

const INTERVAL_LABELS: Record<Interval, string> = {
  "1m":"1m","5m":"5m","15m":"15m","30m":"30m","1h":"1H","1d":"1D","1wk":"1W","1mo":"1M"
};
const RANGE_LABELS: Record<Range, string> = {
  "1d":"1D","5d":"5D","1mo":"1M","3mo":"3M","6mo":"6M","1y":"1Y","2y":"2Y","5y":"5Y"
};

// Compatible interval/range combos
const RANGE_FOR_INTERVAL: Record<Interval, Range[]> = {
  "1m":  ["1d","5d"],
  "5m":  ["1d","5d","1mo"],
  "15m": ["5d","1mo","3mo"],
  "30m": ["1mo","3mo","6mo"],
  "1h":  ["1mo","3mo","6mo","1y"],
  "1d":  ["1mo","3mo","6mo","1y","2y","5y"],
  "1wk": ["1y","2y","5y"],
  "1mo": ["2y","5y"],
};

const EMA_COLORS: Record<number, string> = {
  9:   "#f59e0b",
  20:  "#3b82f6",
  50:  "#a855f7",
  200: "#ef4444",
};

const POPULAR_TICKERS = ["SPY","QQQ","AAPL","TSLA","NVDA","MSFT","AMZN","META","GOOGL","AMD"];

export default function CandlestickChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const emaSeriesRefs = useRef<Map<number, ISeriesApi<"Line">>>(new Map());

  const [ticker, setTicker] = useState("SPY");
  const [inputVal, setInputVal] = useState("SPY");
  const [interval, setInterval] = useState<Interval>("1d");
  const [range, setRange] = useState<Range>("3mo");
  const [showEmas, setShowEmas] = useState<Set<number>>(new Set([9, 20, 50, 200]));
  const [ohlcInfo, setOhlcInfo] = useState<{ o: number; h: number; l: number; c: number; v: number } | null>(null);

  const { data, isLoading, error, refetch } = trpc.chart.candles.useQuery(
    { ticker, interval, range },
    { staleTime: 60_000, retry: 1 }
  );

  // ─── Build / update chart ─────────────────────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#374151",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#f3f4f6" },
        horzLines: { color: "#f3f4f6" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#e5e7eb" },
      timeScale: { borderColor: "#e5e7eb", timeVisible: true, secondsVisible: false },
      width: chartContainerRef.current.clientWidth,
      height: 420,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#16a34a",
      borderDownColor: "#dc2626",
      wickUpColor: "#16a34a",
      wickDownColor: "#dc2626",
      priceScaleId: "right",
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "#d1fae5",
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    // Crosshair subscription for OHLCV tooltip
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) { setOhlcInfo(null); return; }
      const cd = param.seriesData.get(candleSeries) as CandlestickData | undefined;
      const vd = param.seriesData.get(volumeSeries) as HistogramData | undefined;
      if (cd) {
        setOhlcInfo({ o: cd.open, h: cd.high, l: cd.low, c: cd.close, v: (vd as any)?.value ?? 0 });
      }
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const ro = new ResizeObserver(() => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    });
    ro.observe(chartContainerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      emaSeriesRefs.current.clear();
    };
  }, []);

  // ─── Feed data into chart ─────────────────────────────────────────────────
  useEffect(() => {
    if (!data || !candleSeriesRef.current || !volumeSeriesRef.current || !chartRef.current) return;

    const candleData: CandlestickData[] = data.candles.map((c) => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumeData: HistogramData[] = data.candles.map((c) => ({
      time: c.time as Time,
      value: c.volume ?? 0,
      color: c.close >= c.open ? "#bbf7d0" : "#fecaca",
    }));

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);

    // Remove old EMA series
    emaSeriesRefs.current.forEach((s) => chartRef.current?.removeSeries(s));
    emaSeriesRefs.current.clear();

    // Add EMA overlays
    const closes = data.candles.map((c) => c.close);
    [9, 20, 50, 200].forEach((period) => {
      if (!showEmas.has(period) || closes.length < period) return;
      const emaVals = calcEma(closes, period);
      const lineData: LineData[] = data.candles.map((c, i) => ({
        time: c.time as Time,
        value: emaVals[i],
      }));
      const s = chartRef.current!.addSeries(LineSeries, {
        color: EMA_COLORS[period],
        lineWidth: 1,
        priceScaleId: "right",
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        title: `EMA${period}`,
      });
      s.setData(lineData);
      emaSeriesRefs.current.set(period, s);
    });

    chartRef.current.timeScale().fitContent();
  }, [data, showEmas]);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleSearch = useCallback(() => {
    const t = inputVal.trim().toUpperCase();
    if (!t) return;
    setTicker(t);
  }, [inputVal]);

  const handleIntervalChange = (iv: Interval) => {
    setInterval(iv);
    const allowed = RANGE_FOR_INTERVAL[iv];
    if (!allowed.includes(range)) setRange(allowed[Math.floor(allowed.length / 2)]);
  };

  const toggleEma = (period: number) => {
    setShowEmas((prev) => {
      const next = new Set(prev);
      next.has(period) ? next.delete(period) : next.add(period);
      return next;
    });
  };

  // ─── Derived stats ────────────────────────────────────────────────────────
  const lastCandle = data?.candles[data.candles.length - 1];
  const prevClose = data?.previousClose;
  const change = lastCandle && prevClose ? lastCandle.close - prevClose : null;
  const changePct = change && prevClose ? (change / prevClose) * 100 : null;
  const isUp = (change ?? 0) >= 0;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Candlestick Chart</h1>
          <p className="text-sm text-muted-foreground">OHLCV with EMA overlays</p>
        </div>
        <div className="sm:ml-auto flex items-center gap-2">
          <div className="flex gap-1">
            {POPULAR_TICKERS.slice(0, 5).map((t) => (
              <button
                key={t}
                onClick={() => { setInputVal(t); setTicker(t); }}
                className={`text-xs px-2 py-1 rounded border transition-colors ${
                  ticker === t
                    ? "bg-green-600 text-white border-green-600"
                    : "border-border hover:border-green-400 hover:text-green-700"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Ticker search + controls ── */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Ticker input */}
        <div className="flex gap-1">
          <Input
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="AAPL"
            className="w-24 h-8 text-sm font-mono uppercase"
            maxLength={8}
          />
          <Button size="sm" onClick={handleSearch} className="h-8 px-2 bg-green-600 hover:bg-green-700">
            <Search className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Interval selector */}
        <div className="flex gap-0.5 bg-muted rounded-md p-0.5">
          {INTERVALS.map((iv) => (
            <button
              key={iv}
              onClick={() => handleIntervalChange(iv)}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                interval === iv
                  ? "bg-white text-foreground shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {INTERVAL_LABELS[iv]}
            </button>
          ))}
        </div>

        {/* Range selector */}
        <div className="flex gap-0.5 bg-muted rounded-md p-0.5">
          {RANGE_FOR_INTERVAL[interval].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                range === r
                  ? "bg-white text-foreground shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>

        {/* Refresh */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          className="h-8 px-2"
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* ── Price header ── */}
      {data && (
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-2xl font-bold font-mono">
            {data.currency === "USD" ? "$" : ""}{lastCandle?.close.toFixed(2)}
          </span>
          {change !== null && changePct !== null && (
            <span className={`flex items-center gap-1 text-sm font-medium ${isUp ? "text-green-600" : "text-red-500"}`}>
              {isUp ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {isUp ? "+" : ""}{change.toFixed(2)} ({isUp ? "+" : ""}{changePct.toFixed(2)}%)
            </span>
          )}
          <span className="text-sm text-muted-foreground">{data.ticker} · {data.exchangeName}</span>
          {/* Crosshair OHLCV */}
          {ohlcInfo && (
            <span className="text-xs text-muted-foreground font-mono ml-auto">
              O:{ohlcInfo.o.toFixed(2)} H:{ohlcInfo.h.toFixed(2)} L:{ohlcInfo.l.toFixed(2)} C:{ohlcInfo.c.toFixed(2)}
              {ohlcInfo.v > 0 && ` V:${(ohlcInfo.v / 1_000_000).toFixed(1)}M`}
            </span>
          )}
        </div>
      )}

      {/* ── Chart ── */}
      <div className="relative rounded-xl border border-border overflow-hidden bg-white">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">Loading {ticker}…</span>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
            <div className="text-center text-sm text-red-500">
              <div className="text-2xl mb-2">⚠️</div>
              <div>{error.message || `No data for ${ticker}`}</div>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          </div>
        )}
        <div ref={chartContainerRef} className="w-full" style={{ minHeight: 420 }} />
      </div>

      {/* ── EMA toggles ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground font-medium">EMA:</span>
        {[9, 20, 50, 200].map((period) => (
          <button
            key={period}
            onClick={() => toggleEma(period)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all ${
              showEmas.has(period)
                ? "border-transparent text-white"
                : "border-border text-muted-foreground opacity-50"
            }`}
            style={showEmas.has(period) ? { backgroundColor: EMA_COLORS[period] } : {}}
          >
            <span
              className="w-3 h-0.5 rounded-full"
              style={{ backgroundColor: EMA_COLORS[period] }}
            />
            EMA {period}
          </button>
        ))}
        {data && (
          <span className="ml-auto text-xs text-muted-foreground">
            {data.candles.length} candles
          </span>
        )}
      </div>

      {/* ── More popular tickers ── */}
      <div className="flex flex-wrap gap-1">
        {POPULAR_TICKERS.slice(5).map((t) => (
          <button
            key={t}
            onClick={() => { setInputVal(t); setTicker(t); }}
            className={`text-xs px-2 py-1 rounded border transition-colors ${
              ticker === t
                ? "bg-green-600 text-white border-green-600"
                : "border-border hover:border-green-400 hover:text-green-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
