import { z } from 'zod';
import {
  itemRaritySchema,
  itemExteriorSchema,
  inventoryStatusSchema,
  floatValueSchema,
  moneySchema,
  cuidSchema,
  paginationSchema,
  sortDirectionSchema,
} from './shared';

// Manual inventory creation (POST /api/inventory)
export const createInventoryItemSchema = z.object({
  marketHashName: z.string().min(1),
  weaponName: z.string().optional(),
  skinName: z.string().optional(),
  collection: z.string().optional(),
  rarity: itemRaritySchema.optional(),
  exterior: itemExteriorSchema.optional(),
  floatValue: floatValueSchema.optional(),
  pattern: z.number().int().optional(),
  inspectLink: z.string().url().optional(),
  purchasePrice: moneySchema,
  purchaseCurrency: z.string().default('USD'),
  purchaseFees: moneySchema.optional(),
  purchaseDate: z.coerce.date().optional(),
  candidateId: cuidSchema.optional(),
  notes: z.string().optional(),
});

// Status/value update (PATCH /api/inventory/[id])
export const updateInventoryItemSchema = z.object({
  status: inventoryStatusSchema.optional(),
  currentEstValue: moneySchema.optional(),
  notes: z.string().optional(),
});

// Convert a candidate to an inventory item ("mark as bought" workflow)
export const convertCandidateSchema = z.object({
  candidateId: cuidSchema,
  purchasePrice: moneySchema,
  purchaseFees: moneySchema.optional(),
  purchaseDate: z.coerce.date().optional(),
});

// Query filter for inventory list
export const inventoryFilterSchema = z
  .object({
    status: inventoryStatusSchema.optional(),
    collection: z.string().optional(),
    rarity: itemRaritySchema.optional(),
    exterior: itemExteriorSchema.optional(),
    availableForBasket: z.boolean().optional(),
    search: z.string().optional(),
    sortBy: z
      .enum(['createdAt', 'purchasePrice', 'floatValue', 'currentEstValue'])
      .default('createdAt'),
    sortDir: sortDirectionSchema,
  })
  .merge(paginationSchema);

export const eligibleInventoryFilterSchema = z
  .object({
    planId: z.string().min(1),
    sortBy: z
      .enum(['createdAt', 'purchasePrice', 'floatValue', 'currentEstValue'])
      .default('createdAt'),
    sortDir: sortDirectionSchema,
  })
  .merge(paginationSchema);
