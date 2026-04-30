export type CalculatorInputRow = {
  skinDisplay: string;
  skinId: string;
  collection: string;
  catalogCollectionId: string;
  // Svelte's `bind:value` on `<input type="number">` coerces these to number
  // once the user types, so callers must defend against the union at runtime.
  floatValue: string | number;
  price: string | number;
};

const trimAny = (value: string | number | null | undefined): string =>
  String(value ?? '').trim();

export function isCalculatorInputRowEmpty(row: CalculatorInputRow): boolean {
  return (
    !row.skinDisplay.trim() &&
    !row.skinId.trim() &&
    !row.collection.trim() &&
    !row.catalogCollectionId.trim() &&
    !trimAny(row.floatValue) &&
    !trimAny(row.price)
  );
}

export function duplicateCalculatorInputRow(
  rows: CalculatorInputRow[],
  sourceIndex: number,
  maxRows = 10,
): CalculatorInputRow[] {
  if (sourceIndex < 0 || sourceIndex >= rows.length) return rows;

  const nextRows = rows.map((row) => ({ ...row }));
  const copy = { ...rows[sourceIndex] };
  const afterSource = nextRows.findIndex(
    (row, index) => index > sourceIndex && isCalculatorInputRowEmpty(row),
  );
  const firstEmpty = nextRows.findIndex(isCalculatorInputRowEmpty);

  if (afterSource >= 0) {
    nextRows[afterSource] = copy;
    return nextRows;
  }
  if (firstEmpty >= 0) {
    nextRows[firstEmpty] = copy;
    return nextRows;
  }
  if (nextRows.length < maxRows) {
    return [...nextRows, copy];
  }

  const replacementIndex = Math.min(sourceIndex + 1, nextRows.length - 1);
  nextRows[replacementIndex] = copy;
  return nextRows;
}
