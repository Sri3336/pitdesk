# PitDesk — Railway Staging Deployment Runbook

## Scope and safety boundary

This runbook creates a **staging** PitDesk deployment first. Do not add `trading.akulaz.ai` or modify production DNS until the acceptance checklist is fully passed. The current live site remains the production source of truth throughout staging.

## Staging services

Create a Railway project named `pitdesk-external-migration` in **US East Metal / Virginia**. Create a `staging` environment and add these services in the same region:

| Service | Purpose | Deployment type | Initial configuration |
|---|---|---|---|
| `pitdesk-web` | React client, Express API, tRPC, custom authentication | GitHub repository deploy | `pnpm run build` then `pnpm start`; health check `/health` |
| `pitdesk-mysql` | MySQL-compatible application database | Railway MySQL template with persistent volume | Private networking only; daily, weekly, and monthly volume backups enabled |
| `pitdesk-intraday-scan` | Market-hours 15-minute scan | Scheduled clone of repository | Command and refactor to be finalised before enabling |
| `pitdesk-eod-sync` | Post-close pricing, IV, and PCR refresh | Scheduled clone of repository | Command and refactor to be finalised before enabling |
| `pitdesk-weekly-briefing` | Sunday market report | Scheduled clone of repository | Command and refactor to be finalised before enabling |
| `pitdesk-backup` | Independent encrypted MySQL logical export | Scheduled clone of repository | Writes to separate object storage; do not rely only on Railway volume backups |

## Environment configuration

Use `.env.external.example` only as an inventory. Create the real values in Railway's secret manager; do not store any secret in GitHub, chat, source code, or local project files. Link the web service to the private `MYSQL_URL` created by the Railway MySQL service and map it to `DATABASE_URL`.

The platform-specific data, AI, email, notification, and storage gateways will be replaced before staging traffic is allowed. Existing broker credentials must be recreated only after the new application callback URLs are known. Do not rotate the working production credentials prematurely.

## Database migration procedure

Export a consistent logical dump from the current MySQL-compatible database after the final staging code is deployed but before loading staging data. Restore it into `pitdesk-mysql`, run the application migrations, and compare table counts for all 56 tables. At minimum, verify `price_bars`, `intraday_scan_results`, `uploaded_trades`, `trade_log`, `positions`, `account_snapshots`, and `eod_capital_snapshots`.

## Staging acceptance checklist

| Area | Required proof before production cutover |
|---|---|
| Availability | `/health` returns HTTP 200 and the staging URL serves the landing page |
| Authentication | Existing email/password user can sign in and sign out; Google sign-in is tested only after callback registration |
| Data | Table counts and selected trade, transfer, and performance records match the source |
| Trading logic | Options Strategy Analyzer, Confluence, Daily Scan, Active Trade Monitor, and Performance Tracker load successfully |
| Integrations | Tradier quote, Schwab connection, market data, LLM feature, email alert, and storage upload each pass a controlled test |
| Scheduling | Each scheduled job runs manually once, writes the expected result, exits cleanly, and does not overlap another run |
| Recovery | Restore an independent backup into a disposable database and confirm the app can query it |
| Domain | A temporary staging subdomain works with TLS before `trading.akulaz.ai` is touched |

## Production cutover and rollback

Only after all tests pass should `trading.akulaz.ai` be pointed to the new Railway service. Preserve the current production deployment and database access for at least seven days after cutover. If any core workflow fails, revert the DNS record to the current origin, pause the new scheduled jobs, and restore the prior service while the issue is fixed in staging.
