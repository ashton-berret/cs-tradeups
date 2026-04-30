import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { applyMigrations, clearOperationalTables, configureTestDatabase } from '../helpers/db';

configureTestDatabase();

const db = new PrismaClient();
mock.module('$lib/server/db/client', () => ({ db }));

const { ingestExtensionCandidate, markBought } = await import('$lib/server/candidates/candidateService');
const {
  createMarketPriceObservation,
  getLatestMarketPriceForCatalogExterior,
  getLatestMarketPriceForMarketHashName,
  importMarketPriceObservations,
  listLatestMarketPriceObservations,
} = await import('$lib/server/marketPrices/priceService');
const { POST: importMarketPrices } = await import('../../src/routes/api/market-prices/import/+server');

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
      // Catalog rarity now sourced from `client_loot_lists` per-skin buckets;
      // AK-47 | Slate is RESTRICTED in The Snakebite Collection.
      rarity: 'RESTRICTED',
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
      rarity: 'RESTRICTED',
      exterior: 'FIELD_TESTED',
      floatValue: 0.191234,
    });
  });

  it('stores latest market price observations with catalog identity', async () => {
    await createMarketPriceObservation({
      marketHashName: 'AK-47 | Slate (Field-Tested)',
      currency: 'usd',
      lowestSellPrice: 1.25,
      medianSellPrice: 1.4,
      volume: 120,
      source: 'TEST_IMPORT',
      observedAt: new Date('2026-04-24T12:00:00Z'),
    });
    const later = await createMarketPriceObservation({
      marketHashName: 'AK-47 | Slate (Field-Tested)',
      currency: 'USD',
      lowestSellPrice: 1.35,
      medianSellPrice: 1.5,
      volume: 140,
      source: 'TEST_IMPORT',
      observedAt: new Date('2026-04-24T13:00:00Z'),
    });

    const latestByHash = await getLatestMarketPriceForMarketHashName(
      'AK-47 | Slate (Field-Tested)',
      'USD',
    );
    const latestByCatalogExterior = await getLatestMarketPriceForCatalogExterior({
      catalogSkinId: later.catalogSkinId ?? '',
      exterior: 'FIELD_TESTED',
      currency: 'USD',
    });

    expect(latestByHash).toMatchObject({
      id: later.id,
      marketValue: 1.35,
      currency: 'USD',
      volume: 140,
      catalogSkinId: later.catalogSkinId,
      exterior: 'FIELD_TESTED',
    });
    expect(latestByCatalogExterior?.id).toBe(later.id);
  });

  it('imports a local batch of market price observations', async () => {
    const result = await importMarketPriceObservations({
      source: 'LOCAL_JSON_TEST',
      observations: [
        {
          marketHashName: 'AK-47 | Slate (Field-Tested)',
          currency: 'USD',
          lowestSellPrice: 1.25,
          volume: 10,
          observedAt: new Date('2026-04-24T14:00:00Z'),
        },
        {
          marketHashName: 'StatTrak™ AK-47 | Uncharted (Field-Tested)',
          currency: 'USD',
          medianSellPrice: 4.2,
          volume: 3,
          observedAt: new Date('2026-04-24T14:05:00Z'),
        },
      ],
    });

    expect(result.count).toBe(2);
    expect(result.observations.map((observation) => observation.source)).toEqual([
      'LOCAL_JSON_TEST',
      'LOCAL_JSON_TEST',
    ]);
    expect(result.observations.every((observation) => observation.catalogSkinId != null)).toBe(true);
  });

  it('lists market price observations with operator filters', async () => {
    await importMarketPriceObservations({
      source: 'LOCAL_JSON_TEST',
      observations: [
        {
          marketHashName: 'AK-47 | Slate (Field-Tested)',
          currency: 'USD',
          lowestSellPrice: 1.25,
          observedAt: new Date('2026-04-24T14:00:00Z'),
        },
        {
          marketHashName: 'StatTrak™ AK-47 | Uncharted (Field-Tested)',
          currency: 'EUR',
          medianSellPrice: 4.2,
          observedAt: new Date('2026-04-24T14:05:00Z'),
        },
      ],
    });

    const page = await listLatestMarketPriceObservations({
      search: 'Slate',
      source: 'LOCAL_JSON_TEST',
      currency: 'usd',
      latestOnly: true,
      sortBy: 'observedAt',
      sortDir: 'desc',
      page: 1,
      limit: 25,
    });

    expect(page.total).toBe(1);
    expect(page.data[0]).toMatchObject({
      marketHashName: 'AK-47 | Slate (Field-Tested)',
      currency: 'USD',
      source: 'LOCAL_JSON_TEST',
      marketValue: 1.25,
    });
  });

  it('sorts market price observations by market value', async () => {
    await importMarketPriceObservations({
      source: 'LOCAL_JSON_TEST',
      observations: [
        {
          marketHashName: 'AK-47 | Slate (Field-Tested)',
          currency: 'USD',
          lowestSellPrice: 1.25,
          observedAt: new Date('2026-04-24T14:00:00Z'),
        },
        {
          marketHashName: 'StatTrak™ AK-47 | Uncharted (Field-Tested)',
          currency: 'USD',
          medianSellPrice: 4.2,
          observedAt: new Date('2026-04-24T14:05:00Z'),
        },
      ],
    });

    const page = await listLatestMarketPriceObservations({
      source: 'LOCAL_JSON_TEST',
      currency: 'usd',
      latestOnly: true,
      sortBy: 'marketValue',
      sortDir: 'desc',
      page: 1,
      limit: 25,
    });

    expect(page.data.map((row) => row.marketValue)).toEqual([4.2, 1.25]);
  });

  it('can list only the latest market price observation per item', async () => {
    await importMarketPriceObservations({
      source: 'LOCAL_JSON_TEST',
      observations: [
        {
          marketHashName: 'AK-47 | Slate (Field-Tested)',
          currency: 'USD',
          lowestSellPrice: 1.25,
          observedAt: new Date('2026-04-24T14:00:00Z'),
        },
        {
          marketHashName: 'AK-47 | Slate (Field-Tested)',
          currency: 'USD',
          lowestSellPrice: 1.5,
          observedAt: new Date('2026-04-24T15:00:00Z'),
        },
      ],
    });

    const latest = await listLatestMarketPriceObservations({
      source: 'LOCAL_JSON_TEST',
      currency: 'usd',
      latestOnly: true,
      sortBy: 'observedAt',
      sortDir: 'desc',
      page: 1,
      limit: 25,
    });
    const history = await listLatestMarketPriceObservations({
      source: 'LOCAL_JSON_TEST',
      currency: 'usd',
      latestOnly: false,
      sortBy: 'observedAt',
      sortDir: 'desc',
      page: 1,
      limit: 25,
    });

    expect(latest.data.map((row) => row.marketValue)).toEqual([1.5]);
    expect(history.data.map((row) => row.marketValue)).toEqual([1.5, 1.25]);
  });

  it('imports market price observations from CSV', async () => {
    const response = await importMarketPrices({
      request: new Request('http://localhost/api/market-prices/import?source=CSV_TEST', {
        method: 'POST',
        headers: { 'content-type': 'text/csv' },
        body: [
          'marketHashName,currency,lowestSellPrice,medianSellPrice,volume,observedAt',
          'AK-47 | Slate (Field-Tested),USD,1.25,1.40,120,2026-04-24T18:00:00.000Z',
        ].join('\n'),
      }),
    } as never);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.count).toBe(1);
    expect(body.observations[0]).toMatchObject({
      marketHashName: 'AK-47 | Slate (Field-Tested)',
      currency: 'USD',
      source: 'CSV_TEST',
      marketValue: 1.25,
      volume: 120,
    });
    expect(body.refresh).toEqual({
      candidatesReevaluated: 0,
      basketsRecomputed: 0,
      basketErrors: [],
    });
  });

  it('returns per-row CSV validation errors without importing partial rows', async () => {
    const response = await importMarketPrices({
      request: new Request('http://localhost/api/market-prices/import?source=CSV_TEST', {
        method: 'POST',
        headers: { 'content-type': 'text/csv' },
        body: [
          'marketHashName,currency,lowestSellPrice,medianSellPrice,volume,observedAt',
          'AK-47 | Slate (Field-Tested),USD,1.25,,10,2026-04-24T18:00:00.000Z',
          'StatTrak™ AK-47 | Uncharted (Field-Tested),USD,,,,2026-04-24T18:05:00.000Z',
        ].join('\n'),
      }),
    } as never);
    const body = await response.json();
    const count = await db.marketPriceObservation.count();

    expect(response.status).toBe(400);
    expect(body.rowErrors).toEqual([
      {
        rowNumber: 3,
        field: 'lowestSellPrice',
        message: 'At least one price field is required',
      },
    ]);
    expect(count).toBe(0);
  });
});
