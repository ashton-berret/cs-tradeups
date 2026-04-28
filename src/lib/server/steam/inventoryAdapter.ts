// Steam public inventory adapter.
//
// Fetches https://steamcommunity.com/inventory/{steamid64}/730/2 — the
// public CS2 inventory endpoint. Returns only assets the operator can act
// on (no currencies, no untradable junk filter for now).
//
// As of 2026-04, Steam ships float (`Wear Rating`) and paint seed
// (`Pattern Template`) directly in the public payload via the
// `asset_properties` top-level array. Each entry maps an `assetid` to a
// list of `{ propertyid, name, int_value | float_value | string_value }`
// records. We index those by assetid and attach floatValue + paintSeed to
// each normalized item so no third-party inspect-link resolver is needed.
//
// Limitations:
//   - Steam rate-limits unauthenticated callers aggressively. The service
//     in-memory caches per steamid for `CACHE_TTL_MS` to keep page reloads
//     cheap during a session.
//   - The endpoint paginates via `last_assetid`; we follow until
//     `more_items === 0` or the safety cap is hit.
//   - asset_accessories (stickers/charms attached to a skin) are captured
//     but not yet surfaced beyond a count — they don't affect trade-up
//     math because stickers don't transfer through contracts.

const STEAM_INVENTORY_BASE = 'https://steamcommunity.com/inventory';
const APP_ID = 730; // CS2
const CONTEXT_ID = 2;
const PAGE_SIZE = 2000; // Steam's documented max per page.
const MAX_PAGES = 10; // Safety cap — 20k items is far past any realistic CS2 inventory.
const CACHE_TTL_MS = 60_000;

export interface SteamInventoryItem {
  steamAssetId: string;
  classId: string;
  instanceId: string;
  marketHashName: string;
  marketName: string;
  iconUrl: string | null;
  inspectLink: string | null;
  tradable: boolean;
  marketable: boolean;
  rarity: string | null;
  exterior: string | null;
  type: string | null;
  /** Wear Rating from `asset_properties` (propertyid 2). null when the
   *  item type doesn't carry a float (consumer-grade pistols, agents,
   *  graffiti, music kits, etc.). */
  floatValue: number | null;
  /** Pattern Template / paint seed from `asset_properties` (propertyid 1). */
  paintSeed: number | null;
  /** Number of stickers/charms attached. 0 when none. */
  accessoryCount: number;
}

export interface SteamInventorySnapshot {
  steamId: string;
  fetchedAt: Date;
  totalItems: number;
  items: SteamInventoryItem[];
}

interface SteamAsset {
  appid: number;
  contextid: string;
  assetid: string;
  classid: string;
  instanceid: string;
  amount: string;
}

interface SteamDescriptionAction {
  link: string;
  name: string;
}

interface SteamDescriptionTag {
  category: string;
  internal_name?: string;
  localized_category_name?: string;
  localized_tag_name?: string;
  name?: string;
  category_name?: string;
}

interface SteamDescription {
  appid: number;
  classid: string;
  instanceid: string;
  name: string;
  market_hash_name: string;
  market_name: string;
  icon_url?: string;
  icon_url_large?: string;
  tradable: number;
  marketable: number;
  actions?: SteamDescriptionAction[];
  market_actions?: SteamDescriptionAction[];
  tags?: SteamDescriptionTag[];
}

interface SteamAssetProperty {
  propertyid: number;
  name?: string;
  int_value?: string;
  float_value?: string;
  string_value?: string;
}

interface SteamAssetAccessoryRelationship {
  propertyid: number;
  float_value?: string;
  int_value?: string;
}

interface SteamAssetAccessory {
  classid: string;
  parent_relationship_properties?: SteamAssetAccessoryRelationship[];
}

interface SteamAssetPropertiesEntry {
  appid: number;
  contextid: string;
  assetid: string;
  asset_properties?: SteamAssetProperty[];
  asset_accessories?: SteamAssetAccessory[];
}

interface SteamInventoryResponse {
  assets?: SteamAsset[];
  descriptions?: SteamDescription[];
  asset_properties?: SteamAssetPropertiesEntry[];
  more_items?: number;
  last_assetid?: string;
  total_inventory_count?: number;
  success?: number;
  Error?: string;
}

const cache = new Map<string, { fetchedAt: number; snapshot: SteamInventorySnapshot }>();

export class SteamInventoryError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'SteamInventoryError';
  }
}

export async function getSteamInventory(
  steamId: string,
  opts: { force?: boolean } = {},
): Promise<SteamInventorySnapshot> {
  if (!steamId) {
    throw new SteamInventoryError(400, 'STEAM_ID is not configured.');
  }

  const cached = cache.get(steamId);
  if (!opts.force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.snapshot;
  }

  const items: SteamInventoryItem[] = [];
  const descriptionIndex = new Map<string, SteamDescription>();
  const propertiesIndex = new Map<string, SteamAssetPropertiesEntry>();
  let lastAssetId: string | undefined;
  let total = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${STEAM_INVENTORY_BASE}/${steamId}/${APP_ID}/${CONTEXT_ID}`);
    url.searchParams.set('l', 'english');
    url.searchParams.set('count', String(PAGE_SIZE));
    if (lastAssetId) url.searchParams.set('start_assetid', lastAssetId);

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (response.status === 403) {
      throw new SteamInventoryError(
        403,
        'Steam refused the request. Confirm the inventory is public and STEAM_ID is correct.',
      );
    }
    if (response.status === 429) {
      throw new SteamInventoryError(
        429,
        'Steam rate-limited the request. Wait a minute and try again.',
      );
    }
    if (!response.ok) {
      throw new SteamInventoryError(response.status, `Steam returned ${response.status}.`);
    }

    const body = (await response.json()) as SteamInventoryResponse;
    if (body.success === 0 || body.Error) {
      throw new SteamInventoryError(502, body.Error ?? 'Steam responded with success=0.');
    }

    if (body.descriptions) {
      for (const description of body.descriptions) {
        descriptionIndex.set(descriptionKey(description.classid, description.instanceid), description);
      }
    }

    if (body.asset_properties) {
      for (const entry of body.asset_properties) {
        propertiesIndex.set(entry.assetid, entry);
      }
    }

    if (body.assets) {
      for (const asset of body.assets) {
        const description = descriptionIndex.get(descriptionKey(asset.classid, asset.instanceid));
        if (!description) continue;
        const properties = propertiesIndex.get(asset.assetid);
        items.push(toItem(steamId, asset, description, properties));
      }
    }

    total = body.total_inventory_count ?? items.length;

    if (!body.more_items || !body.last_assetid) break;
    lastAssetId = body.last_assetid;
  }

  const snapshot: SteamInventorySnapshot = {
    steamId,
    fetchedAt: new Date(),
    totalItems: total,
    items,
  };
  cache.set(steamId, { fetchedAt: Date.now(), snapshot });
  return snapshot;
}

function descriptionKey(classId: string, instanceId: string): string {
  return `${classId}:${instanceId}`;
}

function toItem(
  steamId: string,
  asset: SteamAsset,
  description: SteamDescription,
  properties: SteamAssetPropertiesEntry | undefined,
): SteamInventoryItem {
  const inspectAction = (description.actions ?? []).find((action) =>
    action.link?.includes('+csgo_econ_action_preview'),
  );
  const inspectLink = inspectAction
    ? inspectAction.link
        .replaceAll('%owner_steamid%', steamId)
        .replaceAll('%assetid%', asset.assetid)
    : null;

  const propertyList = properties?.asset_properties ?? [];
  const wearProperty = propertyList.find((p) => p.propertyid === 2 || p.name === 'Wear Rating');
  const seedProperty = propertyList.find((p) => p.propertyid === 1 || p.name === 'Pattern Template');
  const floatRaw = wearProperty?.float_value != null ? Number(wearProperty.float_value) : null;
  const seedRaw = seedProperty?.int_value != null ? Number(seedProperty.int_value) : null;

  return {
    steamAssetId: asset.assetid,
    classId: asset.classid,
    instanceId: asset.instanceid,
    marketHashName: description.market_hash_name,
    marketName: description.market_name,
    iconUrl: description.icon_url
      ? `https://community.cloudflare.steamstatic.com/economy/image/${description.icon_url}`
      : null,
    inspectLink,
    tradable: description.tradable === 1,
    marketable: description.marketable === 1,
    rarity: tagValue(description.tags, 'Rarity'),
    exterior: tagValue(description.tags, 'Exterior'),
    type: tagValue(description.tags, 'Type'),
    floatValue: floatRaw != null && Number.isFinite(floatRaw) ? floatRaw : null,
    paintSeed: seedRaw != null && Number.isFinite(seedRaw) ? seedRaw : null,
    accessoryCount: properties?.asset_accessories?.length ?? 0,
  };
}

function tagValue(tags: SteamDescriptionTag[] | undefined, category: string): string | null {
  if (!tags) return null;
  const tag = tags.find((t) => t.category === category);
  return tag?.localized_tag_name ?? tag?.name ?? null;
}
