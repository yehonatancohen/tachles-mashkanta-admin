/** /agent: AI reports (newest first) and the change log the agent writes back to. */
import type { Env } from '../env';

export interface AiReport {
  id: string;
  createdAt: string;
  periodFrom: string;
  periodTo: string;
  summaryMd: string;
}
export async function listReports(env: Env, limit = 20): Promise<AiReport[]> {
  const { results } = await env.ANALYTICS.prepare(
    `SELECT id, created_at, period_from, period_to, summary_md FROM ai_reports ORDER BY created_at DESC LIMIT ?1`,
  )
    .bind(limit)
    .all<{ id: string; created_at: string; period_from: string; period_to: string; summary_md: string }>();
  return results.map((r) => ({ id: r.id, createdAt: r.created_at, periodFrom: r.period_from, periodTo: r.period_to, summaryMd: r.summary_md }));
}

export interface AiChange {
  id: string;
  createdAt: string;
  description: string;
  hypothesis: string;
  metric: string;
  baseline: number | null;
  evaluatedAt: string | null;
  result: string | null;
}
export async function listChanges(env: Env, limit = 50): Promise<AiChange[]> {
  const { results } = await env.ANALYTICS.prepare(
    `SELECT id, created_at, description, hypothesis, metric, baseline, evaluated_at, result FROM ai_changes ORDER BY created_at DESC LIMIT ?1`,
  )
    .bind(limit)
    .all<{ id: string; created_at: string; description: string; hypothesis: string; metric: string; baseline: number | null; evaluated_at: string | null; result: string | null }>();
  return results.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    description: r.description,
    hypothesis: r.hypothesis,
    metric: r.metric,
    baseline: r.baseline,
    evaluatedAt: r.evaluated_at,
    result: r.result,
  }));
}
