# PitDesk — Fibonacci Suite TODO

## Phase 1: DB Schema + Server Infrastructure
- [x] DB schema: fib_ema_alerts, fib_ema_alert_history, manual_trades tables
- [x] Fibonacci engine (fibEngine.ts): retracement levels, extension levels, EMA calc, confluence detection
- [x] Velez scanner server logic (velezScanner.ts): price history fetch, swing high/low, Fib + EMA overlay
- [x] Trade log DB helpers + tRPC router
- [x] Fib+EMA alert router (fibAlerts router in routers.ts)
- [x] Email helper (email.ts) with buildFibEmaAlertEmail
- [x] PCR ticker list (shared/tickers.ts — 60 tickers)

## Phase 2: Platform Shell
- [x] DashboardLayout with full sidebar nav (Analysis, Strategies, Alerts, Execution, Reference groups)
- [x] App.tsx routes for all pages (lazy-loaded)
- [x] PitDesk branding (green accent #22c55e, TrendingUp logo icon)
- [x] Home/Dashboard page with Fibonacci Suite highlight card

## Phase 3: Velez Scanner Page
- [x] VelezScanner.tsx: daily tab with Fib retracement overlay (23.6%, 38.2%, 50%, 61.8%, 78.6%)
- [x] VelezScanner.tsx: Fib extension targets (127.2%, 161.8%, 261.8%) in expandable panel
- [x] VelezScanner.tsx: Fib+EMA confluence flag (within configurable % of both Fib level AND major EMA)
- [x] VelezScanner.tsx: intraday 5-min tab
- [x] VelezScanner.tsx: EMA values (9, 20, 50, 200) in expandable panel
- [x] VelezScanner.tsx: confluence threshold slider

## Phase 4: Trade Log Page
- [x] TradeLog.tsx: entry form with Fib extension auto-suggestions (127.2%, 161.8%, 261.8% from entry + swing low)
- [x] TradeLog.tsx: "Apply Fib Targets to T1 & T2" button
- [x] TradeLog.tsx: trade list with journal/lessons learned
- [x] TradeLog.tsx: close trade flow with P&L calculation
- [x] TradeLog.tsx: stats bar (open trades, total, realized P&L)

## Phase 5: Fib+EMA Confluence Alert Page
- [x] FibEmaAlerts.tsx: scan 60 PCR tickers for Fib 38.2%-61.8% + EMA confluence
- [x] FibEmaAlerts.tsx: configurable proximity threshold + Fib level + EMA period toggles
- [x] FibEmaAlerts.tsx: alert configuration (email + push) with Switch toggles
- [x] FibEmaAlerts.tsx: alert history table
- [x] FibEmaAlerts.tsx: 3 tabs (Scan Results / Alert Configs / Alert History)

## Phase 6: Remaining Pages + Tests
- [x] PCRDashboard.tsx stub page with PCR router
- [x] Analyzer.tsx stub page
- [x] fibEngine.test.ts: 14 tests covering all Fib functions (all passing)
- [x] auth.logout.test.ts: 1 test (passing)
- [x] TypeScript check: 0 errors
- [x] Checkpoint save
