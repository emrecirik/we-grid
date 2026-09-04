import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { WeGridLayout, WeGridLayoutStore } from '../models/we-grid-layout.model';

const STORAGE_PREFIX = 'we-grid-layout:';

/**
 * Default persistence implementation — writes the layout to the browser's localStorage.
 * Kicks in automatically when the consumer doesn't provide the `WE_GRID_LAYOUT_STORE` token.
 */
@Injectable()
export class LocalStorageGridLayoutStore implements WeGridLayoutStore {
  load(gridKey: string): Observable<WeGridLayout | null> {
    if (typeof localStorage === 'undefined') {
      return of(null);
    }
    const raw = localStorage.getItem(STORAGE_PREFIX + gridKey);
    if (!raw) {
      return of(null);
    }
    try {
      return of(JSON.parse(raw) as WeGridLayout);
    } catch {
      // Corrupt record — silently ignore, fall back to the default
      return of(null);
    }
  }

  save(gridKey: string, layout: WeGridLayout): Observable<void> {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_PREFIX + gridKey, JSON.stringify(layout));
    }
    return of(void 0);
  }

  reset(gridKey: string): Observable<void> {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_PREFIX + gridKey);
    }
    return of(void 0);
  }
}
