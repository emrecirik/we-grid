import { WeGridColumnType } from './we-grid-column-kind';
import type { WeGridFormatValueOptions } from './we-grid-value.util';
import { WeGridChecklistValuesProvider, WeGridColumnFilterState } from './we-grid-filter.model';

/** A column as the grid shows it — what a data source needs to filter and search the way the grid would */
export interface WeGridDataColumn {
  field: string;
  type: WeGridColumnType;
  /** The cell text the user sees for a value — what `search` matches against */
  format?: (value: unknown) => string;
  /**
   * The built-in formatting as plain data, for a source that can't take `format` — a function doesn't
   * cross into a Web Worker. Left out for a column with its own `formatter`.
   */
  formatSpec?: { format?: string; minorUnits?: boolean; options: WeGridFormatValueOptions };
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
  /**
   * Grouped: the rows come group by group in group order (see `weGridCompareGroupValues`), each
   * group's rows in `sort` order — so a group is one run of offsets, as `groups()` reports it
   */
  groupBy?: readonly string[];
  /** The grid's columns — a local source uses them for filter semantics and search text; a remote one may ignore them */
  columns?: readonly WeGridDataColumn[];
  /** BCP 47 tag the search lowercases with (`tr` turns "İ" into "i") */
  locale?: string;
}

/** A subtotal a group carries — the grid asks for the columns that have a group summary */
export interface WeGridGroupAggregate {
  field: string;
  fn: 'sum' | 'avg' | 'min' | 'max' | 'count';
  /** `avg` weighted by this field — see WeGridColumnDef.summaryWeightField */
  weightField?: string;
}

/** What `groups()` is asked for: the groups of the filtered and searched result */
export interface WeGridGroupRequest extends Omit<WeGridDataRequest, 'offset' | 'limit' | 'groupBy'> {
  groupBy: readonly string[];
  aggregates?: readonly WeGridGroupAggregate[];
}

/** One group, and its sub-groups when more than one field is grouped */
export interface WeGridGroupNode {
  field: string;
  /** 0 for the outermost level */
  level: number;
  /** The group's value — null for the empty group */
  value: unknown;
  /** Identifies the group among its siblings: the value as text, '' for the empty group */
  key: string;
  /** Offset of the group's first row in the grouped result `load({ groupBy })` returns */
  start: number;
  count: number;
  /** By field, for each requested aggregate — null when no row had a number */
  aggregates: Record<string, number | null>;
  children?: WeGridGroupNode[];
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
  /** The groups of the result, with counts and subtotals — without it a `dataSource` grid doesn't group */
  groups?(request: WeGridGroupRequest): WeGridGroupNode[] | Promise<WeGridGroupNode[]>;
}
