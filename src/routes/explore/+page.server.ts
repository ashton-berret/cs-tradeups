import type { PageServerLoad } from './$types';
import { getCatalogSnapshot } from '$lib/server/catalog/catalogService';

export const load: PageServerLoad = async ({ url }) => {
	const snapshot = await getCatalogSnapshot();
	const selectedCollectionId =
		url.searchParams.get('collectionId') ??
		snapshot.collections.slice().sort((a, b) => a.name.localeCompare(b.name))[0]?.id ??
		null;

	const collections = snapshot.collections
		.slice()
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((collection) => ({
			id: collection.id,
			name: collection.name,
			skinCount: collection.skinCount
		}));

	const selectedCollection =
		collections.find((collection) => collection.id === selectedCollectionId) ?? collections[0] ?? null;

	const skins = selectedCollection
		? snapshot.skins
				.filter((skin) => skin.collectionId === selectedCollection.id)
				.sort((a, b) => {
					const rarityCmp = rarityOrder(a.rarity) - rarityOrder(b.rarity);
					if (rarityCmp !== 0) return rarityCmp;
					const weaponCmp = a.weaponName.localeCompare(b.weaponName);
					if (weaponCmp !== 0) return weaponCmp;
					return a.skinName.localeCompare(b.skinName);
				})
				.map((skin) => ({
					id: skin.id,
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
				}))
		: [];

	return {
		collections,
		selectedCollection,
		skins,
		stats: snapshot.stats,
		generatedAt: snapshot.generatedAt
	};
};

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
