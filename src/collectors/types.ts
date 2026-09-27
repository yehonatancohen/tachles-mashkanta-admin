import type { Env } from '../server/env';

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;
}

export interface RunOptions {
  manual?: boolean;
}

export interface CollectorResult {
  rows: number;
}

/** A pluggable data source. Adding a new one (e.g. a future ad platform) means implementing
 * this interface and registering it in index.ts — no schema change required unless the new
 * source needs its own table (see clarity_daily's long format for a way to avoid even that). */
export interface Collector {
  id: string;
  label: string;
  /** The default rolling window this collector re-pulls each run (upserts, so re-pulling is safe). */
  defaultRange(): DateRange;
  run(env: Env, range: DateRange, options: RunOptions): Promise<CollectorResult>;
}
