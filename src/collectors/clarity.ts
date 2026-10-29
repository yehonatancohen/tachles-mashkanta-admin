/**
 * Microsoft Clarity Data Export API. Two hard constraints from the API itself (verify against
 * https://learn.microsoft.com/clarity/data-export-api when Clarity changes it):
 *  - only numOfDays 1-3 is accepted (no arbitrary date range) — it returns a rolling aggregate,
 *    not a per-day breakdown, so every value here is stamped with today's date;
 *  - the project is limited to 10 calls/day total. index.ts's runner enforces "don't call again
 *    if today's run already succeeded" on top of this — this collector does not track the quota
 *    itself, since sync_runs (checked by the runner) is the single source of truth for "did we
 *    already call today".
 */
import type { Env } from '../server/env';
import type { Collector, DateRange } from './types';

// Metrics we store; anything else Clarity returns is ignored (the long clarity_daily table
// means adding a metric later needs no migration — just add its name here).
const TRACKED_METRICS = new Set(['Traffic', 'EngagementTime', 'ScrollDepth', 'RageClickCount', 'DeadClickCount', 'QuickbackClick', 'ExcessiveScroll', 'ScriptErrorCount']);

interface ClarityDimensionValue {
  name?: string; // e.g. a URL when dimension1=URL
  [metric: string]: unknown;
}
// Which field holds each metric's value. Every metric's rows also carry `sessionsCount` (all
// sessions for that URL/device), so reading that first stored the session count under every
// metric name. Click/scroll signals use `subTotal` (occurrences); Traffic and the averages have
// their own fields. Values come back as strings or numbers.
const VALUE_FIELD: Record<string, string> = {
  Traffic: 'totalSessionCount',
  EngagementTime: 'activeTime',
  ScrollDepth: 'averageScrollDepth',
};
// Extra values worth keeping from the same rows, stored under their own metric names.
const EXTRA_FIELDS: Record<string, Record<string, string>> = {
  Traffic: { TrafficBotSessions: 'totalBotSessionCount', TrafficUsers: 'distinctUserCount' },
};

/** The dimension's key casing isn't documented consistently (URL / Url), so match loosely. */
const field = (info: ClarityDimensionValue, name: string) => {
  const key = Object.keys(info).find((k) => k.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : info[key];
};

interface ClarityMetricEntry {
  metricName: string;
  information: ClarityDimensionValue[];
}

export const clarityCollector: Collector = {
  id: 'clarity',
  label: 'Microsoft Clarity',
  defaultRange(): DateRange {
    const today = new Date().toISOString().slice(0, 10);
    return { from: today, to: today };
  },
  async run(env: Env) {
    if (!env.CLARITY_API_TOKEN) throw new Error('CLARITY_API_TOKEN not configured');
    const today = new Date().toISOString().slice(0, 10);

    const res = await fetch('https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=1&dimension1=URL&dimension2=Device', {
      headers: { authorization: `Bearer ${env.CLARITY_API_TOKEN}` },
    });
    if (!res.ok) throw new Error(`Clarity export failed: ${res.status} ${await res.text()}`);
    const body = await res.json<ClarityMetricEntry[]>();

    const statements = [];
    for (const entry of body) {
      if (!TRACKED_METRICS.has(entry.metricName)) continue;
      for (const info of entry.information) {
        const url = String(field(info, 'URL') ?? info.name ?? '');
        const device = String(field(info, 'Device') ?? '');
        const values: Record<string, string> = { [entry.metricName]: VALUE_FIELD[entry.metricName] ?? 'subTotal', ...EXTRA_FIELDS[entry.metricName] };
        for (const [metric, key] of Object.entries(values)) {
          const raw = field(info, key);
          if (raw === undefined || raw === null) continue;
          const value = Number(raw);
          if (!Number.isFinite(value)) continue;
          statements.push(
            env.ANALYTICS.prepare(
              `INSERT INTO clarity_daily (date, url, device, metric, value) VALUES (?1, ?2, ?3, ?4, ?5)
               ON CONFLICT (date, url, device, metric) DO UPDATE SET value = excluded.value`,
            ).bind(today, url, device, metric, value),
          );
        }
      }
    }
    if (statements.length > 0) await env.ANALYTICS.batch(statements);
    return { rows: statements.length };
  },
};
