/** Google Analytics 4 Data API. Metric name: GA4 renamed "conversions" to "keyEvents" — the
 * column here is key_events to match. */
import type { Env } from '../server/env';
import type { Collector, DateRange } from './types';
import { googleAccessToken, GA4_SCOPE } from './google-auth';

interface Ga4ReportRow {
  dimensionValues: { value: string }[];
  metricValues: { value: string }[];
}
interface Ga4Report {
  rows?: Ga4ReportRow[];
}

export const ga4Collector: Collector = {
  id: 'ga4',
  label: 'GA4',
  defaultRange(): DateRange {
    const to = new Date();
    const from = new Date(to.getTime() - 6 * 86_400_000);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  },
  async run(env: Env, range: DateRange) {
    if (!env.GOOGLE_SA_JSON || !env.GA4_PROPERTY_ID) throw new Error('GOOGLE_SA_JSON / GA4_PROPERTY_ID not configured');
    const token = await googleAccessToken(env, GA4_SCOPE);

    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/${env.GA4_PROPERTY_ID}:runReport`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        dateRanges: [{ startDate: range.from, endDate: range.to }],
        dimensions: [{ name: 'date' }, { name: 'pagePath' }, { name: 'sessionSource' }, { name: 'sessionMedium' }, { name: 'deviceCategory' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'engagedSessions' }, { name: 'averageSessionDuration' }, { name: 'keyEvents' }],
        limit: 100000,
      }),
    });
    if (!res.ok) throw new Error(`GA4 runReport failed: ${res.status} ${await res.text()}`);
    const body = await res.json<Ga4Report>();
    const rows = body.rows ?? [];
    if (rows.length === 0) return { rows: 0 };

    await env.ANALYTICS.prepare(`DELETE FROM ga4_daily WHERE date BETWEEN ?1 AND ?2`).bind(range.from, range.to).run();
    const statements = rows.map((r) => {
      const [rawDate, page, source, medium, device] = r.dimensionValues.map((d) => d.value);
      // GA4's `date` dimension comes back as YYYYMMDD (no separators) — normalize to
      // YYYY-MM-DD so it matches every other table's date format (and this collector's own
      // `range.from`/`range.to`, which the DELETE above compares as plain strings).
      const date = /^\d{8}$/.test(rawDate ?? '') ? `${rawDate!.slice(0, 4)}-${rawDate!.slice(4, 6)}-${rawDate!.slice(6, 8)}` : rawDate;
      const [sessions, users, engagedSessions, avgEngagementS, keyEvents] = r.metricValues.map((m) => Number(m.value));
      return env.ANALYTICS.prepare(
        `INSERT INTO ga4_daily (date, page, source, medium, device, sessions, users, engaged_sessions, avg_engagement_s, key_events)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT (date, page, source, medium, device) DO UPDATE SET
           sessions = excluded.sessions, users = excluded.users, engaged_sessions = excluded.engaged_sessions,
           avg_engagement_s = excluded.avg_engagement_s, key_events = excluded.key_events`,
      ).bind(date, page, source, medium, device, sessions, users, engagedSessions, avgEngagementS, keyEvents);
    });
    for (let i = 0; i < statements.length; i += 500) await env.ANALYTICS.batch(statements.slice(i, i + 500));
    return { rows: rows.length };
  },
};
