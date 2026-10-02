import { WeGridTreeInfo } from './we-grid-tree.model';

/** Context passed to the `weGridRowDetail` template — used as `let-row`, `let-i="rowIndex"` */
export interface WeGridRowDetailContext<T> {
  $implicit: T;
  row: T;
  rowIndex: number;
  /** The row's place in the tree — only in tree mode */
  tree?: WeGridTreeInfo<T>;
  /** Closes this detail from inside the template — a "Hide" button, say */
  close: () => void;
}

/** Emitted by `(detailToggle)` */
export interface WeGridDetailToggleEvent<T> {
  row: T;
  open: boolean;
  /** `'user'` for the arrow column; `'api'` for the methods and for a detail closed because `canExpandRow` turned false */
  source: 'user' | 'api';
}
