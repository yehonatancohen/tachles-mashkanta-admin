/**
 * Shared request/response helpers for the agent's write-back routes (/api/agent/*).
 *
 * Writes only accept `content-type: application/json`. Auth is Access (src/middleware.ts), and a
 * logged-in owner's browser carries the Access cookie — requiring JSON means a cross-site page
 * can't forge a write with a plain <form> post, since a JSON body forces a CORS preflight that
 * this app never answers.
 */

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export const badRequest = (error: string) => json({ error }, 400);

/** Parses a JSON object body, or returns an error Response. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | Response> {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return json({ error: 'content-type must be application/json' }, 415);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('invalid JSON');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return badRequest('body must be a JSON object');
  return body as Record<string, unknown>;
}

const MAX_TEXT = 100_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/;

/** Field validators: each returns the value, or throws a message naming the field. */
export const field = {
  text(body: Record<string, unknown>, key: string): string {
    const v = body[key];
    if (typeof v !== 'string' || !v.trim()) throw `${key} is required (non-empty string)`;
    if (v.length > MAX_TEXT) throw `${key} is too long`;
    return v;
  },
  date(body: Record<string, unknown>, key: string): string {
    const v = field.text(body, key);
    if (!DATE_RE.test(v)) throw `${key} must be YYYY-MM-DD`;
    return v;
  },
  optText(body: Record<string, unknown>, key: string): string | null {
    const v = body[key];
    if (v === null) return null;
    if (typeof v !== 'string' || v.length > MAX_TEXT) throw `${key} must be a string or null`;
    return v;
  },
  optDatetime(body: Record<string, unknown>, key: string): string | null {
    const v = field.optText(body, key);
    if (v !== null && !DATETIME_RE.test(v)) throw `${key} must be YYYY-MM-DD or YYYY-MM-DD HH:MM[:SS] (UTC)`;
    return v;
  },
  optUrl(body: Record<string, unknown>, key: string): string | null {
    const v = field.optText(body, key);
    if (v !== null && !/^https:\/\//.test(v)) throw `${key} must be an https URL`;
    return v;
  },
  optNumber(body: Record<string, unknown>, key: string): number | null {
    const v = body[key];
    if (v === null) return null;
    if (typeof v !== 'number' || !Number.isFinite(v)) throw `${key} must be a number or null`;
    return v;
  },
  optStringArray(body: Record<string, unknown>, key: string): string[] {
    const v = body[key];
    if (!Array.isArray(v) || !v.every((f) => typeof f === 'string')) throw `${key} must be an array of strings`;
    return v;
  },
};

/** Runs validators, turning a thrown message into a 400. */
export function validate<T>(fn: () => T): T | Response {
  try {
    return fn();
  } catch (e) {
    if (typeof e === 'string') return badRequest(e);
    throw e;
  }
}
