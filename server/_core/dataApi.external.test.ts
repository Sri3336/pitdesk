import { describe, expect, it } from "vitest";
import { buildDirectYahooRequest, buildTradierRequest } from "./dataApi";

describe("buildDirectYahooRequest", () => {
  it("builds a chart URL from the existing Yahoo-style query contract", () => {
    const request = buildDirectYahooRequest(
      "YahooFinance/get_stock_chart",
      { query: { symbol: "NVDA", interval: "1d", range: "3mo", region: "US" } },
      "https://query1.finance.yahoo.com/"
    );
    expect(request.url).toBe("https://query1.finance.yahoo.com/v8/finance/chart/NVDA?interval=1d&range=3mo");
    expect(request.quoteCompatibility).toBe(false);
  });

  it("normalizes the quote request to a chart-compatible intraday request", () => {
    const request = buildDirectYahooRequest(
      "YahooFinance/get_stock_quote",
      { query: { ticker: "SNDK" } },
      "https://query1.finance.yahoo.com"
    );
    expect(request.url).toBe("https://query1.finance.yahoo.com/v8/finance/chart/SNDK?range=1d&interval=1m");
    expect(request.quoteCompatibility).toBe(true);
  });

  it("rejects unsupported managed data APIs in direct Yahoo mode", () => {
    expect(() => buildDirectYahooRequest("X/search_recent_posts", {}, "https://query1.finance.yahoo.com"))
      .toThrow("Direct Yahoo mode does not support");
  });
});

describe("buildTradierRequest", () => {
  const now = new Date("2026-08-22T12:00:00Z");

  it("builds a daily history request for the existing chart contract", () => {
    expect(buildTradierRequest(
      "YahooFinance/get_stock_chart",
      { query: { symbol: "NVDA", interval: "1d", range: "3mo" } },
      "https://api.tradier.com/v1",
      now
    )).toEqual({
      url: "https://api.tradier.com/v1/markets/history?symbol=NVDA&interval=daily&start=2026-05-21&end=2026-08-22",
      kind: "daily",
    });
  });

  it("builds a five-minute time-and-sales request for an intraday chart", () => {
    expect(buildTradierRequest(
      "YahooFinance/get_stock_chart",
      { query: { ticker: "SNDK", interval: "5m", range: "1d" } },
      "https://api.tradier.com/v1",
      now
    )).toEqual({
      url: "https://api.tradier.com/v1/markets/timesales?symbol=SNDK&interval=5min&start=2026-08-21&end=2026-08-22",
      kind: "intraday",
    });
  });
});
