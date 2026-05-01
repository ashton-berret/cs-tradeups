import { fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	createArmoryPass,
	createArmoryReward,
	duplicateArmoryReward,
	getArmoryDashboard,
	recordArmorySale,
	updateArmoryReward,
	updateArmoryExpectedOdds
} from '$lib/server/armory/armoryService';
import { ITEM_EXTERIORS, ITEM_RARITIES } from '$lib/types/enums';

export const load: PageServerLoad = async () => {
	return getArmoryDashboard();
};

export const actions: Actions = {
	addPass: async ({ request }) => {
		const form = await request.formData();
		const values = valuesFrom(form);
		const totalCost = numberField(form, 'totalCost');
		if (totalCost == null || totalCost <= 0) {
			return fail(400, { error: 'Pass total cost is required.', values });
		}

		try {
			await createArmoryPass({
				totalCost,
				purchasedAt: dateField(form, 'purchasedAt'),
				notes: field(form, 'notes')
			});
			return { success: 'Armory pass added.' };
		} catch (err) {
			return fail(500, { error: message(err), values });
		}
	},

	addReward: async ({ request }) => {
		const form = await request.formData();
		const values = valuesFrom(form);
		const marketHashName = field(form, 'marketHashName');
		const starsSpent = numberField(form, 'starsSpent');
		if (!marketHashName) return fail(400, { error: 'Market hash name is required.', values });
		if (starsSpent == null || starsSpent <= 0) {
			return fail(400, { error: 'Stars spent must be greater than zero.', values });
		}

		try {
			await createArmoryReward({
				marketHashName,
				weaponName: field(form, 'weaponName'),
				skinName: field(form, 'skinName'),
				collection: field(form, 'collection'),
				rarity: enumField(form, 'rarity', ITEM_RARITIES),
				exterior: enumField(form, 'exterior', ITEM_EXTERIORS),
				floatValue: numberField(form, 'floatValue'),
				pattern: intField(form, 'pattern'),
				inspectLink: field(form, 'inspectLink'),
				starsSpent,
				receivedAt: dateField(form, 'receivedAt'),
				estimatedValue: steamNetField(form, 'estimatedGrossValue'),
				notes: field(form, 'notes')
			});
			return { success: 'Armory reward added and linked to inventory.' };
		} catch (err) {
			return fail(500, { error: message(err), values });
		}
	},

	updateReward: async ({ request }) => {
		const form = await request.formData();
		const values = valuesFrom(form);
		const id = field(form, 'id');
		const marketHashName = field(form, 'marketHashName');
		const starsSpent = numberField(form, 'starsSpent');
		if (!id) return fail(400, { error: 'Reward id is required.', values });
		if (!marketHashName) return fail(400, { error: 'Market hash name is required.', values });
		if (starsSpent == null || starsSpent <= 0) {
			return fail(400, { error: 'Stars spent must be greater than zero.', values });
		}

		try {
			await updateArmoryReward(id, {
				marketHashName,
				weaponName: field(form, 'weaponName'),
				skinName: field(form, 'skinName'),
				collection: field(form, 'collection'),
				rarity: enumField(form, 'rarity', ITEM_RARITIES),
				exterior: enumField(form, 'exterior', ITEM_EXTERIORS),
				floatValue: numberField(form, 'floatValue'),
				pattern: intField(form, 'pattern'),
				inspectLink: field(form, 'inspectLink'),
				starsSpent,
				receivedAt: dateField(form, 'receivedAt'),
				estimatedValue: steamNetField(form, 'estimatedGrossValue'),
				notes: field(form, 'notes')
			});
			return { success: 'Armory reward updated.' };
		} catch (err) {
			return fail(500, { error: message(err), values });
		}
	},

	recordSale: async ({ request }) => {
		const form = await request.formData();
		const values = valuesFrom(form);
		const id = field(form, 'id');
		const salePrice = numberField(form, 'salePrice');
		if (!id) return fail(400, { error: 'Reward id is required.', values });
		if (salePrice == null || salePrice < 0) {
			return fail(400, { error: 'Sale price is required.', values });
		}

		try {
			await recordArmorySale(id, {
				salePrice,
				saleFees: numberField(form, 'saleFees'),
				soldAt: dateField(form, 'soldAt')
			});
			return { success: 'Armory sale recorded.' };
		} catch (err) {
			return fail(500, { error: message(err), values });
		}
	},

	duplicateReward: async ({ request }) => {
		const form = await request.formData();
		const values = valuesFrom(form);
		const id = field(form, 'id');
		if (!id) return fail(400, { error: 'Reward id is required.', values });

		try {
			await duplicateArmoryReward(id);
			return { success: 'Armory reward duplicated.' };
		} catch (err) {
			return fail(500, { error: message(err), values });
		}
	},

	updateOdds: async ({ request }) => {
		const form = await request.formData();
		const values = valuesFrom(form);
		try {
			await updateArmoryExpectedOdds(
				field(form, 'oddsCollection') ?? 'Default',
				ITEM_RARITIES.map((rarity) => ({
					rarity,
					expectedPct: numberField(form, `expectedPct_${rarity}`)
				}))
			);
			return { success: 'Expected odds updated.' };
		} catch (err) {
			return fail(500, { error: message(err), values });
		}
	}
};

function field(form: FormData, name: string): string | undefined {
	const value = form.get(name);
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function numberField(form: FormData, name: string): number | null {
	const value = field(form, name);
	if (value == null) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function intField(form: FormData, name: string): number | null {
	const value = numberField(form, name);
	return value == null ? null : Math.trunc(value);
}

function steamNetField(form: FormData, name: string): number | null {
	const gross = numberField(form, name);
	return gross == null ? null : gross * 0.85;
}

function dateField(form: FormData, name: string): Date | undefined {
	const value = field(form, name);
	if (!value) return undefined;
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return new Date(value);
	return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function enumField<T extends readonly string[]>(
	form: FormData,
	name: string,
	allowed: T
): T[number] | undefined {
	const value = field(form, name);
	return value && allowed.includes(value) ? (value as T[number]) : undefined;
}

function valuesFrom(form: FormData) {
	return Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === 'string'));
}

function message(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
