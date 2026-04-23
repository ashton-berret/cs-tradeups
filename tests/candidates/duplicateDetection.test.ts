import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { CandidateListing } from '@prisma/client';
import { FLOAT_EPSILON } from '$lib/server/utils/float';
import { toNumber } from '$lib/server/utils/decimal';
import { candidateInput, candidateRow, decimal } from '../helpers/factories';

let rows: CandidateListing[] = [];

mock.module('$lib/server/db/client', () => ({
  db: {
    candidateListing: {
      findFirst: async (args: { where?: { listingId?: string } }) =>
        rows.find((row) => row.listingId && row.listingId === args.where?.listingId) ?? null,
      findMany: async (args: {
        where?: {
          listingUrl?: { not: null };
          marketHashName?: string;
          listPrice?: { gte?: unknown; lte?: unknown };
        };
      }) => {
        if (args.where?.listingUrl) {
          return rows.filter((row) => row.listingUrl != null);
        }

        const minPrice =
          toNumber(args.where?.listPrice?.gte as Parameters<typeof toNumber>[0]) ?? Number.NEGATIVE_INFINITY;
        const maxPrice =
          toNumber(args.where?.listPrice?.lte as Parameters<typeof toNumber>[0]) ?? Number.POSITIVE_INFINITY;

        return rows.filter((row) => {
          const price = toNumber(row.listPrice) ?? 0;
          return row.marketHashName === args.where?.marketHashName && price >= minPrice && price <= maxPrice;
        });
      },
    },
  },
}));

const { findDuplicateCandidate } = await import('$lib/server/candidates/duplicateDetection');

describe('duplicate detection', () => {
  beforeEach(() => {
    rows = [];
  });

  it('matches listingId exactly regardless of price drift', async () => {
    rows = [candidateRow({ id: 'existing', listingId: 'listing-1', listPrice: decimal(10) })];

    const duplicate = await findDuplicateCandidate(candidateInput({ listingId: 'listing-1', listPrice: 99 }));

    expect(duplicate?.id).toBe('existing');
  });

  it('normalizes listingUrl before matching', async () => {
    rows = [
      candidateRow({
        id: 'url-match',
        listingUrl: 'https://example.com/listings/input-skin?filter=abc#fragment',
      }),
    ];

    const duplicate = await findDuplicateCandidate(
      candidateInput({ listingUrl: 'https://example.com/listings/input-skin?query=123' }),
    );

    expect(duplicate?.id).toBe('url-match');
  });

  it('does not treat steam market page URLs as authoritative duplicates', async () => {
    rows = [
      candidateRow({
        id: 'steam-page-match-should-not-happen',
        listingUrl: 'https://steamcommunity.com/market/listings/730/Input%20Skin',
      }),
    ];

    const duplicate = await findDuplicateCandidate(
      candidateInput({
        listingUrl: 'https://steamcommunity.com/market/listings/730/Input%20Skin',
        listingId: 'different-listing-id',
        listPrice: 14,
      }),
    );

    expect(duplicate).toBeNull();
  });

  it('matches price drift inside relative tolerance and rejects outside tolerance', async () => {
    rows = [candidateRow({ id: 'near-price', listPrice: decimal(100.5), floatValue: 0.1 })];

    await expect(findDuplicateCandidate(candidateInput({ listPrice: 100, floatValue: 0.1 }))).resolves.toMatchObject({
      id: 'near-price',
    });

    rows = [candidateRow({ id: 'far-price', listPrice: decimal(102), floatValue: 0.1 })];

    await expect(findDuplicateCandidate(candidateInput({ listPrice: 100, floatValue: 0.1 }))).resolves.toBeNull();
  });

  it('matches floats inside FLOAT_EPSILON and rejects floats outside it', async () => {
    rows = [candidateRow({ id: 'near-float', listPrice: decimal(10), floatValue: 0.1 + FLOAT_EPSILON / 2 })];

    await expect(findDuplicateCandidate(candidateInput({ listPrice: 10, floatValue: 0.1 }))).resolves.toMatchObject({
      id: 'near-float',
    });

    rows = [candidateRow({ id: 'far-float', listPrice: decimal(10), floatValue: 0.1 + FLOAT_EPSILON * 2 })];

    await expect(findDuplicateCandidate(candidateInput({ listPrice: 10, floatValue: 0.1 }))).resolves.toBeNull();
  });
});
