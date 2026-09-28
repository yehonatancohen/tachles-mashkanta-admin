/** Reads from the LEADS binding (mortgage-leads), read-only. Mirrors the stats query already in
 * mortgage-website/src/pages/admin/index.astro, extended with breakdowns by kind/source/day.
 * Every query skips is_test = 1: the owner's test leads (mortgage-website's /admin/test-mode/). */
import type { Env } from '../env';
import type { Period } from '../period';

export interface TierOutcomeRow {
  tier: string;
  n: number;
  avg_score: number | null;
  contacted: number;
  meeting: number;
  closed: number;
  not_relevant: number;
}

export async function tierOutcomes(env: Env): Promise<TierOutcomeRow[]> {
  const { results } = await env.LEADS.prepare(
    `SELECT tier, COUNT(*) AS n,
       SUM(outcome = 'contacted') AS contacted, SUM(outcome = 'meeting') AS meeting,
       SUM(outcome = 'closed') AS closed, SUM(outcome = 'not_relevant') AS not_relevant,
       ROUND(AVG(score), 1) AS avg_score
     FROM leads WHERE status != 'duplicate' AND is_test = 0 GROUP BY tier ORDER BY tier`,
  ).all<TierOutcomeRow>();
  return results;
}

export interface LeadRow {
  id: string;
  created_at: string;
  kind: string;
  first_name: string;
  phone: string;
  timing: string | null;
  tier: string;
  score: number | null;
  status: string;
  outcome: string | null;
  entry_page: string | null;
  session_id: string | null;
}

export interface LeadFilters {
  status?: string;
  tier?: string;
  kind?: string;
  from?: string;
  to?: string;
}

export async function listLeads(env: Env, filters: LeadFilters, limit = 200): Promise<LeadRow[]> {
  const clauses: string[] = ['is_test = 0'];
  const binds: unknown[] = [];
  let i = 1;
  if (filters.status && filters.status !== 'all') {
    clauses.push(`status = ?${i++}`);
    binds.push(filters.status);
  }
  if (filters.tier) {
    clauses.push(`tier = ?${i++}`);
    binds.push(filters.tier);
  }
  if (filters.kind) {
    clauses.push(`kind = ?${i++}`);
    binds.push(filters.kind);
  }
  if (filters.from) {
    clauses.push(`date(created_at) >= ?${i++}`);
    binds.push(filters.from);
  }
  if (filters.to) {
    clauses.push(`date(created_at) <= ?${i++}`);
    binds.push(filters.to);
  }
  const where = `WHERE ${clauses.join(' AND ')}`;
  binds.push(limit);
  const { results } = await env.LEADS.prepare(
    `SELECT id, created_at, kind, first_name, phone, timing, tier, score, status, outcome, entry_page, session_id
     FROM leads ${where} ORDER BY created_at DESC LIMIT ?${i}`,
  )
    .bind(...binds)
    .all<LeadRow>();
  return results;
}

export interface KindBreakdown {
  kind: string;
  n: number;
}
export async function leadsByKind(env: Env, period: Period): Promise<KindBreakdown[]> {
  const { results } = await env.LEADS.prepare(
    `SELECT kind, count(*) AS n FROM leads WHERE is_test = 0 AND date(created_at) BETWEEN ?1 AND ?2 GROUP BY kind`,
  )
    .bind(period.from, period.to)
    .all<KindBreakdown>();
  return results;
}

export interface DayBreakdown {
  date: string;
  n: number;
}
export async function leadsByDay(env: Env, period: Period): Promise<DayBreakdown[]> {
  const { results } = await env.LEADS.prepare(
    `SELECT date(created_at) AS date, count(*) AS n FROM leads
     WHERE is_test = 0 AND date(created_at) BETWEEN ?1 AND ?2 GROUP BY date ORDER BY date`,
  )
    .bind(period.from, period.to)
    .all<DayBreakdown>();
  return results;
}

export async function exportCsvRows(env: Env, filters: LeadFilters): Promise<LeadRow[]> {
  return listLeads(env, filters, 5000);
}
