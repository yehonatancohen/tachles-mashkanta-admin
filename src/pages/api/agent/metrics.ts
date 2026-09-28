/**
 * GET /api/agent/metrics/?from=YYYY-MM-DD&to=YYYY-MM-DD[&page=/path/] — windowed totals,
 * per-page first-party metrics, funnel events and raw GSC page×query rows (no impression
 * threshold). The agent calls it twice (before/after a change's shipped_at) to evaluate it.
 */
import type { APIRoute } from 'astro';
import { getEnv } from '../../../server/env';
import { badRequest, json } from '../../../server/agent-api';
import { windowMetrics } from '../../../server/queries/agent';

export const prerender = false;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GET: APIRoute = async ({ url }) => {
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const page = url.searchParams.get('page');
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return badRequest('from and to are required, as YYYY-MM-DD');
  if (from > to) return badRequest('from must be on or before to');
  if (page !== null && !page.startsWith('/')) return badRequest('page must be a path starting with /');

  return json(await windowMetrics(getEnv(), from, to, page));
};
