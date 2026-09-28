/**
 * POST /api/agent/changes — the agent records a proposed/implemented change.
 * Body: { description, hypothesis, metric, baseline?, files?, prUrl? }
 */
import type { APIRoute } from 'astro';
import { getEnv } from '../../../server/env';
import { field, json, readJsonObject, validate } from '../../../server/agent-api';
import { insertChange } from '../../../server/queries/agent';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await readJsonObject(request);
  if (body instanceof Response) return body;

  const change = validate(() => ({
    description: field.text(body, 'description'),
    hypothesis: field.text(body, 'hypothesis'),
    metric: field.text(body, 'metric'),
    baseline: 'baseline' in body ? field.optNumber(body, 'baseline') : null,
    files: 'files' in body ? field.optStringArray(body, 'files') : undefined,
    prUrl: 'prUrl' in body ? field.optUrl(body, 'prUrl') : null,
  }));
  if (change instanceof Response) return change;

  const id = await insertChange(getEnv(), change);
  return json({ id }, 201);
};
