import { ApplicationRef, Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { WeGridComponent } from './we-grid.component';
import { WeGridColumnDef } from './models/we-grid-column.model';
import { WeGridChartDialogComponent } from './we-grid-chart-dialog/we-grid-chart-dialog.component';

interface Row {
  id: number;
  name: string;
  city: string;
  qty: number;
  amount: number;
}

@Component({
  standalone: true,
  imports: [WeGridComponent],
  template: `<we-grid gridKey="range-chart-spec" [columns]="columns" [data]="data" trackByField="id" [cellSelection]="true" [grouping]="true" [groupBy]="groupBy" />`
})
class HostComponent {
  columns: WeGridColumnDef<Row>[] = [
    { field: 'name', header: 'Name' },
    { field: 'city', header: 'City' },
    { field: 'qty', header: 'Qty', type: 'integer' },
    { field: 'amount', header: 'Amount', type: 'number' }
  ];
  data: Row[] = [
    { id: 1, name: 'Bolt', city: 'İzmir', qty: 2, amount: 10 },
    { id: 2, name: 'Nut', city: 'Ankara', qty: 4, amount: 4 },
    { id: 3, name: 'Gear', city: 'İzmir', qty: 5, amount: 1 }
  ];
  groupBy: string[] | null = null;
  @ViewChild(WeGridComponent) grid!: WeGridComponent<Row>;
}

describe('WeGridComponent — range charts', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(() => {
    localStorage.removeItem('we-grid-layout:range-chart-spec');
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    fixture.nativeElement.remove();
    document.querySelectorAll('.cdk-overlay-container').forEach((el) => el.replaceChildren());
  });

  const cell = (r: number, c: number): HTMLElement =>
    fixture.nativeElement.querySelectorAll('tr[data-we-grid-item]')[r].querySelectorAll('td[data-we-grid-field]')[c];
  const select = (from: HTMLElement, to: HTMLElement): void => {
    from.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    to.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    fixture.detectChanges();
  };
  const dialog = (): WeGridChartDialogComponent<Row> => fixture.debugElement.query(By.directive(WeGridChartDialogComponent))?.componentInstance;

  it('offers every chart type under Chart range and opens the dialog with the one picked', () => {
    select(cell(0, 0), cell(2, 3));
    cell(1, 1).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    fixture.detectChanges();
    (document.querySelector('[data-item-id="we-range-chart"]') as HTMLElement).click();
    TestBed.inject(ApplicationRef).tick();
    const ids = Array.from(document.querySelectorAll('[data-parent-id="we-range-chart"]')).map((el) => el.getAttribute('data-item-id'));
    expect(ids).toEqual(['column', 'bar', 'line', 'area', 'pie', 'donut', 'radialBar', 'funnel', 'waterfall'].map((t) => `we-range-chart-${t}`));
    (document.querySelector('[data-item-id="we-range-chart-bar"]') as HTMLElement).click();
    fixture.detectChanges();

    const d = dialog();
    expect(d.type).toBe('bar');
    // The first text column is the category; the number columns are the series; İzmir repeats, so rows combine
    expect(d.categoryField).toBe('name');
    expect([...d.seriesFields]).toEqual(['qty', 'amount']);
    expect(d.aggregate).toBe('none');
    expect(d.result.data.categories).toEqual(['Bolt', 'Nut', 'Gear']);
    expect(fixture.nativeElement.querySelector('we-grid-chart-dialog we-chart svg')).not.toBeNull();
  });

  it('combines repeated categories with a sum by default', () => {
    select(cell(0, 1), cell(2, 2));
    host.grid.openRangeChart();
    fixture.detectChanges();
    const d = dialog();
    expect(d.categoryField).toBe('city');
    expect(d.aggregate).toBe('sum');
    expect(d.result.data).toEqual({ categories: ['İzmir', 'Ankara'], series: [{ name: 'Qty', values: [7, 4] }] });
  });

  it('offers the group column as the category of a grouped grid, outside the block', () => {
    host.groupBy = ['city'];
    fixture.detectChanges();
    select(cell(0, 2), cell(2, 2));
    host.grid.openRangeChart('pie');
    fixture.detectChanges();
    const d = dialog();
    expect(d.categoryField).toBe('city');
    expect(d.result.data.categories).toEqual(['Ankara', 'İzmir']);
    expect(d.result.data.series[0].values).toEqual([4, 7]);
  });

  it('charts the filtered rows and visible columns when no block is selected', () => {
    host.grid.openRangeChart();
    fixture.detectChanges();
    expect(dialog().rows.length).toBe(3);
    expect(dialog().columns.map((c) => c.field)).toEqual(['name', 'city', 'qty', 'amount']);
  });

  it('filters the grid by a clicked category when asked to', () => {
    select(cell(0, 1), cell(2, 2));
    host.grid.openRangeChart();
    fixture.detectChanges();
    const d = dialog();
    expect(d.canFilter).toBeTrue();
    d.filterOnClick = true;
    d.onPointClick({ category: 'Ankara', series: null, value: 4, index: 1 });
    fixture.detectChanges();
    expect(host.grid.displayData.map((r) => r.city)).toEqual(['Ankara']);
    expect(fixture.nativeElement.querySelector('.we-grid-chd__status').textContent).toContain('City = Ankara');
  });

  it('writes values in the one charted column’s format — but a count, and an average of whole numbers, plainly', () => {
    host.columns = [host.columns[0], host.columns[1], host.columns[2], { field: 'amount', header: 'Amount', type: 'currency' }];
    fixture.detectChanges();
    select(cell(0, 1), cell(2, 3));
    host.grid.openRangeChart();
    fixture.detectChanges();
    const d = dialog();
    const amountCell = cell(0, 3).textContent!.trim();
    d.toggleSeries('qty', false);
    expect(d.valueFormatter!(10)).toBe(amountCell);
    d.aggregate = 'count';
    d.rebuild();
    expect(d.valueFormatter).toBeUndefined();
    d.aggregate = 'avg';
    d.toggleSeries('amount', false);
    d.toggleSeries('qty', true);
    expect(d.valueFormatter!(3.5)).toBe('3.5');
    d.toggleSeries('amount', true);
    expect(d.valueFormatter).toBeUndefined();
  });

  it('closes on Escape', () => {
    host.grid.openRangeChart();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.we-grid-chd') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(dialog()).toBeUndefined();
    expect(host.grid.chartDialog).toBeNull();
  });
});
