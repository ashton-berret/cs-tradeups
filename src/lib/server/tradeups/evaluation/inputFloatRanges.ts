// Enrich basket slot contexts with each input's per-skin float range.
//
// The CS2 trade-up output formula uses *normalized* input wear proportions
// (each input's float divided by its own range) before averaging. Without
// per-input min/max float we can only correctly project outputs for skins
// whose range happens to be [0, 1] — most CS2 skins have narrower ranges, so
// the unenriched path silently mis-projects exteriors and prices.
//
// `enrichSlotsWithInputRanges` looks up each slot's catalogSkinId in the
// static catalog snapshot and attaches inputMinFloat/inputMaxFloat. Slots
// without a catalogSkinId, or whose catalogSkinId is not in the snapshot,
// are returned with null ranges; callers should fall back to skipping
// output projection (rather than approximating with raw floats).

import { getCatalogSkinFloatRange } from '$lib/server/catalog/linkage';
import type { BasketSlotContext } from './expectedValue';

export interface SlotItemForEnrichment {
  id: string;
  catalogSkinId: string | null;
  collection: string | null;
  catalogCollectionId?: string | null;
  exterior?: string | null;
  floatValue: number | null;
  rarity: string | null;
}

export async function enrichSlotsWithInputRanges(
  items: SlotItemForEnrichment[],
): Promise<BasketSlotContext[]> {
  const ranges = await Promise.all(
    items.map((item) => getCatalogSkinFloatRange(item.catalogSkinId)),
  );

  return items.map((item, idx) => {
    const range = ranges[idx];
    return {
      inventoryItemId: item.id,
      collection: item.collection,
      catalogCollectionId: item.catalogCollectionId ?? null,
      exterior: item.exterior ?? null,
      floatValue: item.floatValue,
      rarity: item.rarity,
      inputMinFloat: range?.minFloat ?? null,
      inputMaxFloat: range?.maxFloat ?? null,
    };
  });
}
