// PATCH /api/tradeups/executions/[id]/sale
//
// Record the market sale of the output item. Service computes
// realizedProfit and realizedProfitPct from the frozen inputCost.
//
// Response codes:
//   200 ExecutionDTO
//   400 ValidationError
//   404 NotFoundError

import { json, type RequestHandler } from '@sveltejs/kit';
import { recordSaleSchema } from '$lib/schemas/execution';
import { recordSale } from '$lib/server/tradeups/executionService';
import { toErrorResponse } from '$lib/server/http/errors';

export const PATCH: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    const input = recordSaleSchema.parse(body);
    const execution = await recordSale(params.id!, input);
    return json(execution);
  } catch (err) {
    return toErrorResponse(err);
  }
};
