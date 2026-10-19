import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { WeGridColumnDef } from '../models/we-grid-column.model';
import { WE_GRID_LAYOUT_STORE, WeGridLayout, WeGridLayoutStore } from '../models/we-grid-layout.model';
import { WeGridComponent } from '../we-grid.component';
import { WePivotComponent } from './we-pivot.component';
import { WePivotConfig } from './we-pivot.util';

class NullStore implements WeGridLayoutStore {
  load(): Observable<WeGridLayout | null> {
    return of(null);
  }
  save(): Observable<void> {
    return of(undefined);
  }
  reset(): Observable<void> {
    return of(undefined);
  }
}

interface Sale {
  city: string;
  year: number;
  total: number;
}

@Component({
  standalone: true,
  imports: [WePivotComponent],
  template: `<we-pivot [data]="data" [fields]="fields" [config]="config" (configChange)="changes.push($event)" />`
})
class HostComponent {
  fields: WeGridColumnDef<Sale>[] = [
    { field: 'city', header: 'City' },
    { field: 'year', header: 'Year', type: 'integer' },
    { field: 'total', header: 'Total', type: 'number' }
  ];
  data: Sale[] = [
    { city: 'Izmir', year: 2025, total: 10 },
    { city: 'Izmir', year: 2026, total: 5 },
    { city: 'Ankara', year: 2026, total: 7 }
  ];
  config: WePivotConfig = { rows: ['city'], columns: [], values: [{ field: 'total', aggregate: 'sum' }] };
  changes: WePivotConfig[] = [];
  @ViewChild(WePivotComponent) pivot!: WePivotComponent<Sale>;
}

describe('WePivotComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  const grid = () => fixture.debugElement.query((d) => d.componentInstance instanceof WeGridComponent).componentInstance as WeGridComponent<Record<string, unknown>>;
  const el = (): HTMLElement => fixture.nativeElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent], providers: [{ provide: WE_GRID_LAYOUT_STORE, useClass: NullStore }] });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders the pivot in a grid with a grand total', () => {
    expect(grid().displayData.map((r) => r['r:city'])).toEqual(['Ankara', 'Izmir']);
    const valueCol = grid().internalColumns[1];
    expect(grid().summaryCellText(valueCol)).toContain('22');
  });

  it('adds a column field from its picker and spreads the values', () => {
    const pickers = el().querySelectorAll<HTMLSelectElement>('.we-pivot__add');
    pickers[1].value = 'year';
    pickers[1].dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(host.changes.at(-1)?.columns).toEqual(['year']);
    expect(grid().internalColumns.map((c) => c.defaultHeader)).toEqual(['City', '2025', '2026', 'Total']);
  });

  it('changes the aggregate and removes fields from their chips', async () => {
    host.pivot.setAggregate(0, 'count');
    fixture.detectChanges();
    expect(grid().internalColumns[1].defaultHeader).toBe('Count · Total');
    const remove = el().querySelector<HTMLButtonElement>('.we-pivot__zone .we-pivot__chip-btn')!;
    remove.click();
    fixture.detectChanges();
    expect(host.changes.at(-1)?.rows).toEqual([]);
  });

  it('evaluates formula fields', () => {
    host.fields = [...host.fields, { field: 'double', header: 'Double', type: 'number', formula: '=[Total] * 2' }];
    host.config = { rows: ['city'], columns: [], values: [{ field: 'double', aggregate: 'sum' }] };
    fixture.detectChanges();
    expect(grid().displayData.map((r) => r[grid().internalColumns[1].field])).toEqual([14, 30]);
  });

  it('groups by the outer row fields for subtotals and swaps rows and columns', () => {
    host.pivot.add('rows', 'year');
    fixture.detectChanges();
    expect(grid().groupFields).toEqual(['r:city']);
    host.pivot.swap();
    fixture.detectChanges();
    expect(host.changes.at(-1)).toEqual(jasmine.objectContaining({ rows: [], columns: ['city', 'year'] }));
  });
});
