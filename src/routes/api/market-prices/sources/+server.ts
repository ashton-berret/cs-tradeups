// GET /api/market-prices/sources
//
// Observed source presets for the market-price admin filter.

import { json, type RequestHandler } from '@sveltejs/kit';
import { listObservedMarketPriceSources } from '$lib/server/marketPrices/priceService';
import { toErrorResponse } from '$lib/server/http/errors';

export const GET: RequestHandler = async () => {
  try {
    return json(await listObservedMarketPriceSources());
  } catch (err) {
    return toErrorResponse(err);
  }
};
