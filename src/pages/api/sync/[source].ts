/** POST /api/sync/:source — manual "run now" from /sources/. Redirects back with the result. */
import type { APIRoute } from 'astro';
import { getEnv } from '../../../server/env';
import { runCollector, COLLECTOR_IDS } from '../../../collectors';

export const prerender = false;

export const POST: APIRoute = async ({ params, redirect }) => {
  const source = params.source ?? '';
  if (!COLLECTOR_IDS.includes(source as (typeof COLLECTOR_IDS)[number])) {
    return new Response('Unknown source', { status: 404 });
  }
  const env = getEnv();
  await runCollector(env, source as (typeof COLLECTOR_IDS)[number], { manual: true });
  return redirect('/sources/', 303);
};
