// POST /api/tradeups/combinations/recheck-batch — bulk recheck a list of
// combinations. Body: { ids: string[] }. Returns per-id success/failure.

import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { recheckBatch } from '$lib/server/tradeups/combinationService';
import { toErrorResponse } from '$lib/server/http/errors';

const requestSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { ids } = requestSchema.parse(body);
    const result = await recheckBatch(ids);
    return json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
};
