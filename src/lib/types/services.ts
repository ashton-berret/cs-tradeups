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
    priceSource: 'OBSERVED_MARKET' | 'PLAN_FALLBACK';
    priceMarketHashName: string;
    priceObservedAt: Date | null;
    priceFreshness: 'FRESH' | 'RECENT' | 'STALE' | 'OLD' | null;
    priceBasis: 'STEAM_NET' | 'STEAM_GROSS' | 'MANUAL_ESTIMATE' | 'THIRD_PARTY_REFERENCE';
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
// Planner / Buy Queue
// ---------------------------------------------------------------------------
//
// The planner is a global partition optimizer: it takes the full pool of
// candidates + held inventory + active baskets and produces an assignment
// per item showing which plan/basket/slot it should occupy to maximize total
// expected EV across all baskets, plus runner-up alternatives so the operator
// can override with full information.
//
// Assignments are transient (recomputed on demand). Pool items always carry
// a stable `poolItemId` so the UI can map back to the underlying candidate or
// inventory item.

/** Whether the pool item is a candidate (not yet purchased) or inventory (held). */
export type PoolItemKind = 'CANDIDATE' | 'INVENTORY';

/** Where the planner placed the item. */
export type AssignmentRole =
  /** Filling a slot in a new basket the planner proposed. */
  | 'NEW_BASKET'
  /** Filling an open slot in an existing BUILDING basket. */
  | 'BASKET_FILL'
  /** Eligible but no full basket forms; held in reserve for a future fill. */
  | 'RESERVE'
  /** Operator manually pinned this item to this basket; planner respects it. */
  | 'PINNED';

export interface AssignmentAlternative {
  /** Plan the alternative would assign to. Same plan as primary is allowed when only the basket differs. */
  planId: string;
  planName: string;
  /** null when the alternative is a different new basket within the same/another plan. */
  basketId: string | null;
  /** Marginal EV contribution if the item went here instead of its primary. */
  marginalEVContribution: number | null;
  /**
   * Delta = (primary marginal EV) - (this alternative's marginal EV). Always ≥ 0
   * because the primary is the best by definition. Lets the UI render
   * "this assignment beats the next-best plan by $0.34".
   */
  deltaFromPrimary: number;
  /** Short, user-facing reason this lost. */
  whyNotChosen: string;
}

export interface AssignmentFloatFit {
  /** 0..1 — same scale as ruleFitScore but evaluated against the assigned basket, not the rule midpoint. */
  score: number;
  /** Short user-facing string. e.g. "0.07 inside 0.00–0.15 band; basket avg → MW output". */
  explanation: string;
}

export interface AssignmentPricing {
  /** OBSERVED → live market price drove EV; PLAN_FALLBACK → plan outcome value used. */
  source: 'OBSERVED' | 'PLAN_FALLBACK';
  freshness: 'FRESH' | 'RECENT' | 'STALE' | 'OLD' | null;
}

export interface CandidateAssignment {
  /** Stable id for the pool item — `candidate:<id>` or `inventory:<id>`. */
  poolItemId: string;
  poolItemKind: PoolItemKind;

  /** The underlying row id (candidate.id or inventoryItem.id). */
  sourceId: string;

  planId: string;
  planName: string;

  /**
   * Existing basket id when filling slots in a BUILDING basket; null when the
   * planner is proposing a fresh basket. Proposed baskets are not persisted —
   * the operator must materialize them by clicking "create basket".
   */
  basketId: string | null;

  /**
   * Stable id for the proposed (or existing) basket grouping. Existing baskets
   * use their real id; proposed baskets use `proposed:<planId>:<index>` so the
   * UI can group rows that belong together even before any DB row exists.
   */
  basketGroupId: string;

  /** 0-based slot index inside the (proposed or existing) basket. */
  basketSlotIndex: number;

  role: AssignmentRole;

  /** Snapshot of the candidate's current recommendation (only meaningful for CANDIDATE kind). */
  recommendation: CandidateDecisionStatus | null;

  /** Max buy guidance; null when not derivable (no plan threshold, no EV). */
  maxBuyPrice: number | null;

  /** Item's price right now — listPrice for candidates, purchasePrice for inventory. */
  currentPrice: number;

  /** EV contribution of placing this item in this specific assigned basket. */
  marginalEVContribution: number | null;

  /**
   * Profit if the operator buys this item at currentPrice and the assigned
   * basket realizes its expected EV: per-slot share of basket EV minus this
   * item's currentPrice. Null when basket EV unavailable.
   */
  expectedProfit: number | null;
  expectedProfitPct: number | null;

  floatFit: AssignmentFloatFit;
  pricing: AssignmentPricing;

  /** One-line human reason. e.g. "Fills slot 7/10 of proposed Mirage basket #2 (EV $14.20)". */
  reason: string;

  /** Top runner-up assignments — at most 3, sorted by marginalEVContribution desc. */
  alternatives: AssignmentAlternative[];
}

/** Per-basket grouping data used by the buy queue UI. */
export interface ProposedBasketSummary {
  basketGroupId: string;
  basketId: string | null;        // null when proposed
  planId: string;
  planName: string;
  itemCount: number;              // 1..10
  isFull: boolean;                // itemCount === 10
  totalCost: number;              // sum of currentPrice across items
  expectedEV: number | null;
  expectedProfit: number | null;
  expectedProfitPct: number | null;
  averageFloat: number | null;
}

export interface BuyQueueResult {
  /** All assignments, including RESERVE rows, sorted plan → basket → slot. */
  assignments: CandidateAssignment[];
  /** Summaries to support grouped UI rendering without re-aggregating. */
  baskets: ProposedBasketSummary[];
  /**
   * Items that were in the input pool but ended up unassigned (no plan match,
   * or eligible but optimizer found no profitable home). UI can show these
   * separately so the operator sees nothing was silently dropped.
   */
  unassigned: Array<{
    poolItemId: string;
    poolItemKind: PoolItemKind;
    sourceId: string;
    reason: string;
  }>;
  /** Total expected profit across all proposed/filled baskets. */
  totalExpectedProfit: number;
  /** Count of baskets that would be full (10/10) under this assignment. */
  viableBasketCount: number;
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export interface DiscoveryTargetConstraint {
  planId: string;
  planName: string;
  ruleId: string;
  collection: string | null;
  catalogCollectionId: string | null;
  rarity: ItemRarity;
  exterior: ItemExterior | null;
  minFloat: number | null;
  maxFloat: number | null;
  maxBuyPrice: number | null;
  priority: number;
  reason: string;
}

export interface DiscoveryTarget {
  id: string;
  marketHashName: string;
  listingUrl: string;
  exterior: ItemExterior;
  catalogSkinId: string;
  catalogCollectionId: string;
  catalogWeaponDefIndex: number;
  catalogPaintIndex: number;
  weaponName: string;
  skinName: string;
  collection: string;
  rarity: ItemRarity;
  minFloat: number;
  maxFloat: number;
  constraints: DiscoveryTargetConstraint[];
  priority: number;
  demand: {
    openBasketSlots: number;
    queueSlots: number;
  };
}

export interface DiscoveryTargetsResult {
  generatedAt: Date;
  targets: DiscoveryTarget[];
  counts: {
    activePlans: number;
    activeRules: number;
    matchedSkins: number;
    targets: number;
  };
}

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
