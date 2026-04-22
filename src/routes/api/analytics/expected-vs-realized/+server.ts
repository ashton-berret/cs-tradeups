// GET /api/analytics/expected-vs-realized[?from=...&to=...&planId=...]
//
// Expected-vs-realized series for the dashboard chart. Only executions
// with a recorded sale are included. All filters are optional.
//
// `from` / `to` accept any string Date can parse (ISO preferred).
//
// Response:
//   200 EvRealizedPoint[]

import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { getExpectedVsRealized } from '$lib/server/analytics/analyticsService';
import { toErrorResponse } from '$lib/server/http/errors';

const querySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  planId: z.string().optional(),
});

export const GET: RequestHandler = async ({ url }) => {
  try {
    const range = querySchema.parse(Object.fromEntries(url.searchParams));
    const rows = await getExpectedVsRealized(range);
    return json(rows);
  } catch (err) {
    return toErrorResponse(err);
  }
};
