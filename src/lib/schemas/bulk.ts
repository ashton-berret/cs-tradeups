// Zod schemas for bulk endpoints.
//
// Every schema caps the ID list at MAX_BULK_IDS so the route layer can reject
// oversized requests before the service opens a transaction.

import { z } from 'zod';
import { MAX_BULK_IDS } from '$lib/server/http/limits';
import { candidateDecisionStatusSchema, cuidSchema } from './shared';

const idListSchema = z
  .array(cuidSchema)
  .min(1, 'At least one id is required.')
  .max(MAX_BULK_IDS, `At most ${MAX_BULK_IDS} ids allowed per request.`);

export const bulkCandidateStatusSchema = z.object({
  ids: idListSchema,
  // User-picked statuses only. BOUGHT/DUPLICATE/INVALID remain engine-owned.
  status: candidateDecisionStatusSchema.refine(
    (s) => s === 'WATCHING' || s === 'PASSED' || s === 'GOOD_BUY',
    { message: 'status must be WATCHING, PASSED, or GOOD_BUY for bulk updates.' },
  ),
  // Defaults true — bulk status updates pin by default so re-evaluation does
  // not immediately overwrite the operator's call.
  pinnedByUser: z.boolean().default(true),
});

export const bulkCandidateDeleteSchema = z.object({
  ids: idListSchema,
});

export const bulkCandidateReevaluateSchema = z.object({
  ids: idListSchema,
});

export const bulkBasketItemsSchema = z.object({
  items: z
    .array(
      z.object({
        inventoryItemId: cuidSchema,
        slotIndex: z.number().int().min(0).max(9),
      }),
    )
    .min(1)
    .max(10),
});
