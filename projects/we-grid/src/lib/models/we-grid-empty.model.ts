/** Context passed to the `weGridEmpty` template — `let-ctx` gets the same fields, so `ctx.clearAllFilters()` works */
export interface WeGridEmptyContext {
  $implicit: Omit<WeGridEmptyContext, '$implicit'>;
  /** Whether the grid's OWN filters (header, filter row, chips) are active — the consumer's outside filters aren't known to the grid */
  hasActiveFilters: boolean;
  /** Clears the grid's own filters */
  clearAllFilters: () => void;
  /** The message the default empty state would show — `noRecordsMatchFilter` while filtering, otherwise `emptyMessage` */
  message: string;
}
