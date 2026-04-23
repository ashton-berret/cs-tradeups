type CsvColumn<T> = {
  key: keyof T | ((row: T) => unknown);
  header: string;
};

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [
    columns.map((column) => formatCell(column.header)).join(','),
    ...rows.map((row) =>
      columns
        .map((column) => formatCell(valueForColumn(row, column)))
        .join(','),
    ),
  ];

  return `${lines.join('\r\n')}\r\n`;
}

function valueForColumn<T>(row: T, column: CsvColumn<T>): unknown {
  return typeof column.key === 'function' ? column.key(row) : row[column.key];
}

function formatCell(value: unknown): string {
  if (value == null) {
    return '';
  }

  const raw = value instanceof Date ? value.toISOString() : String(value);
  const protectedValue = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  const escaped = protectedValue.replaceAll('"', '""');

  return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped;
}
