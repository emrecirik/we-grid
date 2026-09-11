import { WeGridColumnFilterState, isWeGridFilterActive, weGridFilterValueKey } from '../models/we-grid-filter.model';
import { weGridLocaleEn, weGridLocaleTr } from '../models/we-grid-locale.model';
import {
  applyWeGridFilters,
  weGridFilterChipLabel,
  weGridFilterOperatorLabel,
  weGridInFilterValueLabel,
  weGridQuickFilterValueToInputString
} from './we-grid-filter.util';

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

describe('we-grid-filter.util — text matching', () => {
  const cities = [
    { code: 'IST', city: 'İSTANBUL' },
    { code: 'IZM', city: 'İzmir' },
    { code: 'ANK', city: 'Ankara' }
  ];
  const cityColumns = [{ field: 'city', type: 'text' as const }];

  function matching(operator: 'contains' | 'startsWith' | 'equals', value: string, locale?: typeof weGridLocaleEn): string[] {
    return applyWeGridFilters(cities, filters({ field: 'city', operator, value }), cityColumns, locale).map((r) => r.code);
  }

  it('should match contains / startsWith / equals case-insensitively with the English default', () => {
    expect(matching('contains', 'KAR')).toEqual(['ANK']);
    expect(matching('startsWith', 'ank')).toEqual(['ANK']);
    expect(matching('equals', 'ankara')).toEqual(['ANK']);
    expect(matching('equals', 'ankar')).toEqual([]);
  });

  it('should match "İSTANBUL" against "istanbul" with the Turkish locale', () => {
    expect(matching('contains', 'istanbul', weGridLocaleTr)).toEqual(['IST']);
    expect(matching('startsWith', 'iz', weGridLocaleTr)).toEqual(['IZM']);
    expect(matching('equals', 'İZMİR', weGridLocaleTr)).toEqual(['IZM']);
  });

  it('should leave the English default as it was — its lowercasing keeps a combining dot on "İ"', () => {
    expect(matching('contains', 'istanbul')).toEqual([]);
    expect(matching('contains', 'istanbul', weGridLocaleEn)).toEqual([]);
  });
});

describe('we-grid-filter.util — locale-aware chip labels', () => {
  it('should format number bounds with the locale\'s separators and currency', () => {
    const label = weGridFilterChipLabel({ type: 'currency', header: 'Tutar' }, { field: 'amount', operator: 'gt', value: 1234.5 }, weGridLocaleTr);
    expect(label).toContain('Tutar > ');
    expect(label).toContain('1.234,50');
    expect(label).toContain('₺');
  });

  it('should lowercase the before/after word with the locale\'s rules', () => {
    const label = weGridFilterChipLabel({ type: 'date', header: 'Tarih' }, { field: 'at', operator: 'before', value: '2026-09-11' }, weGridLocaleTr);
    expect(label).toContain('(öncesi)');
  });

  it('should keep the English chip text as it was', () => {
    expect(weGridFilterChipLabel({ type: 'number', header: 'Qty' }, { field: 'qty', operator: 'lt', value: 1234.5 })).toBe('Qty < 1,234.5');
  });
});

describe('weGridFilterOperatorLabel', () => {
  it('should read number comparisons as symbols and the rest as locale words', () => {
    expect(weGridFilterOperatorLabel('eq', 'number')).toBe('=');
    expect(weGridFilterOperatorLabel('eq', 'date')).toBe('Equals');
    expect(weGridFilterOperatorLabel('between', 'currency', weGridLocaleTr)).toBe('Aralık');
    expect(weGridFilterOperatorLabel('startsWith', 'text', weGridLocaleTr)).toBe('İle Başlar');
  });
});

describe('weGridQuickFilterValueToInputString', () => {
  it('should use the local calendar day of a date value, not the UTC day', () => {
    // 00:30 local is the previous UTC day anywhere east of UTC, 23:30 local the next one anywhere
    // west of it — 0.3.0 used the UTC day and got one of the two wrong outside UTC.
    expect(weGridQuickFilterValueToInputString(new Date(2026, 8, 11, 0, 30), 'datetime')).toBe('2026-09-11');
    expect(weGridQuickFilterValueToInputString(new Date(2026, 8, 11, 23, 30).toISOString(), 'date')).toBe('2026-09-11');
  });

  it('should return null for a value that is not a date', () => {
    expect(weGridQuickFilterValueToInputString('not a date', 'date')).toBeNull();
  });
});
