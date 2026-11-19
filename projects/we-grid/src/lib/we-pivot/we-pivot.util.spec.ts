import { WeGridColumnDef } from '../models/we-grid-column.model';
import { WeGridColumnStore } from 'we-grid-angular/engine';
import { WePivotConfig, WePivotLabels, wePivot, wePivotFromGroups, wePivotGroupRequest } from './we-pivot.util';

const labels: WePivotLabels = { aggregate: { sum: 'Sum', count: 'Count', avg: 'Average', min: 'Min', max: 'Max' }, total: 'Total', empty: '(Empty)' };
const fields: WeGridColumnDef<unknown>[] = [
  { field: 'city', header: 'City' },
  { field: 'cat', header: 'Category' },
  { field: 'year', header: 'Year', type: 'integer' },
  { field: 'amount', header: 'Amount', type: 'currency', format: 'EUR' }
];
const data = [
  { city: 'Izmir', cat: 'A', year: 2025, amount: 10 },
  { city: 'Izmir', cat: 'B', year: 2026, amount: 5 },
  { city: 'Ankara', cat: 'A', year: 2026, amount: 7 },
  { city: 'Ankara', cat: 'A', year: 2026, amount: 3 },
  { city: null, cat: 'B', year: 2025, amount: 1 }
];

describe('wePivot', () => {
  it('groups rows and adds up values without column fields', () => {
    const p = wePivot(data, { rows: ['city'], columns: [], values: [{ field: 'amount', aggregate: 'sum' }] }, fields, labels);
    expect(p.columns.map((c) => c.header)).toEqual(['City', 'Sum · Amount']);
    expect(p.columns[1]).toEqual(jasmine.objectContaining({ type: 'currency', format: 'EUR', summary: 'sum' }));
    expect(p.rows.map((r) => [r['r:city'], r[p.columns[1].field]])).toEqual([
      ['Ankara', 10],
      ['Izmir', 15],
      ['(Empty)', 1]
    ]);
    expect(p.groupBy).toEqual([]);
  });

  it('spreads column field values into columns with a total per row', () => {
    const p = wePivot(data, { rows: ['city'], columns: ['year'], values: [{ field: 'amount', aggregate: 'sum' }] }, fields, labels);
    expect(p.columns.map((c) => c.header)).toEqual(['City', '2025', '2026', 'Total']);
    const izmir = p.rows.find((r) => r['r:city'] === 'Izmir')!;
    expect([izmir[p.columns[1].field], izmir[p.columns[2].field], izmir[p.columns[3].field]]).toEqual([10, 5, 15]);
    const ankara = p.rows.find((r) => r['r:city'] === 'Ankara')!;
    expect(ankara[p.columns[1].field]).toBeNull();
  });

  it('nests row fields and offers the outer ones for grouping', () => {
    const p = wePivot(data, { rows: ['city', 'cat'], columns: [], values: [{ field: 'amount', aggregate: 'count' }, { field: 'amount', aggregate: 'avg' }] }, fields, labels);
    expect(p.groupBy).toEqual(['r:city']);
    expect(p.columns.map((c) => c.header)).toEqual(['City', 'Category', 'Count · Amount', 'Average · Amount']);
    expect(p.columns[2].type).toBe('integer');
    const ankaraA = p.rows.find((r) => r['r:city'] === 'Ankara' && r['r:cat'] === 'A')!;
    expect([ankaraA[p.columns[2].field], ankaraA[p.columns[3].field]]).toEqual([2, 5]);
  });

  it('caps the number of columns', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ city: 'X', cat: `c${i}`, amount: i }));
    const p = wePivot(many, { rows: ['city'], columns: ['cat'], values: [{ field: 'amount', aggregate: 'sum' }] }, fields, labels, undefined, 'en', 10);
    expect(p.truncated).toBeTrue();
    expect(p.columns.length).toBe(1 + 10 + 1);
  });

  it('counts rows when no value field is chosen', () => {
    const p = wePivot(data, { rows: ['cat'], columns: [], values: [] }, fields, labels);
    expect(p.rows.map((r) => r[p.columns[1].field])).toEqual([3, 2]);
  });
});

describe('wePivot dates', () => {
  it('groups dates by the local day and leaves invalid dates blank', () => {
    const rows = [{ d: new Date(2024, 0, 15), n: 1 }, { d: new Date(2024, 0, 15), n: 2 }, { d: new Date('nope'), n: 4 }];
    const p = wePivot(rows, { rows: ['d'], columns: [], values: [{ field: 'n', aggregate: 'sum' }] }, [{ field: 'd', header: 'Day', type: 'date' }, { field: 'n', header: 'N', type: 'number' }], labels);
    expect(p.rows.map((r) => [r['r:d'], r[p.columns[1].field]])).toEqual([
      ['2024-01-15', 3],
      ['(Empty)', 4]
    ]);
  });
  it('labels row and column members through the field formatter and keeps their raw values', () => {
    const named: WeGridColumnDef<unknown>[] = fields.map((f) => (f.field === 'year' ? { ...f, formatter: (v: unknown) => `FY${v}` } : f.field === 'city' ? { ...f, formatter: (v: unknown) => `City ${v}` } : f));
    const p = wePivot(data, { rows: ['city'], columns: ['year'], values: [{ field: 'amount', aggregate: 'sum' }] }, named, labels);
    expect(p.columns.map((c) => c.header)).toEqual(['City', 'FY2025', 'FY2026', 'Total']);
    // The cell keeps the key — sorting and grouping stay on it — and only its text is formatted
    expect(p.rows.map((r) => r['r:city'])).toEqual(['Ankara', 'Izmir', '(Empty)']);
    expect(p.rows.map((r) => p.columns[0].formatter!(r['r:city'], r))).toEqual(['City Ankara', 'City Izmir', '(Empty)']);
    expect(p.rowValues).toEqual([{ city: 'Ankara' }, { city: 'Izmir' }, { city: null }]);
    expect(p.cellSources![p.columns[1].field]).toEqual({ columnValues: { year: 2025 }, valueField: 'amount' });
    expect(p.cellSources!['t:0']).toEqual({ columnValues: {}, valueField: 'amount' });
  });
});

describe('wePivotFromGroups', () => {
  interface Sale {
    region: string | null;
    city: string;
    status: string;
    total: number | null;
    qty: number;
    day: Date;
    /** Numeric text and blanks — the pivot only adds up real numbers */
    code: string | number | null;
  }
  let seed = 3;
  const rnd = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const sales: Sale[] = Array.from({ length: 1500 }, () => ({
    region: rnd() < 0.05 ? null : ['North', 'South', 'East'][Math.floor(rnd() * 3)],
    city: ['Ankara', 'Bursa', 'İzmir', 'Van'][Math.floor(rnd() * 4)],
    status: ['Open', 'Closed'][Math.floor(rnd() * 2)],
    total: rnd() < 0.1 ? null : Math.round(rnd() * 100_000) / 100,
    qty: 1 + Math.floor(rnd() * 9),
    // Several times a day: the pivot keys a day, the engine groups each time, so groups merge
    day: new Date(2025, 0, 1 + Math.floor(rnd() * 5), rnd() < 0.5 ? 0 : 9, rnd() < 0.5 ? 0 : 30),
    code: rnd() < 0.3 ? String(Math.floor(rnd() * 50)) : rnd() < 0.5 ? null : Math.floor(rnd() * 50)
  }));
  const saleFields: WeGridColumnDef<unknown>[] = [
    { field: 'region', header: 'Region' },
    { field: 'city', header: 'City' },
    { field: 'status', header: 'Status' },
    { field: 'total', header: 'Total', type: 'currency' },
    { field: 'qty', header: 'Qty', type: 'integer' },
    { field: 'day', header: 'Day', type: 'date' },
    { field: 'code', header: 'Code' }
  ];
  const store = WeGridColumnStore.fromRows(sales as unknown as Record<string, unknown>[]);

  it('sorts the rows under a blank outer value by the inner fields too', () => {
    const result = wePivot(sales as unknown as Record<string, unknown>[], { rows: ['region', 'city'], columns: [], values: [] }, saleFields, labels);
    const blank = result.rows.filter((r) => r['r:region'] === labels.empty).map((r) => r['r:city']);
    expect(blank).toEqual(['Ankara', 'Bursa', 'İzmir', 'Van']);
  });

  it('builds the same table from a data source as from the rows', () => {
    const configs: WePivotConfig[] = [
      { rows: ['region', 'city'], columns: ['status'], values: [{ field: 'total', aggregate: 'sum' }, { field: 'total', aggregate: 'avg' }, { field: 'qty', aggregate: 'max' }] },
      { rows: ['city'], columns: [], values: [{ field: 'total', aggregate: 'count' }, { field: 'qty', aggregate: 'min' }] },
      { rows: [], columns: ['status', 'region'], values: [{ field: 'total', aggregate: 'sum' }] },
      { rows: ['day'], columns: ['city'], values: [{ field: 'total', aggregate: 'avg' }] },
      // Numeric text and dates: neither adds up, both still count
      { rows: ['day'], columns: ['status'], values: [{ field: 'code', aggregate: 'avg' }, { field: 'code', aggregate: 'sum' }, { field: 'code', aggregate: 'count' }, { field: 'day', aggregate: 'max' }] }
    ];
    for (const config of configs) {
      const fromRows = wePivot(sales as unknown as Record<string, unknown>[], config, saleFields, labels);
      const request = wePivotGroupRequest(config, saleFields);
      const fromGroups = wePivotFromGroups(store.groups(request), config, saleFields, labels);
      expect(fromGroups.columns.map((c) => c.field)).withContext(JSON.stringify(config)).toEqual(fromRows.columns.map((c) => c.field));
      expect(fromGroups.rows.length).withContext(JSON.stringify(config)).toBe(fromRows.rows.length);
      fromRows.rows.forEach((row, r) => {
        for (const [key, value] of Object.entries(row)) {
          const other = fromGroups.rows[r][key];
          if (typeof value === 'number' && typeof other === 'number') expect(other).withContext(`${JSON.stringify(config)} ${r} ${key}`).toBeCloseTo(value, 6);
          else expect(other).withContext(`${JSON.stringify(config)} ${r} ${key}`).toEqual(value);
        }
      });
    }
  });
});
