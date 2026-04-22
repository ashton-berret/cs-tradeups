// POST /api/tradeups/evaluate
//
// On-demand evaluator. Body is an `EvaluateTarget` union
// (kind=candidate|inventory|basket plus id). Response is an
// `EvaluationResult` whose `kind` discriminates the payload.
//
// For candidate targets the service also persists the evaluation output
// onto the candidate row; for inventory and basket targets the result is
// not persisted here (basket persistence flows through
// basketService.recomputeMetrics and inventory evaluations are transient
// planner data).
//
// Response codes:
//   200  EvaluationResult
//   400  ValidationError
//   404  NotFoundError

import { json, type RequestHandler } from '@sveltejs/kit';
import { evaluateTargetSchema } from '$lib/schemas/evaluate';
import { evaluate } from '$lib/server/tradeups/evaluation/evaluationService';
import { toErrorResponse } from '$lib/server/http/errors';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const target = evaluateTargetSchema.parse(body);
    const result = await evaluate(target);
    return json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
};
