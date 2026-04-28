// POST /api/market-prices/refresh
//
// Manual refresh for Steam-watchlist price observations and EV metrics that
// depend on local market price observations. Buying/selling remains entirely
// human-controlled; this only reads latest prices for the current watchlist.

import { json, type RequestHandler } from '@sveltejs/kit';
import { refreshMarketPricesAndDependents } from '$lib/server/marketPrices/refreshService';
import { toErrorResponse } from '$lib/server/http/errors';

export const POST: RequestHandler = async () => {
  try {
    return json(await refreshMarketPricesAndDependents());
  } catch (err) {
    return toErrorResponse(err);
  }
};
