import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { WeGridDensity, WeGridPinned, WeGridSortDirection, WeGridSummaryFunction } from './we-grid-column.model';
import { LocalStorageGridLayoutStore } from '../services/local-storage-grid-layout-store';

/** Customizations the user has made to a column */
export interface WeGridColumnLayout {
  field: string;
  visible: boolean;
  order: number;
  width?: number;
  wrap?: boolean;
  pinned: WeGridPinned;
  /** User-supplied custom header — falls back to the developer header when empty */
  headerOverride?: string;
  /** Summary function the user chose from the column header context menu — 'none' if omitted */
  summary?: WeGridSummaryFunction;
}

/** The full grid layout persisted to localStorage/backend */
export interface WeGridLayout {
  gridKey: string;
  /** If the developer bumps the `layoutVersion` input, the saved layout is discarded */
  version: number;
  density?: WeGridDensity;
  columns: WeGridColumnLayout[];
  sort?: { field: string; direction: WeGridSortDirection } | null;
  pageSize?: number;
  /**
   * Whether the filter row is open — only meaningful on grids where the `filterRow` input is
   * true. Older saved records don't have this field (undefined); the grid treats that as `false`
   * — a backward-compatible addition that does NOT require bumping layoutVersion. Filter VALUES
   * are never persisted (treated as transient UI state like search boxes), only the row's
   * open/closed preference is remembered.
   */
  filterRowVisible?: boolean;
}

/**
 * Dependency-inversion contract for persistence.
 * The library never makes HTTP calls itself — a consumer can supply an implementation that
 * writes to a backend; if none is provided, `LocalStorageGridLayoutStore` is used.
 */
export interface WeGridLayoutStore {
  load(gridKey: string): Observable<WeGridLayout | null>;
  save(gridKey: string, layout: WeGridLayout): Observable<void>;
  reset(gridKey: string): Observable<void>;
}

export const WE_GRID_LAYOUT_STORE = new InjectionToken<WeGridLayoutStore>('WE_GRID_LAYOUT_STORE', {
  providedIn: 'root',
  factory: () => new LocalStorageGridLayoutStore()
});
