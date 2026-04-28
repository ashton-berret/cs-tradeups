import { db } from '$lib/server/db/client';
import {
  createMarketPriceObservation,
  type CreateMarketPriceObservationInput,
} from '$lib/server/marketPrices/priceService';
import {
  fetchSteamPriceoverview,
  STEAM_PRICEOVERVIEW_SOURCE,
  type SteamPriceoverviewAdapterOptions,
} from './adapters/steamPriceoverview';
import { buildMarketPriceWatchlist } from './watchlist';

const DEFAULT_RECENT_SKIP_MS = 30 * 60 * 1000;

export interface MarketPriceRefreshSummary {
  adapter: string;
  requested: number;
  written: number;
  skipped: number;
  errors: Array<{ marketHashName: string; message: string }>;
}

export interface MarketPriceRefreshJobResult {
  watchlistCount: number;
  watchlist: {
    activePlanOutcomes: number;
    combinationSnapshotOutcomes: number;
    openCandidates: number;
    inventoryItems: number;
    executionResults: number;
  };
  summaries: MarketPriceRefreshSummary[];
}

export interface RefreshSteamWatchlistOptions {
  marketHashNames?: string[];
  recentSkipMs?: number;
  steam?: SteamPriceoverviewAdapterOptions;
}

export async function refreshSteamMarketWatchlist(
  options: RefreshSteamWatchlistOptions = {},
): Promise<MarketPriceRefreshJobResult> {
  const watchlist = options.marketHashNames
    ? {
        marketHashNames: Array.from(new Set(options.marketHashNames.map((name) => name.trim()).filter(Boolean))),
        counts: {
          activePlanOutcomes: 0,
          combinationSnapshotOutcomes: 0,
          openCandidates: 0,
          inventoryItems: 0,
          executionResults: 0,
        },
      }
    : await buildMarketPriceWatchlist();

  const summary = await refreshSteamNames(watchlist.marketHashNames, options);

  return {
    watchlistCount: watchlist.marketHashNames.length,
    watchlist: watchlist.counts,
    summaries: [summary],
  };
}

async function refreshSteamNames(
  marketHashNames: string[],
  options: RefreshSteamWatchlistOptions,
): Promise<MarketPriceRefreshSummary> {
  const summary: MarketPriceRefreshSummary = {
    adapter: STEAM_PRICEOVERVIEW_SOURCE,
    requested: marketHashNames.length,
    written: 0,
    skipped: 0,
    errors: [],
  };
  const recentCutoff = new Date(Date.now() - (options.recentSkipMs ?? DEFAULT_RECENT_SKIP_MS));

  for (const marketHashName of marketHashNames) {
    try {
      if (await hasRecentObservation(marketHashName, STEAM_PRICEOVERVIEW_SOURCE, recentCutoff)) {
        summary.skipped += 1;
        continue;
      }

      const observation = await fetchSteamPriceoverview(marketHashName, options.steam);
      if (!observation) {
        summary.skipped += 1;
        continue;
      }

      await writeObservation(observation);
      summary.written += 1;
    } catch (err) {
      summary.errors.push({
        marketHashName,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}

async function hasRecentObservation(
  marketHashName: string,
  source: string,
  observedAfter: Date,
): Promise<boolean> {
  const row = await db.marketPriceObservation.findFirst({
    where: {
      marketHashName,
      source,
      observedAt: { gte: observedAfter },
    },
    select: { id: true },
  });

  return row != null;
}

async function writeObservation(observation: CreateMarketPriceObservationInput): Promise<void> {
  await createMarketPriceObservation(observation);
}
