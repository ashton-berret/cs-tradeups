import { db } from '$lib/server/db/client';
import {
  createMarketPriceObservation,
  type CreateMarketPriceObservationInput,
} from '$lib/server/marketPrices/priceService';
import {
  fetchSteamPriceoverview,
  STEAM_PRICEOVERVIEW_SOURCE,
  SteamPriceoverviewError,
  type SteamPriceoverviewAdapterOptions,
} from './adapters/steamPriceoverview';
import { buildMarketPriceWatchlist, type MarketPriceWatchlistOptions } from './watchlist';

const DEFAULT_RECENT_SKIP_MS = 30 * 60 * 1000;

export interface MarketPriceRefreshSummary {
  adapter: string;
  requested: number;
  written: number;
  skipped: number;
  errors: Array<{ marketHashName: string; message: string }>;
  stoppedEarlyReason?: string;
}

export interface MarketPriceRefreshJobResult {
  watchlistCount: number;
  watchlist: {
    activePlanOutcomes: number;
    combinationSnapshotOutcomes: number;
    openCandidates: number;
    inventoryItems: number;
    executionResults: number;
    engineComboOutputs: number;
  };
  summaries: MarketPriceRefreshSummary[];
}

export interface MarketPriceRefreshProgress {
  total: number;
  processed: number;
  written: number;
  skipped: number;
  errors: number;
  elapsedMs: number;
  currentMarketHashName: string | null;
}

export interface RefreshSteamWatchlistOptions {
  marketHashNames?: string[];
  watchlist?: MarketPriceWatchlistOptions;
  limit?: number;
  recentSkipMs?: number;
  steam?: SteamPriceoverviewAdapterOptions;
  stopOnRateLimit?: boolean;
  maxConsecutiveRateLimitErrors?: number;
  onProgress?: (progress: MarketPriceRefreshProgress) => void;
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
          engineComboOutputs: 0,
        },
      }
    : await buildMarketPriceWatchlist(options.watchlist);

  const marketHashNames =
    options.limit != null
      ? (await excludeRecentlyObservedNames(watchlist.marketHashNames, options)).slice(0, options.limit)
      : watchlist.marketHashNames;

  const summary = await refreshSteamNames(marketHashNames, options);

  return {
    watchlistCount: marketHashNames.length,
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
    requested: 0,
    written: 0,
    skipped: 0,
    errors: [],
  };
  const recentCutoff = new Date(Date.now() - (options.recentSkipMs ?? DEFAULT_RECENT_SKIP_MS));
  const stopOnRateLimit = options.stopOnRateLimit ?? true;
  const maxConsecutiveRateLimitErrors = options.maxConsecutiveRateLimitErrors ?? 3;
  const startedAt = Date.now();
  let processed = 0;
  let consecutiveRateLimitErrors = 0;

  const emitProgress = (currentMarketHashName: string | null) => {
    options.onProgress?.({
      total: marketHashNames.length,
      processed,
      written: summary.written,
      skipped: summary.skipped,
      errors: summary.errors.length,
      elapsedMs: Date.now() - startedAt,
      currentMarketHashName,
    });
  };

  emitProgress(null);

  for (const marketHashName of marketHashNames) {
    try {
      if (await hasRecentObservation(marketHashName, STEAM_PRICEOVERVIEW_SOURCE, recentCutoff)) {
        summary.skipped += 1;
      } else {
        const observation = await fetchSteamPriceoverview(marketHashName, options.steam);
        if (!observation) {
          summary.skipped += 1;
        } else {
          await writeObservation(observation);
          summary.written += 1;
        }
      }
    } catch (err) {
      if (isRateLimitError(err)) {
        consecutiveRateLimitErrors += 1;
      } else {
        consecutiveRateLimitErrors = 0;
      }

      summary.errors.push({
        marketHashName,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      processed += 1;
      summary.requested += 1;
      emitProgress(marketHashName);
    }

    if (stopOnRateLimit && consecutiveRateLimitErrors >= maxConsecutiveRateLimitErrors) {
      summary.stoppedEarlyReason =
        `Stopped after ${consecutiveRateLimitErrors} consecutive Steam HTTP 429 responses.`;
      break;
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

async function excludeRecentlyObservedNames(
  marketHashNames: string[],
  options: RefreshSteamWatchlistOptions,
): Promise<string[]> {
  if (marketHashNames.length === 0) return [];

  const recentCutoff = new Date(Date.now() - (options.recentSkipMs ?? DEFAULT_RECENT_SKIP_MS));
  const recentNames = new Set<string>();
  const chunkSize = 800;

  for (let index = 0; index < marketHashNames.length; index += chunkSize) {
    const chunk = marketHashNames.slice(index, index + chunkSize);
    const rows = await db.marketPriceObservation.findMany({
      where: {
        marketHashName: { in: chunk },
        source: STEAM_PRICEOVERVIEW_SOURCE,
        observedAt: { gte: recentCutoff },
      },
      distinct: ['marketHashName'],
      select: { marketHashName: true },
    });
    for (const row of rows) {
      recentNames.add(row.marketHashName);
    }
  }

  return marketHashNames.filter((name) => !recentNames.has(name));
}

function isRateLimitError(err: unknown): boolean {
  return err instanceof SteamPriceoverviewError && err.status === 429;
}
