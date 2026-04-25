import { describe, expect, it } from 'bun:test';
import { parseCsv, toCsv } from '$lib/server/utils/csv';

describe('toCsv', () => {
  it('escapes commas, quotes, and newlines with RFC 4180 quoting', () => {
    const csv = toCsv(
      [{ name: 'A "quoted", multiline\ncell' }],
      [{ key: 'name', header: 'Name' }],
    );

    expect(csv).toBe('Name\r\n"A ""quoted"", multiline\ncell"\r\n');
  });

  it('prefixes spreadsheet formula-leading cells', () => {
    const csv = toCsv(
      [{ a: '=SUM(1,2)', b: '+1', c: '@cmd', d: '-10' }],
      [
        { key: 'a', header: 'A' },
        { key: 'b', header: 'B' },
        { key: 'c', header: 'C' },
        { key: 'd', header: 'D' },
      ],
    );

    expect(csv).toBe("A,B,C,D\r\n\"'=SUM(1,2)\",'+1,'@cmd,'-10\r\n");
  });
});

describe('parseCsv', () => {
  it('parses headers, quoted cells, and row numbers', () => {
    const parsed = parseCsv('name,price,note\r\n"AK-47, Slate",1.25,"line one\nline two"\r\n');

    expect(parsed.headers).toEqual(['name', 'price', 'note']);
    expect(parsed.rows).toEqual([
      {
        rowNumber: 2,
        values: {
          name: 'AK-47, Slate',
          price: '1.25',
          note: 'line one\nline two',
        },
      },
    ]);
  });

  it('ignores blank records', () => {
    const parsed = parseCsv('\nmarketHashName,currency\n\nAK-47 | Slate (Field-Tested),USD\n');

    expect(parsed.rows).toEqual([
      {
        rowNumber: 2,
        values: {
          marketHashName: 'AK-47 | Slate (Field-Tested)',
          currency: 'USD',
        },
      },
    ]);
  });
});
