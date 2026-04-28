import { error, fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ApiError, apiFetch } from '$lib/client/api';
import type { PaginatedResponse, PlanFilter } from '$lib/types/domain';
import type { OutcomeItemDTO, PlanDTO, PlanRuleDTO } from '$lib/types/services';
import { getCatalogSnapshot } from '$lib/server/catalog/catalogService';
import { resolveCatalogCollectionIdentity } from '$lib/server/catalog/linkage';
import { getLatestMarketPricesForMarketHashNames } from '$lib/server/marketPrices/priceService';
import { getNextRarity, type ItemExterior, type ItemRarity } from '$lib/types/enums';

const filterKeys = ['isActive', 'inputRarity', 'targetRarity', 'search', 'sortBy', 'sortDir', 'page', 'limit'];

export const load: PageServerLoad = async ({ fetch, url }) => {
	try {
		const page = await apiFetch<PaginatedResponse<PlanDTO>>(
			fetch,
			`/api/tradeups/plans${copySearch(url, filterKeys)}`
		);
		return { page, filter: filterFromUrl(url) as PlanFilter };
	} catch (err) {
		if (err instanceof ApiError) error(err.status, err.message);
		throw err;
	}
};

export const actions: Actions = {
	create: async ({ request, fetch }) => {
		const form = await request.formData();
		const values = valuesFrom(form);
		try {
			const body = form.get('simplePlan') === 'true'
				? await simplePlanBody(form)
				: {
					name: field(form, 'name'),
					description: field(form, 'description'),
					inputRarity: field(form, 'inputRarity'),
					targetRarity: field(form, 'targetRarity'),
					isActive: boolField(form, 'isActive'),
					minProfitThreshold: numberField(form, 'minProfitThreshold'),
					minProfitPctThreshold: numberField(form, 'minProfitPctThreshold'),
					minLiquidityScore: numberField(form, 'minLiquidityScore'),
					minCompositeScore: numberField(form, 'minCompositeScore'),
					notes: field(form, 'notes'),
					rules: [ruleBody(form, '')].filter(hasRuleFields),
					outcomeItems: [outcomeBody(form, '')].filter(hasOutcomeFields)
				};
			await apiFetch<PlanDTO>(fetch, '/api/tradeups/plans', {
				method: 'POST',
				body: JSON.stringify(body)
			});
			return { success: 'Plan created.' };
		} catch (err) {
			return actionError(err, values);
		}
	},

	updatePlan: async ({ request, fetch }) => {
		const form = await request.formData();
		const id = field(form, 'id');
		const values = valuesFrom(form);
		if (!id) return fail(400, { error: 'Plan id is required.', values });
		try {
			await apiFetch<PlanDTO>(fetch, `/api/tradeups/plans/${id}`, {
				method: 'PATCH',
				body: JSON.stringify({
					name: field(form, 'name'),
					description: field(form, 'description'),
					inputRarity: field(form, 'inputRarity'),
					targetRarity: field(form, 'targetRarity'),
					isActive: boolField(form, 'isActive'),
					minProfitThreshold: numberField(form, 'minProfitThreshold'),
					minProfitPctThreshold: numberField(form, 'minProfitPctThreshold'),
					minLiquidityScore: numberField(form, 'minLiquidityScore'),
					minCompositeScore: numberField(form, 'minCompositeScore'),
					notes: field(form, 'notes')
				})
			});
			return { success: 'Plan updated.' };
		} catch (err) {
			return actionError(err, values);
		}
	},

	deletePlan: async ({ request, fetch }) => {
		const form = await request.formData();
		const id = field(form, 'id');
		const values = valuesFrom(form);
		if (!id) return fail(400, { error: 'Plan id is required.', values });
		try {
			await apiFetch(fetch, `/api/tradeups/plans/${id}`, { method: 'DELETE' });
			return { success: 'Plan deleted.' };
		} catch (err) {
			return actionError(err, values);
		}
	},

	addRule: async ({ request, fetch }) => {
		const form = await request.formData();
		const planId = field(form, 'planId');
		const values = valuesFrom(form);
		if (!planId) return fail(400, { error: 'Plan id is required.', values });
		try {
			await apiFetch<PlanRuleDTO>(fetch, `/api/tradeups/plans/${planId}/rules`, {
				method: 'POST',
				body: JSON.stringify(ruleBody(form, ''))
			});
			return { success: 'Rule added.' };
		} catch (err) {
			return actionError(err, values);
		}
	},

	updateRule: async ({ request, fetch }) => {
		const form = await request.formData();
		const ruleId = field(form, 'ruleId');
		const values = valuesFrom(form);
		if (!ruleId) return fail(400, { error: 'Rule id is required.', values });
		try {
			await apiFetch<PlanRuleDTO>(fetch, `/api/tradeups/plans/rules/${ruleId}`, {
				method: 'PATCH',
				body: JSON.stringify(ruleBody(form, ''))
			});
			return { success: 'Rule updated.' };
		} catch (err) {
			return actionError(err, values);
		}
	},

	deleteRule: async ({ request, fetch }) => {
		const form = await request.formData();
		const ruleId = field(form, 'ruleId');
		const values = valuesFrom(form);
		if (!ruleId) return fail(400, { error: 'Rule id is required.', values });
		try {
			await apiFetch(fetch, `/api/tradeups/plans/rules/${ruleId}`, { method: 'DELETE' });
			return { success: 'Rule deleted.' };
		} catch (err) {
			return actionError(err, values);
		}
	},

	addOutcome: async ({ request, fetch }) => {
		const form = await request.formData();
		const planId = field(form, 'planId');
		const values = valuesFrom(form);
		if (!planId) return fail(400, { error: 'Plan id is required.', values });
		try {
			await apiFetch<OutcomeItemDTO>(fetch, `/api/tradeups/plans/${planId}/outcomes`, {
				method: 'POST',
				body: JSON.stringify(outcomeBody(form, ''))
			});
			return { success: 'Outcome added.' };
		} catch (err) {
			return actionError(err, values);
		}
	},

	updateOutcome: async ({ request, fetch }) => {
		const form = await request.formData();
		const outcomeId = field(form, 'outcomeId');
		const values = valuesFrom(form);
		if (!outcomeId) return fail(400, { error: 'Outcome id is required.', values });
		try {
			await apiFetch<OutcomeItemDTO>(fetch, `/api/tradeups/plans/outcomes/${outcomeId}`, {
				method: 'PATCH',
				body: JSON.stringify(outcomeBody(form, ''))
			});
			return { success: 'Outcome updated.' };
		} catch (err) {
			return actionError(err, values);
		}
	},

	deleteOutcome: async ({ request, fetch }) => {
		const form = await request.formData();
		const outcomeId = field(form, 'outcomeId');
		const values = valuesFrom(form);
		if (!outcomeId) return fail(400, { error: 'Outcome id is required.', values });
		try {
			await apiFetch(fetch, `/api/tradeups/plans/outcomes/${outcomeId}`, { method: 'DELETE' });
			return { success: 'Outcome deleted.' };
		} catch (err) {
			return actionError(err, values);
		}
	}
};

function ruleBody(form: FormData, prefix: string) {
	return {
		collection: field(form, `${prefix}collection`),
		rarity: field(form, `${prefix}rarity`),
		exterior: field(form, `${prefix}exterior`),
		minFloat: numberField(form, `${prefix}minFloat`),
		maxFloat: numberField(form, `${prefix}maxFloat`),
		maxBuyPrice: numberField(form, `${prefix}maxBuyPrice`),
		minQuantity: numberField(form, `${prefix}minQuantity`),
		maxQuantity: numberField(form, `${prefix}maxQuantity`),
		priority: numberField(form, `${prefix}priority`) ?? 0,
		isPreferred: boolField(form, `${prefix}isPreferred`)
	};
}

function outcomeBody(form: FormData, prefix: string) {
	return {
		marketHashName: field(form, `${prefix}marketHashName`),
		weaponName: field(form, `${prefix}weaponName`),
		skinName: field(form, `${prefix}skinName`),
		collection: field(form, `${prefix}outcomeCollection`) ?? field(form, `${prefix}collection`),
		rarity: field(form, `${prefix}outcomeRarity`) ?? field(form, `${prefix}rarity`),
		estimatedMarketValue: numberField(form, `${prefix}estimatedMarketValue`),
		probabilityWeight: numberField(form, `${prefix}probabilityWeight`) ?? 1
	};
}

function hasRuleFields(rule: ReturnType<typeof ruleBody>) {
	return Boolean(rule.collection || rule.rarity || rule.exterior || rule.minFloat != null || rule.maxFloat != null);
}

function hasOutcomeFields(outcome: ReturnType<typeof outcomeBody>) {
	return Boolean(outcome.marketHashName);
}

async function simplePlanBody(form: FormData) {
	const collection = field(form, 'collection');
	const inputRarity = field(form, 'inputRarity') as ItemRarity | undefined;
	const exterior = field(form, 'exterior') as ItemExterior | undefined;
	const maxFloat = numberField(form, 'maxFloat');
	const maxBuyPrice = numberField(form, 'maxBuyPrice');

	if (!collection) throw new Error('Collection is required.');
	if (!inputRarity) throw new Error('Input rarity is required.');
	if (maxFloat == null) throw new Error('Maximum float is required.');
	if (maxBuyPrice == null) throw new Error('Maximum input price is required.');

	const targetRarity = getNextRarity(inputRarity);
	if (!targetRarity) throw new Error('Input rarity must have a trade-up target rarity.');

	const collectionIdentity = await resolveCatalogCollectionIdentity(collection);
	if (!collectionIdentity) {
		throw new Error('Pick a catalog-linked collection from the dropdown before creating a plan.');
	}

	const snapshot = await getCatalogSnapshot();
	const outputSkins = snapshot.skins
		.filter((skin) => skin.collectionId === collectionIdentity.catalogCollectionId && skin.rarity === targetRarity)
		.sort((a, b) => a.baseMarketHashName.localeCompare(b.baseMarketHashName));

	if (outputSkins.length === 0) {
		throw new Error('No catalog outputs found for that collection and target rarity.');
	}

	const marketHashNames = outputSkins.flatMap((skin) => skin.marketHashNames.map((entry) => entry.marketHashName));
	const latestPrices = await getLatestMarketPricesForMarketHashNames(marketHashNames);
	const basketMaxPrice = maxBuyPrice * 10;
	const generatedName = `${collectionIdentity.collection} ${inputRarity.replaceAll('_', ' ')} <= ${maxFloat}`;

	return {
		name: field(form, 'name') ?? generatedName,
		description: `Auto-generated single-collection plan for ${collectionIdentity.collection}.`,
		inputRarity,
		targetRarity,
		isActive: true,
		minProfitThreshold: undefined,
		minProfitPctThreshold: undefined,
		minLiquidityScore: undefined,
		minCompositeScore: undefined,
		notes: [
			`Input max float: ${maxFloat}`,
			`Input max price: $${maxBuyPrice.toFixed(2)}`,
			`Basket max float target: ${maxFloat}`,
			`Basket max price: $${basketMaxPrice.toFixed(2)}`,
			`Generated ${outputSkins.length} catalog outcome(s). Refresh Steam prices if fallback values are zero.`,
		].join('\n'),
		rules: [
			{
				collection: collectionIdentity.collection,
				rarity: inputRarity,
				exterior,
				minFloat: undefined,
				maxFloat,
				maxBuyPrice,
				minQuantity: 10,
				maxQuantity: 10,
				priority: 100,
				isPreferred: true,
			},
		],
		outcomeItems: outputSkins.map((skin) => {
			const pricedHash = skin.marketHashNames
				.map((entry) => ({
					entry,
					price: latestPrices.get(entry.marketHashName)?.marketValue ?? null,
				}))
				.find((entry) => entry.price != null);
			const chosenHash = pricedHash?.entry ?? skin.marketHashNames[0];
			return {
				marketHashName: chosenHash.marketHashName,
				weaponName: skin.weaponName,
				skinName: skin.skinName,
				collection: skin.collectionName,
				rarity: targetRarity,
				estimatedMarketValue: pricedHash?.price ?? 0,
				probabilityWeight: 1,
			};
		}),
	};
}

function copySearch(url: URL, keys: string[]) {
	const params = new URLSearchParams();
	for (const key of keys) {
		const value = url.searchParams.get(key);
		if (value) params.set(key, value);
	}
	const qs = params.toString();
	return qs ? `?${qs}` : '';
}

function filterFromUrl(url: URL) {
	return {
		isActive: url.searchParams.get('isActive') ? url.searchParams.get('isActive') === 'true' : undefined,
		inputRarity: url.searchParams.get('inputRarity') || undefined,
		targetRarity: url.searchParams.get('targetRarity') || undefined,
		search: url.searchParams.get('search') || undefined,
		sortBy: url.searchParams.get('sortBy') || 'createdAt',
		sortDir: url.searchParams.get('sortDir') || 'desc',
		page: searchNumber(url, 'page') ?? 1,
		limit: searchNumber(url, 'limit') ?? 25
	};
}

function searchNumber(url: URL, key: string) {
	const value = url.searchParams.get(key);
	return value ? Number(value) : undefined;
}

function field(form: FormData, name: string) {
	const value = form.get(name);
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function numberField(form: FormData, name: string) {
	const value = field(form, name);
	return value == null ? undefined : Number(value);
}

function boolField(form: FormData, name: string) {
	return form.get(name) === 'true' || form.get(name) === 'on';
}

function valuesFrom(form: FormData) {
	return Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === 'string'));
}

function actionError(err: unknown, values: Record<string, FormDataEntryValue>) {
	if (err instanceof ApiError) {
		return fail(err.status, { error: err.message, issues: err.issues, values });
	}
	if (err instanceof Error) {
		return fail(400, { error: err.message, values });
	}
	throw err;
}
