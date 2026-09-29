/** Every timestamp in D1 is UTC `datetime('now')` ("YYYY-MM-DD HH:MM:SS", no zone). The owner reads
 * them in Israel time, so all display formatting goes through here. */

export const TZ = 'Asia/Jerusalem';

/** Parse a D1 UTC timestamp (or a plain YYYY-MM-DD date) as UTC. */
export const parseUtc = (s: string) => new Date(s.length <= 10 ? `${s}T00:00:00Z` : `${s.replace(' ', 'T')}Z`);

const dateTimeFmt = new Intl.DateTimeFormat('he-IL', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const dateFmt = new Intl.DateTimeFormat('he-IL', { timeZone: TZ, day: '2-digit', month: '2-digit', year: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

/** "29.09, 14:05" in Israel time. */
export const fmtDateTime = (s: string) => dateTimeFmt.format(parseUtc(s));
/** "29.09.26" in Israel time. */
export const fmtDate = (s: string) => dateFmt.format(parseUtc(s));
/** "14:05:33" in Israel time. */
export const fmtTime = (s: string) => timeFmt.format(parseUtc(s));

/** "45 שנ׳" / "3:20 דק׳" / "1:05 שע׳". */
export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} שנ׳`;
  if (s < 3600) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} דק׳`;
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} שע׳`;
}
