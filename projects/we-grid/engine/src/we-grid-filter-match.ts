import { WeGridColumnType, weGridValueKind } from './we-grid-column-kind';
import { WeGridColumnFilterState, weGridFilterValueKey } from './we-grid-filter.model';

/** Whether one cell value passes a filter of a column of `type` — the rule `applyWeGridFilters` applies per row */
export function weGridValueMatchesFilter(raw: unknown, filter: WeGridColumnFilterState, type: WeGridColumnType, locale: { intlLocale: string } = { intlLocale: 'en-US' }): boolean {
  // 'in' comes from the checklist header filter and works the same way on every column type, so it
  // is answered before the per-type branches.
  if (filter.operator === 'in') return matchesIn(raw, filter);

  switch (weGridValueKind(type)) {
    case 'number':
      return matchesNumber(raw, filter);
    case 'date':
      return matchesDate(raw, filter);
    case 'boolean':
      return matchesBoolean(raw, filter);
    default:
      return matchesText(raw, filter, locale);
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
 * Text as typed text matches it, ignoring case: the locale's lowercasing, then without the combining
 * dot every locale but Turkish leaves after "İ" ("İzmir" → "i\u0307zmir"), so "izmir" finds "İzmir"
 * whatever the grid's language. Search, text filters, checklist search and format rules all use it.
 */
export function weGridFoldCase(text: string, locale?: string): string {
  return text.toLocaleLowerCase(locale).replace(/\u0307/g, '');
}

function matchesText(raw: unknown, filter: WeGridColumnFilterState, locale: { intlLocale: string }): boolean {
  const haystack = weGridFoldCase(raw === null || raw === undefined ? '' : String(raw), locale.intlLocale);
  const needle = weGridFoldCase(String(filter.value ?? ''), locale.intlLocale);
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
  // A copy — setHours below must not move the time of the row's own Date
  const d = new Date(value instanceof Date ? value.getTime() : (value as string));
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function matchesBoolean(raw: unknown, filter: WeGridColumnFilterState): boolean {
  if (filter.value === 'all' || filter.value === undefined || filter.value === null) return true;
  const expected = filter.value === 'true';
  return Boolean(raw) === expected;
}
