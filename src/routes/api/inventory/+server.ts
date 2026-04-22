// GET  /api/inventory  — paginated, filtered inventory list
// POST /api/inventory  — manual inventory creation (no candidate link)
//
// The candidate→inventory "I bought this" flow is NOT here; it lives at
// POST /api/candidates/[id]/buy so the URL surface matches the resource
// that owns the state transition. This endpoint is strictly for manual
// entries.
//
// Response codes:
//   GET  200  PaginatedResponse<InventoryItemDTO>
//   POST 201  InventoryItemDTO
//   400  ValidationError

import { json, type RequestHandler } from '@sveltejs/kit';
import {
  createInventoryItemSchema,
  inventoryFilterSchema,
} from '$lib/schemas/inventory';
import {
  createInventoryItem,
  listInventory,
} from '$lib/server/inventory/inventoryService';
import { coerceSearchParams } from '$lib/server/http/query';
import { toErrorResponse } from '$lib/server/http/errors';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const filter = inventoryFilterSchema.parse(
      coerceSearchParams(url.searchParams, inventoryFilterSchema),
    );
    const page = await listInventory(filter);
    return json(page);
  } catch (err) {
    return toErrorResponse(err);
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const input = createInventoryItemSchema.parse(body);
    const item = await createInventoryItem(input);
    return json(item, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
};
