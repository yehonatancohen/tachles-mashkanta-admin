/**
 * GET /api/agent/state — what the agent needs at the start of a run, in one call: per-source sync
 * freshness (so it can refuse to analyze stale data), the latest report (its period_to is where
 * the next period starts), and the change log (open PRs, shipped-but-unevaluated changes).
 */
import type { APIRoute } from 'astro';
import { getEnv } from '../../../server/env';
import { json } from '../../../server/agent-api';
import { sourceStatuses } from '../../../server/queries/sources';
import { listChanges, listReports } from '../../../server/queries/agent';

export const prerender = false;

export const GET: APIRoute = async () => {
  const env = getEnv();
  const [sources, reports, changes] = await Promise.all([sourceStatuses(env), listReports(env, 1), listChanges(env, 200)]);
  return json({ now: new Date().toISOString(), sources, latestReport: reports[0] ?? null, changes });
};
