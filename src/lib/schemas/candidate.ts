import { z } from 'zod';
import {
  itemRaritySchema,
  itemExteriorSchema,
  candidateSourceSchema,
  candidateDecisionStatusSchema,
  floatValueSchema,
  moneySchema,
  paginationSchema,
  sortDirectionSchema,
} from './shared';

// Manual candidate creation (POST /api/candidates)
export const createCandidateSchema = z.object({
  marketHashName: z.string().min(1),
  weaponName: z.string().optional(),
  skinName: z.string().optional(),
  collection: z.string().optional(),
  rarity: itemRaritySchema.optional(),
  exterior: itemExteriorSchema.optional(),
  floatValue: floatValueSchema.optional(),
  pattern: z.number().int().optional(),
  inspectLink: z.string().url().optional(),
  listPrice: moneySchema,
  currency: z.string().default('USD'),
  listingUrl: z.string().url().optional(),
  listingId: z.string().optional(),
  source: candidateSourceSchema.default('MANUAL'),
  notes: z.string().optional(),
});

// Extension ingestion (POST /api/extension/candidates)
// Permissive: accepts whatever the third-party extension sends,
// requires only the minimum fields needed to create a candidate.
export const extensionCandidateSchema = z
  .object({
    marketHashName: z.string().min(1),
    floatValue: floatValueSchema.optional(),
    listPrice: moneySchema,
    // Common optional fields the extension may provide
    weaponName: z.string().optional(),
    skinName: z.string().optional(),
    collection: z.string().optional(),
    rarity: itemRaritySchema.optional(),
    exterior: itemExteriorSchema.optional(),
    inspectLink: z.string().optional(),
    listingUrl: z.string().optional(),
    listingId: z.string().optional(),
    pattern: z.number().int().optional(),
    minFloat: floatValueSchema.optional(),
    maxFloat: floatValueSchema.optional(),
    paintIndex: z.number().int().nonnegative().optional(),
    currency: z.string().default('USD'),
  })
  .passthrough(); // allow unknown fields from the extension

// Status/notes update (PATCH /api/candidates/[id])
// `pinnedByUser` is optional; if the caller sets a status without it, the
// service pins the row by default so engine re-evaluations preserve the
// user's call. Callers that explicitly unpin (revert to engine control)
// pass `pinnedByUser: false`.
export const updateCandidateSchema = z.object({
  status: candidateDecisionStatusSchema.optional(),
  pinnedByUser: z.boolean().optional(),
  notes: z.string().optional(),
});

// Manual stale-refresh trigger (POST /api/candidates/refresh-stale)
// Optional window override; defaults to reevaluationPolicy.STALE_AFTER_MS.
export const refreshStaleCandidatesSchema = z.object({
  olderThanMs: z.number().int().positive().optional(),
});

// Query filter for candidate list
export const candidateFilterSchema = z
  .object({
    status: candidateDecisionStatusSchema.optional(),
    collection: z.string().optional(),
    rarity: itemRaritySchema.optional(),
    exterior: itemExteriorSchema.optional(),
    minFloat: floatValueSchema.optional(),
    maxFloat: floatValueSchema.optional(),
    minPrice: moneySchema.optional(),
    maxPrice: moneySchema.optional(),
    search: z.string().optional(),
    sortBy: z
      .enum([
        'createdAt',
        'listPrice',
        'floatValue',
        'qualityScore',
        'expectedProfit',
        'marginalBasketValue',
      ])
      .default('createdAt'),
    sortDir: sortDirectionSchema,
  })
  .merge(paginationSchema);
