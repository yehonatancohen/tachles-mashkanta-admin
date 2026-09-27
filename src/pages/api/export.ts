/**
 * GET /api/export?from&to — JSON for the AI agent. Auth is the same Access check every route
 * gets from src/middleware.ts; the agent authenticates with a Cloudflare Access service token
 * (the "Service Auth" policy on the Access app — see README.md).
 */
import type { APIRoute } from 'astro';
import { getEnv } from '../../server/env';

export const prerender = false;

const VIEWS = ['v_page_performance', 'v_source_performance', 'v_funnel_daily', 'v_search_opportunities', 'v_lead_journeys'] as const;

export const GET: APIRoute = async ({ url }) => {
  const env = getEnv();
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  const entries = await Promise.all(
    VIEWS.map(async (view) => {
      // View names are a fixed allowlist above, never user input, so this is safe to interpolate.
      const dateCol = view === 'v_funnel_daily' ? 'date' : null;
      const stmt =
        dateCol && from && to
          ? env.ANALYTICS.prepare(`SELECT * FROM ${view} WHERE ${dateCol} BETWEEN ?1 AND ?2`).bind(from, to)
          : env.ANALYTICS.prepare(`SELECT * FROM ${view}`);
      const { results } = await stmt.all();
      return [view, results] as const;
    }),
  );

  return new Response(JSON.stringify({ range: { from, to }, data: Object.fromEntries(entries) }, null, 2), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
