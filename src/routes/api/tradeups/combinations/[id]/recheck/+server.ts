// POST /api/tradeups/combinations/[id]/recheck
//
// Re-evaluate a saved combination against current observed prices. Appends a
// TradeupCombinationSnapshot row and returns the new snapshot + delta vs the
// frozen thesis.

import { json, type RequestHandler } from '@sveltejs/kit';
import { recheckCombination } from '$lib/server/tradeups/combinationService';
import { toErrorResponse } from '$lib/server/http/errors';

export const POST: RequestHandler = async ({ params }) => {
  try {
    const result = await recheckCombination(params.id!);
    return json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
};
