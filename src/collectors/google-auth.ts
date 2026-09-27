/**
 * Google service-account OAuth2 (JWT bearer flow), signed with WebCrypto — no googleapis/jose
 * dependency, matching the no-extra-deps style of mortgage-website/src/server/crypto.ts.
 * Used by ga4.ts and gsc.ts. The service account must be a Viewer on the GA4 property and a
 * user on the Search Console property (see README.md).
 */
import type { Env } from '../server/env';

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

interface TokenCache {
  token: string;
  expiresAt: number; // epoch ms
  scope: string;
}
let cache: TokenCache | null = null;

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function parseServiceAccount(env: Env): ServiceAccount {
  if (!env.GOOGLE_SA_JSON) throw new Error('GOOGLE_SA_JSON is not set');
  const parsed = JSON.parse(env.GOOGLE_SA_JSON) as ServiceAccount;
  if (!parsed.client_email || !parsed.private_key) throw new Error('GOOGLE_SA_JSON is missing client_email/private_key');
  return parsed;
}

/** Returns a bearer token valid for the given scope, fetching a fresh one when the cache is
 * stale or the scope changed (GA4 and GSC use different scopes). */
export async function googleAccessToken(env: Env, scope: string): Promise<string> {
  if (cache && cache.scope === scope && cache.expiresAt > Date.now() + 60_000) return cache.token;

  const sa = parseServiceAccount(env);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = { iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now };
  const enc = new TextEncoder();
  const signingInput = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(enc.encode(JSON.stringify(claims)))}`;

  const key = await crypto.subtle.importKey('pkcs8', pemToPkcs8(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(signingInput));
  const jwt = `${signingInput}.${b64url(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  const body = await res.json<{ access_token: string; expires_in: number }>();
  cache = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000, scope };
  return body.access_token;
}

export const GA4_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
export const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
