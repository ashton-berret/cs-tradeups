import { error, fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ApiError, apiFetch } from '$lib/client/api';
import type { BasketFilter, PaginatedResponse } from '$lib/types/domain';
import type { BasketDTO, EvaluationResult, PlanDTO } from '$lib/types/services';

const filterKeys = ['status', 'planId', 'sortBy', 'sortDir', 'page', 'limit'];

export const load: PageServerLoad = async ({ fetch, url }) => {
	try {
		const [page, activePlans] = await Promise.all([
			apiFetch<PaginatedResponse<BasketDTO>>(fetch, `/api/tradeups/baskets${copySearch(url, filterKeys)}`),
			apiFetch<PaginatedResponse<PlanDTO>>(fetch, '/api/tradeups/plans?isActive=true&limit=100')
		]);
		return { page, activePlans: activePlans.data, filter: filterFromUrl(url) as BasketFilter };
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
			await apiFetch<BasketDTO>(fetch, '/api/tradeups/baskets', {
				method: 'POST',
				body: JSON.stringify({
					planId: field(form, 'planId'),
					name: field(form, 'name'),
					notes: field(form, 'notes')
				})
			});
			return { success: 'Basket created.' };
		} catch (err) {
			return actionError(err, values);
		}
	},

	updateMeta: async ({ request, fetch }) => {
		const form = await request.formData();
		const id = field(form, 'id');
		const values = valuesFrom(form);
		if (!id) return fail(400, { error: 'Basket id is required.', values });
		try {
			await apiFetch<BasketDTO>(fetch, `/api/tradeups/baskets/${id}`, {
				method: 'PATCH',
				body: JSON.stringify({ name: field(form, 'name'), notes: field(form, 'notes') })
			});
			return { success: 'Basket updated.' };
		} catch (err) {
			return actionError(err, values);
		}
	},

	delete: async ({ request, fetch }) => {
		const form = await request.formData();
		const id = field(form, 'id');
		const values = valuesFrom(form);
		if (!id) return fail(400, { error: 'Basket id is required.', values });
		try {
			await apiFetch(fetch, `/api/tradeups/baskets/${id}`, { method: 'DELETE' });
			return { success: 'Basket deleted.' };
		} catch (err) {
			return actionError(err, values);
		}
	},

	addItem: async ({ request, fetch }) => {
		const form = await request.formData();
		const id = field(form, 'id');
		const values = valuesFrom(form);
		if (!id) return fail(400, { error: 'Basket id is required.', values });
		try {
			await apiFetch<BasketDTO>(fetch, `/api/tradeups/baskets/${id}/items`, {
				method: 'POST',
				body: JSON.stringify({
					inventoryItemId: field(form, 'inventoryItemId'),
					slotIndex: numberField(form, 'slotIndex')
				})
			});
			return { success: 'Item added to basket.' };
		} catch (err) {
			return actionError(err, values);
		}
	},

	removeItem: async ({ request, fetch }) => {
		const form = await request.formData();
		const id = field(form, 'id');
		const inventoryItemId = field(form, 'inventoryItemId');
		const values = valuesFrom(form);
		if (!id || !inventoryItemId) return fail(400, { error: 'Basket and inventory ids are required.', values });
		try {
			await apiFetch<BasketDTO>(fetch, `/api/tradeups/baskets/${id}/items/${inventoryItemId}`, {
				method: 'DELETE'
			});
			return { success: 'Item removed from basket.' };
		} catch (err) {
			return actionError(err, values);
		}
	},

	reorder: async () => fail(400, { error: 'Basket reorder is deferred for Phase 4.' }),

	markReady: async ({ request, fetch }) => {
		const form = await request.formData();
		const id = field(form, 'id');
		const values = valuesFrom(form);
		if (!id) return fail(400, { error: 'Basket id is required.', values });
		try {
			const evaluation = await apiFetch<EvaluationResult>(fetch, '/api/tradeups/evaluate', {
				method: 'POST',
				body: JSON.stringify({ kind: 'basket', id })
			});
			if (evaluation.kind === 'basket' && evaluation.result.readinessIssues.length > 0) {
				return fail(409, {
					error: 'Basket is not ready.',
					issues: evaluation.result.readinessIssues,
					values
				});
			}
			await apiFetch<BasketDTO>(fetch, `/api/tradeups/baskets/${id}/ready`, { method: 'POST' });
			return { success: 'Basket marked ready.' };
		} catch (err) {
			return actionError(err, values);
		}
	},

	cancel: async ({ request, fetch }) => {
		const form = await request.formData();
		const id = field(form, 'id');
		const values = valuesFrom(form);
		if (!id) return fail(400, { error: 'Basket id is required.', values });
		try {
			await apiFetch<BasketDTO>(fetch, `/api/tradeups/baskets/${id}/cancel`, { method: 'POST' });
			return { success: 'Basket cancelled.' };
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
		planId: url.searchParams.get('planId') || undefined,
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
	if (err instanceof ApiError) return fail(err.status, { error: err.message, issues: err.issues, values });
	throw err;
}
