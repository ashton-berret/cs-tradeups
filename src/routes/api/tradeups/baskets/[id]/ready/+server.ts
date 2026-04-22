// POST /api/tradeups/baskets/[id]/ready
//
// Mark a basket as READY. Delegates to basketService.markReady, which runs
// the full readiness evaluation (10 items, uniform matching rarity, float
// and collection presence) and rejects with a descriptive error if any
// check fails.
//
// Response codes:
//   200  BasketDTO
//   404  NotFoundError
//   409  ConflictError (readiness check failure)

import { json, type RequestHandler } from '@sveltejs/kit';
import { markReady } from '$lib/server/tradeups/basketService';
import { toErrorResponse } from '$lib/server/http/errors';

export const POST: RequestHandler = async ({ params }) => {
  try {
    const basket = await markReady(params.id!);
    return json(basket);
  } catch (err) {
    return toErrorResponse(err);
  }
};
