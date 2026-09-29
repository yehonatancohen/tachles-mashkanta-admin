import type { Env } from '../env';
import type { Period } from '../period';

export interface Kpis {
  sessions: number;
  leads: number;
  cvPct: number;
  tierAPct: number;
  avgEngagedS: number;
}

async function kpisFor(env: Env, from: string, to: string): Promise<Kpis> {
  const s = await env.ANALYTICS.prepare(
    `SELECT count(*) AS sessions, count(lead_id) AS leads, round(avg(engaged_ms) / 1000.0, 1) AS avg_engaged_s
     FROM sessions WHERE date(started_at) BETWEEN ?1 AND ?2`,
  )
    .bind(from, to)
    .first<{ sessions: number; leads: number; avg_engaged_s: number | null }>();
  const tier = await env.ANALYTICS.prepare(
    `SELECT count(*) AS n, sum(l.tier = 'A') AS a
     FROM leads_snapshot l WHERE date(l.created_at) BETWEEN ?1 AND ?2`,
  )
    .bind(from, to)
    .first<{ n: number; a: number | null }>();

  const sessions = s?.sessions ?? 0;
  const leads = s?.leads ?? 0;
  const tierN = tier?.n ?? 0;
  return {
    sessions,
    leads,
    cvPct: sessions > 0 ? Math.round((leads / sessions) * 1000) / 10 : 0,
    tierAPct: tierN > 0 ? Math.round(((tier?.a ?? 0) / tierN) * 1000) / 10 : 0,
    avgEngagedS: s?.avg_engaged_s ?? 0,
  };
}

export async function overviewKpis(env: Env, period: Period): Promise<{ current: Kpis; previous: Kpis }> {
  const [current, previous] = await Promise.all([
    kpisFor(env, period.from, period.to),
    kpisFor(env, period.prevFrom, period.prevTo),
  ]);
  return { current, previous };
}

const FUNNEL_STEPS = ['page_view', 'step1_complete', 'result_view', 'lead_gate_view', 'lead_submitted'] as const;
const FUNNEL_LABELS: Record<string, string> = {
  page_view: 'כניסה לאתר',
  step1_complete: 'שלב ראשון הושלם',
  result_view: 'צפייה בתוצאה',
  lead_gate_view: 'צפייה בטופס',
  lead_submitted: 'הליד נשלח',
};

export interface FunnelStep {
  step: string;
  label: string;
  sessions: number;
}

export async function funnel(env: Env, period: Period): Promise<FunnelStep[]> {
  const { results } = await env.ANALYTICS.prepare(
    `SELECT name, count(DISTINCT session_id) AS sessions FROM events
     WHERE date(at) BETWEEN ?1 AND ?2 AND name IN (${FUNNEL_STEPS.map((_, i) => `?${i + 3}`).join(',')})
     GROUP BY name`,
  )
    .bind(period.from, period.to, ...FUNNEL_STEPS)
    .all<{ name: string; sessions: number }>();
  const byName = new Map(results.map((r) => [r.name, r.sessions]));
  return FUNNEL_STEPS.map((step) => ({ step, label: FUNNEL_LABELS[step] ?? step, sessions: byName.get(step) ?? 0 }));
}

export interface SourceRow {
  source: string;
  medium: string;
  sessions: number;
  leads: number;
  cvPct: number;
}

export async function topSources(env: Env, period: Period, limit = 5): Promise<SourceRow[]> {
  const { results } = await env.ANALYTICS.prepare(
    `SELECT
       coalesce(nullif(utm_source, ''), CASE WHEN referrer_host IS NOT NULL AND referrer_host != '' THEN referrer_host ELSE '(direct)' END) AS source,
       coalesce(nullif(utm_medium, ''), 'none') AS medium,
       count(*) AS sessions, count(lead_id) AS leads
     FROM sessions WHERE date(started_at) BETWEEN ?1 AND ?2
     GROUP BY source, medium ORDER BY sessions DESC LIMIT ?3`,
  )
    .bind(period.from, period.to, limit)
    .all<{ source: string; medium: string; sessions: number; leads: number }>();
  return results.map((r) => ({ ...r, cvPct: r.sessions > 0 ? Math.round((r.leads / r.sessions) * 1000) / 10 : 0 }));
}

export interface LandingPageRow {
  page: string;
  sessions: number;
  leads: number;
  cvPct: number;
}

export async function topLandingPages(env: Env, period: Period, limit = 5): Promise<LandingPageRow[]> {
  const { results } = await env.ANALYTICS.prepare(
    `SELECT entry_page AS page, count(*) AS sessions, count(lead_id) AS leads
     FROM sessions WHERE date(started_at) BETWEEN ?1 AND ?2
     GROUP BY entry_page ORDER BY sessions DESC LIMIT ?3`,
  )
    .bind(period.from, period.to, limit)
    .all<{ page: string; sessions: number; leads: number }>();
  return results.map((r) => ({ ...r, cvPct: r.sessions > 0 ? Math.round((r.leads / r.sessions) * 1000) / 10 : 0 }));
}

export interface LatestReport {
  id: string;
  createdAt: string;
  periodFrom: string;
  periodTo: string;
  summaryMd: string;
}

export async function latestReport(env: Env): Promise<LatestReport | null> {
  const row = await env.ANALYTICS.prepare(
    `SELECT id, created_at, period_from, period_to, summary_md FROM ai_reports ORDER BY created_at DESC LIMIT 1`,
  ).first<{ id: string; created_at: string; period_from: string; period_to: string; summary_md: string }>();
  if (!row) return null;
  return { id: row.id, createdAt: row.created_at, periodFrom: row.period_from, periodTo: row.period_to, summaryMd: row.summary_md };
}
