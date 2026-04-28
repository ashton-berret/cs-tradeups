import { describe, expect, it } from 'bun:test';
import {
  marketHashNamesFromPlanSnapshot,
  uniqueMarketHashNames,
} from '$lib/server/marketPrices/watchlist';

describe('market price watchlist helpers', () => {
  it('extracts outcome market hashes from saved plan snapshots', () => {
    expect(
      marketHashNamesFromPlanSnapshot({
        outcomes: [
          { marketHashName: 'AK-47 | Slate (Field-Tested)' },
          { marketHashName: 'M4A1-S | Cyrex (Minimal Wear)' },
          { marketHashName: '' },
        ],
      }),
    ).toEqual(['AK-47 | Slate (Field-Tested)', 'M4A1-S | Cyrex (Minimal Wear)']);
  });

  it('deduplicates and sorts market hash names', () => {
    expect(uniqueMarketHashNames([' B ', 'A', 'B', ''])).toEqual(['A', 'B']);
  });
});
