import { error, fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ApiError, apiFetch } from '$lib/client/api';
import type { MarketPriceLatestListFilter, PaginatedResponse } from '$lib/types/domain';
import type {
	MarketPriceObservationDTO,
	MarketPriceObservedSourceDTO,
	MarketPriceObservationSummaryDTO
} from '$lib/server/marketPrices/priceService';
import type {
	MarketPriceFullRefreshResult
} from '$lib/server/marketPrices/refreshService';
import { refreshMarketPricesAndDependents } from '$lib/server/marketPrices/refreshService';
import {
	buildMarketPriceWatchlist,
	listEngineComboCollectionOptions
} from '$lib/server/marketPrices/watchlist';
import { getRecentSweeps } from '$lib/server/marketPrices/sweepService';
import {
	getLatestQuantiles,
	recomputeQuantiles,
	type PriceQuantileSnapshotDTO
} from '$lib/server/engine/priceQuantileService';

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
		const [sweeps, engineCollections] = await Promise.all([
			getRecentSweeps(10),
			listEngineComboCollectionOptions()
		]);

		const skinIds = [...new Set(page.data.map((o) => o.catalogSkinId).filter(Boolean) as string[])];
		const quantiles = skinIds.length > 0
			? await getLatestQuantiles({ catalogSkinIds: skinIds })
			: [];

		return {
			page,
			summary,
			sources,
			sweeps,
			quantiles,
			engineCollections,
			filter: filterFromUrl(url) as MarketPriceLatestListFilter
		};
	} catch (err) {
		if (err instanceof ApiError) error(err.status, err.message);
		throw err;
	}
};

export const actions: Actions = {
	recomputeQuantiles: async () => {
		try {
			const result = await recomputeQuantiles();
			const coldCount = result.snapshots.filter((s) => s.coldStart).length;
			return {
				success: `Recomputed ${result.snapshots.length} quantile snapshot${result.snapshots.length === 1 ? '' : 's'} in ${result.durationMs}ms. ${coldCount} cold-start.`
			};
		} catch (err) {
			return actionError(err, {});
		}
	},

	refreshDependent: async ({ fetch }) => {
		try {
			const result = await apiFetch<MarketPriceFullRefreshResult>(
				fetch,
				'/api/market-prices/refresh',
				{ method: 'POST' }
			);
			return {
				success: refreshSuccessMessage(result),
				importResult: { count: priceRefreshWritten(result), priceRefresh: result.prices, refresh: result.dependents }
			};
		} catch (err) {
			return actionError(err, {});
		}
	},

	previewEngineBootstrap: async ({ request }) => {
		const form = await request.formData();
		const values = valuesFrom(form);

		try {
			const filter = engineBootstrapFilterFromForm(form);
			const watchlist = await buildMarketPriceWatchlist({
				engineOnly: true,
				engineCollectionIds: filter.collectionIds
			});
			const names =
				filter.limit == null ? watchlist.marketHashNames : watchlist.marketHashNames.slice(0, filter.limit);

			return {
				success: `Previewed ${names.length} engine price target${names.length === 1 ? '' : 's'}${filter.limit != null && watchlist.marketHashNames.length > filter.limit ? ` from ${watchlist.marketHashNames.length} total` : ''}.`,
				values,
				engineBootstrapPreview: {
					total: watchlist.marketHashNames.length,
					limitedTotal: names.length,
					counts: watchlist.counts,
					collectionIds: filter.collectionIds,
					limit: filter.limit,
					sample: names.slice(0, 25)
				}
			};
		} catch (err) {
			return actionError(err, values);
		}
	},

	refreshEngineBootstrap: async ({ request }) => {
		const form = await request.formData();
		const values = valuesFrom(form);

		try {
			const filter = engineBootstrapFilterFromForm(form);
			const result = await refreshMarketPricesAndDependents({
				notes: `Engine price bootstrap${filter.collectionIds.length > 0 ? `: ${filter.collectionIds.join(', ')}` : ''}`,
				prices: {
					watchlist: {
						engineOnly: true,
						engineCollectionIds: filter.collectionIds
					},
					limit: filter.limit
				}
			});

			return {
				success: refreshSuccessMessage(result),
				values,
				importResult: { count: priceRefreshWritten(result), priceRefresh: result.prices, refresh: result.dependents }
			};
		} catch (err) {
			return actionError(err, values);
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
	priceRefresh?: MarketPriceFullRefreshResult['prices'];
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

function engineBootstrapFilterFromForm(form: FormData) {
	return {
		collectionIds: form
			.getAll('engineCollections')
			.filter((value): value is string => typeof value === 'string' && value.trim() !== '')
			.map((value) => value.trim()),
		limit: parseOptionalPositiveInteger(field(form, 'engineLimit'), 'Limit')
	};
}

function parseOptionalPositiveInteger(value: string | undefined, label: string): number | undefined {
	if (value == null) return undefined;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new ApiError(400, { error: `${label} must be a positive integer.` });
	}
	return parsed;
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

function refreshSuccessMessage(result: MarketPriceFullRefreshResult) {
	const written = priceRefreshWritten(result);
	const requested = result.prices.summaries.reduce((sum, summary) => sum + summary.requested, 0);
	const skipped = result.prices.summaries.reduce((sum, summary) => sum + summary.skipped, 0);
	const priceErrors = result.prices.summaries.reduce((sum, summary) => sum + summary.errors.length, 0);
	const refresh = result.dependents;
	const prices = `Refreshed Steam watchlist: ${written} written, ${skipped} skipped, ${requested} requested.`;
	const refreshed = `Refreshed ${refresh.candidatesReevaluated} open candidate${refresh.candidatesReevaluated === 1 ? '' : 's'} and ${refresh.basketsRecomputed} active basket${refresh.basketsRecomputed === 1 ? '' : 's'}.`;
	const failures =
		refresh.basketErrors.length > 0 || priceErrors > 0
			? ` ${priceErrors} price error${priceErrors === 1 ? '' : 's'} and ${refresh.basketErrors.length} basket refresh error${refresh.basketErrors.length === 1 ? '' : 's'}.`
			: '';

	return `${prices} ${refreshed}${failures}`;
}

function priceRefreshWritten(result: MarketPriceFullRefreshResult) {
	return result.prices.summaries.reduce((sum, summary) => sum + summary.written, 0);
}
