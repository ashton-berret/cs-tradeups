import { describe, expect, it } from 'bun:test';
import { toCsv } from '$lib/server/utils/csv';

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
