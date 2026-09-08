import { WeGridColumnType } from '../models/we-grid-column.model';

/** Reads an `a.b.c` style nested field path off the row object */
export function getNestedValue<T>(row: T, path: string): unknown {
  if (!path.includes('.')) {
    return (row as unknown as Record<string, unknown>)[path];
  }
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, row);
}

/**
 * Writes an `a.b.c` style nested field path onto the row object, creating the intermediate objects
 * a missing path needs. Used when committing an inline edit: a column may address a nested field,
 * and the draft is keyed by that same path.
 *
 * Every object along the path is REPLACED with a copy rather than written into. The caller starts
 * from a shallow copy of the row, which still shares its nested objects with the original — a
 * plain in-place write would reach through that copy and change the untouched original too, so
 * cancelling an edit would not actually undo anything.
 */
export function setNestedValue<T>(row: T, path: string, value: unknown): void {
  if (!path.includes('.')) {
    (row as unknown as Record<string, unknown>)[path] = value;
    return;
  }
  const keys = path.split('.');
  const last = keys.pop() as string;
  let target = row as unknown as Record<string, unknown>;
  for (const key of keys) {
    const next = target[key];
    target[key] = next !== null && typeof next === 'object' ? { ...(next as Record<string, unknown>) } : {};
    target = target[key] as Record<string, unknown>;
  }
  target[last] = value;
}

/** `format` can specify min-max decimal digits, e.g. "2-2" */
function parseFractionDigits(format?: string): { minimumFractionDigits?: number; maximumFractionDigits?: number } {
  if (!format) return {};
  const match = /^(\d+)-(\d+)$/.exec(format);
  if (!match) return {};
  return { minimumFractionDigits: Number(match[1]), maximumFractionDigits: Number(match[2]) };
}

// Constructing a fresh Intl.NumberFormat/DateTimeFormat on every cell/every CD cycle is expensive
// (200 rows x 15 columns ≈ thousands of objects per cycle). Formatters only depend on
// locale+options and are immutable — cache them at module scope.
const numberFormatCache = new Map<string, Intl.NumberFormat>();
const dateFormatCache = new Map<string, Intl.DateTimeFormat>();

function getNumberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = numberFormatCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    numberFormatCache.set(key, formatter);
  }
  return formatter;
}

function getDateTimeFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = dateFormatCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    dateFormatCache.set(key, formatter);
  }
  return formatter;
}

function formatDateValue(value: unknown, withTime: boolean, locale: string): string {
  const date = value instanceof Date ? value : new Date(value as string);
  if (isNaN(date.getTime())) return String(value);
  const options: Intl.DateTimeFormatOptions = withTime
    ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' };
  return getDateTimeFormat(locale, options).format(date);
}

export interface WeGridFormatValueOptions {
  /** BCP 47 tag used for `Intl.NumberFormat`/`Intl.DateTimeFormat` — defaults to 'en-US' */
  locale?: string;
  /** Text shown for `true` on boolean columns — defaults to 'Yes' */
  yesLabel?: string;
  /** Text shown for `false` on boolean columns — defaults to 'No' */
  noLabel?: string;
}

/** Converts a value to display text based on the column type — used by columns without a custom template */
export function formatWeGridValue(value: unknown, type: WeGridColumnType, format?: string, options?: WeGridFormatValueOptions): string {
  if (value === null || value === undefined || value === '') return '';

  const locale = options?.locale ?? 'en-US';

  switch (type) {
    case 'number':
      return getNumberFormat(locale, parseFractionDigits(format)).format(Number(value));
    case 'currency':
      return getNumberFormat(locale, { style: 'currency', currency: format || 'USD' }).format(Number(value));
    case 'date':
      return formatDateValue(value, false, locale);
    case 'datetime':
      return formatDateValue(value, true, locale);
    case 'boolean':
      return value ? (options?.yesLabel ?? 'Yes') : (options?.noLabel ?? 'No');
    default:
      return String(value);
  }
}
