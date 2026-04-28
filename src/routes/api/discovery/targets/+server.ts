import { json, type RequestHandler } from '@sveltejs/kit';
import { buildDiscoveryTargets } from '$lib/server/discovery/watchlistService';
import { requireExtensionSecret } from '$lib/server/http/extensionAuth';
import { toErrorResponse } from '$lib/server/http/errors';

export const GET: RequestHandler = async ({ request }) => {
  try {
    requireExtensionSecret(request);
    return json(await buildDiscoveryTargets());
  } catch (err) {
    return toErrorResponse(err);
  }
};
