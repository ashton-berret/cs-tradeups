import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCatalogSnapshot } from '$lib/server/catalog/catalogService';
import { toErrorResponse } from '$lib/server/http/errors';

export const GET: RequestHandler = async () => {
	try {
		return json(await getCatalogSnapshot());
	} catch (error) {
		return toErrorResponse(error);
	}
};
