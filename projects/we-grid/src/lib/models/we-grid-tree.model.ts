/** Where a row sits in the tree — handed to cell templates (`ctx.tree`), `rowClass` and `treeValue` */
export interface WeGridTreeInfo<T> {
  /** 0 = a root row (an entry of `data`) */
  level: number;
  /** Whether the row has children left after filtering */
  hasChildren: boolean;
  /** Whether its children are shown — opened by the user or the API, or held open by an active filter */
  expanded: boolean;
  parent: T | null;
  /** Position among its siblings, 0-based (`aria-posinset` - 1) */
  index: number;
  siblingCount: number;
}

/** Emitted by `(treeExpandChange)` */
export interface WeGridTreeExpandEvent<T> {
  row: T;
  expanded: boolean;
  /** `'user'` for the toggle button; `'api'` for every method call, expand/collapse all included */
  source: 'user' | 'api';
}

/** One entry of the flattened list of visible tree rows the grid renders */
export interface WeGridTreeNode<T> {
  row: T;
  level: number;
  parent: T | null;
  index: number;
  siblingCount: number;
}

/** Options of `scrollToRow` */
export interface WeGridScrollToRowOptions {
  /** Opens the row's collapsed ancestors first — defaults to true */
  expandParents?: boolean;
  block?: 'start' | 'center' | 'nearest';
  /** Falls back to `'auto'` when the user prefers reduced motion */
  behavior?: ScrollBehavior;
}
