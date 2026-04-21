import { z } from 'zod';
import {
  itemRaritySchema,
  itemExteriorSchema,
  floatValueSchema,
  moneySchema,
  paginationSchema,
  sortDirectionSchema,
} from './shared';
import { RARITY_TIER } from '$lib/types/enums';

// A single input constraint rule for a plan
export const planRuleSchema = z
  .object({
    collection: z.string().optional(),
    rarity: itemRaritySchema.optional(),
    exterior: itemExteriorSchema.optional(),
    minFloat: floatValueSchema.optional(),
    maxFloat: floatValueSchema.optional(),
    maxBuyPrice: moneySchema.optional(),
    minQuantity: z.number().int().positive().optional(),
    maxQuantity: z.number().int().positive().optional(),
    priority: z.number().int().default(0),
    isPreferred: z.boolean().default(false),
  })
  .refine(
    (d) => (d.minFloat != null && d.maxFloat != null ? d.minFloat <= d.maxFloat : true),
    { message: 'minFloat must be <= maxFloat' },
  );

// A possible output item for EV calculation
export const outcomeItemSchema = z.object({
  marketHashName: z.string().min(1),
  weaponName: z.string().optional(),
  skinName: z.string().optional(),
  collection: z.string().min(1),
  rarity: itemRaritySchema,
  estimatedMarketValue: moneySchema,
  probabilityWeight: z.number().positive().default(1.0),
});

// Create a plan with nested rules and outcomes (POST /api/tradeups/plans)
export const createPlanSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    inputRarity: itemRaritySchema,
    targetRarity: itemRaritySchema,
    isActive: z.boolean().default(true),
    minProfitThreshold: moneySchema.optional(),
    minProfitPctThreshold: z.number().optional(),
    minLiquidityScore: z.number().min(0).max(1).optional(),
    notes: z.string().optional(),
    rules: z.array(planRuleSchema).default([]),
    outcomeItems: z.array(outcomeItemSchema).default([]),
  })
  .refine(
    (d) => RARITY_TIER[d.targetRarity] === RARITY_TIER[d.inputRarity] + 1,
    { message: 'targetRarity must be exactly one tier above inputRarity' },
  );

// Partial update to plan metadata (PATCH /api/tradeups/plans/[id])
export const updatePlanSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  minProfitThreshold: moneySchema.optional(),
  minProfitPctThreshold: z.number().optional(),
  minLiquidityScore: z.number().min(0).max(1).optional(),
  notes: z.string().optional(),
});

// Query filter for plan list
export const planFilterSchema = z
  .object({
    isActive: z.boolean().optional(),
    inputRarity: itemRaritySchema.optional(),
    targetRarity: itemRaritySchema.optional(),
    search: z.string().optional(),
    sortBy: z.enum(['createdAt', 'name', 'updatedAt']).default('createdAt'),
    sortDir: sortDirectionSchema,
  })
  .merge(paginationSchema);
