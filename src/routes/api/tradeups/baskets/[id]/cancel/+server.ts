// POST /api/tradeups/baskets/[id]/cancel
//
// Cancel a basket. Terminal. Releases every reserved inventory item
// back to HELD in the same transaction.
//
// Response codes:
//   200  BasketDTO
//   404  NotFoundError
//   409  ConflictError (basket already terminal)

import { json, type RequestHandler } from '@sveltejs/kit';
import { cancel } from '$lib/server/tradeups/basketService';
import { toErrorResponse } from '$lib/server/http/errors';

export const POST: RequestHandler = async ({ params }) => {
  try {
    const basket = await cancel(params.id!);
    return json(basket);
  } catch (err) {
    return toErrorResponse(err);
  }
};
