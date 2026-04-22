// POST /api/tradeups/plans/[id]/rules
//
// Append a new input-constraint rule to a plan. Service fans out a
// re-evaluation of affected candidates on success.
//
// Response codes:
//   201  PlanRuleDTO
//   400  ValidationError (including the minFloat<=maxFloat refinement)
//   404  NotFoundError (plan id)

import { json, type RequestHandler } from '@sveltejs/kit';
import { planRuleSchema } from '$lib/schemas/plan';
import { addPlanRule } from '$lib/server/tradeups/planService';
import { toErrorResponse } from '$lib/server/http/errors';

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    const input = planRuleSchema.parse(body);
    const rule = await addPlanRule(params.id!, input);
    return json(rule, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
};
