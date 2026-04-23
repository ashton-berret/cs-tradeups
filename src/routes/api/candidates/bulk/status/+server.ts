// POST /api/candidates/bulk/status
//
// Bulk-set a user-picked status on multiple candidates. Pins by default.
//
// Body: { ids: string[], status: WATCHING|PASSED|GOOD_BUY, pinnedByUser?: boolean }
// Response: { count: number }

import { json, type RequestHandler } from '@sveltejs/kit';
import { bulkCandidateStatusSchema } from '$lib/schemas/bulk';
import { bulkSetCandidateStatus } from '$lib/server/candidates/candidateService';
import { toErrorResponse } from '$lib/server/http/errors';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const input = bulkCandidateStatusSchema.parse(body);
    const result = await bulkSetCandidateStatus(input.ids, input.status, input.pinnedByUser);
    return json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
};
