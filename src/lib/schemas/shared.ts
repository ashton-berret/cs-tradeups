import { z } from 'zod';
import {
  ITEM_RARITIES,
  ITEM_EXTERIORS,
  CANDIDATE_SOURCES,
  CANDIDATE_DECISION_STATUSES,
  INVENTORY_STATUSES,
  TRADEUP_BASKET_STATUSES,
} from '$lib/types/enums';

// Enum schemas
export const itemRaritySchema = z.enum(ITEM_RARITIES);
export const itemExteriorSchema = z.enum(ITEM_EXTERIORS);
export const candidateSourceSchema = z.enum(CANDIDATE_SOURCES);
export const candidateDecisionStatusSchema = z.enum(CANDIDATE_DECISION_STATUSES);
export const inventoryStatusSchema = z.enum(INVENTORY_STATUSES);
export const tradeupBasketStatusSchema = z.enum(TRADEUP_BASKET_STATUSES);

// Common field schemas
export const cuidSchema = z.string().cuid();
export const floatValueSchema = z.number().min(0).max(1);
export const moneySchema = z.number().nonnegative();
export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(25),
});
export const dateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export const sortDirectionSchema = z.enum(['asc', 'desc']).default('desc');
