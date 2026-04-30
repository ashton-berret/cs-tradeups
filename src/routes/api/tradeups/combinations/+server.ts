// GET  /api/tradeups/combinations  — list saved combinations (paginated, filterable)
// POST /api/tradeups/combinations  — save a calculator state as a combination

import { json, type RequestHandler } from '@sveltejs/kit';
import { combinationSaveSchema } from '$lib/schemas/combinations';
import {
  listCombinations,
  saveCombination,
  type CombinationListFilter,
} from '$lib/server/tradeups/combinationService';
import { toErrorResponse } from '$lib/server/http/errors';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const filter: CombinationListFilter = {
      search: url.searchParams.get('search') || undefined,
      mode: pickEnum(url, 'mode', ['PLAN', 'AD_HOC']),
      targetRarity: url.searchParams.get('targetRarity') || undefined,
      inputRarity: url.searchParams.get('inputRarity') || undefined,
      collection: url.searchParams.get('collection') || undefined,
      status: pickEnum(url, 'status', ['active', 'draft']),
      source: pickEnum(url, 'source', ['imported', 'local']),
      minProfit: numberParam(url, 'minProfit'),
      minProfitPct: numberParam(url, 'minProfitPct'),
      minProfitChance: numberParam(url, 'minProfitChance'),
      maxInputFloat: numberParam(url, 'maxInputFloat'),
      maxInputPrice: numberParam(url, 'maxInputPrice'),
      recheckStatus: pickEnum(url, 'recheckStatus', ['rechecked', 'never']),
      outputs: pickEnum(url, 'outputs', ['with', 'without']),
      sortBy: pickEnum(url, 'sortBy', [
        'createdAt',
        'name',
        'inputCost',
        'estimatedValue',
        'thesisProfit',
        'thesisProfitPct',
        'profitChance',
        'latestProfit',
        'latestDelta',
        'targetRarity',
        'inputRarity',
        'collection',
        'maxFloat',
        'maxInputPrice',
      ]),
      sortDir: pickEnum(url, 'sortDir', ['asc', 'desc']),
      page: numberParam(url, 'page'),
      limit: numberParam(url, 'limit'),
      // Default-on. The UI passes ?showDuplicates=1 to disable collapsing.
      collapseDuplicates: url.searchParams.get('showDuplicates') !== '1',
    };
    const result = await listCombinations(filter);
    return json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const parsed = combinationSaveSchema.parse(body);
    const created = await saveCombination(parsed);
    return json(created, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
};

function pickEnum<T extends string>(url: URL, key: string, allowed: readonly T[]): T | undefined {
  const value = url.searchParams.get(key);
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function numberParam(url: URL, key: string): number | undefined {
  const value = url.searchParams.get(key);
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
