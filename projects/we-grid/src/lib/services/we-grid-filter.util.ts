import { WeGridColumnType, weGridValueKind } from '../models/we-grid-column.model';
import { WeGridColumnFilterState, WeGridFilterOperator, isWeGridFilterActive, weGridFilterValueKey } from '../models/we-grid-filter.model';
import { WeGridLocale, weGridLocaleEn } from '../models/we-grid-locale.model';
import { WeGridFormattableColumn, formatWeGridColumnValue, formatWeGridValue, getNestedValue } from './we-grid-value.util';
import { weGridValueMatchesFilter } from 'we-grid-angular/engine';

export { weGridValueMatchesFilter } from 'we-grid-angular/engine';

interface FilterableColumnLike<T> {
  field: string;
  type: WeGridColumnType;
  format?: string;
  /** When set, text filtering searches this readable label instead of the raw value — see WeGridColumnDef.displayValue */
  displayValue?: (row: T) => string;
}

/** Reads a row's value for a column — `getNestedValue` unless the caller resolves values itself (tree rows) */
export type WeGridValueReader<T> = (row: T, field: string) => unknown;

/**
 * Applies the filter row's result to the loaded rows (whatever page the server returned).
 * With server-side pagination this only filters the LOADED PAGE — the grid shows a separate
 * warning for that (see the "only this page is searched" hint in the WeGridComponent template).
 * `valueOf` replaces the plain field read — the tree uses it to read a child row through
 * `childField` / `treeValue`.
 */
export function applyWeGridFilters<T>(
  rows: T[],
  filters: Map<string, WeGridColumnFilterState>,
  columns: FilterableColumnLike<T>[],
  locale: WeGridLocale = weGridLocaleEn,
  valueOf: WeGridValueReader<T> = getNestedValue
): T[] {
  const active = Array.from(filters.values()).filter((f) => isWeGridFilterActive(f));
  if (active.length === 0) return rows;

  const colByField = new Map(columns.map((c) => [c.field, c]));
  return rows.filter((row) => active.every((filter) => matchesFilter(row, filter, colByField.get(filter.field), locale, valueOf)));
}

function matchesFilter<T>(
  row: T,
  filter: WeGridColumnFilterState,
  col: FilterableColumnLike<T> | undefined,
  locale: WeGridLocale,
  valueOf: WeGridValueReader<T>
): boolean {
  const raw = valueOf(row, filter.field);
  // When displayValue is provided, a text filter searches the label the user sees, not the raw code
  const value = col?.displayValue && filter.operator !== 'in' && weGridValueKind(col.type) === 'text' ? col.displayValue(row) : raw;
  return weGridValueMatchesFilter(value, filter, col?.type ?? 'text', locale);
}

/** The text of an operator in the filter row / popover select — number comparisons read as symbols, the rest as words */
export function weGridFilterOperatorLabel(
  operator: WeGridFilterOperator,
  type: WeGridColumnType,
  locale: WeGridLocale = weGridLocaleEn
): string {
  switch (operator) {
    case 'eq':
      return weGridValueKind(type) === 'number' ? '=' : locale.equals;
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
  col: WeGridFormattableColumn & { header: string },
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
          : formatWeGridColumnValue(value, col, { ...formatOptions, timeZone: locale.intlTimeZone }));
    return `${header}: ${weGridInFilterValueLabel(values, toLabel)}`;
  }

  const kind = weGridValueKind(col.type);
  if (kind === 'boolean') {
    return `${header}: ${filter.value === 'true' ? locale.yes : locale.no}`;
  }

  if (kind === 'number') {
    if (filter.operator === 'between') {
      return `${header}: ${betweenRangeLabel(filter, (v) => formatWeGridColumnValue(v, col, formatOptions))}`;
    }
    const symbol = filter.operator === 'gt' ? '>' : filter.operator === 'lt' ? '<' : '=';
    return `${header} ${symbol} ${formatWeGridColumnValue(filter.value, col, formatOptions)}`;
  }

  if (kind === 'date') {
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
  const kind = weGridValueKind(type);
  if (kind === 'date') {
    const d = value instanceof Date ? value : new Date(value as string);
    if (isNaN(d.getTime())) return null;
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  if (kind === 'number') {
    const n = Number(value);
    return isNaN(n) ? null : n;
  }
  if (kind === 'boolean') {
    return Boolean(value) ? 'true' : 'false';
  }
  return formatWeGridValue(value, type);
}
