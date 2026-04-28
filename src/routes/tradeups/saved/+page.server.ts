import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ApiError, apiFetch } from '$lib/client/api';
import type { CombinationDTO } from '$lib/server/tradeups/combinationService';

export const load: PageServerLoad = async ({ fetch }) => {
	try {
		const body = await apiFetch<{ combinations: CombinationDTO[] }>(
			fetch,
			'/api/tradeups/combinations',
		);
		return { combinations: body.combinations };
	} catch (err) {
		if (err instanceof ApiError) error(err.status, err.message);
		throw err;
	}
};
