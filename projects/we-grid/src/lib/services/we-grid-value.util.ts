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

function formatDateValue(value: unknown, withTime: boolean, locale: string, timeZone: string | undefined): string {
  const date = value instanceof Date ? value : new Date(value as string);
  if (isNaN(date.getTime())) return String(value);
  const options: Intl.DateTimeFormatOptions = withTime
    ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' };
  // Only set when asked for: an explicit timeZone would override the runtime's own zone
  if (timeZone) options.timeZone = timeZone;
  return getDateTimeFormat(locale, options).format(date);
}

export interface WeGridFormatValueOptions {
  /** BCP 47 tag used for `Intl.NumberFormat`/`Intl.DateTimeFormat` — defaults to 'en-US' */
  locale?: string;
  /** ISO 4217 code used by a currency column whose own `format` doesn't name one — defaults to 'USD' */
  currency?: string;
  /** IANA time zone date/datetime values are shown in — defaults to the runtime's local zone */
  timeZone?: string;
  /** Text shown for `true` on boolean columns — defaults to 'Yes' */
  yesLabel?: string;
  /** Text shown for `false` on boolean columns — defaults to 'No' */
  noLabel?: string;
  /** Currency columns: the value is in the currency's minor unit — see WeGridColumnDef.minorUnits */
  minorUnits?: boolean;
}

/** Converts a value to display text based on the column type — used by columns without a custom template */
export function formatWeGridValue(value: unknown, type: WeGridColumnType, format?: string, options?: WeGridFormatValueOptions): string {
  if (value === null || value === undefined || value === '') return '';

  const locale = options?.locale ?? 'en-US';

  switch (type) {
    case 'number':
      return formatNumber(value, locale, parseFractionDigits(format));
    case 'integer':
      return formatNumber(value, locale, format ? parseFractionDigits(format) : { maximumFractionDigits: 0 });
    case 'percent':
      return formatNumber(value, locale, { style: 'percent', maximumFractionDigits: 2, ...parseFractionDigits(format) });
    case 'currency': {
      const currency = weGridResolveCurrency(format, options?.currency);
      const num = Number(value);
      if (isNaN(num)) return String(value);
      const amount = options?.minorUnits ? num / 10 ** weGridCurrencyFractionDigits(currency) : num;
      return getNumberFormat(locale, { style: 'currency', currency }).format(amount);
    }
    case 'date':
      return formatDateValue(value, false, locale, options?.timeZone);
    case 'datetime':
      return formatDateValue(value, true, locale, options?.timeZone);
    case 'time':
      return formatTimeValue(value, format, locale, options?.timeZone);
    case 'boolean':
      return value ? (options?.yesLabel ?? 'Yes') : (options?.noLabel ?? 'No');
    default:
      return String(value);
  }
}

/** A value that doesn't parse as a number is shown as it is rather than as "NaN" */
function formatNumber(value: unknown, locale: string, options: Intl.NumberFormatOptions): string {
  const num = Number(value);
  return isNaN(num) ? String(value) : getNumberFormat(locale, options).format(num);
}

const TIME_OF_DAY = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/**
 * A time column holds either a time of day (`'14:30'`, `'14:30:15'`) or a full instant. A time of
 * day is NOT an instant, so it is never shifted into `timeZone` — only a `Date`/ISO value is.
 * Seconds are shown when `format` asks for them (`'HH:mm:ss'`).
 */
function formatTimeValue(value: unknown, format: string | undefined, locale: string, timeZone: string | undefined): string {
  const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  if (format?.includes('ss')) options.second = '2-digit';
  const match = typeof value === 'string' ? TIME_OF_DAY.exec(value.trim()) : null;
  if (match) {
    const date = new Date(2000, 0, 1, Number(match[1]), Number(match[2]), Number(match[3] ?? 0));
    return getDateTimeFormat(locale, options).format(date);
  }
  const date = value instanceof Date ? value : new Date(value as string);
  if (isNaN(date.getTime())) return String(value);
  if (timeZone) options.timeZone = timeZone;
  return getDateTimeFormat(locale, options).format(date);
}

/** The column's own ISO 4217 code (`format`), then the grid's, then USD */
export function weGridResolveCurrency(format: string | undefined, fallback?: string): string {
  return format || fallback || 'USD';
}

const fractionDigitsCache = new Map<string, number>();

/**
 * How many minor units the currency has — 2 for TRY/USD/EUR, 0 for JPY, 3 for KWD — taken from
 * `Intl`, so no table has to be maintained. An unknown code falls back to 2.
 */
export function weGridCurrencyFractionDigits(currency: string): number {
  let digits = fractionDigitsCache.get(currency);
  if (digits === undefined) {
    try {
      digits = new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
      digits = 2;
    }
    fractionDigitsCache.set(currency, digits);
  }
  return digits;
}

/** The subset of a column the value helpers need — both `WeGridColumnDef` and `WeGridInternalColumn` fit */
export interface WeGridFormattableColumn<T = unknown> {
  type: WeGridColumnType;
  format?: string;
  minorUnits?: boolean;
  // Method syntax on purpose: it lets a column of any row type be passed where the row is unknown
  formatter?(value: unknown, row: T | null): string;
}

/**
 * The display text of one value of a column: its `formatter` when it has one, otherwise the
 * built-in formatting for its type (including `minorUnits`). Every place that shows a value as text
 * goes through this — cells, summary, chips, checklist entries, group headers, exports.
 */
export function formatWeGridColumnValue<T>(
  value: unknown,
  col: WeGridFormattableColumn<T>,
  options?: WeGridFormatValueOptions,
  row: T | null = null
): string {
  if (col.formatter) return col.formatter(value, row);
  return formatWeGridValue(value, col.type, col.format, { ...options, minorUnits: col.minorUnits });
}

/**
 * The factor between a stored numeric value and the number a user types into a filter input or an
 * editor: 100 for a percent column (the user types 25 for 0.25), 1/100 for a kuruş/cent currency
 * column (the user types 123.45 for 12345), 1 otherwise.
 */
export function weGridInputScale(col: WeGridFormattableColumn, currency?: string): number {
  if (col.type === 'percent') return 100;
  if (col.type === 'currency' && col.minorUnits) {
    return 1 / 10 ** weGridCurrencyFractionDigits(weGridResolveCurrency(col.format, currency));
  }
  return 1;
}

/** Stored value → the number shown in an input. Rounded so 0.07 × 100 shows 7, not 7.000000000000001 */
export function weGridToInputNumber(value: unknown, scale: number): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (isNaN(num)) return null;
  return scale === 1 ? num : Number((num * scale).toPrecision(12));
}

/**
 * The number typed into an input → the stored value. A minor-unit column (scale below 1) stores
 * whole numbers, so 123.45 becomes exactly 12345 rather than 12344.999999999998.
 */
export function weGridFromInputNumber(input: unknown, scale: number): number | null {
  if (input === null || input === undefined || input === '') return null;
  const num = Number(input);
  if (isNaN(num)) return null;
  if (scale === 1) return num;
  // Trimmed before rounding: 1.005 / 0.01 is 100.49999999999999 in floating point, not 100.5
  const stored = Number((num / scale).toPrecision(12));
  return scale < 1 ? Math.round(stored) : stored;
}

/**
 * The `href` of an email/url/phone cell, or null for any other type or an empty value. A url
 * without an http(s) scheme gets `https://` in front, so a `javascript:` value can never become a
 * live link.
 */
export function weGridLinkHref(value: unknown, type: WeGridColumnType): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === '') return null;
  switch (type) {
    case 'email':
      return `mailto:${text}`;
    case 'phone': {
      const dialable = text.replace(/[^\d+]/g, '');
      return dialable ? `tel:${dialable}` : null;
    }
    case 'url':
      return /^https?:\/\//i.test(text) ? text : `https://${text}`;
    default:
      return null;
  }
}
