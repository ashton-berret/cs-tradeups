// GET    /api/tradeups/combinations/[id]
// PATCH  /api/tradeups/combinations/[id]  — name/notes/isActive
// DELETE /api/tradeups/combinations/[id]

import { json, type RequestHandler } from '@sveltejs/kit';
import { combinationPatchSchema } from '$lib/schemas/combinations';
import {
  deleteCombination,
  getCombination,
  patchCombination,
} from '$lib/server/tradeups/combinationService';
import { toErrorResponse } from '$lib/server/http/errors';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const combination = await getCombination(params.id!);
    return json(combination);
  } catch (err) {
    return toErrorResponse(err);
  }
};

export const PATCH: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    const parsed = combinationPatchSchema.parse(body);
    const updated = await patchCombination(params.id!, parsed);
    return json(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    await deleteCombination(params.id!);
    return new Response(null, { status: 204 });
  } catch (err) {
    return toErrorResponse(err);
  }
};
