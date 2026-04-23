import { type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { getExpectedVsRealized } from '$lib/server/analytics/analyticsService';
import { toErrorResponse } from '$lib/server/http/errors';
import { toCsv } from '$lib/server/utils/csv';

const querySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  planId: z.string().optional(),
});

export const GET: RequestHandler = async ({ url }) => {
  try {
    const range = querySchema.parse(Object.fromEntries(url.searchParams));
    const rows = await getExpectedVsRealized(range);
    const csv = toCsv(rows, [
      { key: 'executedAt', header: 'executedAt' },
      { key: 'planId', header: 'planId' },
      { key: 'planName', header: 'planName' },
      { key: 'expectedProfit', header: 'expectedProfit' },
      { key: 'realizedProfit', header: 'realizedProfit' },
    ]);

    return csvResponse(csv, `expected-vs-realized-${yyyymmdd()}.csv`);
  } catch (err) {
    return toErrorResponse(err);
  }
};

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
