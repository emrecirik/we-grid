import { WeGridColumnType, WeGridSummaryFunction } from '../models/we-grid-column.model';
import { WeGridLocale, weGridLocaleEn } from '../models/we-grid-locale.model';
import { formatWeGridValue, getNestedValue } from './we-grid-value.util';

/** Which data scope the summary was computed over — the label must always make the scope explicit */
export type WeGridSummaryScope = 'override' | 'server' | 'client';

interface SummaryColumnLike {
  field: string;
  type: WeGridColumnType;
  format?: string;
  summary: WeGridSummaryFunction;
}

function summaryLabels(locale: WeGridLocale): Record<WeGridSummaryScope, Record<Exclude<WeGridSummaryFunction, 'none'>, string>> {
  // serverSide=false — all the data is already loaded, a genuine total
  const client = { sum: locale.sum, avg: locale.average, min: locale.min, max: locale.max, count: locale.count };
  return {
    // override coming from the server's summaryValues — a genuine grand total. The locale builds the
    // whole label: a fixed "Grand " prefix can't produce languages that inflect the word it joins.
    override: {
      sum: locale.summaryGrand(client.sum),
      avg: locale.summaryGrand(client.avg),
      min: locale.summaryGrand(client.min),
      max: locale.summaryGrand(client.max),
      count: locale.summaryGrand(client.count)
    },
    // serverSide=true but no override — only the totals of the LOADED PAGE, labeled separately so the user isn't misled
    server: {
      sum: locale.summaryPage(client.sum),
      avg: locale.summaryPage(client.avg),
      min: locale.summaryPage(client.min),
      max: locale.summaryPage(client.max),
      count: locale.summaryPage(client.count)
    },
    client
  };
}

export function weGridSummaryLabel(fn: Exclude<WeGridSummaryFunction, 'none'>, scope: WeGridSummaryScope, locale: WeGridLocale = weGridLocaleEn): string {
  return summaryLabels(locale)[scope][fn];
}

/**
 * Computes a single column's summary value over the loaded rows.
 * null/undefined/'' values don't count. For sum/avg/min/max, values that don't convert to a
 * number (NaN) are skipped too. Returns null when there's no valid value to compute (the summary
 * row then shows '-').
 */
export function computeWeGridSummary<T>(rows: T[], field: string, fn: WeGridSummaryFunction): number | null {
  if (fn === 'none') return null;

  const raw = rows.map((row) => getNestedValue(row, field)).filter((v) => v !== null && v !== undefined && v !== '');

  if (fn === 'count') {
    return raw.length;
  }

  const numbers = raw.map((v) => Number(v)).filter((n) => !isNaN(n));
  if (numbers.length === 0) return null;

  switch (fn) {
    case 'sum':
      return numbers.reduce((a, b) => a + b, 0);
    case 'avg':
      return numbers.reduce((a, b) => a + b, 0) / numbers.length;
    case 'min':
      return Math.min(...numbers);
    case 'max':
      return Math.max(...numbers);
    default:
      return null;
  }
}

/** count is always a whole number — even if the column is currency/formatted, it never gets decimals or a currency symbol */
function formatSummaryNumber(value: number, col: SummaryColumnLike, fn: Exclude<WeGridSummaryFunction, 'none'>, locale: WeGridLocale): string {
  const options = { locale: locale.intlLocale, currency: locale.intlCurrency };
  if (fn === 'count') {
    return formatWeGridValue(value, 'number', '0-0', options);
  }
  return formatWeGridValue(value, col.type, col.format, options);
}

/**
 * Builds the "Label: value" text shown in a summary row cell.
 * - When `overrideValue` is given (the server's grand total), it's used directly with a "Grand ..." label.
 * - Otherwise it's computed over `rows`, and the scope is spelled out in the label (page vs. real total).
 * Returns null when summary is 'none' (nothing is shown in the cell).
 */
export function buildWeGridSummaryText<T>(
  rows: T[],
  col: SummaryColumnLike,
  scope: 'server' | 'client',
  overrideValue: number | undefined,
  locale: WeGridLocale = weGridLocaleEn
): string | null {
  if (col.summary === 'none') return null;
  const fn = col.summary;

  if (overrideValue !== undefined) {
    return `${weGridSummaryLabel(fn, 'override', locale)}: ${formatSummaryNumber(overrideValue, col, fn, locale)}`;
  }

  const computed = computeWeGridSummary(rows, col.field, fn);
  const label = weGridSummaryLabel(fn, scope, locale);
  if (computed === null) return `${label}: -`;
  return `${label}: ${formatSummaryNumber(computed, col, fn, locale)}`;
}
