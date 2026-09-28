/** POST /api/agent/reports — the agent writes a run's report. Body: { periodFrom, periodTo, summaryMd, findings? } */
import type { APIRoute } from 'astro';
import { getEnv } from '../../../server/env';
import { field, json, readJsonObject, validate } from '../../../server/agent-api';
import { insertReport } from '../../../server/queries/agent';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await readJsonObject(request);
  if (body instanceof Response) return body;

  const report = validate(() => ({
    periodFrom: field.date(body, 'periodFrom'),
    periodTo: field.date(body, 'periodTo'),
    summaryMd: field.text(body, 'summaryMd'),
    findings: body.findings,
  }));
  if (report instanceof Response) return report;

  const id = await insertReport(getEnv(), report);
  return json({ id }, 201);
};
