// POST /api/candidates/bulk/reevaluate
//
// Bulk re-evaluate specific candidate ids. Non-atomic — returns per-row
// errors alongside a processed count so the caller can decide whether to
// surface partial failures.
//
// Body: { ids: string[] }
// Response: { processed: number, errors: { id: string, message: string }[] }

import { json, type RequestHandler } from '@sveltejs/kit';
import { bulkCandidateReevaluateSchema } from '$lib/schemas/bulk';
import { bulkReevaluateCandidates } from '$lib/server/candidates/candidateService';
import { toErrorResponse } from '$lib/server/http/errors';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const input = bulkCandidateReevaluateSchema.parse(body);
    const result = await bulkReevaluateCandidates(input.ids);
    return json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
};
