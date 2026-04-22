// GET    /api/tradeups/plans/[id]  — plan with rules + outcomes
// PATCH  /api/tradeups/plans/[id]  — update plan metadata + thresholds
// DELETE /api/tradeups/plans/[id]  — hard delete; blocked if any basket or
//                                    execution references the plan. Prefer
//                                    PATCH { isActive: false } to retire.
//
// Scoring-relevant patches (thresholds, isActive) trigger
// `reevaluateAllForPlan` inside the service.
//
// Response codes:
//   GET    200 | 404
//   PATCH  200 PlanDTO | 400 | 404 | 409
//   DELETE 204 | 404 | 409

import { json, type RequestHandler } from '@sveltejs/kit';
import { updatePlanSchema } from '$lib/schemas/plan';
import {
  deletePlan,
  getPlan,
  updatePlan,
} from '$lib/server/tradeups/planService';
import { NotFoundError, toErrorResponse } from '$lib/server/http/errors';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const plan = await getPlan(params.id!);
    if (!plan) {
      throw new NotFoundError(`Plan not found: ${params.id}`);
    }
    return json(plan);
  } catch (err) {
    return toErrorResponse(err);
  }
};

export const PATCH: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    const input = updatePlanSchema.parse(body);
    const plan = await updatePlan(params.id!, input);
    return json(plan);
  } catch (err) {
    return toErrorResponse(err);
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    await deletePlan(params.id!);
    return new Response(null, { status: 204 });
  } catch (err) {
    return toErrorResponse(err);
  }
};
