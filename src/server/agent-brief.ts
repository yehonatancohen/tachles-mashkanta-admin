/**
 * The short, owner-facing version of an agent run: one headline, a few plain one-liners and the
 * things the owner should click. The agent writes it as `findings.brief` (see the conversion-review
 * skill, Step 7). Reports written before that existed have none, so the same shape is derived from
 * the change log instead — never from the report's Markdown, which is too free-form to summarise.
 */
import type { AiChange, AiReport } from './queries/agent';

export type Tone = 'good' | 'attention' | 'info';
export interface BriefPoint {
  tone: Tone;
  text: string;
}
export interface BriefAction {
  label: string;
  url: string;
  /** Small print next to the button, e.g. "PR #5". */
  note: string | null;
}
export interface Brief {
  headline: string;
  points: BriefPoint[];
  actions: BriefAction[];
}

const MAX_POINTS = 4;
const MAX_ACTIONS = 3;
const TONES: readonly Tone[] = ['good', 'attention', 'info'];

/** A PR the owner still has to review: opened, not merged, not closed out. */
export const isAwaitingReview = (c: AiChange) => !!c.prUrl && !c.shippedAt && !c.evaluatedAt;
/** Merged and live, waiting for enough data to measure. */
export const isLive = (c: AiChange) => !!c.shippedAt && !c.evaluatedAt;
/** Closed without ever shipping (PR rejected, or a proposal that was retired). */
export const isDropped = (c: AiChange) => !!c.evaluatedAt && !c.shippedAt;
export const isIdea = (c: AiChange) => !c.prUrl && !c.shippedAt && !c.evaluatedAt;

/** "PR #5" from a GitHub pull URL, or null for anything else (e.g. a compare link). */
export function prLabel(url: string): string | null {
  const m = /\/pull\/(\d+)/.exec(url);
  return m ? `PR #${m[1]}` : null;
}

/** The agent's descriptions run long and name files; the first sentence, without paths, is enough
 * for a one-liner. A sentence never ends inside a quoted title ("הגדלת משכנתא: לשיפוץ…"). */
export function firstSentence(text: string, max = 90): string {
  const flat = text
    .replace(/[`*]/g, '')
    .replace(/\s+ב-\S*\/\S*?(?=[:,.]?(?:\s|$))/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  let end = flat.length;
  let quoted = false;
  for (let i = 0; i < flat.length; i++) {
    if (flat[i] === '"' || flat[i] === '״') quoted = !quoted;
    else if (!quoted && i > 15 && /[.!?:]/.test(flat[i]!) && (i + 1 === flat.length || flat[i + 1] === ' ')) {
      end = i;
      break;
    }
  }
  const sentence = flat.slice(0, end);
  return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const cleanText = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
};
const httpsUrl = (v: unknown): string | null => (typeof v === 'string' && /^https:\/\/\S+$/.test(v) ? v : null);

/** What the agent wrote, with anything malformed dropped. Null when there's no usable headline. */
export function writtenBrief(findings: unknown): Brief | null {
  const raw = isRecord(findings) ? findings.brief : null;
  if (!isRecord(raw)) return null;
  const headline = cleanText(raw.headline, 140);
  if (!headline) return null;

  const points: BriefPoint[] = [];
  for (const p of Array.isArray(raw.highlights) ? raw.highlights : []) {
    const text = cleanText(isRecord(p) ? p.text : p, 200);
    if (!text) continue;
    const tone = isRecord(p) && TONES.includes(p.tone as Tone) ? (p.tone as Tone) : 'info';
    points.push({ tone, text });
  }

  const actions: BriefAction[] = [];
  for (const a of Array.isArray(raw.actions) ? raw.actions : []) {
    if (!isRecord(a)) continue;
    const label = cleanText(a.label, 60);
    const url = httpsUrl(a.url);
    if (label && url) actions.push({ label, url, note: prLabel(url) });
  }

  return { headline, points: points.slice(0, MAX_POINTS), actions: actions.slice(0, MAX_ACTIONS) };
}

/** The things waiting on the owner right now, straight from the change log. */
function pendingActions(findings: unknown, changes: AiChange[]): BriefAction[] {
  const actions: BriefAction[] = changes
    .filter(isAwaitingReview)
    .map((c) => ({ label: 'לבדוק ולאשר את השינוי', url: c.prUrl!, note: prLabel(c.prUrl!) }));
  const dataPr = isRecord(findings) && isRecord(findings.dataPr) ? httpsUrl(findings.dataPr.url) : null;
  if (dataPr) actions.push({ label: 'לאשר עדכון נתוני שוק', url: dataPr, note: prLabel(dataPr) });
  return actions.slice(0, MAX_ACTIONS);
}

function derivedBrief(findings: unknown, changes: AiChange[]): Brief {
  const waiting = changes.filter(isAwaitingReview);
  const live = changes.filter(isLive).length;
  const ideas = changes.filter(isIdea).length;
  const actions = pendingActions(findings, changes);

  const points: BriefPoint[] = waiting.map((c) => ({ tone: 'attention', text: `מחכה לאישור שלך: ${firstSentence(c.description)}` }));
  if (isRecord(findings) && findings.mode === 'research') {
    points.push({ tone: 'info', text: 'עדיין מעט מדי תנועה באתר כדי להסיק מסקנות מהנתונים' });
  }
  if (live > 0) {
    points.push({ tone: 'good', text: live === 1 ? 'שינוי אחד כבר באוויר ומחכה לנתונים' : `${live} שינויים כבר באוויר ומחכים לנתונים` });
  }
  if (ideas > 0) {
    points.push({ tone: 'info', text: ideas === 1 ? 'יש עוד רעיון אחד שמחכה לתורו' : `יש עוד ${ideas} רעיונות שמחכים לתורם` });
  }

  return {
    headline: actions.length > 0 ? 'הכנתי שינוי לאתר, והוא מחכה לאישור שלך' : 'אין כרגע משהו שמחכה לך',
    points: points.slice(0, MAX_POINTS),
    actions,
  };
}

/**
 * The brief for the latest report. Buttons the agent wrote win; otherwise they come from the change
 * log, so an open PR always gets its button even if the agent forgot to list it.
 */
export function latestBrief(report: AiReport, changes: AiChange[]): Brief {
  const written = writtenBrief(report.findings);
  if (!written) return derivedBrief(report.findings, changes);
  return written.actions.length > 0 ? written : { ...written, actions: pendingActions(report.findings, changes) };
}

/** Cookie holding the id of the newest report the owner has opened on /agent/. */
export const SEEN_COOKIE = 'ai_seen';
