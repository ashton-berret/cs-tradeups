// GET  /api/tradeups/executions  — paginated execution list
// POST /api/tradeups/executions  — record a completed trade-up
//
// POST runs the atomic create transaction (see executionService header):
// basket.status READY -> EXECUTED, inventory RESERVED_FOR_BASKET ->
// USED_IN_CONTRACT, execution row created with frozen inputCost/expectedEV.
//
// Response codes:
//   GET  200  PaginatedResponse<ExecutionDTO>
//   POST 201  ExecutionDTO
//   400  ValidationError
//   404  NotFoundError (basket id)
//   409  ConflictError (basket not READY, inventory moved, etc.)

import { json, type RequestHandler } from '@sveltejs/kit';
import {
  createExecutionSchema,
  executionFilterSchema,
} from '$lib/schemas/execution';
import {
  createExecution,
  listExecutions,
} from '$lib/server/tradeups/executionService';
import { coerceSearchParams } from '$lib/server/http/query';
import { toErrorResponse } from '$lib/server/http/errors';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const filter = executionFilterSchema.parse(
      coerceSearchParams(url.searchParams, executionFilterSchema),
    );
    const page = await listExecutions(filter);
    return json(page);
  } catch (err) {
    return toErrorResponse(err);
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const input = createExecutionSchema.parse(body);
    const execution = await createExecution(input);
    return json(execution, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
};
