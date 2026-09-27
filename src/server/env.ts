/**
 * Server environment. Bindings come from wrangler.jsonc, secrets from `wrangler secret put`
 * (or .dev.vars locally).
 */
import { env as cfEnv } from 'cloudflare:workers';

export interface Env {
  /** Owned by this project (tachles-analytics). Migrations live in ./migrations. */
  ANALYTICS: D1Database;
  /** mortgage-leads. Read-only by convention — this project never runs migrations against it. */
  LEADS: D1Database;

  /** Cloudflare Access team domain, e.g. "your-team.cloudflareaccess.com". Required in production. */
  ACCESS_TEAM_DOMAIN?: string;
  /** The Access application's AUD tag. Required in production. */
  ACCESS_AUD?: string;
  /** Dev-only bypass for Access checks. Must only ever be set in .dev.vars, never as a deployed secret. */
  DEV_AUTH_BYPASS?: string;

  /** Google service account JSON (Viewer on the GA4 property, user on the GSC property). */
  GOOGLE_SA_JSON?: string;
  GA4_PROPERTY_ID?: string;
  GSC_SITE_URL?: string;
  /** Microsoft Clarity Data Export API token. 10 calls/day quota. */
  CLARITY_API_TOKEN?: string;
}

export const getEnv = (): Env => cfEnv as unknown as Env;
