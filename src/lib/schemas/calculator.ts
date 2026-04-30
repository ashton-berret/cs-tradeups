import { z } from 'zod';
import { cuidSchema, floatValueSchema, itemRaritySchema, moneySchema } from './shared';

// Calculator scratchpad — POST /api/tradeups/calculator.
//
// Sandbox EV evaluation. Two modes:
//
//   1. Plan mode: caller supplies `planId`. Plan rules and outcomes drive
//      the evaluation. Inactive plans are allowed — the calculator is a
//      tweaking surface, not the planner.
//
//   2. Ad-hoc mode: caller supplies `targetRarity` instead. Outcomes are
//      derived from the catalog snapshot (every catalog skin at the target
//      rarity in each input's collection). Pricing falls back to the latest
//      observed market price; outcomes without an observation contribute 0
//      with a warning. This is the "experiment with no plan yet" mode.
//
// Per-input `catalogSkinId` lets the service look up the input skin's
// min/max float so output exterior projection is correct (CS2 wear math
// uses normalized wear proportions, not raw floats).

export const calculatorInputSchema = z.object({
  collection: z.string().min(1),
  catalogSkinId: z.string().min(1).optional(),
  catalogCollectionId: z.string().min(1).optional(),
  floatValue: floatValueSchema.optional(),
  price: moneySchema,
});

export const calculatorRequestSchema = z
  .object({
    planId: cuidSchema.optional(),
    targetRarity: itemRaritySchema.optional(),
    inputRarity: itemRaritySchema.optional(),
    /**
     * StatTrak applies only in ad-hoc mode — plan mode uses whatever marketHashNames
     * the plan's outcomes already carry. CS2 enforces that all 10 inputs must share
     * StatTrak status; the math is identical (rarity, float ranges, probabilities)
     * but every output marketHashName takes the `StatTrak™ ` prefix for pricing.
     */
    isStatTrak: z.boolean().optional(),
    inputs: z.array(calculatorInputSchema).min(1).max(10),
  })
  .refine((data) => Boolean(data.planId) || Boolean(data.targetRarity), {
    message: 'Either planId or targetRarity must be provided.',
    path: ['targetRarity'],
  });

export type CalculatorInput = z.infer<typeof calculatorInputSchema>;
export type CalculatorRequest = z.infer<typeof calculatorRequestSchema>;
