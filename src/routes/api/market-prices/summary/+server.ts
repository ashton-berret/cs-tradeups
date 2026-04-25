// GET /api/market-prices/summary
//
// Grouped operator summary for local price observations under the active
// search/source/currency filters.

import { json, type RequestHandler } from '@sveltejs/kit';
import { marketPriceLatestListSchema } from '$lib/schemas/marketPrice';
import { summarizeLatestMarketPriceObservations } from '$lib/server/marketPrices/priceService';
import { coerceSearchParams } from '$lib/server/http/query';
import { toErrorResponse } from '$lib/server/http/errors';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const filter = marketPriceLatestListSchema.parse(
      coerceSearchParams(url.searchParams, marketPriceLatestListSchema),
    );
    return json(await summarizeLatestMarketPriceObservations(filter));
  } catch (err) {
    return toErrorResponse(err);
  }
};
