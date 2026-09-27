/** /behavior: per-page engagement (first-party) + Clarity's rage/dead-click style signals. */
import type { Env } from '../env';
import type { Period } from '../period';

export interface PagePerf {
  path: string;
  sessions: number;
  pageviews: number;
  avgEngagedS: number;
  avgScrollPct: number;
  exitRatePct: number;
}
export async function pagePerformance(env: Env, period: Period, limit = 30): Promise<PagePerf[]> {
  // Exit rate: "the chronologically last pageview of its session" (matches v_page_performance in
  // migrations/0001_init.sql) — NOT the beacon's own `exit` flag, which fires on every full-page
  // navigation on this multi-page site and would otherwise read as ~100%.
  const { results } = await env.ANALYTICS.prepare(
    `SELECT p.path, count(DISTINCT p.session_id) AS sessions, count(*) AS pageviews,
       round(avg(p.engaged_ms) / 1000.0, 1) AS avg_engaged_s, round(avg(p.max_scroll_pct), 0) AS avg_scroll_pct,
       round(100.0 * sum(CASE WHEN p.at = last_pv.max_at THEN 1 ELSE 0 END) / count(*), 1) AS exit_rate_pct
     FROM pageviews p
     JOIN (SELECT session_id, max(at) AS max_at FROM pageviews GROUP BY session_id) last_pv ON last_pv.session_id = p.session_id
     WHERE date(p.at) BETWEEN ?1 AND ?2
     GROUP BY p.path ORDER BY pageviews DESC LIMIT ?3`,
  )
    .bind(period.from, period.to, limit)
    .all<{ path: string; sessions: number; pageviews: number; avg_engaged_s: number | null; avg_scroll_pct: number | null; exit_rate_pct: number }>();
  return results.map((r) => ({
    path: r.path,
    sessions: r.sessions,
    pageviews: r.pageviews,
    avgEngagedS: r.avg_engaged_s ?? 0,
    avgScrollPct: r.avg_scroll_pct ?? 0,
    exitRatePct: r.exit_rate_pct,
  }));
}

export interface ClarityMetricRow {
  url: string;
  metric: string;
  value: number;
}
export async function claritySignals(env: Env, period: Period, limit = 40): Promise<ClarityMetricRow[]> {
  const { results } = await env.ANALYTICS.prepare(
    `SELECT url, metric, sum(value) AS value FROM clarity_daily
     WHERE date BETWEEN ?1 AND ?2 AND metric IN ('RageClickCount','DeadClickCount','QuickbackClick','ExcessiveScroll','ScriptErrorCount')
     GROUP BY url, metric HAVING value > 0 ORDER BY value DESC LIMIT ?3`,
  )
    .bind(period.from, period.to, limit)
    .all<ClarityMetricRow>();
  return results;
}

export interface EventCount {
  name: string;
  n: number;
}
export async function topEvents(env: Env, period: Period, limit = 15): Promise<EventCount[]> {
  const { results } = await env.ANALYTICS.prepare(
    `SELECT name, count(*) AS n FROM events WHERE date(at) BETWEEN ?1 AND ?2
     GROUP BY name ORDER BY n DESC LIMIT ?3`,
  )
    .bind(period.from, period.to, limit)
    .all<EventCount>();
  return results;
}
