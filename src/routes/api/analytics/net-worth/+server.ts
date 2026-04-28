// GET /api/analytics/net-worth
//
// Weekly inventory net-worth time series for the dashboard hero chart.

import { json, type RequestHandler } from '@sveltejs/kit';
import { getInventoryNetWorthSeries } from '$lib/server/analytics/analyticsService';
import { toErrorResponse } from '$lib/server/http/errors';

export const GET: RequestHandler = async () => {
  try {
    const series = await getInventoryNetWorthSeries();
    return json(series);
  } catch (err) {
    return toErrorResponse(err);
  }
};
