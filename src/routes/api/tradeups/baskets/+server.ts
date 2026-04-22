// GET  /api/tradeups/baskets  — paginated basket list with eager metrics
// POST /api/tradeups/baskets  — create an empty basket tied to a plan
//
// Response codes:
//   GET  200  PaginatedResponse<BasketDTO>
//   POST 201  BasketDTO
//   400  ValidationError
//   404  NotFoundError (unknown planId surfaces as a service error)

import { json, type RequestHandler } from '@sveltejs/kit';
import {
  basketFilterSchema,
  createBasketSchema,
} from '$lib/schemas/basket';
import {
  createBasket,
  listBaskets,
} from '$lib/server/tradeups/basketService';
import { coerceSearchParams } from '$lib/server/http/query';
import { toErrorResponse } from '$lib/server/http/errors';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const filter = basketFilterSchema.parse(
      coerceSearchParams(url.searchParams, basketFilterSchema),
    );
    const page = await listBaskets(filter);
    return json(page);
  } catch (err) {
    return toErrorResponse(err);
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const input = createBasketSchema.parse(body);
    const basket = await createBasket(input);
    return json(basket, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
};
