import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { applyMigrations, clearOperationalTables, configureTestDatabase } from '../helpers/db';
import type { SteamInventoryItem, SteamInventorySnapshot } from '$lib/server/steam/inventoryAdapter';

configureTestDatabase();

const db = new PrismaClient();
mock.module('$lib/server/db/client', () => ({ db }));
mock.module('$env/dynamic/private', () => ({ env: { STEAM_ID: '76561198000000001' } }));

let snapshot: SteamInventorySnapshot = makeSnapshot([]);
mock.module('$lib/server/steam/inventoryAdapter', () => ({
  getSteamInventory: async () => snapshot,
}));

const { syncInventoryWithSteam } = await import('$lib/server/inventory/steamLinkService');

describe('syncInventoryWithSteam', () => {
  beforeAll(async () => {
    await applyMigrations(db);
  });

  beforeEach(async () => {
    await clearOperationalTables(db);
    snapshot = makeSnapshot([]);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it('FLOAT_EXACT prefers a row whose float matches Steam within epsilon', async () => {
    await createInventoryItem({
      id: 'inv-exact',
      marketHashName: 'AK-47 | Slate (Field-Tested)',
      floatValue: 0.18,
    });
    await createInventoryItem({
      id: 'inv-mismatch',
      marketHashName: 'AK-47 | Slate (Field-Tested)',
      floatValue: 0.42,
    });

    snapshot = makeSnapshot([
      makeSteamItem({
        steamAssetId: 'asset-exact',
        marketHashName: 'AK-47 | Slate (Field-Tested)',
        floatValue: 0.18 + 1e-7,
      }),
    ]);

    const result = await syncInventoryWithSteam();

    expect(result.linked).toHaveLength(1);
    expect(result.linked[0]).toMatchObject({
      inventoryItemId: 'inv-exact',
      matchStrategy: 'FLOAT_EXACT',
      floatBackfilled: false,
    });
    const linkedRow = await db.inventoryItem.findUniqueOrThrow({ where: { id: 'inv-exact' } });
    expect(linkedRow.steamAssetId).toBe('asset-exact');
    expect(linkedRow.floatValue).toBeCloseTo(0.18, 9);
  });

  it('FLOAT_BACKFILL chooses a null-float row over a mismatched one and copies the Steam float', async () => {
    await createInventoryItem({
      id: 'inv-mismatch',
      marketHashName: 'AK-47 | Slate (Field-Tested)',
      floatValue: 0.99,
    });
    await createInventoryItem({
      id: 'inv-null',
      marketHashName: 'AK-47 | Slate (Field-Tested)',
      floatValue: null,
    });

    snapshot = makeSnapshot([
      makeSteamItem({
        steamAssetId: 'asset-1',
        marketHashName: 'AK-47 | Slate (Field-Tested)',
        floatValue: 0.31,
        paintSeed: 712,
      }),
    ]);

    const result = await syncInventoryWithSteam();

    expect(result.linked).toHaveLength(1);
    expect(result.linked[0]).toMatchObject({
      inventoryItemId: 'inv-null',
      matchStrategy: 'FLOAT_BACKFILL',
      floatBackfilled: true,
    });
    const linkedRow = await db.inventoryItem.findUniqueOrThrow({ where: { id: 'inv-null' } });
    expect(linkedRow.floatValue).toBe(0.31);
    expect(linkedRow.pattern).toBe(712);
  });

  it('FIFO_FALLBACK picks the oldest non-matching row when no float anchor is available', async () => {
    await createInventoryItem({
      id: 'inv-newer',
      marketHashName: 'AK-47 | Slate (Field-Tested)',
      floatValue: 0.91,
      createdAt: new Date('2026-04-20T00:00:00.000Z'),
    });
    await createInventoryItem({
      id: 'inv-older',
      marketHashName: 'AK-47 | Slate (Field-Tested)',
      floatValue: 0.92,
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
    });

    snapshot = makeSnapshot([
      makeSteamItem({
        steamAssetId: 'asset-fifo',
        marketHashName: 'AK-47 | Slate (Field-Tested)',
        floatValue: 0.55,
      }),
    ]);

    const result = await syncInventoryWithSteam();

    expect(result.linked).toHaveLength(1);
    expect(result.linked[0]).toMatchObject({
      inventoryItemId: 'inv-older',
      matchStrategy: 'FIFO_FALLBACK',
      floatBackfilled: false,
    });
    const linkedRow = await db.inventoryItem.findUniqueOrThrow({ where: { id: 'inv-older' } });
    expect(linkedRow.floatValue).toBe(0.92);
  });

  it('skips already-linked rows and reports linked Steam assets that vanished from the snapshot', async () => {
    await createInventoryItem({
      id: 'inv-linked',
      marketHashName: 'AK-47 | Slate (Field-Tested)',
      steamAssetId: 'asset-existing',
    });
    await createInventoryItem({
      id: 'inv-missing-side',
      marketHashName: 'AWP | Wildfire (Minimal Wear)',
      steamAssetId: 'asset-vanished',
    });

    snapshot = makeSnapshot([
      makeSteamItem({
        steamAssetId: 'asset-existing',
        marketHashName: 'AK-47 | Slate (Field-Tested)',
      }),
    ]);

    const result = await syncInventoryWithSteam();

    expect(result.linked).toHaveLength(0);
    expect(result.alreadyLinked).toBe(2);
    expect(result.missingFromSteam).toEqual([
      {
        inventoryItemId: 'inv-missing-side',
        steamAssetId: 'asset-vanished',
        marketHashName: 'AWP | Wildfire (Minimal Wear)',
      },
    ]);
  });

  it('matches across whitespace and casing drift via normalizeMarketHashLookup', async () => {
    await createInventoryItem({
      id: 'inv-lower',
      marketHashName: '  ak-47 | slate (Field-Tested)  ',
      floatValue: null,
    });

    snapshot = makeSnapshot([
      makeSteamItem({
        steamAssetId: 'asset-canonical',
        marketHashName: 'AK-47 | Slate (Field-Tested)',
        floatValue: 0.21,
      }),
    ]);

    const result = await syncInventoryWithSteam();

    expect(result.linked).toHaveLength(1);
    expect(result.linked[0]?.inventoryItemId).toBe('inv-lower');
    expect(result.unmatchedLocalRows).toHaveLength(0);
  });

  it('surfaces unmatched local rows and unlinked Steam items when names diverge unrecoverably', async () => {
    await createInventoryItem({
      id: 'inv-orphan',
      marketHashName: 'AK-47 | Redline (Field-Tested)',
      floatValue: null,
    });

    snapshot = makeSnapshot([
      makeSteamItem({
        steamAssetId: 'asset-orphan',
        marketHashName: 'AWP | Asiimov (Battle-Scarred)',
        floatValue: 0.71,
      }),
    ]);

    const result = await syncInventoryWithSteam();

    expect(result.linked).toHaveLength(0);
    expect(result.unmatchedLocalRows).toEqual([
      { inventoryItemId: 'inv-orphan', marketHashName: 'AK-47 | Redline (Field-Tested)' },
    ]);
    expect(result.unlinkedSteamItems).toHaveLength(1);
    expect(result.unlinkedSteamItems[0]?.steamAssetId).toBe('asset-orphan');
  });

  it('ignores inventory rows whose status is not HELD or RESERVED_FOR_BASKET', async () => {
    await createInventoryItem({
      id: 'inv-sold',
      marketHashName: 'AK-47 | Slate (Field-Tested)',
      status: 'SOLD',
    });

    snapshot = makeSnapshot([
      makeSteamItem({
        steamAssetId: 'asset-1',
        marketHashName: 'AK-47 | Slate (Field-Tested)',
      }),
    ]);

    const result = await syncInventoryWithSteam();

    expect(result.linked).toHaveLength(0);
    expect(result.unmatchedLocalRows).toHaveLength(0);
    expect(result.unlinkedSteamItems).toHaveLength(1);
  });
});

interface CreateInventoryItemOptions {
  id: string;
  marketHashName: string;
  floatValue?: number | null;
  pattern?: number | null;
  steamAssetId?: string | null;
  status?: string;
  createdAt?: Date;
}

async function createInventoryItem(opts: CreateInventoryItemOptions): Promise<void> {
  await db.inventoryItem.create({
    data: {
      id: opts.id,
      marketHashName: opts.marketHashName,
      floatValue: opts.floatValue ?? null,
      pattern: opts.pattern ?? null,
      steamAssetId: opts.steamAssetId ?? null,
      status: opts.status ?? 'HELD',
      purchasePrice: 1,
      purchaseCurrency: 'USD',
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    },
  });
}

function makeSnapshot(items: SteamInventoryItem[]): SteamInventorySnapshot {
  return {
    steamId: '76561198000000001',
    fetchedAt: new Date('2026-04-30T00:00:00.000Z'),
    totalItems: items.length,
    items,
  };
}

function makeSteamItem(overrides: Partial<SteamInventoryItem> & { steamAssetId: string; marketHashName: string }): SteamInventoryItem {
  return {
    classId: '0',
    instanceId: '0',
    marketName: overrides.marketHashName,
    iconUrl: null,
    inspectLink: null,
    tradable: true,
    marketable: true,
    rarity: null,
    exterior: null,
    type: null,
    floatValue: null,
    paintSeed: null,
    accessoryCount: 0,
    ...overrides,
  };
}
