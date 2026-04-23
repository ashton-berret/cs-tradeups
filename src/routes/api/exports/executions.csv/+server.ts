import { type RequestHandler } from '@sveltejs/kit';
import { listExecutions } from '$lib/server/tradeups/executionService';
import { toCsv } from '$lib/server/utils/csv';
import { toErrorResponse } from '$lib/server/http/errors';
import type { ExecutionDTO } from '$lib/types/services';

export const GET: RequestHandler = async () => {
  try {
    const page = await listExecutions({
      page: 1,
      limit: 10_000,
      sortBy: 'executedAt',
      sortDir: 'desc',
    });
    const csv = toCsv(page.data, [
      { key: 'id', header: 'id' },
      { key: 'basketId', header: 'basketId' },
      { key: 'planId', header: 'planId' },
      { key: 'executedAt', header: 'executedAt' },
      { key: 'inputCost', header: 'inputCost' },
      { key: 'expectedEV', header: 'expectedEV' },
      { key: expectedProfit, header: 'expectedProfit' },
      { key: 'resultMarketHashName', header: 'resultMarketHashName' },
      { key: 'resultWeaponName', header: 'resultWeaponName' },
      { key: 'resultSkinName', header: 'resultSkinName' },
      { key: 'resultCollection', header: 'resultCollection' },
      { key: 'resultExterior', header: 'resultExterior' },
      { key: 'resultFloatValue', header: 'resultFloatValue' },
      { key: 'estimatedResultValue', header: 'estimatedResultValue' },
      { key: 'salePrice', header: 'salePrice' },
      { key: 'saleFees', header: 'saleFees' },
      { key: 'saleDate', header: 'saleDate' },
      { key: 'realizedProfit', header: 'realizedProfit' },
      { key: 'realizedProfitPct', header: 'realizedProfitPct' },
      { key: 'notes', header: 'notes' },
    ]);

    return csvResponse(csv, `executions-${yyyymmdd()}.csv`);
  } catch (err) {
    return toErrorResponse(err);
  }
};

function expectedProfit(row: ExecutionDTO): number | null {
  return row.expectedEV == null ? null : Number((row.expectedEV - row.inputCost).toFixed(2));
}

function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename=${filename}`,
    },
  });
}

function yyyymmdd(date = new Date()): string {
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}
