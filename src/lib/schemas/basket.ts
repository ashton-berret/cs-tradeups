import { z } from 'zod';
import {
  cuidSchema,
  tradeupBasketStatusSchema,
  paginationSchema,
  sortDirectionSchema,
} from './shared';

// Create a basket linked to a plan (POST /api/tradeups/baskets)
export const createBasketSchema = z.object({
  planId: cuidSchema,
  name: z.string().optional(),
  notes: z.string().optional(),
});

// Add an inventory item to a basket slot
export const addBasketItemSchema = z.object({
  inventoryItemId: cuidSchema,
  slotIndex: z.number().int().min(0).max(9),
});

// Remove an item from a basket
export const removeBasketItemSchema = z.object({
  inventoryItemId: cuidSchema,
});

// Update basket metadata or status
export const updateBasketSchema = z.object({
  name: z.string().optional(),
  status: tradeupBasketStatusSchema.optional(),
  notes: z.string().optional(),
});

// Query filter for basket list
export const basketFilterSchema = z
  .object({
    status: tradeupBasketStatusSchema.optional(),
    planId: cuidSchema.optional(),
    sortBy: z.enum(['createdAt', 'updatedAt', 'status', 'totalCost']).default('createdAt'),
    sortDir: sortDirectionSchema,
  })
  .merge(paginationSchema);
