import { WeGridImportColumn, weGridMapImportedRows } from './we-grid-import.util';

const columns: WeGridImportColumn[] = [
  { field: 'code', header: 'Code', type: 'text' },
  { field: 'total', header: 'Total', type: 'number' },
  { field: 'orderedAt', header: 'Ordered At', type: 'date' },
  { field: 'paid', header: 'Paid', type: 'boolean' }
];

describe('weGridMapImportedRows', () => {
  it('maps a file header onto the column that shows it', () => {
    const { rows } = weGridMapImportedRows({ headers: ['Code', 'Total'], rows: [['A1', '10']] }, columns);
    expect(rows[0]).toEqual({ code: 'A1', total: 10 });
  });

  it('ignores case, surrounding whitespace and diacritics when matching headers', () => {
    const trColumns: WeGridImportColumn[] = [{ field: 'name', header: 'Ürün Adı', type: 'text' }];
    const { rows, unmappedHeaders } = weGridMapImportedRows({ headers: ['  urun adi '], rows: [['Alpha']] }, trColumns);
    expect(unmappedHeaders).toEqual([]);
    expect(rows[0]).toEqual({ name: 'Alpha' });
  });

  it('also matches a header written as the raw field name', () => {
    const { rows } = weGridMapImportedRows({ headers: ['orderedAt'], rows: [['2024-03-05']] }, columns);
    expect((rows[0]['orderedAt'] as Date).getFullYear()).toBe(2024);
  });

  it('reports headers that match no column and drops their cells', () => {
    const { rows, unmappedHeaders } = weGridMapImportedRows(
      { headers: ['Code', 'Nonsense'], rows: [['A1', 'x']] },
      columns
    );
    expect(unmappedHeaders).toEqual(['Nonsense']);
    expect(rows[0]).toEqual({ code: 'A1' });
  });

  it('reads numbers written with either locale convention', () => {
    const cases: [string, number][] = [
      ['1.234,56', 1234.56],
      ['1,234.56', 1234.56],
      ['12,500', 12500],
      ['12,5', 12.5],
      ['-42', -42]
    ];
    for (const [text, expected] of cases) {
      const { rows } = weGridMapImportedRows({ headers: ['Total'], rows: [[text]] }, columns);
      expect(rows[0]['total']).withContext(text).toBe(expected);
    }
  });

  it('reads dates from ISO, day-first and Excel serial forms', () => {
    const iso = weGridMapImportedRows({ headers: ['Ordered At'], rows: [['2024-03-05']] }, columns);
    const dayFirst = weGridMapImportedRows({ headers: ['Ordered At'], rows: [['05.03.2024']] }, columns);
    const serial = weGridMapImportedRows({ headers: ['Ordered At'], rows: [['45356']] }, columns);
    expect((iso.rows[0]['orderedAt'] as Date).getUTCFullYear()).toBe(2024);
    expect((dayFirst.rows[0]['orderedAt'] as Date).getMonth()).toBe(2);
    expect((dayFirst.rows[0]['orderedAt'] as Date).getDate()).toBe(5);
    expect((serial.rows[0]['orderedAt'] as Date).getUTCFullYear()).toBe(2024);
  });

  it('reads booleans in both shipped locales', () => {
    for (const text of ['true', '1', 'Yes', 'Evet']) {
      const { rows } = weGridMapImportedRows({ headers: ['Paid'], rows: [[text]] }, columns);
      expect(rows[0]['paid']).withContext(text).toBeTrue();
    }
    for (const text of ['false', '0', 'No', 'Hayır']) {
      const { rows } = weGridMapImportedRows({ headers: ['Paid'], rows: [[text]] }, columns);
      expect(rows[0]['paid']).withContext(text).toBeFalse();
    }
  });

  it('leaves an unconvertible cell out of the row and reports it', () => {
    const { rows, errors } = weGridMapImportedRows({ headers: ['Code', 'Total'], rows: [['A1', 'abc']] }, columns);
    expect(rows[0]).toEqual({ code: 'A1' });
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('Total');
  });

  it('keeps an empty cell as null so a cleared field is distinguishable from a missing column', () => {
    const { rows } = weGridMapImportedRows({ headers: ['Code', 'Total'], rows: [['A1', '']] }, columns);
    expect(rows[0]).toEqual({ code: 'A1', total: null });
  });
});

describe('weGridMapImportedRows — the newer column types', () => {
  const typed: WeGridImportColumn[] = [
    { field: 'price', header: 'Price', type: 'currency', minorUnitFactor: 100 },
    { field: 'qty', header: 'Qty', type: 'integer' },
    { field: 'rate', header: 'Rate', type: 'percent' },
    { field: 'at', header: 'At', type: 'time' }
  ];

  it('stores a minor-unit currency cell in minor units', () => {
    const { rows } = weGridMapImportedRows({ headers: ['Price'], rows: [['₺1.234,56'], ['0,1']] }, typed);
    expect(rows.map((r) => r['price'])).toEqual([123456, 10]);
  });

  it('rounds an integer cell and reads "25%" as a quarter but 0.25 as it is', () => {
    const { rows } = weGridMapImportedRows({ headers: ['Qty', 'Rate'], rows: [['4,0', '25%'], ['7', '0.25']] }, typed);
    expect(rows).toEqual([
      { qty: 4, rate: 0.25 },
      { qty: 7, rate: 0.25 }
    ]);
  });

  it('keeps a time cell as its text', () => {
    const { rows } = weGridMapImportedRows({ headers: ['At'], rows: [['09:30']] }, typed);
    expect(rows[0]).toEqual({ at: '09:30' });
  });
});
