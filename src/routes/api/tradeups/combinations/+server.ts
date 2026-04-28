// GET  /api/tradeups/combinations  — list saved combinations
// POST /api/tradeups/combinations  — save a calculator state as a combination

import { json, type RequestHandler } from '@sveltejs/kit';
import { combinationSaveSchema } from '$lib/schemas/combinations';
import { listCombinations, saveCombination } from '$lib/server/tradeups/combinationService';
import { toErrorResponse } from '$lib/server/http/errors';

export const GET: RequestHandler = async () => {
  try {
    const combinations = await listCombinations();
    return json({ combinations });
  } catch (err) {
    return toErrorResponse(err);
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const parsed = combinationSaveSchema.parse(body);
    const created = await saveCombination(parsed);
    return json(created, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
};
