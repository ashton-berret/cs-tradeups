// GET /api/steam/inventory[?force=1]
//
// Returns a normalized snapshot of the configured Steam inventory. Reads
// STEAM_ID from env. Public-only — no auth, no cookies.

import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getSteamInventory, SteamInventoryError } from '$lib/server/steam/inventoryAdapter';
import { toErrorResponse } from '$lib/server/http/errors';

export const GET: RequestHandler = async ({ url }) => {
  const steamId = env.STEAM_ID?.trim();
  if (!steamId) {
    return json(
      {
        error: 'ConfigurationError',
        message: 'STEAM_ID is not set in the environment.',
      },
      { status: 503 },
    );
  }

  try {
    const force = url.searchParams.get('force') === '1';
    const snapshot = await getSteamInventory(steamId, { force });
    return json(snapshot);
  } catch (err) {
    if (err instanceof SteamInventoryError) {
      return json({ error: err.name, message: err.message }, { status: err.status });
    }
    return toErrorResponse(err);
  }
};
