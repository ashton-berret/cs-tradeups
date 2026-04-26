import { error, fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ApiError, apiFetch } from '$lib/client/api';
import type { MarketPriceLatestListFilter, PaginatedResponse } from '$lib/types/domain';
import type {
	MarketPriceObservationDTO,
	MarketPriceObservedSourceDTO,
	MarketPriceObservationSummaryDTO
} from '$lib/server/marketPrices/priceService';
import type { MarketPriceImportRefreshResult } from '$lib/server/marketPrices/refreshService';

const filterKeys = ['search', 'source', 'currency', 'latestOnly', 'sortBy', 'sortDir', 'page', 'limit'];

export const load: PageServerLoad = async ({ fetch, url }) => {
	try {
		const page = await apiFetch<PaginatedResponse<MarketPriceObservationDTO>>(
			fetch,
			`/api/market-prices/latest${copySearch(url, filterKeys)}`
		);
		const summary = await apiFetch<MarketPriceObservationSummaryDTO[]>(
			fetch,
			`/api/market-prices/summary${copySearch(url, ['search', 'source', 'currency', 'latestOnly'])}`
		);
		const sources = await apiFetch<MarketPriceObservedSourceDTO[]>(fetch, '/api/market-prices/sources');

		return { page, summary, sources, filter: filterFromUrl(url) as MarketPriceLatestListFilter };
	} catch (err) {
		if (err instanceof ApiError) error(err.status, err.message);
		throw err;
	}
};

export const actions: Actions = {
	refreshDependent: async ({ fetch }) => {
		try {
			const result = await apiFetch<MarketPriceImportRefreshResult>(
				fetch,
				'/api/market-prices/refresh',
				{ method: 'POST' }
			);
			return {
				success: refreshSuccessMessage(result),
				importResult: { count: 0, refresh: result }
			};
		} catch (err) {
			return actionError(err, {});
		}
	},

	importJson: async ({ request, fetch }) => {
		const form = await request.formData();
		const payload = field(form, 'payload');
		const values = valuesFrom(form);

		if (!payload) {
			return fail(400, { error: 'Paste a JSON import payload.', values });
		}

		try {
			const body = JSON.parse(payload);
			const result = await apiFetch<MarketPriceImportResult>(fetch, '/api/market-prices/import', {
				method: 'POST',
				body: JSON.stringify(body)
			});
			return { success: importSuccessMessage(result), importResult: result };
		} catch (err) {
			if (err instanceof SyntaxError) {
				return fail(400, { error: 'Import payload is not valid JSON.', values });
			}
			return actionError(err, values);
		}
	},

	importCsv: async ({ request, fetch }) => {
		const form = await request.formData();
		const csvPayload = (await fileText(form, 'csvFile')) ?? field(form, 'csvPayload');
		const csvSource = field(form, 'csvSource') ?? 'LOCAL_CSV_IMPORT';
		const values = valuesFrom(form);

		if (!csvPayload) {
			return fail(400, { error: 'Choose a CSV file or paste CSV import rows.', values });
		}

		try {
			const result = await apiFetch<MarketPriceImportResult>(
				fetch,
				`/api/market-prices/import?source=${encodeURIComponent(csvSource)}`,
				{
					method: 'POST',
					headers: { 'content-type': 'text/csv' },
					body: csvPayload
				}
			);
			return { success: importSuccessMessage(result), importResult: result };
		} catch (err) {
			return actionError(err, values);
		}
	}
};

interface MarketPriceImportResult {
	count: number;
	observations?: MarketPriceObservationDTO[];
	refresh?: {
		candidatesReevaluated: number;
		basketsRecomputed: number;
		basketErrors: Array<{ id: string; message: string }>;
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
		search: url.searchParams.get('search') || undefined,
		source: url.searchParams.get('source') || undefined,
		currency: url.searchParams.get('currency') || undefined,
		latestOnly: url.searchParams.get('latestOnly') !== 'false',
		sortBy: url.searchParams.get('sortBy') || 'observedAt',
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

function valuesFrom(form: FormData) {
	return Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === 'string'));
}

async function fileText(form: FormData, name: string) {
	const value = form.get(name);
	if (!(value instanceof File) || value.size === 0) return undefined;
	return value.text();
}

function actionError(err: unknown, values: Record<string, FormDataEntryValue>) {
	if (err instanceof ApiError) {
		return fail(err.status, {
			error: err.message,
			issues: err.issues,
			rowErrors: err.rowErrors,
			values
		});
	}
	throw err;
}

function importSuccessMessage(result: MarketPriceImportResult) {
	const imported = `Imported ${result.count} price observation${result.count === 1 ? '' : 's'}.`;
	if (!result.refresh) return imported;

	const refreshed = `Refreshed ${result.refresh.candidatesReevaluated} open candidate${result.refresh.candidatesReevaluated === 1 ? '' : 's'} and ${result.refresh.basketsRecomputed} active basket${result.refresh.basketsRecomputed === 1 ? '' : 's'}.`;
	const failures =
		result.refresh.basketErrors.length > 0
			? ` ${result.refresh.basketErrors.length} basket refresh error${result.refresh.basketErrors.length === 1 ? '' : 's'}.`
			: '';

	return `${imported} ${refreshed}${failures}`;
}

function refreshSuccessMessage(refresh: MarketPriceImportRefreshResult) {
	const refreshed = `Refreshed ${refresh.candidatesReevaluated} open candidate${refresh.candidatesReevaluated === 1 ? '' : 's'} and ${refresh.basketsRecomputed} active basket${refresh.basketsRecomputed === 1 ? '' : 's'}.`;
	const failures =
		refresh.basketErrors.length > 0
			? ` ${refresh.basketErrors.length} basket refresh error${refresh.basketErrors.length === 1 ? '' : 's'}.`
			: '';

	return `${refreshed}${failures}`;
}
