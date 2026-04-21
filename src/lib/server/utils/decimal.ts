// Decimal <-> number helpers for the service boundary.
//
// Prisma returns `Decimal` (from Prisma.Decimal / decimal.js) for money
// columns. The app treats money as plain JS `number` outside the persistence
// layer; these helpers are the single conversion point.

import { Prisma } from '@prisma/client';
import { roundMoney } from './money';

/**
 * Convert a persisted Decimal value to a plain number, preserving null/undefined.
 * Rounds to 2 decimal places for money columns.
 */
export function toNumber(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value == null) {
    return null;
  }

  const numeric = typeof value === 'number' ? value : value.toNumber();
  return roundMoney(numeric);
}

/**
 * Wrap a plain number as a Prisma.Decimal for persistence. Rounds to the
 * configured money precision before conversion.
 */
export function toDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(roundMoney(value));
}

/**
 * Optional variant of toDecimal that passes through null/undefined unchanged.
 */
export function toDecimalOrNull(
  value: number | null | undefined,
): Prisma.Decimal | null {
  return value == null ? null : toDecimal(value);
}
