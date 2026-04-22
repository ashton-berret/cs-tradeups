// POST /api/candidates/[id]/reevaluate
//
// Manual re-score of a single candidate. Thin passthrough to
// `candidateService.reevaluateCandidate`, which re-runs the full
// evaluation pipeline and persists the updated scoring fields.
//
// This is an escape hatch: normal re-eval fan-out happens eagerly inside
// plan mutations (see planService.reevaluateAllForPlan).
//
// Response codes:
//   200  CandidateEvaluation
//   404  NotFoundError

import { json, type RequestHandler } from '@sveltejs/kit';
import { reevaluateCandidate } from '$lib/server/candidates/candidateService';
import { toErrorResponse } from '$lib/server/http/errors';

export const POST: RequestHandler = async ({ params }) => {
  try {
    const result = await reevaluateCandidate(params.id!);
    return json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
};
