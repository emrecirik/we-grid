import { Observable } from 'rxjs';
import { WeGridColumnType, WeGridHeaderFilterMode, weGridValueKind } from './we-grid-column.model';

/** Text column filter operators — defaults to 'contains' */
export type WeGridTextFilterOperator = 'contains' | 'startsWith' | 'equals';
/** Number/currency column filter operators — defaults to 'eq' */
export type WeGridNumberFilterOperator = 'eq' | 'gt' | 'lt' | 'between';
/** Date/datetime column filter operators — defaults to 'eq' */
export type WeGridDateFilterOperator = 'eq' | 'before' | 'after' | 'between';
/** Boolean columns work with a single operator, the selection is kept in the 'value' field */
export type WeGridBooleanFilterOperator = 'eq';
/**
 * "Is one of" — produced by the checklist header filter (see WeGridColumnDef.headerFilterMode).
 * Works on every column type and is the only operator whose `value` is an ARRAY.
 */
export type WeGridInFilterOperator = 'in';

export type WeGridFilterOperator =
  | WeGridTextFilterOperator
  | WeGridNumberFilterOperator
  | WeGridDateFilterOperator
  | WeGridBooleanFilterOperator
  | WeGridInFilterOperator;

/**
 * Current filter state for a single column in the filter row.
 * `value2` is only used with the 'between' operator (number/date range) — the upper bound.
 * On boolean columns `value` directly holds an 'all' | 'true' | 'false' string.
 * With the 'in' operator `value` holds the selected raw values as an `unknown[]`; a `null` entry in
 * that array is the "(Empty)" bucket (null/undefined/'' cells).
 */
export interface WeGridColumnFilterState {
  field: string;
  operator: WeGridFilterOperator;
  value: unknown;
  value2?: unknown;
}

/** One row of the checklist header filter — a distinct value of the loaded page */
export interface WeGridChecklistOption {
  /** The raw value sent to the backend — `null` for the "(Empty)" entry */
  value: unknown;
  /** Comparison key, `weGridFilterValueKey(value)` — the selection is tracked by this, not by identity */
  key: string;
  /** Readable label — the column's `displayValue` when it has one, otherwise the formatted cell text */
  label: string;
  /** Whether this is the null/undefined/'' bucket */
  blank: boolean;
}

/** One candidate value a `checklistValuesProvider` returns for a checklist column */
export interface WeGridChecklistValue {
  /** The raw value, which is what the resulting 'in' filter carries — `null` is the "(Empty)" entry */
  value: unknown;
  /** A ready-made label. Without one the column's `checklistValueLabel`, then plain formatting, labels the value */
  label?: string;
}

/** What a checklist popover asks the grid's `checklistValuesProvider` for */
export interface WeGridChecklistValuesRequest {
  /** The column being filtered — its `WeGridColumnDef.field` */
  field: string;
  /** The search box's trimmed text — `null` while the box is empty */
  search: string | null;
  /**
   * Every active filter EXCEPT the requested column's own: the list narrows by the other columns
   * (only the statuses supplier ABC's orders have), but never by itself — that would leave the user
   * unable to see any value besides the ones already ticked.
   */
  filters: WeGridColumnFilterState[];
  /** The most values to return — keep it at or below what the backend accepts in one `IN (...)` */
  limit: number;
}

export interface WeGridChecklistValuesResult {
  values: WeGridChecklistValue[];
  /** More values exist beyond `limit` — the popover then says only the first ones are listed */
  hasMore: boolean;
}

/**
 * Supplies a checklist's values from outside the loaded rows — typically a thin wrapper around an
 * HTTP call. An Observable rather than a Promise so the grid can cancel a request as soon as the
 * search box changes again; the library itself still makes no request of its own.
 *
 * Emitting `null` says the backend can't list this column's values (a date, a counter, free text):
 * the grid then switches the column to the operator filter for the rest of the grid's life.
 */
export type WeGridChecklistValuesProvider = (request: WeGridChecklistValuesRequest) => Observable<WeGridChecklistValuesResult | null>;

/** Key of the "(Empty)" checklist entry — every blank cell value normalizes to it */
export const WE_GRID_BLANK_FILTER_KEY = '\u0000blank';

/**
 * Normalizes a value into the string key used to compare checklist selections.
 * Comparing by key rather than by identity is what lets a selection survive a page change: the
 * backend may send `"5"` where the previous page had `5`, and a `Date` is a new object on every
 * load.
 */
export function weGridFilterValueKey(value: unknown): string {
  if (value === null || value === undefined || value === '') return WE_GRID_BLANK_FILTER_KEY;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Payload of `(filterChange)`. It IS the array of active filters — a consumer that typed the event
 * as `WeGridColumnFilterState[]` keeps working untouched — with two extra properties bolted on so a
 * server-side screen knows whether the reload belongs on page 1.
 */
export interface WeGridFilterChangeEvent extends Array<WeGridColumnFilterState> {
  /** The same entries as the array itself, for consumers that prefer reading a named property */
  readonly filters: WeGridColumnFilterState[];
  /**
   * True when the active filter set actually changed since the last emit, which means the current
   * page number no longer applies and the reload must ask for page 1. The grid deliberately does
   * NOT emit `(pageChange)` of its own here: the screen sets `page = 1` and issues ONE request
   * instead of racing a page event against a filter event.
   */
  readonly resetPage: boolean;
}

/** Builds the `(filterChange)` payload — see WeGridFilterChangeEvent for why it is an array with extras */
export function weGridFilterChangeEvent(filters: WeGridColumnFilterState[], resetPage: boolean): WeGridFilterChangeEvent {
  return Object.assign(filters, { filters, resetPage }) as WeGridFilterChangeEvent;
}

/** Default operator pre-selected in the filter row, based on the column type */
export function weGridDefaultFilterOperator(type: WeGridColumnType): WeGridFilterOperator {
  return weGridValueKind(type) === 'text' ? 'contains' : 'eq';
}

/**
 * Every operator the filter row and the filter popover offer per column type, in display order.
 * The single source both templates render from — they used to repeat these lists independently.
 */
const WE_GRID_FILTER_OPERATORS_BY_TYPE: Record<WeGridColumnType, readonly WeGridFilterOperator[]> = {
  text: ['contains', 'startsWith', 'equals'],
  custom: ['contains', 'startsWith', 'equals'],
  time: ['contains', 'startsWith', 'equals'],
  email: ['contains', 'startsWith', 'equals'],
  url: ['contains', 'startsWith', 'equals'],
  phone: ['contains', 'startsWith', 'equals'],
  number: ['eq', 'gt', 'lt', 'between'],
  integer: ['eq', 'gt', 'lt', 'between'],
  currency: ['eq', 'gt', 'lt', 'between'],
  percent: ['eq', 'gt', 'lt', 'between'],
  date: ['eq', 'before', 'after', 'between'],
  datetime: ['eq', 'before', 'after', 'between'],
  boolean: ['eq']
};

/**
 * The operators offered for a column, in display order — the first one is the column's default.
 * `filterOperators` (see WeGridColumnDef.filterOperators) narrows the type's list and keeps its own
 * order; entries that don't fit the type are dropped, and a list left empty falls back to the
 * type's full list rather than leaving the column unfilterable.
 */
export function weGridFilterOperatorsFor(type: WeGridColumnType, filterOperators?: WeGridFilterOperator[]): WeGridFilterOperator[] {
  const full = WE_GRID_FILTER_OPERATORS_BY_TYPE[type] ?? WE_GRID_FILTER_OPERATORS_BY_TYPE.text;
  if (!filterOperators || filterOperators.length === 0) return [...full];
  const allowed = Array.from(new Set(filterOperators.filter((op) => full.includes(op))));
  return allowed.length > 0 ? allowed : [...full];
}

/**
 * The operator "Filter by this value" produces: `'in'` on a checklist column, otherwise the exact
 * match for the type (`'equals'` / `'eq'`). Null when the column's `filterOperators` don't allow
 * that exact match — the context menu then hides the item instead of sending an operator the
 * backend was declared not to accept.
 */
export function weGridQuickFilterOperator(col: {
  type: WeGridColumnType;
  headerFilterMode?: WeGridHeaderFilterMode;
  filterOperators?: WeGridFilterOperator[];
}): WeGridFilterOperator | null {
  if (col.headerFilterMode === 'checklist') return 'in';
  const exact: WeGridFilterOperator = weGridValueKind(col.type) === 'text' ? 'equals' : 'eq';
  return weGridFilterOperatorsFor(col.type, col.filterOperators).includes(exact) ? exact : null;
}

/** The empty/default filter-row state for a column type — while at this value the filter is NOT considered active */
export function weGridEmptyFilterValue(type: WeGridColumnType): unknown {
  return type === 'boolean' ? 'all' : null;
}

/**
 * Determines whether a column's filter will actually be applied.
 * 'all' is not active on boolean columns; with the 'between' operator, a single bound (min or max)
 * is enough; with 'in' a non-empty array of selected values is required.
 */
export function isWeGridFilterActive(filter: WeGridColumnFilterState | undefined): boolean {
  if (!filter) return false;
  if (filter.operator === 'in') return Array.isArray(filter.value) && filter.value.length > 0;
  if (filter.operator === 'eq' && filter.value === 'all') return false; // boolean "All"
  if (filter.operator === 'between') {
    return !isEmptyFilterPrimitive(filter.value) || !isEmptyFilterPrimitive(filter.value2);
  }
  return !isEmptyFilterPrimitive(filter.value);
}

function isEmptyFilterPrimitive(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}
