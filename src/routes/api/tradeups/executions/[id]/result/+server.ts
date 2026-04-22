// PATCH /api/tradeups/executions/[id]/result
//
// Record what actually came out of the trade-up contract. Called once the
// user can see the item in their Steam inventory. May be called multiple
// times to refine the estimated value; each call overwrites prior fields.
//
// Response codes:
//   200 ExecutionDTO
//   400 ValidationError
//   404 NotFoundError

import { json, type RequestHandler } from '@sveltejs/kit';
import { updateExecutionResultSchema } from '$lib/schemas/execution';
import { recordResult } from '$lib/server/tradeups/executionService';
import { toErrorResponse } from '$lib/server/http/errors';

export const PATCH: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    const input = updateExecutionResultSchema.parse(body);
    const execution = await recordResult(params.id!, input);
    return json(execution);
  } catch (err) {
    return toErrorResponse(err);
  }
};
