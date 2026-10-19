import { WeGridColumnDef } from '../models/we-grid-column.model';
import { WePivotLabels, wePivot } from './we-pivot.util';

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
});
