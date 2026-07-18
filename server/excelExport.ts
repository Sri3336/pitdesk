import ExcelJS from "exceljs";
import type { AnalysisResult, StrategyResult } from "./analysisEngine";

const GOLD = "FFCC6600";
const DARK_BG = "FF1A1F2E";
const HEADER_BG = "FF0D1117";
const PROFIT_GREEN = "FF00C853";
const LOSS_RED = "FFDD2C00";
const BORDER_COLOR = "FF2D3748";

function applyHeaderStyle(cell: ExcelJS.Cell, bg = GOLD) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
  cell.font = { bold: true, color: { argb: bg === GOLD ? "FF000000" : "FFFFFFFF" }, size: 10 };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = {
    top: { style: "thin", color: { argb: BORDER_COLOR } },
    bottom: { style: "thin", color: { argb: BORDER_COLOR } },
    left: { style: "thin", color: { argb: BORDER_COLOR } },
    right: { style: "thin", color: { argb: BORDER_COLOR } },
  };
}

function applyDataStyle(cell: ExcelJS.Cell, isNumber = false) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK_BG } };
  cell.font = { color: { argb: "FFE2E8F0" }, size: 10 };
  cell.alignment = { vertical: "middle", horizontal: isNumber ? "right" : "left" };
  cell.border = {
    top: { style: "thin", color: { argb: BORDER_COLOR } },
    bottom: { style: "thin", color: { argb: BORDER_COLOR } },
    left: { style: "thin", color: { argb: BORDER_COLOR } },
    right: { style: "thin", color: { argb: BORDER_COLOR } },
  };
}

export async function generateExcelReport(result: AnalysisResult): Promise<string> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Options Strategy Analyzer";
  wb.created = new Date();

  // ── Summary sheet ──────────────────────────────────────────────────────────
  const summary = wb.addWorksheet("Summary");
  summary.getColumn(1).width = 32;
  summary.getColumn(2).width = 40;

  const summaryRows: [string, string | number][] = [
    ["Ticker", result.ticker],
    ["Generated At", result.analysisDate],
    ["Primary Recommendation", result.recommendation.name],
    ["Primary Rationale", result.recommendation.rationale],
    ["Composite Score", result.recommendation.compositeScore],
    ["Last Price", result.regime.lastPrice],
    ["Expiry Used", result.expiryUsed],
    ["DTE", result.dte],
    ["Target DTE", result.targetDte],
    ["Account Size", result.accountSize],
    ["Directional Bias", result.regime.directionalBias],
    ["Directional Score", result.regime.directionalScore],
    ["20D Realized Vol", result.regime.rv20],
    ["30D Realized Vol", result.regime.rv30],
    ["Median Chain IV", result.regime.medianIV],
    ["IV/RV Ratio", result.regime.ivRvRatio],
    ["RSI-14", result.regime.rsi14],
    ["MACD Histogram", result.regime.macdHist],
    ["SMA-20", result.regime.sma20],
    ["SMA-50", result.regime.sma50],
    ["SMA-200", result.regime.sma200],
  ];

  // Title row
  const titleRow = summary.addRow(["OPTIONS STRATEGY ANALYZER — SUMMARY", ""]);
  summary.mergeCells("A1:B1");
  const titleCell = summary.getCell("A1");
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
  titleCell.font = { bold: true, color: { argb: "FFCC6600" }, size: 14 };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  titleRow.height = 30;

  summaryRows.forEach(([label, value]) => {
    const row = summary.addRow([label, value]);
    applyDataStyle(row.getCell(1));
    applyDataStyle(row.getCell(2), typeof value === "number");
    row.height = 18;
  });

  // ── Strategy_Comparison sheet ──────────────────────────────────────────────
  const compSheet = wb.addWorksheet("Strategy_Comparison");
  const compHeaders = [
    "Strategy", "Rank", "Net Credit ($)", "Max Profit ($)", "Max Loss ($)",
    "Buying Power ($)", "POP (%)", "Delta", "Theta", "Vega",
    "Score: POP", "Score: Liquidity", "Score: Risk Def.", "Score: Dir. Fit",
    "Score: IV/RV", "Score: Theta", "Score: Vega", "Composite Score",
    "Breakeven Low", "Breakeven High", "Rationale",
  ];
  const compHeaderRow = compSheet.addRow(compHeaders);
  compHeaders.forEach((_, i) => {
    const cell = compHeaderRow.getCell(i + 1);
    applyHeaderStyle(cell);
    compSheet.getColumn(i + 1).width = i === 20 ? 50 : i === 0 ? 18 : 14;
  });
  compHeaderRow.height = 22;

  const stratOrder: StrategyResult["name"][] = [
    "Naked Put", "Naked Call", "Short Strangle", "Iron Condor",
    "Bull Put Spread", "Bear Call Spread", "Bull Call Spread", "Bear Put Spread",
    "Long Straddle", "Long Strangle", "Cash-Secured Put", "Covered Call", "Butterfly Spread",
    "Jade Lizard", "Broken Wing Butterfly",
  ];
  for (const name of stratOrder) {
    const s = result.strategies.find(st => st.name === name);
    if (!s) continue;
    const row = compSheet.addRow([
      s.name, s.rank,
      s.netCredit, s.maxProfit,
      s.maxLoss ?? "Unlimited",
      s.buyingPower,
      (s.pop * 100).toFixed(1),
      s.delta.toFixed(4), s.theta.toFixed(4), s.vega.toFixed(4),
      s.scores.pop.toFixed(2), s.scores.liquidity.toFixed(2),
      s.scores.riskDefinition.toFixed(2), s.scores.directionalFit.toFixed(2),
      s.scores.ivRvRatio.toFixed(2), s.scores.theta.toFixed(2), s.scores.vega.toFixed(2),
      s.compositeScore.toFixed(2),
      s.breakevens[0] ?? "", s.breakevens[1] ?? "",
      s.rationale,
    ]);
    row.eachCell(cell => applyDataStyle(cell, false));
    row.height = 18;
    // Highlight recommended
    if (s.name === result.recommendation.name) {
      row.eachCell(cell => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A2A1A" } };
        cell.font = { ...cell.font, bold: true };
      });
    }
  }

  // ── Per-strategy sheets ────────────────────────────────────────────────────
  const strategySheetNames: Record<StrategyResult["name"], string> = {
    "Naked Put": "Naked_Put",
    "Naked Call": "Naked_Call",
    "Short Strangle": "Short_Strangle",
    "Iron Condor": "Iron_Condor",
    "Bull Put Spread": "Bull_Put_Spread",
    "Bear Call Spread": "Bear_Call_Spread",
    "Bull Call Spread": "Bull_Call_Spread",
    "Bear Put Spread": "Bear_Put_Spread",
    "Long Straddle": "Long_Straddle",
    "Long Strangle": "Long_Strangle",
    "Cash-Secured Put": "Cash_Secured_Put",
    "Covered Call": "Covered_Call",
    "Butterfly Spread": "Butterfly_Spread",
    "Jade Lizard": "Jade_Lizard",
    "Broken Wing Butterfly": "Broken_Wing_Butterfly",
  };

  for (const name of stratOrder) {
    const s = result.strategies.find(st => st.name === name);
    const sheetName = strategySheetNames[name];
    const ws = wb.addWorksheet(sheetName);

    ws.getColumn(1).width = 24;
    ws.getColumn(2).width = 20;

    const titleR = ws.addRow([name.toUpperCase(), ""]);
    ws.mergeCells(`A1:B1`);
    const tc = ws.getCell("A1");
    tc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    tc.font = { bold: true, color: { argb: "FFCC6600" }, size: 13 };
    tc.alignment = { vertical: "middle", horizontal: "center" };
    titleR.height = 26;

    if (!s) {
      ws.addRow(["No data available for this strategy", ""]);
      continue;
    }

    const rows: [string, string | number][] = [
      ["Rank", s.rank],
      ["Net Credit ($)", s.netCredit],
      ["Max Profit ($)", s.maxProfit ?? "Unlimited"],
      ["Max Loss ($)", s.maxLoss ?? "Unlimited"],
      ["Buying Power ($)", s.buyingPower],
      ["POP (%)", (s.pop * 100).toFixed(1)],
      ["Delta", s.delta],
      ["Theta", s.theta],
      ["Vega", s.vega],
      ["Breakeven Low", s.breakevens[0] ?? "N/A"],
      ["Breakeven High", s.breakevens[1] ?? "N/A"],
      ["", ""],
      ["— SCORES —", ""],
      ["POP Score", s.scores.pop],
      ["Liquidity Score", s.scores.liquidity],
      ["Risk Definition Score", s.scores.riskDefinition],
      ["Directional Fit Score", s.scores.directionalFit],
      ["IV/RV Ratio Score", s.scores.ivRvRatio],
      ["Theta Score", s.scores.theta],
      ["Vega Score", s.scores.vega],
      ["Composite Score", s.compositeScore],
      ["", ""],
      ["Rationale", s.rationale],
    ];

    rows.forEach(([label, value]) => {
      const row = ws.addRow([label, value]);
      applyDataStyle(row.getCell(1));
      applyDataStyle(row.getCell(2), typeof value === "number");
      row.height = 18;
    });

    // Legs table
    ws.addRow([]);
    const legsHeaderRow = ws.addRow(["— OPTION LEGS —", ""]);
    legsHeaderRow.getCell(1).font = { bold: true, color: { argb: "FFCC6600" } };

    const legHeaders = ["Type", "Strike", "Expiry", "Position", "Bid", "Ask", "Mid", "IV", "Delta", "Gamma", "Theta", "Vega", "OI", "Volume"];
    const lhRow = ws.addRow(legHeaders);
    legHeaders.forEach((_, i) => {
      applyHeaderStyle(lhRow.getCell(i + 1), HEADER_BG);
      ws.getColumn(i + 1).width = 12;
    });

    for (const leg of s.legs) {
      const legRow = ws.addRow([
        leg.type, leg.strike, leg.expiry, (leg as any).position ?? "short",
        leg.bid, leg.ask, leg.mid, (leg.iv * 100).toFixed(1) + "%",
        leg.delta.toFixed(4), leg.gamma.toFixed(6),
        leg.theta.toFixed(4), leg.vega.toFixed(4),
        leg.openInterest, leg.volume,
      ]);
      legRow.eachCell(cell => applyDataStyle(cell, false));
    }
  }

  // ── Underlying_Data sheet ──────────────────────────────────────────────────
  const udSheet = wb.addWorksheet("Underlying_Data");
  const udHeaders = ["Date", "Open", "High", "Low", "Close", "Volume"];
  const udHeaderRow = udSheet.addRow(udHeaders);
  udHeaders.forEach((_, i) => {
    applyHeaderStyle(udHeaderRow.getCell(i + 1));
    udSheet.getColumn(i + 1).width = 14;
  });

  for (const bar of result.priceHistory) {
    const row = udSheet.addRow([bar.date, bar.open, bar.high, bar.low, bar.close, bar.volume]);
    row.eachCell((cell, col) => applyDataStyle(cell, col > 1));
    row.height = 16;
  }

  // ── Option_Chain sheet ─────────────────────────────────────────────────────
  const ocSheet = wb.addWorksheet("Option_Chain");
  const ocHeaders = ["Type", "Strike", "Expiry", "DTE", "Bid", "Ask", "Mid", "IV (%)", "Delta", "Gamma", "Theta", "Vega", "Open Interest", "Volume"];
  const ocHeaderRow = ocSheet.addRow(ocHeaders);
  ocHeaders.forEach((_, i) => {
    applyHeaderStyle(ocHeaderRow.getCell(i + 1));
    ocSheet.getColumn(i + 1).width = 14;
  });

  for (const leg of result.optionChain) {
    const row = ocSheet.addRow([
      leg.type, leg.strike, leg.expiry, leg.dte,
      leg.bid, leg.ask, leg.mid,
      (leg.iv * 100).toFixed(1),
      leg.delta.toFixed(4), leg.gamma.toFixed(6),
      leg.theta.toFixed(4), leg.vega.toFixed(4),
      leg.openInterest, leg.volume,
    ]);
    row.eachCell((cell, col) => applyDataStyle(cell, col > 1));
    row.height = 16;
  }

  // ── Scoring_Methodology sheet ──────────────────────────────────────────────
  const smSheet = wb.addWorksheet("Scoring_Methodology");
  smSheet.getColumn(1).width = 24;
  smSheet.getColumn(2).width = 16;
  smSheet.getColumn(3).width = 60;

  const smTitle = smSheet.addRow(["SCORING METHODOLOGY", "", ""]);
  smSheet.mergeCells("A1:C1");
  smTitle.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
  smTitle.getCell(1).font = { bold: true, color: { argb: "FFCC6600" }, size: 13 };
  smTitle.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  smTitle.height = 26;

  const smHeaders = ["Dimension", "Max Points", "Description"];
  const smHRow = smSheet.addRow(smHeaders);
  smHeaders.forEach((_, i) => applyHeaderStyle(smHRow.getCell(i + 1)));

  const methodologyRows = [
    ["POP (Probability of Profit)", "20", "Derived from the absolute delta of the short leg(s). Higher probability of expiring worthless earns a higher score. POP = 1 − |delta|."],
    ["Liquidity", "20", "Composite of bid/ask spread tightness (0–10) and open interest (0–10). Tight spreads and high OI indicate liquid, tradeable markets."],
    ["Risk Definition", "20", "Iron Condor scores maximum (defined risk on both sides). Naked Put scores moderately (can be cash-secured). Naked Call scores lowest (theoretically unlimited upside risk)."],
    ["Directional Fit", "20", "Measures alignment between the strategy's directional exposure and the current market regime. Bullish regime favors Naked Put; bearish favors Naked Call; neutral favors Iron Condor and Short Strangle."],
    ["IV/RV Ratio", "20", "Compares implied volatility (median chain IV) to realized volatility (20D). Ratio > 1.2 indicates rich premium; score scales linearly from 0 at IV/RV = 0.8 to 20 at IV/RV ≥ 1.8."],
    ["Theta", "10", "Absolute daily theta decay of the position per $1 of premium. Higher theta per unit of risk earns a higher score."],
    ["Vega", "10", "Inverse vega exposure score. Lower net vega (less sensitivity to IV changes) earns a higher score, reflecting safer short-vol positioning."],
    ["TOTAL", "100", "Composite score is the sum of all seven dimensions. Strategies are ranked 1–4 with rank 1 being the primary recommendation."],
  ];

  for (const [dim, pts, desc] of methodologyRows) {
    const row = smSheet.addRow([dim, pts, desc]);
    applyDataStyle(row.getCell(1));
    applyDataStyle(row.getCell(2), true);
    applyDataStyle(row.getCell(3));
    row.getCell(3).alignment = { wrapText: true, vertical: "top" };
    row.height = 40;
  }

  // Disclaimer
  smSheet.addRow([]);
  const discRow = smSheet.addRow(["DISCLAIMER", "", "This model is for educational and research purposes only. It does not constitute financial advice. Options involve significant risk of loss. Undefined-risk strategies (Naked Call, Short Strangle) can produce losses far exceeding the premium received. Always consult a qualified financial advisor before trading."]);
  smSheet.mergeCells(`C${discRow.number}:C${discRow.number}`);
  discRow.getCell(1).font = { bold: true, color: { argb: "FFDD2C00" } };
  discRow.getCell(3).font = { italic: true, color: { argb: "FF94A3B8" }, size: 9 };
  discRow.getCell(3).alignment = { wrapText: true, vertical: "top" };
  discRow.height = 50;

  // ── Serialize to base64 ────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer).toString("base64");
}
