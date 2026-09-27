/** /search: Google Search Console data pulled by src/collectors/gsc.ts. */
import type { Env } from '../env';
import type { Period } from '../period';

export interface SearchDaily {
  date: string;
  clicks: number;
  impressions: number;
  ctrPct: number;
  position: number;
}
export async function searchDaily(env: Env, period: Period): Promise<SearchDaily[]> {
  const { results } = await env.ANALYTICS.prepare(
    `SELECT date, sum(clicks) AS clicks, sum(impressions) AS impressions,
       round(100.0 * sum(clicks) / max(sum(impressions), 1), 2) AS ctr_pct,
       round(avg(position), 1) AS position
     FROM gsc_daily WHERE date BETWEEN ?1 AND ?2 GROUP BY date ORDER BY date`,
  )
    .bind(period.from, period.to)
    .all<{ date: string; clicks: number; impressions: number; ctr_pct: number; position: number }>();
  return results.map((r) => ({ date: r.date, clicks: r.clicks, impressions: r.impressions, ctrPct: r.ctr_pct, position: r.position }));
}

export interface TopQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctrPct: number;
  position: number;
}
export async function topQueries(env: Env, period: Period, limit = 25): Promise<TopQuery[]> {
  const { results } = await env.ANALYTICS.prepare(
    `SELECT query, sum(clicks) AS clicks, sum(impressions) AS impressions,
       round(100.0 * sum(clicks) / max(sum(impressions), 1), 2) AS ctr_pct, round(avg(position), 1) AS position
     FROM gsc_daily WHERE date BETWEEN ?1 AND ?2 AND query != ''
     GROUP BY query ORDER BY clicks DESC LIMIT ?3`,
  )
    .bind(period.from, period.to, limit)
    .all<{ query: string; clicks: number; impressions: number; ctr_pct: number; position: number }>();
  return results.map((r) => ({ query: r.query, clicks: r.clicks, impressions: r.impressions, ctrPct: r.ctr_pct, position: r.position }));
}

export interface Opportunity {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctrPct: number;
  avgPosition: number;
}
export async function searchOpportunities(env: Env, limit = 30): Promise<Opportunity[]> {
  const { results } = await env.ANALYTICS.prepare(`SELECT * FROM v_search_opportunities LIMIT ?1`).bind(limit).all<{
    query: string;
    page: string;
    clicks: number;
    impressions: number;
    ctr_pct: number;
    avg_position: number;
  }>();
  return results.map((r) => ({ query: r.query, page: r.page, clicks: r.clicks, impressions: r.impressions, ctrPct: r.ctr_pct, avgPosition: r.avg_position }));
}
