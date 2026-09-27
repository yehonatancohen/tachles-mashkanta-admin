/**
 * Custom Worker entry (wrangler.jsonc's `main`). Wraps the Astro/Cloudflare adapter's default
 * export (verified against @astrojs/cloudflare 14.3.2: entrypoints/server exports just
 * `{ fetch: handle }`) to add the `scheduled` handler the daily cron trigger needs — Astro's
 * adapter has no scheduled-handler hook of its own.
 */
import astroHandler from '@astrojs/cloudflare/entrypoints/server';
import { runAllCollectors } from './collectors';
import { getEnv } from './server/env';

export default {
  fetch: astroHandler.fetch,
  async scheduled(_controller: ScheduledController, _env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runAllCollectors(getEnv()));
  },
} satisfies ExportedHandler<Env>;
