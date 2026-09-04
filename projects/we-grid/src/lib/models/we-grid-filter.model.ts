import { WeGridColumnType } from './we-grid-column.model';

/** Text column filter operators — defaults to 'contains' */
export type WeGridTextFilterOperator = 'contains' | 'startsWith' | 'equals';
/** Number/currency column filter operators — defaults to 'eq' */
export type WeGridNumberFilterOperator = 'eq' | 'gt' | 'lt' | 'between';
/** Date/datetime column filter operators — defaults to 'eq' */
export type WeGridDateFilterOperator = 'eq' | 'before' | 'after' | 'between';
/** Boolean columns work with a single operator, the selection is kept in the 'value' field */
export type WeGridBooleanFilterOperator = 'eq';

export type WeGridFilterOperator =
  | WeGridTextFilterOperator
  | WeGridNumberFilterOperator
  | WeGridDateFilterOperator
  | WeGridBooleanFilterOperator;

/**
 * Current filter state for a single column in the filter row.
 * `value2` is only used with the 'between' operator (number/date range) — the upper bound.
 * On boolean columns `value` directly holds an 'all' | 'true' | 'false' string.
 */
export interface WeGridColumnFilterState {
  field: string;
  operator: WeGridFilterOperator;
  value: unknown;
  value2?: unknown;
}

/** Default operator pre-selected in the filter row, based on the column type */
export function weGridDefaultFilterOperator(type: WeGridColumnType): WeGridFilterOperator {
  switch (type) {
    case 'number':
    case 'currency':
      return 'eq';
    case 'date':
    case 'datetime':
      return 'eq';
    case 'boolean':
      return 'eq';
    default:
      return 'contains';
  }
}

/** The empty/default filter-row state for a column type — while at this value the filter is NOT considered active */
export function weGridEmptyFilterValue(type: WeGridColumnType): unknown {
  return type === 'boolean' ? 'all' : null;
}

/**
 * Determines whether a column's filter will actually be applied.
 * 'all' is not active on boolean columns; with the 'between' operator, a single bound (min or max) is enough.
 */
export function isWeGridFilterActive(filter: WeGridColumnFilterState | undefined): boolean {
  if (!filter) return false;
  if (filter.operator === 'eq' && filter.value === 'all') return false; // boolean "All"
  if (filter.operator === 'between') {
    return !isEmptyFilterPrimitive(filter.value) || !isEmptyFilterPrimitive(filter.value2);
  }
  return !isEmptyFilterPrimitive(filter.value);
}

function isEmptyFilterPrimitive(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}
