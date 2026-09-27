/** Copies a name/phone-free snapshot of recent leads from mortgage-leads into leads_snapshot,
 * so the AI agent can join traffic/behavior to lead outcomes without touching PII. Upserts on
 * lead_id, so re-running (the daily cron re-pulls a window) is safe. */
import type { Env } from '../server/env';
import type { Collector, DateRange } from './types';

interface LeadForSnapshot {
  id: string;
  created_at: string;
  kind: string;
  tier: string;
  score: number | null;
  status: string;
  outcome: string | null;
  session_id: string | null;
  entry_page: string | null;
  utm_json: string | null;
}

export const leadsSnapshotCollector: Collector = {
  id: 'leads_snapshot',
  label: 'לידים (מקומי)',
  defaultRange(): DateRange {
    const to = new Date();
    const from = new Date(to.getTime() - 6 * 86_400_000); // 7-day rolling window: outcomes change after delivery
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  },
  async run(env: Env, range: DateRange) {
    const { results } = await env.LEADS.prepare(
      `SELECT id, created_at, kind, tier, score, status, outcome, session_id, entry_page, utm_json
       FROM leads WHERE date(created_at) BETWEEN ?1 AND ?2`,
    )
      .bind(range.from, range.to)
      .all<LeadForSnapshot>();

    if (results.length === 0) return { rows: 0 };

    const statements = results.map((l) => {
      let utm: { utm_source?: string; utm_medium?: string; utm_campaign?: string } = {};
      try {
        utm = l.utm_json ? JSON.parse(l.utm_json) : {};
      } catch {
        /* malformed utm_json on an old row: snapshot without it rather than failing the batch */
      }
      return env.ANALYTICS.prepare(
        `INSERT INTO leads_snapshot (lead_id, created_at, kind, tier, score, status, outcome, session_id, entry_page, utm_source, utm_medium, utm_campaign)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
         ON CONFLICT (lead_id) DO UPDATE SET tier = excluded.tier, score = excluded.score, status = excluded.status,
           outcome = excluded.outcome, session_id = excluded.session_id`,
      ).bind(l.id, l.created_at, l.kind, l.tier, l.score, l.status, l.outcome, l.session_id, l.entry_page, utm.utm_source ?? null, utm.utm_medium ?? null, utm.utm_campaign ?? null);
    });
    await env.ANALYTICS.batch(statements);
    return { rows: results.length };
  },
};
