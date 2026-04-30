import type { CatalogCollection, CatalogSkin, CatalogSnapshot } from '$lib/schemas/catalog';
import { getCatalogSnapshot } from '$lib/server/catalog/catalogService';
import { exteriorForFloat } from '$lib/server/utils/float';
import {
	exteriorFromLabel,
	normalizeMarketHashLookup,
	normalizeWeaponName,
	parseMarketHashName,
} from '$lib/server/utils/marketHash';
import type { ItemExterior, ItemRarity } from '$lib/types/enums';

export interface CatalogIdentityInput {
	marketHashName: string;
	weaponName?: string | null;
	skinName?: string | null;
	collection?: string | null;
	rarity?: ItemRarity | null;
	exterior?: ItemExterior | null;
	floatValue?: number | null;
}

export interface CatalogIdentityMatch {
	catalogSkinId: string;
	catalogCollectionId: string;
	catalogWeaponDefIndex: number;
	catalogPaintIndex: number;
	weaponName: string;
	skinName: string;
	collection: string;
	rarity: ItemRarity | null;
	exterior: ItemExterior | null;
}

export interface CatalogCollectionMatch {
	catalogCollectionId: string;
	collection: string;
}

export interface CatalogSkinFloatRange {
	catalogSkinId: string;
	minFloat: number;
	maxFloat: number;
	marketHashNames: CatalogSkin['marketHashNames'];
}

let cachedIndex: { generatedAt: string; index: CatalogIndex } | null = null;

export async function resolveCatalogIdentity(
	input: CatalogIdentityInput,
): Promise<CatalogIdentityMatch | null> {
	const snapshot = await getCatalogSnapshot();
	const index = getCatalogIndex(snapshot);
	const normalizedMarketHashName = normalizeMarketHashLookup(input.marketHashName);
	const exact = index.byFullMarketHashName.get(normalizedMarketHashName);

	if (exact) {
		return buildCatalogIdentityMatch(
			exact.skin,
			exact.exterior,
		);
	}

	const parsed = parseMarketHashName(input.marketHashName);
	const baseMarketHashName = buildBaseMarketHashName(
		input.weaponName ?? parsed.weaponName,
		input.skinName ?? parsed.skinName,
	);

	if (!baseMarketHashName) {
		return null;
	}

	const skin = index.byBaseMarketHashName.get(normalizeMarketHashLookup(baseMarketHashName));
	if (!skin) {
		return null;
	}

	const resolvedExterior =
		input.exterior ??
		exteriorFromLabel(parsed.exteriorLabel) ??
		(input.floatValue != null ? exteriorForFloat(input.floatValue) : undefined) ??
		null;

	if (resolvedExterior && !skin.exteriors.includes(resolvedExterior)) {
		return null;
	}

	return buildCatalogIdentityMatch(skin, resolvedExterior ?? null);
}

export async function resolveCatalogCollectionIdentity(
	collection: string | null | undefined,
): Promise<CatalogCollectionMatch | null> {
	const normalizedCollection = normalizeCollectionLookup(collection);

	if (!normalizedCollection) {
		return null;
	}

	const snapshot = await getCatalogSnapshot();
	const index = getCatalogIndex(snapshot);
	const match = index.collectionsByName.get(normalizedCollection) ?? index.collectionsById.get(normalizedCollection);

	if (!match) {
		return null;
	}

	return {
		catalogCollectionId: match.id,
		collection: match.name,
	};
}

export async function getCatalogSkinById(
	catalogSkinId: string | null | undefined,
): Promise<CatalogSkin | null> {
	if (!catalogSkinId) {
		return null;
	}

	const snapshot = await getCatalogSnapshot();
	const index = getCatalogIndex(snapshot);
	return index.skinsById.get(catalogSkinId) ?? null;
}

export async function getCatalogSkinFloatRange(
	catalogSkinId: string | null | undefined,
): Promise<CatalogSkinFloatRange | null> {
	if (!catalogSkinId) {
		return null;
	}

	const snapshot = await getCatalogSnapshot();
	const index = getCatalogIndex(snapshot);
	const skin = index.skinsById.get(catalogSkinId);

	if (!skin) {
		return null;
	}

	return {
		catalogSkinId: skin.id,
		minFloat: skin.minFloat,
		maxFloat: skin.maxFloat,
		marketHashNames: skin.marketHashNames,
	};
}

function getCatalogIndex(snapshot: CatalogSnapshot): CatalogIndex {
	if (cachedIndex?.generatedAt === snapshot.generatedAt) {
		return cachedIndex.index;
	}

	const byFullMarketHashName = new Map<
		string,
		{ skin: CatalogSkin; exterior: ItemExterior }
	>();
	const byBaseMarketHashName = new Map<string, CatalogSkin>();
	const skinsById = new Map<string, CatalogSkin>();
	const collectionsByName = new Map<string, CatalogCollection>();
	const collectionsById = new Map<string, CatalogCollection>();

	for (const collection of snapshot.collections) {
		collectionsByName.set(normalizeCollectionLookup(collection.name) ?? collection.name, collection);
		collectionsById.set(normalizeCollectionLookup(collection.id) ?? collection.id, collection);
	}

	for (const skin of snapshot.skins) {
		skinsById.set(skin.id, skin);
		byBaseMarketHashName.set(normalizeMarketHashLookup(skin.baseMarketHashName), skin);

		for (const marketHash of skin.marketHashNames) {
			byFullMarketHashName.set(normalizeMarketHashLookup(marketHash.marketHashName), {
				skin,
				exterior: marketHash.exterior,
			});
		}
	}

	const index = { byFullMarketHashName, byBaseMarketHashName, skinsById, collectionsByName, collectionsById };
	cachedIndex = { generatedAt: snapshot.generatedAt, index };
	return index;
}

function buildCatalogIdentityMatch(
	skin: CatalogSkin,
	exterior: ItemExterior | null,
): CatalogIdentityMatch {
	return {
		catalogSkinId: skin.id,
		catalogCollectionId: skin.collectionId,
		catalogWeaponDefIndex: skin.defIndex,
		catalogPaintIndex: skin.paintIndex,
		weaponName: skin.weaponName,
		skinName: skin.skinName,
		collection: skin.collectionName,
		rarity: skin.rarity,
		exterior,
	};
}

function buildBaseMarketHashName(
	weaponName: string | null | undefined,
	skinName: string | null | undefined,
): string | null {
	const normalizedWeaponName = normalizeWeaponName(weaponName ?? undefined);
	const normalizedSkinName = skinName?.trim();

	if (!normalizedWeaponName || !normalizedSkinName) {
		return null;
	}

	return `${normalizedWeaponName} | ${normalizedSkinName}`;
}

function normalizeCollectionLookup(value: string | null | undefined): string | null {
	const normalized = value?.trim().toLowerCase();
	return normalized ? normalized : null;
}

interface CatalogIndex {
	byFullMarketHashName: Map<string, { skin: CatalogSkin; exterior: ItemExterior }>;
	byBaseMarketHashName: Map<string, CatalogSkin>;
	skinsById: Map<string, CatalogSkin>;
	collectionsByName: Map<string, CatalogCollection>;
	collectionsById: Map<string, CatalogCollection>;
}
