import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { applyMigrations, clearOperationalTables, configureTestDatabase } from '../helpers/db';

configureTestDatabase();

const db = new PrismaClient();
mock.module('$lib/server/db/client', () => ({ db }));

const { ingestExtensionCandidate, markBought } = await import('$lib/server/candidates/candidateService');

describe('candidate ingestion integration', () => {
  beforeAll(async () => {
    await applyMigrations(db);
  });

  beforeEach(async () => {
    await clearOperationalTables(db);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it('persists catalog-linked identity from a real market hash name', async () => {
    const result = await ingestExtensionCandidate({
      marketHashName: 'AK-47 | Slate (Field-Tested)',
      listPrice: 1.25,
      currency: 'USD',
      floatValue: 0.191234,
      pattern: 321,
      inspectLink: 'steam://rungame/730/76561202255233023/+csgo_econ_action_preview%20M1A2D3',
      listingUrl: 'https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Slate%20%28Field-Tested%29',
      listingId: 'listing-slate-1',
    });

    expect(result.wasDuplicate).toBe(false);
    expect(result.candidate).toMatchObject({
      marketHashName: 'AK-47 | Slate (Field-Tested)',
      weaponName: 'AK-47',
      skinName: 'Slate',
      collection: 'The Snakebite Collection',
      rarity: 'MIL_SPEC',
      exterior: 'FIELD_TESTED',
      floatValue: 0.191234,
      pattern: 321,
      listingId: 'listing-slate-1',
      source: 'EXTENSION',
    });
    expect(result.candidate.catalogSkinId).toBeTruthy();
    expect(result.candidate.catalogCollectionId).toBeTruthy();
    expect(result.candidate.catalogWeaponDefIndex).toBe(7);
    expect(result.candidate.catalogPaintIndex).toBeGreaterThan(0);
    expect(result.candidate.inspectLink).toContain('csgo_econ_action_preview');
  });

  it('normalizes StatTrak names while preserving the source market hash name', async () => {
    const result = await ingestExtensionCandidate({
      marketHashName: 'StatTrak™ AK-47 | Uncharted (Field-Tested)',
      listPrice: 4.5,
      currency: 'USD',
      floatValue: 0.21,
      listingId: 'listing-stattrak-1',
    });

    expect(result.candidate.marketHashName).toBe('StatTrak™ AK-47 | Uncharted (Field-Tested)');
    expect(result.candidate.weaponName).toBe('AK-47');
    expect(result.candidate.skinName).toBe('Uncharted');
    expect(result.candidate.exterior).toBe('FIELD_TESTED');
    expect(result.candidate.catalogSkinId).toBeTruthy();
  });

  it('merges duplicate listing ids instead of creating a second candidate', async () => {
    const first = await ingestExtensionCandidate({
      marketHashName: 'AK-47 | Slate (Field-Tested)',
      listPrice: 1.25,
      currency: 'USD',
      floatValue: 0.191234,
      listingId: 'listing-duplicate-1',
    });
    const second = await ingestExtensionCandidate({
      marketHashName: 'AK-47 | Slate (Field-Tested)',
      listPrice: 1.35,
      currency: 'USD',
      floatValue: 0.191234,
      inspectLink: 'steam://rungame/730/76561202255233023/+csgo_econ_action_preview%20M4A5D6',
      listingId: 'listing-duplicate-1',
    });
    const count = await db.candidateListing.count();

    expect(second.wasDuplicate).toBe(true);
    expect(second.duplicate?.reason).toBe('LISTING_ID');
    expect(second.candidate.id).toBe(first.candidate.id);
    expect(second.candidate.timesSeen).toBe(2);
    expect(second.candidate.mergeCount).toBe(1);
    expect(second.candidate.inspectLink).toContain('csgo_econ_action_preview');
    expect(count).toBe(1);
  });

  it('drops placeholder zero float values for non-factory-new extension rows', async () => {
    const result = await ingestExtensionCandidate({
      marketHashName: 'AK-47 | Slate (Field-Tested)',
      listPrice: 1.25,
      currency: 'USD',
      floatValue: 0,
      listingId: 'listing-missing-float-1',
    });

    expect(result.candidate.floatValue).toBeNull();
    expect(result.candidate.exterior).toBe('FIELD_TESTED');
    expect(result.warnings).toContainEqual({
      field: 'floatValue',
      reason: 'Dropped placeholder zero float because exterior FIELD_TESTED is not FACTORY_NEW',
    });
  });

  it('carries candidate catalog identity into inventory when marked bought', async () => {
    const ingested = await ingestExtensionCandidate({
      marketHashName: 'AK-47 | Slate (Field-Tested)',
      listPrice: 1.25,
      currency: 'USD',
      floatValue: 0.191234,
      listingId: 'listing-buy-1',
    });

    const result = await markBought(ingested.candidate.id, {
      purchasePrice: 1.25,
      purchaseFees: 0.08,
    });

    expect(result.candidate.status).toBe('BOUGHT');
    expect(result.inventoryItem).toMatchObject({
      candidateId: ingested.candidate.id,
      marketHashName: 'AK-47 | Slate (Field-Tested)',
      weaponName: 'AK-47',
      skinName: 'Slate',
      collection: 'The Snakebite Collection',
      catalogSkinId: ingested.candidate.catalogSkinId,
      catalogCollectionId: ingested.candidate.catalogCollectionId,
      catalogWeaponDefIndex: ingested.candidate.catalogWeaponDefIndex,
      catalogPaintIndex: ingested.candidate.catalogPaintIndex,
      rarity: 'MIL_SPEC',
      exterior: 'FIELD_TESTED',
      floatValue: 0.191234,
    });
  });
});
