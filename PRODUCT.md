# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Astro 7 on Cloudflare Workers (`@astrojs/cloudflare`), matching the sibling `mortgage-website` project. Server-rendered pages, D1 for storage, a Worker `scheduled` handler for the daily collector cron. No client framework or chart library — the UI is server-rendered HTML/CSS with inline SVG charts, in the same spirit as the existing `mortgage-website/src/pages/admin` page.

## Users

The single owner/operator of tachles-mashkanta.co.il (a mortgage-lead-generation site), who currently checks leads through a bare-bones Basic-auth `/admin` page on the main site. Secondary "user": an AI agent that reads this admin's data twice a week to propose site changes that improve visitor-to-lead conversion.

## Product Purpose

An internal analytics and operations console at `admin.tachles-mashkanta.co.il` that:
1. Shows overall lead stats and visitor analytics for the mortgage site.
2. Continuously collects visitor behavior (first-party pageviews/events) and pulls in GA4, Google Search Console and Microsoft Clarity data on a daily cron, so an AI optimization loop has rich, joined data (traffic → behavior → lead outcome) to act on.

Success = the owner can see, at a glance, how visitors become leads and where they drop off, and the AI agent has enough signal in one place to make concrete, testable site changes.

## Positioning

Not a general-purpose analytics dashboard (GA4/Clarity already exist for that). Its differentiator is joining first-party session/pageview/event data to the actual `mortgage-leads` D1 outcomes (tier, status, delivered/nurture, contacted/closed) and to pulled GA4/GSC/Clarity data in one schema, purpose-built for an AI agent to query and act on — not just for a human to eyeball.

## Operating Context

- Sibling project `mortgage-website/` (Astro + Cloudflare Workers + D1 `mortgage-leads`) is the site being measured. It already has: a Basic-auth `/admin` leads page (`src/pages/admin/index.astro`), a lightweight client analytics module (`src/scripts/analytics.ts`) pushing events to `dataLayer`/Clarity, and `INTEGRATIONS.clarityId`/`googleSiteVerification` slots in `src/config/site.ts` (both currently empty — no tool is actually wired up yet).
- This new admin app is a **separate Astro project/Worker** with its own D1 database (`tachles-analytics`), reading `mortgage-leads` read-only via a second D1 binding.
- Auth: Cloudflare Access (Zero Trust) in front of the whole worker, not app-level passwords.
- Deploy target: Cloudflare Workers, custom domain `admin.tachles-mashkanta.co.il`.
- Hebrew (RTL) UI, matching the main site's language and design tokens (`mortgage-website/src/styles/tokens.css`).

## Capabilities and Constraints

- Must show: an overview (KPIs, funnel, traffic sources), a leads table/stats (superset of the current `/admin`), traffic, search (GSC), on-page behavior (Clarity + first-party), visitor journeys, per-data-source sync status, and an AI report/change-log view.
- Must collect: first-party pageviews/events from a new site-side beacon (`/api/t`), and daily pulls from GA4 Data API, Google Search Console API, and Microsoft Clarity's Data Export API. Architecture must allow adding more data sources later without a schema rewrite (pluggable "collector" interface).
- Data lives in a new D1 database `tachles-analytics`, separate from `mortgage-leads`, joined via a lead snapshot (no name/phone — pseudonymous, not anonymous: joins back to PII via `session_id`/`lead_id`) copied in on each cron run.
- Cron runs daily (not twice-weekly) because Clarity/GSC data lags and Clarity's export API only covers a short rolling window; the AI agent itself reads the accumulated data roughly twice a week.
- Clarity Data Export API allows only 10 calls/day — the collector must not let manual "run now" clicks exhaust the quota.
- Constraint: changes to `mortgage-website` (adding the beacon, `session_id` on leads, GA4/Clarity script tags) are in scope as part of this build, since first-party tracking requires them.
- No consent banner is being added; the owner has already declined legal review of tracking/privacy wording for the main site (see `mortgage-website/OWNER-TODO.md`). Only a short pseudonymous-data note is added to the site's privacy page.

## Evidence on Hand

- Existing leads schema and admin page in `mortgage-website/migrations/0001_init.sql` and `mortgage-website/src/pages/admin/index.astro` — the stats/table this new admin supersedes for analytics purposes (lead delivery actions like "deliver"/"nurture" stay on the main site's `/admin`, since they're tied to its email/webhook code).
- Existing client analytics module `mortgage-website/src/scripts/analytics.ts` (event names: step1_complete, result_view, question_taken/fixed/goal, lead_gate_view, otp_sent/verified, lead_submitted, rate_alert_view/submitted, calculator_used) — the event vocabulary this admin's behavior/funnel views are built around.
- No GA4 property, GSC verification, or Clarity project is actually configured yet (`INTEGRATIONS` slots are empty) — these need to be provisioned as part of rollout, documented in this project's README.

## Product Principles

1. One place joins traffic, behavior and lead outcome — never make the owner or the AI cross-reference GA4, Clarity and the leads DB by hand.
2. Every collected metric must be attributable to a source and a sync run (`sync_runs`), so a stale or failed pull is visible, not silently blended into "the truth."
3. First-party data is the primary signal (it can be joined to leads); GA4/GSC/Clarity are corroborating and gap-filling, not the source of truth.
4. The schema and UI are built for machine consumption (the AI agent) as much as human consumption — views, an export endpoint, and a change-log the agent writes back to.
5. Match the main site's visual language (Hebrew/RTL, same tokens) rather than inventing a new admin aesthetic — this is an operations tool, not a marketing surface.

## Accessibility & Inclusion

No accessibility requirement beyond ordinary semantic HTML/keyboard operability — this is a single-operator internal tool, not a public surface. RTL Hebrew throughout, consistent with `mortgage-website`.
