import { error, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getCatalogSnapshot } from '$lib/server/catalog/catalogService';
import { listTheses, scoreTheses, type ThesisListFilter } from '$lib/server/engine/thesisScorer';
import { ITEM_RARITIES, type ItemRarity } from '$lib/types/enums';

export const load: PageServerLoad = async ({ url }) => {
  try {
    const snapshot = await getCatalogSnapshot();
    const filter = filterFromUrl(url);
    const page = await listTheses(filter);
    const collections = snapshot.collections
      .map((c) => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      page,
      collections,
      filter: {
        inputRarity: filter.inputRarity ?? '',
        statTrak: filter.statTrak == null ? '' : String(filter.statTrak),
        collectionId: filter.collectionId ?? '',
        status: filter.status ?? 'ACTIVE',
        minEv: filter.minEv != null ? String(filter.minEv) : '',
        minProfitChance: filter.minProfitChance != null ? String(filter.minProfitChance) : '',
        sortBy: filter.sortBy ?? 'score',
        sortDir: filter.sortDir ?? 'desc',
        page: filter.page ?? 1,
        limit: filter.limit ?? 25,
      },
    };
  } catch (err) {
    error(500, err instanceof Error ? err.message : 'Failed to load theses.');
  }
};

export const actions: Actions = {
  score: async () => {
    try {
      const result = await scoreTheses();
      return {
        success: `Scored ${result.scored} theses, skipped ${result.skipped} in ${(result.durationMs / 1000).toFixed(1)}s.`,
      };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : 'Scoring failed.',
      };
    }
  },
};

function filterFromUrl(url: URL): ThesisListFilter {
  return {
    inputRarity: parseRarity(url.searchParams.get('inputRarity')),
    statTrak: parseBoolean(url.searchParams.get('statTrak')),
    collectionId: nonEmpty(url.searchParams.get('collectionId')),
    status: nonEmpty(url.searchParams.get('status')) ?? 'ACTIVE',
    minEv: parseNumber(url.searchParams.get('minEv')),
    minProfitChance: parseNumber(url.searchParams.get('minProfitChance')),
    sortBy: nonEmpty(url.searchParams.get('sortBy')) ?? 'score',
    sortDir: parseSortDir(url.searchParams.get('sortDir')),
    page: parsePositiveInt(url.searchParams.get('page')) ?? 1,
    limit: parsePositiveInt(url.searchParams.get('limit')) ?? 25,
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

function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function parseSortDir(value: string | null): 'asc' | 'desc' {
  return value === 'asc' ? 'asc' : 'desc';
}

function nonEmpty(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
