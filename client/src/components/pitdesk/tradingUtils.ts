/**
 * PitDesk Trading Utility Functions
 * ─────────────────────────────────────────────────────────────
 * Canonical color/label helpers for trading signals.
 * Import from here — never redefine inline in page files.
 *
 * Usage:
 *   import { gradeColor, gradeStyle, pcrColor, biasColor, strategyColor } from "@/components/pitdesk/tradingUtils";
 */

// ── Grade (A+, A, B, C, D) ────────────────────────────────────
/** Returns Tailwind class string for badge styling */
export function gradeColor(grade: string): string {
  if (grade === "A+" || grade === "A")
    return "bg-green-100 text-green-800 border-green-300";
  if (grade === "B") return "bg-blue-100 text-blue-800 border-blue-300";
  if (grade === "C") return "bg-yellow-100 text-yellow-800 border-yellow-300";
  return "bg-gray-100 text-gray-600 border-gray-300";
}

/** Returns inline style object for card/border styling */
export function gradeStyle(grade: string): { bg: string; border: string; text: string } {
  if (grade === "A+" || grade === "A")
    return { bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.35)", text: "#16a34a" };
  if (grade === "B")
    return { bg: "rgba(59,130,246,0.10)", border: "rgba(59,130,246,0.30)", text: "#2563eb" };
  if (grade === "C")
    return { bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.30)", text: "#d97706" };
  return { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.25)", text: "#dc2626" };
}

export function gradeRingColor(grade: string): string {
  if (grade === "A+" || grade === "A") return "ring-green-400";
  if (grade === "B") return "ring-blue-400";
  if (grade === "C") return "ring-yellow-400";
  return "ring-gray-300";
}

// ── PCR Signal ────────────────────────────────────────────────
export function pcrColor(signal: string): string {
  if (signal === "EXTREME_FEAR") return "#ef4444";
  if (signal === "FEAR") return "#f97316";
  if (signal === "NEUTRAL") return "#6b7280";
  if (signal === "GREED") return "#22c55e";
  if (signal === "EXTREME_GREED") return "#16a34a";
  return "#6b7280";
}

export function pcrLabel(signal: string): string {
  return signal?.replace(/_/g, " ") ?? "—";
}

// ── Directional Bias ─────────────────────────────────────────
export function biasColor(bias: string): string {
  if (bias === "Bullish" || bias === "BULLISH") return "#22c55e";
  if (bias === "Bearish" || bias === "BEARISH") return "#ef4444";
  return "#6b7280";
}

export function biasIcon(bias: string): string {
  if (bias === "Bullish" || bias === "BULLISH") return "↑";
  if (bias === "Bearish" || bias === "BEARISH") return "↓";
  return "→";
}

// ── IV Environment ────────────────────────────────────────────
export function ivLabel(ivRv: number): string {
  if (ivRv > 1.5) return "IV Elevated — sell premium";
  if (ivRv < 0.8) return "IV Compressed — buy premium";
  return "IV Fair — balanced";
}

export function ivColor(ivRv: number): string {
  if (ivRv > 1.5) return "#ef4444";
  if (ivRv < 0.8) return "#3b82f6";
  return "#f59e0b";
}

// ── Options Strategy ─────────────────────────────────────────
export function strategyColor(name: string): string {
  if (!name) return "#6b7280";
  const n = name.toLowerCase();
  if (n.includes("bull")) return "#22c55e";
  if (n.includes("bear")) return "#ef4444";
  if (n.includes("iron") || n.includes("condor")) return "#8b5cf6";
  if (n.includes("straddle") || n.includes("strangle")) return "#f59e0b";
  if (n.includes("calendar")) return "#06b6d4";
  if (n.includes("covered")) return "#10b981";
  return "#6366f1";
}

// ── Direction (Day/Swing picks) ───────────────────────────────
/** Handles both LONG/SHORT and bullish/bearish (case-insensitive) */
export function directionColor(dir: string): string {
  const d = dir?.toUpperCase();
  if (d === "LONG" || d === "BULLISH") return "#22c55e";
  if (d === "SHORT" || d === "BEARISH") return "#ef4444";
  return "#94a3b8";
}

/** Returns a unicode arrow string for direction */
export function directionIcon(dir: string): string {
  const d = dir?.toUpperCase();
  if (d === "LONG" || d === "BULLISH") return "↑";
  if (d === "SHORT" || d === "BEARISH") return "↓";
  return "→";
}

// ── VCP Stage ────────────────────────────────────────────────
/** Handles both numeric stages (1-4) and string enum keys from the scanner */
export function vcpStageLabel(stage: number | string): string {
  // String enum keys from VCP/Swing scanner
  const strMap: Record<string, string> = {
    VCP_PIVOT: "At Pivot",
    BREAKOUT: "Breakout",
    STAGE_2_UPTREND: "Uptrend",
    STAGE_1_BASE: "Building Base",
    STAGE_3_TOP: "Topping",
    STAGE_4_DECLINE: "Declining",
  };
  if (typeof stage === "string" && strMap[stage]) return strMap[stage];

  // Numeric stages
  const s = Number(stage);
  if (s === 1) return "Stage 1 — Basing";
  if (s === 2) return "Stage 2 — Advancing";
  if (s === 3) return "Stage 3 — Topping";
  if (s === 4) return "Stage 4 — Declining";
  return typeof stage === "string" ? stage : `Stage ${stage}`;
}

/** Handles both numeric stages and string enum keys */
export function vcpStageColor(stage: number | string): string {
  // String enum keys
  if (stage === "VCP_PIVOT") return "#22c55e";
  if (stage === "BREAKOUT") return "#f59e0b";
  if (stage === "STAGE_2_UPTREND") return "#6366f1";
  if (stage === "STAGE_1_BASE") return "#3b82f6";
  if (stage === "STAGE_3_TOP") return "#f97316";
  if (stage === "STAGE_4_DECLINE") return "#ef4444";

  // Numeric stages
  const s = Number(stage);
  if (s === 2) return "#22c55e";
  if (s === 1) return "#3b82f6";
  if (s === 3) return "#f59e0b";
  return "#ef4444";
}

// ── Score ────────────────────────────────────────────────
/** Returns a hex color string for a 0-100 score */
export function scoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#f59e0b";
  return "#ef4444";
}

/** Returns inline style object for a 0-10 composite score (used in Swing/Day cards) */
export function scoreStyle(score: number): { bg: string; border: string; text: string } {
  if (score >= 8)
    return { bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.35)", text: "#16a34a" };
  if (score >= 6)
    return { bg: "rgba(99,102,241,0.10)", border: "rgba(99,102,241,0.30)", text: "#4f46e5" };
  if (score >= 4)
    return { bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.30)", text: "#d97706" };
  return { bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.25)", text: "#64748b" };
}
