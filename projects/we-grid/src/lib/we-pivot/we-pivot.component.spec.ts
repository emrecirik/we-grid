import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { WeGridColumnDef } from '../models/we-grid-column.model';
import { WE_GRID_LAYOUT_STORE, WeGridLayout, WeGridLayoutStore } from '../models/we-grid-layout.model';
import { WeGridComponent } from '../we-grid.component';
import { WeGridColumnStore } from 'we-grid-angular/engine';
import { WeGridDataSource } from '../models/we-grid-data-source.model';
import { WePivotComponent } from './we-pivot.component';
import { WePivotCellClickEvent, WePivotConfig } from './we-pivot.util';

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
  template: `<we-pivot [data]="data" [dataSource]="source" [fields]="fields" [config]="config" (configChange)="changes.push($event)" (cellClick)="clicks.push($event)" />`
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
  clicks: WePivotCellClickEvent[] = [];
  source: WeGridDataSource<Sale> | null = null;
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

  it('pivots a data source through its groups, the same table as from the rows', async () => {
    const fromRows = grid().displayData.map((r) => ({ ...r }));
    host.source = WeGridColumnStore.fromRows(host.data);
    host.data = [];
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(grid().displayData.map((r) => ({ ...r }))).toEqual(fromRows);
  });

  it('refuses a formula field over a data source instead of leaving it out', async () => {
    host.fields = [...host.fields, { field: 'double', header: 'Double', type: 'number', formula: '=[total]*2' }];
    host.config = { rows: ['city'], columns: [], values: [{ field: 'double', aggregate: 'sum' }] };
    host.source = WeGridColumnStore.fromRows(host.data);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().querySelector('.we-pivot__note[role="alert"]')?.textContent).toContain('Double is a formula field');
    expect(grid().displayData.length).toBe(0);
  });

  it('says so when the data source fails, and drops an answer to an older configuration', async () => {
    let resolveFirst!: (v: never[]) => void;
    let calls = 0;
    host.source = {
      load: () => ({ rows: [], total: 0 }),
      groups: () => (++calls === 1 ? new Promise((resolve) => (resolveFirst = resolve as never)) : Promise.reject(new Error('offline')))
    };
    fixture.detectChanges();
    host.config = { ...host.config, values: [{ field: 'total', aggregate: 'max' }] };
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().querySelector('.we-pivot__note[role="alert"]')?.textContent).toContain('offline');
    resolveFirst([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().querySelector('.we-pivot__note[role="alert"]')?.textContent).toContain('offline');
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

  it('charts the pivot rows from its chart buttons, without the total column', () => {
    host.pivot.add('columns', 'year');
    fixture.detectChanges();
    const buttons = Array.from(el().querySelectorAll<HTMLButtonElement>('.we-pivot__chart-btn'));
    buttons.find((b) => b.textContent?.includes('Line'))!.click();
    fixture.detectChanges();
    expect(host.pivot.chart).toBe('line');
    expect(el().querySelector('we-chart')).toBeTruthy();
    expect(host.pivot.chartData.categories).toEqual(['Ankara', 'Izmir']);
    expect(host.pivot.chartData.series.map((s) => [s.name, s.values])).toEqual([
      ['2025', [null, 10]],
      ['2026', [7, 5]]
    ]);
    buttons[0].click();
    fixture.detectChanges();
    expect(el().querySelector('we-chart')).toBeNull();
  });

  it('groups by the outer row fields for subtotals and swaps rows and columns', () => {
    host.pivot.add('rows', 'year');
    fixture.detectChanges();
    expect(grid().groupFields).toEqual(['r:city']);
    host.pivot.swap();
    fixture.detectChanges();
    expect(host.changes.at(-1)).toEqual(jasmine.objectContaining({ rows: [], columns: ['city', 'year'] }));
  });

  it('reports value and row header clicks with the raw members behind them', () => {
    host.config = { rows: ['city'], columns: ['year'], values: [{ field: 'total', aggregate: 'sum' }] };
    fixture.detectChanges();
    const izmir = el().querySelectorAll('.we-grid__row')[1].querySelectorAll('td');
    (izmir[2] as HTMLElement).click();
    (izmir[0] as HTMLElement).click();
    expect(host.clicks).toEqual([
      { rowValues: { city: 'Izmir' }, columnValues: { year: 2026 }, valueField: 'total', value: 5 },
      { rowValues: { city: 'Izmir' }, columnValues: {}, valueField: '', value: 'Izmir' }
    ]);
  });
});

interface Reading {
  region: string;
  site: string;
  month: number;
  value: number;
}

@Component({
  standalone: true,
  imports: [WePivotComponent],
  template: `<div style="width: 700px"><we-pivot [data]="data" [fields]="fields" [config]="config" [maxHeight]="300" [virtualScroll]="true" [virtualColumns]="true" /></div>`
})
class WideHostComponent {
  fields: WeGridColumnDef<Reading>[] = [
    { field: 'region', header: 'Region' },
    { field: 'site', header: 'Site' },
    { field: 'month', header: 'Month', type: 'integer' },
    { field: 'value', header: 'Value', type: 'number' }
  ];
  // 400 sites in 4 regions × 60 months: 400 result rows under 4 group headers, 60 value columns
  data: Reading[] = Array.from({ length: 400 * 60 }, (_, i) => ({
    region: `R${Math.floor(i / 60) % 4}`,
    site: `S${String(Math.floor(i / 60)).padStart(3, '0')}`,
    month: i % 60,
    value: i % 97
  }));
  config: WePivotConfig = { rows: ['region', 'site'], columns: ['month'], values: [{ field: 'value', aggregate: 'sum' }] };
}

describe('WePivotComponent — virtualScroll and virtualColumns', () => {
  it('draws a bounded window of the grouped result rows and value columns', async () => {
    TestBed.configureTestingModule({ imports: [WideHostComponent], providers: [{ provide: WE_GRID_LAYOUT_STORE, useClass: NullStore }] });
    const fixture = TestBed.createComponent(WideHostComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const inner = fixture.debugElement.query((d) => d.componentInstance instanceof WeGridComponent).componentInstance as WeGridComponent<Record<string, unknown>>;
    expect(inner.virtualScroll).toBeTrue();
    expect(inner.virtualColumns).toBeTrue();
    expect(inner.renderColumns.length).toBeGreaterThan(60);
    expect(el.querySelectorAll('tr.we-grid__group-row').length).toBeGreaterThan(0);
    const rows = el.querySelectorAll('tbody > tr.we-grid__row, tbody > tr.we-grid__group-row');
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.length).toBeLessThan(60);
    const cells = el.querySelectorAll('tbody > tr.we-grid__row')[0].querySelectorAll(':scope > td:not(.we-grid__col-pad)').length;
    expect(cells).toBeLessThan(20);
    fixture.destroy();
    el.remove();
  });
});
