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
