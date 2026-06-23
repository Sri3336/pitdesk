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

- [x] Wire all ported pages into DashboardLayout sidebar nav groups (COT Dashboard, Watchlist, Broker Settings, Scan All, Earnings Calendar, HowTo, Trade Proposals)
- [x] Add Performance Tracker quick-entry panel (Log Trade dialog with recommendations.add tRPC procedure)
- [x] Verify VCP alert email procedure is wired and sends to akulasridhar@gmail.com
- [x] Verify IVR alert email procedure is wired and sends to akulasridhar@gmail.com
- [x] Update options-trading-analyzer-builder skill with Phase 12+13 context

## Phase 15: Real Options Chain Data + COI Delta Signal Engine

- [x] Rebuild fetchOptionsChain() in pcrScheduler.ts to use real Tradier options API — actual put/call OI per strike, 7-strike ATM window
- [x] Rebuild runEodSnapshot() to save real totalPutOI and totalCallOI from live Tradier options chain
- [x] Rebuild runIntradayScan() COI imbalance signal: 7-strike ATM window, call%/put% split, imbalance threshold
- [x] Add tradierClient.ts with analyzeCoiImbalance() — ATM strike selection, expiry filter, delta hints
- [x] Add COI columns to pcr_scheduled_results schema (coiCallPct, coiPutPct, coiImbalancePct, coiSignal, atmStrike, isExpiryDay, isExpiryEve, atmCallDelta, atmPutDelta, expiration)
- [x] Update PCR Strategy scan results UI — COI imbalance bar, ATM strike badge, expiry warning, VWAP entry hint
- [x] Add TRADIER_API_KEY secret and validate with live tests (42 tests passing)
- [x] Verified live COI pipeline: AAPL $298.01, ATM $297.50, 7-strike window, real OI from Tradier
- [x] Add Top COI Signals summary card at top of 11:30 AM scan results (coiImbalancePct >= 45%, sorted by strength, with imbalance bar, ATM strike, delta, VWAP entry hint, expiry badges)

## Phase 16: Signal Board PCR Strategy Page Rewrite

- [x] Reimagine PCR Strategy page as "Signal Board" (Option C) — heat map grid with sector grouping, slide-in detail panel, slim top bar with scan controls
- [x] HeatCell component — color-coded by COI signal (BUY_CALL green, BUY_PUT red, PCR fallback), COI split mini-bar, expiry badge, strong-signal glow dot
- [x] DetailPanel component — slide-in from right, COI split bar, ATM strike/delta/expiry grid, VWAP entry hint, PCR sentiment section
- [x] ScanDetailTab — date selector from getScanRunDates, detail table with sector/signal filters, sort by delta/signal/pcr
- [x] HistoryTab — last N scan runs with processed/actionable counts and top signals
- [x] PCR Alert Settings Tab — unchanged from prior version
- [x] PCRTrendChart tab — named import fix (was default, now named export)
- [x] Fix TypeScript errors: getScanRunDetail { date } → { runDate }, PCRTrendChart named import, Set spread → Array.from(new Set(...)), void mutations .mutate() not .mutate({})
- [x] 0 TypeScript errors, 42 tests passing

## Phase 17: PCR Baseline Backfill

- [x] Write scripts/backfill-pcr-baseline.mjs — reads PCR_Baseline_raw_metrics_20260512.json, inserts 22 tickers into pcr_oi_snapshots (EOD) and pcr_scheduled_results (intraday_scan + eod_snapshot) for 2026-05-12
- [x] Run backfill script — 22 pcr_oi_snapshots inserted, 22 pcr_scheduled_results (intraday_scan) + 22 (eod_snapshot) inserted for 2026-05-12
- [x] Verified DB: SOXL PCR=2.04 (EXTREME_FEAR), FAS PCR=1.22 (FEAR), INTC PCR=1.18 (FEAR), AAPL PCR=0.28 (EXTREME_GREED), UNH PCR=0.17 (EXTREME_GREED)
- [x] PCR Trend chart and History tab now have baseline data from 2026-05-12

## Phase 18: Opening Range Scalper + Intraday Cron

- [x] Server: openingRangeScalper.ts — ATR gate (≥25% Daily ATR), opening range box, reversal candle detection (Hammer/InvHammer/Engulfing), 90-min window
- [x] DB: no separate table needed — scan is stateless/on-demand for caching scan results
- [x] tRPC: openingRangeScalper router (scan, getResults, getHistory)
- [x] UI: Opening Range Scalper tab in VelezScanner.tsx (3rd tab alongside Daily/Intraday 5-min)
- [x] UI: Alert cards — ticker, direction (LONG/SHORT), TP1/TP2, stop, ATR gate status, reversal pattern
- [x] Cron: PCR Intraday Scan already active (every 15min 9:30-4pm ET Mon-Fri, task_uid: 5BA9VMik7wD5g6x7DaqQqE) at 15:30 UTC (Mon-Fri) via manus-heartbeat CLI

## Phase 19: ORS Next Steps

- [x] ORS How-To video — narration (5m 44s, 6 sections) + 6 slides + composed + uploaded to Google Drive (PitDesk How-To Videos folder)
- [x] Log Trade button on ORS SETUP_READY rows — navigates to /trade-log with URL params; TradeLog reads params and auto-opens pre-filled AddTradeDialog
- [x] ORS dedicated sidebar entry under STRATEGIES section (/velez-scanner?tab=ors)

## Phase 20: UI Bug Fixes (from comprehensive test)

- [x] M1: Velez Scanner How-To — thumbnail-first modal already implemented and confirmed working
- [x] M3: IVR Alerts — added isError + retry:1; shows Retry button on error instead of infinite spinner
- [x] M4: Performance Tracker — added isError + retry:1; shows Retry button on error instead of infinite spinner
- [x] U1: Dashboard banner replaced with Opening Range Scalper highlight card
- [x] U2: Added /options-analyzer and /ai-agent redirect routes in App.tsx
- [x] U3: Performance Tracker subtitle fixed to say "Your"
- [x] U4: PCR board empty-state copy updated to reference Intraday Scan button
- [x] U6: Dashboard Quick Access updated to 8 cards in 4-column grid (PCR, Velez, ORS, VCP, Analyzer, Trade Log, Catalyst Watch, IVR Alerts)

## Phase 21: Previous Range Pullback (PRP) Scanner

- [x] Server: previousRangeScanner.ts — swing detection, BOS detection, retracement % calc, EMA21 alignment, R:R
- [x] tRPC: previousRange.scan procedure wired in routers.ts
- [x] UI: PRP 4th tab in VelezScanner.tsx — PRIME/IN ZONE/WATCHING status, EMA21 badge, days since BOS, 30/50/70% levels, Log Trade button
- [x] Sidebar: PRP kept inside Velez Scanner tabs (4th tab) — no separate sidebar entry needed

## Phase 22: ORS YouTube Embed + COI Email Digest + PRP How-To Video

- [x] ORS How-To YouTube embed — add thumbnail-first modal to ORS tab (placeholder until YouTube ID provided)
- [x] COI signal email digest — send email to akulasridhar@gmail.com when intraday scan finds ticker with ≥45% COI imbalance (BUY CALL/BUY PUT setups with ATM strike, delta, VWAP entry hint)
- [x] PRP How-To video — TTS narration (6 sections ~30s each), 6 visual slides, compose with ffmpeg
- [x] PRP How-To video — upload to Google Drive PitDesk How-To Videos folder
- [x] PRP How-To modal — thumbnail-first YouTube embed in PRP tab (placeholder until YouTube ID provided)

## Phase 23: CSV Trade Upload + Community Insights + Pit Advisor

### CSV Trade Upload
- [x] Add `uploaded_trades` DB table (userId, ticker, tradeDate, side, qty, entryPrice, exitPrice, pnl, pnlPct, strategy, notes, source, batchId, isAnonymized)
- [x] Add `trade_upload_batches` DB table (userId, filename, rowCount, status, createdAt)
- [x] tRPC `tradeUpload.parseCsv` — parse CSV text, auto-detect columns, return preview rows
- [x] tRPC `tradeUpload.confirmUpload` — save parsed rows to uploaded_trades for user
- [x] tRPC `tradeUpload.myTrades` — list current user's uploaded trades with P&L summary
- [x] tRPC `tradeUpload.communityInsights` — aggregated anonymized insights per ticker (win rate, avg pnl%, top strategy, trade count)
- [x] tRPC `tradeUpload.deleteBatch` — delete a batch of user's uploaded trades
- [x] Frontend: TradeUpload.tsx — drag-drop CSV zone, column mapping step, preview table, confirm button
- [x] Frontend: My Trades tab — P&L summary cards, trade table with filter/sort
- [x] Frontend: Community Insights tab — win-rate heatmap, top tickers by community activity
- [x] Route /trade-upload in App.tsx
- [x] Sidebar nav entry under Execution section

### Pit Advisor (AI Research Assistant)
- [x] tRPC `pitAdvisor.chat` — non-streaming LLM with PitDesk system prompt (5-dimension: Technical, Fundamental, Geopolitical, Sentiment, Quant/Math)
- [x] tRPC `pitAdvisor.analyzeMyTrades` — AI analysis of user's uploaded CSV trades (win rate, patterns, lessons)
- [x] System prompt: Trading Buddy persona, proactive, challenges bad setups, speaks plainly
- [x] Context injection: PCR signals, ORS setups, VCP alerts, recent trade log entries
- [x] Frontend: PitAdvisor.tsx — full-page chat using AIChatBox component
- [x] Suggested prompts: "Analyze my uploaded trades", "What's the PCR signal for NVDA?", "Is TSLA a good options play this week?", "Review my last 5 trades", "What strategies work best for PLTR?"
- [x] Context sidebar panel: active scanner signals, recent PCR extremes, uploaded trade summary
- [x] Route /pit-advisor in App.tsx
- [x] Sidebar nav entry at top of Analysis section

## Phase 24: Full Trade History in Pit Advisor + Day-of-Week Analysis + Back-fill Entry Time

- [x] Pit Advisor: "Include My Trades" toggle sends full uploaded_trades + manual_trades history to AI context
- [x] Day-of-Week analysis panel in Trade Log (win rate/P&L by weekday, color-coded, Okala insight tip)
- [x] Inline entry time back-fill on every Trade Log row (clock icon → inline time input → save)
- [x] Backend: trpc.trades.dayOfWeek procedure in routers.ts
- [x] Backend: trpc.trades.updateEntryTime procedure in routers.ts + updateEntryTime helper in db.ts
- [x] PITDESK_CONTEXT.md updated with all new features, domain setup, Okala strategy, Pit Advisor details

## Phase 25: Skill Save + Liquidity Sweep Flag

- [x] Update options-trading-analyzer-builder SKILL.md with all new PitDesk features
- [x] Add Liquidity Sweep Flag to Velez Scanner daily results (swept PDH/PDL column)
- [x] Add Liquidity Sweep Flag to Velez Scanner intraday results
- [x] Add Liquidity Sweep Flag to BCOS Catalyst Watch scan results
- [x] Backend: add PDH/PDL sweep detection to velezScanner.ts and catalystBreakout router

## Phase 26: Sweep Confluence Score + TradingView Chart + Pit Advisor Trade Button

- [x] Add Sweep Confluence Score to Velez Scanner — auto-flag A+ when signal fires AND ticker swept PDH/PDL same day
- [x] Add NQ Futures TradingView mini-chart to Okala 80/20 panel (200-second chart via TradingView widget)
- [x] Add Pit Advisor Chat button to each Trade Log row — pre-fills chat with trade ticker, date, P&L, strategy
- [x] Pass pre-filled trade context from Trade Log to Pit Advisor via URL params

## Phase N+1: Three Suggested Features
- [x] Trade Replay: Add mini TradingView iframe chart dialog to closed Trade Log rows (zoom to entry/exit date range)
- [x] PCR Dashboard: Add "Ask Pit Advisor" button to each ticker row (pre-fills chat with PCR signal context)
- [x] Weekly Briefing: Heartbeat cron every Sunday 7 PM ET — LLM generates market outlook email, sends to akulasridhar@gmail.com

## Phase 27: Three Enhancements — Options Flow, Post-Market Debrief, EAS Build

- [x] Options Flow / Dark Pool screen: server/routers/optionsFlow.ts (Tradier options chains, unusual score)
- [x] Options Flow / Dark Pool screen: client/src/pages/OptionsFlow.tsx (filter/sort UI, Ask Pit Advisor per row)
- [x] Options Flow: add route /options-flow in App.tsx + sidebar nav item (DATA & SETTINGS section)
- [x] Post-Market Debrief: server/scheduledPostMarketDebrief.ts (weekday 4:30 PM ET heartbeat, LLM debrief email)
- [x] Post-Market Debrief: register heartbeat endpoint in server/_core/index.ts
- [x] Post-Market Debrief: server/setupPostMarketJob.ts (one-time heartbeat registration script)
- [x] EAS build config: pitdesk-mobile/eas.json (production profile for iOS + Android)
- [x] EAS build config: pitdesk-mobile/.easignore
- [x] Update PITDESK_CONTEXT.md with new features
- [x] TypeScript check: 0 errors
- [x] Checkpoint save
