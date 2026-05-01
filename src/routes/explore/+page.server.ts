import type { PageServerLoad } from './$types';
import { getCatalogSnapshot } from '$lib/server/catalog/catalogService';

export const load: PageServerLoad = async ({ url }) => {
	const snapshot = await getCatalogSnapshot();
	const selectedCollectionId = url.searchParams.get('collectionId') ?? 'all';
	const floatFloorParam = url.searchParams.get('minFloatFloor');
	const floatFloorMin = parseFloatFloor(floatFloorParam);

	const collections = snapshot.collections
		.slice()
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((collection) => ({
			id: collection.id,
			name: collection.name,
			skinCount: collection.skinCount
		}));

	const selectedCollection =
		selectedCollectionId === 'all'
			? null
			: collections.find((collection) => collection.id === selectedCollectionId) ?? null;

	const skins = snapshot.skins
		.filter((skin) => !selectedCollection || skin.collectionId === selectedCollection.id)
		.filter((skin) => floatFloorMin == null || skin.minFloat > floatFloorMin)
		.sort((a, b) => {
			const collectionCmp = a.collectionName.localeCompare(b.collectionName);
			if (collectionCmp !== 0) return collectionCmp;
			const rarityCmp = rarityOrder(a.rarity) - rarityOrder(b.rarity);
			if (rarityCmp !== 0) return rarityCmp;
			const weaponCmp = a.weaponName.localeCompare(b.weaponName);
			if (weaponCmp !== 0) return weaponCmp;
			return a.skinName.localeCompare(b.skinName);
		})
		.map((skin) => ({
			id: skin.id,
			collectionName: skin.collectionName,
			weaponName: skin.weaponName,
			skinName: skin.skinName,
			baseMarketHashName: skin.baseMarketHashName,
			rarity: skin.rarity,
			minFloat: skin.minFloat,
			maxFloat: skin.maxFloat,
			exteriors: skin.exteriors,
			marketHashNames: skin.marketHashNames,
			paintIndex: skin.paintIndex,
			defIndex: skin.defIndex
		}));

	return {
		collections,
		selectedCollection,
		selectedCollectionId: selectedCollection?.id ?? 'all',
		floatFloorMin,
		skins,
		stats: snapshot.stats,
		generatedAt: snapshot.generatedAt
	};
};

function parseFloatFloor(value: string | null): number | null {
	if (!value) return null;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return null;
	return Math.min(1, Math.max(0, parsed));
}

function rarityOrder(rarity: string | null): number {
	const order = [
		'CONSUMER_GRADE',
		'INDUSTRIAL_GRADE',
		'MIL_SPEC',
		'RESTRICTED',
		'CLASSIFIED',
		'COVERT'
	];
	return rarity ? order.indexOf(rarity) : -1;
}
