/**
 * Gates EVERY route (pages, /api/sync/*, /api/export) behind Cloudflare Access — not page by
 * page. Access itself blocks unauthenticated browsers before they reach the Worker, but a
 * request that somehow reaches us without a valid JWT is rejected here too (fail closed).
 */
import { defineMiddleware } from 'astro:middleware';
import { getEnv } from './server/env';
import { unauthorized, verifyAccess } from './server/access';

export const onRequest = defineMiddleware(async (context, next) => {
  const env = getEnv();
  const identity = await verifyAccess(env, context.request);
  if (!identity) return unauthorized();
  context.locals.access = identity;
  return next();
});
