// GET /api/analytics/plan-performance[?planId=...]
//
// Per-plan execution rollups. Omit `planId` to get one row per plan that
// has at least one execution; pass `planId` to get the single row.
//
// Response:
//   200 PlanPerformanceRow[]

import { json, type RequestHandler } from '@sveltejs/kit';
import { getPlanPerformance } from '$lib/server/analytics/analyticsService';
import { toErrorResponse } from '$lib/server/http/errors';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const planId = url.searchParams.get('planId') ?? undefined;
    const rows = await getPlanPerformance(planId);
    return json(rows);
  } catch (err) {
    return toErrorResponse(err);
  }
};
