import { error, fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ApiError, apiFetch } from '$lib/client/api';
import type { ExecutionFilter, PaginatedResponse } from '$lib/types/domain';
import type { BasketDTO, ExecutionDTO } from '$lib/types/services';

const filterKeys = ['planId', 'hasResult', 'hasSale', 'sortBy', 'sortDir', 'page', 'limit'];

export const load: PageServerLoad = async ({ fetch, url }) => {
	try {
		const [page, readyBaskets] = await Promise.all([
			apiFetch<PaginatedResponse<ExecutionDTO>>(fetch, `/api/tradeups/executions${copySearch(url, filterKeys)}`),
			apiFetch<PaginatedResponse<BasketDTO>>(fetch, '/api/tradeups/baskets?status=READY&limit=100')
		]);
		return { page, readyBaskets: readyBaskets.data, filter: filterFromUrl(url) as ExecutionFilter };
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
			await apiFetch<ExecutionDTO>(fetch, '/api/tradeups/executions', {
				method: 'POST',
				body: JSON.stringify({
					basketId: field(form, 'basketId'),
					executedAt: field(form, 'executedAt'),
					notes: field(form, 'notes')
				})
			});
			return { success: 'Execution recorded.' };
		} catch (err) {
			return actionError(err, values);
		}
	},

	recordResult: async ({ request, fetch }) => {
		const form = await request.formData();
		const id = field(form, 'id');
		const values = valuesFrom(form);
		if (!id) return fail(400, { error: 'Execution id is required.', values });
		try {
			await apiFetch<ExecutionDTO>(fetch, `/api/tradeups/executions/${id}/result`, {
				method: 'PATCH',
				body: JSON.stringify({
					resultMarketHashName: field(form, 'resultMarketHashName'),
					resultWeaponName: field(form, 'resultWeaponName'),
					resultSkinName: field(form, 'resultSkinName'),
					resultCollection: field(form, 'resultCollection'),
					resultExterior: field(form, 'resultExterior'),
					resultFloatValue: numberField(form, 'resultFloatValue'),
					estimatedResultValue: numberField(form, 'estimatedResultValue')
				})
			});
			return { success: 'Execution result recorded.' };
		} catch (err) {
			return actionError(err, values);
		}
	},

	recordSale: async ({ request, fetch }) => {
		const form = await request.formData();
		const id = field(form, 'id');
		const values = valuesFrom(form);
		if (!id) return fail(400, { error: 'Execution id is required.', values });
		try {
			await apiFetch<ExecutionDTO>(fetch, `/api/tradeups/executions/${id}/sale`, {
				method: 'PATCH',
				body: JSON.stringify({
					salePrice: numberField(form, 'salePrice'),
					saleFees: numberField(form, 'saleFees'),
					saleDate: field(form, 'saleDate')
				})
			});
			return { success: 'Sale recorded.' };
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
		planId: url.searchParams.get('planId') || undefined,
		hasResult: url.searchParams.get('hasResult') ? url.searchParams.get('hasResult') === 'true' : undefined,
		hasSale: url.searchParams.get('hasSale') ? url.searchParams.get('hasSale') === 'true' : undefined,
		sortBy: url.searchParams.get('sortBy') || 'executedAt',
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
