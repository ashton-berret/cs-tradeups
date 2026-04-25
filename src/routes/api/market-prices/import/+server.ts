// POST /api/market-prices/import
//
// Local-first price observation import. This endpoint intentionally accepts
// operator-controlled JSON or CSV payloads only; it is not a Steam scraper or
// buying automation surface.

import { json, type RequestHandler } from '@sveltejs/kit';
import {
  parseCsvMarketPriceImport,
  parseJsonMarketPriceImport,
  type ParsedMarketPriceImport,
} from '$lib/server/marketPrices/localImportAdapter';
import { importMarketPriceObservations } from '$lib/server/marketPrices/priceService';
import { refreshAfterMarketPriceImport } from '$lib/server/marketPrices/refreshService';
import { toErrorResponse } from '$lib/server/http/errors';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const contentType = request.headers.get('content-type') ?? '';
    const input = contentType.includes('text/csv')
      ? parseCsvMarketPriceImport(
          await request.text(),
          new URL(request.url).searchParams.get('source') ?? 'LOCAL_CSV_IMPORT',
        )
      : parseJsonMarketPriceImport(await request.json());

    if (!input.ok) {
      return importValidationError(input);
    }

    const result = await importMarketPriceObservations(input.input);
    const refresh = await refreshAfterMarketPriceImport();
    return json({ ...result, refresh }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
};

function importValidationError(result: Extract<ParsedMarketPriceImport, { ok: false }>): Response {
  return json(
    {
      error: 'ValidationError',
      message: result.message,
      issues: result.issues,
      rowErrors: result.rowErrors,
    },
    { status: 400 },
  );
}
