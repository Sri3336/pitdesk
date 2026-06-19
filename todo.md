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

## Phase 7: Custom Auth (Manus OAuth Replacement)
- [x] DB migration: add passwordHash, googleId to users table; create passwordResetTokens table
- [x] Update drizzle/schema.ts to reflect new columns
- [x] Add auth DB helpers: createUser, getUserByEmail, getUserById, updateLastSignedIn, upsertGoogleUser, createPasswordResetToken, getValidPasswordResetToken, markPasswordResetTokenUsed, updateUserPassword
- [x] Update context.ts to use JWT cookie verification (remove Manus OAuth dependency)
- [x] Create googleAuth.ts with Google OAuth callback route
- [x] Register Google auth routes in server index.ts
- [x] Replace auth router with full custom auth (register, login, logout, me, googleAuthUrl, requestPasswordReset, resetPassword)
- [x] Update useAuth hook (remove Manus OAuth redirect)
- [x] Update main.tsx (redirect to /signin instead of Manus portal)
- [x] Create AuthGuard component
- [x] Update DashboardLayout (remove Manus login CTA)
- [x] Create SignIn page (split-panel, email/password + Google OAuth)
- [x] Create Register page (password strength indicator)
- [x] Create ForgotPassword page (anti-enumeration)
- [x] Create ResetPassword page (token from URL)
- [x] Update App.tsx routing (public auth routes + protected routes with AuthGuard)
- [x] Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET secrets
- [x] Write vitest tests for all auth procedures (28 tests passing)
- [x] Seed owner account (akulasridhar@gmail.com) with email/password + admin role

## Pending
- [x] Add Google OAuth redirect URI to Google Cloud Console (trading.akulaz.ai/api/auth/google/callback) — manual step for owner (documented in delivery)

## Phase 8: Intraday Scanner (9-Criteria Weighted Scorecard)
- [x] Build server/intradayScanner.ts — 9-criteria engine (Daily Trend 1.5, EMA Stack 15m 1.5, VWAP 1.0, RVOL 1.5, RSI 1.0, Price Structure 1.0, Entry Quality 1.0, Candle Confirm 1.5, ATR Expansion 1.0)
- [x] Add intraday.scan tRPC procedure to routers.ts
- [x] Build client/src/pages/IntradayScanner.tsx — scorecard table, grade badge, direction, scan controls
- [x] Add Intraday Scanner nav item to sidebar (Strategies section)
- [x] Add /intraday-scanner route to App.tsx
- [x] Write vitest tests for intradayScanner.ts (11 tests, 39 total passing)

## Phase 9: Intraday Scanner — Scheduled Scan + 50 Tickers + Email Alerts
- [x] Define 50-ticker watchlist across sectors in shared/intradayTickers.ts
- [x] Add intraday scan results DB table (intraday_scan_results) for history/dedup (+ currentPrice/vwap/atr columns)
- [x] Set up 15-min heartbeat cron (market hours 9:30 AM–4 PM ET) via manus-heartbeat CLI → /api/scheduled/intraday-scan
- [x] Email alert to akulasridhar@gmail.com when any ticker grades A (include full scorecard)
- [x] Add intraday.runFullScan + intraday.getLastScan + intraday.score tRPC procedures
- [x] Update IntradayScanner.tsx — on-demand scan button, last-scan from DB, 50-ticker results table, grade filters, single ticker scorer, auto-scan info banner, watchlist display
- [x] Update PITDESK_CONTEXT.md with scheduled scan details

## Phase 10: Enhancements — Charts, Trade Log, Intraday History
- [x] CandlestickChart.tsx: Add RSI-14 panel below main chart (overbought 70 / oversold 30 reference lines)
- [x] CandlestickChart.tsx: Add MACD panel below RSI (histogram + signal line, color-coded bars)
- [x] CandlestickChart.tsx: Collapsible indicator panels (toggle RSI / MACD on/off)
- [x] TradeLog.tsx: Ticker in trade list is a clickable link → opens /charts?ticker=SYMBOL
- [x] IntradayScanner.tsx: Add "History" tab showing last 8 scan batches with timestamps and grade summaries
- [x] Update options-trading-analyzer-builder skill with latest PitDesk context
- [x] Add intraday.getScanHistory tRPC procedure (group by batch, return grade counts + topA tickers)

## Phase 11: Priority 1 Feature Ports from options-strategy-analyzer

- [x] Port server/analysisEngine.ts (Black-Scholes + 13 strategies + Greeks + IV/RV)
- [x] Port server/excelExport.ts (9-tab Excel workbook export)
- [x] Port server/eventImpact.ts (earnings/FOMC event impact analysis)
- [x] Add analysis_runs DB table + migration
- [x] Add analysis router procedures (run, history, delete, exportExcel)
- [x] Port client/src/pages/Analyzer.tsx (full 1916-line page with 13 strategies)
- [x] Port client/src/components/EventImpactPanel.tsx
- [x] Port shared/tickerUniverse.ts (66-ticker curated universe with sector metadata)
- [x] Port full PCR Dashboard (696-line version with OI baseline, sparklines, TickerDetailDrawer)
- [x] Add pcr_oi_snapshots + pcr_scheduled_results + pcr_alert_settings DB tables
- [x] Add PCR scheduled router procedures (getLatest, getHistory, triggerScan)
- [x] Port client/src/components/TickerDetailDrawer.tsx
- [x] Port server/lib/intradayScorer.ts (self-learning scorer with institutional trap detector)
- [x] Add scan_outcomes + criteria_weights DB tables
- [x] Add intradayScanner router procedures (getBacktestStats, getWeights, updateWeights)
- [x] Add Backtest Stats tab + Weight Sliders tab to IntradayScanner.tsx

## Phase 12: Port Remaining 12 Features + Trade Outcome Recording

### Group A: Strategy Pages
- [x] Port client/src/pages/CatalystBreakout.tsx (BCOS strategy)
- [x] Port client/src/pages/VCPStrategy.tsx + VCP alerts server logic
- [x] Port client/src/pages/IVRAlerts.tsx
- [x] Wire all routes in App.tsx and sidebar nav

### Group B: Analysis + Intelligence Pages
- [x] Port client/src/pages/EarningsCalendarSpread.tsx
- [x] Port client/src/pages/AITradingAgent.tsx (AI chat + trade proposals)
- [x] Port client/src/pages/PerformanceTracker.tsx (P&L curve, win rate, best/worst trades)

### Group C: Data + Reference Pages
- [x] Port client/src/pages/COTDashboard.tsx + COT alerts
- [x] Port client/src/pages/Watchlist.tsx
- [x] Port client/src/pages/TradeProposals.tsx
- [x] Port client/src/pages/BrokerSettings.tsx (E*TRADE -4723, -2738, Schwab)

### Group D: Intraday Deep-Dive
- [x] Port client/src/pages/IntradayTickerDetail.tsx (radar chart + options setup card)
- [x] Port client/src/pages/ScanAll.tsx

### Group E: Trade Outcome Recording
- [x] Add "Record Outcome" button to Intraday Scanner results rows (opens exit price dialog → records win/loss/neutral)
- [x] Wire to intraday.recordOutcome tRPC mutation (via intradayScannerRouter)

## Phase 13: Sidebar Nav, Performance Tracker Quick-Entry, Alert Verification

- [ ] Wire all ported pages into DashboardLayout sidebar nav groups (COT Dashboard, Watchlist, Broker Settings, Scan All, Earnings Calendar, HowTo, Trade Proposals)
- [ ] Add Performance Tracker quick-entry panel (log a closed trade directly from /performance)
- [ ] Verify VCP alert email procedure is wired and sends to akulasridhar@gmail.com
- [ ] Verify IVR alert email procedure is wired and sends to akulasridhar@gmail.com
- [ ] Update options-trading-analyzer-builder skill with Phase 12+13 context
