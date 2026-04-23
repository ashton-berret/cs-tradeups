// POST /api/candidates/bulk/delete
//
// Bulk-delete candidates. Rejects the whole batch if any id has linked
// inventory (409 with the blocking ids in the message).
//
// Body: { ids: string[] }
// Response: { count: number }

import { json, type RequestHandler } from '@sveltejs/kit';
import { bulkCandidateDeleteSchema } from '$lib/schemas/bulk';
import { bulkDeleteCandidates } from '$lib/server/candidates/candidateService';
import { toErrorResponse } from '$lib/server/http/errors';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const input = bulkCandidateDeleteSchema.parse(body);
    const result = await bulkDeleteCandidates(input.ids);
    return json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
};
