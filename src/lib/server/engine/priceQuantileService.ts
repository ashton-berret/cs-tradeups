import { Prisma } from '@prisma/client';
import { db } from '$lib/server/db/client';
import type { ItemExterior } from '$lib/types/enums';

const WINDOW_DAYS = 14;
const RECENCY_TAU = 5;
const COLD_START_THRESHOLD = 5;
const STAT_TRAK_PREFIX = 'StatTrak™ ';

export interface QuantileFilter {
  catalogSkinIds?: string[];
  exteriors?: ItemExterior[];
  statTrakValues?: boolean[];
}

export interface QuantileSourceFilter {
  exclude?: string[];
}

export interface PriceQuantileSnapshotDTO {
  id: string;
  catalogSkinId: string;
  marketHashName: string;
  exterior: string;
  statTrak: boolean;
  windowDays: number;
  observationCount: number;
  effectiveSampleSize: number;
  p10: number;
  p50: number;
  p90: number;
  mean: number;
  volatility: number;
  recencyTau: number;
  coldStart: boolean;
  sourceFilter: QuantileSourceFilter | null;
  computedAt: Date;
  isLatest: boolean;
}

export interface RecomputeQuantilesResult {
  snapshots: PriceQuantileSnapshotDTO[];
  durationMs: number;
}

interface WeightedObservation {
  price: number;
  weight: number;
}

export async function recomputeQuantiles(
  filter?: QuantileFilter,
  sourceFilter?: QuantileSourceFilter,
): Promise<RecomputeQuantilesResult> {
  const start = performance.now();
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const cells = await discoverCells(filter, cutoff, sourceFilter);
  const snapshots: PriceQuantileSnapshotDTO[] = [];

  for (const cell of cells) {
    const snapshot = await computeAndUpsertCell(cell, cutoff, sourceFilter);
    if (snapshot) {
      snapshots.push(snapshot);
    }
  }

  return { snapshots, durationMs: Math.round(performance.now() - start) };
}

export async function getLatestQuantile(
  catalogSkinId: string,
  exterior: ItemExterior,
  statTrak: boolean,
): Promise<PriceQuantileSnapshotDTO | null> {
  const row = await db.priceQuantileSnapshot.findFirst({
    where: {
      catalogSkinId,
      exterior,
      statTrak,
      windowDays: WINDOW_DAYS,
      isLatest: true,
    },
  });

  return row ? toDTO(row) : null;
}

export async function getLatestQuantiles(
  filter?: QuantileFilter,
): Promise<PriceQuantileSnapshotDTO[]> {
  const where: Prisma.PriceQuantileSnapshotWhereInput = {
    isLatest: true,
    windowDays: WINDOW_DAYS,
  };

  if (filter?.catalogSkinIds?.length) {
    where.catalogSkinId = { in: filter.catalogSkinIds };
  }
  if (filter?.exteriors?.length) {
    where.exterior = { in: filter.exteriors };
  }
  if (filter?.statTrakValues?.length === 1) {
    where.statTrak = filter.statTrakValues[0];
  }

  const rows = await db.priceQuantileSnapshot.findMany({ where });
  return rows.map(toDTO);
}

interface CellKey {
  catalogSkinId: string;
  exterior: string;
  statTrak: boolean;
  marketHashName: string;
}

async function discoverCells(
  filter: QuantileFilter | undefined,
  cutoff: Date,
  sourceFilter?: QuantileSourceFilter,
): Promise<CellKey[]> {
  const where: Prisma.MarketPriceObservationWhereInput = {
    catalogSkinId: { not: null },
    exterior: { not: null },
    observedAt: { gte: cutoff },
  };

  if (filter?.catalogSkinIds?.length) {
    where.catalogSkinId = { in: filter.catalogSkinIds };
  }
  if (filter?.exteriors?.length) {
    where.exterior = { in: filter.exteriors };
  }
  if (sourceFilter?.exclude?.length) {
    where.source = { notIn: sourceFilter.exclude };
  }

  const observations = await db.marketPriceObservation.findMany({
    where,
    select: {
      catalogSkinId: true,
      exterior: true,
      marketHashName: true,
    },
    distinct: ['catalogSkinId', 'exterior', 'marketHashName'],
  });

  const cells: CellKey[] = [];
  const seen = new Set<string>();

  for (const obs of observations) {
    if (!obs.catalogSkinId || !obs.exterior) continue;
    const statTrak = obs.marketHashName.startsWith(STAT_TRAK_PREFIX);
    const key = `${obs.catalogSkinId}|${obs.exterior}|${statTrak}`;

    if (filter?.statTrakValues?.length && !filter.statTrakValues.includes(statTrak)) {
      continue;
    }

    if (!seen.has(key)) {
      seen.add(key);
      cells.push({
        catalogSkinId: obs.catalogSkinId,
        exterior: obs.exterior,
        statTrak,
        marketHashName: obs.marketHashName,
      });
    }
  }

  return cells;
}

async function computeAndUpsertCell(
  cell: CellKey,
  cutoff: Date,
  sourceFilter?: QuantileSourceFilter,
): Promise<PriceQuantileSnapshotDTO | null> {
  const where: Prisma.MarketPriceObservationWhereInput = {
    catalogSkinId: cell.catalogSkinId,
    exterior: cell.exterior,
    observedAt: { gte: cutoff },
  };

  if (cell.statTrak) {
    where.marketHashName = { startsWith: STAT_TRAK_PREFIX };
  } else {
    where.NOT = { marketHashName: { startsWith: STAT_TRAK_PREFIX } };
  }

  if (sourceFilter?.exclude?.length) {
    where.source = { notIn: sourceFilter.exclude };
  }

  const observations = await db.marketPriceObservation.findMany({
    where,
    select: {
      medianSellPrice: true,
      lowestSellPrice: true,
      observedAt: true,
    },
    orderBy: { observedAt: 'desc' },
  });

  const now = new Date();
  const weighted: WeightedObservation[] = [];

  for (const obs of observations) {
    const price = obs.medianSellPrice ?? obs.lowestSellPrice;
    if (price == null) continue;

    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) continue;

    const ageDays = (now.getTime() - obs.observedAt.getTime()) / (24 * 60 * 60 * 1000);
    if (ageDays > WINDOW_DAYS) continue;
    const weight = Math.exp(-ageDays / RECENCY_TAU);
    weighted.push({ price: priceNum, weight });
  }

  if (weighted.length === 0) return null;

  weighted.sort((a, b) => a.price - b.price);

  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  const effectiveSampleSize = totalWeight;
  const coldStart = effectiveSampleSize < COLD_START_THRESHOLD;

  const p10 = weightedQuantile(weighted, totalWeight, 0.10);
  const p50 = weightedQuantile(weighted, totalWeight, 0.50);
  const p90 = weightedQuantile(weighted, totalWeight, 0.90);
  const mean = weighted.reduce((sum, w) => sum + w.price * w.weight, 0) / totalWeight;
  const volatility = p50 > 0 ? (p90 - p10) / p50 : 0;

  await db.priceQuantileSnapshot.updateMany({
    where: {
      catalogSkinId: cell.catalogSkinId,
      exterior: cell.exterior,
      statTrak: cell.statTrak,
      windowDays: WINDOW_DAYS,
      isLatest: true,
    },
    data: { isLatest: false },
  });

  const row = await db.priceQuantileSnapshot.create({
    data: {
      catalogSkinId: cell.catalogSkinId,
      marketHashName: cell.marketHashName,
      exterior: cell.exterior,
      statTrak: cell.statTrak,
      windowDays: WINDOW_DAYS,
      observationCount: weighted.length,
      effectiveSampleSize,
      p10: new Prisma.Decimal(p10.toFixed(4)),
      p50: new Prisma.Decimal(p50.toFixed(4)),
      p90: new Prisma.Decimal(p90.toFixed(4)),
      mean: new Prisma.Decimal(mean.toFixed(4)),
      volatility,
      recencyTau: RECENCY_TAU,
      coldStart,
      sourceFilter: sourceFilter ? (sourceFilter as Prisma.InputJsonValue) : undefined,
      computedAt: now,
      isLatest: true,
    },
  });

  return toDTO(row);
}

export function weightedQuantile(
  sorted: WeightedObservation[],
  totalWeight: number,
  quantile: number,
): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0].price;

  const target = quantile * totalWeight;
  let cumWeight = 0;

  for (let i = 0; i < sorted.length; i++) {
    const prevCum = cumWeight;
    cumWeight += sorted[i].weight;

    if (cumWeight >= target) {
      if (i === 0) return sorted[0].price;

      const fraction = (target - prevCum) / sorted[i].weight;
      return sorted[i - 1].price + fraction * (sorted[i].price - sorted[i - 1].price);
    }
  }

  return sorted[sorted.length - 1].price;
}

function toDTO(row: {
  id: string;
  catalogSkinId: string;
  marketHashName: string;
  exterior: string;
  statTrak: boolean;
  windowDays: number;
  observationCount: number;
  effectiveSampleSize: number;
  p10: Prisma.Decimal | number;
  p50: Prisma.Decimal | number;
  p90: Prisma.Decimal | number;
  mean: Prisma.Decimal | number;
  volatility: number;
  recencyTau: number;
  coldStart: boolean;
  sourceFilter: Prisma.JsonValue | null;
  computedAt: Date;
  isLatest: boolean;
}): PriceQuantileSnapshotDTO {
  return {
    id: row.id,
    catalogSkinId: row.catalogSkinId,
    marketHashName: row.marketHashName,
    exterior: row.exterior,
    statTrak: row.statTrak,
    windowDays: row.windowDays,
    observationCount: row.observationCount,
    effectiveSampleSize: row.effectiveSampleSize,
    p10: Number(row.p10),
    p50: Number(row.p50),
    p90: Number(row.p90),
    mean: Number(row.mean),
    volatility: row.volatility,
    recencyTau: row.recencyTau,
    coldStart: row.coldStart,
    sourceFilter: row.sourceFilter as QuantileSourceFilter | null,
    computedAt: row.computedAt,
    isLatest: row.isLatest,
  };
}
