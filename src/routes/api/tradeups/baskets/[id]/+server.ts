// GET    /api/tradeups/baskets/[id]  — basket with items, freshly-recomputed metrics
// PATCH  /api/tradeups/baskets/[id]  — name / notes / status (restricted)
// DELETE /api/tradeups/baskets/[id]  — hard delete; only BUILDING or CANCELLED
//
// Status notes:
//   - Setting status=READY requires exactly 10 items (service enforces).
//   - Setting status=EXECUTED is rejected here — use executionService.
//   - Setting status=CANCELLED also releases reserved inventory back to HELD.
//   - For cleaner intent the preferred path for READY is
//     POST /api/tradeups/baskets/[id]/ready; for CANCELLED,
//     POST /api/tradeups/baskets/[id]/cancel.
//
// Response codes:
//   GET    200 BasketDTO | 404
//   PATCH  200 BasketDTO | 400 | 404 | 409
//   DELETE 204 | 404 | 409

import { json, type RequestHandler } from '@sveltejs/kit';
import { updateBasketSchema } from '$lib/schemas/basket';
import {
  deleteBasket,
  getBasket,
  updateBasket,
} from '$lib/server/tradeups/basketService';
import { NotFoundError, toErrorResponse } from '$lib/server/http/errors';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const basket = await getBasket(params.id!);
    if (!basket) {
      throw new NotFoundError(`Basket not found: ${params.id}`);
    }
    return json(basket);
  } catch (err) {
    return toErrorResponse(err);
  }
};

export const PATCH: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    const input = updateBasketSchema.parse(body);
    const basket = await updateBasket(params.id!, input);
    return json(basket);
  } catch (err) {
    return toErrorResponse(err);
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    await deleteBasket(params.id!);
    return new Response(null, { status: 204 });
  } catch (err) {
    return toErrorResponse(err);
  }
};
