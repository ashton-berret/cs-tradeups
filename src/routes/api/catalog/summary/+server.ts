import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCatalogSummary } from '$lib/server/catalog/catalogService';
import { toErrorResponse } from '$lib/server/http/errors';

export const GET: RequestHandler = async () => {
	try {
		return json(await getCatalogSummary());
	} catch (error) {
		return toErrorResponse(error);
	}
};
