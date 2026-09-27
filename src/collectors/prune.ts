/** Retention: raw pageviews/events older than 13 months are deleted; aggregates (daily_rollup,
 * ga4_daily, gsc_daily, clarity_daily) are kept indefinitely — see DESIGN.md / README.md. */
import type { Env } from '../server/env';
import type { Collector, DateRange } from './types';

const RETENTION_DAYS = 396; // 13 months

export const pruneCollector: Collector = {
  id: 'prune',
  label: 'ניקוי נתונים ישנים',
  defaultRange(): DateRange {
    const to = new Date();
    return { from: to.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  },
  async run(env: Env) {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString().slice(0, 10);
    const [pv, ev, sessionsRes] = await Promise.all([
      env.ANALYTICS.prepare(`DELETE FROM pageviews WHERE date(at) < ?1`).bind(cutoff).run(),
      env.ANALYTICS.prepare(`DELETE FROM events WHERE date(at) < ?1`).bind(cutoff).run(),
      env.ANALYTICS.prepare(`DELETE FROM sessions WHERE date(started_at) < ?1 AND lead_id IS NULL`).bind(cutoff).run(),
    ]);
    const rows = (pv.meta.changes ?? 0) + (ev.meta.changes ?? 0) + (sessionsRes.meta.changes ?? 0);
    return { rows };
  },
};
