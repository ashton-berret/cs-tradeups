// POST /api/candidates/bulk/delete-ingested
//
// Operator reset for bridge discovery runs. Deletes all extension-ingested
// candidates that are not linked to inventory; bought/converted candidates are
// preserved and counted as skipped.

import { json, type RequestHandler } from '@sveltejs/kit';
import { deleteIngestedCandidates } from '$lib/server/candidates/candidateService';
import { toErrorResponse } from '$lib/server/http/errors';

export const POST: RequestHandler = async () => {
  try {
    return json(await deleteIngestedCandidates());
  } catch (err) {
    return toErrorResponse(err);
  }
};
