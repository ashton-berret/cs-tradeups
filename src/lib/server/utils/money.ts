// Money arithmetic helpers.
//
// All app-facing money is a plain JS number rounded to 2 decimal places.
// Use these helpers for any arithmetic that accumulates (basket cost,
// realized profit, etc.) so rounding behavior is centralized and stays
// consistent with persistence.

export const MONEY_PRECISION = 2;

/** Round a number to the configured money precision. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('Money value must be finite');
  }

  const factor = 10 ** MONEY_PRECISION;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Sum a list of money values with consistent rounding. */
export function sumMoney(values: Array<number | null | undefined>): number {
  return roundMoney(values.reduce<number>((sum, value) => sum + (value ?? 0), 0));
}

/** Multiply a money value by a non-money factor (e.g., probability). */
export function multiplyMoney(value: number, factor: number): number {
  if (!Number.isFinite(factor)) {
    throw new Error('Money multiplier must be finite');
  }

  return roundMoney(value * factor);
}

/** Compute percent change: ((after - before) / before) * 100, rounded. */
export function percentChange(before: number, after: number): number {
  if (!Number.isFinite(before) || !Number.isFinite(after)) {
    throw new Error('Percent change values must be finite');
  }

  if (before === 0) {
    return 0;
  }

  return roundMoney(((after - before) / before) * 100);
}
