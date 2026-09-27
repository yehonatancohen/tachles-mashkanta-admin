/** The global period picker: 7 / 28 / 90 days, or a custom range, always compared to the previous
 * equal-length period. Query params: ?days=7|28|90 or ?from=YYYY-MM-DD&to=YYYY-MM-DD. */
export interface Period {
  from: string; // YYYY-MM-DD, inclusive
  to: string; // YYYY-MM-DD, inclusive
  prevFrom: string;
  prevTo: string;
  days: number;
  label: string;
}

const fmt = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export function resolvePeriod(url: URL): Period {
  const today = new Date();
  const customFrom = url.searchParams.get('from');
  const customTo = url.searchParams.get('to');

  let from: Date;
  let to: Date;
  let label: string;

  if (customFrom && customTo && /^\d{4}-\d{2}-\d{2}$/.test(customFrom) && /^\d{4}-\d{2}-\d{2}$/.test(customTo)) {
    from = new Date(customFrom);
    to = new Date(customTo);
    label = 'מותאם אישית';
  } else {
    const days = Number(url.searchParams.get('days') ?? '28');
    const n = [7, 28, 90].includes(days) ? days : 28;
    to = today;
    from = addDays(today, -(n - 1));
    label = `${n} ימים אחרונים`;
  }

  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));

  return { from: fmt(from), to: fmt(to), prevFrom: fmt(prevFrom), prevTo: fmt(prevTo), days, label };
}

/** Percent change, formatted with sign; null when the baseline is zero (undefined change). */
export function delta(current: number, previous: number): { pct: number; sign: '+' | '-' | '' } | null {
  if (previous === 0) return current === 0 ? { pct: 0, sign: '' } : null;
  const pct = ((current - previous) / previous) * 100;
  return { pct: Math.round(Math.abs(pct) * 10) / 10, sign: pct > 0 ? '+' : pct < 0 ? '-' : '' };
}
