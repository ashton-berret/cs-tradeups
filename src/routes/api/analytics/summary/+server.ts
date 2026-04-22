// GET /api/analytics/summary
//
// Dashboard KPI snapshot. See analyticsService.getDashboardSummary for
// exact semantics of each count.
//
// Response:
//   200 DashboardSummary

import { json, type RequestHandler } from '@sveltejs/kit';
import { getDashboardSummary } from '$lib/server/analytics/analyticsService';
import { toErrorResponse } from '$lib/server/http/errors';

export const GET: RequestHandler = async () => {
  try {
    const summary = await getDashboardSummary();
    return json(summary);
  } catch (err) {
    return toErrorResponse(err);
  }
};
