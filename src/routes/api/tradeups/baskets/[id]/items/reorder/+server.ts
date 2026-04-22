// PATCH /api/tradeups/baskets/[id]/items/reorder
//
// Reorder basket items by slot. Body is a {inventoryItemId -> slotIndex}
// map; the service enforces the set matches the current basket exactly and
// that the slot values form a permutation of 0..N-1.
//
// Response codes:
//   200  BasketDTO (refreshed)
//   400  ValidationError
//   404  NotFoundError (basket)
//   409  ConflictError (membership mismatch, non-permutation, bad slot)

import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { reorderItems } from '$lib/server/tradeups/basketService';
import { toErrorResponse } from '$lib/server/http/errors';

const reorderBodySchema = z.object({
  slotMap: z.record(z.string(), z.number().int().min(0).max(9)),
});

export const PATCH: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    const { slotMap } = reorderBodySchema.parse(body);
    const basket = await reorderItems(params.id!, slotMap);
    return json(basket);
  } catch (err) {
    return toErrorResponse(err);
  }
};
