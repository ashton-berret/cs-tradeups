import process from 'node:process';
import { db } from '../../src/lib/server/db/client';
import { resolveCatalogCollectionIdentity, resolveCatalogIdentity } from '../../src/lib/server/catalog/linkage';
import type { ItemExterior, ItemRarity } from '../../src/lib/types/enums';

async function main(): Promise<void> {
	const [candidateResult, inventoryResult, planRuleResult, outcomeResult] = await Promise.all([
		backfillCandidates(),
		backfillInventory(),
		backfillPlanRules(),
		backfillOutcomes(),
	]);

	console.log(
		JSON.stringify(
			{
				candidates: candidateResult,
				inventory: inventoryResult,
				planRules: planRuleResult,
				outcomes: outcomeResult,
			},
			null,
			2,
		),
	);
}

async function backfillCandidates(): Promise<{ scanned: number; matched: number; updated: number }> {
	const rows = await db.candidateListing.findMany();
	let matched = 0;
	let updated = 0;

	for (const row of rows) {
		const match = await resolveCatalogIdentity({
			marketHashName: row.marketHashName,
			weaponName: row.weaponName,
			skinName: row.skinName,
			collection: row.collection,
			rarity: row.rarity as ItemRarity | null,
			exterior: row.exterior as ItemExterior | null,
			floatValue: row.floatValue,
		});

		if (!match) {
			continue;
		}

		matched += 1;

		const changed =
			row.weaponName !== match.weaponName ||
			row.skinName !== match.skinName ||
			row.collection !== match.collection ||
			row.catalogSkinId !== match.catalogSkinId ||
			row.catalogCollectionId !== match.catalogCollectionId ||
			row.catalogWeaponDefIndex !== match.catalogWeaponDefIndex ||
			row.catalogPaintIndex !== match.catalogPaintIndex ||
			row.rarity !== match.rarity ||
			row.exterior !== match.exterior;

		if (!changed) {
			continue;
		}

		await db.candidateListing.update({
			where: { id: row.id },
			data: {
				weaponName: match.weaponName,
				skinName: match.skinName,
				collection: match.collection,
				catalogSkinId: match.catalogSkinId,
				catalogCollectionId: match.catalogCollectionId,
				catalogWeaponDefIndex: match.catalogWeaponDefIndex,
				catalogPaintIndex: match.catalogPaintIndex,
				rarity: match.rarity,
				exterior: match.exterior,
			},
		});

		updated += 1;
	}

	return { scanned: rows.length, matched, updated };
}

async function backfillInventory(): Promise<{ scanned: number; matched: number; updated: number }> {
	const rows = await db.inventoryItem.findMany();
	let matched = 0;
	let updated = 0;

	for (const row of rows) {
		const match = await resolveCatalogIdentity({
			marketHashName: row.marketHashName,
			weaponName: row.weaponName,
			skinName: row.skinName,
			collection: row.collection,
			rarity: row.rarity as ItemRarity | null,
			exterior: row.exterior as ItemExterior | null,
			floatValue: row.floatValue,
		});

		if (!match) {
			continue;
		}

		matched += 1;

		const changed =
			row.weaponName !== match.weaponName ||
			row.skinName !== match.skinName ||
			row.collection !== match.collection ||
			row.catalogSkinId !== match.catalogSkinId ||
			row.catalogCollectionId !== match.catalogCollectionId ||
			row.catalogWeaponDefIndex !== match.catalogWeaponDefIndex ||
			row.catalogPaintIndex !== match.catalogPaintIndex ||
			row.rarity !== match.rarity ||
			row.exterior !== match.exterior;

		if (!changed) {
			continue;
		}

		await db.inventoryItem.update({
			where: { id: row.id },
			data: {
				weaponName: match.weaponName,
				skinName: match.skinName,
				collection: match.collection,
				catalogSkinId: match.catalogSkinId,
				catalogCollectionId: match.catalogCollectionId,
				catalogWeaponDefIndex: match.catalogWeaponDefIndex,
				catalogPaintIndex: match.catalogPaintIndex,
				rarity: match.rarity,
				exterior: match.exterior,
			},
		});

		updated += 1;
	}

	return { scanned: rows.length, matched, updated };
}

async function backfillPlanRules(): Promise<{ scanned: number; matched: number; updated: number }> {
	const rows = await db.tradeupPlanRule.findMany();
	let matched = 0;
	let updated = 0;

	for (const row of rows) {
		const match = await resolveCatalogCollectionIdentity(row.collection);

		if (!match) {
			continue;
		}

		matched += 1;

		const changed =
			row.collection !== match.collection ||
			row.catalogCollectionId !== match.catalogCollectionId;

		if (!changed) {
			continue;
		}

		await db.tradeupPlanRule.update({
			where: { id: row.id },
			data: {
				collection: match.collection,
				catalogCollectionId: match.catalogCollectionId,
			},
		});

		updated += 1;
	}

	return { scanned: rows.length, matched, updated };
}

async function backfillOutcomes(): Promise<{ scanned: number; matched: number; updated: number }> {
	const rows = await db.tradeupOutcomeItem.findMany();
	let matched = 0;
	let updated = 0;

	for (const row of rows) {
		const match = await resolveCatalogIdentity({
			marketHashName: row.marketHashName,
			weaponName: row.weaponName,
			skinName: row.skinName,
			collection: row.collection,
			rarity: row.rarity as ItemRarity | null,
		});

		if (!match) {
			continue;
		}

		matched += 1;

		const changed =
			row.weaponName !== match.weaponName ||
			row.skinName !== match.skinName ||
			row.collection !== match.collection ||
			row.catalogSkinId !== match.catalogSkinId ||
			row.catalogCollectionId !== match.catalogCollectionId ||
			row.catalogWeaponDefIndex !== match.catalogWeaponDefIndex ||
			row.catalogPaintIndex !== match.catalogPaintIndex ||
			row.rarity !== match.rarity;

		if (!changed) {
			continue;
		}

		await db.tradeupOutcomeItem.update({
			where: { id: row.id },
			data: {
				weaponName: match.weaponName,
				skinName: match.skinName,
				collection: match.collection,
				catalogSkinId: match.catalogSkinId,
				catalogCollectionId: match.catalogCollectionId,
				catalogWeaponDefIndex: match.catalogWeaponDefIndex,
				catalogPaintIndex: match.catalogPaintIndex,
				rarity: match.rarity,
			},
		});

		updated += 1;
	}

	return { scanned: rows.length, matched, updated };
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await db.$disconnect();
	});
