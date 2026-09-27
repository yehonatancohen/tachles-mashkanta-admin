/** Precomputes daily_rollup from the raw first-party tables, so the overview page never scans
 * raw sessions/pageviews. Runs after every other collector in the daily cron. */
import type { Env } from '../server/env';
import type { Collector, DateRange } from './types';

export const rollupCollector: Collector = {
  id: 'rollup',
  label: 'צבירה יומית',
  defaultRange(): DateRange {
    const to = new Date();
    const from = new Date(to.getTime() - 6 * 86_400_000);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  },
  async run(env: Env, range: DateRange) {
    const sessionsByDay = await env.ANALYTICS.prepare(
      `SELECT date(started_at) AS date, count(*) AS n, count(lead_id) AS leads
       FROM sessions WHERE date(started_at) BETWEEN ?1 AND ?2 GROUP BY date`,
    )
      .bind(range.from, range.to)
      .all<{ date: string; n: number; leads: number }>();

    const statements = sessionsByDay.results.flatMap((r) => [
      env.ANALYTICS.prepare(
        `INSERT INTO daily_rollup (date, metric, dimension, value, n) VALUES (?1, 'sessions', '', ?2, ?2)
         ON CONFLICT (date, metric, dimension) DO UPDATE SET value = excluded.value, n = excluded.n`,
      ).bind(r.date, r.n),
      env.ANALYTICS.prepare(
        `INSERT INTO daily_rollup (date, metric, dimension, value, n) VALUES (?1, 'leads', '', ?2, ?2)
         ON CONFLICT (date, metric, dimension) DO UPDATE SET value = excluded.value, n = excluded.n`,
      ).bind(r.date, r.leads),
    ]);
    if (statements.length > 0) await env.ANALYTICS.batch(statements);
    return { rows: sessionsByDay.results.length };
  },
};
