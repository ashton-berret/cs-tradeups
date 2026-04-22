// POST /api/tradeups/plans/[id]/outcomes
//
// Append an outcome (possible output item) to a plan for EV calculation.
// Service enforces outcome.rarity === plan.targetRarity and fans out
// re-evaluation.
//
// Response codes:
//   201  OutcomeItemDTO
//   400  ValidationError
//   404  NotFoundError (plan id)
//   409  ConflictError (rarity mismatch)

import { json, type RequestHandler } from '@sveltejs/kit';
import { outcomeItemSchema } from '$lib/schemas/plan';
import { addOutcomeItem } from '$lib/server/tradeups/planService';
import { toErrorResponse } from '$lib/server/http/errors';

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    const input = outcomeItemSchema.parse(body);
    const outcome = await addOutcomeItem(params.id!, input);
    return json(outcome, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
};
