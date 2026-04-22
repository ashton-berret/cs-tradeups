// POST /api/candidates/reevaluate-open
//
// Bulk re-score every candidate whose status is still open
// (WATCHING or GOOD_BUY). Used as a manual "Re-score all" action in the
// UI. Not for regular use — prefer letting plan mutations fan out
// via reevaluateAllForPlan.
//
// Response codes:
//   200  { count: number } — number of rows re-evaluated

import { json, type RequestHandler } from '@sveltejs/kit';
import { reevaluateOpenCandidates } from '$lib/server/candidates/candidateService';
import { toErrorResponse } from '$lib/server/http/errors';

export const POST: RequestHandler = async () => {
  try {
    const result = await reevaluateOpenCandidates();
    return json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
};
