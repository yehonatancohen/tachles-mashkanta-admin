/** Overview "all site actions" chart: visits, pageviews and every beacon event, bucketed hourly
 * (last 7 days — the 24h view is sliced from it) and daily (everything retained, ~13 months). */
import type { Env } from '../env';

export interface ActivitySeries {
  key: string;
  values: number[];
}
export interface ActivityGrid {
  /** Bucket starts as UTC ISO strings. */
  buckets: string[];
  series: ActivitySeries[];
}
export interface ActivityData {
  hourly: ActivityGrid;
  daily: ActivityGrid;
}

const HOUR = 3_600_000;
const DAY = 86_400_000;

type Row = { bucket: string; key: string; n: number };

async function rows(env: Env, fmt: string, since: string): Promise<Row[]> {
  // One UNION so the bucket expression is identical across sources. `since` is compared as text
  // against D1's "YYYY-MM-DD HH:MM:SS" timestamps.
  const { results } = await env.ANALYTICS.prepare(
    `SELECT strftime('${fmt}', started_at) AS bucket, 'sessions' AS key, count(*) AS n
       FROM sessions WHERE started_at >= ?1 GROUP BY bucket
     UNION ALL
     SELECT strftime('${fmt}', at), 'pageviews', count(*) FROM pageviews WHERE at >= ?1 GROUP BY 1
     UNION ALL
     SELECT strftime('${fmt}', at), name, count(*) FROM events
       WHERE at >= ?1 AND name != 'page_view' GROUP BY 1, 2`,
  )
    .bind(since)
    .all<Row>();
  return results;
}

function grid(results: Row[], start: number, end: number, step: number, toKey: (t: number) => string): ActivityGrid {
  const buckets: string[] = [];
  const index = new Map<string, number>();
  for (let t = start; t <= end; t += step) {
    index.set(toKey(t), buckets.length);
    buckets.push(new Date(t).toISOString());
  }
  const byKey = new Map<string, number[]>();
  for (const r of results) {
    const i = index.get(r.bucket);
    if (i === undefined) continue;
    if (!byKey.has(r.key)) byKey.set(r.key, new Array(buckets.length).fill(0));
    byKey.get(r.key)![i] += r.n;
  }
  // Visits and pageviews always exist (even all-zero) so the chart has a baseline to show.
  for (const k of ['sessions', 'pageviews']) if (!byKey.has(k)) byKey.set(k, new Array(buckets.length).fill(0));
  return { buckets, series: [...byKey].map(([key, values]) => ({ key, values })) };
}

const sqlTs = (t: number) => new Date(t).toISOString().slice(0, 19).replace('T', ' ');

export async function activitySeries(env: Env): Promise<ActivityData> {
  const now = Date.now();
  const hourEnd = Math.floor(now / HOUR) * HOUR;
  const hourStart = hourEnd - 167 * HOUR;
  const dayEnd = Math.floor(now / DAY) * DAY;

  const [hourlyRows, dailyRows, first] = await Promise.all([
    rows(env, '%Y-%m-%d %H', sqlTs(hourStart)),
    rows(env, '%Y-%m-%d', '0000'),
    env.ANALYTICS.prepare(
      `SELECT min(t) AS t FROM (SELECT min(started_at) AS t FROM sessions UNION ALL SELECT min(at) FROM events)`,
    ).first<{ t: string | null }>(),
  ]);

  // Daily grid starts at the first recorded activity, but always spans at least 30 days.
  const firstDay = first?.t ? Date.parse(`${first.t.slice(0, 10)}T00:00:00Z`) : dayEnd;
  const dayStart = Math.min(firstDay, dayEnd - 29 * DAY);

  return {
    hourly: grid(hourlyRows, hourStart, hourEnd, HOUR, (t) => new Date(t).toISOString().slice(0, 13).replace('T', ' ')),
    daily: grid(dailyRows, dayStart, dayEnd, DAY, (t) => new Date(t).toISOString().slice(0, 10)),
  };
}
