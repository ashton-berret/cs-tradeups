import { error, fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ApiError, apiFetch } from '$lib/client/api';
import type { InventoryFilter, PaginatedResponse } from '$lib/types/domain';
import type { InventoryItemDTO } from '$lib/types/services';

const filterKeys = [
	'status',
	'collection',
	'rarity',
	'exterior',
	'availableForBasket',
	'search',
	'sortBy',
	'sortDir',
	'page',
	'limit'
];

export const load: PageServerLoad = async ({ fetch, url }) => {
	try {
		const page = await apiFetch<PaginatedResponse<InventoryItemDTO>>(
			fetch,
			`/api/inventory${copySearch(url, filterKeys)}`
		);

		return { page, filter: filterFromUrl(url) as InventoryFilter };
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
			await apiFetch<InventoryItemDTO>(fetch, '/api/inventory', {
				method: 'POST',
				body: JSON.stringify({
					marketHashName: field(form, 'marketHashName'),
					weaponName: field(form, 'weaponName'),
					skinName: field(form, 'skinName'),
					collection: field(form, 'collection'),
					rarity: field(form, 'rarity'),
					exterior: field(form, 'exterior'),
					floatValue: numberField(form, 'floatValue'),
					pattern: numberField(form, 'pattern'),
					inspectLink: field(form, 'inspectLink'),
					purchasePrice: numberField(form, 'purchasePrice'),
					purchaseCurrency: field(form, 'purchaseCurrency') ?? 'USD',
					purchaseFees: numberField(form, 'purchaseFees'),
					purchaseDate: field(form, 'purchaseDate'),
					notes: field(form, 'notes')
				})
			});
			return { success: 'Inventory item created.' };
		} catch (err) {
			return actionError(err, values);
		}
	},

	update: async ({ request, fetch }) => {
		const form = await request.formData();
		const id = field(form, 'id');
		const values = valuesFrom(form);
		if (!id) return fail(400, { error: 'Inventory item id is required.', values });

		try {
			await apiFetch<InventoryItemDTO>(fetch, `/api/inventory/${id}`, {
				method: 'PATCH',
				body: JSON.stringify({
					status: field(form, 'status'),
					currentEstValue: numberField(form, 'currentEstValue'),
					notes: field(form, 'notes')
				})
			});
			return { success: 'Inventory item updated.' };
		} catch (err) {
			return actionError(err, values);
		}
	},

	delete: async ({ request, fetch }) => {
		const form = await request.formData();
		const id = field(form, 'id');
		const values = valuesFrom(form);
		if (!id) return fail(400, { error: 'Inventory item id is required.', values });

		try {
			await apiFetch(fetch, `/api/inventory/${id}`, { method: 'DELETE' });
			return { success: 'Inventory item deleted.' };
		} catch (err) {
			return actionError(err, values);
		}
	}
};

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
		status: url.searchParams.get('status') || undefined,
		collection: url.searchParams.get('collection') || undefined,
		rarity: url.searchParams.get('rarity') || undefined,
		exterior: url.searchParams.get('exterior') || undefined,
		availableForBasket: url.searchParams.get('availableForBasket') === 'true' ? true : undefined,
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

function valuesFrom(form: FormData) {
	return Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === 'string'));
}

function actionError(err: unknown, values: Record<string, FormDataEntryValue>) {
	if (err instanceof ApiError) {
		return fail(err.status, { error: err.message, issues: err.issues, values });
	}
	throw err;
}
