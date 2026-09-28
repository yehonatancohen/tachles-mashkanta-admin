/**
 * PATCH /api/agent/changes/:id — the agent updates a change later: attaches the PR, marks it
 * shipped once the PR is merged, and fills in the evaluation. Only the keys present are updated.
 * Body: any of { prUrl, shippedAt, evaluatedAt, result, baseline, files }
 */
import type { APIRoute } from 'astro';
import { getEnv } from '../../../../server/env';
import { field, json, readJsonObject, validate } from '../../../../server/agent-api';
import { updateChange, type ChangePatch } from '../../../../server/queries/agent';

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request }) => {
  const id = params.id ?? '';
  const body = await readJsonObject(request);
  if (body instanceof Response) return body;

  const patch = validate(() => {
    const p: ChangePatch = {};
    if ('prUrl' in body) p.prUrl = field.optUrl(body, 'prUrl');
    if ('shippedAt' in body) p.shippedAt = field.optDatetime(body, 'shippedAt');
    if ('evaluatedAt' in body) p.evaluatedAt = field.optDatetime(body, 'evaluatedAt');
    if ('result' in body) p.result = field.optText(body, 'result');
    if ('baseline' in body) p.baseline = field.optNumber(body, 'baseline');
    if ('files' in body) p.files = field.optStringArray(body, 'files');
    return p;
  });
  if (patch instanceof Response) return patch;

  const found = await updateChange(getEnv(), id, patch);
  return found ? json({ id }) : json({ error: 'not found' }, 404);
};
