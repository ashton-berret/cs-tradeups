import { z } from 'zod';
import {
  cuidSchema,
  itemExteriorSchema,
  floatValueSchema,
  moneySchema,
  paginationSchema,
  sortDirectionSchema,
} from './shared';

// Record a completed trade-up (POST /api/tradeups/executions)
// Freezes the basket's current inputCost and expectedEV at creation time.
export const createExecutionSchema = z.object({
  basketId: cuidSchema,
  executedAt: z.coerce.date(),
  notes: z.string().optional(),
});

// Record what item came out of the trade-up (PATCH /api/tradeups/executions/[id]/result)
export const updateExecutionResultSchema = z.object({
  resultMarketHashName: z.string().min(1),
  resultWeaponName: z.string().optional(),
  resultSkinName: z.string().optional(),
  resultCollection: z.string().optional(),
  resultExterior: itemExteriorSchema.optional(),
  resultFloatValue: floatValueSchema.optional(),
  estimatedResultValue: moneySchema.optional(),
});

// Record the actual sale of the output item (PATCH /api/tradeups/executions/[id]/sale)
export const recordSaleSchema = z.object({
  salePrice: moneySchema,
  saleFees: moneySchema.optional(),
  saleDate: z.coerce.date(),
});

// Query filter for execution list
export const executionFilterSchema = z
  .object({
    planId: cuidSchema.optional(),
    hasResult: z.boolean().optional(),
    hasSale: z.boolean().optional(),
    sortBy: z.enum(['executedAt', 'inputCost', 'realizedProfit']).default('executedAt'),
    sortDir: sortDirectionSchema,
  })
  .merge(paginationSchema);
