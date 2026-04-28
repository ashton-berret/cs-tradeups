import type { CreateMarketPriceObservationInput } from '$lib/server/marketPrices/priceService';

export const STEAM_PRICEOVERVIEW_SOURCE = 'STEAM_PRICEOVERVIEW';

const STEAM_PRICEOVERVIEW_URL = 'https://steamcommunity.com/market/priceoverview/';
const DEFAULT_DELAY_MS = 3000;

let nextAllowedAt = 0;

export interface SteamPriceoverviewAdapterOptions {
  currency?: number;
  appId?: number;
  delayMs?: number;
  fetchImpl?: typeof fetch;
}

export async function fetchSteamPriceoverview(
  marketHashName: string,
  options: SteamPriceoverviewAdapterOptions = {},
): Promise<CreateMarketPriceObservationInput | null> {
  const name = marketHashName.trim();
  if (!name) return null;

  await waitForRateLimit(options.delayMs ?? DEFAULT_DELAY_MS);

  const fetchImpl = options.fetchImpl ?? fetch;
  const url = new URL(STEAM_PRICEOVERVIEW_URL);
  url.searchParams.set('appid', String(options.appId ?? 730));
  url.searchParams.set('currency', String(options.currency ?? 1));
  url.searchParams.set('market_hash_name', name);

  const response = await fetchImpl(url, {
    headers: {
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Steam priceoverview failed for ${name}: HTTP ${response.status}`);
  }

  const body = (await response.json()) as SteamPriceoverviewResponse;
  if (!body.success) {
    return null;
  }

  const lowestSellPrice = parseSteamMoney(body.lowest_price);
  const medianSellPrice = parseSteamMoney(body.median_price);

  if (lowestSellPrice == null && medianSellPrice == null) {
    return null;
  }

  return {
    marketHashName: name,
    currency: 'USD',
    lowestSellPrice,
    medianSellPrice,
    volume: parseSteamVolume(body.volume),
    source: STEAM_PRICEOVERVIEW_SOURCE,
    observedAt: new Date(),
    rawPayload: body,
  };
}

export async function fetchManySteamPriceoverview(
  marketHashNames: string[],
  options: SteamPriceoverviewAdapterOptions = {},
): Promise<Array<CreateMarketPriceObservationInput & { error?: never }>> {
  const observations: CreateMarketPriceObservationInput[] = [];

  for (const marketHashName of marketHashNames) {
    const observation = await fetchSteamPriceoverview(marketHashName, options);
    if (observation) {
      observations.push(observation);
    }
  }

  return observations;
}

export function parseSteamMoney(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/[^0-9.,-]/g, '').replaceAll(',', '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseSteamVolume(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/[^0-9]/g, ''));
  return Number.isInteger(parsed) ? parsed : null;
}

async function waitForRateLimit(delayMs: number): Promise<void> {
  const now = Date.now();
  const waitMs = Math.max(0, nextAllowedAt - now);
  nextAllowedAt = Math.max(now, nextAllowedAt) + delayMs;

  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

interface SteamPriceoverviewResponse {
  success: boolean;
  lowest_price?: string;
  median_price?: string;
  volume?: string;
}
