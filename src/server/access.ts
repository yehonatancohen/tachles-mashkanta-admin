/**
 * Cloudflare Access verification. Access already blocks unauthenticated requests at the edge,
 * but the app re-verifies the forwarded JWT itself (defense in depth: a misconfigured route,
 * a Worker reachable by a path Access doesn't cover, etc. must still fail closed).
 *
 * Two identities can present a valid JWT here: a human (the "Allow <owner email>" policy) and
 * the AI agent's service token (the "Service Auth" policy) used against /api/export,
 * /api/agent/* and /api/sync/*. Both are treated as authorized; only the human is shown in the UI's "signed in as".
 */
import type { Env } from './env';

const enc = new TextEncoder();

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
}

interface JwksCache {
  keys: Jwk[];
  fetchedAt: number;
}

// Module-level cache: persists across requests within the same Worker isolate. A cold start
// re-fetches, which is fine — this endpoint is cheap and cached by Cloudflare's own edge too.
let jwksCache: JwksCache | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

function b64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=');
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function decodeJwtParts(token: string) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];
  try {
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(headerB64)));
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
    return { header, payload, signingInput: `${headerB64}.${payloadB64}`, signature: b64urlToBytes(sigB64) };
  } catch {
    return null;
  }
}

async function fetchJwks(teamDomain: string): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs fetch failed: ${res.status}`);
  const body = await res.json<{ keys: Jwk[] }>();
  jwksCache = { keys: body.keys, fetchedAt: Date.now() };
  return body.keys;
}

async function importRsaKey(jwk: Jwk): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, [
    'verify',
  ]);
}

export interface AccessIdentity {
  email: string;
  /** True when this JWT came from a service token (the AI agent), not a human session. */
  isServiceToken: boolean;
}

/**
 * Verifies the Cf-Access-Jwt-Assertion header. Returns null (unauthorized) on any failure,
 * including missing configuration — this fails closed, the same way mortgage-website's
 * adminAuthorized() does for its ADMIN_PASSWORD.
 */
export async function verifyAccess(env: Env, request: Request): Promise<AccessIdentity | null> {
  if (env.DEV_AUTH_BYPASS === '1') return { email: 'dev@local', isServiceToken: false };
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;

  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) return null;

  const decoded = decodeJwtParts(token);
  if (!decoded) return null;
  const { header, payload, signingInput, signature } = decoded;
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) return null;
  if (typeof payload.iat === 'number' && payload.iat > now + 60) return null;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD)) return null;
  if (payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;

  let keys: Jwk[];
  try {
    keys = await fetchJwks(env.ACCESS_TEAM_DOMAIN);
  } catch {
    return null;
  }
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  const key = await importRsaKey(jwk);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature as BufferSource, enc.encode(signingInput) as BufferSource);
  if (!ok) return null;

  return {
    email: typeof payload.email === 'string' ? payload.email : 'service-token',
    isServiceToken: typeof payload.common_name === 'string' || typeof payload.email !== 'string',
  };
}

export const unauthorized = () => new Response('Unauthorized', { status: 403, headers: { 'cache-control': 'no-store' } });
