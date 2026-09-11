import { formatWeGridValue, getNestedValue } from './we-grid-value.util';

describe('getNestedValue', () => {
  it('reads a flat field', () => {
    expect(getNestedValue({ code: 'A1' }, 'code')).toBe('A1');
  });

  it('reads a nested field path', () => {
    expect(getNestedValue({ manager: { user: { name: 'Alice' } } }, 'manager.user.name')).toBe('Alice');
  });

  it('returns undefined when an intermediate object is missing', () => {
    expect(getNestedValue({ manager: null }, 'manager.user.name')).toBeUndefined();
  });
});

describe('formatWeGridValue', () => {
  it('returns empty text for empty values', () => {
    expect(formatWeGridValue(null, 'text')).toBe('');
    expect(formatWeGridValue(undefined, 'number')).toBe('');
  });

  it('translates a boolean value to Yes/No by default', () => {
    expect(formatWeGridValue(true, 'boolean')).toBe('Yes');
    expect(formatWeGridValue(false, 'boolean')).toBe('No');
  });

  it('accepts custom yes/no labels via options', () => {
    expect(formatWeGridValue(true, 'boolean', undefined, { yesLabel: 'Evet', noLabel: 'Hayır' })).toBe('Evet');
    expect(formatWeGridValue(false, 'boolean', undefined, { yesLabel: 'Evet', noLabel: 'Hayır' })).toBe('Hayır');
  });

  it('turns a text value into a plain string as-is', () => {
    expect(formatWeGridValue(42, 'text')).toBe('42');
  });
});

// NOTE: the locale-specific cases use 'tr-TR' or an explicit timeZone, so they populate formatter
// cache keys of their own and never pre-warm the 'en-US' entries the cache tests below count.
describe('formatWeGridValue — locale, currency and time zone options', () => {
  it('formats numbers with the Turkish separators', () => {
    expect(formatWeGridValue(1234.5, 'number', '2-2', { locale: 'tr-TR' })).toBe('1.234,50');
  });

  it('formats a date as dd.MM.yyyy in Turkish', () => {
    expect(formatWeGridValue(new Date(2026, 8, 11), 'date', undefined, { locale: 'tr-TR' })).toBe('11.09.2026');
  });

  it('uses the currency option only when the column names no currency of its own', () => {
    const lira = formatWeGridValue(1234.5, 'currency', undefined, { locale: 'tr-TR', currency: 'TRY' });
    expect(lira).toContain('₺');
    expect(lira).toContain('1.234,50');
    expect(formatWeGridValue(1234.5, 'currency', 'EUR', { locale: 'tr-TR', currency: 'TRY' })).toContain('€');
    expect(formatWeGridValue(1234.5, 'currency', undefined, { locale: 'tr-TR' })).toContain('$');
  });

  it('shows a date in the requested time zone', () => {
    const instant = new Date('2026-09-10T21:30:00.000Z');
    expect(formatWeGridValue(instant, 'date', undefined, { locale: 'tr-TR', timeZone: 'Europe/Istanbul' })).toBe('11.09.2026');
    expect(formatWeGridValue(instant, 'date', undefined, { locale: 'tr-TR', timeZone: 'UTC' })).toBe('10.09.2026');
  });
});

// On large grids (200 rows x 15 columns), constructing a fresh Intl.NumberFormat/DateTimeFormat on
// every cell/every CD cycle would be wasteful — cached at module scope instead. Here we confirm the
// constructor is NOT called again for the same locale+options combination.
// NOTE: the cache persists for the lifetime of the module, so to avoid clashing with other tests the
// format combinations used here (fraction '4-4'/'6-6', currency 'XAU') are specific to this file.
describe('formatWeGridValue formatter cache', () => {
  it('constructs Intl.NumberFormat only once for the same number format (locale+options)', () => {
    const ctorSpy = spyOn(Intl, 'NumberFormat').and.callThrough();

    formatWeGridValue(1000, 'number', '4-4');
    formatWeGridValue(2000, 'number', '4-4');
    formatWeGridValue(3000, 'number', '4-4');

    expect(ctorSpy).toHaveBeenCalledTimes(1);
  });

  it('constructs a separate Intl.NumberFormat for a different format string', () => {
    const ctorSpy = spyOn(Intl, 'NumberFormat').and.callThrough();

    formatWeGridValue(1000, 'number', '5-5');
    formatWeGridValue(1000, 'number', '6-6');

    expect(ctorSpy).toHaveBeenCalledTimes(2);
  });

  it('also goes through the Intl.NumberFormat cache for the same currency format', () => {
    const ctorSpy = spyOn(Intl, 'NumberFormat').and.callThrough();

    formatWeGridValue(10, 'currency', 'XAU');
    formatWeGridValue(20, 'currency', 'XAU');

    expect(ctorSpy).toHaveBeenCalledTimes(1);
  });

  // NOTE: 'date' and 'datetime' both use the same cache key set (the options object) across
  // separate 'it' blocks, so Jasmine's randomized ordering used to cross-contaminate the cache
  // (whichever test ran first left the other test's spy seeing 0 calls) — grouped into one test.
  it('goes through the Intl.DateTimeFormat cache for date, but constructs a separate formatter for datetime (different option set)', () => {
    const ctorSpy = spyOn(Intl, 'DateTimeFormat').and.callThrough();

    formatWeGridValue('2026-01-01', 'date');
    formatWeGridValue('2026-02-02', 'date');
    formatWeGridValue('2026-03-03', 'date');
    formatWeGridValue('2026-04-04', 'datetime');

    // 3 'date' calls share a single constructor call, 'datetime' constructs a second one for its
    // different option set — 2 in total.
    expect(ctorSpy).toHaveBeenCalledTimes(2);
  });
});
