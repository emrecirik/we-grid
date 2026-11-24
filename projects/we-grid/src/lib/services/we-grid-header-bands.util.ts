/** One band over the header row: a `headerGroup` label over the columns it spans, or an empty cell over ungrouped ones */
export interface WeGridHeaderBand<C> {
  /** The shared `headerGroup`; null over columns that have none */
  label: string | null;
  columns: C[];
}

/**
 * Splits the rendered columns into header bands: neighbouring columns with the same `headerGroup`
 * share one, and a band never crosses a pinned side — a moved column or a pin splits it, as the
 * user sees the columns apart.
 */
export function weGridHeaderBands<C extends { headerGroup: string | null; pinned: string | null | undefined }>(columns: readonly C[]): WeGridHeaderBand<C>[] {
  const bands: WeGridHeaderBand<C>[] = [];
  for (const col of columns) {
    const last = bands[bands.length - 1];
    const lastCol = last?.columns[last.columns.length - 1];
    if (last && lastCol && last.label === col.headerGroup && (lastCol.pinned ?? null) === (col.pinned ?? null)) last.columns.push(col);
    else bands.push({ label: col.headerGroup, columns: [col] });
  }
  return bands;
}
