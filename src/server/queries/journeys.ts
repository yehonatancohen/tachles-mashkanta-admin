/** /journeys: session list + a single session's pageview/event timeline. */
import type { Env } from '../env';
import type { Period } from '../period';

export interface JourneyRow {
  id: string;
  startedAt: string;
  entryPage: string;
  utmSource: string | null;
  device: string | null;
  country: string | null;
  pageviews: number;
  engagedMs: number;
  leadId: string | null;
}

export interface JourneyFilters {
  converted?: boolean;
  source?: string;
  device?: string;
}

export async function listJourneys(env: Env, period: Period, filters: JourneyFilters, limit = 100): Promise<JourneyRow[]> {
  const clauses = ['date(started_at) BETWEEN ?1 AND ?2'];
  const binds: unknown[] = [period.from, period.to];
  let i = 3;
  if (filters.converted) clauses.push('lead_id IS NOT NULL');
  if (filters.source) {
    clauses.push(`utm_source = ?${i++}`);
    binds.push(filters.source);
  }
  if (filters.device) {
    clauses.push(`device = ?${i++}`);
    binds.push(filters.device);
  }
  binds.push(limit);
  const { results } = await env.ANALYTICS.prepare(
    `SELECT id, started_at, entry_page, utm_source, device, country, pageviews, engaged_ms, lead_id
     FROM sessions WHERE ${clauses.join(' AND ')} ORDER BY started_at DESC LIMIT ?${i}`,
  )
    .bind(...binds)
    .all<{ id: string; started_at: string; entry_page: string; utm_source: string | null; device: string | null; country: string | null; pageviews: number; engaged_ms: number; lead_id: string | null }>();
  return results.map((r) => ({
    id: r.id,
    startedAt: r.started_at,
    entryPage: r.entry_page,
    utmSource: r.utm_source,
    device: r.device,
    country: r.country,
    pageviews: r.pageviews,
    engagedMs: r.engaged_ms,
    leadId: r.lead_id,
  }));
}

export interface TimelineEntry {
  at: string;
  kind: 'pageview' | 'event';
  label: string;
  detail?: string;
}

export async function sessionTimeline(env: Env, sessionId: string): Promise<TimelineEntry[]> {
  const [pv, ev] = await Promise.all([
    env.ANALYTICS.prepare(`SELECT at, path, engaged_ms, max_scroll_pct FROM pageviews WHERE session_id = ?1 ORDER BY at`)
      .bind(sessionId)
      .all<{ at: string; path: string; engaged_ms: number; max_scroll_pct: number }>(),
    env.ANALYTICS.prepare(`SELECT at, name, props_json FROM events WHERE session_id = ?1 ORDER BY at`)
      .bind(sessionId)
      .all<{ at: string; name: string; props_json: string | null }>(),
  ]);
  const timeline: TimelineEntry[] = [
    ...pv.results.map((r) => ({ at: r.at, kind: 'pageview' as const, label: r.path, detail: `${Math.round(r.engaged_ms / 1000)}s · גלילה ${r.max_scroll_pct}%` })),
    ...ev.results.map((r) => ({ at: r.at, kind: 'event' as const, label: r.name, detail: r.props_json ?? undefined })),
  ];
  return timeline.sort((a, b) => a.at.localeCompare(b.at));
}

export interface SessionDetail {
  id: string;
  entry_page: string;
  utm_source: string | null;
  device: string | null;
  country: string | null;
  lead_id: string | null;
}

export async function sessionById(env: Env, sessionId: string): Promise<SessionDetail | null> {
  return env.ANALYTICS.prepare(`SELECT id, entry_page, utm_source, device, country, lead_id FROM sessions WHERE id = ?1`)
    .bind(sessionId)
    .first<SessionDetail>();
}
