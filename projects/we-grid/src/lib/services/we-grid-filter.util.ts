import { WeGridColumnType } from '../models/we-grid-column.model';
import { WeGridColumnFilterState, isWeGridFilterActive } from '../models/we-grid-filter.model';
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
  columns: FilterableColumnLike<T>[]
): T[] {
  const active = Array.from(filters.values()).filter((f) => isWeGridFilterActive(f));
  if (active.length === 0) return rows;

  const colByField = new Map(columns.map((c) => [c.field, c]));
  return rows.filter((row) => active.every((filter) => matchesFilter(row, filter, colByField.get(filter.field))));
}

function matchesFilter<T>(row: T, filter: WeGridColumnFilterState, col: FilterableColumnLike<T> | undefined): boolean {
  const type = col?.type ?? 'text';
  const raw = getNestedValue(row, filter.field);

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
      return matchesText(col?.displayValue ? col.displayValue(row) : raw, filter);
  }
}

function matchesText(raw: unknown, filter: WeGridColumnFilterState): boolean {
  const haystack = (raw === null || raw === undefined ? '' : String(raw)).toLowerCase();
  const needle = String(filter.value ?? '').toLowerCase();
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

/** Text shown on an active filter chip — "Column: value", displayed in the strip above the table (see WeGridComponent.activeFilterChips) */
export function weGridFilterChipLabel(
  col: { type: WeGridColumnType; format?: string; header: string },
  filter: WeGridColumnFilterState,
  locale: WeGridLocale = weGridLocaleEn
): string {
  const header = col.header;

  if (col.type === 'boolean') {
    return `${header}: ${filter.value === 'true' ? locale.yes : locale.no}`;
  }

  if (col.type === 'number' || col.type === 'currency') {
    if (filter.operator === 'between') {
      return `${header}: ${betweenRangeLabel(filter, (v) => formatWeGridValue(v, col.type, col.format))}`;
    }
    const symbol = filter.operator === 'gt' ? '>' : filter.operator === 'lt' ? '<' : '=';
    return `${header} ${symbol} ${formatWeGridValue(filter.value, col.type, col.format)}`;
  }

  if (col.type === 'date' || col.type === 'datetime') {
    if (filter.operator === 'between') {
      return `${header}: ${betweenRangeLabel(filter, (v) => formatWeGridValue(v, col.type))}`;
    }
    const value = formatWeGridValue(filter.value, col.type);
    if (filter.operator === 'before') return `${header}: ${value} (${locale.before.toLowerCase()})`;
    if (filter.operator === 'after') return `${header}: ${value} (${locale.after.toLowerCase()})`;
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

/** Converts a single cell's value to a string for "Filter by this value" (quick-filter) — date values match the input[type=date] format */
export function weGridQuickFilterValueToInputString(value: unknown, type: WeGridColumnType): unknown {
  if (type === 'date' || type === 'datetime') {
    const d = value instanceof Date ? value : new Date(value as string);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
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
