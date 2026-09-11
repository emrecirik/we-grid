import { WeGridColumnFilterState, isWeGridFilterActive, weGridFilterValueKey } from '../models/we-grid-filter.model';
import { weGridLocaleTr } from '../models/we-grid-locale.model';
import { applyWeGridFilters, weGridFilterChipLabel, weGridInFilterValueLabel } from './we-grid-filter.util';

interface Row {
  code: string;
  status: number | null;
  amount: number;
}

const columns = [
  { field: 'code', type: 'text' as const },
  { field: 'status', type: 'number' as const },
  { field: 'amount', type: 'currency' as const }
];

const rows: Row[] = [
  { code: 'A1', status: 1, amount: 10 },
  { code: 'B2', status: 2, amount: 20 },
  { code: 'C3', status: null, amount: 30 },
  { code: 'D4', status: 1, amount: 40 }
];

function filters(...states: WeGridColumnFilterState[]): Map<string, WeGridColumnFilterState> {
  return new Map(states.map((s) => [s.field, s]));
}

describe('we-grid-filter.util — the "in" operator', () => {
  it('should treat a non-empty array as an active filter and an empty one as inactive', () => {
    expect(isWeGridFilterActive({ field: 'status', operator: 'in', value: [1] })).toBe(true);
    expect(isWeGridFilterActive({ field: 'status', operator: 'in', value: [] })).toBe(false);
    expect(isWeGridFilterActive({ field: 'status', operator: 'in', value: null })).toBe(false);
  });

  it('should keep only the rows whose value is in the selection', () => {
    const result = applyWeGridFilters(rows, filters({ field: 'status', operator: 'in', value: [1] }), columns);
    expect(result.map((r) => r.code)).toEqual(['A1', 'D4']);
  });

  it('should match a selection that came back from the backend as strings', () => {
    const result = applyWeGridFilters(rows, filters({ field: 'status', operator: 'in', value: ['1', '2'] }), columns);
    expect(result.map((r) => r.code)).toEqual(['A1', 'B2', 'D4']);
  });

  it('should select the blank rows through the null entry', () => {
    const result = applyWeGridFilters(rows, filters({ field: 'status', operator: 'in', value: [null] }), columns);
    expect(result.map((r) => r.code)).toEqual(['C3']);
  });

  it('should combine with another column filter', () => {
    const result = applyWeGridFilters(
      rows,
      filters({ field: 'status', operator: 'in', value: [1] }, { field: 'amount', operator: 'gt', value: 20 }),
      columns
    );
    expect(result.map((r) => r.code)).toEqual(['D4']);
  });

  it('should normalize a Date to a stable key so a reloaded row still matches', () => {
    const first = new Date('2026-01-15T00:00:00.000Z');
    const reloaded = new Date('2026-01-15T00:00:00.000Z');
    expect(weGridFilterValueKey(first)).toBe(weGridFilterValueKey(reloaded));
    expect(weGridFilterValueKey(null)).toBe(weGridFilterValueKey(''));
  });
});

describe('we-grid-filter.util — "in" labels', () => {
  it('should shorten a long selection to "a, b (+n)"', () => {
    expect(weGridInFilterValueLabel(['a', 'b', 'c', 'd', 'e'], String)).toBe('a, b (+3)');
    expect(weGridInFilterValueLabel(['a', 'b'], String)).toBe('a, b');
    expect(weGridInFilterValueLabel([], String)).toBe('');
  });

  it('should build the chip label from the supplied readable labels', () => {
    const label = weGridFilterChipLabel(
      { type: 'number', header: 'Durum' },
      { field: 'status', operator: 'in', value: [1, 2, 3] },
      weGridLocaleTr,
      (value) => `Durum ${value}`
    );
    expect(label).toBe('Durum: Durum 1, Durum 2 (+1)');
  });

  it('should fall back to the locale\'s empty label for the blank entry', () => {
    const label = weGridFilterChipLabel(
      { type: 'text', header: 'Kod' },
      { field: 'code', operator: 'in', value: [null] },
      weGridLocaleTr
    );
    expect(label).toBe(`Kod: ${weGridLocaleTr.emptyGroupValue}`);
  });
});
