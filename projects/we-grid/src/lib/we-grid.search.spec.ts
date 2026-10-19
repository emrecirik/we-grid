import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { WeGridComponent } from './we-grid.component';
import { WeGridColumnDef } from './models/we-grid-column.model';
import { WE_GRID_LAYOUT_STORE, WeGridLayout, WeGridLayoutStore } from './models/we-grid-layout.model';

interface Row {
  id: number;
  name: string;
  city: string;
  price: number;
}

class MemoryStore implements WeGridLayoutStore {
  saved: WeGridLayout | null = null;
  load(): Observable<WeGridLayout | null> {
    return of(this.saved);
  }
  save(_k: string, layout: WeGridLayout): Observable<void> {
    this.saved = layout;
    return of(undefined);
  }
  reset(): Observable<void> {
    return of(undefined);
  }
}

@Component({
  standalone: true,
  imports: [WeGridComponent],
  template: `<we-grid gridKey="search-spec" [columns]="columns" [data]="data" trackByField="id" [search]="true" [formatting]="true" (searchChange)="emitted.push($event)" />`
})
class HostComponent {
  columns: WeGridColumnDef<Row>[] = [
    { field: 'name', header: 'Name' },
    { field: 'city', header: 'City' },
    { field: 'price', header: 'Price', type: 'number' }
  ];
  data: Row[] = [
    { id: 1, name: 'Road bike', city: 'İzmir', price: 1250.5 },
    { id: 2, name: 'Helmet', city: 'Ankara', price: 89.9 },
    { id: 3, name: 'Bike light', city: 'Ankara', price: 39 }
  ];
  emitted: string[] = [];
  @ViewChild(WeGridComponent) grid!: WeGridComponent<Row>;
}

describe('WeGridComponent — search and decimal places', () => {
  let fixture: ComponentFixture<HostComponent>;
  let store: MemoryStore;
  const ids = () => fixture.componentInstance.grid.displayData.map((r) => r.id);

  beforeEach(() => {
    store = new MemoryStore();
    TestBed.configureTestingModule({ imports: [HostComponent], providers: [{ provide: WE_GRID_LAYOUT_STORE, useValue: store }] });
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('finds every word across the visible columns as the user types', fakeAsync(() => {
    const input = fixture.nativeElement.querySelector('.we-grid__search-input') as HTMLInputElement;
    input.value = 'bike ankara';
    input.dispatchEvent(new Event('input'));
    tick(300);
    expect(ids()).toEqual([3]);
    expect(fixture.componentInstance.emitted).toEqual(['bike ankara']);
    fixture.componentInstance.grid.setSearch('89.9');
    expect(ids()).toEqual([2]);
    fixture.componentInstance.grid.clearSearch();
    expect(ids()).toEqual([1, 2, 3]);
  }));

  it('sets decimal places from the Format panel and saves them with the layout', fakeAsync(() => {
    const grid = fixture.componentInstance.grid;
    (grid as unknown as { handleMenuAction(a: unknown): void }).handleMenuAction({ type: 'format', field: 'price' });
    fixture.detectChanges();
    const more = fixture.nativeElement.querySelector('[aria-label="More decimal places"]') as HTMLButtonElement;
    more.click();
    fixture.detectChanges();
    const price = grid.internalColumns.find((c) => c.field === 'price')!;
    expect(price.format).toBe('3-3');
    expect(grid.formatCell(fixture.componentInstance.data[1], price)).toBe('89.900');
    tick(600);
    expect(store.saved?.columns.find((c) => c.field === 'price')?.format).toBe('3-3');
  }));
});
