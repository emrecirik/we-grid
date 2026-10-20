import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WeGridComponent } from './we-grid.component';
import { WeGridColumnDef } from './models/we-grid-column.model';
import { WeGridSortChange } from './models/we-grid-events.model';
import { weGridSanitizeView } from './services/we-grid-view.util';

interface Row {
  id: number;
  city: string;
  qty: number;
}

@Component({
  standalone: true,
  imports: [WeGridComponent],
  template: `<we-grid [columns]="columns" [data]="data" trackByField="id" />`
})
class HostComponent {
  columns: WeGridColumnDef<Row>[] = [
    { field: 'city', header: 'City' },
    { field: 'qty', header: 'Qty', type: 'number' }
  ];
  data: Row[] = [
    { id: 1, city: 'Izmir', qty: 5 },
    { id: 2, city: 'Ankara', qty: 9 },
    { id: 3, city: 'Izmir', qty: 1 },
    { id: 4, city: 'Ankara', qty: 2 }
  ];
  @ViewChild(WeGridComponent) grid!: WeGridComponent<Row>;
}

describe('WeGridComponent — multi-column sort', () => {
  let fixture: ComponentFixture<HostComponent>;
  let grid: WeGridComponent<Row>;
  const label = (i: number): HTMLElement => fixture.nativeElement.querySelectorAll('.we-grid__th-label')[i];
  const ids = () => grid.displayData.map((r) => r.id);

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    grid = fixture.componentInstance.grid;
  });

  it('adds columns to the sort with Shift+click and shows their order', () => {
    const events: WeGridSortChange[] = [];
    grid.sortChange.subscribe((e) => events.push(e));
    label(0).click();
    label(1).dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    fixture.detectChanges();
    expect(ids()).toEqual([4, 2, 3, 1]);
    expect(events.at(-1)).toEqual({ field: 'city', direction: 'asc', thenBy: [{ field: 'qty', direction: 'asc' }] });
    expect(fixture.nativeElement.querySelector('.we-grid__sort-order')?.textContent).toBe('2');
    expect(fixture.nativeElement.querySelector('.we-grid__sort-icon--then .we-grid__sr-only')?.textContent.trim()).toBe('Sort 2, ascending');
    // Shift+click on the first column turns it around and keeps the rest
    label(0).dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    expect(grid.thenBy).toEqual([{ field: 'qty', direction: 'asc' }]);
    expect(ids()).toEqual([3, 1, 4, 2]);
    label(0).dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    label(0).click();
    label(1).dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));

    label(1).dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    expect(ids()).toEqual([2, 4, 1, 3]);
    label(1).dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    expect(grid.thenBy).toEqual([]);

    // A plain click starts over with one column
    label(1).dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    label(1).click();
    expect(grid.thenBy).toEqual([]);
    expect(ids()).toEqual([3, 4, 1, 2]);
  });

  it('keeps the whole sort in a saved view', () => {
    label(0).click();
    label(1).dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    const view = weGridSanitizeView(JSON.parse(JSON.stringify(grid.getCurrentView('v'))))!;
    expect(view.thenBy).toEqual([{ field: 'qty', direction: 'asc' }]);
    label(0).click();
    label(0).click();
    expect(grid.thenBy).toEqual([]);
    grid.applyView(view);
    expect(ids()).toEqual([4, 2, 3, 1]);
  });
});
