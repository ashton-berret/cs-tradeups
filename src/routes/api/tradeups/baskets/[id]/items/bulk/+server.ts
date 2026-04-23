// POST /api/tradeups/baskets/[id]/items/bulk
//
// Add multiple inventory items to a basket in a single transaction.
// Item reservations and metric recomputation happen atomically.
//
// Body: { items: Array<{ inventoryItemId: string, slotIndex: number }> }
// Response codes:
//   200  BasketDTO (refreshed)
//   400  ValidationError (duplicate ids, duplicate slots, invalid shape)
//   404  NotFoundError (basket or inventory id)
//   409  ConflictError (any single-item invariant: slot occupied, not HELD, rarity mismatch, overflow)

import { json, type RequestHandler } from '@sveltejs/kit';
import { bulkBasketItemsSchema } from '$lib/schemas/bulk';
import { bulkAddItems } from '$lib/server/tradeups/basketService';
import { toErrorResponse } from '$lib/server/http/errors';

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    const input = bulkBasketItemsSchema.parse(body);
    const basket = await bulkAddItems(params.id!, input.items);
    return json(basket);
  } catch (err) {
    return toErrorResponse(err);
  }
};
