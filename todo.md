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

## Phase 28 — Option B: Reimagined Navigation (Action-Focused Layout)
- [x] Build ActionLayout.tsx — slim top bar: PitDesk logo (→ /), tool name, All Tools dropdown, Ask Pit Advisor shortcut
- [x] Build /ticker-analysis page — ticker search, TradingView chart, PCR signal, options strategy recommendation, Pit Advisor pre-fill
- [x] Build /day-picks page — auto-runs intraday scan on load, top 5 Grade-A cards with entry/stop/target/direction
- [x] Build /swing-picks page — combined Velez + VCP + BCOS scan results, ranked multi-day setups
- [x] Wire /trade-upload to ActionLayout (remove sidebar)
- [x] Wire /glossary to ActionLayout (remove sidebar)
- [x] Wire /pit-advisor to ActionLayout (remove sidebar)
- [x] Update Home.tsx — add 6th card: Ask Pit Advisor → /pit-advisor
- [x] Update App.tsx — 6 action routes use ActionLayout, /dashboard retains DashboardLayout sidebar
- [x] Add "Back to Home" logo click in DashboardLayout sidebar header
- [x] TypeScript 0 errors check

## Phase 29 — Design System Refactor (ROUTES.ts + pitdesk/ Components)
- [x] Create client/src/lib/routes.ts — ROUTES constants, HOME_ACTIONS array, ALL_TOOLS_MENU array
- [x] Create client/src/components/pitdesk/TradingViewChart.tsx — canonical chart (500px height, key-based remount, no autosize)
- [x] Create client/src/components/pitdesk/AskPitCTA.tsx — canonical Ask Pit Advisor CTA (banner + button variants)
- [x] Create client/src/components/pitdesk/tradingUtils.ts — canonical color/label helpers (gradeColor, gradeStyle, pcrColor, biasColor, ivLabel, ivColor, strategyColor, directionColor, directionIcon, vcpStageLabel, vcpStageColor, scoreColor, scoreStyle)
- [x] Create client/src/components/pitdesk/index.ts — barrel export for all pitdesk components
- [x] Update TickerAnalysis.tsx — import from @/components/pitdesk (ivLabel, ivColor, pcrColor, etc.)
- [x] Update DayTradingPicks.tsx — import gradeStyle, directionColor from @/components/pitdesk; import ROUTES from @/lib/routes; remove inline duplicates
- [x] Update SwingTradingPicks.tsx — import vcpStageLabel, vcpStageColor, scoreStyle from @/components/pitdesk; import ROUTES from @/lib/routes; remove inline duplicates
- [x] Update Home.tsx — import ROUTES and HOME_ACTIONS from @/lib/routes; replace hardcoded card definitions
- [x] Update ActionLayout.tsx — import ROUTES and ALL_TOOLS_MENU from @/lib/routes; replace hardcoded path strings
- [x] Update DashboardLayout.tsx — import ROUTES from @/lib/routes; replace hardcoded "/" navigate call
- [x] TypeScript check: 0 errors
- [x] Production build: clean (12s)
- [x] Skill updated: options-trading-analyzer-builder SKILL.md — Design System section added

## Phase 30 — Account-Aware Trade History + Positions Tracking
- [x] DB: add `account_id` (varchar 32) and `account_label` (varchar 64) to `uploaded_trades` table
- [x] DB: add `account_id` and `account_label` to `trade_upload_batches` table
- [x] DB: create `positions` table (id, userId, accountId, accountLabel, ticker, qty, avgCost, currentPrice, marketValue, unrealizedPnl, unrealizedPnlPct, assetType, notes, uploadedAt)
- [x] DB: create `position_batches` table (id, userId, accountId, accountLabel, filename, rowCount, uploadedAt)
- [x] Drizzle schema.ts: add account fields to uploadedTrades + tradeUploadBatches, add positions + positionBatches tables
- [x] Server: tradeUpload router — accept accountId + accountLabel in parseCsv and confirmUpload; filter myTrades and myBatches by accountId
- [x] Server: positions router — parseCsv (detect qty/avgCost/currentPrice/marketValue/unrealizedPnl columns), confirmUpload, myPositions (with portfolio summary), myBatches, deleteBatch
- [x] Frontend: Upload CSV tab — add account selector dropdown (E*TRADE -4723, E*TRADE -2738, Schwab, + custom) before drop zone
- [x] Frontend: My Trades tab — add account filter pill row (All / per-account), pass accountId to myTrades query
- [x] Frontend: new Positions tab — positions upload zone + current holdings table (ticker, qty, avg cost, current price, market value, unrealized P&L, unrealized P&L%)
- [x] Frontend: Portfolio Summary card at top of Positions tab — total market value, total unrealized P&L, total realized P&L (from trade history), per-account breakdown
- [x] TypeScript: 0 errors
- [x] Production build: clean

## Phase 31 — Trading Psychology & Risk Features (Rajan Daal 33% Rule)

- [x] DB: create `pre_market_checklist_items` table (id, userId, date YYYY-MM-DD, itemKey, label, completed, completedAt)
- [x] DB: create `drawdown_settings` table (id, userId, maxDrawdownPct, riskPerTradePct, totalCapital, updatedAt)
- [x] Server: tradeAnalytics router — losingStreakAnalysis (max streak, avg streak, current streak, streak distribution, risk-per-trade vs Rajan formula)
- [x] Server: tradeAnalytics router — drawdownStats (realized P&L from trade history, unrealized P&L from positions, current drawdown %, daily loss today)
- [x] Server: preMarketChecklist router — todayChecklist, completeItem, resetDay, saveSettings
- [x] Frontend: Losing Streak panel in My Trades tab
- [x] Frontend: new Pre-Market Checklist page (/pre-market)
- [x] Frontend: Drawdown Monitor card on dashboard home
- [x] Sidebar nav: add Pre-Market Checklist under Execution group
- [x] TypeScript: 0 errors
- [x] Production build: clean

## Phase 32 — Systematic Trading Methodology (Monday-Ready)

### DB
- [ ] DB: create `morning_session_trades` table (id, userId, date, ticker, setupType, direction, entryPrice, stopPrice, targetPrice, exitPrice, shares, pnl, status, notes, enteredAt, exitedAt)
- [ ] DB: create `session_settings` table (userId, maxRiskPerTrade, dailyLossLimit, maxTradesPerDay, accountSize)
- [ ] DB: create `swing_watchlist` table (id, userId, ticker, setupType, entryPrice, stopPrice, targetPrice, shares, status, entryDate, exitDate, exitPrice, pnl, notes, dayCount)

### Server
- [ ] Server: morningSession router — addTrade, updateTrade, closeTrade, sessionSummary, getSettings, saveSettings
- [ ] Server: swingWatchlist router — addSetup, updateSetup, closeSetup, getWatchlist, getStats

### Frontend — Morning Session Dashboard (/morning-session)
- [ ] Session header: date, SPY/QQQ bias badge, VIX level, session P&L card, trades taken counter, risk used bar
- [ ] Three setup cards: ORB, Gap & Go, VWAP Reclaim — each with rule reminder tooltip
- [ ] Quick-add trade form: ticker, setup type, direction, entry, stop, target → auto-calculates shares and R/R
- [ ] Active trades table: ticker, setup, entry, stop, target, current P&L, time in trade, close button
- [ ] Session log: all trades for today with outcome badges (Win/Loss/Scratch)
- [ ] Risk enforcement: disable Add Trade when daily loss limit hit or max trades reached

### Frontend — Swing Watchlist (/swing-watchlist)
- [ ] Four setup type tabs: Post-Earnings, Catalyst Breakout, VCP, Gap Fill
- [ ] Add Setup form: ticker, setup type, entry zone, stop, target, account, notes
- [ ] Position sizer: auto-calculates shares from 1.5% account risk rule
- [ ] Active setups table with day count badge (D1 green / D2 amber / D3 red time-stop warning)
- [ ] Closed setups history with win/loss stats per setup type

### Frontend — Pre-Market Checklist Update
- [ ] Item 1: SPY/QQQ bias → sets Long/Short/Flat market bias for the session
- [ ] Item 2: VIX level → shows size reduction rule (>20: -25%, >25: skip ORB)
- [ ] Item 3: Gappers scan — input field for top 3 gap candidates with catalyst notes
- [ ] Item 4: Earnings calendar — any holdings reporting today?
- [ ] Item 5: Account P&L gate — if down >1% this week, confirm reduced risk mode
- [ ] Item 6: Watchlist ready — 3-5 tickers with OR levels pre-marked

### Nav & Build
- [ ] Sidebar nav: add Morning Session and Swing Watchlist under new "Session" group
- [ ] All Tools menu: add both new pages
- [ ] TypeScript: 0 errors
- [ ] Production build: clean

## Phase 33 — AJ Liquidity Hunting Features

- [ ] DB: add `liquidity_zones` table (id, userId, ticker, zoneType, priceLevel, priceLevelHigh, notes, isActive, createdAt)
- [ ] DB: add `liquidity_context` column (varchar 64) and `near_retail_zone` (tinyint) to `morning_session_trades`
- [ ] Server: liquidityMap router — addZone, editZone, deleteZone, listByTicker, listAll
- [ ] Server: morningSession.addTrade — accept liquidityContext and nearRetailZone fields
- [ ] Frontend: Morning Session Log Trade dialog — add "Near Retail Zone?" toggle + zone type selector + context note
- [ ] Frontend: Liquidity Map page (/liquidity-map) — per-ticker zone manager, zone type badges, active/archived toggle
- [ ] Sidebar nav: add Liquidity Map under Execution group
- [ ] All Tools menu: add Liquidity Map entry
- [ ] TypeScript: 0 errors
- [ ] Production build: clean

## Phase 34 — Live Pre-Market Intelligence Checklist

- [ ] Server: preMarketIntel procedure — VIX live price + label from Tradier
- [ ] Server: preMarketIntel — SPY/QQQ pre-market % change from Tradier
- [ ] Server: preMarketIntel — top 5 gap-up and gap-down tickers from Tradier screener
- [ ] Server: preMarketIntel — today's realized P&L and weekly P&L from uploaded_trades DB
- [ ] Server: preMarketIntel — active swing watchlist setups with day counter from DB
- [ ] Server: preMarketIntel — risk sizing auto-calc from drawdown_settings
- [ ] Server: preMarketIntel — liquidity zones within 1.5% of price for watchlist tickers
- [ ] DB: add mindset_score (int 1-5) column to pre_market_checklist_items
- [ ] Frontend: VIX panel — live price, color label, size-reduction warning if VIX > 25
- [ ] Frontend: SPY/QQQ panel — pre-market % change with trend arrow
- [ ] Frontend: Top Gappers panel — 5 gap-up + 5 gap-down chips, click to pre-fill Morning Session
- [ ] Frontend: Account P&L Gate panel — today's P&L, weekly P&L, daily limit progress bar
- [ ] Frontend: Swing Watchlist Review panel — active setups with day counter badges
- [ ] Frontend: Risk Sizing panel — auto-calculated max risk per trade and total exposure
- [ ] Frontend: Liquidity Zones panel — zones within 1.5% of price for watchlist tickers
- [ ] Frontend: Mindset Check panel — 1-5 emoji scale, logged over time with history sparkline
- [ ] TypeScript: 0 errors
- [ ] Production build: clean

## Phase 35 — Steven Dux Features
- [ ] Server: duxScanner procedure — Tradier screener filtered to up ≥20%, pre-mkt vol ≥1M, price >$3, mktcap <$1B, float <100M
- [ ] Server: perfectTrader procedure in morningSession router — compare actual P&L vs ideal (entry at OR high, exit at 2× range)
- [ ] Server: lastTradeResult helper in morningSession router — returns whether last trade was a loss and recommended size-down amount
- [ ] Frontend: Dux Scanner tab on Velez Scanner page — 5-filter results table with ticker, price, gap%, pre-mkt vol, float, mktcap, short bias label
- [ ] Frontend: Perfect Trader Calculator panel in Morning Session History tab — actual P&L vs ideal P&L, execution score %, gap chart
- [ ] Frontend: Size-Down Rule banner in Morning Session Log Trade dialog — amber warning when last trade was a loss, auto-reduces suggested size by 50%
- [ ] TypeScript: 0 errors
- [ ] Production build: clean

## Phase 36 — Dux Scanner Visual + Audio Alert System
- [x] Frontend: Poll duxScanner.scan every 30s when Dux tab is active + alerts are enabled (refetchInterval)
- [x] Frontend: useRef<Set<string>> to track previously-passing tickers across polls
- [x] Frontend: useEffect detects newly-passing tickers on each poll result (skip first load)
- [x] Frontend: playDuxAlertSound() — Web Audio API, three ascending tones (660→880→1100 Hz), no external files
- [x] Frontend: toast.success() per new ticker with symbol, gap%, volume ratio, price, bias
- [x] Frontend: Persistent alert history banner in DuxScannerTab header (last 10 alerts, dismissible per-ticker + clear all)
- [x] Frontend: Auto-alerts toggle Switch + audio mute button in DuxScannerTab header
- [x] Frontend: Green pulse dot "Auto-scanning every 30 seconds" status indicator
- [x] TypeScript: 0 errors
- [x] Production build: clean

## Phase 37 — Historical Price Data Store (5-Year OHLCV for Backtesting)
- [x] DB: create `price_bars` table (id, ticker, date, open, high, low, close, volume, adjClose, interval, source, fetchedAt)
- [x] DB: create `price_download_jobs` table (id, ticker, status, barsDownloaded, errorMsg, startedAt, completedAt)
- [x] Server: historicalData router — startBulkDownload (queues all 212 tickers), getDownloadStatus (per-ticker progress), queryBars (ticker + date range → OHLCV rows), exportCsv (ticker list → CSV string), getUniverseSummary (count bars per ticker)
- [x] Server: bulk download logic — fetch 5yr daily bars from YahooFinance via callDataApi, upsert into price_bars, update job status
- [x] Frontend: HistoricalData.tsx page — universe checkboxes, Start Download button, live progress table (ticker, status, bars, error), summary stats card, CSV export panel
- [ ] Frontend: per-ticker mini chart preview (last 30 bars sparkline) in the data explorer [deferred]
- [x] Frontend: CSV export — select tickers + date range → download combined CSV
- [x] Route /historical-data in App.tsx
- [x] Sidebar nav: add Historical Data under Data & Settings group
- [x] TypeScript: 0 errors
- [x] Production build: clean

## Phase 38 — Strategy Backtester + Position Sizer

- [x] DB: backtest_runs and backtest_trades tables created
- [x] Server: backtester engine (server/backtester.ts) — Dux 5-filter + Velez pullback signal detection on stored OHLCV bars
- [x] Server: backtesterRouter — runBacktest, getRunStatus, getRunTrades, listRuns, deleteRun
- [x] Server: historicalDataRouter — startBulkDownload, getDownloadStatus, getUniverseSummary, resetJobs, exportCsv, queryBars
- [x] Frontend: Backtester.tsx — strategy selector, parameter controls, equity curve, win-rate stats, trades table
- [x] Frontend: PositionSizer.tsx — fixed-risk + Kelly sizing calculator
- [x] Frontend: HistoricalData.tsx — download/progress/export
- [x] Routes /backtester, /position-sizer, /historical-data in App.tsx
- [x] Sidebar nav: Backtesting group with all three pages
- [x] TypeScript: 0 errors

## Sri's Playbook + Portfolio Tracker
- [x] DB schema: account_snapshots, playbook_positions, monthly_pnl tables
- [x] tRPC router: playbook.ts (saveSnapshot, getLatestSnapshots, addPosition, closePosition, deletePosition, upsertMonthlyPnl, getMonthlyPnl)
- [x] Frontend: SriPlaybook.tsx — 3-account summary cards, monthly target progress bar, open positions book, playbook rules, trade history
- [x] Sidebar nav: "Sri's Playbook" group with "Playbook & Tracker" link at /sri-playbook
- [x] Route: /sri-playbook wired in App.tsx
- [x] Baseline data seeded: Jun 29 EOD snapshots for all 3 accounts, 7 open positions, June monthly P&L

## Phase 39 — Weekly Top 10 Ticker Picks
- [ ] Server: weeklyPicksRouter — getWeeklyTopTickers procedure (Tradier IV + volume + LLM fundamental note)
- [ ] Server: Register weeklyPicksRouter in routers.ts
- [ ] Frontend: "Weekly Picks" tab in SriPlaybook.tsx with top 10 cards (IV Rank badge, volume, AI note, Add to Watchlist)

## Phase 40 — Auto Trade Analysis
- [ ] Server: analyzePosition procedure in playbook.ts (takes position data, calls invokeLLM, returns structured analysis)
- [ ] Frontend: Analysis popup after "Add Position" form submit in SriPlaybook.tsx
- [ ] Frontend: "🔍 Analyze" button on each Trade Log row in SriPlaybook.tsx
- [ ] Frontend: Analysis modal with summary, max profit/loss/breakeven, playbook fit check (✅/❌), key risks

## Phase 39 — Weekly Top 10 Picks + Auto Trade Analysis (Jul 5 2026)
- [x] weeklyPicks.ts router — score 50 S&P 500 candidates by IV Rank + options liquidity, AI fundamental notes, 4h cache
- [x] weeklyPicks.refreshCache mutation — force-clear the cache
- [x] playbook.analyzePosition mutation — AI-powered trade breakdown (summary, max P/L, breakeven, playbook fit, risks, buddy take)
- [x] Register weeklyPicksRouter in routers.ts
- [x] Weekly Picks tab in SriPlaybook — 10-card grid, IV status badges, score, AI notes, refresh button
- [x] Analyze button on each Open Position card
- [x] TradeAnalysisModal — auto-runs on open, shows full AI analysis with playbook fit check

## Phase 40 — ICT Pro-Trend Supply Zone Scanner
- [x] Build ictSupplyZone.ts server router with full scanner engine
- [x] Supply zone identification (swing high + strong reversal detection)
- [x] Asian range detection (consolidation below POI)
- [x] London inducement detection (price inside zone)
- [x] Stop placement: zone high + 0.5× ATR buffer
- [x] Take-profit targets: T1 = Asian range low, T2 = previous swing low
- [x] R:R calculation (T1 and T2)
- [x] Position sizing (1% risk, configurable account size)
- [x] Zone freshness + strength scoring
- [x] Trend detection (EMA20 vs EMA50)
- [x] Zone invalidation rules
- [x] Register ictSupplyZoneRouter in routers.ts
- [x] Build ICTSupplyZone.tsx UI page with full trade math panel
- [x] Add ICT Supply Zone to sidebar nav (Strategies section)
- [x] Add route /ict-supply-zone in App.tsx

## Phase 41 — Locked Month-Start Baseline Capital
- [x] Add month_start_capital column to eod_capital_snapshots schema
- [x] Apply ALTER TABLE migration via webdev_execute_sql
- [x] Update captureEodSnapshot to lock monthStartCapital on first snapshot of month
- [x] Preserve existing monthStartCapital on subsequent snapshots (never overwrite)
- [x] Update getAdjustedPnl to return monthStartCapital and monthStartCapitalDate
- [x] Update SriPlaybook: monthlyTarget now uses locked monthStartCapital (not live totalCapital)
- [x] Monthly Target card shows "Base: $X · locked" when baseline is set
- [x] Progress bar shows "Base locked @ $X on YYYY-MM-DD" pill badge
- [x] Progress bar shows drawdown/gain vs month-start (red warning if down, green if up)
- [x] Progress bar footer shows "(fixed)" vs "(live)" to indicate target type
- [x] Backfill July 2026 existing snapshots with locked baseline from earliest July snapshot

## Phase 42 — EMA Pullback Scanner + Landing Page Nav
- [x] Build emaPullback.ts server router (200/50 EMA + RSI + reversal candle + options bias)
- [x] Register emaPullbackRouter in routers.ts
- [x] Add EMA Pullback nav item to DashboardLayout sidebar (Strategies section)
- [x] Add /ema-pullback route to App.tsx
- [x] Build EMAPullbackScanner.tsx UI page (signal cards, trade math, options bias)
- [x] Add persistent TopNavBar to Home.tsx with quick links to 7 most-used tools
- [x] Add QuickAccessGrid to Home.tsx (all 36 features, filterable by group)

## Phase 43 — 6 Tops Pattern Library + Scanner Integration
- [ ] Build shared topPatterns.ts detection engine (H&S, Double Top, Triple Top, Rounding, Rising Wedge, Broadening Top)
- [ ] Build ChartPatterns.tsx reference page with SVG diagrams + plain-English education + Learn mode
- [ ] Wire pattern detection into EMA Pullback Scanner signal cards
- [ ] Wire pattern detection into ICT Supply Zone signal cards
- [ ] Add /chart-patterns route to App.tsx
- [ ] Add Chart Patterns to sidebar nav (Analysis section)

## Phase 43 — 6 Tops Pattern Library + Pattern Detection in Scanners
- [x] Build shared top-pattern detection engine (server/topPatterns.ts)
- [x] Build ChartPatterns reference page with SVG diagrams and Learn mode (client/src/pages/ChartPatterns.tsx)
- [x] Add detectPattern procedure to emaPullback router
- [x] Wire PatternBadge into EMA Pullback Scanner signal cards
- [x] Wire PatternBadge into ICT Supply Zone signal cards
- [x] Add Chart Patterns to sidebar nav and App.tsx route

## Phase 44 — Theta Machine (Calendar Spreads & Iron Butterfly)
- [x] Server router: thetaMachine.ts with buildCalendar, buildIronButterfly, scan, getExpirations procedures
- [x] findTargetDeltaContract helper for scan procedure
- [x] scan procedure: scans multiple tickers for NEUTRAL/BULLISH/BEARISH/EARNINGS_BUTTERFLY modes
- [x] ThetaMachine.tsx UI: tent P&L SVG diagram, iron butterfly P&L diagram
- [x] 4 tabs: Neutral / Bullish / Bearish / Earnings Butterfly
- [x] Signal cards with full trade math (debit, max profit, theta differential, breakevens)
- [x] Learn mode toggle with plain-English explanations
- [x] Single-ticker manual builder with expiry selector
- [x] Sidebar nav entry + App.tsx route
- [x] TypeScript clean, 45 tests passing

## Phase 45 — Decision Bench (Two-Stage Pre-Trade Workflow)
- [x] DB schema: decision_bench_watchlist + trade_voice_journal tables, migration applied
- [x] Server router: decisionBench.ts with 10 procedures (getWatchlist, seedDefaultWatchlist, addTicker, removeTicker, checkSectorConcentration, runMorningScan, runPreTradeGate, uploadAudioAndTranscribe, saveVoiceJournal, getVoiceJournals)
- [x] 20-ticker default watchlist seeded across 8 sectors (Memory/Storage, Semiconductors, AI Servers, AdTech/Mobile, Cloud/Software, Financials, Healthcare/Biotech, High Volatility)
- [x] Morning Scan: scans all watchlist tickers, fetches IV rank + price + EMA trend, ranks by score, returns top 3 setups
- [x] Pre-Trade Gate: 5-gate check (Market Context, Technical Setup, IV/Catalyst, Strategy Math, Playbook Rules) → GO / WAIT / NO-GO verdict
- [x] DecisionBench.tsx UI: 3 tabs (Watchlist Manager, Morning Scan, Pre-Trade Gate)
- [x] Sector concentration alert wired into SriPlaybook AddPositionDialog
- [x] Voice Journal tab added to SriPlaybook: MediaRecorder recording, Whisper transcription, AI rationale/risk extraction, journal history
- [x] Sidebar nav entry (Crosshair icon) + App.tsx route /decision-bench
- [x] 11 unit tests for EMA helper, gate verdict logic, sector concentration (56 total passing)
- [x] TypeScript clean (0 errors)
