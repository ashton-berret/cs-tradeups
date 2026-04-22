// Query-string coercion for list-endpoint filter schemas.
//
// Filter schemas (e.g. `candidateFilterSchema`) use `z.number()` and
// `z.boolean()` directly, not `z.coerce.*`. Raw `URLSearchParams` values are
// always strings, so handing them to `.parse()` without pre-coercion fails.
//
// `coerceSearchParams` introspects the top-level ZodObject shape, unwraps
// defaults/optional wrappers, and converts string values into the expected
// primitive type before handing the plain record back to the caller to
// Zod-parse. Anything outside the schema's known keys is passed through
// unchanged; anything inside with an unrecognized inner type is left as a
// string (Zod will then accept it or reject it).

import { z } from 'zod';

/**
 * Convert `URLSearchParams` into a plain object suitable for
 * `filterSchema.parse()`. Numeric and boolean fields are coerced per-schema;
 * everything else is left as a string.
 */
export function coerceSearchParams<Shape extends z.ZodRawShape>(
  searchParams: URLSearchParams,
  schema: z.ZodObject<Shape>,
): Record<string, unknown> {
  const shape = schema.shape as unknown as Record<string, z.ZodTypeAny>;
  const result: Record<string, unknown> = {};

  for (const [key, raw] of searchParams.entries()) {
    const fieldDef = shape[key];
    result[key] = fieldDef ? coerceValue(raw, fieldDef) : raw;
  }

  return result;
}

function coerceValue(raw: string, fieldType: z.ZodTypeAny): unknown {
  const inner = unwrap(fieldType);

  if (inner instanceof z.ZodNumber) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }

  if (inner instanceof z.ZodBoolean) {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return raw;
  }

  return raw;
}

/** Peel off ZodOptional / ZodDefault / ZodNullable wrappers to reach the core type. */
function unwrap(t: z.ZodTypeAny): z.ZodTypeAny {
  let current: z.ZodTypeAny = t;
  // Bounded loop so a malformed schema can't trap us.
  for (let i = 0; i < 10; i += 1) {
    const def = (current as unknown as { _def?: { innerType?: z.ZodTypeAny } })._def;
    if (!def?.innerType) {
      return current;
    }
    current = def.innerType;
  }
  return current;
}
