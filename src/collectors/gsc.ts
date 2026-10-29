/** Google Search Console (Search Analytics API). GSC data lags ~2-3 days, so the daily cron
 * re-pulls a rolling window and upserts on the natural key — see gsc_daily's PRIMARY KEY.
 *
 * A request that includes the `query` dimension silently drops anonymized (rare) queries, which on
 * a small site is most of the clicks. So we also pull without `query` and store each
 * date/page/device/country's leftover as a row with query = '' — sums over gsc_daily then match
 * the Search Console UI, and per-query views already skip query = ''. */
import type { Env } from '../server/env';
import type { Collector, DateRange } from './types';
import { googleAccessToken, GSC_SCOPE } from './google-auth';

interface GscRow {
  keys: string[]; // the requested dimensions, in order
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
    const siteUrl = env.GSC_SITE_URL;
    const token = await googleAccessToken(env, GSC_SCOPE);

    const query = async (dimensions: string[]) => {
      const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ startDate: range.from, endDate: range.to, dimensions, rowLimit: 25000 }),
      });
      if (!res.ok) throw new Error(`GSC query failed: ${res.status} ${await res.text()}`);
      return (await res.json<{ rows?: GscRow[] }>()).rows ?? [];
    };
    const byQuery = await query(['date', 'query', 'page', 'device', 'country']);
    const totals = await query(['date', 'page', 'device', 'country']);

    // Leftover per date/page/device/country = totals minus what the per-query rows account for.
    const known = new Map<string, { clicks: number; impressions: number; posImpr: number }>();
    for (const r of byQuery) {
      const k = [r.keys[0], r.keys[2], r.keys[3], r.keys[4]].join('|');
      const acc = known.get(k) ?? { clicks: 0, impressions: 0, posImpr: 0 };
      acc.clicks += r.clicks;
      acc.impressions += r.impressions;
      acc.posImpr += r.position * r.impressions;
      known.set(k, acc);
    }
    const rows: GscRow[] = [...byQuery];
    for (const t of totals) {
      const acc = known.get(t.keys.join('|')) ?? { clicks: 0, impressions: 0, posImpr: 0 };
      const clicks = Math.max(0, t.clicks - acc.clicks);
      const impressions = Math.max(0, t.impressions - acc.impressions);
      if (clicks === 0 && impressions === 0) continue;
      const position = impressions > 0 ? Math.max(1, (t.position * t.impressions - acc.posImpr) / impressions) : t.position;
      rows.push({ keys: [t.keys[0], '', t.keys[1], t.keys[2], t.keys[3]], clicks, impressions, ctr: impressions > 0 ? clicks / impressions : 0, position });
    }
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
