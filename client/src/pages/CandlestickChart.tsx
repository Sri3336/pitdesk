import { useEffect, useRef, useState, useCallback, useMemo } from "react";
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
import { Search, TrendingUp, TrendingDown, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { useSearchParams } from "wouter";

// ─── Indicator helpers ────────────────────────────────────────────────────────

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

function calcRsi(closes: number[], period = 14): number[] {
  const rsi: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return rsi;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

interface MacdResult {
  macd: number[];
  signal: number[];
  histogram: number[];
}

function calcMacd(closes: number[], fast = 12, slow = 26, signal = 9): MacdResult {
  const emaFast = calcEma(closes, fast);
  const emaSlow = calcEma(closes, slow);
  const macd = closes.map((_, i) => emaFast[i] - emaSlow[i]);
  const signalLine = calcEma(macd, signal);
  const histogram = macd.map((m, i) => m - signalLine[i]);
  return { macd, signal: signalLine, histogram };
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

// ─── RSI Chart Component ──────────────────────────────────────────────────────

interface IndicatorChartProps {
  times: Time[];
  values: number[];
  label: string;
  color: string;
  refLine1?: number;
  refLine2?: number;
  refLineColor?: string;
  height?: number;
  minVal?: number;
  maxVal?: number;
}

function IndicatorChart({ times, values, label, color, refLine1, refLine2, refLineColor = "#94a3b8", height = 120, minVal, maxVal }: IndicatorChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || times.length === 0) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#374151",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 10,
      },
      grid: { vertLines: { color: "#f3f4f6" }, horzLines: { color: "#f3f4f6" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#e5e7eb", scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: "#e5e7eb", timeVisible: true, secondsVisible: false },
      width: containerRef.current.clientWidth,
      height,
    });

    const lineSeries = chart.addSeries(LineSeries, {
      color,
      lineWidth: 2,
      lastValueVisible: true,
      priceLineVisible: false,
      title: label,
    });

    const lineData: LineData[] = times
      .map((t, i) => ({ time: t, value: values[i] }))
      .filter((d) => !isNaN(d.value));
    lineSeries.setData(lineData);

    // Reference lines (overbought / oversold)
    if (refLine1 !== undefined) {
      const refSeries1 = chart.addSeries(LineSeries, {
        color: refLineColor,
        lineWidth: 1,
        lineStyle: 2, // dashed
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
      refSeries1.setData(times.map((t) => ({ time: t, value: refLine1 })));
    }
    if (refLine2 !== undefined) {
      const refSeries2 = chart.addSeries(LineSeries, {
        color: refLineColor,
        lineWidth: 1,
        lineStyle: 2,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
      refSeries2.setData(times.map((t) => ({ time: t, value: refLine2 })));
    }

    if (minVal !== undefined && maxVal !== undefined) {
      lineSeries.priceScale().applyOptions({ autoScale: false });
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; };
  }, [times, values, color, label, refLine1, refLine2, refLineColor, height, minVal, maxVal]);

  return <div ref={containerRef} className="w-full" style={{ minHeight: height }} />;
}

// ─── MACD Chart Component ─────────────────────────────────────────────────────

function MacdChart({ times, macd, signal, histogram, height = 120 }: {
  times: Time[];
  macd: number[];
  signal: number[];
  histogram: number[];
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || times.length === 0) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#374151",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 10,
      },
      grid: { vertLines: { color: "#f3f4f6" }, horzLines: { color: "#f3f4f6" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#e5e7eb", scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: "#e5e7eb", timeVisible: true, secondsVisible: false },
      width: containerRef.current.clientWidth,
      height,
    });

    // Histogram
    const histSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: "right",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    const histData: HistogramData[] = times
      .map((t, i) => ({ time: t, value: histogram[i], color: histogram[i] >= 0 ? "#86efac" : "#fca5a5" }))
      .filter((d) => !isNaN(d.value));
    histSeries.setData(histData);

    // MACD line
    const macdSeries = chart.addSeries(LineSeries, {
      color: "#3b82f6",
      lineWidth: 2,
      lastValueVisible: true,
      priceLineVisible: false,
      title: "MACD",
    });
    macdSeries.setData(times.map((t, i) => ({ time: t, value: macd[i] })).filter((d) => !isNaN(d.value)));

    // Signal line
    const signalSeries = chart.addSeries(LineSeries, {
      color: "#f97316",
      lineWidth: 1,
      lastValueVisible: true,
      priceLineVisible: false,
      title: "Signal",
    });
    signalSeries.setData(times.map((t, i) => ({ time: t, value: signal[i] })).filter((d) => !isNaN(d.value)));

    // Zero line
    const zeroSeries = chart.addSeries(LineSeries, {
      color: "#94a3b8",
      lineWidth: 1,
      lineStyle: 2,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    zeroSeries.setData(times.map((t) => ({ time: t, value: 0 })));

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => { ro.disconnect(); chart.remove(); };
  }, [times, macd, signal, histogram, height]);

  return <div ref={containerRef} className="w-full" style={{ minHeight: height }} />;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CandlestickChart() {
  const [searchParams] = useSearchParams();
  const initialTicker = searchParams.get("ticker")?.toUpperCase() || "SPY";

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const emaSeriesRefs = useRef<Map<number, ISeriesApi<"Line">>>(new Map());

  const [ticker, setTicker] = useState(initialTicker);
  const [inputVal, setInputVal] = useState(initialTicker);
  const [interval, setInterval] = useState<Interval>("1d");
  const [range, setRange] = useState<Range>("3mo");
  const [showEmas, setShowEmas] = useState<Set<number>>(new Set([9, 20, 50, 200]));
  const [showRsi, setShowRsi] = useState(true);
  const [showMacd, setShowMacd] = useState(true);
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

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) { setOhlcInfo(null); return; }
      const cd = param.seriesData.get(candleSeries) as CandlestickData | undefined;
      const vd = param.seriesData.get(volumeSeries) as HistogramData | undefined;
      if (cd) {
        setOhlcInfo({ o: cd.open, h: cd.high, l: cd.low, c: cd.close, v: (vd as { value?: number })?.value ?? 0 });
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

    emaSeriesRefs.current.forEach((s) => chartRef.current?.removeSeries(s));
    emaSeriesRefs.current.clear();

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

  // ─── Compute RSI + MACD from candle data ──────────────────────────────────
  const indicatorData = useMemo(() => {
    if (!data?.candles || data.candles.length < 30) return null;
    const closes = data.candles.map((c) => c.close);
    const times = data.candles.map((c) => c.time as Time);
    const rsi = calcRsi(closes, 14);
    const { macd, signal, histogram } = calcMacd(closes);
    return { times, rsi, macd, signal, histogram };
  }, [data]);

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

  // Latest RSI value for display
  const latestRsi = indicatorData ? indicatorData.rsi.filter((v) => !isNaN(v)).at(-1) : null;
  const latestMacd = indicatorData ? indicatorData.macd.at(-1) : null;
  const latestSignal = indicatorData ? indicatorData.signal.at(-1) : null;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Candlestick Chart</h1>
          <p className="text-sm text-muted-foreground">OHLCV · EMA overlays · RSI · MACD</p>
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

        <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-8 px-2" title="Refresh">
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
          {/* RSI + MACD quick stats */}
          {latestRsi !== null && latestRsi !== undefined && (
            <span className={`text-xs font-mono px-2 py-0.5 rounded-full border ${
              latestRsi > 70 ? "bg-red-50 text-red-700 border-red-200"
              : latestRsi < 30 ? "bg-green-50 text-green-700 border-green-200"
              : "bg-gray-50 text-gray-600 border-gray-200"
            }`}>
              RSI {latestRsi.toFixed(1)}
              {latestRsi > 70 ? " ⚠ OB" : latestRsi < 30 ? " ⚠ OS" : ""}
            </span>
          )}
          {latestMacd !== null && latestMacd !== undefined && latestSignal !== null && latestSignal !== undefined && (
            <span className={`text-xs font-mono px-2 py-0.5 rounded-full border ${
              latestMacd > latestSignal ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
            }`}>
              MACD {latestMacd > latestSignal ? "▲" : "▼"} {latestMacd.toFixed(2)}
            </span>
          )}
          {ohlcInfo && (
            <span className="text-xs text-muted-foreground font-mono ml-auto">
              O:{ohlcInfo.o.toFixed(2)} H:{ohlcInfo.h.toFixed(2)} L:{ohlcInfo.l.toFixed(2)} C:{ohlcInfo.c.toFixed(2)}
              {ohlcInfo.v > 0 && ` V:${(ohlcInfo.v / 1_000_000).toFixed(1)}M`}
            </span>
          )}
        </div>
      )}

      {/* ── Main Chart ── */}
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

      {/* ── EMA toggles + Indicator toggles ── */}
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
            <span className="w-3 h-0.5 rounded-full" style={{ backgroundColor: EMA_COLORS[period] }} />
            EMA {period}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground font-medium">Indicators:</span>
          <button
            onClick={() => setShowRsi((v) => !v)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
              showRsi ? "bg-violet-600 text-white border-violet-600" : "border-border text-muted-foreground opacity-50"
            }`}
          >
            RSI
          </button>
          <button
            onClick={() => setShowMacd((v) => !v)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
              showMacd ? "bg-blue-600 text-white border-blue-600" : "border-border text-muted-foreground opacity-50"
            }`}
          >
            MACD
          </button>
          {data && (
            <span className="text-xs text-muted-foreground ml-2">
              {data.candles.length} candles
            </span>
          )}
        </div>
      </div>

      {/* ── RSI Panel ── */}
      {showRsi && indicatorData && (
        <div className="rounded-xl border border-border overflow-hidden bg-white">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-gray-50">
            <span className="text-xs font-semibold text-violet-700">RSI (14)</span>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="text-red-500">— 70 Overbought</span>
              <span className="text-green-600">— 30 Oversold</span>
              {latestRsi !== null && latestRsi !== undefined && (
                <span className={`font-mono font-bold ${latestRsi > 70 ? "text-red-600" : latestRsi < 30 ? "text-green-600" : "text-gray-700"}`}>
                  {latestRsi.toFixed(1)}
                </span>
              )}
              <button onClick={() => setShowRsi(false)} className="hover:text-foreground">
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <IndicatorChart
            times={indicatorData.times}
            values={indicatorData.rsi}
            label="RSI"
            color="#7c3aed"
            refLine1={70}
            refLine2={30}
            refLineColor="#94a3b8"
            height={120}
            minVal={0}
            maxVal={100}
          />
        </div>
      )}

      {/* ── MACD Panel ── */}
      {showMacd && indicatorData && (
        <div className="rounded-xl border border-border overflow-hidden bg-white">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-gray-50">
            <span className="text-xs font-semibold text-blue-700">MACD (12, 26, 9)</span>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-500 inline-block" /> MACD</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-orange-400 inline-block" /> Signal</span>
              <span className="flex items-center gap-1"><span className="w-3 h-2 bg-green-300 inline-block rounded-sm" /> Histogram</span>
              {latestMacd !== null && latestMacd !== undefined && (
                <span className={`font-mono font-bold ${latestMacd > 0 ? "text-green-600" : "text-red-600"}`}>
                  {latestMacd.toFixed(3)}
                </span>
              )}
              <button onClick={() => setShowMacd(false)} className="hover:text-foreground">
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <MacdChart
            times={indicatorData.times}
            macd={indicatorData.macd}
            signal={indicatorData.signal}
            histogram={indicatorData.histogram}
            height={120}
          />
        </div>
      )}

      {/* ── Collapsed indicator re-open buttons ── */}
      {(!showRsi || !showMacd) && indicatorData && (
        <div className="flex gap-2">
          {!showRsi && (
            <button
              onClick={() => setShowRsi(true)}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-violet-200 text-violet-700 hover:bg-violet-50 transition-colors"
            >
              <ChevronDown className="w-3 h-3" /> Show RSI
            </button>
          )}
          {!showMacd && (
            <button
              onClick={() => setShowMacd(true)}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-blue-200 text-blue-700 hover:bg-blue-50 transition-colors"
            >
              <ChevronDown className="w-3 h-3" /> Show MACD
            </button>
          )}
        </div>
      )}

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
