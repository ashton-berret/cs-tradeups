// GET /api/catalog/skins
//
// Lightweight skin list for combobox-driven UIs (CatalogSkinSelect). Returns
// only the fields a picker needs — id, weapon/skin display, collection
// linkage, rarity, float range, exteriors, base market hash name. Full skin
// records (including paint provenance) remain reachable via /api/catalog.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCatalogSnapshot } from '$lib/server/catalog/catalogService';
import { toErrorResponse } from '$lib/server/http/errors';
import type { ItemExterior, ItemRarity } from '$lib/types/enums';

export interface CatalogSkinSummary {
	id: string;
	weaponName: string;
	skinName: string;
	displayName: string;
	baseMarketHashName: string;
	collectionId: string;
	collectionName: string;
	rarity: ItemRarity | null;
	minFloat: number;
	maxFloat: number;
	exteriors: ItemExterior[];
}

export const GET: RequestHandler = async () => {
	try {
		const snapshot = await getCatalogSnapshot();
		const skins: CatalogSkinSummary[] = snapshot.skins.map((skin) => ({
			id: skin.id,
			weaponName: skin.weaponName,
			skinName: skin.skinName,
			displayName: `${skin.weaponName} | ${skin.skinName}`,
			baseMarketHashName: skin.baseMarketHashName,
			collectionId: skin.collectionId,
			collectionName: skin.collectionName,
			rarity: skin.rarity,
			minFloat: skin.minFloat,
			maxFloat: skin.maxFloat,
			exteriors: skin.exteriors,
		}));
		return json({ skins });
	} catch (error) {
		return toErrorResponse(error);
	}
};
