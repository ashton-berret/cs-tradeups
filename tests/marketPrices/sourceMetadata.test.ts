import { describe, expect, it } from 'bun:test';
import { describeMarketPriceSource } from '$lib/server/marketPrices/sourceMetadata';

describe('market price source metadata', () => {
  it('classifies local CSV imports', () => {
    expect(describeMarketPriceSource('LOCAL_CSV_IMPORT')).toEqual({
      sourceType: 'CSV_IMPORT',
      sourceLabel: 'CSV import',
    });
  });

  it('classifies local JSON imports', () => {
    expect(describeMarketPriceSource('LOCAL_JSON_TEST')).toEqual({
      sourceType: 'JSON_IMPORT',
      sourceLabel: 'JSON import',
    });
  });

  it('classifies manual sources', () => {
    expect(describeMarketPriceSource('MANUAL_STEAM_PRICE')).toEqual({
      sourceType: 'MANUAL',
      sourceLabel: 'Manual',
    });
  });
});
