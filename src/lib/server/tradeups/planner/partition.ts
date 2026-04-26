// Partition — within a single plan, group items into 10-slot baskets to
// maximize total EV across formed baskets.
//
// Why pure-collection-first heuristic:
//   CS2 trade-up EV is additive across slots: each slot contributes
//   (1/10) * EV(its-collection-outcomes-at-target-rarity). Total EV across a
//   *fixed pool of slots* is therefore conserved across partitions when no
//   per-exterior pricing differences exist. Where partition matters:
//     1. number of *full* (10-slot) baskets — stranded slots earn $0
//     2. cost — we don't have to buy candidates we don't assign
//     3. float-driven projected exterior — same-collection items grouped
//        with similar floats project to a different exterior (and price)
//        than mixed-float groupings
//   Pure-collection groups maximize (3) and tie on (1) when the pool divides
//   cleanly. The local-search swap pass cleans up float-driven inefficiencies.
//
// Algorithm shape:
//   1. Initialize PlannerBasket[] from existing BUILDING baskets on this plan
//      with their fixed items.
//   2. Fill open slots in existing baskets with eligible free items, picking
//      same-collection extensions when possible.
//   3. Cluster remaining items by collection. For each cluster ≥ 10, pull a
//      pure-collection proposed basket. Repeat until no cluster ≥ 10.
//   4. Form mixed proposed baskets from leftovers in groups of 10.
//   5. Run a local-search pass swapping items between baskets if total EV
//      strictly improves. Iterate to a fixed point or maxIterations.
//   6. Items left over (< 10 to form a basket and no existing basket has
//      room) are returned as `reserved`.

import type { BasketSlotContext } from '$lib/server/tradeups/evaluation/expectedValue';
import { computeBasketEV } from '$lib/server/tradeups/evaluation/expectedValue';
import { averageWearProportion } from '$lib/server/utils/float';
import type { PlannerBasket, PlanWithRulesAndOutcomes, PoolItem } from './types';

const MAX_SWAP_ITERATIONS = 8;

export interface PartitionInput {
  plan: PlanWithRulesAndOutcomes;
  /** Items already eligible for this plan AND not already pinned to another basket. */
  freeItems: PoolItem[];
  /**
   * Existing BUILDING baskets on this plan with the items currently in them.
   * Used as fixed starting points; the optimizer fills the empty slots only.
   */
  existingBaskets: Array<{ basketId: string; items: PoolItem[] }>;
}

export interface PartitionOutput {
  baskets: PlannerBasket[];
  reserved: PoolItem[];
}

export function partitionPlan(input: PartitionInput): PartitionOutput {
  const { plan, freeItems, existingBaskets } = input;

  const baskets: PlannerBasket[] = existingBaskets.map((b) => ({
    basketGroupId: `basket:${b.basketId}`,
    basketId: b.basketId,
    planId: plan.id,
    fixedItems: b.items,
    placedItems: [],
  }));

  const remaining = [...freeItems];
  // Stable sort so output is deterministic for identical inputs.
  remaining.sort((a, b) => a.poolItemId.localeCompare(b.poolItemId));

  // Phase 1 — fill existing baskets, prioritizing items that match the
  // basket's dominant collection. Process baskets from most-fixed-items down
  // so nearly-ready baskets get completed first.
  baskets.sort((a, b) => b.fixedItems.length - a.fixedItems.length);

  for (const basket of baskets) {
    const dominantCollection = pickDominantCollection(basket.fixedItems);
    while (basketSize(basket) < 10 && remaining.length > 0) {
      const next =
        pickNextForBasket(remaining, dominantCollection) ??
        // No same-collection available — accept any free item that improves EV.
        pickAnyImprovingForBasket(remaining, basket, plan);
      if (!next) break;
      basket.placedItems.push(next);
      removeFrom(remaining, next);
    }
  }

  // Phase 2 — form pure-collection proposed baskets from remaining items.
  let proposedIndex = 0;
  let formed = true;
  while (formed) {
    formed = false;
    const grouped = groupByCollection(remaining);
    let bestKey: string | null = null;
    let bestSize = 0;
    for (const [key, items] of grouped) {
      if (items.length >= 10 && items.length > bestSize) {
        bestKey = key;
        bestSize = items.length;
      }
    }
    if (bestKey != null) {
      const items = grouped.get(bestKey) ?? [];
      const taken = items.slice(0, 10);
      const newBasket: PlannerBasket = {
        basketGroupId: `proposed:${plan.id}:${proposedIndex++}`,
        basketId: null,
        planId: plan.id,
        fixedItems: [],
        placedItems: taken,
      };
      baskets.push(newBasket);
      for (const item of taken) removeFrom(remaining, item);
      formed = true;
    }
  }

  // Phase 3 — form mixed proposed baskets from leftovers in chunks of 10.
  // Sort by collection EV desc so the best collections fill first.
  while (remaining.length >= 10) {
    remaining.sort((a, b) => itemCollectionEV(b, plan) - itemCollectionEV(a, plan));
    const taken = remaining.slice(0, 10);
    const newBasket: PlannerBasket = {
      basketGroupId: `proposed:${plan.id}:${proposedIndex++}`,
      basketId: null,
      planId: plan.id,
      fixedItems: [],
      placedItems: taken,
    };
    baskets.push(newBasket);
    for (const item of taken) removeFrom(remaining, item);
  }

  // Phase 4 — local-search swap optimization.
  optimizeBySwap(baskets, plan);

  return { baskets, reserved: remaining };
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function basketSize(basket: PlannerBasket): number {
  return basket.fixedItems.length + basket.placedItems.length;
}

export function basketSlots(basket: PlannerBasket): BasketSlotContext[] {
  return [...basket.fixedItems, ...basket.placedItems].map(toSlotContext);
}

export function basketEV(basket: PlannerBasket, plan: PlanWithRulesAndOutcomes): number {
  const slots = basketSlots(basket);
  const avgWearProportion = averageWearProportion(slots);
  return computeBasketEV(slots, plan, { averageWearProportion: avgWearProportion }).totalEV;
}

function toSlotContext(item: PoolItem): BasketSlotContext {
  return {
    inventoryItemId: item.poolItemId,
    collection: item.collectionKey,
    catalogCollectionId: null,
    exterior: item.exterior,
    floatValue: item.floatValue,
    rarity: item.rarity,
    inputMinFloat: item.inputMinFloat ?? null,
    inputMaxFloat: item.inputMaxFloat ?? null,
  };
}

function pickDominantCollection(items: PoolItem[]): string | null {
  if (items.length === 0) return null;
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item.collectionKey) continue;
    counts.set(item.collectionKey, (counts.get(item.collectionKey) ?? 0) + 1);
  }
  let bestKey: string | null = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount || (count === bestCount && (bestKey == null || key < bestKey))) {
      bestKey = key;
      bestCount = count;
    }
  }
  return bestKey;
}

function pickNextForBasket(
  items: PoolItem[],
  dominantCollection: string | null,
): PoolItem | null {
  if (!dominantCollection) return null;
  return items.find((item) => item.collectionKey === dominantCollection) ?? null;
}

function pickAnyImprovingForBasket(
  items: PoolItem[],
  basket: PlannerBasket,
  plan: PlanWithRulesAndOutcomes,
): PoolItem | null {
  let best: PoolItem | null = null;
  let bestDelta = 0;
  const baseSlots = basketSlots(basket);
  const baseEV = computeBasketEV(baseSlots, plan).totalEV;
  for (const item of items) {
    const trialEV = computeBasketEV([...baseSlots, toSlotContext(item)], plan).totalEV;
    const delta = trialEV - baseEV;
    if (delta > bestDelta) {
      bestDelta = delta;
      best = item;
    }
  }
  return best;
}

function groupByCollection(items: PoolItem[]): Map<string, PoolItem[]> {
  const map = new Map<string, PoolItem[]>();
  for (const item of items) {
    const key = item.collectionKey ?? '__null__';
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}

/**
 * EV the item's collection contributes to a basket if it filled all 10 slots.
 * Used as a sort key when forming mixed baskets — items from collections
 * with no outcomes get 0 and sink to the end.
 */
function itemCollectionEV(item: PoolItem, plan: PlanWithRulesAndOutcomes): number {
  if (!item.collectionKey) return 0;
  const slots: BasketSlotContext[] = Array.from({ length: 10 }, (_, idx) => ({
    inventoryItemId: `__phantom__:${idx}`,
    collection: item.collectionKey,
    catalogCollectionId: null,
    exterior: null,
    floatValue: null,
    rarity: item.rarity,
  }));
  return computeBasketEV(slots, plan).totalEV;
}

function removeFrom(items: PoolItem[], target: PoolItem): void {
  const idx = items.findIndex((it) => it.poolItemId === target.poolItemId);
  if (idx >= 0) items.splice(idx, 1);
}

// --------------------------------------------------------------------------
// Local-search swap optimization
// --------------------------------------------------------------------------

function optimizeBySwap(baskets: PlannerBasket[], plan: PlanWithRulesAndOutcomes): void {
  for (let iter = 0; iter < MAX_SWAP_ITERATIONS; iter++) {
    let improved = false;

    for (let i = 0; i < baskets.length; i++) {
      for (let j = i + 1; j < baskets.length; j++) {
        const a = baskets[i];
        const b = baskets[j];
        // Only `placedItems` can move; fixed items stay put.
        for (let ai = 0; ai < a.placedItems.length; ai++) {
          for (let bi = 0; bi < b.placedItems.length; bi++) {
            if (trySwap(a, ai, b, bi, plan)) {
              improved = true;
            }
          }
        }
      }
    }

    if (!improved) break;
  }
}

function trySwap(
  a: PlannerBasket,
  ai: number,
  b: PlannerBasket,
  bi: number,
  plan: PlanWithRulesAndOutcomes,
): boolean {
  const beforeA = basketEV(a, plan);
  const beforeB = basketEV(b, plan);
  const before = beforeA + beforeB;

  // Swap and recompute.
  const tmp = a.placedItems[ai];
  a.placedItems[ai] = b.placedItems[bi];
  b.placedItems[bi] = tmp;

  const afterA = basketEV(a, plan);
  const afterB = basketEV(b, plan);
  const after = afterA + afterB;

  // Require strict improvement greater than a small epsilon to avoid
  // floating-point churn that would make the iteration non-terminating.
  if (after > before + 1e-6) {
    return true;
  }

  // Revert.
  const revert = a.placedItems[ai];
  a.placedItems[ai] = b.placedItems[bi];
  b.placedItems[bi] = revert;
  return false;
}
