// Float value helpers.
//
// CS2 float values are 0..1. Exterior bands are defined globally in
// `EXTERIOR_FLOAT_RANGES`, but the effective float range for a specific skin
// can be narrower. Trade-up output prediction must normalize each input's
// actual/raw float into its own skin range, average those relative floats, then
// map that average through each output skin's range.

import type { ItemExterior } from '$lib/types/enums';
import { EXTERIOR_FLOAT_RANGES } from '$lib/types/enums';

/** Equality epsilon for duplicate detection and rule-band containment. */
export const FLOAT_EPSILON = 0.0005;

/** Resolve an exterior band from a raw float. */
export function exteriorForFloat(floatValue: number): ItemExterior {
  if (!Number.isFinite(floatValue) || floatValue < 0 || floatValue > 1) {
    throw new Error('Float value must be between 0 and 1');
  }

  const exterior = (Object.entries(EXTERIOR_FLOAT_RANGES) as Array<
    [ItemExterior, [number, number]]
  >).find(([, [min, max]]) => floatValue >= min - FLOAT_EPSILON && floatValue <= max + FLOAT_EPSILON);

  if (!exterior) {
    throw new Error(`Unable to resolve exterior for float ${floatValue}`);
  }

  return exterior[0];
}

/** True if `floatValue` falls inside [min, max] with FLOAT_EPSILON tolerance. */
export function isWithinFloatRange(
  floatValue: number,
  min: number | null | undefined,
  max: number | null | undefined,
): boolean {
  if (!Number.isFinite(floatValue)) {
    return false;
  }

  if (min != null && floatValue < min - FLOAT_EPSILON) {
    return false;
  }

  if (max != null && floatValue > max + FLOAT_EPSILON) {
    return false;
  }

  return true;
}

/**
 * Simple unweighted mean of a set of raw float values. This is the value
 * displayed in the basket UI ("average input float = 0.15"). It is NOT
 * what should be passed to `projectOutputFloat` — see `averageWearProportion`
 * for the value the CS2 trade-up output formula actually consumes.
 *
 * Returns null if any input is missing.
 */
export function averageFloat(values: Array<number | null | undefined>): number | null {
  if (values.length === 0 || values.some((value) => value == null)) {
    return null;
  }

  const sum = values.reduce<number>((acc, value) => acc + (value ?? 0), 0);
  return Number((sum / values.length).toFixed(6));
}

/**
 * Convert an actual/raw item float into its relative position inside that
 * skin's own min/max range.
 *
 * `actualFloat` is the real CS2 float shown on the item. The returned
 * `relativeFloat` / normalized float is what trade-up output prediction
 * averages across the 10 inputs.
 */
export function toRelativeFloat(
  actualFloat: number,
  minFloat: number,
  maxFloat: number,
): number {
  if (!Number.isFinite(actualFloat) || !Number.isFinite(minFloat) || !Number.isFinite(maxFloat)) {
    throw new Error('Float values must be finite numbers');
  }
  if (maxFloat <= minFloat) {
    throw new Error(`Invalid float range: min=${minFloat}, max=${maxFloat}`);
  }
  if (actualFloat < minFloat - FLOAT_EPSILON || actualFloat > maxFloat + FLOAT_EPSILON) {
    throw new Error(`Actual float ${actualFloat} is outside range ${minFloat}-${maxFloat}`);
  }

  const clampedActual = Math.max(minFloat, Math.min(maxFloat, actualFloat));
  return (clampedActual - minFloat) / (maxFloat - minFloat);
}

/**
 * Convert an averaged relative float back to the predicted actual output float
 * for one possible output skin.
 */
export function fromRelativeFloat(
  relativeFloat: number,
  outputMinFloat: number,
  outputMaxFloat: number,
): number {
  if (!Number.isFinite(relativeFloat) || !Number.isFinite(outputMinFloat) || !Number.isFinite(outputMaxFloat)) {
    throw new Error('Float values must be finite numbers');
  }
  if (outputMaxFloat <= outputMinFloat) {
    throw new Error(`Invalid output float range: min=${outputMinFloat}, max=${outputMaxFloat}`);
  }
  if (relativeFloat < 0 - FLOAT_EPSILON || relativeFloat > 1 + FLOAT_EPSILON) {
    throw new Error(`Relative float must be between 0 and 1. Got ${relativeFloat}`);
  }

  const clampedRelative = Math.max(0, Math.min(1, relativeFloat));
  return outputMinFloat + clampedRelative * (outputMaxFloat - outputMinFloat);
}

/**
 * Strict CS2 trade-up output float formula for a complete 10-input contract.
 *
 * Raw/actual input floats are never averaged directly. Each input is first
 * normalized into its own min/max skin range, those 10 relative values are
 * averaged, and that average is mapped into the output skin's range.
 */
export function calculateTradeupOutputFloat(
  inputs: Array<{
    actualFloat: number;
    minFloat: number;
    maxFloat: number;
  }>,
  output: {
    minFloat: number;
    maxFloat: number;
  },
): number {
  if (inputs.length !== 10) {
    throw new Error(`Trade-up requires exactly 10 inputs. Got ${inputs.length}`);
  }

  const relativeFloats = inputs.map((item) =>
    toRelativeFloat(item.actualFloat, item.minFloat, item.maxFloat),
  );
  const averageRelativeFloat =
    relativeFloats.reduce((sum, value) => sum + value, 0) / relativeFloats.length;

  return fromRelativeFloat(averageRelativeFloat, output.minFloat, output.maxFloat);
}

/**
 * Compute one input's wear proportion within its own float range:
 *   p = (float - inputMin) / (inputMax - inputMin)
 *
 * Returns null when any of float, min, or max is missing, or when the range
 * is degenerate (min ≥ max). The CS2 trade-up output formula averages these
 * proportions across all 10 inputs and maps the average through each
 * output's range — averaging raw floats instead silently produces wrong
 * exterior projections whenever input skins do not have the full [0, 1]
 * range, which is the common case.
 */
export function wearProportion(
  floatValue: number | null | undefined,
  inputMinFloat: number | null | undefined,
  inputMaxFloat: number | null | undefined,
): number | null {
  if (floatValue == null || inputMinFloat == null || inputMaxFloat == null) {
    return null;
  }
  try {
    return Number(toRelativeFloat(floatValue, inputMinFloat, inputMaxFloat).toFixed(6));
  } catch {
    return null;
  }
}

/**
 * Average wear proportion across a basket's inputs. Returns null if any
 * input lacks a usable proportion — callers should fall back to the
 * outcome's default exterior projection (no projected exterior) so the UI
 * can display "no projection" rather than a quietly wrong number.
 */
export function averageWearProportion(
  inputs: Array<{
    floatValue?: number | null;
    inputMinFloat?: number | null;
    inputMaxFloat?: number | null;
  }>,
): number | null {
  if (inputs.length === 0) return null;
  const proportions: number[] = [];
  for (const input of inputs) {
    const proportion = wearProportion(input.floatValue, input.inputMinFloat, input.inputMaxFloat);
    if (proportion == null) return null;
    proportions.push(proportion);
  }
  const sum = proportions.reduce((acc, value) => acc + value, 0);
  return Number((sum / proportions.length).toFixed(6));
}

/**
 * Map a basket's average input wear proportion onto a specific outcome to
 * estimate the output float it would produce.
 *
 * NOTE: the input is the *average wear proportion* (see
 * `averageWearProportion`), not the average raw float. CS2 trade-up
 * mechanics:
 *   1. each input's wearProportion = (float - inputMin) / (inputMax - inputMin)
 *   2. avg_wp = mean of input proportions
 *   3. output_float = outputMin + avg_wp × (outputMax - outputMin)
 */
export function projectOutputFloat(
  averageWearProportion: number,
  outcomeMinFloat?: number,
  outcomeMaxFloat?: number,
): number {
  const min = outcomeMinFloat ?? 0;
  const max = outcomeMaxFloat ?? 1;

  return Number(fromRelativeFloat(averageWearProportion, min, max).toFixed(6));
}
