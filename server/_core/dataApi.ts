/**
 * Quick example (matches curl usage):
 *   await callDataApi("Youtube/search", {
 *     query: { gl: "US", hl: "en", q: "manus" },
 *   })
 */
import { ENV } from "./env";

export type DataApiCallOptions = {
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  pathParams?: Record<string, unknown>;
  formData?: Record<string, unknown>;
};

type DirectYahooRequest = {
  url: string;
  quoteCompatibility: boolean;
};

const DIRECT_YAHOO_APIS = new Set([
  "YahooFinance/get_stock_chart",
  "YahooFinance/get_stock_quote",
  "YahooFinance/get_stock_insights",
]);

const DAY_MS = 24 * 60 * 60 * 1000;
const toDateString = (value: Date) => value.toISOString().slice(0, 10);

const daysForRange = (range: string | undefined): number => {
  switch (range) {
    case "1d": return 1;
    case "5d": return 7;
    case "1mo": return 31;
    case "3mo": return 93;
    case "6mo": return 186;
    case "1y": return 366;
    case "2y": return 732;
    default: return 93;
  }
};

const getTicker = (options: DataApiCallOptions): string => {
  const ticker = options.query?.symbol ?? options.query?.ticker;
  if (typeof ticker !== "string" || !/^[A-Za-z0-9.^=-]{1,24}$/.test(ticker)) {
    throw new Error("A valid Yahoo Finance symbol is required");
  }
  return ticker.toUpperCase();
};

/**
 * Builds only the small, explicitly supported Yahoo-compatible surface that
 * PitDesk needs for charts, quotes, and insights. The current managed API
 * remains the default; Railway uses this only when MARKET_DATA_MODE is set to
 * `direct-yahoo`.
 */
export function buildDirectYahooRequest(
  apiId: string,
  options: DataApiCallOptions,
  baseUrl: string
): DirectYahooRequest {
  if (!DIRECT_YAHOO_APIS.has(apiId)) {
    throw new Error(`Direct Yahoo mode does not support ${apiId}`);
  }

  const ticker = getTicker(options);
  const base = baseUrl.replace(/\/$/, "");
  const query = new URLSearchParams();

  if (apiId === "YahooFinance/get_stock_insights") {
    query.set("symbol", ticker);
    return {
      url: `${base}/ws/insights/v1/finance/insights?${query.toString()}`,
      quoteCompatibility: false,
    };
  }

  const sourceQuery = options.query ?? {};
  for (const [key, value] of Object.entries(sourceQuery)) {
    if (key === "symbol" || key === "ticker" || key === "region" || value === undefined || value === null) continue;
    query.set(key, String(value));
  }

  const isQuote = apiId === "YahooFinance/get_stock_quote";
  if (isQuote) {
    query.set("range", "1d");
    query.set("interval", "1m");
  }

  return {
    url: `${base}/v8/finance/chart/${encodeURIComponent(ticker)}?${query.toString()}`,
    quoteCompatibility: isQuote,
  };
}

const callDirectYahoo = async (
  apiId: string,
  options: DataApiCallOptions
): Promise<unknown> => {
  const request = buildDirectYahooRequest(apiId, options, ENV.yahooFinanceBaseUrl);
  const response = await fetch(request.url, {
    headers: { "user-agent": "PitDesk/1.0 market-data adapter" },
  });
  if (!response.ok) {
    throw new Error(`Direct Yahoo request failed (${response.status} ${response.statusText})`);
  }

  const payload = await response.json();
  if (!request.quoteCompatibility) return payload;

  const meta = payload?.chart?.result?.[0]?.meta;
  return {
    quoteResponse: {
      result: meta ? [{
        ...meta,
        regularMarketPrice: meta.regularMarketPrice,
        regularMarketPreviousClose: meta.previousClose ?? meta.chartPreviousClose,
      }] : [],
    },
  };
};

type TradierRequest = {
  url: string;
  kind: "daily" | "intraday" | "quote" | "news";
};

export function buildTradierRequest(
  apiId: string,
  options: DataApiCallOptions,
  baseUrl: string,
  now = new Date()
): TradierRequest {
  const ticker = getTicker(options);
  const base = baseUrl.replace(/\/$/, "");
  const sourceQuery = options.query ?? {};

  if (apiId === "YahooFinance/get_stock_quote") {
    return { url: `${base}/markets/quotes?symbols=${encodeURIComponent(ticker)}`, kind: "quote" };
  }
  if (apiId === "YahooFinance/get_stock_insights") {
    return { url: `${base}/markets/news?symbols=${encodeURIComponent(ticker)}`, kind: "news" };
  }
  if (apiId !== "YahooFinance/get_stock_chart") {
    throw new Error(`Tradier mode does not support ${apiId}`);
  }

  const interval = String(sourceQuery.interval ?? "1d");
  const start = new Date(now.getTime() - daysForRange(String(sourceQuery.range ?? "3mo")) * DAY_MS);
  const end = toDateString(now);
  if (["1m", "5m", "15m"].includes(interval)) {
    const tradierInterval = interval === "1m" ? "1min" : `${interval.slice(0, -1)}min`;
    return {
      url: `${base}/markets/timesales?symbol=${encodeURIComponent(ticker)}&interval=${tradierInterval}&start=${toDateString(start)}&end=${end}`,
      kind: "intraday",
    };
  }
  return {
    url: `${base}/markets/history?symbol=${encodeURIComponent(ticker)}&interval=daily&start=${toDateString(start)}&end=${end}`,
    kind: "daily",
  };
}

const toUnix = (date: string): number => Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);

const toChartPayload = (rows: Array<Record<string, unknown>>) => ({
  chart: {
    result: [{
      timestamp: rows.map(row => typeof row.timestamp === "number" ? row.timestamp : toUnix(String(row.date ?? row.time))),
      indicators: {
        quote: [{
          open: rows.map(row => Number(row.open ?? 0)),
          high: rows.map(row => Number(row.high ?? 0)),
          low: rows.map(row => Number(row.low ?? 0)),
          close: rows.map(row => Number(row.close ?? row.price ?? 0)),
          volume: rows.map(row => Number(row.volume ?? 0)),
        }],
      },
    }],
    error: null,
  },
});

const callTradier = async (apiId: string, options: DataApiCallOptions): Promise<unknown> => {
  if (!ENV.tradierApiKey) {
    throw new Error("TRADIER_API_KEY is required when MARKET_DATA_MODE=tradier");
  }
  const request = buildTradierRequest(apiId, options, ENV.tradierMarketDataBaseUrl);
  const response = await fetch(request.url, {
    headers: {
      Authorization: `Bearer ${ENV.tradierApiKey}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Tradier market-data request failed (${response.status} ${response.statusText})`);
  }
  const payload = await response.json();

  if (request.kind === "quote") {
    const quote = Array.isArray(payload?.quotes?.quote) ? payload.quotes.quote[0] : payload?.quotes?.quote;
    return { quoteResponse: { result: quote ? [quote] : [] } };
  }
  if (request.kind === "news") {
    const news = Array.isArray(payload?.news?.article) ? payload.news.article : (payload?.news?.article ? [payload.news.article] : []);
    return {
      finance: {
        result: {
          sigDevs: news.map((item: Record<string, unknown>) => ({
            headline: String(item.headline ?? item.title ?? ""),
            date: String(item.updated_at ?? item.published_at ?? ""),
          })),
          reports: [],
        },
      },
    };
  }

  const rows = request.kind === "daily"
    ? (Array.isArray(payload?.history?.day) ? payload.history.day : (payload?.history?.day ? [payload.history.day] : []))
    : (Array.isArray(payload?.series?.data) ? payload.series.data : (payload?.series?.data ? [payload.series.data] : []));
  return toChartPayload(rows);
};

export async function callDataApi(
  apiId: string,
  options: DataApiCallOptions = {}
): Promise<unknown> {
  if (ENV.marketDataMode === "direct-yahoo" && DIRECT_YAHOO_APIS.has(apiId)) {
    return callDirectYahoo(apiId, options);
  }
  if (ENV.marketDataMode === "tradier" && DIRECT_YAHOO_APIS.has(apiId)) {
    return callTradier(apiId, options);
  }

  if (!ENV.forgeApiUrl) {
    throw new Error("BUILT_IN_FORGE_API_URL is not configured");
  }
  if (!ENV.forgeApiKey) {
    throw new Error("BUILT_IN_FORGE_API_KEY is not configured");
  }

  // Build the full URL by appending the service path to the base URL
  const baseUrl = ENV.forgeApiUrl.endsWith("/") ? ENV.forgeApiUrl : `${ENV.forgeApiUrl}/`;
  const fullUrl = new URL("webdevtoken.v1.WebDevService/CallApi", baseUrl).toString();

  const response = await fetch(fullUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "connect-protocol-version": "1",
      authorization: `Bearer ${ENV.forgeApiKey}`,
    },
    body: JSON.stringify({
      apiId,
      query: options.query,
      body: options.body,
      path_params: options.pathParams,
      multipart_form_data: options.formData,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Data API request failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
    );
  }

  const payload = await response.json().catch(() => ({}));
  if (payload && typeof payload === "object" && "jsonData" in payload) {
    try {
      return JSON.parse((payload as Record<string, string>).jsonData ?? "{}");
    } catch {
      return (payload as Record<string, unknown>).jsonData;
    }
  }
  return payload;
}
