/** /agent: AI reports (newest first) and the change log the agent writes back to. */
import type { Env } from '../env';

export interface AiReport {
  id: string;
  createdAt: string;
  periodFrom: string;
  periodTo: string;
  summaryMd: string;
  /** The agent's own structured carry-over between runs (e.g. its research backlog). */
  findings: unknown;
}
export async function listReports(env: Env, limit = 20): Promise<AiReport[]> {
  const { results } = await env.ANALYTICS.prepare(
    `SELECT id, created_at, period_from, period_to, summary_md, findings_json FROM ai_reports ORDER BY created_at DESC LIMIT ?1`,
  )
    .bind(limit)
    .all<{ id: string; created_at: string; period_from: string; period_to: string; summary_md: string; findings_json: string | null }>();
  return results.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    periodFrom: r.period_from,
    periodTo: r.period_to,
    summaryMd: r.summary_md,
    findings: parseJson(r.findings_json),
  }));
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export interface AiChange {
  id: string;
  createdAt: string;
  description: string;
  files: string[];
  hypothesis: string;
  metric: string;
  baseline: number | null;
  prUrl: string | null;
  shippedAt: string | null;
  evaluatedAt: string | null;
  result: string | null;
}
export async function listChanges(env: Env, limit = 50): Promise<AiChange[]> {
  const { results } = await env.ANALYTICS.prepare(
    `SELECT id, created_at, description, files, hypothesis, metric, baseline, pr_url, shipped_at, evaluated_at, result
     FROM ai_changes ORDER BY created_at DESC LIMIT ?1`,
  )
    .bind(limit)
    .all<{
      id: string;
      created_at: string;
      description: string;
      files: string | null;
      hypothesis: string;
      metric: string;
      baseline: number | null;
      pr_url: string | null;
      shipped_at: string | null;
      evaluated_at: string | null;
      result: string | null;
    }>();
  return results.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    description: r.description,
    files: parseFiles(r.files),
    hypothesis: r.hypothesis,
    metric: r.metric,
    baseline: r.baseline,
    prUrl: r.pr_url,
    shippedAt: r.shipped_at,
    evaluatedAt: r.evaluated_at,
    result: r.result,
  }));
}

function parseFiles(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((f): f is string => typeof f === 'string') : [];
  } catch {
    return [];
  }
}

// ---- Windowed metrics (GET /api/agent/metrics/) ----

/**
 * Everything over an explicit [from, to] date window (UTC dates, inclusive), so the agent can
 * compare a page before vs after a change's shipped_at. Unlike /api/export's views, nothing
 * here is all-time and GSC has no impression threshold â€” early on, low-volume impressions are
 * the only search signal there is. Bot sessions are excluded throughout.
 */
export async function windowMetrics(env: Env, from: string, to: string, page: string | null) {
  const db = env.ANALYTICS;
  // D1 rejects a bind count that doesn't match the placeholders, so page-filtered queries bind
  // ?3 only when their SQL actually contains it; the site-wide totals never take a page.
  const withPage = (stmt: D1PreparedStatement) => (page ? stmt.bind(from, to, page) : stmt.bind(from, to));
  const pageFilter = page ? 'AND p.path = ?3' : '';
  // GSC stores full URLs (https://host/path/); first-party pageviews store the bare path. Strip
  // scheme + host and compare exactly — a suffix match would make page=/ match every URL.
  const gscPath = `substr(substr(g.page, instr(g.page, '://') + 3), instr(substr(g.page, instr(g.page, '://') + 3), '/'))`;
  const gscPageFilter = page ? `AND ${gscPath} = ?3` : '';

  const [totals, pages, events, gsc] = await Promise.all([
    db
      .prepare(
        `SELECT
           (SELECT count(*) FROM sessions WHERE is_bot = 0 AND date(started_at) BETWEEN ?1 AND ?2) AS sessions,
           (SELECT count(*) FROM leads_snapshot WHERE date(created_at) BETWEEN ?1 AND ?2) AS leads`,
      )
      .bind(from, to)
      .first<{ sessions: number; leads: number }>(),
    withPage(
      db.prepare(
        `SELECT p.path,
           count(DISTINCT p.session_id) AS sessions,
           count(*) AS pageviews,
           round(avg(p.engaged_ms) / 1000.0, 1) AS avg_engaged_s,
           round(avg(p.max_scroll_pct), 0) AS avg_scroll_pct,
           count(DISTINCT CASE WHEN s.entry_page = p.path THEN s.id END) AS entries,
           count(DISTINCT l.lead_id) AS leads_from_viewing_sessions
         FROM pageviews p
         JOIN sessions s ON s.id = p.session_id AND s.is_bot = 0
         LEFT JOIN leads_snapshot l ON l.session_id = p.session_id
         WHERE date(p.at) BETWEEN ?1 AND ?2 ${pageFilter}
         GROUP BY p.path
         ORDER BY sessions DESC
         LIMIT 200`,
      ),
    ).all(),
    withPage(
      db.prepare(
        `SELECT e.name, count(*) AS events, count(DISTINCT e.session_id) AS sessions
         FROM events e
         JOIN sessions s ON s.id = e.session_id AND s.is_bot = 0
         WHERE date(e.at) BETWEEN ?1 AND ?2 ${page ? 'AND e.path = ?3' : ''}
         GROUP BY e.name
         ORDER BY sessions DESC`,
      ),
    ).all(),
    withPage(
      db.prepare(
        `SELECT g.page, g.query, sum(g.clicks) AS clicks, sum(g.impressions) AS impressions,
           round(sum(g.position * g.impressions) / max(sum(g.impressions), 1), 1) AS avg_position
         FROM gsc_daily g
         WHERE g.date BETWEEN ?1 AND ?2 ${gscPageFilter}
         GROUP BY g.page, g.query
         ORDER BY impressions DESC
         LIMIT 500`,
      ),
    ).all(),
  ]);

  return { range: { from, to, page }, totals, pages: pages.results, events: events.results, gsc: gsc.results };
}

// ---- Agent write-back (POST/PATCH /api/agent/*) ----

export interface NewReport {
  periodFrom: string;
  periodTo: string;
  summaryMd: string;
  findings?: unknown;
}
export async function insertReport(env: Env, r: NewReport): Promise<string> {
  const id = crypto.randomUUID();
  await env.ANALYTICS.prepare(`INSERT INTO ai_reports (id, period_from, period_to, summary_md, findings_json) VALUES (?1, ?2, ?3, ?4, ?5)`)
    .bind(id, r.periodFrom, r.periodTo, r.summaryMd, r.findings === undefined ? null : JSON.stringify(r.findings))
    .run();
  return id;
}

export interface NewChange {
  description: string;
  hypothesis: string;
  metric: string;
  baseline?: number | null;
  files?: string[];
  prUrl?: string | null;
}
export async function insertChange(env: Env, c: NewChange): Promise<string> {
  const id = crypto.randomUUID();
  await env.ANALYTICS.prepare(
    `INSERT INTO ai_changes (id, description, files, hypothesis, metric, baseline, pr_url) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  )
    .bind(id, c.description, c.files ? JSON.stringify(c.files) : null, c.hypothesis, c.metric, c.baseline ?? null, c.prUrl ?? null)
    .run();
  return id;
}

/** Fields the agent may set after creation. Column names are this fixed map, never request input. */
const CHANGE_PATCH_COLUMNS = {
  prUrl: 'pr_url',
  shippedAt: 'shipped_at',
  evaluatedAt: 'evaluated_at',
  result: 'result',
  baseline: 'baseline',
  files: 'files',
} as const;
export type ChangePatch = Partial<{
  prUrl: string | null;
  shippedAt: string | null;
  evaluatedAt: string | null;
  result: string | null;
  baseline: number | null;
  files: string[];
}>;

/** Returns false when no row has that id. */
export async function updateChange(env: Env, id: string, patch: ChangePatch): Promise<boolean> {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of Object.entries(CHANGE_PATCH_COLUMNS) as [keyof ChangePatch, string][]) {
    if (!(key in patch)) continue;
    const value = key === 'files' ? JSON.stringify(patch.files ?? []) : patch[key];
    values.push(value ?? null);
    sets.push(`${column} = ?${values.length}`);
  }
  if (sets.length === 0) {
    const row = await env.ANALYTICS.prepare(`SELECT 1 FROM ai_changes WHERE id = ?1`).bind(id).first();
    return row !== null;
  }
  values.push(id);
  const res = await env.ANALYTICS.prepare(`UPDATE ai_changes SET ${sets.join(', ')} WHERE id = ?${values.length}`)
    .bind(...values)
    .run();
  return (res.meta.changes ?? 0) > 0;
}
