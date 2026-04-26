// Eligibility — turn raw rows into a uniform PoolItem[] and compute which
// active plans accept each item.
//
// This is the only module that knows how candidates and inventory differ.
// Everything downstream operates on PoolItem / EligiblePoolItem.

import type { CandidateListing, InventoryItem } from '@prisma/client';
import { matchCandidateToPlans, toCandidateLike } from '$lib/server/tradeups/evaluation/ruleMatching';
import { getCatalogSkinFloatRange } from '$lib/server/catalog/linkage';
import { toNumber } from '$lib/server/utils/decimal';
import type { EligiblePoolItem, PlanEligibility, PlanWithRulesAndOutcomes, PoolItem } from './types';

interface BuildPoolInput {
  candidates: CandidateListing[];
  inventory: InventoryItem[];
  /**
   * Map of inventoryItemId → existing basketId. Used to mark items pinned to
   * a BUILDING basket so the optimizer treats them as fixed.
   */
  inventoryBasketMap: Map<string, string>;
}

export async function buildPool(input: BuildPoolInput): Promise<PoolItem[]> {
  const items: PoolItem[] = [];

  // Resolve per-skin float ranges in parallel by catalogSkinId. Items without
  // a catalogSkinId get null ranges and the partition optimizer falls back
  // to non-projected EV for those slots.
  const candidateRanges = await Promise.all(
    input.candidates.map((row) => getCatalogSkinFloatRange(row.catalogSkinId)),
  );
  const inventoryRanges = await Promise.all(
    input.inventory.map((row) => getCatalogSkinFloatRange(row.catalogSkinId)),
  );

  input.candidates.forEach((row, idx) => {
    const range = candidateRanges[idx];
    items.push({
      poolItemId: `candidate:${row.id}`,
      kind: 'CANDIDATE',
      sourceId: row.id,
      marketHashName: row.marketHashName,
      collectionKey: row.catalogCollectionId ?? row.collection ?? null,
      rarity: row.rarity,
      exterior: row.exterior,
      floatValue: row.floatValue,
      currentPrice: toNumber(row.listPrice) ?? 0,
      pinnedBasketId: null,
      inputMinFloat: range?.minFloat ?? null,
      inputMaxFloat: range?.maxFloat ?? null,
      candidateRow: row,
      inventoryRow: null,
    });
  });

  input.inventory.forEach((row, idx) => {
    const range = inventoryRanges[idx];
    items.push({
      poolItemId: `inventory:${row.id}`,
      kind: 'INVENTORY',
      sourceId: row.id,
      marketHashName: row.marketHashName,
      collectionKey: row.catalogCollectionId ?? row.collection ?? null,
      rarity: row.rarity,
      exterior: row.exterior,
      floatValue: row.floatValue,
      currentPrice: toNumber(row.purchasePrice) ?? 0,
      pinnedBasketId: input.inventoryBasketMap.get(row.id) ?? null,
      inputMinFloat: range?.minFloat ?? null,
      inputMaxFloat: range?.maxFloat ?? null,
      candidateRow: null,
      inventoryRow: row,
    });
  });

  // Deterministic ordering — downstream code may rely on stable iteration.
  items.sort((a, b) => a.poolItemId.localeCompare(b.poolItemId));
  return items;
}

/**
 * For each pool item, compute eligibility against every active plan whose
 * `inputRarity` matches the item's rarity. Items without a rarity, or whose
 * rarity matches no active plan, are still returned — with empty eligibility.
 * The caller decides what to do with unassignable items (typically: surface
 * as "unassigned" with a reason).
 */
export function computeEligibility(
  pool: PoolItem[],
  plans: PlanWithRulesAndOutcomes[],
): EligiblePoolItem[] {
  return pool.map((item) => {
    const eligibility = eligibilityForItem(item, plans);
    return { ...item, eligibility };
  });
}

function eligibilityForItem(
  item: PoolItem,
  plans: PlanWithRulesAndOutcomes[],
): PlanEligibility[] {
  // matchCandidateToPlans expects a CandidateLike — both candidate rows and
  // inventory rows can produce one via toCandidateLike. We construct it from
  // the underlying row to preserve all fields the matcher inspects.
  const row = item.candidateRow ?? item.inventoryRow;
  if (!row) {
    return [];
  }

  const matches = matchCandidateToPlans(toCandidateLike(row), plans);

  return matches.map((match) => ({
    planId: match.planId,
    ruleId: match.ruleId,
    fitScore: match.fitScore,
    maxBuyPrice: match.maxBuyPrice,
  }));
}
