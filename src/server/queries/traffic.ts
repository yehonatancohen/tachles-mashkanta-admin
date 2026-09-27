/** /traffic: first-party channels/sources first, GA4 numbers alongside for cross-checking. */
import type { Env } from '../env';
import type { Period } from '../period';

export interface ChannelRow {
  source: string;
  medium: string;
  sessions: number;
  engagedPct: number;
  leads: number;
  cvPct: number;
}

export async function channels(env: Env, period: Period): Promise<ChannelRow[]> {
  const { results } = await env.ANALYTICS.prepare(
    `SELECT
       coalesce(nullif(utm_source, ''), CASE WHEN referrer_host IS NOT NULL AND referrer_host != '' THEN referrer_host ELSE '(direct)' END) AS source,
       coalesce(nullif(utm_medium, ''), 'none') AS medium,
       count(*) AS sessions,
       sum(engaged_ms > 10000) AS engaged,
       count(lead_id) AS leads
     FROM sessions WHERE date(started_at) BETWEEN ?1 AND ?2
     GROUP BY source, medium ORDER BY sessions DESC`,
  )
    .bind(period.from, period.to)
    .all<{ source: string; medium: string; sessions: number; engaged: number; leads: number }>();
  return results.map((r) => ({
    source: r.source,
    medium: r.medium,
    sessions: r.sessions,
    engagedPct: r.sessions > 0 ? Math.round((r.engaged / r.sessions) * 1000) / 10 : 0,
    leads: r.leads,
    cvPct: r.sessions > 0 ? Math.round((r.leads / r.sessions) * 1000) / 10 : 0,
  }));
}

export interface DeviceRow {
  device: string;
  sessions: number;
  leads: number;
}
export async function byDevice(env: Env, period: Period): Promise<DeviceRow[]> {
  const { results } = await env.ANALYTICS.prepare(
    `SELECT coalesce(nullif(device, ''), 'unknown') AS device, count(*) AS sessions, count(lead_id) AS leads
     FROM sessions WHERE date(started_at) BETWEEN ?1 AND ?2 GROUP BY device ORDER BY sessions DESC`,
  )
    .bind(period.from, period.to)
    .all<DeviceRow>();
  return results;
}

export interface CountryRow {
  country: string;
  sessions: number;
}
export async function byCountry(env: Env, period: Period, limit = 10): Promise<CountryRow[]> {
  const { results } = await env.ANALYTICS.prepare(
    `SELECT coalesce(nullif(country, ''), '—') AS country, count(*) AS sessions
     FROM sessions WHERE date(started_at) BETWEEN ?1 AND ?2 GROUP BY country ORDER BY sessions DESC LIMIT ?3`,
  )
    .bind(period.from, period.to, limit)
    .all<CountryRow>();
  return results;
}

export interface Ga4Row {
  page: string;
  source: string;
  medium: string;
  device: string;
  sessions: number;
  users: number;
  keyEvents: number;
}
export async function ga4Rows(env: Env, period: Period, limit = 20): Promise<Ga4Row[]> {
  const { results } = await env.ANALYTICS.prepare(
    `SELECT page, source, medium, device, sum(sessions) AS sessions, sum(users) AS users, sum(key_events) AS key_events
     FROM ga4_daily WHERE date BETWEEN ?1 AND ?2
     GROUP BY page, source, medium, device ORDER BY sessions DESC LIMIT ?3`,
  )
    .bind(period.from, period.to, limit)
    .all<{ page: string; source: string; medium: string; device: string; sessions: number; users: number; key_events: number }>();
  return results.map((r) => ({ page: r.page, source: r.source, medium: r.medium, device: r.device, sessions: r.sessions, users: r.users, keyEvents: r.key_events }));
}
