// GET /api/analytics/activity[?limit=N]
//
// Recent workflow events for the dashboard activity feed. Live-derived
// from the core rows (no audit table yet — see PLAN.md Open Questions).
//
// `limit` defaults to 20, clamped to [1, 100] by the service.
//
// Response:
//   200 ActivityEntry[]

import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { getRecentActivity } from '$lib/server/analytics/analyticsService';
import { toErrorResponse } from '$lib/server/http/errors';

const querySchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
});

export const GET: RequestHandler = async ({ url }) => {
  try {
    const { limit } = querySchema.parse(Object.fromEntries(url.searchParams));
    const rows = await getRecentActivity(limit);
    return json(rows);
  } catch (err) {
    return toErrorResponse(err);
  }
};
