// GET  /api/tradeups/plans  — paginated plan list with rules & outcomes
// POST /api/tradeups/plans  — create a plan + its nested rules/outcomes
//
// Plan creation runs inside one transaction (see planService.createPlan)
// and, when `isActive`, triggers eager re-evaluation of every candidate
// that could now match the plan.
//
// Response codes:
//   GET  200  PaginatedResponse<PlanDTO>
//   POST 201  PlanDTO
//   400  ValidationError (Zod refinement: target = input rarity tier + 1)

import { json, type RequestHandler } from '@sveltejs/kit';
import { createPlanSchema, planFilterSchema } from '$lib/schemas/plan';
import { createPlan, listPlans } from '$lib/server/tradeups/planService';
import { coerceSearchParams } from '$lib/server/http/query';
import { toErrorResponse } from '$lib/server/http/errors';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const filter = planFilterSchema.parse(
      coerceSearchParams(url.searchParams, planFilterSchema),
    );
    const page = await listPlans(filter);
    return json(page);
  } catch (err) {
    return toErrorResponse(err);
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const input = createPlanSchema.parse(body);
    const plan = await createPlan(input);
    return json(plan, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
};
