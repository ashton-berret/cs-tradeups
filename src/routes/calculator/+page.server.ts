import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ApiError, apiFetch } from '$lib/client/api';
import type { PlanDTO } from '$lib/types/services';
import type { PaginatedResponse } from '$lib/types/domain';

export const load: PageServerLoad = async ({ fetch }) => {
	try {
		const plansPage = await apiFetch<PaginatedResponse<PlanDTO>>(
			fetch,
			'/api/tradeups/plans?limit=100',
		);
		// Sort active plans to the top so the dropdown still favors them, but
		// inactive (draft) plans remain reachable for tweaking and reuse.
		const plans = [...plansPage.data].sort((a, b) => {
			if (a.isActive === b.isActive) return a.name.localeCompare(b.name);
			return a.isActive ? -1 : 1;
		});
		return { plans };
	} catch (err) {
		if (err instanceof ApiError) error(err.status, err.message);
		throw err;
	}
};
