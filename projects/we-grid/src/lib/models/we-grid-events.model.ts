import { WeGridSortDirection } from './we-grid-column.model';
import { WeGridTreeInfo } from './we-grid-tree.model';

export interface WeGridPageChange {
  page: number;
  pageSize: number;
}

export interface WeGridSortChange {
  field: string | null;
  direction: WeGridSortDirection;
}

export type WeGridSelectionMode = 'none' | 'single' | 'multi';

/** A row-level mouse event a cell can keep to itself — see `WeGridColumnDef.stopRowEvents` */
export type WeGridRowEventName = 'click' | 'dblclick' | 'contextmenu';

export interface WeGridRowClickEvent<T> {
  row: T;
  rowIndex: number;
}

/**
 * Row-level style function — applied to `<tr>` as `[ngClass]`, kept separate from the grid's own
 * `we-grid__row` / `we-grid__row--selected` classes (a distinct binding). The visual result (color,
 * weight, etc.) is defined by the consumer page's own CSS — since the library isn't tied to any
 * theme/Bootstrap, it doesn't impose a ready-made "highlighted row" style here.
 * In tree mode a third argument carries the row's place in the tree; it is left out otherwise.
 */
export type WeGridRowClassFn<T> = (row: T, index: number, tree?: WeGridTreeInfo<T>) => string | string[] | Record<string, boolean>;
