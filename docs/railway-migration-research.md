# PitDesk Railway Migration — Verified Provider Facts

## Railway deployment and operations

- **Regions:** Railway lists a US East Metal region in Virginia (`us-east4-eqdc4a`). This is the preferred initial region for PitDesk because its primary user, brokers, and market-data usage are US-based.
  - Source: https://docs.railway.com/deployments/regions
- **Cron:** Railway cron schedules are UTC, use five-field cron expressions, have a five-minute minimum frequency, and jobs must exit cleanly after completion. This supports PitDesk's existing 15-minute intraday scanner and daily/weekly jobs.
  - Source: https://docs.railway.com/cron-jobs
- **MySQL:** Railway's MySQL template deploys the official MySQL Docker image with private connection variables. Railway describes these templates as unmanaged, so PitDesk must own monitoring, logical backup, and recovery verification.
  - Source: https://docs.railway.com/guides/mysql
- **Backups:** Railway volume backups support daily, weekly, and monthly schedules. Restores stay within the same Railway project/environment, and Railway labels the feature as still under development. PitDesk needs an independent logical backup copy in separate object storage.
  - Source: https://docs.railway.com/volumes/backups
- **Health checks:** Railway waits for a configured endpoint to return HTTP 200 before activating a new deployment; it injects `PORT` for the app and health checks. PitDesk needs a lightweight `/health` endpoint.
  - Source: https://docs.railway.com/deployments/healthchecks
- **Configuration:** Railway accepts `railway.json` / `railway.toml` config in source but marks Config as Code deprecated in favor of Infrastructure as Code. Avoid relying on legacy config files long-term; maintain a deployment runbook and migrate to the supported IaC workflow before the documented Dec. 1, 2026 retirement date.
  - Source: https://docs.railway.com/config-as-code/reference

## Pricing inputs used for planning (retrieved Aug. 21, 2026)

- Railway Hobby has a $5 monthly minimum with $5 usage included. Published usage rates: $0.00000386 per GB-second of memory, $0.00000772 per vCPU-second, $0.00000006 per GB-second for volumes, and $0.015 per GB-month for object storage.
  - Source: https://railway.com/pricing
- DigitalOcean Basic Droplet 2 GB / 1 vCPU pricing: $12 per month. Weekly backups are 20% of Droplet cost. DigitalOcean managed single-node MySQL starts at $15/month; two-node high availability starts at $60/month.
  - Sources: https://www.digitalocean.com/pricing/droplets and https://docs.digitalocean.com/products/databases/mysql/details/pricing/
- Render Starter web service: $7/month. Cron jobs are billed from $0.00016/minute for 512 MB / 0.5 CPU; planning used $1/month minimum per cron service. Render does not provide MySQL in its published managed-database offering, so any MySQL deployment must be external.
  - Source: https://render.com/pricing

## PitDesk migration inventory

- Current code stack: React + Vite frontend; Express + tRPC Node backend; Drizzle + MySQL.
- Current platform-specific substitutions needed: Yahoo data gateway, LLM gateway, email/push notification gateway, S3 storage proxy, platform heartbeat cron endpoints.
- Current database: 56 tables; approximately 27 MB. `price_bars` is largest (225,139 rows / 23.83 MB), followed by `intraday_scan_results` (12,473 rows / 2.08 MB) and `uploaded_trades` (8,328 rows / 1.22 MB).
- Current active jobs: 15-minute intraday scanner on weekdays; two weekday post-close data jobs; Sunday weekly briefing.
- Current repository assets reference Manus-hosted storage in: `PitDeskLogo.tsx`, `Analyzer.tsx`, `COTReference.tsx`, and `LandingPage.tsx`; copy these to independent object storage before production cutover.

## Railway staging project state — Aug. 22, 2026

- Owner created private source repository: `https://github.com/Sri3336/pitdesk`.
- The `main` branch has 154 commits; source push verified at commit `4c2f9eaae621f173120cad70718d026ac4adc850` before subsequent external-build preparation updates are pushed.
- A temporary repository-specific SSH deploy key was used for that one source push and removed from both GitHub and the migration environment immediately afterward.
- Railway project created by source selection: `adaptable-creation` (project ID `025dc8de-4531-4f78-b411-dcb3fbd23050`). It contains a single service, `pitdesk`, in the initial environment currently named `production` (this remains staging-only; no production DNS or database connection has been changed).
- The initial Railway service uses Railpack with Node 24.19.0, is currently building the pre-external-build source commit, starts unexposed, has a default US West / California region, 1 replica, and plan limits of 2 vCPU / 1 GB. Before exposure it must be switched to US East / Virginia, receive `PITDESK_EXTERNAL_HOST=true`, `build:external`, `pnpm start`, and health-check `/health` configuration.

## Market-data portability validation — Aug. 22, 2026

- The direct Yahoo-compatible endpoint adapter is implemented strictly as a staging fallback. A live validation request to both `v8/finance/chart` and `ws/insights/v1/finance/insights` returned `Edge: Too Many Requests`; it must not be the sole production source.
- Tradier is the approved credentialed fallback because PitDesk already has a brokerage integration and the official market-data API provides historical OHLCV data, quote data, and 1/5/15-minute time-and-sales bars. Official limits documented as of this review: 1-minute data up to 20 open-market days / 10 all-market days; 5-minute and 15-minute data up to 40 open-market days / 18 all-market days.
- Integrate Tradier first for chart and quote requests under `MARKET_DATA_MODE=tradier`; retain direct Yahoo only as non-critical fallback. News/insights and X data remain separate product capabilities and must be disabled gracefully or moved to an additional provider before external production cutover.
