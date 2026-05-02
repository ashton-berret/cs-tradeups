import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getCatalogSnapshot } from '$lib/server/catalog/catalogService';
import { listTradeupCombos, type ComboListFilter } from '$lib/server/engine/comboEnumerator';
import { ITEM_RARITIES, type ItemRarity } from '$lib/types/enums';

export const load: PageServerLoad = async ({ url }) => {
  try {
    const snapshot = await getCatalogSnapshot();
    const filter = filterFromUrl(url);
    const page = await listTradeupCombos(filter);
    const collections = snapshot.collections
      .map((collection) => ({ id: collection.id, name: collection.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      page,
      collections,
      filter: {
        rarity: filter.inputRarity ?? '',
        collectionId: filter.collectionId ?? '',
        statTrak: filter.statTrak == null ? '' : String(filter.statTrak),
        hasSingleOutputCollection:
          filter.hasSingleOutputCollection == null ? '' : String(filter.hasSingleOutputCollection),
        catalogVersion: filter.catalogVersion ?? '',
        page: filter.page ?? 1,
        limit: filter.limit ?? 25,
      },
    };
  } catch (err) {
    error(500, err instanceof Error ? err.message : 'Failed to load trade-up combos.');
  }
};

function filterFromUrl(url: URL): ComboListFilter {
  return {
    inputRarity: parseRarity(url.searchParams.get('rarity')),
    collectionId: nonEmpty(url.searchParams.get('collectionId')),
    statTrak: parseBoolean(url.searchParams.get('statTrak')),
    hasSingleOutputCollection: parseBoolean(url.searchParams.get('hasSingleOutputCollection')),
    catalogVersion: nonEmpty(url.searchParams.get('catalogVersion')),
    page: parsePositiveInteger(url.searchParams.get('page')) ?? 1,
    limit: parsePositiveInteger(url.searchParams.get('limit')) ?? 25,
  };
}

function parseRarity(value: string | null): ItemRarity | undefined {
  if (!value) return undefined;
  return ITEM_RARITIES.includes(value as ItemRarity) ? (value as ItemRarity) : undefined;
}

function parseBoolean(value: string | null): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function parsePositiveInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function nonEmpty(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
