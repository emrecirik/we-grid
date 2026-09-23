import { WeGridExportTable } from '../models/we-grid-export.model';
import { weGridBuildXlsx, weGridReadXlsx } from './we-grid-xlsx.util';

function table(overrides: Partial<WeGridExportTable> = {}): WeGridExportTable {
  return {
    fileName: 'orders',
    title: 'Orders',
    columns: [
      { field: 'code', header: 'Code', type: 'text', format: undefined, align: 'start', width: 120, useDisplayText: false },
      { field: 'total', header: 'Total', type: 'number', format: undefined, align: 'end', width: 100, useDisplayText: false },
      { field: 'paid', header: 'Paid', type: 'boolean', format: undefined, align: 'center', width: 80, useDisplayText: false }
    ],
    rows: [{ values: ['A1', 12.5, true], text: ['A1', '12.5', 'Yes'] }],
    summary: null,
    cssVariables: {},
    ...overrides
  };
}

/** The written archive uses stored (uncompressed) entries, so reading it back needs no DEFLATE support */
async function roundTrip(source: WeGridExportTable): Promise<{ headers: string[]; rows: string[][] }> {
  const blob = weGridBuildXlsx(source);
  return weGridReadXlsx(new File([blob], 'orders.xlsx'));
}

describe('weGridBuildXlsx', () => {
  it('produces a ZIP archive with the xlsx mime type', async () => {
    const blob = weGridBuildXlsx(table());
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const signature = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    expect(Array.from(signature)).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it('round-trips headers and cell values through its own reader', async () => {
    const sheet = await roundTrip(table());
    expect(sheet.headers).toEqual(['Code', 'Total', 'Paid']);
    expect(sheet.rows[0]).toEqual(['A1', '12.5', 'true']);
  });

  it('writes numeric columns as numbers rather than text', async () => {
    const blob = weGridBuildXlsx(table());
    const text = await blob.text();
    expect(text).toContain('<v>12.5</v>');
  });

  it('writes the display text for a column that maps its raw value to a label', async () => {
    const source = table({
      columns: [
        { field: 'status', header: 'Status', type: 'number', format: undefined, align: 'start', width: 100, useDisplayText: true }
      ],
      rows: [{ values: [1], text: ['Draft'] }]
    });
    const sheet = await roundTrip(source);
    expect(sheet.rows[0]).toEqual(['Draft']);
  });

  it('keeps a blank cell in place instead of shifting the row', async () => {
    const source = table({ rows: [{ values: ['A1', null, true], text: ['A1', '', 'Yes'] }] });
    const sheet = await roundTrip(source);
    expect(sheet.rows[0]).toEqual(['A1', '', 'true']);
  });

  it('appends the summary row when the grid shows one', async () => {
    const sheet = await roundTrip(table({ summary: [null, 'Total: 12.5', null] }));
    expect(sheet.rows[1]).toEqual(['', 'Total: 12.5', '']);
  });

  it('trims a worksheet name to the 31 characters Excel allows', async () => {
    const text = await weGridBuildXlsx(table({ title: 'a'.repeat(40) })).text();
    expect(text).toContain(`<sheet name="${'a'.repeat(31)}"`);
  });
});

describe('weGridBuildXlsx — scaled numeric columns', () => {
  it('writes a minor-unit currency value in major units', async () => {
    const source = table({
      columns: [{ field: 'price', header: 'Price', type: 'currency', format: undefined, align: 'end', width: 100, useDisplayText: false, numberScale: 0.01 }],
      rows: [{ values: [12345], text: ['$123.45'] }]
    });
    const sheet = await roundTrip(source);
    expect(sheet.rows[0]).toEqual(['123.45']);
  });

  it('keeps a percent value as its fraction with a percent number format', async () => {
    const source = table({
      columns: [{ field: 'rate', header: 'Rate', type: 'percent', format: undefined, align: 'end', width: 100, useDisplayText: false }],
      rows: [{ values: [0.25], text: ['25%'] }]
    });
    const text = await weGridBuildXlsx(source).text();
    expect(text).toContain('s="4"><v>0.25</v>');
    expect(text).toContain('numFmtId="10"');
  });
});
