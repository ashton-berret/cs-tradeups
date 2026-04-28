import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { applyMigrations, clearOperationalTables, configureTestDatabase } from '../helpers/db';

configureTestDatabase();

const db = new PrismaClient();
mock.module('$lib/server/db/client', () => ({ db }));

const { getCatalogSnapshot } = await import('$lib/server/catalog/catalogService');
const { buildDiscoveryTargets } = await import('$lib/server/discovery/watchlistService');

describe('discovery watchlist targets', () => {
  beforeAll(async () => {
    await applyMigrations(db);
  });

  beforeEach(async () => {
    await clearOperationalTables(db);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it('derives Steam listing targets from active catalog-linked plan rules', async () => {
    const snapshot = await getCatalogSnapshot();
    const skin = snapshot.skins.find((entry) => entry.rarity === 'MIL_SPEC' && entry.marketHashNames.length > 0);
    if (!skin) throw new Error('Catalog fixture has no MIL_SPEC skin');
    const hash = skin.marketHashNames[0];

    await db.tradeupPlan.create({
      data: {
        id: 'plan-discovery',
        name: 'Discovery Plan',
        inputRarity: 'MIL_SPEC',
        targetRarity: 'RESTRICTED',
        isActive: true,
      },
    });
    await db.tradeupPlanRule.create({
      data: {
        id: 'rule-discovery',
        planId: 'plan-discovery',
        catalogCollectionId: skin.collectionId,
        collection: skin.collectionName,
        rarity: 'MIL_SPEC',
        exterior: hash.exterior,
        minFloat: skin.minFloat,
        maxFloat: skin.maxFloat,
        maxBuyPrice: 2.5,
        priority: 3,
        isPreferred: true,
      },
    });

    const result = await buildDiscoveryTargets();
    const target = result.targets.find((entry) => entry.marketHashName === hash.marketHashName);

    expect(target).toBeTruthy();
    expect(target?.listingUrl).toContain(encodeURIComponent(hash.marketHashName));
    expect(target?.constraints).toHaveLength(1);
    expect(target?.constraints[0]).toMatchObject({
      planId: 'plan-discovery',
      ruleId: 'rule-discovery',
      maxBuyPrice: 2.5,
      exterior: hash.exterior,
    });
  });

  it('deduplicates market hash pages while preserving multiple constraints', async () => {
    const snapshot = await getCatalogSnapshot();
    const skin = snapshot.skins.find((entry) => entry.rarity === 'MIL_SPEC' && entry.marketHashNames.length > 0);
    if (!skin) throw new Error('Catalog fixture has no MIL_SPEC skin');
    const hash = skin.marketHashNames[0];

    await db.tradeupPlan.create({
      data: {
        id: 'plan-dedupe',
        name: 'Dedupe Plan',
        inputRarity: 'MIL_SPEC',
        targetRarity: 'RESTRICTED',
        isActive: true,
      },
    });
    for (const id of ['rule-a', 'rule-b']) {
      await db.tradeupPlanRule.create({
        data: {
          id,
          planId: 'plan-dedupe',
          catalogCollectionId: skin.collectionId,
          collection: skin.collectionName,
          rarity: 'MIL_SPEC',
          exterior: hash.exterior,
          minFloat: skin.minFloat,
          maxFloat: skin.maxFloat,
          maxBuyPrice: id === 'rule-a' ? 2 : 3,
        },
      });
    }

    const result = await buildDiscoveryTargets();
    const matchingTargets = result.targets.filter((entry) => entry.marketHashName === hash.marketHashName);

    expect(matchingTargets).toHaveLength(1);
    expect(matchingTargets[0].constraints.map((constraint) => constraint.ruleId).sort()).toEqual([
      'rule-a',
      'rule-b',
    ]);
  });
});
