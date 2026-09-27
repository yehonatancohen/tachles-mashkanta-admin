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
        const url = typeof info.name === 'string' ? info.name : String(info.URL ?? '');
        const device = typeof info.Device === 'string' ? info.Device : '';
        const raw = info.sessionsCount ?? info.subTotal ?? info.totalCount ?? info.sessionsWithMetricPercentage ?? info.value;
        const value = typeof raw === 'number' ? raw : Number(raw ?? 0);
        if (!Number.isFinite(value)) continue;
        statements.push(
          env.ANALYTICS.prepare(
            `INSERT INTO clarity_daily (date, url, device, metric, value) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT (date, url, device, metric) DO UPDATE SET value = excluded.value`,
          ).bind(today, url, device, entry.metricName, value),
        );
      }
    }
    if (statements.length > 0) await env.ANALYTICS.batch(statements);
    return { rows: statements.length };
  },
};
