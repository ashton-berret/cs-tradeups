// Inventory ↔ Steam linking.
//
// Pulls the live public inventory snapshot and reconciles it with the
// operator's tracked InventoryItem rows. As of Steam's 2026-04 inventory
// payload change, `asset_properties` carries float and pattern data, so
// matching can use both market hash name AND float when both sides have
// one.
//
// Match strategy (per Steam asset, in order):
//   1. Already linked? Skip.
//   2. Unlinked local row with same marketHashName AND floatValue within
//      `FLOAT_EPSILON` (1e-6) of the Steam float — strongest match.
//   3. Unlinked local row with same marketHashName and a null floatValue
//      (operator never recorded one) — second-strongest. Backfills the
//      float from Steam onto the local row.
//   4. Unlinked local row with same marketHashName and a non-matching
//      floatValue — last resort, picked by FIFO. Logged but accepted; the
//      operator can correct later.
//
// Already-linked rows whose Steam asset is missing from the snapshot are
// reported so the operator can mark them sold/removed manually — we do NOT
// auto-clear the link (Steam's JSON occasionally drops items during trade
// locks).

import { db } from '$lib/server/db/client';
import { env } from '$env/dynamic/private';
import { getSteamInventory, type SteamInventoryItem } from '$lib/server/steam/inventoryAdapter';
import { ValidationError } from '$lib/server/http/errors';
import { normalizeMarketHashLookup } from '$lib/server/utils/marketHash';

export interface SteamLinkSummary {
  steamId: string;
  fetchedAt: Date;
  totalSteamItems: number;
  linked: Array<{
    inventoryItemId: string;
    steamAssetId: string;
    marketHashName: string;
    /** How the match was decided. */
    matchStrategy: 'FLOAT_EXACT' | 'FLOAT_BACKFILL' | 'FIFO_FALLBACK';
    /** True when the local row had no floatValue and we copied the Steam
     *  one onto it. */
    floatBackfilled: boolean;
  }>;
  alreadyLinked: number;
  unlinkedSteamItems: SteamInventoryItem[];
  missingFromSteam: Array<{ inventoryItemId: string; steamAssetId: string; marketHashName: string }>;
  /**
   * Local rows that were eligible for linking (HELD or RESERVED, not yet
   * linked) but whose marketHashName never matched any Steam asset name.
   * Surfaced so the UI can explain "0 linked" outcomes — almost always a
   * symptom of name drift (StatTrak ™, whitespace, casing) between manually
   * entered local rows and Steam's canonical names.
   */
  unmatchedLocalRows: Array<{ inventoryItemId: string; marketHashName: string }>;
}

const LINKABLE_STATUSES = ['HELD', 'RESERVED_FOR_BASKET'] as const;
const FLOAT_EPSILON = 1e-6;

export async function syncInventoryWithSteam(opts: { force?: boolean } = {}): Promise<SteamLinkSummary> {
  const steamId = env.STEAM_ID?.trim();
  if (!steamId) {
    throw new ValidationError('STEAM_ID is not configured.');
  }

  const snapshot = await getSteamInventory(steamId, { force: opts.force });

  const localRows = await db.inventoryItem.findMany({
    select: {
      id: true,
      marketHashName: true,
      status: true,
      steamAssetId: true,
      floatValue: true,
      pattern: true,
      createdAt: true,
    },
  });

  // Index unlinked, linkable rows by *normalized* marketHashName so casing,
  // whitespace, and unicode-NFC drift between manually entered local rows and
  // Steam's canonical names cannot silently suppress matches.
  const unlinkedByName = new Map<string, typeof localRows>();
  const linkedAssetIds = new Set<string>();
  for (const row of localRows) {
    if (row.steamAssetId) {
      linkedAssetIds.add(row.steamAssetId);
      continue;
    }
    if (!LINKABLE_STATUSES.includes(row.status as (typeof LINKABLE_STATUSES)[number])) continue;
    const key = normalizeMarketHashLookup(row.marketHashName);
    const bucket = unlinkedByName.get(key) ?? [];
    bucket.push(row);
    unlinkedByName.set(key, bucket);
  }
  for (const bucket of unlinkedByName.values()) {
    bucket.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  const linked: SteamLinkSummary['linked'] = [];
  const unlinkedSteamItems: SteamInventoryItem[] = [];
  const seenAssetIds = new Set<string>();
  // Track per-row updates so we can apply float/pattern backfills in one
  // transaction at the end.
  const updates = new Map<
    string,
    { steamAssetId: string; floatValue?: number; pattern?: number }
  >();

  for (const steamItem of snapshot.items) {
    seenAssetIds.add(steamItem.steamAssetId);
    if (linkedAssetIds.has(steamItem.steamAssetId)) continue;
    const bucket = unlinkedByName.get(normalizeMarketHashLookup(steamItem.marketHashName));
    if (!bucket || bucket.length === 0) {
      unlinkedSteamItems.push(steamItem);
      continue;
    }

    let chosenIndex = -1;
    let strategy: 'FLOAT_EXACT' | 'FLOAT_BACKFILL' | 'FIFO_FALLBACK' = 'FIFO_FALLBACK';

    if (steamItem.floatValue != null) {
      // 1) exact-float match against a row that has the same float.
      chosenIndex = bucket.findIndex(
        (row) => row.floatValue != null && Math.abs(row.floatValue - steamItem.floatValue!) < FLOAT_EPSILON,
      );
      if (chosenIndex >= 0) {
        strategy = 'FLOAT_EXACT';
      } else {
        // 2) row with no float yet — best home for a Steam item that does
        //    have one. Backfill the float onto the local row.
        chosenIndex = bucket.findIndex((row) => row.floatValue == null);
        if (chosenIndex >= 0) {
          strategy = 'FLOAT_BACKFILL';
        }
      }
    }

    // 3) FIFO fallback: pick the oldest unmatched row.
    if (chosenIndex < 0) {
      chosenIndex = 0;
      strategy = 'FIFO_FALLBACK';
    }

    const candidate = bucket.splice(chosenIndex, 1)[0];
    const update: { steamAssetId: string; floatValue?: number; pattern?: number } = {
      steamAssetId: steamItem.steamAssetId,
    };
    if (strategy === 'FLOAT_BACKFILL' && steamItem.floatValue != null) {
      update.floatValue = steamItem.floatValue;
    }
    if (steamItem.paintSeed != null && candidate.pattern == null) {
      update.pattern = steamItem.paintSeed;
    }
    updates.set(candidate.id, update);

    linked.push({
      inventoryItemId: candidate.id,
      steamAssetId: steamItem.steamAssetId,
      marketHashName: steamItem.marketHashName,
      matchStrategy: strategy,
      floatBackfilled: strategy === 'FLOAT_BACKFILL',
    });
  }

  // Surface already-linked rows whose Steam asset disappeared.
  const missingFromSteam: SteamLinkSummary['missingFromSteam'] = [];
  for (const row of localRows) {
    if (!row.steamAssetId) continue;
    if (seenAssetIds.has(row.steamAssetId)) continue;
    missingFromSteam.push({
      inventoryItemId: row.id,
      steamAssetId: row.steamAssetId,
      marketHashName: row.marketHashName,
    });
  }

  // Anything left in the buckets is a linkable local row whose marketHashName
  // never matched any Steam asset — surface so the UI can explain "0 linked"
  // outcomes instead of silently dropping the rows.
  const unmatchedLocalRows: SteamLinkSummary['unmatchedLocalRows'] = [];
  for (const bucket of unlinkedByName.values()) {
    for (const row of bucket) {
      unmatchedLocalRows.push({
        inventoryItemId: row.id,
        marketHashName: row.marketHashName,
      });
    }
  }

  if (updates.size > 0) {
    await db.$transaction(
      Array.from(updates.entries()).map(([inventoryItemId, update]) =>
        db.inventoryItem.update({
          where: { id: inventoryItemId },
          data: update,
        }),
      ),
    );
  }

  return {
    steamId,
    fetchedAt: snapshot.fetchedAt,
    totalSteamItems: snapshot.totalItems,
    linked,
    alreadyLinked: linkedAssetIds.size,
    unlinkedSteamItems,
    missingFromSteam,
    unmatchedLocalRows,
  };
}
