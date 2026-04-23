import { json, type RequestHandler } from '@sveltejs/kit';
import { eligibleInventoryFilterSchema } from '$lib/schemas/inventory';
import { listEligibleInventoryForPlan } from '$lib/server/inventory/inventoryService';
import { coerceSearchParams } from '$lib/server/http/query';
import { toErrorResponse } from '$lib/server/http/errors';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const filter = eligibleInventoryFilterSchema.parse(
      coerceSearchParams(url.searchParams, eligibleInventoryFilterSchema),
    );
    const page = await listEligibleInventoryForPlan(filter);
    return json(page);
  } catch (err) {
    return toErrorResponse(err);
  }
};
