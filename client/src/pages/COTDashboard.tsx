import { useState, useMemo } from "react";
import { Link } from "wouter";
import { RefreshCw, TrendingUp, TrendingDown, Minus, BookOpen, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { MarketCard } from "@/components/MarketCard";
import { DataFreshnessBanner } from "@/components/DataFreshnessBanner";
import { trpc } from "@/lib/trpc";
import type { CotCategory } from "@shared/cotTypes";

const CATEGORIES: Array<{ label: string; value: CotCategory | "All" }> = [
  { label: "All", value: "All" },
  { label: "Metals", value: "Metal" },
  { label: "Energy", value: "Energy" },
  { label: "Grains", value: "Grain" },
  { label: "Currencies", value: "Currency" },
  { label: "Equities", value: "Equity" },
  { label: "Rates", value: "Rate" },
  { label: "Commodities", value: "Commodity" },
];

export default function COTDashboard() {
  const [category, setCategory] = useState<CotCategory | "All">("All");

  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = trpc.cot.scanAll.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5 min — CFTC data is weekly
    refetchOnWindowFocus: false,
  });

  const filtered = useMemo(() => {
    if (!data?.results) return [];
    if (category === "All") return data.results;
    return data.results.filter((r) => r.instrument.category === category);
  }, [data, category]);

  // Oldest data age across all results
  const maxDataAge = useMemo(() => {
    if (!data?.results?.length) return 0;
    return Math.max(...data.results.map((r) => r.dataAge));
  }, [data]);

  const latestDate = useMemo(() => {
    if (!data?.results?.length) return "";
    return data.results.reduce((best, r) => {
      if (!best || r.latestDate > best) return r.latestDate;
      return best;
    }, "");
  }, [data]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">COT Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Commitment of Traders — Larry Williams methodology · 19 instruments
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/cot/methodology">
            <Button variant="outline" size="sm" className="gap-1.5">
              <BookOpen className="h-4 w-4" />
              Methodology
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Scanning..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Data freshness */}
      {latestDate && (
        <DataFreshnessBanner latestDate={latestDate} dataAge={maxDataAge} />
      )}

      {/* Summary stats */}
      {data && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
            <TrendingUp className="h-6 w-6 text-green-600 shrink-0" />
            <div>
              <div className="text-2xl font-bold text-green-700">{data.bullishCount}</div>
              <div className="text-sm text-green-600">Bullish (COT ≥75)</div>
            </div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center gap-3">
            <Minus className="h-6 w-6 text-gray-500 shrink-0" />
            <div>
              <div className="text-2xl font-bold text-gray-700">{data.neutralCount}</div>
              <div className="text-sm text-gray-500">Neutral (25–74)</div>
            </div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <TrendingDown className="h-6 w-6 text-red-600 shrink-0" />
            <div>
              <div className="text-2xl font-bold text-red-700">{data.bearishCount}</div>
              <div className="text-sm text-red-600">Bearish (COT ≤25)</div>
            </div>
          </div>
        </div>
      )}

      {/* Category filter */}
      <Tabs value={category} onValueChange={(v) => setCategory(v as CotCategory | "All")}>
        <TabsList className="flex-wrap h-auto gap-1 bg-gray-100 p-1">
          {CATEGORIES.map((cat) => (
            <TabsTrigger key={cat.value} value={cat.value} className="text-xs">
              {cat.label}
              {cat.value !== "All" && data && (
                <Badge
                  variant="secondary"
                  className="ml-1.5 text-xs px-1 py-0 h-4 min-w-4 text-center"
                >
                  {data.results.filter((r) => r.instrument.category === cat.value).length}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Info className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p>No instruments in this category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((result) => (
            <MarketCard key={result.instrument.id} result={result} />
          ))}
        </div>
      )}

      {/* Footer */}
      {dataUpdatedAt > 0 && (
        <p className="text-xs text-gray-400 text-right">
          Last scanned: {new Date(dataUpdatedAt).toLocaleTimeString()} · Source: CFTC Socrata API
        </p>
      )}
    </div>
  );
}
