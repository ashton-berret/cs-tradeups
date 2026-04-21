// Float value helpers.
//
// CS2 float values are 0..1. Exterior bands are defined globally in
// `EXTERIOR_FLOAT_RANGES`, but the *effective* float range for a specific
// skin can be narrower (per-skin min/max floats). Phase 2 only needs
// global band math; per-skin ranges land later (see docs/PROGRESS.md).

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
 * Average float of a set of basket inputs. Returns null if any input is
 * missing a float (caller should treat that as a readiness blocker).
 *
 * TODO(Phase 5+): when per-skin float ranges are available, the average-to-
 * output mapping must use each *outcome's* effective range, not the global
 * exterior bands.
 */
export function averageFloat(values: Array<number | null | undefined>): number | null {
  if (values.length === 0 || values.some((value) => value == null)) {
    return null;
  }

  const sum = values.reduce<number>((acc, value) => acc + (value ?? 0), 0);
  return Number((sum / values.length).toFixed(6));
}

/**
 * Map a basket's average input float onto a specific outcome to estimate
 * the output float it would produce. Currently assumes the global exterior
 * bands; a future per-skin table will replace this.
 */
export function projectOutputFloat(
  avgInputFloat: number,
  outcomeMinFloat?: number,
  outcomeMaxFloat?: number,
): number {
  if (!Number.isFinite(avgInputFloat) || avgInputFloat < 0 || avgInputFloat > 1) {
    throw new Error('Average input float must be between 0 and 1');
  }

  const min = outcomeMinFloat ?? 0;
  const max = outcomeMaxFloat ?? 1;

  if (min > max) {
    throw new Error('Outcome min float cannot exceed max float');
  }

  return Number((min + avgInputFloat * (max - min)).toFixed(6));
}
