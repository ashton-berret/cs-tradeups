// GET /api/market-prices/latest
//
// Latest local price observations. With lookup params this returns one latest
// matching observation; otherwise it returns a paginated operator list.

import { json, type RequestHandler } from '@sveltejs/kit';
import { marketPriceLatestListSchema, marketPriceLookupSchema } from '$lib/schemas/marketPrice';
import {
  getLatestMarketPriceForCatalogExterior,
  getLatestMarketPriceForMarketHashName,
  listLatestMarketPriceObservations,
} from '$lib/server/marketPrices/priceService';
import { toErrorResponse, ValidationError } from '$lib/server/http/errors';
import { coerceSearchParams } from '$lib/server/http/query';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const hasLookup =
      url.searchParams.has('marketHashName') ||
      url.searchParams.has('catalogSkinId') ||
      url.searchParams.has('exterior');

    if (hasLookup) {
      const query = marketPriceLookupSchema.parse(
        coerceSearchParams(url.searchParams, marketPriceLookupSchema),
      );

      if (query.marketHashName) {
        return json(await getLatestMarketPriceForMarketHashName(query.marketHashName, query.currency));
      }

      if (query.catalogSkinId && query.exterior) {
        return json(
          await getLatestMarketPriceForCatalogExterior({
            catalogSkinId: query.catalogSkinId,
            exterior: query.exterior,
            currency: query.currency,
          }),
        );
      }

      throw new ValidationError('Provide marketHashName, or catalogSkinId plus exterior');
    }

    const filter = marketPriceLatestListSchema.parse(
      coerceSearchParams(url.searchParams, marketPriceLatestListSchema),
    );
    return json(await listLatestMarketPriceObservations(filter));
  } catch (err) {
    return toErrorResponse(err);
  }
};
