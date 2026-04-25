// POST /api/market-prices/refresh
//
// Manual refresh for EV metrics that depend on local market price observations.
// This does not import prices; it re-evaluates open candidates and recomputes
// active basket metrics against the currently stored observations.

import { json, type RequestHandler } from '@sveltejs/kit';
import { refreshAfterMarketPriceImport } from '$lib/server/marketPrices/refreshService';
import { toErrorResponse } from '$lib/server/http/errors';

export const POST: RequestHandler = async () => {
  try {
    return json(await refreshAfterMarketPriceImport());
  } catch (err) {
    return toErrorResponse(err);
  }
};
