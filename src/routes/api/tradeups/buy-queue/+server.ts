// GET /api/tradeups/buy-queue
//
// Recompute the global partition optimization across active plans, current
// candidates, held inventory, and BUILDING baskets. Returns a transient
// BuyQueueResult — nothing is persisted by this endpoint.
//
// Optional query params:
//   planId  — restrict the response to assignments for one plan; cross-plan
//             allocation still runs so items eligible for multiple plans are
//             still distributed deterministically before the filter applies.
//
// Response codes:
//   200  BuyQueueResult
//   500  unexpected planner failure (handled by toErrorResponse)

import { json, type RequestHandler } from '@sveltejs/kit';
import { buildBuyQueue } from '$lib/server/tradeups/plannerService';
import { toErrorResponse } from '$lib/server/http/errors';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const planId = url.searchParams.get('planId') ?? undefined;
    const result = await buildBuyQueue({ planId });
    return json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
};
