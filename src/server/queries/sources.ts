/** /sources: connector status cards. */
import type { Env } from '../env';

export interface SourceStatus {
  id: string;
  label: string;
  configured: boolean;
  lastRun: { at: string; status: string; rows: number; error: string | null } | null;
}

const SOURCES: { id: string; label: string; configuredKeys: (keyof Env)[] }[] = [
  { id: 'leads_snapshot', label: 'לידים (mortgage-leads)', configuredKeys: [] },
  { id: 'ga4', label: 'GA4', configuredKeys: ['GOOGLE_SA_JSON', 'GA4_PROPERTY_ID'] },
  { id: 'gsc', label: 'Search Console', configuredKeys: ['GOOGLE_SA_JSON', 'GSC_SITE_URL'] },
  { id: 'clarity', label: 'Microsoft Clarity', configuredKeys: ['CLARITY_API_TOKEN'] },
  { id: 'rollup', label: 'צבירה יומית', configuredKeys: [] },
];

export async function sourceStatuses(env: Env): Promise<SourceStatus[]> {
  const { results } = await env.ANALYTICS.prepare(
    `SELECT sr.source, sr.started_at, sr.status, sr.rows, sr.error
     FROM sync_runs sr
     INNER JOIN (SELECT source, max(started_at) AS started_at FROM sync_runs GROUP BY source) latest
       ON latest.source = sr.source AND latest.started_at = sr.started_at`,
  ).all<{ source: string; started_at: string; status: string; rows: number; error: string | null }>();
  const latest = new Map(results.map((r) => [r.source, r]));

  return SOURCES.map((s) => {
    const run = latest.get(s.id);
    return {
      id: s.id,
      label: s.label,
      configured: s.configuredKeys.every((k) => Boolean(env[k])),
      lastRun: run ? { at: run.started_at, status: run.status, rows: run.rows, error: run.error } : null,
    };
  });
}
