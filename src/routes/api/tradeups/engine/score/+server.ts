import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { scoreTheses, type ScoreThesesOptions } from '$lib/server/engine/thesisScorer';
import type { ItemRarity } from '$lib/types/enums';
import { ITEM_RARITIES } from '$lib/types/enums';

export const POST: RequestHandler = async ({ request }) => {
  let body: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text.trim()) {
      body = JSON.parse(text);
    }
  } catch {
    error(400, 'Invalid JSON body.');
  }

  const options: ScoreThesesOptions = {};

  if (body.inputRarities) {
    const rarities = body.inputRarities as string[];
    if (!Array.isArray(rarities) || !rarities.every((r) => ITEM_RARITIES.includes(r as ItemRarity))) {
      error(400, 'inputRarities must be an array of valid rarities.');
    }
    options.inputRarities = rarities as ItemRarity[];
  }

  if (body.statTrakValues) {
    const values = body.statTrakValues as boolean[];
    if (!Array.isArray(values) || !values.every((v) => typeof v === 'boolean')) {
      error(400, 'statTrakValues must be an array of booleans.');
    }
    options.statTrakValues = values;
  }

  if (body.collectionIds) {
    const ids = body.collectionIds as string[];
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
      error(400, 'collectionIds must be an array of strings.');
    }
    options.collectionIds = ids;
  }

  if (body.catalogVersion) {
    if (typeof body.catalogVersion !== 'string') {
      error(400, 'catalogVersion must be a string.');
    }
    options.catalogVersion = body.catalogVersion;
  }

  if (body.maxMissingOutputPricePct != null) {
    const pct = Number(body.maxMissingOutputPricePct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 1) {
      error(400, 'maxMissingOutputPricePct must be between 0 and 1.');
    }
    options.maxMissingOutputPricePct = pct;
  }

  if (body.limit != null) {
    const limit = Number(body.limit);
    if (!Number.isInteger(limit) || limit < 1) {
      error(400, 'limit must be a positive integer.');
    }
    options.limit = limit;
  }

  const result = await scoreTheses(options);
  return json(result);
};
