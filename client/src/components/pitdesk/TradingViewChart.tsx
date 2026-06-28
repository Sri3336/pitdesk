/**
 * TradingViewChart — Canonical PitDesk component
 * ─────────────────────────────────────────────────────────────
 * Renders a TradingView Advanced Chart widget for a given ticker.
 *
 * Key implementation notes:
 * - Uses autosize:false with explicit height:500 in the widget JSON.
 *   (autosize:true causes the iframe to collapse to ~150px because
 *    TradingView measures the container before the DOM is fully laid out.)
 * - The outer container has a fixed height that matches the widget height.
 * - On ticker change, the container is fully cleared before mounting a
 *   new widget to prevent duplicate charts stacking.
 * - The component is keyed by ticker in the parent to force a clean remount.
 *
 * Usage:
 *   import { TradingViewChart } from "@/components/pitdesk/TradingViewChart";
 *   <TradingViewChart ticker="AAPL" height={500} />
 */

import { useEffect, useRef } from "react";

interface TradingViewChartProps {
  ticker: string;
  /** Chart height in pixels. Defaults to 500. Must match widget JSON height. */
  height?: number;
  interval?: "1" | "5" | "15" | "30" | "60" | "D" | "W";
  theme?: "light" | "dark";
}

export function TradingViewChart({
  ticker,
  height = 500,
  interval = "D",
  theme = "light",
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !ticker) return;

    // Fully clear before mounting — prevents duplicate charts on ticker change
    container.innerHTML = "";

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetDiv.style.height = "100%";
    widgetDiv.style.width = "100%";
    container.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    // IMPORTANT: autosize must be false. Explicit height must match the
    // container height prop. If you change height here, change the container
    // style below too.
    script.innerHTML = JSON.stringify({
      autosize: false,
      width: "100%",
      height,
      symbol: ticker,
      interval,
      timezone: "America/New_York",
      theme,
      style: "1",
      locale: "en",
      enable_publishing: false,
      allow_symbol_change: false,
      calendar: false,
      support_host: "https://www.tradingview.com",
      studies: [
        "RSI@tv-basicstudies",
        "MACD@tv-basicstudies",
        "Volume@tv-basicstudies",
      ],
    });
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, [ticker, height, interval, theme]);

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container w-full rounded-lg overflow-hidden"
      style={{ height, minHeight: height }}
    />
  );
}
