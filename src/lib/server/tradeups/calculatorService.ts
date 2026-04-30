// Calculator service — sandbox EV evaluation.
//
// Two modes:
//   - Plan mode: outcomes come from the chosen plan. isActive is NOT enforced
//     because the calculator is a place to tweak both plans and inputs.
//   - Ad-hoc mode: outcomes are synthesized from the catalog snapshot —
//     every catalog skin at `targetRarity` in any input's collection. Pricing
//     uses the latest market observation; outcomes without a price contribute
//     0 with a warning.
//
// Per-input catalogSkinId enables correct output exterior projection: each
// input's float is normalized into its own skin range before averaging
// (`enrichSlotsWithInputRanges` + `averageWearProportion`).

import type { Prisma, TradeupPlan } from '@prisma/client';
import type { BasketEVBreakdown } from '$lib/types/services';
import { db } from '$lib/server/db/client';
import { NotFoundError, ValidationError } from '$lib/server/http/errors';
import { resolveCatalogCollectionIdentity } from '$lib/server/catalog/linkage';
import { getCatalogSnapshot } from '$lib/server/catalog/catalogService';
import { withCatalogOutcomeFloatRanges } from './evaluation/catalogOutcomes';
import { enrichSlotsWithInputRanges } from './evaluation/inputFloatRanges';
import { computeBasketEV } from './evaluation/expectedValue';
import {
  averageFloat,
  averageWearProportion,
  exteriorForFloat,
  projectOutputFloat,
} from '$lib/server/utils/float';
import { percentChange, roundMoney, sumMoney } from '$lib/server/utils/money';
import { getLatestMarketPricesForMarketHashNames } from '$lib/server/marketPrices/priceService';
import { refreshSteamMarketWatchlist } from '$lib/server/marketPrices/refreshJob';
import type { CalculatorRequest } from '$lib/schemas/calculator';
import type { CatalogSkin } from '$lib/schemas/catalog';
import type { ItemExterior, ItemRarity } from '$lib/types/enums';

export interface CalculatorResult {
  totalCost: number;
  averageFloat: number | null;
  totalEV: number;
  expectedProfit: number;
  expectedProfitPct: number;
  ev: BasketEVBreakdown;
  /** Source of outcomes for the EV math, surfaced in the UI. */
  mode: 'PLAN' | 'AD_HOC';
  warnings: string[];
}

export async function calculate(request: CalculatorRequest): Promise<CalculatorResult> {
  // 1) Resolve slot context up-front so we know the input rarity and can
  //    compute wear proportion before deciding which outcome hash names to
  //    refresh from Steam.
  const inputRarity = request.planId
    ? await loadPlanInputRarity(request.planId)
    : (request.inputRarity ?? defaultInputRarityFor(requireTargetRarity(request)));

  const slotItems = await Promise.all(
    request.inputs.map(async (input, idx) => {
      const collectionMatch = input.catalogCollectionId
        ? null
        : await resolveCatalogCollectionIdentity(input.collection);
      return {
        id: `calc:${idx}`,
        catalogSkinId: input.catalogSkinId ?? null,
        collection: collectionMatch?.collection ?? input.collection,
        catalogCollectionId:
          input.catalogCollectionId ?? collectionMatch?.catalogCollectionId ?? null,
        exterior: null,
        floatValue: input.floatValue ?? null,
        rarity: inputRarity,
      };
    }),
  );

  const slots = await enrichSlotsWithInputRanges(slotItems);
  const wearProp = averageWearProportion(
    slots.map((slot) => ({
      floatValue: slot.floatValue,
      inputMinFloat: slot.inputMinFloat ?? null,
      inputMaxFloat: slot.inputMaxFloat ?? null,
    })),
  );

  // 2) Build the projected plan, refreshing Steam prices for the *projected*
  //    output exteriors before pricing is read from the DB. This is the only
  //    way ad-hoc gets meaningful EV without a manual price import — it lets
  //    the operator type a tradeup and see fresh observations.
  const projectedPlan = request.planId
    ? await loadPlanForCalculator(request.planId, wearProp)
    : await synthesizeAdHocPlan(request, wearProp);

  const totalCost = roundMoney(sumMoney(request.inputs.map((input) => input.price)));
  const avgFloat = averageFloat(request.inputs.map((input) => input.floatValue ?? null));
  const ev = computeBasketEV(slots, projectedPlan, { averageWearProportion: wearProp });
  const expectedProfit = roundMoney(ev.totalEV - totalCost);
  const expectedProfitPct = percentChange(totalCost, ev.totalEV);

  const warnings: string[] = [];
  if (request.inputs.length < 10) {
    warnings.push(
      `Only ${request.inputs.length} input${request.inputs.length === 1 ? '' : 's'} provided; CS2 trade-ups require exactly 10. EV is scaled by slot count.`,
    );
  }
  if (wearProp == null) {
    const missingSkin = slots.filter((slot) => slot.inputMinFloat == null).length;
    if (missingSkin > 0) {
      warnings.push(
        `${missingSkin} input${missingSkin === 1 ? '' : 's'} missing a catalog-linked skin or float — output exterior projection skipped. Pick skins from the dropdown to enable projection.`,
      );
    }
  }
  const unmatchedCollections = slots.filter((slot) => !slot.catalogCollectionId).length;
  if (unmatchedCollections > 0) {
    warnings.push(
      `${unmatchedCollections} input${unmatchedCollections === 1 ? '' : 's'} did not match a known catalog collection. EV will only group those by exact collection text.`,
    );
  }
  if (projectedPlan.refreshStats.requested > 0) {
    const { requested, written, skipped, errors } = projectedPlan.refreshStats;
    warnings.push(
      `Steam priceoverview: ${requested} name${requested === 1 ? '' : 's'} checked — ${written} fresh, ${skipped} cached/empty${errors > 0 ? `, ${errors} error(s)` : ''}.`,
    );
  }

  return {
    totalCost,
    averageFloat: avgFloat,
    totalEV: ev.totalEV,
    expectedProfit,
    expectedProfitPct,
    ev,
    mode: request.planId ? 'PLAN' : 'AD_HOC',
    warnings,
  };
}

interface ProjectedPlanRefreshStats {
  requested: number;
  written: number;
  skipped: number;
  errors: number;
}

/**
 * Steam priceoverview auto-refresh for the calculator.
 *
 * The Steam adapter rate-limits to one request every ~3 seconds, so we
 * refresh only the *projected* exterior name per outcome — the single name
 * the EV path will actually look up. Names with an observation younger than
 * the watchlist's 30-min skip window are not re-fetched.
 *
 * Failures are non-fatal: any per-name error is reported in the result
 * summary so the UI can surface partial freshness rather than the whole
 * calculation hanging on one bad name.
 */
async function refreshProjectedOutcomePrices(
  outcomeProjections: Array<{ projectedMarketHashName: string | null }>,
): Promise<ProjectedPlanRefreshStats> {
  const names = Array.from(
    new Set(
      outcomeProjections
        .map((p) => p.projectedMarketHashName)
        .filter((name): name is string => Boolean(name)),
    ),
  );
  if (names.length === 0) {
    return { requested: 0, written: 0, skipped: 0, errors: 0 };
  }
  try {
    const result = await refreshSteamMarketWatchlist({ marketHashNames: names });
    const summary = result.summaries[0];
    return {
      requested: summary?.requested ?? 0,
      written: summary?.written ?? 0,
      skipped: summary?.skipped ?? 0,
      errors: summary?.errors.length ?? 0,
    };
  } catch {
    return { requested: names.length, written: 0, skipped: 0, errors: names.length };
  }
}

function projectOutcomeMarketHashName(
  outcome: {
    minFloat: number | null;
    maxFloat: number | null;
    marketHashNames: Array<{ exterior: ItemExterior; marketHashName: string }>;
  },
  wearProportion: number | null,
): string | null {
  if (
    wearProportion == null ||
    outcome.minFloat == null ||
    outcome.maxFloat == null ||
    outcome.marketHashNames.length === 0
  ) {
    return null;
  }
  try {
    const projectedFloat = projectOutputFloat(wearProportion, outcome.minFloat, outcome.maxFloat);
    const projectedExterior = exteriorForFloat(projectedFloat);
    return (
      outcome.marketHashNames.find((entry) => entry.exterior === projectedExterior)
        ?.marketHashName ?? null
    );
  } catch {
    return null;
  }
}

async function loadPlanInputRarity(planId: string): Promise<ItemRarity> {
  const plan = await db.tradeupPlan.findUnique({ where: { id: planId }, select: { inputRarity: true } });
  if (!plan) throw new NotFoundError(`Plan not found: ${planId}`);
  return plan.inputRarity as ItemRarity;
}

function requireTargetRarity(request: CalculatorRequest): ItemRarity {
  if (!request.targetRarity) {
    throw new ValidationError('targetRarity is required when planId is omitted.');
  }
  return request.targetRarity;
}


async function loadPlanForCalculator(planId: string, wearProportion: number | null) {
  const plan = await db.tradeupPlan.findUnique({
    where: { id: planId },
    include: { outcomeItems: true, rules: true },
  });
  if (!plan) {
    throw new NotFoundError(`Plan not found: ${planId}`);
  }
  // First pass: build outcome shapes so we can project per-outcome and gather
  // the names we want to refresh before reading prices.
  const draft = await withCatalogOutcomeFloatRanges(plan);
  const refreshStats = await refreshProjectedOutcomePrices(
    draft.outcomeItems.map((outcome) => ({
      projectedMarketHashName: projectOutcomeMarketHashName(outcome, wearProportion),
    })),
  );
  // Second pass: rebuild so latestMarketPrices reflects any newly-fetched rows.
  const projected = refreshStats.written > 0 ? await withCatalogOutcomeFloatRanges(plan) : draft;
  return { ...projected, refreshStats };
}

// Ad-hoc plan: synthesize a plan-like object whose outcomes come from the
// catalog snapshot. We respect the user's targetRarity, default the input
// rarity to the rarity one tier below the target if not provided, and pull
// pricing from latest market observations. No DB persistence.
const STAT_TRAK_PREFIX = 'StatTrak™ ';

const applyStatTrak = (name: string, isStatTrak: boolean): string =>
  isStatTrak && !name.startsWith(STAT_TRAK_PREFIX) ? `${STAT_TRAK_PREFIX}${name}` : name;

async function synthesizeAdHocPlan(request: CalculatorRequest, wearProportion: number | null) {
  const targetRarity = requireTargetRarity(request);
  const inputRarity = request.inputRarity ?? defaultInputRarityFor(targetRarity);
  const isStatTrak = request.isStatTrak ?? false;

  const snapshot = await getCatalogSnapshot();

  // Resolve each input's catalogCollectionId (if not provided) so we can
  // collect the unique set of collections to derive outcomes from.
  const resolved = await Promise.all(
    request.inputs.map(async (input) => {
      if (input.catalogCollectionId) {
        return input.catalogCollectionId;
      }
      const match = await resolveCatalogCollectionIdentity(input.collection);
      return match?.catalogCollectionId ?? null;
    }),
  );
  const collectionIds = new Set(resolved.filter((id): id is string => Boolean(id)));

  // For each collection, gather catalog skins at the target rarity.
  const matchingSkins: CatalogSkin[] = [];
  for (const skin of snapshot.skins) {
    if (skin.rarity !== targetRarity) continue;
    if (!collectionIds.has(skin.collectionId)) continue;
    matchingSkins.push(skin);
  }

  // Project each candidate skin to the single exterior the EV path will look
  // up, then refresh those names from Steam before reading prices. StatTrak
  // applies as a name prefix only — same skin, same float ranges, different
  // listing — so the projected exterior is identical, only the hash name
  // changes.
  const projectedNamesForRefresh = matchingSkins
    .map((skin) =>
      projectOutcomeMarketHashName(
        {
          minFloat: skin.minFloat,
          maxFloat: skin.maxFloat,
          marketHashNames: skin.marketHashNames.map((entry) => ({
            exterior: entry.exterior,
            marketHashName: applyStatTrak(entry.marketHashName, isStatTrak),
          })),
        },
        wearProportion,
      ),
    )
    .filter((name): name is string => Boolean(name));
  const refreshStats = await refreshProjectedOutcomePrices(
    projectedNamesForRefresh.map((name) => ({ projectedMarketHashName: name })),
  );

  // Now read latest prices from the DB. Names that were just refreshed will
  // be fresh; others fall back to whatever's already cached.
  const allMarketHashNames = Array.from(
    new Set(
      matchingSkins.flatMap((skin) => [
        applyStatTrak(skin.baseMarketHashName, isStatTrak),
        ...skin.marketHashNames.map((entry) => applyStatTrak(entry.marketHashName, isStatTrak)),
      ]),
    ),
  );
  const prices = await getLatestMarketPricesForMarketHashNames(allMarketHashNames);

  const stubPlan: TradeupPlan = {
    id: 'calc:adhoc',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    name: 'Ad-hoc',
    description: null,
    inputRarity,
    targetRarity,
    isActive: false,
    minProfitThreshold: null,
    minProfitPctThreshold: null,
    minLiquidityScore: null,
    minCompositeScore: null,
    notes: null,
  };

  const outcomeItems = matchingSkins.map((skin) => {
    const baseName = applyStatTrak(skin.baseMarketHashName, isStatTrak);
    const projectedEntries = skin.marketHashNames.map((entry) => ({
      exterior: entry.exterior,
      marketHashName: applyStatTrak(entry.marketHashName, isStatTrak),
    }));
    const latestMarketPrices = [baseName, ...projectedEntries.map((entry) => entry.marketHashName)]
      .map((name) => prices.get(name) ?? null)
      .filter((price): price is NonNullable<typeof price> => price != null)
      .map((price) => ({
        marketHashName: price.marketHashName,
        marketValue: price.marketValue,
        source: price.source,
        observedAt: price.observedAt,
        freshness: price.freshness as string,
      }));

    return {
      id: `calc:outcome:${skin.id}`,
      planId: stubPlan.id,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      marketHashName: baseName,
      weaponName: skin.weaponName,
      skinName: skin.skinName,
      collection: skin.collectionName,
      catalogSkinId: skin.id,
      catalogCollectionId: skin.collectionId,
      catalogWeaponDefIndex: skin.defIndex,
      catalogPaintIndex: skin.paintIndex,
      rarity: targetRarity,
      estimatedMarketValue: 0 as unknown as Prisma.Decimal,
      probabilityWeight: 1.0,
      minFloat: skin.minFloat,
      maxFloat: skin.maxFloat,
      marketHashNames: projectedEntries,
      latestMarketPrices,
    };
  });

  return { ...stubPlan, outcomeItems, refreshStats };
}

const RARITY_ORDER: ItemRarity[] = [
  'CONSUMER_GRADE',
  'INDUSTRIAL_GRADE',
  'MIL_SPEC',
  'RESTRICTED',
  'CLASSIFIED',
  'COVERT',
];

function defaultInputRarityFor(targetRarity: ItemRarity): ItemRarity {
  const idx = RARITY_ORDER.indexOf(targetRarity);
  if (idx <= 0) return targetRarity;
  return RARITY_ORDER[idx - 1];
}
