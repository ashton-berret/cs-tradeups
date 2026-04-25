import type { MarketPriceObservation, Prisma } from '@prisma/client';
import { db } from '$lib/server/db/client';
import { resolveCatalogIdentity } from '$lib/server/catalog/linkage';
import { toDecimalOrNull, toNumber } from '$lib/server/utils/decimal';
import type { MarketPriceLatestListFilter, PaginatedResponse } from '$lib/types/domain';
import type { ItemExterior } from '$lib/types/enums';
import { classifyPriceFreshness, type PriceFreshness } from './freshness';

export interface CreateMarketPriceObservationInput {
  marketHashName: string;
  currency?: string;
  lowestSellPrice?: number | null;
  medianSellPrice?: number | null;
  volume?: number | null;
  source: string;
  observedAt?: Date;
  rawPayload?: unknown;
}

export interface MarketPriceObservationDTO {
  id: string;
  createdAt: Date;
  marketHashName: string;
  catalogSkinId: string | null;
  catalogCollectionId: string | null;
  catalogWeaponDefIndex: number | null;
  catalogPaintIndex: number | null;
  exterior: ItemExterior | null;
  currency: string;
  lowestSellPrice: number | null;
  medianSellPrice: number | null;
  marketValue: number | null;
  volume: number | null;
  source: string;
  observedAt: Date;
  freshness: PriceFreshness;
}

export interface MarketPriceObservationSummaryDTO {
  source: string;
  currency: string;
  count: number;
  newestObservedAt: Date;
  oldestObservedAt: Date;
  freshness: Record<PriceFreshness, number>;
}

export async function importMarketPriceObservations(input: {
  source: string;
  observations: Array<Omit<CreateMarketPriceObservationInput, 'source'>>;
}): Promise<{ count: number; observations: MarketPriceObservationDTO[] }> {
  const observations: MarketPriceObservationDTO[] = [];

  for (const observation of input.observations) {
    observations.push(
      await createMarketPriceObservation({
        ...observation,
        source: input.source,
      }),
    );
  }

  return {
    count: observations.length,
    observations,
  };
}

export async function createMarketPriceObservation(
  input: CreateMarketPriceObservationInput,
): Promise<MarketPriceObservationDTO> {
  const marketHashName = input.marketHashName.trim();

  if (!marketHashName) {
    throw new Error('marketHashName is required');
  }

  const catalogIdentity = await resolveCatalogIdentity({ marketHashName });
  const row = await db.marketPriceObservation.create({
    data: {
      marketHashName,
      catalogSkinId: catalogIdentity?.catalogSkinId,
      catalogCollectionId: catalogIdentity?.catalogCollectionId,
      catalogWeaponDefIndex: catalogIdentity?.catalogWeaponDefIndex,
      catalogPaintIndex: catalogIdentity?.catalogPaintIndex,
      exterior: catalogIdentity?.exterior,
      currency: normalizeCurrency(input.currency),
      lowestSellPrice: toDecimalOrNull(input.lowestSellPrice),
      medianSellPrice: toDecimalOrNull(input.medianSellPrice),
      volume: input.volume ?? null,
      source: input.source,
      observedAt: input.observedAt ?? new Date(),
      rawPayload: input.rawPayload as Prisma.InputJsonValue | undefined,
    },
  });

  return toMarketPriceObservationDTO(row);
}

export async function getLatestMarketPriceForMarketHashName(
  marketHashName: string,
  currency = 'USD',
): Promise<MarketPriceObservationDTO | null> {
  const row = await db.marketPriceObservation.findFirst({
    where: {
      marketHashName,
      currency: normalizeCurrency(currency),
    },
    orderBy: [{ observedAt: 'desc' }, { createdAt: 'desc' }],
  });

  return row ? toMarketPriceObservationDTO(row) : null;
}

export async function getLatestMarketPriceForCatalogExterior(args: {
  catalogSkinId: string;
  exterior: ItemExterior;
  currency?: string;
}): Promise<MarketPriceObservationDTO | null> {
  const row = await db.marketPriceObservation.findFirst({
    where: {
      catalogSkinId: args.catalogSkinId,
      exterior: args.exterior,
      currency: normalizeCurrency(args.currency),
    },
    orderBy: [{ observedAt: 'desc' }, { createdAt: 'desc' }],
  });

  return row ? toMarketPriceObservationDTO(row) : null;
}

export async function getLatestMarketPricesForMarketHashNames(
  marketHashNames: string[],
  currency = 'USD',
): Promise<Map<string, MarketPriceObservationDTO>> {
  const uniqueNames = Array.from(new Set(marketHashNames.filter(Boolean)));

  if (uniqueNames.length === 0) {
    return new Map();
  }

  const rows = await db.marketPriceObservation.findMany({
    where: {
      marketHashName: { in: uniqueNames },
      currency: normalizeCurrency(currency),
    },
    orderBy: [{ observedAt: 'desc' }, { createdAt: 'desc' }],
  });
  const latest = new Map<string, MarketPriceObservationDTO>();

  for (const row of rows) {
    if (!latest.has(row.marketHashName)) {
      latest.set(row.marketHashName, toMarketPriceObservationDTO(row));
    }
  }

  return latest;
}

export async function listLatestMarketPriceObservations(
  filter: MarketPriceLatestListFilter,
): Promise<PaginatedResponse<MarketPriceObservationDTO>> {
  const where = marketPriceWhere(filter);
  const skip = (filter.page - 1) * filter.limit;

  if (filter.latestOnly || filter.sortBy === 'marketValue') {
    const rows = await db.marketPriceObservation.findMany({
      where,
      orderBy: [{ observedAt: 'desc' }, { createdAt: 'desc' }],
    });
    const sortedRows = applyLatestAndDerivedSort(rows.map(toMarketPriceObservationDTO), filter);
    const data = sortedRows.slice(skip, skip + filter.limit);

    return {
      data,
      total: sortedRows.length,
      page: filter.page,
      limit: filter.limit,
      totalPages: Math.ceil(sortedRows.length / filter.limit),
    };
  }

  const orderBy = marketPriceOrderBy(filter);
  const [rows, total] = await Promise.all([
    db.marketPriceObservation.findMany({
      where,
      orderBy,
      skip,
      take: filter.limit,
    }),
    db.marketPriceObservation.count({ where }),
  ]);

  return {
    data: rows.map(toMarketPriceObservationDTO),
    total,
    page: filter.page,
    limit: filter.limit,
    totalPages: Math.ceil(total / filter.limit),
  };
}

export async function summarizeLatestMarketPriceObservations(
  filter: Pick<MarketPriceLatestListFilter, 'search' | 'source' | 'currency' | 'latestOnly'>,
): Promise<MarketPriceObservationSummaryDTO[]> {
  const rows = await db.marketPriceObservation.findMany({
    where: marketPriceWhere(filter),
    orderBy: [{ observedAt: 'desc' }, { createdAt: 'desc' }],
  });
  const summaryRows = filter.latestOnly
    ? latestMarketPriceRows(rows.map(toMarketPriceObservationDTO))
    : rows.map(toMarketPriceObservationDTO);
  const groups = new Map<string, MarketPriceObservationSummaryDTO>();

  for (const row of summaryRows) {
    const freshness = row.freshness;
    const key = `${row.source}\u0000${row.currency}`;
    const existing =
      groups.get(key) ??
      {
        source: row.source,
        currency: row.currency,
        count: 0,
        newestObservedAt: row.observedAt,
        oldestObservedAt: row.observedAt,
        freshness: { FRESH: 0, RECENT: 0, STALE: 0, OLD: 0 },
      };

    if (row.observedAt > existing.newestObservedAt) existing.newestObservedAt = row.observedAt;
    if (row.observedAt < existing.oldestObservedAt) existing.oldestObservedAt = row.observedAt;
    existing.count += 1;
    existing.freshness[freshness] += 1;
    groups.set(key, existing);
  }

  return [...groups.values()].sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}

export function toMarketPriceObservationDTO(row: MarketPriceObservation): MarketPriceObservationDTO {
  const lowestSellPrice = toNumber(row.lowestSellPrice);
  const medianSellPrice = toNumber(row.medianSellPrice);

  return {
    id: row.id,
    createdAt: row.createdAt,
    marketHashName: row.marketHashName,
    catalogSkinId: row.catalogSkinId,
    catalogCollectionId: row.catalogCollectionId,
    catalogWeaponDefIndex: row.catalogWeaponDefIndex,
    catalogPaintIndex: row.catalogPaintIndex,
    exterior: row.exterior as ItemExterior | null,
    currency: row.currency,
    lowestSellPrice,
    medianSellPrice,
    marketValue: lowestSellPrice ?? medianSellPrice,
    volume: row.volume,
    source: row.source,
    observedAt: row.observedAt,
    freshness: classifyPriceFreshness(row.observedAt),
  };
}

function normalizeCurrency(value: string | null | undefined): string {
  return (value ?? 'USD').trim().toUpperCase() || 'USD';
}

function marketPriceWhere(
  filter: Pick<MarketPriceLatestListFilter, 'search' | 'source' | 'currency'>,
): Prisma.MarketPriceObservationWhereInput {
  return {
    ...(filter.source ? { source: filter.source } : {}),
    ...(filter.currency ? { currency: normalizeCurrency(filter.currency) } : {}),
    ...(filter.search
      ? {
          OR: [
            { marketHashName: { contains: filter.search } },
            { catalogSkinId: { contains: filter.search } },
            { catalogCollectionId: { contains: filter.search } },
          ],
        }
      : {}),
  };
}

function marketPriceOrderBy(
  filter: MarketPriceLatestListFilter,
): Prisma.MarketPriceObservationOrderByWithRelationInput[] {
  const direction = filter.sortDir;

  return [{ [filter.sortBy]: direction }, { observedAt: 'desc' }, { createdAt: 'desc' }];
}

function compareMarketPriceRows(sortDir: MarketPriceLatestListFilter['sortDir']) {
  const direction = sortDir === 'asc' ? 1 : -1;

  return (a: MarketPriceObservationDTO, b: MarketPriceObservationDTO) => {
    const aValue = a.marketValue;
    const bValue = b.marketValue;

    if (aValue == null && bValue == null) {
      return b.observedAt.getTime() - a.observedAt.getTime();
    }

    if (aValue == null) return 1;
    if (bValue == null) return -1;
    if (aValue < bValue) return -1 * direction;
    if (aValue > bValue) return 1 * direction;
    return b.observedAt.getTime() - a.observedAt.getTime();
  };
}

function applyLatestAndDerivedSort(
  rows: MarketPriceObservationDTO[],
  filter: MarketPriceLatestListFilter,
): MarketPriceObservationDTO[] {
  const visibleRows = filter.latestOnly ? latestMarketPriceRows(rows) : rows;

  if (filter.sortBy === 'marketValue') {
    return visibleRows.sort(compareMarketPriceRows(filter.sortDir));
  }

  return visibleRows.sort(compareMarketPriceField(filter.sortBy, filter.sortDir));
}

function latestMarketPriceRows(rows: MarketPriceObservationDTO[]): MarketPriceObservationDTO[] {
  const latest = new Map<string, MarketPriceObservationDTO>();

  for (const row of rows) {
    const key = `${row.marketHashName}\u0000${row.currency}`;
    if (!latest.has(key)) {
      latest.set(key, row);
    }
  }

  return [...latest.values()];
}

function compareMarketPriceField(
  sortBy: Exclude<MarketPriceLatestListFilter['sortBy'], 'marketValue'>,
  sortDir: MarketPriceLatestListFilter['sortDir'],
) {
  const direction = sortDir === 'asc' ? 1 : -1;

  return (a: MarketPriceObservationDTO, b: MarketPriceObservationDTO) => {
    const aValue = a[sortBy];
    const bValue = b[sortBy];
    const comparison =
      aValue instanceof Date && bValue instanceof Date
        ? aValue.getTime() - bValue.getTime()
        : String(aValue).localeCompare(String(bValue));

    if (comparison !== 0) return comparison * direction;
    return b.observedAt.getTime() - a.observedAt.getTime();
  };
}
