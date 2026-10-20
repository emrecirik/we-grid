import { InjectionToken } from '@angular/core';
import { Observable, of } from 'rxjs';
import { WeGridCellStyle, WeGridFormatRule } from '../models/we-grid-format.model';
import { WeGridAlign } from '../models/we-grid-column.model';

/** How a sheet cell shows a number */
export type WeSheetNumberFormat = 'general' | 'number' | 'integer' | 'currency' | 'percent' | 'date' | 'text';

/** One cell of a sheet. Only cells with content or formatting are stored. */
export interface WeSheetCell {
  /** What the user typed: a number, text, a boolean, or a formula string starting with `=` */
  v?: string | number | boolean | null;
  /** Text style — palette colours only, like the grid's format rules */
  s?: WeGridCellStyle;
  /** Alignment — numbers default to the end, everything else to the start */
  a?: WeGridAlign;
  /** Number format — `general` when omitted */
  f?: WeSheetNumberFormat;
  /** Fixed decimal places (0-10) for number, currency and percent formats */
  d?: number;
  /** A dropdown list: the only values the user may type, offered under the cell (Excel's data validation list) */
  l?: string[];
  /** A note: text shown when the cell is pointed at, marked by a corner triangle (Excel's notes) */
  n?: string;
  /** Borders: the sides drawn, any of `t` `r` `b` `l` (`'tb'`, `'trbl'`) */
  b?: string;
  /** Wrap text: long text breaks onto more lines and the row grows */
  w?: boolean;
}

/**
 * Everything a sheet saves. Cells are keyed by their A1 address (`'B3'`), so a sparse sheet stays
 * small and the saved JSON reads like the spreadsheet it is.
 */
export interface WeSheetData {
  /** Format version of this object — bumped (with a migration) if the shape ever changes */
  version: 1;
  rows: number;
  cols: number;
  cells: Record<string, WeSheetCell>;
  /** Column widths in pixels by column letter — the default width when absent */
  widths?: Record<string, number>;
  /** Row 1 is a header: bold, kept out of sorting, and the column titles of an export */
  headerRow?: boolean;
  /** Zebra rows */
  striped?: boolean;
  /** Column A stays in view while scrolling sideways — the same as `freeze: { cols: 1 }` */
  freezeColumn?: boolean;
  /** Freeze panes: the first `rows` rows and `cols` columns stay in view while scrolling (Excel's Freeze Panes) */
  freeze?: { rows: number; cols: number };
  /** Filter buttons on the header row (Excel's AutoFilter) — needs `headerRow` */
  autoFilter?: boolean;
  /** Per column letter, the shown texts whose rows the filter hides (`''` for blanks) */
  filters?: Record<string, string[]>;
  /** A chart of a range, shown under the cells — `{ range: 'A1:C9', type: 'column' }` */
  chart?: WeSheetChart;
  /** Conditional formatting — the grid's format rules, each over a range of one column */
  formats?: WeSheetFormatRule[];
  /** Merged cells, as ranges (`'A1:C1'`) — the top-left cell holds the content and covers the rest */
  merges?: string[];
}

/**
 * A conditional format rule of a sheet: the grid's `WeGridFormatRule` (its `field` is the column
 * letter) over the cells of `range` — `'B2:B20'`, one column. Highlights, top/bottom, averages,
 * duplicates, colour scales, data bars and icon sets work as in the grid.
 */
export interface WeSheetFormatRule extends WeGridFormatRule {
  range: string;
}

/** The sheet's chart: the first column of the range gives the categories, the first row the series names when it is text */
export interface WeSheetChart {
  range: string;
  type: 'column' | 'bar' | 'line' | 'area' | 'pie' | 'donut';
}

/** Persistence for `<we-sheet sheetKey="…">` — the same dependency-inversion contract as `WeGridLayoutStore` */
export interface WeSheetStore {
  load(sheetKey: string): Observable<WeSheetData | null>;
  save(sheetKey: string, data: WeSheetData): Observable<void>;
}

const STORAGE_PREFIX = 'we-sheet:';

/** Default store — the browser's localStorage */
export class LocalStorageSheetStore implements WeSheetStore {
  load(sheetKey: string): Observable<WeSheetData | null> {
    if (typeof localStorage === 'undefined') return of(null);
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + sheetKey);
      return of(raw ? (JSON.parse(raw) as WeSheetData) : null);
    } catch {
      return of(null);
    }
  }

  save(sheetKey: string, data: WeSheetData): Observable<void> {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_PREFIX + sheetKey, JSON.stringify(data));
      } catch {
        // Quota exceeded — the sheet keeps working, only this save is lost
      }
    }
    return of(void 0);
  }
}

export const WE_SHEET_STORE = new InjectionToken<WeSheetStore>('WE_SHEET_STORE', {
  providedIn: 'root',
  factory: () => new LocalStorageSheetStore()
});
