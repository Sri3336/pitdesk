/**
 * OptionsFlow.tsx
 *
 * Options Flow / Dark Pool screen — shows unusual call/put activity
 * from Tradier options chains, sorted by unusual score.
 *
 * Features:
 * - Filter by call/put/all, min premium slider, max DTE
 * - Sort by unusual score, premium, volume, IV
 * - Color-coded rows: calls = green tint, puts = red tint
 * - Ask Pit Advisor button per row
 * - Refresh on demand
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  ArrowUpDown,
  MessageSquare,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useLocation } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlowContract {
  ticker: string;
  strike: number;
  expiration: string;
  type: "call" | "put";
  volume: number;
  openInterest: number;
  iv: number;
  bid: number;
  ask: number;
  premium: number;
  unusualScore: number;
  daysToExpiry: number;
  delta: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPremium(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

function formatNumber(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}K`;
  return val.toLocaleString();
}

function getSignalLabel(score: number): { label: string; color: string } {
  if (score >= 50) return { label: "🔥 EXTREME", color: "text-orange-600 font-bold" };
  if (score >= 20) return { label: "⚡ UNUSUAL", color: "text-yellow-600 font-semibold" };
  if (score >= 5) return { label: "📊 ELEVATED", color: "text-blue-600" };
  return { label: "NORMAL", color: "text-gray-400" };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OptionsFlow() {
  const [, navigate] = useLocation();

  // Filter state
  const [contractType, setContractType] = useState<"all" | "call" | "put">("all");
  const [sortBy, setSortBy] = useState<"unusualScore" | "premium" | "volume" | "iv">("unusualScore");
  const [minPremium, setMinPremium] = useState(500);
  const [maxDte, setMaxDte] = useState(45);
  const [limit, setLimit] = useState(50);

  // Query
  const { data, isLoading, isFetching, refetch, error } = trpc.optionsFlow.getFlow.useQuery(
    { contractType, sortBy, minPremium, maxDte, limit },
    { refetchOnWindowFocus: false, retry: 1 }
  );

  const contracts: FlowContract[] = data?.contracts ?? [];

  // Stats
  const stats = useMemo(() => {
    const calls = contracts.filter(c => c.type === "call");
    const puts = contracts.filter(c => c.type === "put");
    const totalPremium = contracts.reduce((s, c) => s + c.premium, 0);
    const callPremium = calls.reduce((s, c) => s + c.premium, 0);
    const putPremium = puts.reduce((s, c) => s + c.premium, 0);
    return { callCount: calls.length, putCount: puts.length, totalPremium, callPremium, putPremium };
  }, [contracts]);

  function handleAskPitAdvisor(contract: FlowContract) {
    const prompt = encodeURIComponent(
      `Analyze this unusual options flow for me:\n\n` +
      `Ticker: ${contract.ticker}\n` +
      `Contract: ${contract.type.toUpperCase()} $${contract.strike} exp ${contract.expiration} (${contract.daysToExpiry} DTE)\n` +
      `Volume: ${formatNumber(contract.volume)} | OI: ${formatNumber(contract.openInterest)}\n` +
      `IV: ${contract.iv}% | Premium per contract: ${formatPremium(contract.premium)}\n` +
      `Unusual Score: ${contract.unusualScore.toFixed(2)}\n` +
      `Delta: ${contract.delta != null ? contract.delta.toFixed(3) : "N/A"}\n\n` +
      `What does this flow suggest? Is this hedging, speculation, or institutional positioning? ` +
      `Give me a 5-dimension analysis and a specific trade setup if the signal is actionable.`
    );
    navigate(`/pit-advisor?prompt=${prompt}`);
  }

  const premiumLabels = [100, 500, 1000, 5000, 10000, 50000];
  const premiumIdx = premiumLabels.indexOf(minPremium) >= 0 ? premiumLabels.indexOf(minPremium) : 1;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Zap className="w-6 h-6 text-green-500" />
            Options Flow
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Unusual call/put activity — sorted by institutional signal strength
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="rounded-xl shadow-sm border border-gray-100">
          <CardContent className="p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Total Contracts</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{contracts.length}</div>
          </CardContent>
        </Card>
        <Card className="rounded-xl shadow-sm border border-gray-100">
          <CardContent className="p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Call / Put</div>
            <div className="text-2xl font-bold mt-1">
              <span className="text-green-600">{stats.callCount}</span>
              <span className="text-gray-400 mx-1">/</span>
              <span className="text-red-500">{stats.putCount}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl shadow-sm border border-gray-100">
          <CardContent className="p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Call Premium</div>
            <div className="text-2xl font-bold text-green-600 mt-1">{formatPremium(stats.callPremium)}</div>
          </CardContent>
        </Card>
        <Card className="rounded-xl shadow-sm border border-gray-100">
          <CardContent className="p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Put Premium</div>
            <div className="text-2xl font-bold text-red-500 mt-1">{formatPremium(stats.putPremium)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="rounded-xl shadow-sm border border-gray-100">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-end">
            {/* Contract Type */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Type</label>
              <Select value={contractType} onValueChange={(v) => setContractType(v as typeof contractType)}>
                <SelectTrigger className="w-28 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="call">Calls</SelectItem>
                  <SelectItem value="put">Puts</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sort By */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Sort By</label>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="w-40 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unusualScore">Unusual Score</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                  <SelectItem value="volume">Volume</SelectItem>
                  <SelectItem value="iv">IV</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Min Premium */}
            <div className="space-y-1 min-w-[160px]">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Min Premium: {formatPremium(minPremium)}
              </label>
              <Slider
                min={0}
                max={premiumLabels.length - 1}
                step={1}
                value={[premiumIdx]}
                onValueChange={([idx]) => setMinPremium(premiumLabels[idx])}
                className="w-40"
              />
            </div>

            {/* Max DTE */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Max DTE: {maxDte}d</label>
              <Select value={String(maxDte)} onValueChange={(v) => setMaxDte(Number(v))}>
                <SelectTrigger className="w-24 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="45">45 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Limit */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Show</label>
              <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
                <SelectTrigger className="w-20 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          <strong>Error loading options flow:</strong> {error.message}
          <br />
          <span className="text-xs text-red-500">Make sure TRADIER_API_KEY is configured and the market is open.</span>
        </div>
      )}

      {/* Table */}
      <Card className="rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <CardHeader className="pb-0 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Activity className="w-4 h-4 text-green-500" />
            Unusual Activity
            {data && (
              <span className="text-xs font-normal text-gray-400 ml-1">
                {data.total} contracts · scanned {new Date(data.scannedAt).toLocaleTimeString()}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ticker</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Contract</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Volume</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">OI</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">IV</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Premium</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Delta</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Signal</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : contracts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                      <div className="flex flex-col items-center gap-2">
                        <Activity className="w-8 h-8 text-gray-300" />
                        <div className="font-medium">No unusual activity found</div>
                        <div className="text-xs">Try lowering the minimum premium or expanding the DTE window</div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  contracts.map((contract, i) => {
                    const isCall = contract.type === "call";
                    const signal = getSignalLabel(contract.unusualScore);
                    return (
                      <tr
                        key={`${contract.ticker}-${contract.strike}-${contract.expiration}-${contract.type}-${i}`}
                        className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                          isCall ? "bg-green-50/30" : "bg-red-50/30"
                        }`}
                      >
                        {/* Ticker */}
                        <td className="px-4 py-3">
                          <span className="font-bold text-gray-900">{contract.ticker}</span>
                        </td>

                        {/* Contract */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Badge
                              className={`text-xs font-bold px-2 py-0.5 ${
                                isCall
                                  ? "bg-green-100 text-green-700 border-green-200"
                                  : "bg-red-100 text-red-600 border-red-200"
                              }`}
                              variant="outline"
                            >
                              {isCall ? (
                                <TrendingUp className="w-3 h-3 mr-1" />
                              ) : (
                                <TrendingDown className="w-3 h-3 mr-1" />
                              )}
                              {contract.type.toUpperCase()}
                            </Badge>
                            <span className="font-mono text-gray-800">
                              ${contract.strike} · {contract.expiration}
                            </span>
                            <span className="text-xs text-gray-400">{contract.daysToExpiry}d</span>
                          </div>
                        </td>

                        {/* Volume */}
                        <td className="px-4 py-3 text-right font-mono text-gray-700">
                          {formatNumber(contract.volume)}
                        </td>

                        {/* OI */}
                        <td className="px-4 py-3 text-right font-mono text-gray-500">
                          {formatNumber(contract.openInterest)}
                        </td>

                        {/* IV */}
                        <td className="px-4 py-3 text-right font-mono">
                          <span className={contract.iv > 80 ? "text-orange-600 font-semibold" : "text-gray-700"}>
                            {contract.iv.toFixed(1)}%
                          </span>
                        </td>

                        {/* Premium */}
                        <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">
                          {formatPremium(contract.premium)}
                        </td>

                        {/* Delta */}
                        <td className="px-4 py-3 text-right font-mono text-gray-500">
                          {contract.delta != null ? contract.delta.toFixed(2) : "—"}
                        </td>

                        {/* Signal */}
                        <td className="px-4 py-3">
                          <span className={`text-xs ${signal.color}`}>{signal.label}</span>
                          <div className="text-xs text-gray-400 font-mono">{contract.unusualScore.toFixed(2)}</div>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                                onClick={() => handleAskPitAdvisor(contract)}
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Ask Pit Advisor about this flow</TooltipContent>
                          </Tooltip>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-gray-400 px-1">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-green-100 border border-green-200" />
          <span>Call flow</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-100 border border-red-200" />
          <span>Put flow</span>
        </div>
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="w-3 h-3" />
          <span>Unusual Score = (Vol/OI) × Premium × IV</span>
        </div>
      </div>
    </div>
  );
}
