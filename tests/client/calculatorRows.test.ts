import { describe, expect, it } from 'bun:test';
import { duplicateCalculatorInputRow, type CalculatorInputRow } from '$lib/client/calculatorRows';

const empty = (): CalculatorInputRow => ({
  skinDisplay: '',
  skinId: '',
  collection: '',
  catalogCollectionId: '',
  floatValue: '',
  price: '',
});

const row = (collection: string, price: string): CalculatorInputRow => ({
  skinDisplay: `${collection} skin`,
  skinId: `${collection}-skin`,
  collection,
  catalogCollectionId: `${collection}-collection`,
  floatValue: '0.1234',
  price,
});

describe('calculator row helpers', () => {
  it('copies a row into the next empty row after the source', () => {
    const rows = [row('alpha', '1.00'), empty(), row('bravo', '2.00')];

    const next = duplicateCalculatorInputRow(rows, 0);

    expect(next[1]).toEqual(rows[0]);
    expect(next[0]).toEqual(rows[0]);
    expect(next[0]).not.toBe(rows[0]);
  });

  it('falls back to the first empty row when later rows are filled', () => {
    const rows = [empty(), row('alpha', '1.00'), row('bravo', '2.00')];

    const next = duplicateCalculatorInputRow(rows, 1);

    expect(next[0]).toEqual(rows[1]);
  });

  it('replaces the following row when all rows are filled', () => {
    const rows = [row('alpha', '1.00'), row('bravo', '2.00'), row('charlie', '3.00')];

    const next = duplicateCalculatorInputRow(rows, 1, 3);

    expect(next[2]).toEqual(rows[1]);
  });
});
