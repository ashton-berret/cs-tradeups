// PATCH  /api/tradeups/plans/rules/[ruleId]
// DELETE /api/tradeups/plans/rules/[ruleId]
//
// Rules are addressed by their own id, flat under /plans/rules, because
// PATCH/DELETE does not need the parent plan id — the service derives it
// from the rule row and fans out a plan-scoped re-evaluation.
//
// Response codes:
//   PATCH  200 PlanRuleDTO | 400 | 404
//   DELETE 204 | 404

import { json, type RequestHandler } from '@sveltejs/kit';
import { planRuleSchema } from '$lib/schemas/plan';
import {
  removePlanRule,
  updatePlanRule,
} from '$lib/server/tradeups/planService';
import { toErrorResponse } from '$lib/server/http/errors';

export const PATCH: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    const input = planRuleSchema.parse(body);
    const rule = await updatePlanRule(params.ruleId!, input);
    return json(rule);
  } catch (err) {
    return toErrorResponse(err);
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    await removePlanRule(params.ruleId!);
    return new Response(null, { status: 204 });
  } catch (err) {
    return toErrorResponse(err);
  }
};
