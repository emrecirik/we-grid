import { WeGridSortDirection } from './we-grid-column.model';

export interface WeGridPageChange {
  page: number;
  pageSize: number;
}

export interface WeGridSortChange {
  field: string | null;
  direction: WeGridSortDirection;
}

export type WeGridSelectionMode = 'none' | 'single' | 'multi';

export interface WeGridRowClickEvent<T> {
  row: T;
  rowIndex: number;
}

/**
 * Row-level style function — applied to `<tr>` as `[ngClass]`, kept separate from the grid's own
 * `we-grid__row` / `we-grid__row--selected` classes (a distinct binding). The visual result (color,
 * weight, etc.) is defined by the consumer page's own CSS — since the library isn't tied to any
 * theme/Bootstrap, it doesn't impose a ready-made "highlighted row" style here.
 */
export type WeGridRowClassFn<T> = (row: T, index: number) => string | string[] | Record<string, boolean>;
