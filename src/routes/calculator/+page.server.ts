import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ApiError, apiFetch } from '$lib/client/api';
import type { PlanDTO } from '$lib/types/services';
import type { PaginatedResponse } from '$lib/types/domain';

export const load: PageServerLoad = async ({ fetch }) => {
	try {
		const plansPage = await apiFetch<PaginatedResponse<PlanDTO>>(
			fetch,
			'/api/tradeups/plans?isActive=true&limit=100',
		);
		return { plans: plansPage.data };
	} catch (err) {
		if (err instanceof ApiError) error(err.status, err.message);
		throw err;
	}
};
