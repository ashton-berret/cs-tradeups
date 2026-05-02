import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { CatalogSkin, CatalogSnapshot } from '$lib/schemas/catalog';
import { getCatalogSnapshot } from '$lib/server/catalog/catalogService';
import { db } from '$lib/server/db/client';
import { exteriorForFloat, projectOutputFloat } from '$lib/server/utils/float';
import { getNextRarity, ITEM_RARITIES, type ItemExterior, type ItemRarity } from '$lib/types/enums';

export const TRADEUP_CONTRACT_SIZE = 10;
// Practical cap on distinct collections per contract. Two distinct collections
// covers all "anchor + filler" theses (the dominant high-EV pattern) and keeps
// Tier-0 cardinality near the design target. Three or more is opt-in via
// --max-distinct-collections; combined with NON_ANCHOR_PRUNING below it stays
// operationally bounded.
export const MAX_COLLECTIONS_PER_PARTITION = 2;
export const PROGRESS_LOG_INTERVAL = 1000;
// Average wear regimes per partition observed empirically. Single-collection
// full-range partitions yield ~5 regimes; mixed-range 2-collection partitions
// yield ~7; 3-collection partitions yield ~10. The blended average for cap-2
// is ~6, for cap-3 is ~15. We use 15 as a slight over-estimate so the progress
// bar pessimistic; actual generated count is reported separately (this value was found via actual running of the enumeration).
const AVG_WEAR_REGIMES_PER_PARTITION = 15;
// Anchor-style partitions (one collection has ≤ ANCHOR_OUTPUT_THRESHOLD
// outputs at R+1) carry asymmetric upside: small probability of a high-value
// concentrated output. Multi-collection partitions WITHOUT an anchor are
// pure dilution — they don't beat the corresponding 2-collection partition
// at any price point. iterateComboRows drops them by default.
const ANCHOR_OUTPUT_THRESHOLD = 2;

const FLOAT_BREAKPOINTS = [0.07, 0.15, 0.38, 0.45] as const;
const STAT_TRAK_PREFIX = 'StatTrak™ ';
const BATCH_SIZE = 500;
const WRITE_RETRY_LIMIT = 5;

export interface TradeupComboOutput {
  catalogSkinId: string;
  marketHashName: string;
  weaponName: string;
  skinName: string;
  catalogCollectionId: string;
  collectionName: string;
  probability: number;
  projectedExterior: ItemExterior;
  projectedFloat: number;
  feasible: boolean;
}

export interface TradeupComboOutputDistributionEntry {
  s: string;
  p: number;
}

export interface TradeupComboOutputProjectionEntry {
  s: string;
  e: ItemExterior;
  f: number;
}

export interface TradeupComboRow {
  inputRarity: ItemRarity;
  statTrak: boolean;
  partition: Record<string, number>;
  partitionHash: string;
  wearRegimeIndex: number;
  targetAvgWearProp: number;
  wearIntervalLow: number;
  wearIntervalHigh: number;
  collections: string[];
  outputs: TradeupComboOutput[];
  hasSingleOutputCollection: boolean;
  crossCollection: boolean;
  catalogVersion: string;
}

export interface EnumerateProgress {
  written: number;
  generated: number;
  elapsedMs: number;
  estimatedTotal: number;
  currentInputRarity: ItemRarity | null;
  currentStatTrak: boolean | null;
}

export interface EnumerateComboOptions {
  inputRarities?: ItemRarity[];
  statTrakValues?: boolean[];
  collectionIds?: string[];
  maxCollectionsPerPartition?: number;
  dryRun?: boolean;
  catalogVersion?: string;
  /**
   * When true (default), 3+ collection partitions are kept only if at least
   * one collection has ≤ ANCHOR_OUTPUT_THRESHOLD outputs at the target rarity.
   * Disable to keep every structurally valid partition (much larger DB).
   */
  keepNonAnchorMultiCollection?: boolean;
  /**
   * Hard runtime ceiling. Generator stops yielding once the count reaches
   * this value. Useful for sampling or for protecting against estimate
   * undershoots. Undefined = no ceiling.
   */
  maxCombos?: number;
  onEstimate?: (estimate: EnumerateEstimate) => void;
  onProgress?: (progress: EnumerateProgress) => void;
}

export interface EnumerateEstimate {
  totalPartitions: number;
  totalCombos: number;
  perRarity: Array<{ inputRarity: ItemRarity; statTrak: boolean; partitions: number }>;
}

export interface EnumerateComboSummary {
  written: number;
  skipped: number;
  generated: number;
  catalogVersion: string;
  counts: Array<{ inputRarity: ItemRarity; statTrak: boolean; combos: number }>;
}

interface CollectionRarityBucket {
  collectionId: string;
  collectionName: string;
  byRarity: Map<ItemRarity, CatalogSkin[]>;
}

type StoredComboRow = Prisma.TradeupComboGetPayload<{ include: { base: true } }>;

interface RawStoredComboRow {
  id: string;
  createdAt: Date | string;
  baseId: string;
  wearRegimeIndex: number;
  targetAvgWearProp: number;
  wearIntervalLow: number;
  wearIntervalHigh: number;
  outputProjection: Prisma.JsonValue | string;
  catalogVersion: string;
  baseCreatedAt: Date | string;
  inputRarity: string;
  statTrak: boolean | number | bigint | string;
  partition: Prisma.JsonValue | string;
  partitionHash: string;
  collections: Prisma.JsonValue | string;
  outputDistribution: Prisma.JsonValue | string;
  hasSingleOutputCollection: boolean | number | bigint | string;
  crossCollection: boolean | number | bigint | string;
  baseCatalogVersion: string;
}

export interface ComboListFilter {
  inputRarity?: ItemRarity;
  statTrak?: boolean;
  collectionId?: string;
  hasSingleOutputCollection?: boolean;
  catalogVersion?: string;
  page?: number;
  limit?: number;
}

export interface TradeupComboDTO extends TradeupComboRow {
  id: string;
  createdAt: string;
  collectionNames: string[];
}

export interface TradeupComboPage {
  data: TradeupComboDTO[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  catalogVersions: string[];
}

export interface WearRegime {
  index: number;
  targetAvgWearProp: number;
  intervalLow: number;
  intervalHigh: number;
}

export async function enumerateCombos(
  catalogVersion?: string,
  options: Omit<EnumerateComboOptions, 'catalogVersion'> = {},
): Promise<EnumerateComboSummary> {
  const snapshot = await getCatalogSnapshot();
  const resolvedCatalogVersion = catalogVersion ?? getCatalogVersion(snapshot);

  const estimate = estimateCombos(snapshot, options);
  options.onEstimate?.(estimate);

  const counts = new Map<string, { inputRarity: ItemRarity; statTrak: boolean; combos: number }>();
  let generated = 0;
  let written = 0;
  let lastInputRarity: ItemRarity | null = null;
  let lastStatTrak: boolean | null = null;
  let batch: TradeupComboRow[] = [];
  const startedAt = Date.now();

  const emitProgress = () => {
    options.onProgress?.({
      written,
      generated,
      elapsedMs: Date.now() - startedAt,
      estimatedTotal: estimate.totalCombos,
      currentInputRarity: lastInputRarity,
      currentStatTrak: lastStatTrak,
    });
  };

  const flushBatch = async () => {
    if (batch.length === 0) return;
    if (options.dryRun) {
      batch = [];
      return;
    }
    const toWrite = batch;
    batch = [];
    await ensureComboBases(toWrite);
    const existing = await db.tradeupCombo.findMany({
      where: {
        OR: toWrite.map((row) => ({
          baseId: comboBaseId(row),
          wearRegimeIndex: row.wearRegimeIndex,
        })),
      },
      select: {
        baseId: true,
        wearRegimeIndex: true,
      },
    });
    const existingKeys = new Set(existing.map(uniqueComboKey));
    const missing = toWrite.filter((row) => !existingKeys.has(uniqueComboKey(row)));
    if (missing.length === 0) return;

    written += await createMissingCombos(missing);
  };

  for (const row of iterateComboRows(snapshot, { ...options, catalogVersion: resolvedCatalogVersion })) {
    generated += 1;
    lastInputRarity = row.inputRarity;
    lastStatTrak = row.statTrak;
    const key = `${row.inputRarity}:${row.statTrak}`;
    const existing = counts.get(key);
    if (existing) {
      existing.combos += 1;
    } else {
      counts.set(key, { inputRarity: row.inputRarity, statTrak: row.statTrak, combos: 1 });
    }

    batch.push(row);
    if (batch.length >= BATCH_SIZE) {
      await flushBatch();
    }
    if (generated % PROGRESS_LOG_INTERVAL === 0) {
      emitProgress();
    }
  }
  await flushBatch();
  emitProgress();

  return {
    written: options.dryRun ? 0 : written,
    skipped: options.dryRun ? generated : generated - written,
    generated,
    catalogVersion: resolvedCatalogVersion,
    counts: [...counts.values()].sort(
      (a, b) =>
        ITEM_RARITIES.indexOf(a.inputRarity) - ITEM_RARITIES.indexOf(b.inputRarity) ||
        Number(a.statTrak) - Number(b.statTrak),
    ),
  };
}

export async function listTradeupCombos(filter: ComboListFilter = {}): Promise<TradeupComboPage> {
  const snapshot = await getCatalogSnapshot();
  const collectionNames = new Map(snapshot.collections.map((collection) => [collection.id, collection.name]));
  const skinsById = new Map(snapshot.skins.map((skin) => [skin.id, skin]));
  const page = Math.max(1, Math.trunc(filter.page ?? 1));
  const limit = Math.min(100, Math.max(1, Math.trunc(filter.limit ?? 25)));
  const skip = (page - 1) * limit;
  const catalogVersions = (
    await db.tradeupCombo.findMany({
      distinct: ['catalogVersion'],
      orderBy: { catalogVersion: 'desc' },
      select: { catalogVersion: true },
    })
  ).map((row) => row.catalogVersion);

  const where: Prisma.TradeupComboWhereInput = {
    ...(filter.catalogVersion ? { catalogVersion: filter.catalogVersion } : {}),
    base: {
      ...(filter.inputRarity ? { inputRarity: filter.inputRarity } : {}),
      ...(filter.statTrak != null ? { statTrak: filter.statTrak } : {}),
      ...(filter.hasSingleOutputCollection != null
        ? { hasSingleOutputCollection: filter.hasSingleOutputCollection }
        : {}),
    },
  };

  const result = filter.collectionId
    ? await listTradeupCombosByCollection({ ...filter, collectionId: filter.collectionId }, skip, limit)
    : {
        total: await db.tradeupCombo.count({ where }),
        rows: await db.tradeupCombo.findMany({
          where,
          include: { base: true },
          orderBy: [
            { base: { inputRarity: 'asc' } },
            { base: { statTrak: 'asc' } },
            { baseId: 'asc' },
            { wearRegimeIndex: 'asc' },
          ],
          skip,
          take: limit,
        }),
      };

  const data = result.rows.map((row) =>
    mapStoredComboRow(row, {
      collectionNames,
      skinsById,
    }),
  );

  return {
    data,
    total: result.total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(result.total / limit)),
    catalogVersions,
  };
}

async function listTradeupCombosByCollection(
  filter: ComboListFilter & { collectionId: string },
  skip: number,
  limit: number,
): Promise<{ total: number; rows: StoredComboRow[] }> {
  const conditions = [
    Prisma.sql`EXISTS (SELECT 1 FROM json_each(b."collections") WHERE value = ${filter.collectionId})`,
  ];
  if (filter.catalogVersion) {
    conditions.push(Prisma.sql`c."catalogVersion" = ${filter.catalogVersion}`);
  }
  if (filter.inputRarity) {
    conditions.push(Prisma.sql`b."inputRarity" = ${filter.inputRarity}`);
  }
  if (filter.statTrak != null) {
    conditions.push(Prisma.sql`b."statTrak" = ${filter.statTrak}`);
  }
  if (filter.hasSingleOutputCollection != null) {
    conditions.push(Prisma.sql`b."hasSingleOutputCollection" = ${filter.hasSingleOutputCollection}`);
  }

  const whereSql = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
  const totalRows = await db.$queryRaw<Array<{ total: number | bigint }>>`
    SELECT count(*) AS total
    FROM "TradeupCombo" c
    JOIN "TradeupComboBase" b ON b."id" = c."baseId"
    ${whereSql}
  `;
  const rows = await db.$queryRaw<RawStoredComboRow[]>`
    SELECT
      c."id",
      c."createdAt",
      c."baseId",
      c."wearRegimeIndex",
      c."targetAvgWearProp",
      c."wearIntervalLow",
      c."wearIntervalHigh",
      c."outputProjection",
      c."catalogVersion",
      b."createdAt" AS "baseCreatedAt",
      b."inputRarity",
      b."statTrak",
      b."partition",
      b."partitionHash",
      b."collections",
      b."outputDistribution",
      b."hasSingleOutputCollection",
      b."crossCollection",
      b."catalogVersion" AS "baseCatalogVersion"
    FROM "TradeupCombo" c
    JOIN "TradeupComboBase" b ON b."id" = c."baseId"
    ${whereSql}
    ORDER BY b."inputRarity" ASC, b."statTrak" ASC, c."baseId" ASC, c."wearRegimeIndex" ASC
    LIMIT ${limit}
    OFFSET ${skip}
  `;

  return {
    total: Number(totalRows[0]?.total ?? 0),
    rows: rows.map(mapRawStoredComboRow),
  };
}

function mapStoredComboRow(
  row: StoredComboRow,
  context: {
    collectionNames: Map<string, string>;
    skinsById: Map<string, CatalogSkin>;
  },
): TradeupComboDTO {
  const collections = jsonArray(row.base.collections);
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    inputRarity: row.base.inputRarity as ItemRarity,
    statTrak: row.base.statTrak,
    partition: jsonRecord(row.base.partition),
    partitionHash: row.base.partitionHash,
    wearRegimeIndex: row.wearRegimeIndex,
    targetAvgWearProp: row.targetAvgWearProp,
    wearIntervalLow: row.wearIntervalLow,
    wearIntervalHigh: row.wearIntervalHigh,
    collections,
    collectionNames: collections.map((id) => context.collectionNames.get(id) ?? id),
    outputs: expandStoredOutputs({
      distribution: jsonOutputDistribution(row.base.outputDistribution),
      projection: jsonOutputProjection(row.outputProjection),
      statTrak: row.base.statTrak,
      skinsById: context.skinsById,
    }),
    hasSingleOutputCollection: row.base.hasSingleOutputCollection,
    crossCollection: row.base.crossCollection,
    catalogVersion: row.catalogVersion,
  };
}

function mapRawStoredComboRow(row: RawStoredComboRow): StoredComboRow {
  return {
    id: row.id,
    createdAt: toDate(row.createdAt),
    baseId: row.baseId,
    wearRegimeIndex: Number(row.wearRegimeIndex),
    targetAvgWearProp: Number(row.targetAvgWearProp),
    wearIntervalLow: Number(row.wearIntervalLow),
    wearIntervalHigh: Number(row.wearIntervalHigh),
    outputProjection: parseJsonValue(row.outputProjection),
    catalogVersion: row.catalogVersion,
    base: {
      id: row.baseId,
      createdAt: toDate(row.baseCreatedAt),
      inputRarity: row.inputRarity,
      statTrak: toBoolean(row.statTrak),
      partition: parseJsonValue(row.partition),
      partitionHash: row.partitionHash,
      collections: parseJsonValue(row.collections),
      outputDistribution: parseJsonValue(row.outputDistribution),
      hasSingleOutputCollection: toBoolean(row.hasSingleOutputCollection),
      crossCollection: toBoolean(row.crossCollection),
      catalogVersion: row.baseCatalogVersion,
    },
  };
}

export function enumerateComboRowsForCatalog(
  snapshot: CatalogSnapshot,
  options: EnumerateComboOptions = {},
): TradeupComboRow[] {
  return [...iterateComboRows(snapshot, options)];
}

export function estimateCombos(
  snapshot: CatalogSnapshot,
  options: Omit<EnumerateComboOptions, 'onEstimate' | 'onProgress' | 'dryRun' | 'catalogVersion'> = {},
): EnumerateEstimate {
  const buckets = buildCollectionBuckets(snapshot);
  const requestedCollectionIds = new Set(options.collectionIds ?? []);
  const inputRarities = options.inputRarities ?? TRADEUP_INPUT_RARITIES;
  const statTrakValues = options.statTrakValues ?? [false, true];
  const maxCollectionsPerPartition = options.maxCollectionsPerPartition ?? MAX_COLLECTIONS_PER_PARTITION;
  const perRarity: EnumerateEstimate['perRarity'] = [];

  for (const inputRarity of inputRarities) {
    const outputRarity = getNextRarity(inputRarity);
    if (!outputRarity) continue;

    const viableCollections = buckets.filter((bucket) => {
      if (requestedCollectionIds.size > 0 && !requestedCollectionIds.has(bucket.collectionId)) {
        return false;
      }
      return (bucket.byRarity.get(inputRarity)?.length ?? 0) > 0 && (bucket.byRarity.get(outputRarity)?.length ?? 0) > 0;
    });

    for (const statTrak of statTrakValues) {
      const collectionCount = statTrak
        ? viableCollections.filter((collection) => isCollectionStatTrakEligible(collection)).length
        : viableCollections.length;
      perRarity.push({
        inputRarity,
        statTrak,
        partitions: countCollectionPartitions(
          collectionCount,
          TRADEUP_CONTRACT_SIZE,
          maxCollectionsPerPartition,
        ),
      });
    }
  }

  const totalPartitions = perRarity.reduce((sum, entry) => sum + entry.partitions, 0);
  return {
    totalPartitions,
    totalCombos: totalPartitions * AVG_WEAR_REGIMES_PER_PARTITION,
    perRarity,
  };
}

export function* iterateComboRows(
  snapshot: CatalogSnapshot,
  options: EnumerateComboOptions = {},
): Generator<TradeupComboRow> {
  const catalogVersion = options.catalogVersion ?? getCatalogVersion(snapshot);
  const buckets = buildCollectionBuckets(snapshot);
  const requestedCollectionIds = new Set(options.collectionIds ?? []);
  const inputRarities = options.inputRarities ?? TRADEUP_INPUT_RARITIES;
  const statTrakValues = options.statTrakValues ?? [false, true];
  const maxCollectionsPerPartition = options.maxCollectionsPerPartition ?? MAX_COLLECTIONS_PER_PARTITION;
  const anchorPrune = options.keepNonAnchorMultiCollection !== true;
  const maxCombos = options.maxCombos;
  let yielded = 0;

  for (const inputRarity of inputRarities) {
    const outputRarity = getNextRarity(inputRarity);
    if (!outputRarity) continue;

    const viableCollections = buckets
      .filter((bucket) => {
        if (requestedCollectionIds.size > 0 && !requestedCollectionIds.has(bucket.collectionId)) {
          return false;
        }
        return (bucket.byRarity.get(inputRarity)?.length ?? 0) > 0 && (bucket.byRarity.get(outputRarity)?.length ?? 0) > 0;
      })
      .sort((a, b) => a.collectionId.localeCompare(b.collectionId));

    for (const statTrak of statTrakValues) {
      const statTrakEligible = statTrak
        ? viableCollections.filter((collection) => isCollectionStatTrakEligible(collection))
        : viableCollections;
      const byId = new Map(statTrakEligible.map((collection) => [collection.collectionId, collection]));
      const collectionIds = statTrakEligible.map((collection) => collection.collectionId);

      for (const partition of iterateCollectionPartitions(collectionIds, TRADEUP_CONTRACT_SIZE, maxCollectionsPerPartition)) {
        const collectionsInPartition = Object.keys(partition);

        // Anchor prune: 3+ collection partitions must contain at least one
        // collection whose R+1 output count is ≤ ANCHOR_OUTPUT_THRESHOLD.
        // Without an anchor, multi-collection partitions are pure dilution
        // and don't structurally beat the corresponding 2-collection partition.
        if (anchorPrune && collectionsInPartition.length >= 3) {
          const hasAnchor = collectionsInPartition.some((collectionId) => {
            const outputCount = byId.get(collectionId)?.byRarity.get(outputRarity)?.length ?? 0;
            return outputCount > 0 && outputCount <= ANCHOR_OUTPUT_THRESHOLD;
          });
          if (!hasAnchor) continue;
        }

        const outputs = buildOutputDistribution(partition, byId, outputRarity, statTrak);
        if (outputs.length === 0) continue;

        const regimes = enumerateWearRegimes(outputs.map((output) => output.skin));
        if (regimes.length === 0) continue;

        const targetOutputCounts = new Map<string, number>();
        for (const output of outputs) {
          targetOutputCounts.set(output.skin.collectionId, (targetOutputCounts.get(output.skin.collectionId) ?? 0) + 1);
        }
        const collections = collectionsInPartition.sort((a, b) => a.localeCompare(b));
        const hasSingleOutputCollection = collections.some((collectionId) => (targetOutputCounts.get(collectionId) ?? 0) === 1);
        const partitionHash = hashPartition(partition);

        for (const regime of regimes) {
          const projectedOutputs = outputs.map((output) =>
            projectComboOutput(output.skin, output.probability, regime.targetAvgWearProp, statTrak),
          );
          if (projectedOutputs.every((output) => !output.feasible)) {
            continue;
          }

          if (maxCombos != null && yielded >= maxCombos) return;
          yielded += 1;
          yield {
            inputRarity,
            statTrak,
            partition,
            partitionHash,
            wearRegimeIndex: regime.index,
            targetAvgWearProp: regime.targetAvgWearProp,
            wearIntervalLow: regime.intervalLow,
            wearIntervalHigh: regime.intervalHigh,
            collections,
            outputs: projectedOutputs,
            hasSingleOutputCollection,
            crossCollection: collections.length > 1,
            catalogVersion,
          };
        }
      }
    }
  }
}

export const TRADEUP_INPUT_RARITIES = ITEM_RARITIES.filter((rarity) => getNextRarity(rarity) !== null);

export function getCatalogVersion(snapshot: CatalogSnapshot): string {
  const sourceDigest = createHash('sha256')
    .update(JSON.stringify(snapshot.sourceFiles.map((file) => file.sha256).sort()))
    .digest('hex')
    .slice(0, 16);
  return `snapshot-${snapshot.snapshotVersion}-${sourceDigest}`;
}

export function enumerateIntegerPartitions(
  total: number,
  maxParts: number = total,
): number[][] {
  const result: number[][] = [];

  function visit(remaining: number, maxNext: number, parts: number[]) {
    if (remaining === 0) {
      if (parts.length <= maxParts) {
        result.push([...parts]);
      }
      return;
    }
    if (parts.length >= maxParts) {
      return;
    }
    for (let value = Math.min(maxNext, remaining); value >= 1; value -= 1) {
      parts.push(value);
      visit(remaining - value, value, parts);
      parts.pop();
    }
  }

  visit(total, total, []);
  return result;
}

export function enumerateCollectionPartitions(
  collectionIds: string[],
  total: number = TRADEUP_CONTRACT_SIZE,
  maxCollections: number = MAX_COLLECTIONS_PER_PARTITION,
): Array<Record<string, number>> {
  return [...iterateCollectionPartitions(collectionIds, total, maxCollections)];
}

export function* iterateCollectionPartitions(
  collectionIds: string[],
  total: number = TRADEUP_CONTRACT_SIZE,
  maxCollections: number = MAX_COLLECTIONS_PER_PARTITION,
): Generator<Record<string, number>> {
  const sortedIds = [...collectionIds].sort((a, b) => a.localeCompare(b));
  const maxDistinct = Math.min(maxCollections, sortedIds.length, total);
  const selected: string[] = [];

  function* chooseCollections(start: number, targetSize: number): Generator<Record<string, number>> {
    if (selected.length === targetSize) {
      for (const counts of iteratePositiveCompositions(total, targetSize)) {
        yield Object.fromEntries(selected.map((id, index) => [id, counts[index]]));
      }
      return;
    }

    const needed = targetSize - selected.length;
    for (let index = start; index <= sortedIds.length - needed; index += 1) {
      selected.push(sortedIds[index]);
      yield* chooseCollections(index + 1, targetSize);
      selected.pop();
    }
  }

  for (let size = 1; size <= maxDistinct; size += 1) {
    yield* chooseCollections(0, size);
  }
}

export function hashPartition(partition: Record<string, number>): string {
  return createHash('sha256').update(canonicalPartitionJson(partition)).digest('hex');
}

export function enumerateWearRegimes(outputSkins: CatalogSkin[]): WearRegime[] {
  const breakpoints = new Set<string>(['0', '1']);
  for (const skin of outputSkins) {
    const span = skin.maxFloat - skin.minFloat;
    if (span <= 0) continue;
    for (const boundary of FLOAT_BREAKPOINTS) {
      const wear = (boundary - skin.minFloat) / span;
      if (wear > 0 && wear < 1) {
        breakpoints.add(normalizeWearBoundary(wear).toString());
      }
    }
  }

  const sorted = [...breakpoints].map(Number).sort((a, b) => a - b);
  const regimes: WearRegime[] = [];
  const seenExteriorVectors = new Set<string>();
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const low = sorted[index];
    const high = sorted[index + 1];
    if (high <= low) continue;

    const targetAvgWearProp = roundWear((low + high) / 2);
    const exteriorVector = outputSkins
      .map((skin) => exteriorForFloat(projectOutputFloat(targetAvgWearProp, skin.minFloat, skin.maxFloat)))
      .join('|');
    if (seenExteriorVectors.has(exteriorVector)) {
      continue;
    }
    seenExteriorVectors.add(exteriorVector);

    regimes.push({
      index: regimes.length,
      targetAvgWearProp,
      intervalLow: roundWear(low),
      intervalHigh: roundWear(high),
    });
  }

  return regimes;
}

export function summarizeComboRows(rows: TradeupComboRow[]): Array<{ inputRarity: ItemRarity; statTrak: boolean; combos: number }> {
  const counts = new Map<string, { inputRarity: ItemRarity; statTrak: boolean; combos: number }>();
  for (const row of rows) {
    const key = `${row.inputRarity}:${row.statTrak}`;
    const existing = counts.get(key);
    if (existing) {
      existing.combos += 1;
    } else {
      counts.set(key, { inputRarity: row.inputRarity, statTrak: row.statTrak, combos: 1 });
    }
  }

  return [...counts.values()].sort(
    (a, b) =>
      ITEM_RARITIES.indexOf(a.inputRarity) - ITEM_RARITIES.indexOf(b.inputRarity) ||
      Number(a.statTrak) - Number(b.statTrak),
  );
}

function buildCollectionBuckets(snapshot: CatalogSnapshot): CollectionRarityBucket[] {
  const buckets = new Map<string, CollectionRarityBucket>();
  for (const collection of snapshot.collections) {
    buckets.set(collection.id, {
      collectionId: collection.id,
      collectionName: collection.name,
      byRarity: new Map(),
    });
  }

  for (const skin of snapshot.skins) {
    if (!skin.rarity) continue;
    const bucket = buckets.get(skin.collectionId);
    if (!bucket) continue;
    const skins = bucket.byRarity.get(skin.rarity) ?? [];
    skins.push(skin);
    bucket.byRarity.set(skin.rarity, skins);
  }

  for (const bucket of buckets.values()) {
    for (const skins of bucket.byRarity.values()) {
      skins.sort((a, b) => a.id.localeCompare(b.id));
    }
  }

  return [...buckets.values()].sort((a, b) => a.collectionId.localeCompare(b.collectionId));
}

function isCollectionStatTrakEligible(collection: CollectionRarityBucket): boolean {
  return !/\bsouvenir\b/i.test(collection.collectionName);
}

function buildOutputDistribution(
  partition: Record<string, number>,
  collectionsById: Map<string, CollectionRarityBucket>,
  outputRarity: ItemRarity,
  _statTrak: boolean,
): Array<{ skin: CatalogSkin; probability: number }> {
  const outputs: Array<{ skin: CatalogSkin; probability: number }> = [];
  for (const [collectionId, slotCount] of Object.entries(partition).sort(([a], [b]) => a.localeCompare(b))) {
    const collection = collectionsById.get(collectionId);
    const skins = collection?.byRarity.get(outputRarity) ?? [];
    if (skins.length === 0) continue;
    const probability = slotCount / TRADEUP_CONTRACT_SIZE / skins.length;
    for (const skin of skins) {
      outputs.push({ skin, probability });
    }
  }

  return outputs.sort((a, b) => a.skin.id.localeCompare(b.skin.id));
}

function projectComboOutput(
  skin: CatalogSkin,
  probability: number,
  targetAvgWearProp: number,
  statTrak: boolean,
): TradeupComboOutput {
  const projectedFloat = projectOutputFloat(targetAvgWearProp, skin.minFloat, skin.maxFloat);
  const projectedExterior = exteriorForFloat(projectedFloat);
  const marketHashName =
    skin.marketHashNames.find((entry) => entry.exterior === projectedExterior)?.marketHashName ?? skin.baseMarketHashName;

  return {
    catalogSkinId: skin.id,
    marketHashName: statTrak ? applyStatTrak(marketHashName) : marketHashName,
    weaponName: skin.weaponName,
    skinName: skin.skinName,
    catalogCollectionId: skin.collectionId,
    collectionName: skin.collectionName,
    probability: roundProbability(probability),
    projectedExterior,
    projectedFloat,
    feasible: skin.exteriors.includes(projectedExterior),
  };
}

function* iteratePositiveCompositions(total: number, parts: number): Generator<number[]> {
  const current: number[] = [];

  function* visit(remaining: number, slotsLeft: number): Generator<number[]> {
    if (slotsLeft === 1) {
      yield [...current, remaining];
      return;
    }

    const max = remaining - (slotsLeft - 1);
    for (let value = 1; value <= max; value += 1) {
      current.push(value);
      yield* visit(remaining - value, slotsLeft - 1);
      current.pop();
    }
  }

  yield* visit(total, parts);
}

function canonicalPartitionJson(partition: Record<string, number>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(partition).sort(([a], [b]) => a.localeCompare(b))));
}

function normalizeWearBoundary(value: number): number {
  return Number(value.toFixed(12));
}

function roundWear(value: number): number {
  return Number(value.toFixed(6));
}

function roundProbability(value: number): number {
  return Number(value.toFixed(12));
}

function applyStatTrak(marketHashName: string): string {
  return marketHashName.startsWith(STAT_TRAK_PREFIX) ? marketHashName : `${STAT_TRAK_PREFIX}${marketHashName}`;
}

function countCollectionPartitions(
  collectionCount: number,
  total: number,
  maxCollections: number,
): number {
  const maxDistinct = Math.min(collectionCount, total, maxCollections);
  let count = 0;
  for (let size = 1; size <= maxDistinct; size += 1) {
    count += combinations(collectionCount, size) * combinations(total - 1, size - 1);
  }
  return count;
}

function combinations(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  const effectiveK = Math.min(k, n - k);
  let result = 1;
  for (let value = 1; value <= effectiveK; value += 1) {
    result = (result * (n - effectiveK + value)) / value;
  }
  return Math.round(result);
}

function uniqueComboKey(row: {
  baseId?: string;
  inputRarity?: string;
  statTrak?: boolean;
  partitionHash?: string;
  catalogVersion?: string;
  wearRegimeIndex: number;
}): string {
  const baseId =
    row.baseId ??
    deterministicComboBaseId({
      inputRarity: row.inputRarity ?? '',
      statTrak: row.statTrak ?? false,
      partitionHash: row.partitionHash ?? '',
      catalogVersion: row.catalogVersion ?? '',
    });
  return `${baseId}:${row.wearRegimeIndex}`;
}

async function ensureComboBases(rows: TradeupComboRow[]): Promise<void> {
  const uniqueRows = Array.from(new Map(rows.map((row) => [comboBaseId(row), row])).values());
  if (uniqueRows.length === 0) return;

  const existing = await db.tradeupComboBase.findMany({
    where: {
      id: { in: uniqueRows.map(comboBaseId) },
    },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((row) => row.id));
  const missing = uniqueRows.filter((row) => !existingIds.has(comboBaseId(row)));
  if (missing.length === 0) return;

  await createMissingComboBases(missing);
}

async function createMissingComboBases(rows: TradeupComboRow[], attempt = 0): Promise<void> {
  if (rows.length === 0) return;

  try {
    await db.tradeupComboBase.createMany({
      data: rows.map(toPrismaBaseCreateManyInput),
    });
    return;
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      if (rows.length === 1) return;
      const midpoint = Math.floor(rows.length / 2);
      await createMissingComboBases(rows.slice(0, midpoint));
      await createMissingComboBases(rows.slice(midpoint));
      return;
    }

    if (attempt < WRITE_RETRY_LIMIT && isRetryableSqliteWriteError(err)) {
      await sleep(250 * 2 ** attempt);
      return createMissingComboBases(rows, attempt + 1);
    }

    if (rows.length === 1) {
      try {
        await db.tradeupComboBase.create({
          data: toPrismaBaseCreateInput(rows[0]),
        });
        return;
      } catch (fallbackErr) {
        if (isUniqueConstraintError(fallbackErr)) return;
        if (attempt < WRITE_RETRY_LIMIT && isRetryableSqliteWriteError(fallbackErr)) {
          await sleep(250 * 2 ** attempt);
          return createMissingComboBases(rows, attempt + 1);
        }
        const row = rows[0];
        throw new Error(
          `Failed to write TradeupComboBase ${row.inputRarity}/${row.statTrak ? 'StatTrak' : 'Normal'} ` +
            `${row.partitionHash}: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
        );
      }
    }

    const midpoint = Math.floor(rows.length / 2);
    await createMissingComboBases(rows.slice(0, midpoint));
    await createMissingComboBases(rows.slice(midpoint));
  }
}

async function createMissingCombos(rows: TradeupComboRow[], attempt = 0): Promise<number> {
  if (rows.length === 0) return 0;

  try {
    const result = await db.tradeupCombo.createMany({
      data: rows.map(toPrismaCreateManyInput),
    });
    return result.count;
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      if (rows.length === 1) return 0;
      const midpoint = Math.floor(rows.length / 2);
      const first = await createMissingCombos(rows.slice(0, midpoint));
      const second = await createMissingCombos(rows.slice(midpoint));
      return first + second;
    }

    if (attempt < WRITE_RETRY_LIMIT && isRetryableSqliteWriteError(err)) {
      await sleep(250 * 2 ** attempt);
      return createMissingCombos(rows, attempt + 1);
    }

    if (rows.length === 1) {
      try {
        await db.tradeupCombo.create({
          data: toPrismaCreateInput(rows[0]),
        });
        return 1;
      } catch (fallbackErr) {
        if (isUniqueConstraintError(fallbackErr)) {
          return 0;
        }
        if (attempt < WRITE_RETRY_LIMIT && isRetryableSqliteWriteError(fallbackErr)) {
          await sleep(250 * 2 ** attempt);
          return createMissingCombos(rows, attempt + 1);
        }
        const row = rows[0];
        throw new Error(
          `Failed to write TradeupCombo ${row.inputRarity}/${row.statTrak ? 'StatTrak' : 'Normal'} ` +
            `${row.partitionHash} regime ${row.wearRegimeIndex}: ${
              fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
            }`,
        );
      }
    }

    const midpoint = Math.floor(rows.length / 2);
    const first = await createMissingCombos(rows.slice(0, midpoint));
    const second = await createMissingCombos(rows.slice(midpoint));
    return first + second;
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: unknown }).code === 'P2002',
  );
}

function isRetryableSqliteWriteError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return (
    message.includes('error code 1: sql error or missing database') ||
    message.includes('database is locked') ||
    message.includes('database table is locked') ||
    message.includes('busy') ||
    message.includes('timed out')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toPrismaCreateManyInput(row: TradeupComboRow): Prisma.TradeupComboCreateManyInput {
  return {
    baseId: comboBaseId(row),
    wearRegimeIndex: row.wearRegimeIndex,
    targetAvgWearProp: row.targetAvgWearProp,
    wearIntervalLow: row.wearIntervalLow,
    wearIntervalHigh: row.wearIntervalHigh,
    outputProjection: compactOutputProjection(row.outputs) as unknown as Prisma.InputJsonValue,
    catalogVersion: row.catalogVersion,
  };
}

function toPrismaCreateInput(row: TradeupComboRow): Prisma.TradeupComboUncheckedCreateInput {
  return toPrismaCreateManyInput(row);
}

function toPrismaBaseCreateManyInput(row: TradeupComboRow): Prisma.TradeupComboBaseCreateManyInput {
  return {
    id: comboBaseId(row),
    inputRarity: row.inputRarity,
    statTrak: row.statTrak,
    partition: row.partition as Prisma.InputJsonValue,
    partitionHash: row.partitionHash,
    collections: row.collections as Prisma.InputJsonValue,
    outputDistribution: compactOutputDistribution(row.outputs) as unknown as Prisma.InputJsonValue,
    hasSingleOutputCollection: row.hasSingleOutputCollection,
    crossCollection: row.crossCollection,
    catalogVersion: row.catalogVersion,
  };
}

function toPrismaBaseCreateInput(row: TradeupComboRow): Prisma.TradeupComboBaseUncheckedCreateInput {
  return toPrismaBaseCreateManyInput(row);
}

function comboBaseId(row: TradeupComboRow): string {
  return deterministicComboBaseId(row);
}

function deterministicComboBaseId(row: {
  inputRarity: string;
  statTrak: boolean;
  partitionHash: string;
  catalogVersion: string;
}): string {
  return `tcb_${createHash('sha256')
    .update(`${row.inputRarity}:${row.statTrak}:${row.partitionHash}:${row.catalogVersion}`)
    .digest('hex')
    .slice(0, 30)}`;
}

function compactOutputDistribution(outputs: TradeupComboOutput[]): TradeupComboOutputDistributionEntry[] {
  return outputs.map((output) => ({
    s: output.catalogSkinId,
    p: output.probability,
  }));
}

function compactOutputProjection(outputs: TradeupComboOutput[]): TradeupComboOutputProjectionEntry[] {
  return outputs.map((output) => ({
    s: output.catalogSkinId,
    e: output.projectedExterior,
    f: output.projectedFloat,
  }));
}

function parseJsonValue(value: Prisma.JsonValue | string): Prisma.JsonValue {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as Prisma.JsonValue;
  } catch {
    return value;
  }
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toBoolean(value: boolean | number | bigint | string): boolean {
  return value === true || value === 1 || value === 1n || value === '1' || value === 'true';
}

function jsonArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function jsonRecord(value: Prisma.JsonValue): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function jsonOutputDistribution(value: Prisma.JsonValue): TradeupComboOutputDistributionEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isOutputDistributionEntry).map((entry) => entry as unknown as TradeupComboOutputDistributionEntry);
}

function jsonOutputProjection(value: Prisma.JsonValue): TradeupComboOutputProjectionEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isOutputProjectionEntry).map((entry) => entry as unknown as TradeupComboOutputProjectionEntry);
}

function expandStoredOutputs(input: {
  distribution: TradeupComboOutputDistributionEntry[];
  projection: TradeupComboOutputProjectionEntry[];
  statTrak: boolean;
  skinsById: Map<string, CatalogSkin>;
}): TradeupComboOutput[] {
  const probabilityBySkin = new Map(input.distribution.map((entry) => [entry.s, entry.p]));
  return input.projection
    .map((projection) => {
      const skin = input.skinsById.get(projection.s);
      if (!skin) return null;
      const marketHashName =
        skin.marketHashNames.find((entry) => entry.exterior === projection.e)?.marketHashName ?? skin.baseMarketHashName;
      return {
        catalogSkinId: skin.id,
        marketHashName: input.statTrak ? applyStatTrak(marketHashName) : marketHashName,
        weaponName: skin.weaponName,
        skinName: skin.skinName,
        catalogCollectionId: skin.collectionId,
        collectionName: skin.collectionName,
        probability: probabilityBySkin.get(skin.id) ?? 0,
        projectedExterior: projection.e,
        projectedFloat: projection.f,
        feasible: skin.exteriors.includes(projection.e),
      };
    })
    .filter((output): output is TradeupComboOutput => output != null);
}

function isOutputDistributionEntry(value: Prisma.JsonValue): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const output = value as Record<string, unknown>;
  return (
    typeof output.s === 'string' &&
    typeof output.p === 'number'
  );
}

function isOutputProjectionEntry(value: Prisma.JsonValue): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const output = value as Record<string, unknown>;
  return (
    typeof output.s === 'string' &&
    typeof output.e === 'string' &&
    typeof output.f === 'number'
  );
}
