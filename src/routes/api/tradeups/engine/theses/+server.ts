import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listTheses, type ThesisListFilter } from '$lib/server/engine/thesisScorer';
import { ITEM_RARITIES, type ItemRarity } from '$lib/types/enums';

export const GET: RequestHandler = async ({ url }) => {
  const filter: ThesisListFilter = {
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

  const result = await listTheses(filter);
  return json(result);
};

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
