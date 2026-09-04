/*
 * Custom `WeGridLayoutStore` — the grid persists the user's column layout through this instead of
 * its built-in LocalStorageGridLayoutStore.
 *
 * Here it is still localStorage, but namespaced per signed-in user and version-tagged; swapping the
 * three method bodies for HTTP calls is all it takes to move layouts to a backend, because the
 * library never talks to the network itself.
 */

import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { WeGridLayout, WeGridLayoutStore } from '@we-grid/angular';

const STORAGE_PREFIX = 'ecommerce-dashboard:layout';

@Injectable({ providedIn: 'root' })
export class UserLayoutStore implements WeGridLayoutStore {
  /** Stands in for the signed-in user's id */
  private readonly userId = 'demo-user';

  load(gridKey: string): Observable<WeGridLayout | null> {
    const raw = this.read(this.storageKey(gridKey));
    if (!raw) return of(null);
    try {
      return of(JSON.parse(raw) as WeGridLayout);
    } catch {
      // Corrupt record — fall back to the developer's default layout
      return of(null);
    }
  }

  save(gridKey: string, layout: WeGridLayout): Observable<void> {
    this.write(this.storageKey(gridKey), JSON.stringify(layout));
    return of(void 0);
  }

  reset(gridKey: string): Observable<void> {
    this.remove(this.storageKey(gridKey));
    return of(void 0);
  }

  /** Used by the page's "saved layout" indicator */
  hasSavedLayout(gridKey: string): boolean {
    return this.read(this.storageKey(gridKey)) !== null;
  }

  private storageKey(gridKey: string): string {
    return `${STORAGE_PREFIX}:${this.userId}:${gridKey}`;
  }

  private read(key: string): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  }

  private write(key: string, value: string): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  }

  private remove(key: string): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  }
}
