/** Google Search Console (Search Analytics API). GSC data lags ~2-3 days, so the daily cron
 * re-pulls a rolling window and upserts on the natural key — see gsc_daily's PRIMARY KEY. */
import type { Env } from '../server/env';
import type { Collector, DateRange } from './types';
import { googleAccessToken, GSC_SCOPE } from './google-auth';

interface GscRow {
  keys: [string, string, string, string, string]; // date, query, page, device, country
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export const gscCollector: Collector = {
  id: 'gsc',
  label: 'Search Console',
  defaultRange(): DateRange {
    const to = new Date(Date.now() - 2 * 86_400_000); // GSC data isn't final for ~2-3 days
    const from = new Date(to.getTime() - 6 * 86_400_000);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  },
  async run(env: Env, range: DateRange) {
    if (!env.GOOGLE_SA_JSON || !env.GSC_SITE_URL) throw new Error('GOOGLE_SA_JSON / GSC_SITE_URL not configured');
    const token = await googleAccessToken(env, GSC_SCOPE);

    const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(env.GSC_SITE_URL)}/searchAnalytics/query`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        startDate: range.from,
        endDate: range.to,
        dimensions: ['date', 'query', 'page', 'device', 'country'],
        rowLimit: 25000,
      }),
    });
    if (!res.ok) throw new Error(`GSC query failed: ${res.status} ${await res.text()}`);
    const body = await res.json<{ rows?: GscRow[] }>();
    const rows = body.rows ?? [];
    if (rows.length === 0) return { rows: 0 };

    // Re-pulling this window replaces what was there before (GSC numbers firm up over a few days).
    await env.ANALYTICS.prepare(`DELETE FROM gsc_daily WHERE date BETWEEN ?1 AND ?2`).bind(range.from, range.to).run();
    const statements = rows.map((r) =>
      env.ANALYTICS.prepare(
        `INSERT INTO gsc_daily (date, query, page, device, country, clicks, impressions, ctr, position)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT (date, query, page, device, country) DO UPDATE SET
           clicks = excluded.clicks, impressions = excluded.impressions, ctr = excluded.ctr, position = excluded.position`,
      ).bind(r.keys[0], r.keys[1], r.keys[2], r.keys[3], r.keys[4], r.clicks, r.impressions, r.ctr, r.position),
    );
    // D1 batches are capped well above this, but split defensively for very large pulls.
    for (let i = 0; i < statements.length; i += 500) await env.ANALYTICS.batch(statements.slice(i, i + 500));
    return { rows: rows.length };
  },
};
