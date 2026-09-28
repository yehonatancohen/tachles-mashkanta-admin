# tachles-admin

Internal analytics and operations console for [tachles-mashkanta.co.il](https://tachles-mashkanta.co.il), served at `admin.tachles-mashkanta.co.il`. See `PRODUCT.md` for what it's for and `DESIGN.md` for the visual system (inherited from the sibling `mortgage-website` project).

## Architecture

```
visitor ─► mortgage-website ──beacon /api/t──► D1 tachles-analytics  (sessions, pageviews, events)
                 │ leads (+session_id)        ▲
                 ▼                            │ cron daily 03:00 IL
           D1 mortgage-leads ◄──read-only── tachles-admin worker ──► GA4 Data API / GSC API / Clarity Export API
                                              │
                          Cloudflare Access ──┴─► admin UI (Hebrew, RTL)  +  /api/export for the AI agent
```

- **mortgage-website** (sibling project) sends first-party pageviews/events to `POST /api/t` and stamps each lead with the visitor's `session_id`.
- **tachles-admin** owns a separate D1 database, `tachles-analytics` (this project's `migrations/`), and reads `mortgage-leads` **read-only** through a second D1 binding (`LEADS`) — it never runs migrations against it.
- A daily cron (`src/worker.ts`'s `scheduled` handler, wired through `src/collectors/index.ts`) pulls GA4, Search Console and Clarity data and copies a name/phone-free snapshot of recent leads into `tachles-analytics`.
- The whole app sits behind **Cloudflare Access**; `src/middleware.ts` re-verifies the Access JWT on every route as defense in depth.
- An AI agent reads the accumulated data roughly twice a week (via the Agent API below) and writes reports/change proposals back into `ai_reports`/`ai_changes`. Its instructions are the `conversion-review` skill in `.claude/skills/conversion-review/SKILL.md`, run by a scheduled cloud routine.

## Why daily, when the agent reads twice a week

Search Console data isn't final for 2-3 days, and Clarity's export API only returns a 1-3 day rolling window (not an arbitrary range) with a **10 calls/day** quota. Skipping days would lose data outright. So the cron runs daily and re-pulls/upserts a rolling window; the AI agent's own reading cadence is independent of that.

## Setup

1. **D1 database**
   ```
   npx wrangler d1 create tachles-analytics
   ```
   Put the returned `database_id` into `wrangler.jsonc`'s `ANALYTICS` binding (replacing `REPLACE_WITH_D1_DATABASE_ID`), then:
   ```
   npx wrangler d1 migrations apply tachles-analytics --remote
   ```

2. **Cloudflare Access**
   - Create a self-hosted Access application for `admin.tachles-mashkanta.co.il`.
   - Add an **Allow** policy for the owner's email.
   - Add a **Service Auth** policy and create a service token — this is how the AI agent authenticates to `/api/export` and `/api/sync/*`. Put its Client ID/Secret wherever the agent's own config lives (not in this repo).
   - Copy the app's **AUD tag** and your **team domain** into `ACCESS_AUD` / `ACCESS_TEAM_DOMAIN`.

3. **Google service account** (GA4 + Search Console)
   - Create a service account in Google Cloud, generate a JSON key.
   - Add it as a **Viewer** on the GA4 property (Admin → Property Access Management).
   - Add it as a **user** on the Search Console property (Settings → Users and permissions).
   - Set `GOOGLE_SA_JSON` (the full key, one line), `GA4_PROPERTY_ID` (e.g. `properties/123456789`), `GSC_SITE_URL`.
     - If the Search Console property is a **Domain property** (covers http/https and all subdomains), `GSC_SITE_URL` must be `sc-domain:tachles-mashkanta.co.il`, not a URL. Use the exact string shown in Search Console's property list.
   - In GA4, mark `lead_submitted` (and any other funnel event worth tracking) as a **key event** (Admin → Events → toggle "Mark as key event") — `ga4_daily.key_events` only counts events GA4 itself has been told matter.

4. **Microsoft Clarity**
   - Create/open the Clarity project for the site, Settings → Data Export → generate an API token.
   - Set `CLARITY_API_TOKEN`.

5. **Secrets** (production): `npx wrangler secret put <NAME>` for each of the above. Locally, copy `.dev.vars.example` to `.dev.vars`.

6. **Custom domain**: already declared in `wrangler.jsonc`'s `routes`; Cloudflare provisions it on first deploy as long as the zone is on the account.

## Local development

This project's beacon-fed data only exists if `mortgage-website`'s local dev server and this app's local dev server share the same local D1/KV state. Both `astro.config.mjs` files set `persistState: { path: '../.wrangler-shared' }`, so a sibling `.wrangler-shared/` directory (one level above both project folders) holds the shared local databases.

```
# from mortgage-website/
npx wrangler d1 migrations apply mortgage-leads --local --persist-to ../.wrangler-shared

# from tachles-admin/
npx wrangler d1 migrations apply tachles-analytics --local --persist-to ../.wrangler-shared

npm run dev   # in both projects
```

Browse the site, submit a test lead, then check this admin's `/journeys/` — the session should show up with its pageviews/events, and the lead should link to it.

To test the cron collectors locally:
```
npx wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=0+0+*+*+*"
```
Check `/sources/` afterwards — GA4/GSC/Clarity fail cleanly (a `sync_runs` row with `status = 'error'` and the message) when their secrets aren't set; `leads_snapshot` and `rollup` work with just the local D1s.

Set `DEV_AUTH_BYPASS=1` in `.dev.vars` to skip the Access check locally — **never** set this as a deployed secret.

## Adding a new data source

1. Implement `Collector` (`src/collectors/types.ts`): `id`, `label`, `defaultRange()`, `run(env, range, options)`.
2. If the source needs its own shape, add a table in a new migration; a metric-per-row source (like Clarity) can usually reuse the `date/url/device/metric/value` long-table pattern instead, avoiding a migration entirely.
3. Register it in `src/collectors/index.ts`'s `COLLECTORS` array.
4. It automatically gets a card on `/sources/` and a `sync_runs` history.

## Schema reference

See `migrations/0001_init.sql` for the full DDL and comments. Summary:

| Table | Written by | Contents |
|---|---|---|
| `sessions`, `pageviews`, `events` | `mortgage-website`'s `/api/t` beacon | First-party visitor behavior. `visitor_id`/`session_id`/`lead_id` are pseudonymous, not anonymous — they join back to PII in `mortgage-leads`. |
| `ga4_daily`, `gsc_daily`, `clarity_daily` | the daily cron | Pulled aggregates, upserted on their natural key. `clarity_daily` is long-format (`metric`/`value`) so a new Clarity metric needs no migration. |
| `leads_snapshot` | the daily cron | Lead outcome data **without name or phone**, joined to `sessions` via `session_id`. |
| `daily_rollup` | the daily cron | Precomputed daily aggregates so `/` doesn't scan raw tables. |
| `sync_runs` | every collector run | One row per attempt — status, row count, error. Powers `/sources/`'s freshness dots. |
| `ai_reports`, `ai_changes` | the AI agent | The agent's own write-back: summaries and a change log with hypothesis → metric → result. |

Views for querying (`v_page_performance`, `v_source_performance`, `v_funnel_daily`, `v_search_opportunities`, `v_lead_journeys`) are what `GET /api/export` returns.

## Agent API

Everything is behind the same Access check (the agent sends its service token's `CF-Access-Client-Id`/`CF-Access-Client-Secret` headers). `trailingSlash: 'always'` applies — note the trailing `/`. Writes require `content-type: application/json`.

| Route | Purpose |
|---|---|
| `GET /api/export/?from&to` | The analysis views. |
| `GET /api/agent/state/` | Start-of-run context: per-source sync freshness, latest report (incl. its `findings`, the agent's carry-over memory), change log. |
| `GET /api/agent/metrics/?from&to[&page=/path/]` | Windowed metrics for before/after comparisons: totals, per-page first-party metrics, funnel events, raw GSC page×query rows (no impression threshold). Bots excluded. |
| `POST /api/agent/reports/` | `{ periodFrom, periodTo, summaryMd, findings? }` → `{ id }` |
| `POST /api/agent/changes/` | `{ description, hypothesis, metric, baseline?, files?, prUrl? }` → `{ id }` |
| `PATCH /api/agent/changes/:id/` | Any of `{ prUrl, shippedAt, evaluatedAt, result, baseline, files }`. `shippedAt` is when the PR was merged/deployed — evaluation measures from there, not from `created_at`. |

## Privacy

The analytics data is **pseudonymous, not anonymous**: `visitor_id` persists per browser, and `session_id`/`lead_id` join straight back to the name/phone stored in `mortgage-leads`. There's no consent banner (the owner has already decided against a full legal review of the main site's privacy/tracking wording — see `mortgage-website/OWNER-TODO.md`); `mortgage-website/src/pages/privacy.astro` carries a short note about this pseudonymous tracking. Raw `pageviews`/`events` are retained 13 months (`src/collectors/prune.ts`); aggregates are kept indefinitely.

## Deploy

```
npm run build && npx wrangler deploy
```
