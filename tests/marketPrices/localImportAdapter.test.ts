import { describe, expect, it } from 'bun:test';
import {
  parseCsvMarketPriceImport,
  parseJsonMarketPriceImport,
} from '$lib/server/marketPrices/localImportAdapter';

describe('local market price import adapter', () => {
  it('normalizes JSON import payloads', () => {
    const result = parseJsonMarketPriceImport({
      source: 'LOCAL_JSON',
      observations: [
        {
          marketHashName: 'AK-47 | Slate (Field-Tested)',
          currency: 'usd',
          lowestSellPrice: 1.25,
          observedAt: '2026-04-24T18:00:00.000Z',
        },
      ],
    });

    expect(result).toMatchObject({
      ok: true,
      input: {
        source: 'LOCAL_JSON',
        observations: [
          {
            marketHashName: 'AK-47 | Slate (Field-Tested)',
            currency: 'usd',
            lowestSellPrice: 1.25,
            observedAt: new Date('2026-04-24T18:00:00.000Z'),
          },
        ],
      },
    });
  });

  it('normalizes CSV rows into import input', () => {
    const result = parseCsvMarketPriceImport(
      [
        'marketHashName,currency,lowestSellPrice,medianSellPrice,volume,observedAt,rawPayload',
        'AK-47 | Slate (Field-Tested),USD,1.25,1.40,120,2026-04-24T18:00:00.000Z,"{""sourceRow"":1}"',
      ].join('\n'),
      'CSV_SOURCE',
    );

    expect(result).toMatchObject({
      ok: true,
      input: {
        source: 'CSV_SOURCE',
        observations: [
          {
            marketHashName: 'AK-47 | Slate (Field-Tested)',
            currency: 'USD',
            lowestSellPrice: 1.25,
            medianSellPrice: 1.4,
            volume: 120,
            observedAt: new Date('2026-04-24T18:00:00.000Z'),
            rawPayload: { sourceRow: 1 },
          },
        ],
      },
    });
  });

  it('returns per-row CSV validation errors', () => {
    const result = parseCsvMarketPriceImport(
      [
        'marketHashName,currency,lowestSellPrice,medianSellPrice,volume,observedAt',
        'AK-47 | Slate (Field-Tested),USD,,,,2026-04-24T18:00:00.000Z',
      ].join('\n'),
    );

    expect(result).toEqual({
      ok: false,
      message: 'CSV import has 1 row error.',
      rowErrors: [
        {
          rowNumber: 2,
          field: 'lowestSellPrice',
          message: 'At least one price field is required',
        },
      ],
    });
  });
});
