/** Collector registry + runner. Adding a new data source means implementing Collector (types.ts)
 * and adding it to COLLECTORS below — nothing else needs to change. */
import type { Env } from '../server/env';
import type { Collector, RunOptions } from './types';
import { leadsSnapshotCollector } from './leads-snapshot';
import { ga4Collector } from './ga4';
import { gscCollector } from './gsc';
import { clarityCollector } from './clarity';
import { rollupCollector } from './rollup';
import { pruneCollector } from './prune';

// Order matters: leads_snapshot/ga4/gsc/clarity populate raw data, rollup summarizes it,
// prune runs last so it never deletes something a same-run collector just wrote.
const COLLECTORS: Collector[] = [leadsSnapshotCollector, gscCollector, ga4Collector, clarityCollector, rollupCollector, pruneCollector];

export const COLLECTOR_IDS = COLLECTORS.map((c) => c.id) as [string, ...string[]];

const byId = new Map(COLLECTORS.map((c) => [c.id, c]));

async function ranSuccessfullyToday(env: Env, source: string): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const row = await env.ANALYTICS.prepare(`SELECT 1 FROM sync_runs WHERE source = ?1 AND status = 'ok' AND date(started_at) = ?2 LIMIT 1`)
    .bind(source, today)
    .first();
  return row !== null;
}

/** Runs one collector, recording a sync_runs row regardless of outcome. Clarity additionally
 * refuses to run again once it has already succeeded today (its 10 calls/day quota is easy to
 * exhaust from "run now" clicks — see clarity.ts). */
export async function runCollector(env: Env, id: string, options: RunOptions = {}): Promise<void> {
  const collector = byId.get(id);
  if (!collector) throw new Error(`Unknown collector: ${id}`);

  if (collector.id === 'clarity' && (await ranSuccessfullyToday(env, 'clarity'))) {
    await env.ANALYTICS.prepare(`INSERT INTO sync_runs (id, source, finished_at, status, error) VALUES (?1, ?2, datetime('now'), 'skipped', ?3)`)
      .bind(crypto.randomUUID(), 'clarity', 'already ran successfully today — quota guard')
      .run();
    return;
  }

  const runId = crypto.randomUUID();
  const range = collector.defaultRange();
  await env.ANALYTICS.prepare(`INSERT INTO sync_runs (id, source, status, range_from, range_to) VALUES (?1, ?2, 'running', ?3, ?4)`)
    .bind(runId, collector.id, range.from, range.to)
    .run();

  try {
    const result = await collector.run(env, range, options);
    await env.ANALYTICS.prepare(`UPDATE sync_runs SET finished_at = datetime('now'), status = 'ok', rows = ?1 WHERE id = ?2`).bind(result.rows, runId).run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await env.ANALYTICS.prepare(`UPDATE sync_runs SET finished_at = datetime('now'), status = 'error', error = ?1 WHERE id = ?2`).bind(message.slice(0, 2000), runId).run();
    // Swallowed deliberately: one source failing (e.g. an expired Google token) must not stop
    // the others from running in the same cron tick.
  }
}

/** Runs every collector in order, isolating failures per source. Called from the daily cron
 * (src/worker.ts) and available for a full manual re-run if ever needed. */
export async function runAllCollectors(env: Env): Promise<void> {
  for (const collector of COLLECTORS) {
    await runCollector(env, collector.id);
  }
}
