// POST /api/tradeups/baskets/[id]/items
//
// Add an inventory item to a basket slot. Service runs the full
// transaction (HELD -> RESERVED_FOR_BASKET, slot assignment, eager
// metric recompute). See addBasketItemSchema for body shape.
//
// Response codes:
//   200  BasketDTO (refreshed)
//   400  ValidationError
//   404  NotFoundError (basket or inventory id)
//   409  ConflictError (slot occupied / item not HELD / rarity mismatch / basket full)

import { json, type RequestHandler } from '@sveltejs/kit';
import { addBasketItemSchema } from '$lib/schemas/basket';
import { addItem } from '$lib/server/tradeups/basketService';
import { toErrorResponse } from '$lib/server/http/errors';

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    const input = addBasketItemSchema.parse(body);
    const basket = await addItem(params.id!, input);
    return json(basket);
  } catch (err) {
    return toErrorResponse(err);
  }
};
