import { describe, expect, it } from 'bun:test';
import {
  fetchSteamPriceoverview,
  parseSteamMoney,
  parseSteamVolume,
  STEAM_PRICEOVERVIEW_SOURCE,
} from '$lib/server/marketPrices/adapters/steamPriceoverview';

describe('Steam priceoverview adapter', () => {
  it('parses Steam money and volume strings', () => {
    expect(parseSteamMoney('$1.23 USD')).toBe(1.23);
    expect(parseSteamMoney('$1,234.56')).toBe(1234.56);
    expect(parseSteamVolume('1,234')).toBe(1234);
  });

  it('normalizes successful priceoverview responses', async () => {
    const observation = await fetchSteamPriceoverview('AK-47 | Slate (Field-Tested)', {
      delayMs: 0,
      fetchImpl: async (url) => {
        expect(String(url)).toContain('market_hash_name=AK-47+%7C+Slate+%28Field-Tested%29');
        return new Response(
          JSON.stringify({
            success: true,
            lowest_price: '$1.25',
            median_price: '$1.40',
            volume: '1,234',
          }),
        );
      },
    });

    expect(observation).toMatchObject({
      marketHashName: 'AK-47 | Slate (Field-Tested)',
      currency: 'USD',
      lowestSellPrice: 1.25,
      medianSellPrice: 1.4,
      volume: 1234,
      source: STEAM_PRICEOVERVIEW_SOURCE,
    });
  });

  it('returns null when Steam has no price fields', async () => {
    const observation = await fetchSteamPriceoverview('Missing Item', {
      delayMs: 0,
      fetchImpl: async () => new Response(JSON.stringify({ success: true })),
    });

    expect(observation).toBeNull();
  });
});
