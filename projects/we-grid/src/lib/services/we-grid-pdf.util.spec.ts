import { WeGridExportTable } from '../models/we-grid-export.model';
import { weGridBuildPrintDocument } from './we-grid-pdf.util';

function table(overrides: Partial<WeGridExportTable> = {}): WeGridExportTable {
  return {
    fileName: 'orders',
    title: 'Orders',
    columns: [
      { field: 'code', header: 'Code', type: 'text', format: undefined, align: 'start', width: 150, useDisplayText: false },
      { field: 'total', header: 'Total', type: 'number', format: undefined, align: 'end', width: 50, useDisplayText: false }
    ],
    rows: [{ values: ['A1', 10], text: ['A1', '10'] }],
    summary: null,
    cssVariables: { '--we-grid-print-color': '#111', '--we-grid-accent-color': '#405189' },
    ...overrides
  };
}

describe('weGridBuildPrintDocument', () => {
  it('renders a header cell per column and a cell per value', () => {
    const html = weGridBuildPrintDocument(table());
    expect(html).toContain('>Code</th>');
    expect(html).toContain('>Total</th>');
    expect(html).toContain('>A1</td>');
  });

  it('carries the grid theme into the standalone document', () => {
    const html = weGridBuildPrintDocument(table());
    expect(html).toContain('--we-grid-print-color: #111;');
    expect(html).toContain('--we-grid-accent-color: #405189;');
  });

  it('drops anything in a custom property that could close the style element early', () => {
    const html = weGridBuildPrintDocument(table({ cssVariables: { '--we-grid-print-bg': '#fff</style><script>' } }));
    expect(html).not.toContain('</style><script>');
  });

  it('escapes cell text rather than letting it become markup', () => {
    const html = weGridBuildPrintDocument(table({ rows: [{ values: ['<b>x</b>'], text: ['<b>x</b>'] }] }));
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('keeps the on-screen column proportions as percentage widths', () => {
    const html = weGridBuildPrintDocument(table());
    expect(html).toContain('width:75.000%');
    expect(html).toContain('width:25.000%');
  });

  it('honours the requested page orientation', () => {
    expect(weGridBuildPrintDocument(table())).toContain('size: A4 landscape');
    expect(weGridBuildPrintDocument(table(), { orientation: 'portrait' })).toContain('size: A4 portrait');
  });
});
