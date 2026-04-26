import { z } from 'zod';
import { cuidSchema, floatValueSchema, moneySchema } from './shared';

// Calculator scratchpad — POST /api/tradeups/calculator.
//
// Operator describes a hypothetical 10-input basket without touching
// inventory. Returns the same `BasketEVBreakdown` the basket builder uses,
// plus convenience totals (cost, profit). v1 accepts collection + float +
// price per input. Output exterior projection requires per-input skin
// selection (so we know each input's min/max float for wear-proportion
// math); deferred until a CatalogSkinSelect ships.

export const calculatorInputSchema = z.object({
  collection: z.string().min(1),
  floatValue: floatValueSchema.optional(),
  price: moneySchema,
});

export const calculatorRequestSchema = z.object({
  planId: cuidSchema,
  inputs: z.array(calculatorInputSchema).min(1).max(10),
});

export type CalculatorInput = z.infer<typeof calculatorInputSchema>;
export type CalculatorRequest = z.infer<typeof calculatorRequestSchema>;
