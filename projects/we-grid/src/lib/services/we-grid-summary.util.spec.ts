import { computeWeGridSummary, buildWeGridSummaryText, weGridSummaryLabel } from './we-grid-summary.util';

interface Row {
  qty: number | null;
  code: string;
}

describe('computeWeGridSummary', () => {
  const rows: Row[] = [
    { qty: 10, code: 'A' },
    { qty: 20, code: 'B' },
    { qty: null, code: 'C' }, // null doesn't count
    { qty: 5, code: '' } // empty string doesn't count (for code)
  ];

  it('sum — skips null values and adds up the valid numbers', () => {
    expect(computeWeGridSummary(rows, 'qty', 'sum')).toBe(35);
  });

  it('avg — averages only the valid values', () => {
    expect(computeWeGridSummary(rows, 'qty', 'avg')).toBe(35 / 3);
  });

  it('min/max — returns the smallest/largest value, excluding null', () => {
    expect(computeWeGridSummary(rows, 'qty', 'min')).toBe(5);
    expect(computeWeGridSummary(rows, 'qty', 'max')).toBe(20);
  });

  it('count — counts non-null/non-empty values (works on a non-numeric column too)', () => {
    expect(computeWeGridSummary(rows, 'qty', 'count')).toBe(3);
    expect(computeWeGridSummary(rows, 'code', 'count')).toBe(3); // excludes ''
  });

  it("returns null when summary='none'", () => {
    expect(computeWeGridSummary(rows, 'qty', 'none')).toBeNull();
  });

  it('returns null (not NaN) for sum/avg/min/max when there are no valid numeric values', () => {
    const allNull: Row[] = [{ qty: null, code: 'A' }];
    expect(computeWeGridSummary(allNull, 'qty', 'sum')).toBeNull();
    expect(computeWeGridSummary(allNull, 'qty', 'avg')).toBeNull();
    expect(computeWeGridSummary(allNull, 'qty', 'min')).toBeNull();
  });

  it('drops values that cannot be converted to a number (NaN) from the sum', () => {
    const mixed = [{ qty: 10 }, { qty: 'abc' as unknown as number }];
    expect(computeWeGridSummary(mixed, 'qty', 'sum')).toBe(10);
  });
});

describe('buildWeGridSummaryText', () => {
  const rows: Row[] = [
    { qty: 100, code: 'A' },
    { qty: 200, code: 'B' }
  ];
  const numericCol = { field: 'qty', type: 'number' as const, summary: 'sum' as const };

  it("returns null when summary='none' (nothing is printed in the cell)", () => {
    const col = { ...numericCol, summary: 'none' as const };
    expect(buildWeGridSummaryText(rows, col, 'client', undefined)).toBeNull();
  });

  it('uses a scope-free "Sum:" label when no override is given and serverSide=false (all data is loaded)', () => {
    const text = buildWeGridSummaryText(rows, numericCol, 'client', undefined);
    expect(text).toContain('Sum:');
    expect(text).not.toContain('Page');
    expect(text).not.toContain('Grand');
  });

  it('spells out the scope with "Page sum:" when no override is given and serverSide=true', () => {
    const text = buildWeGridSummaryText(rows, numericCol, 'server', undefined);
    expect(text).toContain('Page sum:');
  });

  it('ignores the loaded rows and shows "Grand sum:" when a summaryValues override is given', () => {
    const text = buildWeGridSummaryText(rows, numericCol, 'server', 999999);
    expect(text).toContain('Grand sum:');
    expect(text).toContain('999,999'); // en-US thousands separator
  });

  it('count always formats as a whole number — even when column type is currency', () => {
    const col = { field: 'qty', type: 'currency' as const, format: 'USD', summary: 'count' as const };
    const text = buildWeGridSummaryText(rows, col, 'client', undefined);
    expect(text).toBe('Count: 2');
  });

  it('shows "-" when no valid value can be found (NaN never leaks through)', () => {
    const empty: Row[] = [{ qty: null, code: 'A' }];
    const text = buildWeGridSummaryText(empty, numericCol, 'client', undefined);
    expect(text).toBe('Sum: -');
  });

  it('avg formats according to the column format (en-US)', () => {
    const col = { field: 'qty', type: 'number' as const, format: '2-2', summary: 'avg' as const };
    const text = buildWeGridSummaryText(rows, col, 'client', undefined);
    expect(text).toBe('Average: 150.00');
  });
});

describe('weGridSummaryLabel', () => {
  it('returns a distinct, meaningful label for each (function, scope) pair', () => {
    expect(weGridSummaryLabel('sum', 'client')).toBe('Sum');
    expect(weGridSummaryLabel('sum', 'server')).toBe('Page sum');
    expect(weGridSummaryLabel('sum', 'override')).toBe('Grand sum');
    expect(weGridSummaryLabel('count', 'client')).toBe('Count');
  });
});
