// GET    /api/inventory/[id]  — single item
// PATCH  /api/inventory/[id]  — notes / currentEstValue / status
// DELETE /api/inventory/[id]  — hard delete; blocked if linked to a basket
//
// Status transitions here flow through inventoryService.setStatus, which
// enforces the state machine documented at the top of inventoryService.ts.
// Note: RESERVED_FOR_BASKET cannot be set here — that lives in
// basketService.addItem. The service will throw if attempted.
//
// Response codes:
//   GET    200 InventoryItemDTO | 404
//   PATCH  200 InventoryItemDTO | 400 | 404 | 409
//   DELETE 204 | 404 | 409

import { json, type RequestHandler } from '@sveltejs/kit';
import { updateInventoryItemSchema } from '$lib/schemas/inventory';
import {
  deleteInventoryItem,
  getInventoryItem,
  setStatus,
  updateInventoryItem,
} from '$lib/server/inventory/inventoryService';
import { NotFoundError, toErrorResponse } from '$lib/server/http/errors';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const item = await getInventoryItem(params.id!);
    if (!item) {
      throw new NotFoundError(`Inventory item not found: ${params.id}`);
    }
    return json(item);
  } catch (err) {
    return toErrorResponse(err);
  }
};

export const PATCH: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    const input = updateInventoryItemSchema.parse(body);
    const { status, ...rest } = input;
    let item = await updateInventoryItem(params.id!, rest);
    if (status) {
      item = await setStatus(params.id!, status);
    }
    return json(item);
  } catch (err) {
    return toErrorResponse(err);
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    await deleteInventoryItem(params.id!);
    return new Response(null, { status: 204 });
  } catch (err) {
    return toErrorResponse(err);
  }
};
