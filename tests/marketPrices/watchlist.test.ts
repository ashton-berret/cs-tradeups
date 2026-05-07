import { describe, expect, it } from 'bun:test';
import type { CatalogSkin } from '$lib/schemas/catalog';
import {
  marketHashNameForComboOutput,
  marketHashNamesForComboOutputSkin,
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

  it('resolves engine combo outputs to normal and StatTrak market hashes', () => {
    const skin = catalogSkin();

    expect(marketHashNameForComboOutput(skin, 'FIELD_TESTED', false)).toBe(
      'AK-47 | Slate (Field-Tested)',
    );
    expect(marketHashNameForComboOutput(skin, 'FIELD_TESTED', true)).toBe(
      'StatTrak™ AK-47 | Slate (Field-Tested)',
    );
    expect(marketHashNameForComboOutput(skin, 'BATTLE_SCARRED', false)).toBeNull();
  });

  it('expands engine combo output skins across supported exterior market hashes', () => {
    expect(marketHashNamesForComboOutputSkin(catalogSkin(), true)).toEqual([
      'StatTrak™ AK-47 | Slate (Field-Tested)',
    ]);
  });
});

function catalogSkin(): CatalogSkin {
  return {
    id: 'skin-ak47-slate',
    defIndex: 7,
    paintIndex: 1035,
    weaponKey: 'weapon_ak47',
    weaponName: 'AK-47',
    skinName: 'Slate',
    baseMarketHashName: 'AK-47 | Slate',
    collectionId: 'set_community_8',
    collectionName: 'The Snakebite Collection',
    rarity: 'RESTRICTED',
    minFloat: 0,
    maxFloat: 1,
    exteriors: ['FIELD_TESTED'],
    marketHashNames: [
      {
        exterior: 'FIELD_TESTED',
        marketHashName: 'AK-47 | Slate (Field-Tested)',
      },
    ],
    source: {
      primarySource: 'LOCAL_CS2_VPK',
      details: ['test'],
    },
  };
}
