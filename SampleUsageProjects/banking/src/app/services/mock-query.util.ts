/*
 * In a real application every function in this file is replaced by SQL: the WHERE clause, the
 * ORDER BY and the OFFSET/FETCH. It exists only so the samples can demonstrate the server-side
 * contract of <we-grid> without a backend — the filter semantics mirror the ones the grid applies
 * client-side (see we-grid-filter.util.ts in the library).
 */

import { WeGridColumnFilterState, WeGridSortDirection } from '@we-grid/angular';

/** Column types the mock backend knows how to filter/sort on */
export type MockFieldType = 'text' | 'number' | 'currency' | 'date' | 'datetime' | 'boolean';

/** Field -> type map the mock backend uses instead of a real schema */
export type MockFieldTypes = Record<string, MockFieldType>;

/** Shape every mock endpoint returns */
export interface MockPagedResult<T> {
  items: T[];
  totalCount: number;
  totalPages: number;
}

type UnknownRow = Record<string, unknown>;

function readField(row: unknown, field: string): unknown {
  return (row as UnknownRow)[field];
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Dates are compared at day granularity, exactly like the grid does client-side */
function toDayStart(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date.getTime();
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
    default:
      return haystack.includes(needle);
  }
}

function matchesNumber(raw: unknown, filter: WeGridColumnFilterState): boolean {
  const value = toNumberOrNull(raw);
  if (value === null) return false;

  if (filter.operator === 'between') {
    const min = toNumberOrNull(filter.value);
    const max = toNumberOrNull(filter.value2);
    if (min !== null && value < min) return false;
    if (max !== null && value > max) return false;
    return true;
  }

  const target = toNumberOrNull(filter.value);
  if (target === null) return true;
  if (filter.operator === 'gt') return value > target;
  if (filter.operator === 'lt') return value < target;
  return value === target;
}

function matchesDate(raw: unknown, filter: WeGridColumnFilterState): boolean {
  const value = toDayStart(raw);
  if (value === null) return false;

  if (filter.operator === 'between') {
    const from = toDayStart(filter.value);
    const to = toDayStart(filter.value2);
    if (from !== null && value < from) return false;
    if (to !== null && value > to) return false;
    return true;
  }

  const target = toDayStart(filter.value);
  if (target === null) return true;
  if (filter.operator === 'before') return value < target;
  if (filter.operator === 'after') return value > target;
  return value === target;
}

function matchesBoolean(raw: unknown, filter: WeGridColumnFilterState): boolean {
  if (filter.value === 'all' || filter.value === null || filter.value === undefined) return true;
  return Boolean(raw) === (filter.value === 'true');
}

function matches(row: unknown, filter: WeGridColumnFilterState, type: MockFieldType): boolean {
  const raw = readField(row, filter.field);
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
      return matchesText(raw, filter);
  }
}

/** WHERE clause equivalent — every active filter must match (AND) */
export function applyMockFilters<T>(rows: T[], filters: WeGridColumnFilterState[], types: MockFieldTypes): T[] {
  if (filters.length === 0) return rows;
  return rows.filter((row) => filters.every((filter) => matches(row, filter, types[filter.field] ?? 'text')));
}

/** ORDER BY equivalent — numbers/dates compare numerically, everything else as locale text */
export function applyMockSort<T>(
  rows: T[],
  field: string | null,
  direction: WeGridSortDirection,
  types: MockFieldTypes
): T[] {
  if (!field || !direction) return rows;
  const type = types[field] ?? 'text';
  const factor = direction === 'desc' ? -1 : 1;

  return [...rows].sort((a, b) => {
    const left = readField(a, field);
    const right = readField(b, field);

    if (left === null || left === undefined) return right === null || right === undefined ? 0 : 1;
    if (right === null || right === undefined) return -1;

    if (type === 'number' || type === 'currency') {
      return ((toNumberOrNull(left) ?? 0) - (toNumberOrNull(right) ?? 0)) * factor;
    }
    if (type === 'date' || type === 'datetime') {
      return (new Date(String(left)).getTime() - new Date(String(right)).getTime()) * factor;
    }
    if (type === 'boolean') {
      return (Number(Boolean(left)) - Number(Boolean(right))) * factor;
    }
    return String(left).localeCompare(String(right)) * factor;
  });
}

/** OFFSET/FETCH equivalent — the page is clamped so an out-of-range page still returns rows */
export function paginateMock<T>(rows: T[], page: number, pageSize: number): MockPagedResult<T> {
  const totalCount = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return { items: rows.slice(start, start + pageSize), totalCount, totalPages };
}
