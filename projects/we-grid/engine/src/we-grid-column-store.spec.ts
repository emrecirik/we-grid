import { WeGridColumnFilterState } from './we-grid-filter.model';
import { weGridLocaleTr } from '../../src/lib/models/we-grid-locale.model';
import { applyWeGridFilters } from '../../src/lib/services/we-grid-filter.util';
import { weGridCompareGroupValues, weGridSortedIndices } from './we-grid-sort.util';
import { WeGridColumnStore } from './we-grid-column-store';

interface Row {
  id: number;
  city: string | null;
  qty: number | null;
  price: number;
  ratio: number;
  day: Date | null;
  active: boolean;
}

function makeRows(n: number): Row[] {
  let seed = 11;
  const rnd = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const cities = ['İstanbul', 'Ankara', 'izmir', 'Bursa', 'Çorum'];
  return Array.from({ length: n }, (_, i) => ({
    id: 1000 + i,
    city: rnd() < 0.05 ? null : cities[Math.floor(rnd() * cities.length)],
    qty: rnd() < 0.05 ? null : Math.floor(rnd() * 40) - 5,
    price: Math.round(rnd() * 1_000_000) / 100,
    ratio: rnd() * 3 - 1,
    day: rnd() < 0.05 ? null : new Date(2024, 0, 1 + Math.floor(rnd() * 400), Math.floor(rnd() * 24)),
    active: rnd() < 0.5
  }));
}

const columns = [
  { field: 'id', type: 'integer' as const },
  { field: 'city', type: 'text' as const },
  { field: 'qty', type: 'integer' as const },
  { field: 'price', type: 'currency' as const },
  { field: 'ratio', type: 'number' as const },
  { field: 'day', type: 'date' as const },
  { field: 'active', type: 'boolean' as const }
];

describe('WeGridColumnStore', () => {
  const rows = makeRows(4000);
  const store = WeGridColumnStore.fromRows(rows);

  it('picks a compact encoding per column and gives every value back', () => {
    const enc = Object.fromEntries(store.describe().map((c) => [c.field, c.encoding]));
    expect(enc).toEqual({ id: 'seq', city: 'dict', qty: 'int', price: 'int', ratio: 'f64', day: 'date', active: 'dict' });
    const bytes = Object.fromEntries(store.describe().map((c) => [c.field, c.bytes]));
    expect(bytes['id']).toBe(0);
    expect(bytes['city']).toBe(4000);
    expect(bytes['qty']).toBe(4000);
    for (const i of [0, 1, 777, 3999]) expect(store.row(i)).toEqual(rows[i] as never);
  });

  it('filters exactly like the grid, per operator and type', () => {
    const cases: WeGridColumnFilterState[][] = [
      [{ field: 'city', operator: 'contains', value: 'i' }],
      [{ field: 'city', operator: 'equals', value: 'istanbul' }],
      [{ field: 'city', operator: 'in', value: ['Ankara', null] }],
      [{ field: 'qty', operator: 'between', value: 0, value2: 10 }],
      [{ field: 'qty', operator: 'gt', value: 30 }, { field: 'active', operator: 'eq', value: 'true' }],
      [{ field: 'price', operator: 'lt', value: 100.5 }],
      [{ field: 'ratio', operator: 'gt', value: 0.5 }],
      [{ field: 'day', operator: 'before', value: '2024-03-01' }],
      [{ field: 'id', operator: 'eq', value: 1500 }]
    ];
    for (const filters of cases) {
      const expected = applyWeGridFilters(rows, new Map(filters.map((f) => [f.field, f])), columns, weGridLocaleTr);
      const page = store.load({ offset: 0, limit: 1e9, filters, columns, locale: 'tr-TR' });
      expect(page.total).withContext(JSON.stringify(filters)).toBe(expected.length);
      expect(page.rows.map((r) => r.id)).withContext(JSON.stringify(filters)).toEqual(expected.map((r) => r.id));
    }
  });

  it('sorts like the grid over several keys, both directions, empty values included', () => {
    for (const sort of [
      [{ field: 'city', direction: 'asc' as const }, { field: 'qty', direction: 'desc' as const }],
      [{ field: 'price', direction: 'desc' as const }],
      [{ field: 'day', direction: 'asc' as const }, { field: 'id', direction: 'desc' as const }],
      [{ field: 'ratio', direction: 'asc' as const }],
      [{ field: 'active', direction: 'desc' as const }, { field: 'id', direction: 'asc' as const }]
    ]) {
      const keys = sort.map((s) => rows.map((r) => r[s.field as keyof Row]));
      const expected = Array.from(weGridSortedIndices(keys, sort.map((s) => s.direction)), (i) => rows[i].id);
      expect(store.load({ offset: 0, limit: 1e9, sort }).rows.map((r) => r.id)).withContext(JSON.stringify(sort)).toEqual(expected);
    }
  });

  it('searches the formatted cell text, every word in some column', () => {
    const format = (v: unknown): string => (typeof v === 'number' ? v.toFixed(2).replace('.', ',') : String(v));
    const cols = [
      { field: 'city', type: 'text' as const },
      { field: 'price', type: 'currency' as const, format }
    ];
    const expected = rows.filter((r) => {
      const hay = [r.city ?? '', format(r.price)].join('\u0001').toLocaleLowerCase('tr-TR');
      return ['istanbul', '5,'].every((w) => hay.includes(w));
    });
    const page = store.load({ offset: 0, limit: 1e9, search: 'İSTANBUL 5,', columns: cols, locale: 'tr-TR' });
    expect(page.rows.map((r) => r.id)).toEqual(expected.map((r) => r.id));
    expect(expected.length).toBeGreaterThan(0);
  });

  it('finds "İ" from a typed "i" in every language, not only Turkish', () => {
    const turkish = WeGridColumnStore.fromRows([{ city: 'İzmir' }, { city: 'Ankara' }, { city: 'İSTANBUL' }]);
    const cities = (request: Parameters<typeof turkish.load>[0]): unknown[] => (turkish.load(request) as { rows: { city: unknown }[] }).rows.map((r) => r.city);
    expect(cities({ offset: 0, limit: 10, search: 'izmir', locale: 'en-US' })).toEqual(['İzmir']);
    expect(cities({ offset: 0, limit: 10, search: 'istanbul' })).toEqual(['İSTANBUL']);
    expect(cities({ offset: 0, limit: 10, filters: [{ field: 'city', operator: 'contains', value: 'izm' }], locale: 'en-US' })).toEqual(['İzmir']);
    expect(turkish.checklist({ field: 'city', search: 'iz', filters: [], limit: 10 }).values.map((v) => v.value)).toEqual(['İzmir']);
  });

  it('pages through a result and keeps the last query', () => {
    const request = { sort: [{ field: 'price', direction: 'asc' as const }], filters: [{ field: 'qty', operator: 'gt' as const, value: 10 }] };
    const all = store.load({ ...request, offset: 0, limit: 1e9 });
    const page = store.load({ ...request, offset: 50, limit: 20 });
    expect(page.total).toBe(all.total);
    expect(page.rows).toEqual(all.rows.slice(50, 70));
    expect(store.load({ ...request, offset: all.total + 5, limit: 20 }).rows).toEqual([]);
  });

  it('edits a cell, widening the column when the value does not fit', () => {
    const s = WeGridColumnStore.fromRows(makeRows(50));
    s.set(3, 'qty', 7);
    expect(s.value(3, 'qty')).toBe(7);
    s.set(4, 'qty', 2.5);
    expect(s.value(4, 'qty')).toBe(2.5);
    expect(s.value(3, 'qty')).toBe(7);
    s.set(5, 'city', 'Sinop');
    expect(s.value(5, 'city')).toBe('Sinop');
    expect(s.load({ offset: 0, limit: 1, filters: [{ field: 'city', operator: 'equals', value: 'Sinop' }] }).rows[0]).toEqual(s.row(5));
    s.set(0, 'id', 'X');
    expect(s.value(0, 'id')).toBe('X');
    expect(s.value(1, 'id')).toBe(1001);
  });

  it('builds from columns, dictionary-encoded ones included, and aggregates', () => {
    const s = WeGridColumnStore.fromColumns({
      id: Int32Array.from({ length: 6 }, (_, i) => i + 1),
      city: { dictionary: ['Rize', 'Ağrı'], codes: Uint8Array.from([0, 1, 1, 0, 1, 0]) },
      amount: Float64Array.from([1.5, 2, NaN, 4, 5.25, 6])
    });
    expect(s.row(1)).toEqual({ id: 2, city: 'Ağrı', amount: 2 });
    expect(s.value(2, 'amount')).toBeNull();
    expect(s.load({ offset: 0, limit: 10, sort: [{ field: 'city', direction: 'asc' }] }).rows.map((r) => r['id'])).toEqual([2, 3, 5, 1, 4, 6]);
    expect(s.aggregate('amount', 'sum')).toBe(18.75);
    expect(s.aggregate('amount', 'count')).toBe(5);
    expect(s.aggregate('amount', 'max', { filters: [{ field: 'city', operator: 'equals', value: 'rize' }] })).toBe(6);
    expect(s.distinct('city')).toEqual(['Ağrı', 'Rize']);
    expect(() => WeGridColumnStore.fromColumns({ a: [1, 2], b: [1] })).toThrowError(/differ in length/);
  });

  describe('grouping', () => {
    const empty = (v: unknown): boolean => v === null || v === undefined || v === '';
    /** Reference grouping over the rows: key, count and price sum per group value, in group order */
    const reference = (field: keyof Row, subset = rows) => {
      const buckets = new Map<string, { value: unknown; rows: Row[] }>();
      for (const r of subset) {
        const v = r[field];
        const key = empty(v) ? '' : String(v);
        if (!buckets.has(key)) buckets.set(key, { value: empty(v) ? null : v, rows: [] });
        buckets.get(key)!.rows.push(r);
      }
      return Array.from(buckets.values())
        .sort((a, b) => weGridCompareGroupValues(a.value, b.value, 'tr-TR'))
        .map((b) => ({ value: b.value, count: b.rows.length, sum: b.rows.reduce((s, r) => s + r.price, 0) }));
    };

    it('counts and subtotals every group, in group order — numbers by value, the empty group first', () => {
      for (const field of ['city', 'qty', 'active'] as const) {
        const groups = store.groups({ groupBy: [field], aggregates: [{ field: 'price', fn: 'sum' }], locale: 'tr-TR' });
        const expected = reference(field);
        expect(groups.map((g) => g.value)).withContext(field).toEqual(expected.map((e) => e.value));
        expect(groups.map((g) => g.count)).withContext(field).toEqual(expected.map((e) => e.count));
        groups.forEach((g, i) => expect(g.aggregates['price']!).toBeCloseTo(expected[i].sum, 6));
      }
      const byQty = store.groups({ groupBy: ['qty'] }).map((g) => g.value);
      expect(byQty[0]).toBeNull();
      expect(byQty.slice(1)).toEqual([...(byQty.slice(1) as number[])].sort((a, b) => a - b));
    });

    it('puts each group in one run of offsets, sorted inside, nested groups included', () => {
      const request = { groupBy: ['city', 'active'], sort: [{ field: 'price', direction: 'desc' as const }], filters: [{ field: 'qty', operator: 'gt' as const, value: 0 }], locale: 'tr-TR' };
      const groups = store.groups(request);
      const all = store.load({ ...request, offset: 0, limit: 1e9 }).rows;
      expect(groups.reduce((n, g) => n + g.count, 0)).toBe(all.length);
      for (const city of groups) {
        const slice = all.slice(city.start, city.start + city.count);
        expect(slice.every((r) => (r.city ?? null) === city.value)).withContext(String(city.value)).toBeTrue();
        expect(city.children!.reduce((n, g) => n + g.count, 0)).toBe(city.count);
        for (const sub of city.children!) {
          const inner = all.slice(sub.start, sub.start + sub.count);
          expect(inner.every((r) => r.active === sub.value && (r.city ?? null) === city.value)).toBeTrue();
          expect(inner.every((r, i) => i === 0 || r.price <= inner[i - 1].price)).toBeTrue();
        }
      }
    });

    it('follows the summary row: count skips empty cells, avg can be weighted, min and max', () => {
      const s = WeGridColumnStore.fromRows([
        { g: 'a', v: 10, w: 1, t: 'x' },
        { g: 'a', v: 20, w: 3, t: '' },
        { g: 'a', v: null, w: 5, t: null },
        { g: 'b', v: 5, w: 2, t: 'y' }
      ]);
      const [a, b] = s.groups({
        groupBy: ['g'],
        aggregates: [
          { field: 'v', fn: 'avg', weightField: 'w' },
          { field: 't', fn: 'count' }
        ]
      });
      expect(a.aggregates).toEqual({ v: 17.5, t: 1 });
      expect(b.aggregates).toEqual({ v: 5, t: 1 });
      expect(s.aggregate('v', 'min')).toBe(5);
      expect(s.aggregate('v', 'max')).toBe(20);
      expect(s.aggregate('t', 'count')).toBe(2);
    });

    it('says which field it cannot group by, instead of leaving it out', () => {
      expect(() => store.groups({ groupBy: ['city', 'nope'] })).toThrowError(/no field nope/);
      expect(() => store.load({ offset: 0, limit: 1, groupBy: ['nope'] })).toThrowError(/no field nope/);
    });

    it('counts and adds up only real numbers when asked to — the pivot rule', () => {
      const s = WeGridColumnStore.fromRows([{ g: 'a', v: '12' }, { g: 'a', v: 3 }, { g: 'a', v: null }, { g: 'a', v: 'x' }]);
      const [plain] = s.groups({ groupBy: ['g'], aggregates: [{ field: 'v', fn: 'sum', key: 's' }, { field: 'v', fn: 'count', key: 'c' }] });
      const [strict] = s.groups({ groupBy: ['g'], aggregates: [{ field: 'v', fn: 'sum', key: 's', numbersOnly: true }, { field: 'v', fn: 'count', key: 'c', numbersOnly: true }] });
      expect(plain.aggregates).toEqual({ s: 15, c: 3 });
      expect(strict.aggregates).toEqual({ s: 3, c: 1 });
    });

    it('refuses a grouping with too many groups instead of running out of memory', () => {
      const s = WeGridColumnStore.fromColumns({ id: Float64Array.from({ length: 250_000 }, (_, i) => i + 0.5) });
      expect(() => s.groups({ groupBy: ['id'] })).toThrowError(/more than 200000 groups/);
    });
  });

  it('takes amounts as integers with a scale', () => {
    const s = WeGridColumnStore.fromColumns({ cents: { fixed: Int32Array.from([1999, -5, 0, -1]), scale: 100, emptyValue: -1 } });
    expect([0, 1, 2, 3].map((i) => s.value(i, 'cents'))).toEqual([19.99, -0.05, 0, null]);
    expect(s.load({ offset: 0, limit: 4, sort: [{ field: 'cents', direction: 'desc' }] }).rows.map((r) => r['cents'])).toEqual([19.99, 0, -0.05, null]);
    expect(s.aggregate('cents', 'sum')).toBeCloseTo(19.94, 10);
    const wide = WeGridColumnStore.fromColumns({ v: { fixed: Uint32Array.from([0, 4294967295, 7]), scale: 1 } });
    expect([0, 1, 2].map((i) => wide.value(i, 'v'))).toEqual([0, 4294967295, 7]);
  });
});
