import { describe, expect, it } from 'bun:test';
import {
  marketPriceBasisForSource,
  netSaleValueForObservedPrice,
  steamGrossToNetSaleValue,
} from '$lib/server/marketPrices/fees';

describe('market price fee helpers', () => {
  it('converts Steam buyer price to approximate seller net proceeds', () => {
    expect(steamGrossToNetSaleValue(11.5)).toBe(10);
  });

  it('marks Steam observations as net sale value', () => {
    expect(netSaleValueForObservedPrice({ marketValue: 11.5, source: 'STEAM_PRICEOVERVIEW' })).toEqual({
      value: 10,
      basis: 'STEAM_NET',
    });
  });

  it('keeps non-Steam observations as references or manual estimates', () => {
    expect(marketPriceBasisForSource('SKINPORT')).toBe('THIRD_PARTY_REFERENCE');
    expect(netSaleValueForObservedPrice({ marketValue: 9, source: 'LOCAL_IMPORT' })).toEqual({
      value: 9,
      basis: 'MANUAL_ESTIMATE',
    });
  });
});
