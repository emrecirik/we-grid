import { WeGridColumnType } from './we-grid-column.model';
import { WeGridChecklistValuesProvider, WeGridColumnFilterState } from './we-grid-filter.model';

/** A column as the grid shows it — what a data source needs to filter and search the way the grid would */
export interface WeGridDataColumn {
  field: string;
  type: WeGridColumnType;
  /** The cell text the user sees for a value — what `search` matches against */
  format?: (value: unknown) => string;
}

/** One window of rows of the current sort, filters and search */
export interface WeGridDataRequest {
  /** Index of the first row wanted, in the sorted and filtered result */
  offset: number;
  /** How many rows, at most */
  limit: number;
  /** Sort keys, most significant first */
  sort?: readonly { field: string; direction: 'asc' | 'desc' }[];
  filters?: readonly WeGridColumnFilterState[];
  /** The toolbar search: every word must appear in some column's cell text */
  search?: string;
  /** The grid's columns — a local source uses them for filter semantics and search text; a remote one may ignore them */
  columns?: readonly WeGridDataColumn[];
  /** BCP 47 tag the search lowercases with (`tr` turns "İ" into "i") */
  locale?: string;
}

export interface WeGridDataPage<T> {
  rows: T[];
  /** Rows in the whole sorted and filtered result */
  total: number;
}

/**
 * Where a `[dataSource]` grid gets its rows: it asks only for the window in view, so the result can
 * be far larger than the browser could hold as objects. `WeGridColumnStore` is the in-browser one.
 */
export interface WeGridDataSource<T> {
  load(request: WeGridDataRequest): WeGridDataPage<T> | Promise<WeGridDataPage<T>>;
  /** Lists a checklist column's values across the whole result — used unless the grid has its own `checklistValuesProvider` */
  checklistValues?: WeGridChecklistValuesProvider;
}
