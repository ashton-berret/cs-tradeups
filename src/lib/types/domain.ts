import type { z } from 'zod';
import type {
  createCandidateSchema,
  extensionCandidateSchema,
  updateCandidateSchema,
  candidateFilterSchema,
} from '$lib/schemas/candidate';
import type {
  createInventoryItemSchema,
  updateInventoryItemSchema,
  convertCandidateSchema,
  inventoryFilterSchema,
} from '$lib/schemas/inventory';
import type {
  createPlanSchema,
  updatePlanSchema,
  planRuleSchema,
  outcomeItemSchema,
  planFilterSchema,
} from '$lib/schemas/plan';
import type {
  createBasketSchema,
  addBasketItemSchema,
  updateBasketSchema,
  basketFilterSchema,
} from '$lib/schemas/basket';
import type {
  createExecutionSchema,
  updateExecutionResultSchema,
  recordSaleSchema,
  executionFilterSchema,
} from '$lib/schemas/execution';

// -- Candidate --
export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;
export type ExtensionCandidateInput = z.infer<typeof extensionCandidateSchema>;
export type UpdateCandidateInput = z.infer<typeof updateCandidateSchema>;
export type CandidateFilter = z.infer<typeof candidateFilterSchema>;

// -- Inventory --
export type CreateInventoryItemInput = z.infer<typeof createInventoryItemSchema>;
export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>;
export type ConvertCandidateInput = z.infer<typeof convertCandidateSchema>;
export type InventoryFilter = z.infer<typeof inventoryFilterSchema>;

// -- Plan --
export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
export type PlanRuleInput = z.infer<typeof planRuleSchema>;
export type OutcomeItemInput = z.infer<typeof outcomeItemSchema>;
export type PlanFilter = z.infer<typeof planFilterSchema>;

// -- Basket --
export type CreateBasketInput = z.infer<typeof createBasketSchema>;
export type AddBasketItemInput = z.infer<typeof addBasketItemSchema>;
export type UpdateBasketInput = z.infer<typeof updateBasketSchema>;
export type BasketFilter = z.infer<typeof basketFilterSchema>;

// -- Execution --
export type CreateExecutionInput = z.infer<typeof createExecutionSchema>;
export type UpdateExecutionResultInput = z.infer<typeof updateExecutionResultSchema>;
export type RecordSaleInput = z.infer<typeof recordSaleSchema>;
export type ExecutionFilter = z.infer<typeof executionFilterSchema>;

// -- Shared --
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DashboardSummary {
  candidateCount: number;
  goodBuyCount: number;
  boughtCount: number;
  inventoryCount: number;
  inventoryCostBasis: number;
  activeBasketsCount: number;
  readyBasketsCount: number;
  executionCount: number;
  totalRealizedProfit: number;
  avgExpectedProfit: number;
}
