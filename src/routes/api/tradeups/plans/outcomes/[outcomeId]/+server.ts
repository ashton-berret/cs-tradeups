// PATCH  /api/tradeups/plans/outcomes/[outcomeId]
// DELETE /api/tradeups/plans/outcomes/[outcomeId]
//
// Symmetric to the rule routes: addressed by outcome id; service derives
// the parent plan and fans out re-evaluation.
//
// Response codes:
//   PATCH  200 OutcomeItemDTO | 400 | 404 | 409
//   DELETE 204 | 404

import { json, type RequestHandler } from '@sveltejs/kit';
import { outcomeItemSchema } from '$lib/schemas/plan';
import {
  removeOutcomeItem,
  updateOutcomeItem,
} from '$lib/server/tradeups/planService';
import { toErrorResponse } from '$lib/server/http/errors';

export const PATCH: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    const input = outcomeItemSchema.parse(body);
    const outcome = await updateOutcomeItem(params.outcomeId!, input);
    return json(outcome);
  } catch (err) {
    return toErrorResponse(err);
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    await removeOutcomeItem(params.outcomeId!);
    return new Response(null, { status: 204 });
  } catch (err) {
    return toErrorResponse(err);
  }
};
