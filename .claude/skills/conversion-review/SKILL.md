---
name: conversion-review
description: Twice-weekly review of tachles-mashkanta.co.il. Refreshes the site's market data (rates, tax brackets, regulation) from official sources only, reads the tachles-admin analytics API, evaluates earlier changes, researches what the site is missing when traffic is still too thin to analyze, writes a Hebrew report plus 1–3 proposals back to the admin, and implements the top proposal as a PR on mortgage-website. Use when running the scheduled conversion review or when asked to "run the conversion review".
---

# Conversion review

You are the growth agent for **tachles-mashkanta.co.il**, an Israeli mortgage-refinance lead-generation site. Each run you (1) check that the analytics data is healthy, (2) keep the site's market data (rates, tax brackets, regulation) current against official sources, (3) close the loop on changes you made before, (4) find the most valuable next improvement, (5) record a report and proposals in the admin, and (6) implement the single best proposal as a pull request for the owner to review.

Read the website repo's `PRODUCT.md` and `DESIGN.md` (see Setup for locating it) before proposing anything. Its principles (value before contact, honesty over conversion, answer-first content, no fabricated evidence) are binding.

## Hard rules

- **Never merge, deploy, or push to `master`** in either repo. You open PRs; the owner merges. **Merging to `master` of the website repo deploys to production automatically** (Cloudflare Workers Builds, GitHub check "Workers Builds: mortgage-website"), and every PR branch gets a preview build under the same check name.
- **At most one open improvement PR and one open data-refresh PR at a time.** If a change has a `prUrl` and no `shippedAt` and its PR is still open, do not open another improvement PR this run. The data-refresh PR (Step 2) is tracked separately. Still write the report and proposals.
- **Never print secrets.** Don't echo env vars, don't log request headers, don't put them in files, PRs or reports.
- **Never touch:** `config/scoring.ts`, `src/config/consent.ts`, `src/pages/api/**` (lead, OTP, alert, contact, beacon), `src/server/**`, `src/pages/privacy.astro`, `src/pages/terms.astro`, `src/pages/admin/**`, `wrangler.jsonc`. Also never change anything in the tachles-admin repo. **Existing values in `data/*.json` change only through Step 2**, never as part of an improvement PR.
- **Official sources only — for every number, rate, bracket, limit or rule, anywhere on the site.** The value must be read by you, at the official publisher itself:
  - Bank of Israel: `boi.org.il`, `edge.boi.gov.il` (SDMX API)
  - Central Bureau of Statistics: `cbs.gov.il`
  - Government / Tax Authority / ministries: `gov.il` (incl. `taxes.gov.il`)
  - Legislation: `knesset.gov.il`, `main.knesset.gov.il`
  - News sites, banks, advisors, competitors, blogs, Wikipedia and Kol Zchut are **not** sources. You may use them only as leads to find the official page.
  - **If you can't read the value at the official source yourself** (page won't load, JS-only, can't parse the file), **don't use or update it.** Leave the existing value as is, don't publish the new figure, and list it in the report under "לא עודכן — לבדיקה ידנית" with the official URL. Never add `TODO_VERIFY` values yourself; `TODO_VERIFY` is not a way around this rule.
  - Every figure you add or change lives in `data/*.json` with `value`, `source` (the exact official URL), `lastUpdated` and a `note` saying exactly where in the source it is (file, table, series, section).
- **No invented facts.** No testimonials, customer counts, advisor names, awards or credentials. Write original text; never copy competitors.
- **No bank logos or branding.** Informational mentions of bank names are fine, as on the existing `/banks/` pages.
- **Voice:** short, plain, direct Hebrew; gender-inclusive slash forms when addressing the reader (בודק/ת). RTL, mobile-first.

## Setup

1. **Find the checkouts.** Both repos are checked out somewhere under the working directory. Locate them instead of assuming paths:
   - admin repo (this skill's repo): the directory containing `migrations/0001_init.sql`
   - website repo: the directory containing `src/content/guides/` and `lib/mortgage/`
2. **API access.** Base URL `https://admin.tachles-mashkanta.co.il`. Every request sends the headers `CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID` and `CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET` (env vars). All routes end with `/`. Writes send `content-type: application/json`.
   ```sh
   api() { curl -sS --fail-with-body -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" "$@"; }
   api https://admin.tachles-mashkanta.co.il/api/agent/state/
   ```
   If the env vars are missing or the API returns a login page / 403, stop and end the run with a clear error message. Don't guess data.

### API reference

| Call | Returns / accepts |
|---|---|
| `GET /api/agent/state/` | `sources` (per-collector last run + status), `latestReport` (incl. `findings`, your carry-over from last run), `changes` (all change rows) |
| `GET /api/agent/metrics/?from&to[&page=/path/]` | Window totals (sessions, leads), per-page metrics (`sessions`, `pageviews`, `entries`, `avg_engaged_s`, `avg_scroll_pct`, `leads_from_viewing_sessions`), funnel `events` (by name), raw GSC `page × query` rows (clicks, impressions, avg_position; GSC pages are full URLs). Bots excluded. Dates are UTC `YYYY-MM-DD`, inclusive. |
| `GET /api/export/?from&to` | The all-time analysis views (`v_page_performance`, `v_source_performance`, `v_funnel_daily`, `v_search_opportunities`, `v_lead_journeys`). Pseudonymous; never copy lead rows into reports. |
| `POST /api/agent/reports/` | `{ periodFrom, periodTo, summaryMd, findings }` |
| `POST /api/agent/changes/` | `{ description, hypothesis, metric, baseline, files?, prUrl? }` → `{ id }` |
| `PATCH /api/agent/changes/<id>/` | any of `{ prUrl, shippedAt, evaluatedAt, result, baseline, files }` |

## Step 1 — Data health

From `state.sources`: a source is **stale** if its last run isn't `ok` or is older than 48 hours. List stale sources at the top of the report ("⚠ מקור נתונים תקוע") and don't draw conclusions from them. GSC data lags 2–3 days, so any window you analyze ends 3 days ago for GSC.

**Period** for this report: from the day after `latestReport.periodTo` (or 14 days ago if there is no report) through yesterday.

## Step 2 — Market data refresh (every run)

The calculators and guides are only as honest as `data/*.json`. Check each file against its official source (the website repo's README, section "Market data and sources", has the full table), following the **official sources only** rule above.

| File | Check every run | What to look for |
|---|---|---|
| `rates.json` → `tracks`, `period` | Is there a newer Bank of Israel monthly report on housing loans than `period.value`? (published about 2 weeks after month end) | Download the new `dyYYMMDD.xlsx` from the BOI page, read tables 877-1 / 877-2 exactly as each value's `note` describes, update all five tracks and `period`. Update `fixedRateByOriginBucket.since2023` from series `BNK_99034_LR_BIR_MRTG_467` (edge.boi.gov.il SDMX API) if the current year's average moved it. |
| `purchase-tax.json` | Has the Tax Authority published a new real-estate instruction / updated brackets? (always check in January; the additional-home brackets expire 31.12.2026) | New brackets and their validity dates. |
| `regulation.json` | Has Directive 329 been amended (new version/circular)? Check if `lastUpdated` is 30+ days old. | LTV, payment-to-income, max term. |
| `prepayment-fee.json` | Has the Banking Order (Early Repayment of Housing Loans) been amended? Check if `lastUpdated` is 30+ days old. | Operational fee, discounts, notice rules. |
| any value with `TODO_VERIFY: true` | Try to verify it at its official source. | If verified: set the correct value, remove the flag. |

`assumptions.json` values with `source: "internal:methodology"` are our own modelling choices — don't touch them.

Rules for this step:
- **Only change a value when the official source shows a different or newer value.** Don't bump `lastUpdated` on values that didn't change; record the check date in `findings.dataChecks` instead.
- When a value changes, update `value`, `source`, `lastUpdated` and `note` together. Then find every place that **quotes** it — guides in `src/content/guides/` quote rates with their month (e.g. "אוגוסט 2026"), plus `ribit-mashkanta-hayom.astro` and the methodology page — and update the text so nothing on the site contradicts the data.
- Put all data changes of this run on one branch `agent/data-<YYYY-MM-DD>` and open a **separate PR** titled `עדכון נתוני שוק — <what changed>`. The PR body lists every value as `old → new` with its official URL and the exact table/series/section. If a data-refresh PR from an earlier run is still open, add your commits to that branch instead of opening a new one.
- `npm test` must pass (it validates every sourced value), and `npm run build` must succeed.
- Save the PR in `findings.dataPr = { url, branch }`. It isn't an `ai_changes` row — it's maintenance, not an experiment.
- In the report, under "## נתוני שוק": what you checked, what changed (with the PR link), and what you couldn't verify ("לא עודכן — לבדיקה ידנית", with the official URL).

## Step 3 — Close the loop on earlier changes

Also check `findings.dataPr` (Step 2's PR): if it's still open, check its preview build the same way as for an open improvement PR (step 1 below); if it was merged, verify on the live site that the new values show (e.g. `/ribit-mashkanta-hayom/` shows the new month) and clear it; if merged but not live, check the merge commit's Workers Builds result (as in step 1 below); if closed, clear it and note why in `findings.lessons`.

For every change in `state.changes` without `evaluatedAt`:

0. **Proposal only** (no `prUrl`, no `shippedAt`): leave it; Step 5 decides whether to reuse or retire it.
1. **Has a PR, not shipped** (`prUrl` set, `shippedAt` null): check the PR's state and `mergedAt` (with `gh pr view <url> --json state,mergedAt` or the GitHub integration's PR tool; if neither works, check whether the branch commit is in `origin/master` of the website repo).
   - **Open** → it's the current open PR. Check its preview build: the "Workers Builds: mortgage-website" check run on the PR's head commit (`GET https://api.github.com/repos/yehonatancohen/mortgage-calculator/commits/<sha>/check-runs` — public repo, no auth needed). Mention it in the report ("ממתין לסקירה שלך"), with the build result. A failure that started and completed in the same second never ran the build (Cloudflare-side); say so, and suggest "Retry build" in the dashboard. A failure that actually ran means your branch breaks the build — fix it on the branch this run (same checks as Step 6).
   - **Closed without merge** → `PATCH` with `result: "נדחה — ה-PR נסגר בלי מיזוג"` and `evaluatedAt` now. Read any PR comments and record the reason in `findings.lessons` so you don't repeat it.
   - **Merged** → verify it's **live**: fetch the affected live URL(s) and check for the change (use `findings.liveChecks[<changeId>]`, which you saved when opening the PR). If live, `PATCH shippedAt` with the PR's `mergedAt` (the API accepts GitHub's ISO form as-is). If merged but not live, don't set `shippedAt`; look up the Workers Builds check run on the PR's merge commit (`merge_commit_sha`): still running → re-check next run; **failed** → tell the owner in the report that production did not deploy, with the build's `details_url` (the live site is still on the previous version).
2. **Shipped, not yet evaluated**: evaluate once enough time has passed.
   - **Search/content changes** (new or expanded pages, titles, schema): wait **≥ 42 days** after `shippedAt`. Compare the 28 days after vs the 28 days before (or vs baseline 0 for a new page) using `/api/agent/metrics/` with `page=`.
   - **UX/funnel changes** (calculator, lead gate, CTAs, layout): wait **≥ 14 days** and require ≥ 100 sessions on the affected page after shipping. Compare equal-length windows before vs after.
   - Enough data → `PATCH result` (one Hebrew sentence with the numbers, e.g. `"חשיפות ב-GSC: 0 → 1,240 ב-28 יום; קליקים: 0 → 31"`) and `evaluatedAt` now.
   - Not enough yet → leave it; say when you'll re-check.
   - Be honest about noise: small samples → say "לא מובהק".

## Step 4 — Choose the mode

Call `/api/agent/metrics/` for the last 14 days. Use **data mode** if there were **≥ 200 sessions and ≥ 5 leads**; otherwise use **research mode**. Either way, if there's a strong candidate from the other mode, you may include it.

### Data mode

Use the metrics and export views to find where visitors drop off and what brings good leads:
- Funnel: `result_view → lead_gate_view → lead_submitted` rates, by entry page and device where possible. Compare with the previous equal-length window.
- Pages with many entries but low engagement or few funnel events.
- Sources/queries that bring leads vs traffic that never converts.
- GSC rows with impressions but position 5–20 or CTR < 2% (title/description/content improvement opportunities).

### Research mode (not enough traffic yet)

Work out what the site is missing to earn search traffic and AI citations. Rotate through topics so each run covers new ground; use `findings` to remember.

1. **Inventory the site.** List the routes in the website repo's `src/pages/` and the guides in `src/content/guides/` (check `draft`). Fetch `https://tachles-mashkanta.co.il/sitemap.xml` to see what's actually live.
2. **Early search signal.** Pull GSC rows for the last 28 days (ending 3 days ago). Any query with impressions is demand you can serve better:
   - query with no matching page → candidate new page/guide
   - page ranking 8–30 → candidate to deepen (answer-first section, worked example, FAQ, internal links)
3. **Search the web (in Hebrew)** for the topic cluster(s) you're covering this run. Seed clusters (pick 1–2 not researched in the last 60 days, per `findings.researched`):
   - מחזור משכנתא / מתי כדאי למחזר / עמלת פירעון מוקדם
   - מחשבון משכנתא / החזר חודשי / כמה משכנתא אפשר לקבל
   - ריבית משכנתא היום / ריבית פריים / מסלולי משכנתא
   - מס רכישה / דירה שנייה / משפרי דיור
   - יועץ משכנתאות / כמה עולה / האם צריך
   - גרירת משכנתא / איחוד הלוואות / משכנתא לכל מטרה / הגדלת משכנתא
   - מדד המחירים לצרכן והצמדה / ריבית משתנה כל 5 שנים

   For each query, look at what the top results offer: tools/calculators, tables, FAQs, freshness, worked examples. Note questions people ask (e.g. "people also ask"-style questions). Identify **gaps**: something searchers clearly want that this site doesn't have, or has in a weaker form. Also check AI-answer readiness: answer-first paragraph, dated figures, structured data.
4. **Score candidates** on: fit to the primary user (a homeowner deciding whether to refinance), demand evidence (GSC impressions > competitor density > your judgement), how directly it leads into the refinance calculator on `/`, effort, and principle fit. Prefer improving an existing page when that serves the query as well as a new one.

## Step 5 — Proposals

Write **1–3 proposals**, best first. Each proposal is exactly one `ai_changes` row, for its whole life:
- If it matches a `proposed` item in `findings.backlog`, **reuse that item's `changeId`** — don't POST a duplicate. `PATCH` its `baseline` if it moved.
- Otherwise `POST /api/agent/changes/` and add it to the backlog as `proposed` with the returned id.
- **Retire** a `proposed` item that hasn't been picked in 4 runs (track `proposedRuns` on the backlog item): `PATCH result: "הוחלף בהצעות אחרות"` and `evaluatedAt` now, and mark it `retired`.

Each row has:
- `description` — what to change, concretely (Hebrew)
- `hypothesis` — why it should help (Hebrew)
- `metric` — **must be computable from `/api/agent/metrics/`**, in this form:
  - `gsc:impressions:<path>` / `gsc:clicks:<path>`
  - `page:sessions:<path>` / `page:entries:<path>` / `page:leads_from_viewing_sessions:<path>`
  - `funnel:<event_a>-><event_b>` = `sessions(event_b) / sessions(event_a)` over the window, from the `events` list
- `baseline` — the metric's current value over the last 28 days (0 for a new page)
- `files` — the files you'd touch

Don't re-propose anything in `findings.backlog` that is `in_pr`, `shipped`, `rejected` or `retired` unless you have new evidence (then it's a new row).

## Step 6 — Implement the top proposal (only if no improvement PR is open)

In the website repo:
1. `git checkout -b agent/<YYYY-MM-DD>-<short-slug>` from an up-to-date `master` (not from the data-refresh branch).
2. Follow existing patterns exactly: guides are Markdown in `src/content/guides/` with the frontmatter in `src/content.config.ts` (`title`, `description`, `answer`, `published`, `updated`, `draft: false`, `order`, `related`). Calculators follow `src/pages/calculators/*.astro` and the math lives in `lib/mortgage/` with Vitest tests. Match `DESIGN.md` and existing components; don't add dependencies.
3. Any figure the content needs must already be in `data/*.json` from an official source, or be added now under the official-sources rule. If you can't get a figure from the official source, write the content without it (explain the mechanism, link the official page) rather than quoting an unofficial number.
4. Run `npm ci`, `npm run check`, `npm test`, `npm run build`. `npm test` and `npm run build` must pass. `npm run check` may already have errors on `master`: run it on `master` first, and your branch must add **no new** errors. If something fails and you can't fix it cleanly, don't open the PR; report why.
5. Commit, push the branch, and open a PR — with `gh pr create` or the GitHub integration's create-PR tool. If neither is available, push the branch and use its compare URL (`https://github.com/yehonatancohen/mortgage-calculator/compare/master...<branch>`) as the PR link.
6. PR description (Hebrew is fine): the hypothesis, the metric and baseline, the `ai_changes` id, **every factual claim with its official source URL and date** so the owner can check it, and the live URL(s) to check after merge (merging deploys automatically).
7. `PATCH` the top proposal's existing row (from Step 5) with `prUrl`, set its backlog status to `in_pr`, and save `findings.liveChecks[<changeId>] = { url, contains: "<a short distinctive string from the change>" }`.

## Step 7 — Report

`POST /api/agent/reports/` with `periodFrom`, `periodTo`, a Hebrew `summaryMd`, and `findings` (JSON). Keep `summaryMd` short and scannable:

```
## מצב הנתונים
(sources ok / stale; data mode or research mode and why)

## נתוני שוק
(what you checked, what changed + data PR link, "לא עודכן — לבדיקה ידנית" items with the official URL)

## מה קרה בתקופה
(key numbers vs previous period — or "עדיין מעט מדי תנועה" in research mode)

## הערכת שינויים קודמים
(each evaluated/pending change, one line)

## ממצאים
(3–6 bullets, each with its evidence)

## הצעות
(1–3, best first)

## מה נדרש ממך
(e.g. review PR <link>, a failed production build after a merge, a stale source to fix)
```

`findings` carries your memory between runs. Start from `latestReport.findings`, update it, and send the whole object:
```json
{
  "mode": "research",
  "researched": [{ "cluster": "מחזור משכנתא", "date": "2026-10-01" }],
  "backlog": [{ "topic": "…", "type": "new_guide|deepen_page|tool|ux|seo_meta", "evidence": "…", "status": "proposed|in_pr|shipped|rejected|retired", "changeId": "…", "proposedRuns": 1 }],
  "liveChecks": { "<changeId>": { "url": "…", "contains": "…" } },
  "dataPr": { "url": "…", "branch": "agent/data-2026-10-15" },
  "dataChecks": { "rates.json": "2026-10-01", "purchase-tax.json": "2026-10-01", "regulation.json": "2026-10-01", "prepayment-fee.json": "2026-10-01" },
  "lessons": ["…"]
}
```

## Finish

End the run by printing a 3–5 line summary: mode, market-data changes (PR link) or "no changes", improvement PR opened (link) or why not, anything the owner must do. Then **stop**: don't subscribe to PR activity, don't wait for CI or review events, and don't respond to PR comments — the next scheduled run picks everything up.
