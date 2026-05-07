import { Prisma } from '@prisma/client';
import { db } from '$lib/server/db/client';
import { getCatalogSnapshot } from '$lib/server/catalog/catalogService';
import type { CatalogSkin } from '$lib/schemas/catalog';
import type { ItemExterior } from '$lib/types/enums';

const STAT_TRAK_PREFIX = 'StatTrak™ ';

export interface MarketPriceWatchlist {
  marketHashNames: string[];
  counts: {
    activePlanOutcomes: number;
    combinationSnapshotOutcomes: number;
    openCandidates: number;
    inventoryItems: number;
    executionResults: number;
    engineComboOutputs: number;
  };
}

export interface MarketPriceWatchlistOptions {
  engineOnly?: boolean;
  engineCollectionIds?: string[];
}

export interface EngineComboCollectionOption {
  id: string;
  name: string;
}

export async function buildMarketPriceWatchlist(
  options: MarketPriceWatchlistOptions = {},
): Promise<MarketPriceWatchlist> {
  const [plans, combinations, candidates, inventoryItems, executions] = options.engineOnly
    ? [[], [], [], [], []] as const
    : await Promise.all([
        db.tradeupPlan.findMany({
          where: { isActive: true },
          select: { outcomeItems: { select: { marketHashName: true } } },
        }),
        db.tradeupCombination.findMany({
          where: { isActive: true },
          select: { thesisPlanSnapshot: true },
        }),
        db.candidateListing.findMany({
          where: { status: { in: ['WATCHING', 'GOOD_BUY'] } },
          select: { marketHashName: true },
        }),
        db.inventoryItem.findMany({
          where: { status: { in: ['HELD', 'RESERVED_FOR_BASKET'] } },
          select: { marketHashName: true },
        }),
        db.tradeupExecution.findMany({
          where: { resultMarketHashName: { not: null } },
          orderBy: { executedAt: 'desc' },
          take: 100,
          select: { resultMarketHashName: true },
        }),
      ]);

  const activePlanOutcomes = plans.flatMap((plan) =>
    plan.outcomeItems.map((outcome) => outcome.marketHashName),
  );
  const combinationSnapshotOutcomes = combinations.flatMap((combination) =>
    marketHashNamesFromPlanSnapshot(combination.thesisPlanSnapshot),
  );
  const openCandidates = candidates.map((candidate) => candidate.marketHashName);
  const inventoryNames = inventoryItems.map((item) => item.marketHashName);
  const executionResults = executions
    .map((execution) => execution.resultMarketHashName)
    .filter((name): name is string => Boolean(name));

  const engineComboOutputs = await buildEngineComboWatchlist({
    collectionIds: options.engineCollectionIds,
  });

  return {
    marketHashNames: uniqueMarketHashNames([
      ...activePlanOutcomes,
      ...combinationSnapshotOutcomes,
      ...openCandidates,
      ...inventoryNames,
      ...executionResults,
      ...engineComboOutputs,
    ]),
    counts: {
      activePlanOutcomes: activePlanOutcomes.length,
      combinationSnapshotOutcomes: combinationSnapshotOutcomes.length,
      openCandidates: openCandidates.length,
      inventoryItems: inventoryNames.length,
      executionResults: executionResults.length,
      engineComboOutputs: engineComboOutputs.length,
    },
  };
}

export function marketHashNamesFromPlanSnapshot(snapshot: unknown): string[] {
  if (!snapshot || typeof snapshot !== 'object') return [];
  const outcomes = (snapshot as { outcomes?: unknown }).outcomes;
  if (!Array.isArray(outcomes)) return [];

  return outcomes
    .map((outcome) =>
      outcome && typeof outcome === 'object'
        ? (outcome as { marketHashName?: unknown }).marketHashName
        : null,
    )
    .filter((name): name is string => typeof name === 'string' && name.trim() !== '');
}

export function uniqueMarketHashNames(names: string[]): string[] {
  return Array.from(new Set(names.map((name) => name.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
}

export async function listEngineComboCollectionOptions(): Promise<EngineComboCollectionOption[]> {
  const [snapshot, collectionIds] = await Promise.all([
    getCatalogSnapshot(),
    listEngineCollectionIds(),
  ]);
  const collectionIdSet = new Set(collectionIds);

  return snapshot.collections
    .filter((collection) => collectionIdSet.has(collection.id))
    .map((collection) => ({ id: collection.id, name: collection.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface EngineComboWatchlistOptions {
  collectionIds?: string[];
}

export async function buildEngineComboWatchlist(
  options: EngineComboWatchlistOptions = {},
): Promise<string[]> {
  const [snapshot, outputRefs] = await Promise.all([
    getCatalogSnapshot(),
    listEngineComboOutputRefs(options),
  ]);
  const skinsById = new Map(snapshot.skins.map((skin) => [skin.id, skin]));

  return uniqueMarketHashNames(
    outputRefs
      .flatMap((ref) => {
        const skin = skinsById.get(ref.catalogSkinId);
        return skin ? marketHashNamesForComboOutputSkin(skin, ref.statTrak) : [];
      })
  );
}

export function marketHashNamesForComboOutputSkin(skin: CatalogSkin, statTrak: boolean): string[] {
  return skin.marketHashNames.map((entry) =>
    statTrak ? applyStatTrak(entry.marketHashName) : entry.marketHashName,
  );
}

export function marketHashNameForComboOutput(
  skin: CatalogSkin,
  exterior: ItemExterior,
  statTrak: boolean,
): string | null {
  const marketHashName =
    skin.marketHashNames.find((entry) => entry.exterior === exterior)?.marketHashName ?? null;
  if (!marketHashName) return null;
  return statTrak ? applyStatTrak(marketHashName) : marketHashName;
}

async function listEngineComboOutputRefs(
  options: EngineComboWatchlistOptions,
): Promise<EngineComboOutputRef[]> {
  const collectionIds = uniqueStrings(options.collectionIds ?? []);
  const filters = [
    Prisma.sql`b."catalogVersion" = (
      SELECT latest."catalogVersion"
      FROM "TradeupComboBase" latest
      ORDER BY latest."createdAt" DESC
      LIMIT 1
    )`,
    Prisma.sql`json_type(output.value, '$.s') = 'text'`,
  ];
  if (collectionIds.length > 0) {
    filters.push(
      Prisma.sql`NOT EXISTS (
        SELECT 1
        FROM json_each(b."collections") collection
        WHERE collection.value NOT IN (${Prisma.join(collectionIds)})
      )`,
    );
  }

  const rows = await db.$queryRaw<RawEngineComboOutputRef[]>`
    SELECT DISTINCT
      json_extract(output.value, '$.s') AS "catalogSkinId",
      b."statTrak" AS "statTrak"
    FROM "TradeupComboBase" b
    JOIN json_each(b."outputDistribution") output
    WHERE ${Prisma.join(filters, ' AND ')}
    ORDER BY "catalogSkinId" ASC, "statTrak" ASC
  `;

  return rows
    .map((row) => ({
      catalogSkinId: row.catalogSkinId,
      statTrak: toBoolean(row.statTrak),
    }))
    .filter((row): row is EngineComboOutputRef =>
      typeof row.catalogSkinId === 'string',
    );
}

async function listEngineCollectionIds(): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ collectionId: string }>>`
    SELECT DISTINCT collection.value AS "collectionId"
    FROM "TradeupComboBase" b
    JOIN json_each(b."collections") collection
    WHERE b."catalogVersion" = (
      SELECT latest."catalogVersion"
      FROM "TradeupComboBase" latest
      ORDER BY latest."createdAt" DESC
      LIMIT 1
    )
      AND typeof(collection.value) = 'text'
    ORDER BY collection.value ASC
  `;

  return rows.map((row) => row.collectionId);
}

function applyStatTrak(marketHashName: string): string {
  return marketHashName.startsWith(STAT_TRAK_PREFIX)
    ? marketHashName
    : `${STAT_TRAK_PREFIX}${marketHashName}`;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function toBoolean(value: boolean | number | bigint | string): boolean {
  return value === true || value === 1 || value === 1n || value === '1' || value === 'true';
}

interface EngineComboOutputRef {
  catalogSkinId: string;
  statTrak: boolean;
}

interface RawEngineComboOutputRef {
  catalogSkinId: unknown;
  statTrak: boolean | number | bigint | string;
}
