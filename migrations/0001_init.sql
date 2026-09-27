-- tachles-analytics: first-party tracking + pulled GA4/GSC/Clarity data + lead snapshots + AI loop.
-- Apply: npx wrangler d1 migrations apply tachles-analytics --local   (or --remote)

-- ============================================================
-- First-party (written by mortgage-website's /api/t beacon)
-- ============================================================

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,              -- persistent per-browser id (localStorage). Pseudonymous, not anonymous.
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  entry_page TEXT NOT NULL,
  referrer_host TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  click_id_type TEXT,                    -- gclid | fbclid | msclkid | null
  device TEXT,                           -- mobile | tablet | desktop
  browser TEXT,
  os TEXT,
  country TEXT,                          -- from request.cf.country
  lang TEXT,
  screen TEXT,                           -- "WxH"
  is_bot INTEGER NOT NULL DEFAULT 0,
  pageviews INTEGER NOT NULL DEFAULT 0,
  engaged_ms INTEGER NOT NULL DEFAULT 0,
  lead_id TEXT                           -- set when this session's visitor submits a lead
);
CREATE INDEX IF NOT EXISTS sessions_started ON sessions (started_at);
CREATE INDEX IF NOT EXISTS sessions_visitor ON sessions (visitor_id, started_at);
CREATE INDEX IF NOT EXISTS sessions_lead ON sessions (lead_id);
CREATE INDEX IF NOT EXISTS sessions_source ON sessions (utm_source, utm_medium);

CREATE TABLE IF NOT EXISTS pageviews (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  at TEXT NOT NULL DEFAULT (datetime('now')),
  path TEXT NOT NULL,
  title TEXT,
  engaged_ms INTEGER NOT NULL DEFAULT 0,
  max_scroll_pct INTEGER NOT NULL DEFAULT 0,
  exit INTEGER NOT NULL DEFAULT 0        -- 1 if this was the last pageview of the session (best-effort)
);
CREATE INDEX IF NOT EXISTS pageviews_session ON pageviews (session_id, at);
CREATE INDEX IF NOT EXISTS pageviews_path ON pageviews (path, at);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  at TEXT NOT NULL DEFAULT (datetime('now')),
  path TEXT,
  name TEXT NOT NULL,                    -- step1_complete, result_view, lead_gate_view, lead_submitted, ...
  props_json TEXT
);
CREATE INDEX IF NOT EXISTS events_session ON events (session_id, at);
CREATE INDEX IF NOT EXISTS events_name ON events (name, at);

-- ============================================================
-- Pulled from Google/Microsoft APIs (cron, upsert on natural key)
-- ============================================================

CREATE TABLE IF NOT EXISTS ga4_daily (
  date TEXT NOT NULL,
  page TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  medium TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  sessions INTEGER NOT NULL DEFAULT 0,
  users INTEGER NOT NULL DEFAULT 0,
  engaged_sessions INTEGER NOT NULL DEFAULT 0,
  avg_engagement_s REAL,
  key_events INTEGER NOT NULL DEFAULT 0, -- GA4's renamed "conversions" metric
  PRIMARY KEY (date, page, source, medium, device)
);
CREATE INDEX IF NOT EXISTS ga4_daily_date ON ga4_daily (date);

CREATE TABLE IF NOT EXISTS gsc_daily (
  date TEXT NOT NULL,
  query TEXT NOT NULL DEFAULT '',
  page TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (date, query, page, device, country)
);
CREATE INDEX IF NOT EXISTS gsc_daily_date ON gsc_daily (date);
CREATE INDEX IF NOT EXISTS gsc_daily_page ON gsc_daily (page, date);

-- Long format so a new Clarity metric needs no migration.
CREATE TABLE IF NOT EXISTS clarity_daily (
  date TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  metric TEXT NOT NULL,                  -- Traffic | EngagementTime | ScrollDepth | RageClickCount |
                                          -- DeadClickCount | QuickbackClick | ExcessiveScroll | ScriptErrorCount
  value REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (date, url, device, metric)
);
CREATE INDEX IF NOT EXISTS clarity_daily_date ON clarity_daily (date);

-- ============================================================
-- Joined and derived
-- ============================================================

-- Copied from mortgage-leads on each cron run. No name or phone: pseudonymous, not anonymous —
-- session_id/lead_id still join back to PII in mortgage-leads.
CREATE TABLE IF NOT EXISTS leads_snapshot (
  lead_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  tier TEXT NOT NULL,
  score REAL,
  status TEXT NOT NULL,
  outcome TEXT,
  session_id TEXT,
  entry_page TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT
);
CREATE INDEX IF NOT EXISTS leads_snapshot_created ON leads_snapshot (created_at);
CREATE INDEX IF NOT EXISTS leads_snapshot_session ON leads_snapshot (session_id);

-- Precomputed so the overview page stays fast without scanning raw pageviews/events.
CREATE TABLE IF NOT EXISTS daily_rollup (
  date TEXT NOT NULL,
  metric TEXT NOT NULL,                  -- sessions | leads | pageviews | engaged_sessions | ...
  dimension TEXT NOT NULL DEFAULT '',    -- e.g. a source, a page, or '' for the site-wide total
  value REAL NOT NULL DEFAULT 0,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, metric, dimension)
);
CREATE INDEX IF NOT EXISTS daily_rollup_metric ON daily_rollup (metric, date);

-- ============================================================
-- Operations and the AI loop
-- ============================================================

CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,                  -- leads_snapshot | ga4 | gsc | clarity | rollup | prune
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'error', 'skipped')),
  rows INTEGER NOT NULL DEFAULT 0,
  range_from TEXT,
  range_to TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS sync_runs_source ON sync_runs (source, started_at);

CREATE TABLE IF NOT EXISTS ai_reports (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  period_from TEXT NOT NULL,
  period_to TEXT NOT NULL,
  summary_md TEXT NOT NULL,
  findings_json TEXT
);
CREATE INDEX IF NOT EXISTS ai_reports_created ON ai_reports (created_at);

CREATE TABLE IF NOT EXISTS ai_changes (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  description TEXT NOT NULL,
  files TEXT,                            -- JSON array of touched file paths
  hypothesis TEXT NOT NULL,
  metric TEXT NOT NULL,                  -- the metric this change is expected to move
  baseline REAL,
  evaluated_at TEXT,
  result TEXT                            -- filled in on a later run once enough data exists
);
CREATE INDEX IF NOT EXISTS ai_changes_created ON ai_changes (created_at);

-- ============================================================
-- Views for the AI agent and the UI
-- ============================================================

-- exit_rate_pct: the beacon's own `exit` flag fires on every full-page navigation (pagehide),
-- not only when the visitor actually leaves the site, so it can't be trusted as "was this the
-- last page of the visit" on a multi-page app. Instead this defines exit as "the chronologically
-- last pageview recorded for its session" — computed here, not from the stored flag.
CREATE VIEW IF NOT EXISTS v_page_performance AS
SELECT
  p.path,
  count(DISTINCT p.session_id) AS sessions,
  count(*) AS pageviews,
  round(avg(p.engaged_ms) / 1000.0, 1) AS avg_engaged_s,
  round(avg(p.max_scroll_pct), 0) AS avg_scroll_pct,
  round(100.0 * sum(CASE WHEN p.at = last_pv.max_at THEN 1 ELSE 0 END) / count(*), 1) AS exit_rate_pct
FROM pageviews p
JOIN (SELECT session_id, max(at) AS max_at FROM pageviews GROUP BY session_id) last_pv
  ON last_pv.session_id = p.session_id
GROUP BY p.path;

CREATE VIEW IF NOT EXISTS v_source_performance AS
SELECT
  coalesce(nullif(s.utm_source, ''), CASE WHEN s.referrer_host IS NOT NULL AND s.referrer_host != '' THEN s.referrer_host ELSE '(direct)' END) AS source,
  coalesce(nullif(s.utm_medium, ''), 'none') AS medium,
  count(*) AS sessions,
  count(s.lead_id) AS leads,
  round(100.0 * count(s.lead_id) / count(*), 2) AS cv_pct
FROM sessions s
GROUP BY source, medium;

CREATE VIEW IF NOT EXISTS v_funnel_daily AS
SELECT
  substr(e.at, 1, 10) AS date,
  e.name AS step,
  count(DISTINCT e.session_id) AS sessions
FROM events e
WHERE e.name IN ('page_view', 'step1_complete', 'result_view', 'lead_gate_view', 'otp_verified', 'lead_submitted')
GROUP BY date, step;

CREATE VIEW IF NOT EXISTS v_search_opportunities AS
SELECT query, page, sum(clicks) AS clicks, sum(impressions) AS impressions,
  round(100.0 * sum(clicks) / max(sum(impressions), 1), 2) AS ctr_pct,
  round(avg(position), 1) AS avg_position
FROM gsc_daily
GROUP BY query, page
HAVING impressions >= 20 AND (ctr_pct < 2 OR avg_position BETWEEN 5 AND 20)
ORDER BY impressions DESC;

CREATE VIEW IF NOT EXISTS v_lead_journeys AS
SELECT
  l.lead_id, l.created_at, l.kind, l.tier, l.score, l.status, l.outcome,
  s.id AS session_id, s.entry_page, s.utm_source, s.utm_medium, s.device, s.country,
  s.pageviews, s.engaged_ms
FROM leads_snapshot l
LEFT JOIN sessions s ON s.id = l.session_id;
