type CsvColumn<T> = {
  key: keyof T | ((row: T) => unknown);
  header: string;
};

export interface CsvParseResult {
  headers: string[];
  rows: Array<{
    rowNumber: number;
    values: Record<string, string>;
  }>;
}

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

export function parseCsv(text: string): CsvParseResult {
  const records = parseCsvRecords(text);
  const nonEmptyRecords = records.filter((record) => record.some((cell) => cell.trim() !== ''));

  if (nonEmptyRecords.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = nonEmptyRecords[0].map((header) => header.trim());
  const rows = nonEmptyRecords.slice(1).map((record, index) => {
    const values: Record<string, string> = {};
    for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
      values[headers[columnIndex]] = record[columnIndex]?.trim() ?? '';
    }

    return {
      rowNumber: index + 2,
      values,
    };
  });

  return { headers, rows };
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

function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      record.push(cell);
      cell = '';
    } else if (char === '\r') {
      if (next === '\n') {
        index += 1;
      }
      record.push(cell);
      records.push(record);
      record = [];
      cell = '';
    } else if (char === '\n') {
      record.push(cell);
      records.push(record);
      record = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || record.length > 0) {
    record.push(cell);
    records.push(record);
  }

  return records;
}
