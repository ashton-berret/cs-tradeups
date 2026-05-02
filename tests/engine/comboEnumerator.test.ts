import { describe, expect, it } from 'bun:test';
import type { CatalogCollection, CatalogSkin, CatalogSnapshot } from '$lib/schemas/catalog';
import {
  enumerateComboRowsForCatalog,
  enumerateCollectionPartitions,
  enumerateIntegerPartitions,
  enumerateWearRegimes,
  estimateCombos,
  hashPartition,
} from '$lib/server/engine/comboEnumerator';
import type { ItemRarity } from '$lib/types/enums';

describe('trade-up combo enumeration', () => {
  it('enumerates integer partitions deterministically', () => {
    const first = enumerateIntegerPartitions(10);
    const second = enumerateIntegerPartitions(10);

    expect(first).toEqual(second);
    expect(first).toHaveLength(42);
    expect(first[0]).toEqual([10]);
    expect(first.at(-1)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it('keeps restricted partition counts below the unrestricted P(10) count', () => {
    expect(enumerateIntegerPartitions(10, 2).length).toBeLessThan(42);
    expect(enumerateCollectionPartitions(['a', 'b'], 10, 2)).toHaveLength(11);
  });

  it('builds deterministic collection partition hashes', () => {
    const first = enumerateCollectionPartitions(['bravo', 'alpha', 'charlie'], 10, 2);
    const second = enumerateCollectionPartitions(['charlie', 'alpha', 'bravo'], 10, 2);

    expect(first).toEqual(second);
    expect(hashPartition({ bravo: 3, alpha: 7 })).toBe(hashPartition({ alpha: 7, bravo: 3 }));
  });

  it('estimates partition volume without materializing every combo', () => {
    const estimate = estimateCombos(syntheticCatalog(), {
      inputRarities: ['MIL_SPEC'],
      statTrakValues: [false],
      maxCollectionsPerPartition: 2,
    });

    expect(estimate.totalPartitions).toBe(30);
    expect(estimate.totalCombos).toBe(210);
    expect(estimate.perRarity).toEqual([
      {
        inputRarity: 'MIL_SPEC',
        statTrak: false,
        partitions: 30,
      },
    ]);
  });

  it('output distribution probabilities sum to 1.0 for every combo', () => {
    const rows = enumerateComboRowsForCatalog(syntheticCatalog(), {
      inputRarities: ['MIL_SPEC'],
      statTrakValues: [false],
      maxCollectionsPerPartition: 2,
      catalogVersion: 'test',
    });

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const sum = row.outputs.reduce((total, output) => total + output.probability, 0);
      expect(sum).toBeCloseTo(1, 10);
    }
  });

  it('samples breakpoints for a same-range output case', () => {
    const regimes = enumerateWearRegimes([skin('out-full', 'c1', 'Out', 'RESTRICTED', 0, 1)]);

    expect(regimes.map((regime) => regime.targetAvgWearProp)).toEqual([
      0.035,
      0.11,
      0.265,
      0.415,
      0.725,
    ]);
    expect(regimes.map((regime) => [regime.intervalLow, regime.intervalHigh])).toEqual([
      [0, 0.07],
      [0.07, 0.15],
      [0.15, 0.38],
      [0.38, 0.45],
      [0.45, 1],
    ]);
  });

  it('collapses a clamped single-band output case to one wear regime', () => {
    const regimes = enumerateWearRegimes([skin('out-clamped', 'c1', 'Out', 'RESTRICTED', 0.2, 0.3)]);

    expect(regimes).toHaveLength(1);
    expect(regimes[0]).toMatchObject({
      intervalLow: 0,
      intervalHigh: 1,
      targetAvgWearProp: 0.5,
    });
  });

  it('samples all mixed-range cross-collection exterior transitions', () => {
    const regimes = enumerateWearRegimes([
      skin('out-full', 'c1', 'Full', 'RESTRICTED', 0, 1),
      skin('out-mixed', 'c2', 'Mixed', 'RESTRICTED', 0.06, 0.8),
    ]);

    expect(regimes).toHaveLength(9);
    expect(regimes[0].intervalHigh).toBe(0.013514);
    expect(regimes[2].intervalLow).toBe(0.07);
    expect(regimes[5].intervalHigh).toBe(0.432432);
    expect(regimes.at(-1)?.intervalLow).toBe(0.527027);
  });

  it('enumerates StatTrak and non-StatTrak combos as parallel disjoint halves', () => {
    const rows = enumerateComboRowsForCatalog(syntheticCatalog(['alpha']), {
      inputRarities: ['MIL_SPEC'],
      statTrakValues: [false, true],
      maxCollectionsPerPartition: 1,
      catalogVersion: 'test',
    });

    const normal = rows.filter((row) => !row.statTrak);
    const statTrak = rows.filter((row) => row.statTrak);

    expect(normal).toHaveLength(statTrak.length);
    expect(normal.length).toBeGreaterThan(0);
    expect(normal.every((row) => row.outputs.every((output) => !output.marketHashName.startsWith('StatTrak')))).toBe(true);
    expect(statTrak.every((row) => row.outputs.every((output) => output.marketHashName.startsWith('StatTrak')))).toBe(true);

    const normalKeys = new Set(normal.map((row) => `${row.inputRarity}:${row.partitionHash}:${row.wearRegimeIndex}`));
    const statTrakKeys = new Set(statTrak.map((row) => `${row.inputRarity}:${row.partitionHash}:${row.wearRegimeIndex}`));
    expect(normalKeys).toEqual(statTrakKeys);
  });
});

function syntheticCatalog(collectionIds = ['alpha', 'bravo', 'charlie']): CatalogSnapshot {
  const collections = collectionIds.map((id) => collection(id));
  const skins: CatalogSkin[] = [];
  for (const collection of collections) {
    skins.push(skin(`${collection.id}-input`, collection.id, 'Input', 'MIL_SPEC', 0, 1));
    skins.push(skin(`${collection.id}-out-a`, collection.id, 'Output A', 'RESTRICTED', 0, 1));
    skins.push(skin(`${collection.id}-out-b`, collection.id, 'Output B', 'RESTRICTED', 0.06, 0.8));
  }

  return {
    snapshotVersion: 1,
    generatedAt: '2026-05-01T00:00:00.000Z',
    gamePath: 'test',
    sourceFiles: [
      {
        kind: 'LOCAL_CS2_VPK',
        path: 'items_game.txt',
        entryPath: 'scripts/items/items_game.txt',
        lastModified: '2026-05-01T00:00:00.000Z',
        sha256: '0'.repeat(64),
      },
    ],
    stats: {
      collectionCount: collections.length,
      weaponCount: 1,
      paintKitCount: skins.length,
      skinCount: skins.length,
    },
    collections,
    weapons: [
      {
        defIndex: 7,
        key: 'weapon_ak47',
        className: 'weapon_ak47',
        marketName: 'AK-47',
        source: source(),
      },
    ],
    paintKits: [],
    skins,
  };
}

function collection(id: string): CatalogCollection {
  return {
    id,
    key: id,
    itemSetKey: id,
    name: `${id} Collection`,
    skinCount: 3,
    source: source(),
  };
}

function skin(
  id: string,
  collectionId: string,
  skinName: string,
  rarity: ItemRarity,
  minFloat: number,
  maxFloat: number,
): CatalogSkin {
  return {
    id,
    defIndex: 7,
    paintIndex: Math.abs(hashCode(id)),
    weaponKey: 'weapon_ak47',
    weaponName: 'AK-47',
    skinName,
    baseMarketHashName: `AK-47 | ${skinName}`,
    collectionId,
    collectionName: `${collectionId} Collection`,
    rarity,
    minFloat,
    maxFloat,
    exteriors: ['FACTORY_NEW', 'MINIMAL_WEAR', 'FIELD_TESTED', 'WELL_WORN', 'BATTLE_SCARRED'],
    marketHashNames: [
      { exterior: 'FACTORY_NEW', marketHashName: `AK-47 | ${skinName} (Factory New)` },
      { exterior: 'MINIMAL_WEAR', marketHashName: `AK-47 | ${skinName} (Minimal Wear)` },
      { exterior: 'FIELD_TESTED', marketHashName: `AK-47 | ${skinName} (Field-Tested)` },
      { exterior: 'WELL_WORN', marketHashName: `AK-47 | ${skinName} (Well-Worn)` },
      { exterior: 'BATTLE_SCARRED', marketHashName: `AK-47 | ${skinName} (Battle-Scarred)` },
    ],
    source: source(),
  };
}

function source() {
  return {
    primarySource: 'LOCAL_CS2_VPK' as const,
    details: ['test'],
  };
}

function hashCode(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return hash;
}
