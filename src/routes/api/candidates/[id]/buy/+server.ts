// POST /api/candidates/[id]/buy
//
// Mark a candidate as bought. Runs the atomic transaction that creates the
// linked InventoryItem and transitions the candidate status to BOUGHT.
//
// Body is the candidate-less form of `convertCandidateSchema`
// ($lib/schemas/inventory). The candidate id comes from the URL, so only
// the purchase details are in the body.
//
// Response codes:
//   200  { candidate: CandidateDTO, inventoryItem: InventoryItemDTO }
//   400  ValidationError
//   404  NotFoundError (candidate id)

import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { moneySchema } from '$lib/schemas/shared';
import { markBought } from '$lib/server/candidates/candidateService';
import { toErrorResponse } from '$lib/server/http/errors';

const markBoughtBodySchema = z.object({
  purchasePrice: moneySchema,
  purchaseFees: moneySchema.optional(),
  purchaseDate: z.coerce.date().optional(),
});

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    const input = markBoughtBodySchema.parse(body);
    const result = await markBought(params.id!, input);
    return json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
};
