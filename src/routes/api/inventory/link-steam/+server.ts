// POST /api/inventory/link-steam
//
// Pull the public Steam inventory snapshot and link unmatched Steam assets
// to existing InventoryItem rows by market hash name. Returns a summary so
// the UI can report how many were linked and which Steam items are still
// orphaned.

import { json, type RequestHandler } from '@sveltejs/kit';
import { syncInventoryWithSteam } from '$lib/server/inventory/steamLinkService';
import { SteamInventoryError } from '$lib/server/steam/inventoryAdapter';
import { toErrorResponse } from '$lib/server/http/errors';

export const POST: RequestHandler = async ({ url }) => {
  try {
    const force = url.searchParams.get('force') === '1';
    const summary = await syncInventoryWithSteam({ force });
    return json(summary);
  } catch (err) {
    if (err instanceof SteamInventoryError) {
      return json({ error: err.name, message: err.message }, { status: err.status });
    }
    return toErrorResponse(err);
  }
};
