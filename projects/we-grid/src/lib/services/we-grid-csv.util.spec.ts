import { WeGridExportTable } from '../models/we-grid-export.model';
import { weGridParseCsv, weGridToCsv } from './we-grid-csv.util';

function table(overrides: Partial<WeGridExportTable> = {}): WeGridExportTable {
  return {
    fileName: 'orders',
    title: 'Orders',
    columns: [
      { field: 'code', header: 'Code', type: 'text', format: undefined, align: 'start', width: 120, useDisplayText: false },
      { field: 'total', header: 'Total', type: 'number', format: undefined, align: 'end', width: 100, useDisplayText: false }
    ],
    rows: [
      { values: ['A1', 10], text: ['A1', '10'] },
      { values: ['B2', 20], text: ['B2', '20'] }
    ],
    summary: null,
    cssVariables: {},
    ...overrides
  };
}

describe('weGridToCsv', () => {
  it('writes a header row followed by the display text of every row', () => {
    const lines = weGridToCsv(table()).split('\r\n');
    expect(lines[0]).toBe('﻿Code;Total');
    expect(lines[1]).toBe('A1;10');
    expect(lines[2]).toBe('B2;20');
  });

  it('quotes fields containing the delimiter, a quote or a line break', () => {
    const csv = weGridToCsv(
      table({ rows: [{ values: [null, null], text: ['a;b', 'say "hi"'] }] })
    );
    expect(csv).toContain('"a;b";"say ""hi"""');
  });

  it('appends the summary row when the grid shows one', () => {
    const csv = weGridToCsv(table({ summary: [null, 'Total: 30'] }));
    expect(csv.split('\r\n').pop()).toBe(';Total: 30');
  });

  it('honours a custom delimiter', () => {
    expect(weGridToCsv(table(), { delimiter: ',' }).split('\r\n')[0]).toBe('﻿Code,Total');
  });
});

describe('weGridParseCsv', () => {
  it('detects the delimiter from the header line', () => {
    expect(weGridParseCsv('a,b,c\n1,2,3').headers).toEqual(['a', 'b', 'c']);
    expect(weGridParseCsv('a;b;c\n1;2;3').headers).toEqual(['a', 'b', 'c']);
    expect(weGridParseCsv('a\tb\tc\n1\t2\t3').headers).toEqual(['a', 'b', 'c']);
  });

  it('strips a byte order mark from the first header', () => {
    expect(weGridParseCsv('﻿Code;Name\nA1;Alpha').headers).toEqual(['Code', 'Name']);
  });

  it('reads quoted fields, escaped quotes and embedded line breaks', () => {
    const sheet = weGridParseCsv('Code;Note\nA1;"say ""hi"";with;semicolons"\nB2;"two\nlines"');
    expect(sheet.rows[0]).toEqual(['A1', 'say "hi";with;semicolons']);
    expect(sheet.rows[1]).toEqual(['B2', 'two\nlines']);
  });

  it('does not produce a phantom row for a trailing newline', () => {
    expect(weGridParseCsv('Code;Name\nA1;Alpha\n').rows.length).toBe(1);
  });
});
