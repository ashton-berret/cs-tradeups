// DELETE /api/tradeups/baskets/[id]/items/[inventoryItemId]
//
// Remove an inventory item from a basket. Service releases the item back
// to HELD and recomputes basket metrics.
//
// Response codes:
//   200  BasketDTO (refreshed)
//   404  NotFoundError (basket / item not in basket)
//   409  ConflictError (basket not in BUILDING or READY)

import { json, type RequestHandler } from '@sveltejs/kit';
import { removeItem } from '$lib/server/tradeups/basketService';
import { toErrorResponse } from '$lib/server/http/errors';

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    const basket = await removeItem(params.id!, params.inventoryItemId!);
    return json(basket);
  } catch (err) {
    return toErrorResponse(err);
  }
};
