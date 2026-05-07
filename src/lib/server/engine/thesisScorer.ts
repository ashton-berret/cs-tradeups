import { Prisma } from '@prisma/client';
import { db } from '$lib/server/db/client';
import { getCatalogSnapshot } from '$lib/server/catalog/catalogService';
import { getLatestQuantiles, type PriceQuantileSnapshotDTO } from './priceQuantileService';
import { steamGrossToNetSaleValue } from '$lib/server/marketPrices/fees';
import { roundMoney, sumMoney } from '$lib/server/utils/money';
import type { ItemExterior, ItemRarity } from '$lib/types/enums';
import type { CatalogSkin, CatalogSnapshot } from '$lib/schemas/catalog';
import {
  type TradeupComboOutputDistributionEntry,
  type TradeupComboOutputProjectionEntry,
  getCatalogVersion,
} from './comboEnumerator';

export const SCORE_VERSION = 'v1.0';
const BATCH_SIZE = 200;

export interface ScoreThesesOptions {
  inputRarities?: ItemRarity[];
  statTrakValues?: boolean[];
  collectionIds?: string[];
  catalogVersion?: string;
  maxMissingOutputPricePct?: number;
  limit?: number;
  onProgress?: (progress: ScoreProgress) => void;
}

export interface ScoreProgress {
  processed: number;
  scored: number;
  skipped: number;
  elapsedMs: number;
}

export interface ScoreThesesResult {
  scored: number;
  skipped: number;
  processed: number;
  durationMs: number;
}

export interface ThesisDTO {
  id: string;
  createdAt: string;
  comboId: string;
  baseId: string;
  inputRarity: ItemRarity;
  statTrak: boolean;
  partition: Record<string, number>;
  collections: string[];
  collectionNames: string[];
  wearRegimeIndex: number;
  targetAvgWearProp: number;
  inputCostP50: number;
  outputValueGrossP50: number;
  outputValueNetP50: number;
  evMedian: number;
  profitChance: number;
  score: number;
  missingOutputPrices: number;
  missingInputPrices: number;
  totalOutputSkins: number;
  inputResolution: InputResolutionEntry[];
  outputResolution: OutputResolutionEntry[];
  scoreVersion: string;
  catalogVersion: string;
  status: string;
}

export interface InputResolutionEntry {
  collectionId: string;
  collectionName: string;
  slotCount: number;
  catalogSkinId: string | null;
  skinName: string | null;
  exterior: ItemExterior | null;
  priceP50: number | null;
  missing: boolean;
}

export interface OutputResolutionEntry {
  catalogSkinId: string;
  skinName: string;
  collectionName: string;
  exterior: ItemExterior;
  probability: number;
  grossPrice: number | null;
  netPrice: number | null;
  missing: boolean;
}

export interface ThesisListFilter {
  inputRarity?: ItemRarity;
  statTrak?: boolean;
  collectionId?: string;
  status?: string;
  minEv?: number;
  minProfitChance?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface ThesisPage {
  data: ThesisDTO[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface ComboForScoring {
  id: string;
  baseId: string;
  wearRegimeIndex: number;
  targetAvgWearProp: number;
  catalogVersion: string;
  outputProjection: TradeupComboOutputProjectionEntry[];
  base: {
    inputRarity: string;
    statTrak: boolean;
    partition: Record<string, number>;
    collections: string[];
    outputDistribution: TradeupComboOutputDistributionEntry[];
  };
}

export async function scoreTheses(options: ScoreThesesOptions = {}): Promise<ScoreThesesResult> {
  const startedAt = performance.now();
  const snapshot = await getCatalogSnapshot();
  const resolvedCatalogVersion = options.catalogVersion ?? getCatalogVersion(snapshot);
  const maxMissingPct = options.maxMissingOutputPricePct ?? 0.5;

  const allQuantiles = await getLatestQuantiles();
  const quantileIndex = buildQuantileIndex(allQuantiles);

  const skinsById = new Map(snapshot.skins.map((s) => [s.id, s]));
  const collectionNames = new Map(snapshot.collections.map((c) => [c.id, c.name]));

  const combos = await loadCombosForScoring(resolvedCatalogVersion, options);

  let scored = 0;
  let skipped = 0;
  let processed = 0;

  const thesesToWrite: ThesisCreateInput[] = [];

  for (const combo of combos) {
    processed += 1;

    const result = scoreCombo(combo, {
      quantileIndex,
      skinsById,
      collectionNames,
      snapshot,
      maxMissingPct,
    });

    if (result === null) {
      skipped += 1;
    } else {
      scored += 1;
      thesesToWrite.push(result);
    }

    if (thesesToWrite.length >= BATCH_SIZE) {
      await flushTheses(thesesToWrite.splice(0, BATCH_SIZE));
    }

    if (processed % 500 === 0) {
      options.onProgress?.({
        processed,
        scored,
        skipped,
        elapsedMs: Math.round(performance.now() - startedAt),
      });
    }
  }

  if (thesesToWrite.length > 0) {
    await flushTheses(thesesToWrite);
  }

  return {
    scored,
    skipped,
    processed,
    durationMs: Math.round(performance.now() - startedAt),
  };
}

export async function listTheses(filter: ThesisListFilter = {}): Promise<ThesisPage> {
  const snapshot = await getCatalogSnapshot();
  const collectionNames = new Map(snapshot.collections.map((c) => [c.id, c.name]));

  const page = Math.max(1, Math.trunc(filter.page ?? 1));
  const limit = Math.min(100, Math.max(1, Math.trunc(filter.limit ?? 25)));
  const skip = (page - 1) * limit;

  const where: Prisma.TradeupThesisWhereInput = {};
  if (filter.inputRarity) where.inputRarity = filter.inputRarity;
  if (filter.statTrak != null) where.statTrak = filter.statTrak;
  if (filter.status) where.status = filter.status;
  if (filter.minEv != null) where.evMedian = { gte: new Prisma.Decimal(filter.minEv) };
  if (filter.minProfitChance != null) where.profitChance = { gte: filter.minProfitChance };

  if (filter.collectionId) {
    (where as Record<string, unknown>).collections = { string_contains: filter.collectionId };
  }

  const sortBy = filter.sortBy ?? 'score';
  const sortDir = filter.sortDir ?? 'desc';
  const orderBy: Prisma.TradeupThesisOrderByWithRelationInput =
    sortBy === 'evMedian' ? { evMedian: sortDir }
    : sortBy === 'profitChance' ? { profitChance: sortDir }
    : sortBy === 'inputCostP50' ? { inputCostP50: sortDir }
    : sortBy === 'outputValueNetP50' ? { outputValueNetP50: sortDir }
    : sortBy === 'createdAt' ? { createdAt: sortDir }
    : { score: sortDir };

  const [total, rows] = await Promise.all([
    db.tradeupThesis.count({ where }),
    db.tradeupThesis.findMany({ where, orderBy, skip, take: limit }),
  ]);

  const data = rows.map((row) => mapThesisToDTO(row, collectionNames));

  return { data, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

interface ThesisCreateInput {
  comboId: string;
  baseId: string;
  inputRarity: string;
  statTrak: boolean;
  partition: Record<string, number>;
  collections: string[];
  wearRegimeIndex: number;
  targetAvgWearProp: number;
  inputCostP50: number;
  outputValueGrossP50: number;
  outputValueNetP50: number;
  evMedian: number;
  profitChance: number;
  score: number;
  missingOutputPrices: number;
  missingInputPrices: number;
  totalOutputSkins: number;
  inputResolution: InputResolutionEntry[];
  outputResolution: OutputResolutionEntry[];
  catalogVersion: string;
}

function scoreCombo(
  combo: ComboForScoring,
  ctx: {
    quantileIndex: QuantileIndex;
    skinsById: Map<string, CatalogSkin>;
    collectionNames: Map<string, string>;
    snapshot: CatalogSnapshot;
    maxMissingPct: number;
  },
): ThesisCreateInput | null {
  const { base } = combo;
  const partition = base.partition;
  const inputRarity = base.inputRarity as ItemRarity;
  const statTrak = base.statTrak;

  const outputResolution = resolveOutputPrices(combo, ctx);
  const missingOutputPrices = outputResolution.filter((o) => o.missing).length;
  const totalOutputSkins = outputResolution.length;

  if (totalOutputSkins === 0) return null;
  if (missingOutputPrices / totalOutputSkins > ctx.maxMissingPct) return null;

  const inputResolution = resolveInputCosts(partition, inputRarity, statTrak, ctx);
  const missingInputPrices = inputResolution.filter((i) => i.missing).length;

  if (inputResolution.every((i) => i.missing)) return null;

  const inputCostP50 = sumMoney(
    inputResolution.map((i) => (i.priceP50 ?? 0) * i.slotCount),
  );

  let outputValueGrossP50 = 0;
  let outputValueNetP50 = 0;
  for (const output of outputResolution) {
    if (output.grossPrice != null) {
      outputValueGrossP50 += output.grossPrice * output.probability;
    }
    if (output.netPrice != null) {
      outputValueNetP50 += output.netPrice * output.probability;
    }
  }
  outputValueGrossP50 = roundMoney(outputValueGrossP50);
  outputValueNetP50 = roundMoney(outputValueNetP50);

  const evMedian = roundMoney(outputValueNetP50 - inputCostP50);

  let profitChance = 0;
  for (const output of outputResolution) {
    if (output.netPrice != null && output.netPrice > inputCostP50) {
      profitChance += output.probability;
    }
  }
  profitChance = Math.min(1, Math.max(0, profitChance));

  const score = evMedian;

  return {
    comboId: combo.id,
    baseId: combo.baseId,
    inputRarity,
    statTrak,
    partition,
    collections: base.collections,
    wearRegimeIndex: combo.wearRegimeIndex,
    targetAvgWearProp: combo.targetAvgWearProp,
    inputCostP50,
    outputValueGrossP50,
    outputValueNetP50,
    evMedian,
    profitChance,
    score,
    missingOutputPrices,
    missingInputPrices,
    totalOutputSkins,
    inputResolution,
    outputResolution,
    catalogVersion: combo.catalogVersion,
  };
}

function resolveOutputPrices(
  combo: ComboForScoring,
  ctx: {
    quantileIndex: QuantileIndex;
    skinsById: Map<string, CatalogSkin>;
    collectionNames: Map<string, string>;
  },
): OutputResolutionEntry[] {
  const distribution = combo.base.outputDistribution;
  const projection = combo.outputProjection;
  const probBySkin = new Map(distribution.map((d) => [d.s, d.p]));

  return projection.map((proj) => {
    const skin = ctx.skinsById.get(proj.s);
    const probability = probBySkin.get(proj.s) ?? 0;
    const quantile = ctx.quantileIndex.get(quantileKey(proj.s, proj.e, combo.base.statTrak));
    const grossPrice = quantile?.p50 ?? null;
    const netPrice = grossPrice != null ? steamGrossToNetSaleValue(grossPrice) : null;

    return {
      catalogSkinId: proj.s,
      skinName: skin ? `${skin.weaponName} | ${skin.skinName}` : proj.s,
      collectionName: skin ? ctx.collectionNames.get(skin.collectionId) ?? skin.collectionId : '',
      exterior: proj.e,
      probability,
      grossPrice,
      netPrice,
      missing: grossPrice == null,
    };
  });
}

function resolveInputCosts(
  partition: Record<string, number>,
  inputRarity: ItemRarity,
  statTrak: boolean,
  ctx: {
    quantileIndex: QuantileIndex;
    skinsById: Map<string, CatalogSkin>;
    collectionNames: Map<string, string>;
    snapshot: CatalogSnapshot;
  },
): InputResolutionEntry[] {
  const entries: InputResolutionEntry[] = [];

  for (const [collectionId, slotCount] of Object.entries(partition)) {
    const inputSkins = ctx.snapshot.skins.filter(
      (s) => s.collectionId === collectionId && s.rarity === inputRarity,
    );

    let cheapestSkinId: string | null = null;
    let cheapestSkinName: string | null = null;
    let cheapestExterior: ItemExterior | null = null;
    let cheapestPrice: number | null = null;

    for (const skin of inputSkins) {
      for (const ext of skin.exteriors) {
        const q = ctx.quantileIndex.get(quantileKey(skin.id, ext, statTrak));
        if (q && (cheapestPrice == null || q.p50 < cheapestPrice)) {
          cheapestPrice = q.p50;
          cheapestSkinId = skin.id;
          cheapestSkinName = `${skin.weaponName} | ${skin.skinName}`;
          cheapestExterior = ext as ItemExterior;
        }
      }
    }

    entries.push({
      collectionId,
      collectionName: ctx.collectionNames.get(collectionId) ?? collectionId,
      slotCount,
      catalogSkinId: cheapestSkinId,
      skinName: cheapestSkinName,
      exterior: cheapestExterior,
      priceP50: cheapestPrice,
      missing: cheapestPrice == null,
    });
  }

  return entries;
}

type QuantileIndex = Map<string, PriceQuantileSnapshotDTO>;

function buildQuantileIndex(quantiles: PriceQuantileSnapshotDTO[]): QuantileIndex {
  const index = new Map<string, PriceQuantileSnapshotDTO>();
  for (const q of quantiles) {
    index.set(quantileKey(q.catalogSkinId, q.exterior, q.statTrak), q);
  }
  return index;
}

function quantileKey(catalogSkinId: string, exterior: string, statTrak: boolean): string {
  return `${catalogSkinId}|${exterior}|${statTrak}`;
}

async function loadCombosForScoring(
  catalogVersion: string,
  options: ScoreThesesOptions,
): Promise<ComboForScoring[]> {
  const where: Prisma.TradeupComboWhereInput = {
    catalogVersion,
    base: {
      ...(options.inputRarities?.length ? { inputRarity: { in: options.inputRarities } } : {}),
      ...(options.statTrakValues?.length === 1 ? { statTrak: options.statTrakValues[0] } : {}),
    },
  };

  if (options.collectionIds?.length) {
    (where as Record<string, unknown>).base = {
      ...where.base,
      OR: options.collectionIds.map((id) => ({
        collections: { string_contains: id },
      })),
    };
  }

  const rows = await db.tradeupCombo.findMany({
    where,
    include: { base: true },
    ...(options.limit ? { take: options.limit } : {}),
  });

  return rows.map((row) => ({
    id: row.id,
    baseId: row.baseId,
    wearRegimeIndex: row.wearRegimeIndex,
    targetAvgWearProp: row.targetAvgWearProp,
    catalogVersion: row.catalogVersion,
    outputProjection: parseJsonArray<TradeupComboOutputProjectionEntry>(row.outputProjection),
    base: {
      inputRarity: row.base.inputRarity,
      statTrak: row.base.statTrak,
      partition: parseJsonRecord(row.base.partition),
      collections: parseJsonStringArray(row.base.collections),
      outputDistribution: parseJsonArray<TradeupComboOutputDistributionEntry>(row.base.outputDistribution),
    },
  }));
}

async function flushTheses(theses: ThesisCreateInput[]): Promise<void> {
  for (const thesis of theses) {
    await db.tradeupThesis.upsert({
      where: {
        comboId_scoreVersion: {
          comboId: thesis.comboId,
          scoreVersion: SCORE_VERSION,
        },
      },
      update: {
        baseId: thesis.baseId,
        inputRarity: thesis.inputRarity,
        statTrak: thesis.statTrak,
        partition: thesis.partition as unknown as Prisma.InputJsonValue,
        collections: thesis.collections as unknown as Prisma.InputJsonValue,
        wearRegimeIndex: thesis.wearRegimeIndex,
        targetAvgWearProp: thesis.targetAvgWearProp,
        inputCostP50: new Prisma.Decimal(thesis.inputCostP50.toFixed(2)),
        outputValueGrossP50: new Prisma.Decimal(thesis.outputValueGrossP50.toFixed(2)),
        outputValueNetP50: new Prisma.Decimal(thesis.outputValueNetP50.toFixed(2)),
        evMedian: new Prisma.Decimal(thesis.evMedian.toFixed(2)),
        profitChance: thesis.profitChance,
        score: thesis.score,
        missingOutputPrices: thesis.missingOutputPrices,
        missingInputPrices: thesis.missingInputPrices,
        totalOutputSkins: thesis.totalOutputSkins,
        inputResolution: thesis.inputResolution as unknown as Prisma.InputJsonValue,
        outputResolution: thesis.outputResolution as unknown as Prisma.InputJsonValue,
        scoreVersion: SCORE_VERSION,
        catalogVersion: thesis.catalogVersion,
        status: 'ACTIVE',
      },
      create: {
        comboId: thesis.comboId,
        baseId: thesis.baseId,
        inputRarity: thesis.inputRarity,
        statTrak: thesis.statTrak,
        partition: thesis.partition as unknown as Prisma.InputJsonValue,
        collections: thesis.collections as unknown as Prisma.InputJsonValue,
        wearRegimeIndex: thesis.wearRegimeIndex,
        targetAvgWearProp: thesis.targetAvgWearProp,
        inputCostP50: new Prisma.Decimal(thesis.inputCostP50.toFixed(2)),
        outputValueGrossP50: new Prisma.Decimal(thesis.outputValueGrossP50.toFixed(2)),
        outputValueNetP50: new Prisma.Decimal(thesis.outputValueNetP50.toFixed(2)),
        evMedian: new Prisma.Decimal(thesis.evMedian.toFixed(2)),
        profitChance: thesis.profitChance,
        score: thesis.score,
        missingOutputPrices: thesis.missingOutputPrices,
        missingInputPrices: thesis.missingInputPrices,
        totalOutputSkins: thesis.totalOutputSkins,
        totalInputSlots: 10,
        inputResolution: thesis.inputResolution as unknown as Prisma.InputJsonValue,
        outputResolution: thesis.outputResolution as unknown as Prisma.InputJsonValue,
        scoreVersion: SCORE_VERSION,
        catalogVersion: thesis.catalogVersion,
        status: 'ACTIVE',
      },
    });
  }
}

function mapThesisToDTO(
  row: Prisma.TradeupThesisGetPayload<object>,
  collectionNames: Map<string, string>,
): ThesisDTO {
  const collections = parseJsonStringArray(row.collections);
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    comboId: row.comboId,
    baseId: row.baseId,
    inputRarity: row.inputRarity as ItemRarity,
    statTrak: row.statTrak,
    partition: parseJsonRecord(row.partition),
    collections,
    collectionNames: collections.map((id) => collectionNames.get(id) ?? id),
    wearRegimeIndex: row.wearRegimeIndex,
    targetAvgWearProp: row.targetAvgWearProp,
    inputCostP50: Number(row.inputCostP50),
    outputValueGrossP50: Number(row.outputValueGrossP50),
    outputValueNetP50: Number(row.outputValueNetP50),
    evMedian: Number(row.evMedian),
    profitChance: row.profitChance,
    score: row.score,
    missingOutputPrices: row.missingOutputPrices,
    missingInputPrices: row.missingInputPrices,
    totalOutputSkins: row.totalOutputSkins,
    inputResolution: parseJsonArray<InputResolutionEntry>(row.inputResolution),
    outputResolution: parseJsonArray<OutputResolutionEntry>(row.outputResolution),
    scoreVersion: row.scoreVersion,
    catalogVersion: row.catalogVersion,
    status: row.status,
  };
}

function parseJsonArray<T>(value: Prisma.JsonValue): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T[]; } catch { return []; }
  }
  return [];
}

function parseJsonRecord(value: Prisma.JsonValue): Record<string, number> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value).filter((e): e is [string, number] => typeof e[1] === 'number'),
    );
  }
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return {};
}

function parseJsonStringArray(value: Prisma.JsonValue): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((v: unknown): v is string => typeof v === 'string') : [];
    } catch { return []; }
  }
  return [];
}
