// Service-layer DTOs and return shapes.
//
// Services convert Prisma rows (which contain `Decimal` for money fields) into
// plain `number` at the boundary. Route/UI code should never see `Decimal`.
//
// Input types live in `$lib/types/domain.ts` (inferred from Zod schemas).
// Output DTOs live here so the persistence layer can change without rippling
// through route handlers and components.

import type {
  CandidateDecisionStatus,
  CandidateSource,
  InventoryStatus,
  ItemExterior,
  ItemRarity,
  TradeupBasketStatus,
} from './enums';

// ---------------------------------------------------------------------------
// Candidate
// ---------------------------------------------------------------------------

export interface CandidateDTO {
  id: string;
  createdAt: Date;
  updatedAt: Date;

  marketHashName: string;
  weaponName: string | null;
  skinName: string | null;
  collection: string | null;
  catalogSkinId: string | null;
  catalogCollectionId: string | null;
  catalogWeaponDefIndex: number | null;
  catalogPaintIndex: number | null;
  rarity: ItemRarity | null;
  exterior: ItemExterior | null;
  floatValue: number | null;
  pattern: number | null;
  inspectLink: string | null;

  listPrice: number;
  currency: string;
  listingUrl: string | null;
  listingId: string | null;

  source: CandidateSource;
  status: CandidateDecisionStatus;

  qualityScore: number | null;
  liquidityScore: number | null;
  expectedProfit: number | null;
  expectedProfitPct: number | null;
  maxBuyPrice: number | null;
  marginalBasketValue: number | null;
  matchedPlanId: string | null;

  timesSeen: number;
  mergeCount: number;
  lastSeenAt: Date;
  staleness: StalenessLevel; // derived, not persisted

  evaluationRefreshedAt: Date | null;
  evaluationAge: EvaluationAgeLevel; // derived, not persisted

  pinnedByUser: boolean;

  notes: string | null;
}

export type StalenessLevel = 'FRESH' | 'RECENT' | 'STALE' | 'COLD';
export type EvaluationAgeLevel = 'FRESH' | 'AGING' | 'STALE';

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export interface InventoryItemDTO {
  id: string;
  createdAt: Date;
  updatedAt: Date;

  marketHashName: string;
  weaponName: string | null;
  skinName: string | null;
  collection: string | null;
  catalogSkinId: string | null;
  catalogCollectionId: string | null;
  catalogWeaponDefIndex: number | null;
  catalogPaintIndex: number | null;
  rarity: ItemRarity | null;
  exterior: ItemExterior | null;
  floatValue: number | null;
  pattern: number | null;
  inspectLink: string | null;

  purchasePrice: number;
  purchaseCurrency: string;
  purchaseFees: number | null;
  purchaseDate: Date;

  status: InventoryStatus;
  currentEstValue: number | null;

  candidateId: string | null;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export interface PlanRuleDTO {
  id: string;
  planId: string;
  collection: string | null;
  catalogCollectionId: string | null;
  rarity: ItemRarity | null;
  exterior: ItemExterior | null;
  minFloat: number | null;
  maxFloat: number | null;
  maxBuyPrice: number | null;
  minQuantity: number | null;
  maxQuantity: number | null;
  priority: number;
  isPreferred: boolean;
}

export interface OutcomeItemDTO {
  id: string;
  planId: string;
  marketHashName: string;
  weaponName: string | null;
  skinName: string | null;
  collection: string;
  catalogSkinId: string | null;
  catalogCollectionId: string | null;
  catalogWeaponDefIndex: number | null;
  catalogPaintIndex: number | null;
  rarity: ItemRarity;
  estimatedMarketValue: number;
  probabilityWeight: number;
}

export interface PlanDTO {
  id: string;
  createdAt: Date;
  updatedAt: Date;

  name: string;
  description: string | null;
  inputRarity: ItemRarity;
  targetRarity: ItemRarity;
  isActive: boolean;

  minProfitThreshold: number | null;
  minProfitPctThreshold: number | null;
  minLiquidityScore: number | null;
  minCompositeScore: number | null;

  notes: string | null;

  rules: PlanRuleDTO[];
  outcomeItems: OutcomeItemDTO[];
}

// ---------------------------------------------------------------------------
// Basket
// ---------------------------------------------------------------------------

export interface BasketItemDTO {
  id: string;
  basketId: string;
  inventoryItemId: string;
  slotIndex: number;
  addedAt: Date;
  inventoryItem: InventoryItemDTO;
}

export interface BasketDTO {
  id: string;
  createdAt: Date;
  updatedAt: Date;

  planId: string;
  name: string | null;
  status: TradeupBasketStatus;

  // Computed metrics — kept eager, refreshed on every item mutation.
  totalCost: number | null;
  expectedEV: number | null;
  expectedProfit: number | null;
  expectedProfitPct: number | null;
  averageFloat: number | null;

  itemCount: number; // derived
  isFull: boolean;   // derived — itemCount === 10

  notes: string | null;

  items: BasketItemDTO[];
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export interface ExecutionDTO {
  id: string;
  createdAt: Date;
  updatedAt: Date;

  basketId: string;
  planId: string;
  executedAt: Date;

  inputCost: number;
  expectedEV: number | null;

  resultMarketHashName: string | null;
  resultWeaponName: string | null;
  resultSkinName: string | null;
  resultCollection: string | null;
  resultExterior: ItemExterior | null;
  resultFloatValue: number | null;
  estimatedResultValue: number | null;

  salePrice: number | null;
  saleFees: number | null;
  saleDate: Date | null;
  realizedProfit: number | null;
  realizedProfitPct: number | null;

  notes: string | null;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export type EvaluateTarget =
  | { kind: 'candidate'; id: string }
  | { kind: 'inventory'; id: string }
  | { kind: 'basket'; id: string };

export interface PlanMatch {
  planId: string;
  ruleId: string | null;   // null if matched by plan inputRarity fallback only
  fitScore: number;        // 0..1 — how well this candidate satisfies the rule
  preferred: boolean;
  maxBuyPrice: number | null;
}

export type RuleFailureCode =
  | 'RARITY'
  | 'COLLECTION'
  | 'EXTERIOR'
  | 'FLOAT_REQUIRED'
  | 'FLOAT_RANGE'
  | 'MAX_BUY_PRICE';

export interface RuleFailureDiagnostic {
  code: RuleFailureCode;
  expected?: string | number | null;
  actual?: string | number | null;
}

export interface RuleMatchDiagnostic {
  ruleId: string;
  accepted: boolean;
  fitScore: number;
  failures: RuleFailureDiagnostic[];
}

export type PlanFailureCode = 'INPUT_RARITY_MISMATCH' | 'NO_RULE_MATCH';

export interface PlanFailureDiagnostic {
  code: PlanFailureCode;
  expected?: string | number | null;
  actual?: string | number | null;
}

export interface CandidatePlanDiagnostic {
  planId: string;
  planName: string;
  matched: boolean;
  selectedRuleId: string | null;
  failures: PlanFailureDiagnostic[];
  ruleDiagnostics: RuleMatchDiagnostic[];
  candidateCollectionOutcomeCount: number;
}

export interface CandidateEvaluation {
  candidateId: string;
  matchedPlanId: string | null;
  allMatches: PlanMatch[];
  diagnostics: CandidatePlanDiagnostic[];
  qualityScore: number;
  liquidityScore: number;
  expectedProfit: number | null;
  expectedProfitPct: number | null;
  maxBuyPrice: number | null;
  recommendation: CandidateDecisionStatus;
}

export interface InventoryEvaluation {
  inventoryItemId: string;
  eligiblePlanIds: string[];
  bestPlanId: string | null;
  marginalContribution: number | null; // EV delta if item is added to the best-fit basket
}

export interface BasketEVBreakdown {
  totalEV: number;
  perCollectionChance: Record<string /* collection */, number /* 0..1 */>;
  perOutcomeContribution: Array<{
    outcomeId: string;
    marketHashName: string;
    probability: number;
    estimatedValue: number;
    contribution: number; // probability * estimatedValue
    projectedFloat: number | null;
    projectedExterior: ItemExterior | null;
    projectedMarketHashName: string | null;
  }>;
}

export interface BasketEvaluation {
  basketId: string;
  inputCost: number;
  ev: BasketEVBreakdown;
  expectedProfit: number;
  expectedProfitPct: number;
  averageFloat: number | null;
  readinessIssues: BasketReadinessIssue[]; // empty means the basket is executable
}

export type BasketReadinessIssue =
  | { code: 'ITEM_COUNT'; actual: number }
  | { code: 'MIXED_RARITY'; rarities: ItemRarity[] }
  | { code: 'RARITY_MISMATCH'; expected: ItemRarity; actual: ItemRarity }
  | { code: 'MISSING_FLOAT'; itemId: string }
  | { code: 'MISSING_COLLECTION'; itemId: string }
  | { code: 'RULE_MISMATCH'; itemId: string };

export type EvaluationResult =
  | { kind: 'candidate'; result: CandidateEvaluation }
  | { kind: 'inventory'; result: InventoryEvaluation }
  | { kind: 'basket'; result: BasketEvaluation };

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface PlanPerformanceRow {
  planId: string;
  planName: string;
  executions: number;
  totalInputCost: number;
  totalRealized: number;
  totalRealizedProfit: number;
  avgExpectedProfit: number | null;
  avgRealizedProfit: number | null;
  evRealizedDelta: number | null; // expected - realized per execution, averaged
}

export interface ActivityEntry {
  at: Date;
  kind:
    | 'CANDIDATE_INGESTED'
    | 'CANDIDATE_BOUGHT'
    | 'CANDIDATE_PASSED'
    | 'BASKET_READY'
    | 'EXECUTION_RECORDED'
    | 'SALE_RECORDED';
  refId: string;
  label: string;
}

export interface EvRealizedPoint {
  executedAt: Date;
  planId: string;
  planName: string;
  expectedProfit: number | null;
  realizedProfit: number | null;
}
