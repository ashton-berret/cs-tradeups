// GET /api/tradeups/executions/[id]
//
// Fetch a single execution with its frozen inputs, recorded result (if
// any), and recorded sale (if any).
//
// Response codes:
//   200 ExecutionDTO
//   404 NotFoundError

import { json, type RequestHandler } from '@sveltejs/kit';
import { getExecution } from '$lib/server/tradeups/executionService';
import { NotFoundError, toErrorResponse } from '$lib/server/http/errors';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const execution = await getExecution(params.id!);
    if (!execution) {
      throw new NotFoundError(`Execution not found: ${params.id}`);
    }
    return json(execution);
  } catch (err) {
    return toErrorResponse(err);
  }
};
