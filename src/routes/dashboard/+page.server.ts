import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ApiError, apiFetch } from '$lib/client/api';
import type { EvRealizedPoint, PlanPerformanceRow } from '$lib/types/services';
import type { AnalyticsSummaryDTO } from '$lib/client/viewModels/dashboard';

export interface NetWorthPoint {
	date: string;
	costBasis: number;
	estValue: number;
}

export const load: PageServerLoad = async ({ fetch }) => {
	try {
		const [summary, planPerformance, evRealized, netWorth] = await Promise.all([
			apiFetch<AnalyticsSummaryDTO>(fetch, '/api/analytics/summary'),
			apiFetch<PlanPerformanceRow[]>(fetch, '/api/analytics/plan-performance'),
			apiFetch<EvRealizedPoint[]>(fetch, '/api/analytics/expected-vs-realized'),
			apiFetch<NetWorthPoint[]>(fetch, '/api/analytics/net-worth')
		]);

		return { summary, planPerformance, evRealized, netWorth };
	} catch (err) {
		if (err instanceof ApiError) error(err.status, err.message);
		throw err;
	}
};
