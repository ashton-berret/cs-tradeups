import { error, fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ApiError, apiFetch } from '$lib/client/api';
import type { CandidateFilter, PaginatedResponse } from '$lib/types/domain';
import type { CandidateDTO, InventoryItemDTO, PlanDTO } from '$lib/types/services';

const filterKeys = [
	'status',
	'collection',
	'rarity',
	'exterior',
	'minFloat',
	'maxFloat',
	'minPrice',
	'maxPrice',
	'search',
	'sortBy',
	'sortDir',
	'page',
	'limit'
];

export const load: PageServerLoad = async ({ fetch, url }) => {
	const query = copySearch(url, filterKeys);

	try {
		const [page, activePlans] = await Promise.all([
			apiFetch<PaginatedResponse<CandidateDTO>>(fetch, `/api/candidates${query}`),
			apiFetch<PaginatedResponse<PlanDTO>>(fetch, '/api/tradeups/plans?isActive=true&limit=100')
		]);

		return {
			page,
			filter: filterFromUrl(url) as CandidateFilter,
			activePlans: activePlans.data
		};
	} catch (err) {
		if (err instanceof ApiError) {
			error(err.status, err.message);
		}
		throw err;
	}
};

export const actions: Actions = {
	setStatus: async ({ request, fetch }) => {
		const form = await request.formData();
		const id = field(form, 'id');
		const values = valuesFrom(form);
		if (!id) return fail(400, { error: 'Candidate id is required.', values });

		try {
			await apiFetch<CandidateDTO>(fetch, `/api/candidates/${id}`, {
				method: 'PATCH',
				body: JSON.stringify({ status: field(form, 'status'), notes: field(form, 'notes') })
			});
			return { success: 'Candidate status updated.' };
		} catch (err) {
			return actionError(err, values);
		}
	},

	buy: async ({ request, fetch }) => {
		const form = await request.formData();
		const id = field(form, 'id');
		const values = valuesFrom(form);
		if (!id) return fail(400, { error: 'Candidate id is required.', values });

		try {
			await apiFetch<{ candidate: CandidateDTO; inventoryItem: InventoryItemDTO }>(
				fetch,
				`/api/candidates/${id}/buy`,
				{
					method: 'POST',
					body: JSON.stringify({
						purchasePrice: numberField(form, 'purchasePrice'),
						purchaseFees: numberField(form, 'purchaseFees'),
						purchaseDate: field(form, 'purchaseDate')
					})
				}
			);
			return { success: 'Candidate converted to inventory.' };
		} catch (err) {
			return actionError(err, values);
		}
	},

	reevaluate: async ({ request, fetch }) => {
		const form = await request.formData();
		const id = field(form, 'id');
		const values = valuesFrom(form);
		if (!id) return fail(400, { error: 'Candidate id is required.', values });

		try {
			await apiFetch(fetch, `/api/candidates/${id}/reevaluate`, { method: 'POST' });
			return { success: 'Candidate re-evaluated.' };
		} catch (err) {
			return actionError(err, values);
		}
	},

	create: async ({ request, fetch }) => {
		const form = await request.formData();
		const values = valuesFrom(form);

		try {
			await apiFetch<CandidateDTO>(fetch, '/api/candidates', {
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
					listPrice: numberField(form, 'listPrice'),
					currency: field(form, 'currency') ?? 'USD',
					listingUrl: field(form, 'listingUrl'),
					listingId: field(form, 'listingId'),
					source: 'MANUAL',
					notes: field(form, 'notes')
				})
			});
			return { success: 'Candidate created.' };
		} catch (err) {
			return actionError(err, values);
		}
	},

	delete: async ({ request, fetch }) => {
		const form = await request.formData();
		const id = field(form, 'id');
		const values = valuesFrom(form);
		if (!id) return fail(400, { error: 'Candidate id is required.', values });

		try {
			await apiFetch(fetch, `/api/candidates/${id}`, { method: 'DELETE' });
			return { success: 'Candidate deleted.' };
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
		minFloat: searchNumber(url, 'minFloat'),
		maxFloat: searchNumber(url, 'maxFloat'),
		minPrice: searchNumber(url, 'minPrice'),
		maxPrice: searchNumber(url, 'maxPrice'),
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
