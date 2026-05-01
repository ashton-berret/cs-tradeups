import type { ArmoryExpectedOdds, ArmoryPass, ArmoryReward, Prisma } from '@prisma/client';
import { db } from '$lib/server/db/client';
import { resolveCatalogIdentity } from '$lib/server/catalog/linkage';
import { getLatestMarketPriceForMarketHashName } from '$lib/server/marketPrices/priceService';
import { toDecimal, toDecimalOrNull, toNumber } from '$lib/server/utils/decimal';
import type { ItemExterior, ItemRarity } from '$lib/types/enums';

export interface CreateArmoryPassInput {
	purchasedAt?: Date;
	totalCost: number;
	currency?: string;
	notes?: string | null;
}

export interface CreateArmoryRewardInput {
	marketHashName: string;
	weaponName?: string | null;
	skinName?: string | null;
	collection?: string | null;
	rarity?: ItemRarity | null;
	exterior?: ItemExterior | null;
	floatValue?: number | null;
	pattern?: number | null;
	inspectLink?: string | null;
	starsSpent: number;
	receivedAt?: Date;
	estimatedValue?: number | null;
	notes?: string | null;
}

export type UpdateArmoryRewardInput = CreateArmoryRewardInput;

export interface RecordArmorySaleInput {
	salePrice: number;
	saleFees?: number | null;
	soldAt?: Date;
}

export interface ArmoryPassDTO {
	id: string;
	purchasedAt: Date;
	totalCost: number;
	currency: string;
	stars: number;
	pricePerStar: number;
	notes: string | null;
}

export interface ArmoryRewardDTO {
	id: string;
	inventoryItemId: string | null;
	marketHashName: string;
	weaponName: string | null;
	skinName: string | null;
	collection: string | null;
	rarity: ItemRarity | null;
	exterior: ItemExterior | null;
	floatValue: number | null;
	starsSpent: number;
	costPerStar: number;
	costBasis: number;
	estimatedValue: number | null;
	valueObservedAt: Date | null;
	salePrice: number | null;
	saleFees: number | null;
	soldAt: Date | null;
	realizedProfit: number | null;
	realizedProfitPct: number | null;
	unrealizedProfit: number | null;
	unrealizedProfitPct: number | null;
	receivedAt: Date;
	notes: string | null;
}

export interface ArmoryOddsDTO {
	collection: string;
	rarity: ItemRarity;
	expectedPct: number | null;
	actualCount: number;
	actualPct: number;
	deltaPct: number | null;
}

export interface ArmoryDashboardDTO {
	passes: ArmoryPassDTO[];
	rewards: ArmoryRewardDTO[];
	odds: ArmoryOddsDTO[];
	summary: {
		passCount: number;
		totalSpent: number;
		totalStars: number;
		starsSpent: number;
		starsRemaining: number;
		averageCostPerStar: number;
		totalRewardCostBasis: number;
		totalEstimatedValue: number;
		totalRealizedNet: number;
		totalRealizedProfit: number;
		totalUnrealizedProfit: number;
		totalNetValue: number;
		roiPct: number | null;
	};
}

const RARITIES: ItemRarity[] = [
	'CONSUMER_GRADE',
	'INDUSTRIAL_GRADE',
	'MIL_SPEC',
	'RESTRICTED',
	'CLASSIFIED',
	'COVERT'
];

export async function getArmoryDashboard(): Promise<ArmoryDashboardDTO> {
	const [passes, rewards, oddsRows] = await Promise.all([
		db.armoryPass.findMany({ orderBy: [{ purchasedAt: 'desc' }, { createdAt: 'desc' }] }),
		db.armoryReward.findMany({ orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }] }),
		db.armoryExpectedOdds.findMany()
	]);

	const passDtos = passes.map(toPassDTO);
	const rewardDtos = rewards.map(toRewardDTO);
	const totalSpent = sum(passDtos.map((pass) => pass.totalCost));
	const totalStars = sum(passDtos.map((pass) => pass.stars));
	const starsSpent = sum(rewardDtos.map((reward) => reward.starsSpent));
	const totalRewardCostBasis = sum(rewardDtos.map((reward) => reward.costBasis));
	const totalEstimatedValue = sum(unsoldEstimatedValues(rewardDtos));
	const totalRealizedNet = sum(
		rewardDtos.map((reward) =>
			reward.salePrice == null ? 0 : reward.salePrice - (reward.saleFees ?? 0)
		)
	);
	const totalRealizedProfit = sum(rewardDtos.map((reward) => reward.realizedProfit ?? 0));
	const totalUnrealizedProfit = sum(rewardDtos.map((reward) => reward.unrealizedProfit ?? 0));
	const totalNetValue = totalRealizedNet + totalEstimatedValue;
	const expectedOdds = new Map(oddsRows.map((row) => [oddsKey(row.collection, row.rarity), row]));

	return {
		passes: passDtos,
		rewards: rewardDtos,
		odds: buildOdds(rewardDtos, expectedOdds),
		summary: {
			passCount: passDtos.length,
			totalSpent,
			totalStars,
			starsSpent,
			starsRemaining: totalStars - starsSpent,
			averageCostPerStar: totalStars > 0 ? totalSpent / totalStars : 0,
			totalRewardCostBasis,
			totalEstimatedValue,
			totalRealizedNet,
			totalRealizedProfit,
			totalUnrealizedProfit,
			totalNetValue,
			roiPct: totalSpent > 0 ? ((totalNetValue - totalSpent) / totalSpent) * 100 : null
		}
	};
}

export async function createArmoryPass(input: CreateArmoryPassInput): Promise<ArmoryPassDTO> {
	const row = await db.armoryPass.create({
		data: {
			purchasedAt: input.purchasedAt ?? new Date(),
			totalCost: toDecimal(input.totalCost),
			currency: normalizeCurrency(input.currency),
			stars: 40,
			notes: input.notes
		}
	});

	return toPassDTO(row);
}

export async function createArmoryReward(input: CreateArmoryRewardInput): Promise<ArmoryRewardDTO> {
	const costPerStar = await currentCostPerStar();
	if (costPerStar <= 0) {
		throw new Error('Add at least one Armory pass before recording rewards.');
	}

	const starsSpent = Math.max(1, Math.trunc(input.starsSpent));
	const costBasis = costPerStar * starsSpent;
	const catalogIdentity = await resolveCatalogIdentity({
		marketHashName: input.marketHashName,
		weaponName: input.weaponName ?? undefined,
		skinName: input.skinName ?? undefined,
		collection: input.collection ?? undefined,
		rarity: input.rarity ?? null,
		exterior: input.exterior ?? null,
		floatValue: input.floatValue ?? null
	});
	const latestPrice = await getLatestMarketPriceForMarketHashName(input.marketHashName);
	const estimatedValue = input.estimatedValue ?? latestPrice?.marketValue ?? null;
	const receivedAt = input.receivedAt ?? new Date();

	const row = await db.$transaction(async (tx) => {
		const inventoryItem = await tx.inventoryItem.create({
			data: {
				marketHashName: input.marketHashName,
				weaponName: catalogIdentity?.weaponName ?? input.weaponName ?? undefined,
				skinName: catalogIdentity?.skinName ?? input.skinName ?? undefined,
				collection: catalogIdentity?.collection ?? input.collection ?? undefined,
				catalogSkinId: catalogIdentity?.catalogSkinId,
				catalogCollectionId: catalogIdentity?.catalogCollectionId,
				catalogWeaponDefIndex: catalogIdentity?.catalogWeaponDefIndex,
				catalogPaintIndex: catalogIdentity?.catalogPaintIndex,
				rarity: catalogIdentity?.rarity ?? input.rarity ?? undefined,
				exterior: catalogIdentity?.exterior ?? input.exterior ?? undefined,
				floatValue: input.floatValue ?? undefined,
				pattern: input.pattern ?? undefined,
				inspectLink: input.inspectLink ?? undefined,
				purchasePrice: toDecimal(costBasis),
				purchaseCurrency: 'USD',
				purchaseDate: receivedAt,
				currentEstValue: toDecimalOrNull(estimatedValue),
				notes: appendNote(input.notes, 'Armory reward')
			}
		});

		return tx.armoryReward.create({
			data: {
				inventoryItemId: inventoryItem.id,
				marketHashName: inventoryItem.marketHashName,
				weaponName: inventoryItem.weaponName,
				skinName: inventoryItem.skinName,
				collection: inventoryItem.collection,
				catalogSkinId: inventoryItem.catalogSkinId,
				catalogCollectionId: inventoryItem.catalogCollectionId,
				catalogWeaponDefIndex: inventoryItem.catalogWeaponDefIndex,
				catalogPaintIndex: inventoryItem.catalogPaintIndex,
				rarity: inventoryItem.rarity,
				exterior: inventoryItem.exterior,
				floatValue: inventoryItem.floatValue,
				pattern: inventoryItem.pattern,
				inspectLink: inventoryItem.inspectLink,
				starsSpent,
				costPerStar: toDecimal(costPerStar),
				costBasis: toDecimal(costBasis),
				currency: 'USD',
				receivedAt,
				estimatedValue: toDecimalOrNull(estimatedValue),
				valueObservedAt: latestPrice?.observedAt,
				notes: input.notes
			}
		});
	});

	return toRewardDTO(row);
}

export async function updateArmoryReward(
	rewardId: string,
	input: UpdateArmoryRewardInput
): Promise<ArmoryRewardDTO> {
	const existing = await db.armoryReward.findUnique({ where: { id: rewardId } });
	if (!existing) throw new Error(`Armory reward not found: ${rewardId}`);

	const starsSpent = Math.max(1, Math.trunc(input.starsSpent));
	const costPerStar = toNumber(existing.costPerStar) ?? 0;
	const costBasis = costPerStar * starsSpent;
	const catalogIdentity = await resolveCatalogIdentity({
		marketHashName: input.marketHashName,
		weaponName: input.weaponName ?? undefined,
		skinName: input.skinName ?? undefined,
		collection: input.collection ?? undefined,
		rarity: input.rarity ?? null,
		exterior: input.exterior ?? null,
		floatValue: input.floatValue ?? null
	});
	const latestPrice = await getLatestMarketPriceForMarketHashName(input.marketHashName);
	const estimatedValue = input.estimatedValue ?? latestPrice?.marketValue ?? null;
	const receivedAt = input.receivedAt ?? existing.receivedAt;
	const salePrice = toNumber(existing.salePrice);
	const saleFees = toNumber(existing.saleFees) ?? 0;
	const realizedProfit = salePrice == null ? null : salePrice - saleFees - costBasis;

	const row = await db.$transaction(async (tx) => {
		if (existing.inventoryItemId) {
			await tx.inventoryItem.update({
				where: { id: existing.inventoryItemId },
				data: {
					marketHashName: input.marketHashName,
					weaponName: catalogIdentity?.weaponName ?? input.weaponName ?? undefined,
					skinName: catalogIdentity?.skinName ?? input.skinName ?? undefined,
					collection: catalogIdentity?.collection ?? input.collection ?? undefined,
					catalogSkinId: catalogIdentity?.catalogSkinId,
					catalogCollectionId: catalogIdentity?.catalogCollectionId,
					catalogWeaponDefIndex: catalogIdentity?.catalogWeaponDefIndex,
					catalogPaintIndex: catalogIdentity?.catalogPaintIndex,
					rarity: catalogIdentity?.rarity ?? input.rarity ?? undefined,
					exterior: catalogIdentity?.exterior ?? input.exterior ?? undefined,
					floatValue: input.floatValue ?? undefined,
					pattern: input.pattern ?? undefined,
					inspectLink: input.inspectLink ?? undefined,
					purchasePrice: toDecimal(costBasis),
					purchaseDate: receivedAt,
					currentEstValue: toDecimalOrNull(salePrice == null ? estimatedValue : salePrice - saleFees),
					notes: appendNote(input.notes, 'Armory reward')
				}
			});
		}

		return tx.armoryReward.update({
			where: { id: rewardId },
			data: {
				marketHashName: input.marketHashName,
				weaponName: catalogIdentity?.weaponName ?? input.weaponName ?? undefined,
				skinName: catalogIdentity?.skinName ?? input.skinName ?? undefined,
				collection: catalogIdentity?.collection ?? input.collection ?? undefined,
				catalogSkinId: catalogIdentity?.catalogSkinId,
				catalogCollectionId: catalogIdentity?.catalogCollectionId,
				catalogWeaponDefIndex: catalogIdentity?.catalogWeaponDefIndex,
				catalogPaintIndex: catalogIdentity?.catalogPaintIndex,
				rarity: catalogIdentity?.rarity ?? input.rarity ?? undefined,
				exterior: catalogIdentity?.exterior ?? input.exterior ?? undefined,
				floatValue: input.floatValue ?? undefined,
				pattern: input.pattern ?? undefined,
				inspectLink: input.inspectLink ?? undefined,
				starsSpent,
				costBasis: toDecimal(costBasis),
				receivedAt,
				estimatedValue: toDecimalOrNull(estimatedValue),
				valueObservedAt: latestPrice?.observedAt,
				realizedProfit: toDecimalOrNull(realizedProfit),
				realizedProfitPct:
					realizedProfit != null && costBasis > 0 ? (realizedProfit / costBasis) * 100 : null,
				notes: input.notes
			}
		});
	});

	return toRewardDTO(row);
}

export async function duplicateArmoryReward(rewardId: string): Promise<ArmoryRewardDTO> {
	const existing = await db.armoryReward.findUnique({ where: { id: rewardId } });
	if (!existing) throw new Error(`Armory reward not found: ${rewardId}`);

	return createArmoryReward({
		marketHashName: existing.marketHashName,
		weaponName: existing.weaponName,
		skinName: existing.skinName,
		collection: existing.collection,
		rarity: existing.rarity as ItemRarity | null,
		exterior: existing.exterior as ItemExterior | null,
		floatValue: existing.floatValue,
		pattern: existing.pattern,
		inspectLink: existing.inspectLink,
		starsSpent: existing.starsSpent,
		receivedAt: new Date(),
		estimatedValue: toNumber(existing.estimatedValue),
		notes: existing.notes ? `${existing.notes}\nDuplicated from ${existing.id}` : `Duplicated from ${existing.id}`
	});
}

export async function recordArmorySale(
	rewardId: string,
	input: RecordArmorySaleInput
): Promise<ArmoryRewardDTO> {
	const reward = await db.armoryReward.findUnique({ where: { id: rewardId } });
	if (!reward) throw new Error(`Armory reward not found: ${rewardId}`);

	const saleFees = input.saleFees ?? 0;
	const net = input.salePrice - saleFees;
	const costBasis = toNumber(reward.costBasis) ?? 0;
	const realizedProfit = net - costBasis;
	const row = await db.$transaction(async (tx) => {
		const updated = await tx.armoryReward.update({
			where: { id: rewardId },
			data: {
				salePrice: toDecimal(input.salePrice),
				saleFees: toDecimalOrNull(input.saleFees),
				soldAt: input.soldAt ?? new Date(),
				realizedProfit: toDecimal(realizedProfit),
				realizedProfitPct: costBasis > 0 ? (realizedProfit / costBasis) * 100 : null
			}
		});

		if (reward.inventoryItemId) {
			await tx.inventoryItem.update({
				where: { id: reward.inventoryItemId },
				data: {
					status: 'SOLD',
					currentEstValue: toDecimal(net)
				}
			});
		}

		return updated;
	});

	return toRewardDTO(row);
}

export async function updateArmoryExpectedOdds(
	collection: string,
	input: Array<{ rarity: ItemRarity; expectedPct: number | null }>
): Promise<void> {
	const normalizedCollection = normalizeOddsCollection(collection);
	for (const row of input) {
		if (row.expectedPct == null || !Number.isFinite(row.expectedPct)) {
			await db.armoryExpectedOdds.deleteMany({
				where: { collection: normalizedCollection, rarity: row.rarity }
			});
			continue;
		}

		await db.armoryExpectedOdds.upsert({
			where: { collection_rarity: { collection: normalizedCollection, rarity: row.rarity } },
			create: { collection: normalizedCollection, rarity: row.rarity, expectedPct: row.expectedPct },
			update: { expectedPct: row.expectedPct }
		});
	}
}

function toPassDTO(row: ArmoryPass): ArmoryPassDTO {
	const totalCost = toNumber(row.totalCost) ?? 0;
	return {
		id: row.id,
		purchasedAt: row.purchasedAt,
		totalCost,
		currency: row.currency,
		stars: row.stars,
		pricePerStar: row.stars > 0 ? totalCost / row.stars : 0,
		notes: row.notes
	};
}

function toRewardDTO(row: ArmoryReward): ArmoryRewardDTO {
	const costBasis = toNumber(row.costBasis) ?? 0;
	const estimatedValue = toNumber(row.estimatedValue);
	const salePrice = toNumber(row.salePrice);
	const saleFees = toNumber(row.saleFees);
	const sold = salePrice != null;
	const unrealizedProfit = !sold && estimatedValue != null ? estimatedValue - costBasis : null;

	return {
		id: row.id,
		inventoryItemId: row.inventoryItemId,
		marketHashName: row.marketHashName,
		weaponName: row.weaponName,
		skinName: row.skinName,
		collection: row.collection,
		rarity: row.rarity as ItemRarity | null,
		exterior: row.exterior as ItemExterior | null,
		floatValue: row.floatValue,
		starsSpent: row.starsSpent,
		costPerStar: toNumber(row.costPerStar) ?? 0,
		costBasis,
		estimatedValue,
		valueObservedAt: row.valueObservedAt,
		salePrice,
		saleFees,
		soldAt: row.soldAt,
		realizedProfit: toNumber(row.realizedProfit),
		realizedProfitPct: row.realizedProfitPct,
		unrealizedProfit,
		unrealizedProfitPct: unrealizedProfit != null && costBasis > 0 ? (unrealizedProfit / costBasis) * 100 : null,
		receivedAt: row.receivedAt,
		notes: row.notes
	};
}

function buildOdds(
	rewards: ArmoryRewardDTO[],
	expectedOdds: Map<string, ArmoryExpectedOdds>
): ArmoryOddsDTO[] {
	const collections = new Set<string>(['Default']);
	for (const reward of rewards) {
		if (reward.collection) collections.add(reward.collection);
	}
	for (const row of expectedOdds.values()) {
		collections.add(row.collection);
	}

	return [...collections].sort((a, b) => a.localeCompare(b)).flatMap((collection) => {
		const scopedRewards =
			collection === 'Default'
				? rewards
				: rewards.filter((reward) => reward.collection === collection);
		const total = scopedRewards.length;

		return RARITIES.map((rarity) => {
			const actualCount = scopedRewards.filter((reward) => reward.rarity === rarity).length;
			const actualPct = total > 0 ? (actualCount / total) * 100 : 0;
			const expectedPct =
				expectedOdds.get(oddsKey(collection, rarity))?.expectedPct ??
				(collection === 'Default' ? null : expectedOdds.get(oddsKey('Default', rarity))?.expectedPct ?? null);

			return {
				collection,
				rarity,
				expectedPct,
				actualCount,
				actualPct,
				deltaPct: expectedPct == null ? null : actualPct - expectedPct
			};
		});
	});
}

async function currentCostPerStar(): Promise<number> {
	const rows = await db.armoryPass.findMany();
	const totalCost = sum(rows.map((row) => toNumber(row.totalCost) ?? 0));
	const stars = sum(rows.map((row) => row.stars));
	return stars > 0 ? totalCost / stars : 0;
}

function unsoldEstimatedValues(rewards: ArmoryRewardDTO[]): number[] {
	return rewards
		.filter((reward) => reward.salePrice == null)
		.map((reward) => reward.estimatedValue ?? 0);
}

function sum(values: number[]): number {
	return values.reduce((total, value) => total + value, 0);
}

function normalizeCurrency(value: string | null | undefined): string {
	return (value ?? 'USD').trim().toUpperCase() || 'USD';
}

function appendNote(note: string | null | undefined, suffix: string): string {
	return note ? `${note}\n${suffix}` : suffix;
}

function normalizeOddsCollection(value: string | null | undefined): string {
	return value?.trim() || 'Default';
}

function oddsKey(collection: string, rarity: string): string {
	return `${collection}\u0000${rarity}`;
}
