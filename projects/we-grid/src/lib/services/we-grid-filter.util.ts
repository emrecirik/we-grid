import { WeGridColumnType } from '../models/we-grid-column.model';
import { WeGridColumnFilterState, WeGridFilterOperator, isWeGridFilterActive, weGridFilterValueKey } from '../models/we-grid-filter.model';
import { WeGridLocale, weGridLocaleEn } from '../models/we-grid-locale.model';
import { formatWeGridValue, getNestedValue } from './we-grid-value.util';

interface FilterableColumnLike<T> {
  field: string;
  type: WeGridColumnType;
  format?: string;
  /** When set, text filtering searches this readable label instead of the raw value — see WeGridColumnDef.displayValue */
  displayValue?: (row: T) => string;
}

/**
 * Applies the filter row's result to the loaded rows (whatever page the server returned).
 * With server-side pagination this only filters the LOADED PAGE — the grid shows a separate
 * warning for that (see the "only this page is searched" hint in the WeGridComponent template).
 */
export function applyWeGridFilters<T>(
  rows: T[],
  filters: Map<string, WeGridColumnFilterState>,
  columns: FilterableColumnLike<T>[],
  locale: WeGridLocale = weGridLocaleEn
): T[] {
  const active = Array.from(filters.values()).filter((f) => isWeGridFilterActive(f));
  if (active.length === 0) return rows;

  const colByField = new Map(columns.map((c) => [c.field, c]));
  return rows.filter((row) => active.every((filter) => matchesFilter(row, filter, colByField.get(filter.field), locale)));
}

function matchesFilter<T>(row: T, filter: WeGridColumnFilterState, col: FilterableColumnLike<T> | undefined, locale: WeGridLocale): boolean {
  const type = col?.type ?? 'text';
  const raw = getNestedValue(row, filter.field);

  // 'in' comes from the checklist header filter and works the same way on every column type, so it
  // is answered before the per-type branches.
  if (filter.operator === 'in') return matchesIn(raw, filter);

  switch (type) {
    case 'number':
    case 'currency':
      return matchesNumber(raw, filter);
    case 'date':
    case 'datetime':
      return matchesDate(raw, filter);
    case 'boolean':
      return matchesBoolean(raw, filter);
    default:
      // When displayValue is provided, search against the label the user sees, not the raw code
      return matchesText(col?.displayValue ? col.displayValue(row) : raw, filter, locale);
  }
}

/**
 * The checklist selection. Comparison goes through `weGridFilterValueKey` rather than `===` so a
 * value that made the round trip through the backend as a string still matches the numeric/date
 * cell it came from.
 */
function matchesIn(raw: unknown, filter: WeGridColumnFilterState): boolean {
  if (!Array.isArray(filter.value) || filter.value.length === 0) return true;
  const key = weGridFilterValueKey(raw);
  return filter.value.some((selected) => weGridFilterValueKey(selected) === key);
}

/**
 * Case-insensitive through the locale's own lowercasing: the locale-free `toLowerCase()` turns
 * "İSTANBUL" into "i̇stanbul" (an i plus a combining dot), which never equals "istanbul".
 */
function matchesText(raw: unknown, filter: WeGridColumnFilterState, locale: WeGridLocale): boolean {
  const haystack = (raw === null || raw === undefined ? '' : String(raw)).toLocaleLowerCase(locale.intlLocale);
  const needle = String(filter.value ?? '').toLocaleLowerCase(locale.intlLocale);
  if (needle === '') return true;
  switch (filter.operator) {
    case 'startsWith':
      return haystack.startsWith(needle);
    case 'equals':
      return haystack === needle;
    case 'contains':
    default:
      return haystack.includes(needle);
  }
}

function matchesNumber(raw: unknown, filter: WeGridColumnFilterState): boolean {
  if (raw === null || raw === undefined || raw === '') return false;
  const num = Number(raw);
  if (isNaN(num)) return false;

  if (filter.operator === 'between') {
    const min = toNumberOrNull(filter.value);
    const max = toNumberOrNull(filter.value2);
    if (min !== null && num < min) return false;
    if (max !== null && num > max) return false;
    return true;
  }

  const target = toNumberOrNull(filter.value);
  if (target === null) return true;
  switch (filter.operator) {
    case 'gt':
      return num > target;
    case 'lt':
      return num < target;
    case 'eq':
    default:
      return num === target;
  }
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

/** Dates are compared at day granularity — a time component would make an "equals" filter meaningless */
function matchesDate(raw: unknown, filter: WeGridColumnFilterState): boolean {
  if (raw === null || raw === undefined || raw === '') return false;
  const rowDate = toDayStart(raw);
  if (!rowDate) return false;

  if (filter.operator === 'between') {
    const from = toDayStart(filter.value);
    const to = toDayStart(filter.value2);
    if (from && rowDate.getTime() < from.getTime()) return false;
    if (to && rowDate.getTime() > to.getTime()) return false;
    return true;
  }

  const target = toDayStart(filter.value);
  if (!target) return true;
  switch (filter.operator) {
    case 'before':
      return rowDate.getTime() < target.getTime();
    case 'after':
      return rowDate.getTime() > target.getTime();
    case 'eq':
    default:
      return rowDate.getTime() === target.getTime();
  }
}

function toDayStart(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value as string);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function matchesBoolean(raw: unknown, filter: WeGridColumnFilterState): boolean {
  if (filter.value === 'all' || filter.value === undefined || filter.value === null) return true;
  const expected = filter.value === 'true';
  return Boolean(raw) === expected;
}

/** The text of an operator in the filter row / popover select — number comparisons read as symbols, the rest as words */
export function weGridFilterOperatorLabel(
  operator: WeGridFilterOperator,
  type: WeGridColumnType,
  locale: WeGridLocale = weGridLocaleEn
): string {
  switch (operator) {
    case 'eq':
      return type === 'number' || type === 'currency' ? '=' : locale.equals;
    case 'gt':
      return '>';
    case 'lt':
      return '<';
    case 'between':
      return locale.between;
    case 'before':
      return locale.before;
    case 'after':
      return locale.after;
    case 'contains':
      return locale.contains;
    case 'startsWith':
      return locale.startsWith;
    case 'equals':
      return locale.equals;
    default:
      // 'in' belongs to the checklist, which never renders an operator select
      return operator;
  }
}

/**
 * "a, b (+3)" — the value part of an 'in' filter. Shared by the chip label and the filter row's
 * checklist button so a long selection never widens either of them beyond one line.
 */
export function weGridInFilterValueLabel(
  values: unknown[],
  valueLabel: (value: unknown) => string,
  maxShown = 2
): string {
  const shown = values.slice(0, maxShown).map(valueLabel).join(', ');
  const rest = values.length - maxShown;
  return rest > 0 ? `${shown} (+${rest})` : shown;
}

/**
 * Text shown on an active filter chip — "Column: value", displayed in the strip above the table
 * (see WeGridComponent.activeFilterChips). `valueLabel` is only consulted for the 'in' operator,
 * where the grid knows the readable label of each picked value (the column's `displayValue`).
 */
export function weGridFilterChipLabel(
  col: { type: WeGridColumnType; format?: string; header: string },
  filter: WeGridColumnFilterState,
  locale: WeGridLocale = weGridLocaleEn,
  valueLabel?: (value: unknown) => string
): string {
  const header = col.header;
  // The typed-in bounds of a number/date filter are not instants, so no timeZone: a yyyy-MM-dd bound
  // is the day the user picked, and shifting it into another zone could show the day before.
  const formatOptions = { locale: locale.intlLocale, currency: locale.intlCurrency };

  if (filter.operator === 'in') {
    const values = Array.isArray(filter.value) ? filter.value : [];
    const toLabel =
      valueLabel ??
      ((value: unknown) =>
        value === null || value === undefined || value === ''
          ? locale.emptyGroupValue
          : formatWeGridValue(value, col.type, col.format, { ...formatOptions, timeZone: locale.intlTimeZone }));
    return `${header}: ${weGridInFilterValueLabel(values, toLabel)}`;
  }

  if (col.type === 'boolean') {
    return `${header}: ${filter.value === 'true' ? locale.yes : locale.no}`;
  }

  if (col.type === 'number' || col.type === 'currency') {
    if (filter.operator === 'between') {
      return `${header}: ${betweenRangeLabel(filter, (v) => formatWeGridValue(v, col.type, col.format, formatOptions))}`;
    }
    const symbol = filter.operator === 'gt' ? '>' : filter.operator === 'lt' ? '<' : '=';
    return `${header} ${symbol} ${formatWeGridValue(filter.value, col.type, col.format, formatOptions)}`;
  }

  if (col.type === 'date' || col.type === 'datetime') {
    if (filter.operator === 'between') {
      return `${header}: ${betweenRangeLabel(filter, (v) => formatWeGridValue(v, col.type, undefined, formatOptions))}`;
    }
    const value = formatWeGridValue(filter.value, col.type, undefined, formatOptions);
    if (filter.operator === 'before') return `${header}: ${value} (${locale.before.toLocaleLowerCase(locale.intlLocale)})`;
    if (filter.operator === 'after') return `${header}: ${value} (${locale.after.toLocaleLowerCase(locale.intlLocale)})`;
    return `${header}: ${value}`;
  }

  // text/custom — a plain "Column: value" regardless of operator
  return `${header}: ${String(filter.value ?? '')}`;
}

/** With 'between', even a single bound may be set — only the filled-in one(s) are shown */
function betweenRangeLabel(filter: WeGridColumnFilterState, format: (v: unknown) => string): string {
  const hasMin = filter.value !== null && filter.value !== undefined && filter.value !== '';
  const hasMax = filter.value2 !== null && filter.value2 !== undefined && filter.value2 !== '';
  if (hasMin && hasMax) return `${format(filter.value)} - ${format(filter.value2)}`;
  if (hasMin) return `≥ ${format(filter.value)}`;
  if (hasMax) return `≤ ${format(filter.value2)}`;
  return '';
}

/**
 * Converts a single cell's value to a string for "Filter by this value" (quick-filter) — date values
 * match the input[type=date] format. The LOCAL calendar day, like the date input and matchesDate's
 * day comparison: `toISOString()` gave the UTC day, so a row stamped 00:30 in UTC+3 filtered on the
 * day before.
 */
export function weGridQuickFilterValueToInputString(value: unknown, type: WeGridColumnType): unknown {
  if (type === 'date' || type === 'datetime') {
    const d = value instanceof Date ? value : new Date(value as string);
    if (isNaN(d.getTime())) return null;
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  if (type === 'number' || type === 'currency') {
    const n = Number(value);
    return isNaN(n) ? null : n;
  }
  if (type === 'boolean') {
    return Boolean(value) ? 'true' : 'false';
  }
  return formatWeGridValue(value, type);
}
