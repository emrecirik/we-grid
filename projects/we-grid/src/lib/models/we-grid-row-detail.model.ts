/** Context passed to the `weGridRowDetail` template — used as `let-row`, `let-i="rowIndex"` */
export interface WeGridRowDetailContext<T> {
  $implicit: T;
  row: T;
  rowIndex: number;
}
