import { marketPriceImportObservationSchema, marketPriceImportSchema } from '$lib/schemas/marketPrice';
import { parseCsv } from '$lib/server/utils/csv';
import type { z } from 'zod';

export interface MarketPriceImportRowError {
  rowNumber: number;
  field: string;
  message: string;
}

export type ParsedMarketPriceImport =
  | {
      ok: true;
      input: z.infer<typeof marketPriceImportSchema>;
    }
  | {
      ok: false;
      message: string;
      rowErrors?: MarketPriceImportRowError[];
      issues?: z.ZodIssue[];
    };

export function parseJsonMarketPriceImport(body: unknown): ParsedMarketPriceImport {
  const result = marketPriceImportSchema.safeParse(body);

  if (!result.success) {
    return {
      ok: false,
      message: 'JSON import payload is invalid.',
      issues: result.error.issues,
    };
  }

  return { ok: true, input: result.data };
}

export function parseCsvMarketPriceImport(
  csv: string,
  source = 'LOCAL_CSV_IMPORT',
): ParsedMarketPriceImport {
  const parsed = parseCsv(csv);
  const rowErrors: MarketPriceImportRowError[] = [];
  const observations: z.infer<typeof marketPriceImportObservationSchema>[] = [];
  const normalizedSource = source.trim() || 'LOCAL_CSV_IMPORT';

  if (parsed.rows.length === 0) {
    return {
      ok: false,
      message: 'CSV must include a header row and at least one observation row.',
      rowErrors: [],
    };
  }

  if (parsed.rows.length > 500) {
    return {
      ok: false,
      message: 'CSV import is limited to 500 observation rows.',
      rowErrors: [],
    };
  }

  for (const row of parsed.rows) {
    const result = marketPriceImportObservationSchema.safeParse(csvRowToObservation(row.values));
    if (result.success) {
      observations.push(result.data);
    } else {
      rowErrors.push(...result.error.issues.map((issue) => toCsvRowError(row.rowNumber, issue)));
    }
  }

  if (rowErrors.length > 0) {
    return {
      ok: false,
      message: `CSV import has ${rowErrors.length} row error${rowErrors.length === 1 ? '' : 's'}.`,
      rowErrors,
    };
  }

  return {
    ok: true,
    input: {
      source: normalizedSource,
      observations,
    },
  };
}

function csvRowToObservation(row: Record<string, string>) {
  return {
    marketHashName: stringField(row.marketHashName),
    currency: stringField(row.currency),
    lowestSellPrice: numberField(row.lowestSellPrice),
    medianSellPrice: numberField(row.medianSellPrice),
    volume: numberField(row.volume),
    observedAt: stringField(row.observedAt),
    rawPayload: jsonField(row.rawPayload),
  };
}

function stringField(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function numberField(value: string | undefined) {
  const trimmed = stringField(value);
  return trimmed == null ? undefined : Number(trimmed);
}

function jsonField(value: string | undefined) {
  const trimmed = stringField(value);
  if (trimmed == null) return undefined;

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function toCsvRowError(rowNumber: number, issue: z.ZodIssue): MarketPriceImportRowError {
  return {
    rowNumber,
    field: issue.path.join('.') || 'row',
    message: issue.message,
  };
}
