import { InjectionToken } from '@angular/core';
import { Observable, of } from 'rxjs';
import { WeGridCellStyle } from '../models/we-grid-format.model';
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
