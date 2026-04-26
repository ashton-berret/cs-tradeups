// Internal planner types.
//
// These shape the data flowing through eligibility → partition → assemble.
// They are intentionally separate from the public CandidateAssignment DTO in
// `$lib/types/services` because the public DTO is a presentation contract
// while these structs are computation-friendly (Maps, plain numbers, no
// Decimal, etc.).

import type { CandidateListing, InventoryItem, TradeupPlan, TradeupPlanRule, TradeupOutcomeItem } from '@prisma/client';
import type { PoolItemKind } from '$lib/types/services';

export interface PoolItem {
  /** `candidate:<id>` or `inventory:<id>` — stable across recomputes. */
  poolItemId: string;
  kind: PoolItemKind;
  sourceId: string;

  /** Identity fields used by the optimizer. */
  marketHashName: string;
  collectionKey: string | null;   // catalogCollectionId ?? collection ?? null
  rarity: string | null;
  exterior: string | null;
  floatValue: number | null;

  /** Price the operator would pay (candidate listPrice) or has already paid (inventory purchasePrice). */
  currentPrice: number;

  /**
   * Per-skin float range from the catalog snapshot, looked up by
   * `catalogSkinId`. Required for correct CS2 wear-proportion math when the
   * planner's swap optimizer compares basket EVs that depend on output
   * exterior projection. Null when the item lacks a catalog match.
   */
  inputMinFloat: number | null;
  inputMaxFloat: number | null;

  /**
   * Existing basket the item is already locked into (only set for inventory
   * items already in a BUILDING basket via TradeupBasketItem). Planner treats
   * these as fixed and optimizes the rest of the pool around them.
   */
  pinnedBasketId: string | null;

  /** Underlying rows for downstream presentation. */
  candidateRow: CandidateListing | null;
  inventoryRow: InventoryItem | null;
}

export type PlanWithRulesAndOutcomes = TradeupPlan & {
  rules: TradeupPlanRule[];
  outcomeItems: TradeupOutcomeItem[];
};

export interface PlanEligibility {
  planId: string;
  ruleId: string | null;          // null when matched by inputRarity fallback (zero-rule plan)
  fitScore: number;
  maxBuyPrice: number | null;     // from the matched rule
}

export interface EligiblePoolItem extends PoolItem {
  /** Plans that accept this item, sorted by fitScore desc. Empty array means unassignable. */
  eligibility: PlanEligibility[];
}

/** A basket the planner is constructing — proposed or existing. */
export interface PlannerBasket {
  /** `basket:<id>` for existing, `proposed:<planId>:<n>` for new. */
  basketGroupId: string;
  basketId: string | null;
  planId: string;
  /**
   * Items already locked into this basket (from TradeupBasketItem). The
   * optimizer cannot remove these.
   */
  fixedItems: PoolItem[];
  /** Items the optimizer placed here. Mutable during optimization. */
  placedItems: PoolItem[];
}
