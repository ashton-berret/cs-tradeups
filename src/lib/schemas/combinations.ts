import { z } from 'zod';
import { calculatorInputSchema } from './calculator';
import { cuidSchema, itemRaritySchema, moneySchema } from './shared';

// Saved combinations — persist a calculator state as a "thesis" snapshot,
// optionally re-eval later (recheck) to compare against current prices.

export const combinationSaveSchema = z
  .object({
    name: z.string().min(1).max(120),
    // 16 KB limit — enough room for the importer to stash full source
    // metadata (published numbers, outcome list) as JSON without
    // truncating, but still bounded.
    notes: z.string().max(16_000).optional(),
    isActive: z.boolean().optional().default(false),

    // Calculator state at save time. Mirrors the calculator request shape so
    // the same payload can be `Calculate` then `Save` without reshaping.
    sourcePlanId: cuidSchema.optional(),
    targetRarity: itemRaritySchema.optional(),
    inputRarity: itemRaritySchema.optional(),
    inputs: z.array(calculatorInputSchema).min(1).max(10),

    // Optional external dedupe id, set by tools/import-tradeuplab.ts. The
    // unique constraint on TradeupCombination.tradeupLabId means re-running
    // the importer is idempotent. Not exposed in any UI save flow.
    tradeupLabId: z.number().int().positive().optional(),

    // Optional thesis override. Used by the tradeuplab importer (and any
    // future external-source importers) to save the source's already-
    // computed numbers as the frozen baseline instead of re-running our
    // own calculator. Skipping the recompute matters when our market-price
    // table is sparse — without observations the calculator returns 0 EV
    // for every outcome and the saved thesis is useless. Recheck still
    // runs the live calculator and reports drift against this frozen
    // override.
    thesisOverride: z
      .object({
        totalCost: moneySchema,
        totalEV: moneySchema,
        expectedProfit: z.number(),
        expectedProfitPct: z.number(),
      })
      .optional(),
  })
  .refine((data) => Boolean(data.sourcePlanId) || Boolean(data.targetRarity), {
    message: 'Either sourcePlanId or targetRarity must be provided.',
    path: ['targetRarity'],
  });

export const combinationPatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  notes: z.string().max(16_000).optional(),
  isActive: z.boolean().optional(),
});

export type CombinationSaveRequest = z.infer<typeof combinationSaveSchema>;
export type CombinationPatchRequest = z.infer<typeof combinationPatchSchema>;
