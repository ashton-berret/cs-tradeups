import { db } from '$lib/server/db/client';

export interface MarketPriceSweepDTO {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  trigger: string;
  watchlistCount: number;
  requested: number;
  written: number;
  skipped: number;
  errorCount: number;
  candidatesReevaluated: number;
  basketsRecomputed: number;
  durationMs: number | null;
  notes: string | null;
}

export async function getRecentSweeps(limit = 10): Promise<MarketPriceSweepDTO[]> {
  const rows = await db.marketPriceSweep.findMany({
    orderBy: { startedAt: 'desc' },
    take: limit,
  });
  return rows.map((row) => ({
    id: row.id,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    trigger: row.trigger,
    watchlistCount: row.watchlistCount,
    requested: row.requested,
    written: row.written,
    skipped: row.skipped,
    errorCount: row.errorCount,
    candidatesReevaluated: row.candidatesReevaluated,
    basketsRecomputed: row.basketsRecomputed,
    durationMs: row.finishedAt
      ? row.finishedAt.getTime() - row.startedAt.getTime()
      : null,
    notes: row.notes,
  }));
}
