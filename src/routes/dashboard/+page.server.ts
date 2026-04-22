import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ApiError, apiFetch } from '$lib/client/api';
import type { ActivityEntry, EvRealizedPoint, PlanPerformanceRow } from '$lib/types/services';
import type { AnalyticsSummaryDTO } from '$lib/client/viewModels/dashboard';

export const load: PageServerLoad = async ({ fetch }) => {
	try {
		const [summary, activity, planPerformance, evRealized] = await Promise.all([
			apiFetch<AnalyticsSummaryDTO>(fetch, '/api/analytics/summary'),
			apiFetch<ActivityEntry[]>(fetch, '/api/analytics/activity?limit=20'),
			apiFetch<PlanPerformanceRow[]>(fetch, '/api/analytics/plan-performance'),
			apiFetch<EvRealizedPoint[]>(fetch, '/api/analytics/expected-vs-realized')
		]);

		return { summary, activity, planPerformance, evRealized };
	} catch (err) {
		if (err instanceof ApiError) error(err.status, err.message);
		throw err;
	}
};
