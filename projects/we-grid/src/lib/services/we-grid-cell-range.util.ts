/** One end of a cell range: the row's key and the column's field */
export interface WeGridCellRef {
  key: unknown;
  field: string;
}

/** A block of selected cells — see `WeGridComponent.cellSelection` */
export interface WeGridCellRange<T> {
  /** The block's rows, top to bottom as the user sees them */
  rows: T[];
  /** The block's columns, left to right */
  fields: string[];
}

/** Statistics of a cell range's numbers — what the status line shows */
export interface WeGridRangeStats {
  /** Non-empty cells */
  count: number;
  /** Cells holding a finite number */
  numbers: number;
  sum: number;
  average: number;
  min: number;
  max: number;
}

/** Quotes a cell the way Excel and Google Sheets read tab-separated text */
export function weGridTsvCell(text: string): string {
  return /[\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A table of display texts as tab-separated lines, optionally under a header line */
export function weGridToTsv(headers: readonly string[] | null, rows: readonly (readonly string[])[]): string {
  const lines = headers ? [headers.map(weGridTsvCell).join('\t')] : [];
  for (const row of rows) lines.push(row.map(weGridTsvCell).join('\t'));
  return lines.join('\n');
}

/** The [from, to] index span between two positions, in either order; null when one is missing */
export function weGridSpan(a: number, b: number): [number, number] | null {
  if (a < 0 || b < 0) return null;
  return a <= b ? [a, b] : [b, a];
}

/** Count, sum, average, min and max of the values; numbers only feed the arithmetic */
export function weGridRangeStats(values: readonly unknown[]): WeGridRangeStats {
  let count = 0;
  let numbers = 0;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    count++;
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    numbers++;
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return numbers === 0
    ? { count, numbers, sum: 0, average: 0, min: 0, max: 0 }
    : { count, numbers, sum, average: sum / numbers, min, max };
}
