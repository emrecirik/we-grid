import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { WeGridComponent } from './we-grid.component';
import { WeGridColumnDef } from './models/we-grid-column.model';
import { WE_GRID_LAYOUT_STORE, WeGridLayout, WeGridLayoutStore } from './models/we-grid-layout.model';

class KeyedStore implements WeGridLayoutStore {
  layouts = new Map<string, WeGridLayout>();
  load(key: string): Observable<WeGridLayout | null> {
    return of(this.layouts.get(key) ?? null);
  }
  save(key: string, layout: WeGridLayout): Observable<void> {
    this.layouts.set(key, layout);
    return of(undefined);
  }
  reset(key: string): Observable<void> {
    this.layouts.delete(key);
    return of(undefined);
  }
}

@Component({
  standalone: true,
  imports: [WeGridComponent],
  template: `<we-grid [gridKey]="key" [columns]="columns" [data]="[]" />`
})
class HostComponent {
  key = 'a';
  columns: WeGridColumnDef<unknown>[] = [{ field: 'x', header: 'X' }];
  @ViewChild(WeGridComponent) grid!: WeGridComponent<unknown>;
}

describe('WeGridComponent — changing gridKey', () => {
  it('loads the new key’s layout and drops the old key’s user state', () => {
    const store = new KeyedStore();
    store.layouts.set('a', { gridKey: 'a', version: 1, density: 'compact', striped: true, columns: [{ field: 'x', visible: true, order: 0, pinned: null, width: 300 }] });
    store.layouts.set('b', { gridKey: 'b', version: 1, density: 'comfortable', columns: [{ field: 'x', visible: true, order: 0, pinned: null, width: 120 }] });
    TestBed.configureTestingModule({ imports: [HostComponent], providers: [{ provide: WE_GRID_LAYOUT_STORE, useValue: store }] });
    const fixture: ComponentFixture<HostComponent> = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const grid = fixture.componentInstance.grid;
    expect(grid.density).toBe('compact');
    expect(grid.stripedActive).toBeTrue();
    expect(grid.internalColumns[0].width).toBe(300);

    fixture.componentInstance.key = 'b';
    fixture.detectChanges();
    expect(grid.density).toBe('comfortable');
    expect(grid.stripedActive).toBeFalse();
    expect(grid.internalColumns[0].width).toBe(120);
  });
});
