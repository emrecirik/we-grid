import { ApplicationRef, Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WeGridComponent } from './we-grid.component';
import { WeGridColumnDef } from './models/we-grid-column.model';
import { WE_GRID_EXPORTER, WeGridExportTable } from './models/we-grid-export.model';
import { WeGridMenuItem } from './models/we-grid-row-menu.model';
import { WeGridCellRange } from './services/we-grid-cell-range.util';

interface Row {
  id: number;
  name: string;
  city: string;
  qty: number;
}

@Component({
  standalone: true,
  imports: [WeGridComponent],
  template: `<we-grid
    gridKey="cell-range-spec"
    [columns]="columns"
    [data]="data"
    trackByField="id"
    [cellSelection]="cellSelection"
    [grouping]="grouping"
    [groupBy]="groupBy"
    [rowContextMenu]="menu"
    (cellRangeChange)="ranges.push($event)"
  />`
})
class HostComponent {
  columns: WeGridColumnDef<Row>[] = [
    { field: 'name', header: 'Name' },
    { field: 'city', header: 'City' },
    { field: 'qty', header: 'Qty', type: 'integer' }
  ];
  data: Row[] = [
    { id: 1, name: 'Bolt', city: 'İzmir', qty: 10 },
    { id: 2, name: 'Nut', city: 'Ankara', qty: 4 },
    { id: 3, name: 'Gear', city: 'İzmir', qty: 1 }
  ];
  cellSelection = true;
  grouping = false;
  groupBy: string[] | null = null;
  menu?: (row: Row) => WeGridMenuItem[];
  ranges: (WeGridCellRange<Row> | null)[] = [];
  @ViewChild(WeGridComponent) grid!: WeGridComponent<Row>;
}

describe('WeGridComponent — cell range selection', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  const exported: WeGridExportTable[] = [];

  beforeEach(async () => {
    localStorage.removeItem('we-grid-layout:cell-range-spec');
    exported.length = 0;
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [{ provide: WE_GRID_EXPORTER, useValue: { export: (table: WeGridExportTable) => void exported.push(table) } }]
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    fixture.nativeElement.remove();
    document.querySelectorAll('.cdk-overlay-container').forEach((el) => (el.innerHTML = ''));
  });

  const rowEls = (): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll('tr[data-we-grid-item]'));
  const cell = (r: number, c: number): HTMLElement => rowEls()[r].querySelectorAll<HTMLElement>('td[data-we-grid-field]')[c];
  const press = (target: HTMLElement, init: MouseEventInit = {}): void => {
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, ...init }));
    fixture.detectChanges();
  };
  const dragTo = (target: HTMLElement): void => {
    target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    fixture.detectChanges();
  };
  const key = (target: HTMLElement, k: string, shiftKey = false): void => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };
  const rightClick = (target: HTMLElement): MouseEvent => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 });
    target.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  };
  const menuItem = (id: string): HTMLButtonElement | null => document.querySelector(`.we-grid-menu [data-item-id="${id}"]`);
  const copy = (): string => {
    const data = new DataTransfer();
    fixture.nativeElement.querySelector('.we-grid').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
    return data.getData('text/plain');
  };

  it('selects a block by dragging and reports it on release', () => {
    press(cell(0, 0));
    dragTo(cell(1, 1));
    expect(cell(0, 0).getAttribute('aria-selected')).toBe('true');
    expect(cell(1, 1).classList).toContain('we-grid__td--range');
    expect(cell(1, 1).classList).toContain('we-grid__td--range-focus');
    expect(cell(2, 0).getAttribute('aria-selected')).toBe('false');
    expect(host.ranges.at(-1)).toEqual({ rows: host.data.slice(0, 2), fields: ['name', 'city'] });
  });

  it('copies the block without headers on Ctrl+C', () => {
    press(cell(1, 2));
    press(cell(0, 1), { shiftKey: true });
    expect(copy()).toBe('İzmir\t10\nAnkara\t4');
  });

  it('grows the block with Shift+arrows and clears it with Escape', () => {
    press(cell(0, 0));
    key(rowEls()[0], 'ArrowDown', true);
    key(rowEls()[1], 'ArrowRight', true);
    expect(host.grid.getCellRange()).toEqual({ rows: host.data.slice(0, 2), fields: ['name', 'city'] });
    key(rowEls()[1], 'ArrowDown');
    expect(host.grid.getCellRange()).toEqual({ rows: [host.data[2]], fields: ['city'] });
    key(rowEls()[2], 'Escape');
    expect(host.grid.getCellRange()).toBeNull();
    expect(host.ranges.at(-1)).toBeNull();
  });

  it('shows count, sum, average, min and max of the block in the footer', () => {
    press(cell(0, 1));
    dragTo(cell(2, 2));
    const stats = fixture.nativeElement.querySelector('.we-grid__range-stats') as HTMLElement;
    expect(stats.textContent).toContain('Count: 6');
    expect(stats.textContent).toContain('Sum: 15');
    expect(stats.textContent).toContain('Average: 5');
    expect(stats.textContent).toContain('Min: 1');
    expect(stats.textContent).toContain('Max: 10');
  });

  it('writes the figures of a single currency column as money, as its cells read', () => {
    host.columns = [host.columns[0], host.columns[1], { field: 'qty', header: 'Qty', type: 'currency' }];
    fixture.detectChanges();
    press(cell(0, 2));
    dragTo(cell(1, 2));
    const cellText = cell(0, 2).textContent!.trim();
    const sum = fixture.nativeElement.querySelector('.we-grid__range-stats span:nth-child(2)').textContent as string;
    // The cell shows 10 the same way the sum shows 14: same symbol and decimals around the digits
    expect(sum).toBe('Sum: ' + cellText.replace('10', '14'));
  });

  it('offers copy, copy with headers and export on a right click, ahead of the consumer items', async () => {
    host.menu = () => [{ id: 'open', label: 'Open' }];
    fixture.detectChanges();
    press(cell(0, 0));
    dragTo(cell(1, 2));
    expect(rightClick(cell(1, 1)).defaultPrevented).toBeTrue();
    const ids = Array.from(document.querySelectorAll('.we-grid-menu > [data-item-id]')).map((el) => el.getAttribute('data-item-id'));
    expect(ids).toEqual(['we-range-copy', 'we-range-copy-headers', 'we-range-export', 'open']);

    const write = spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());
    menuItem('we-range-copy-headers')!.click();
    expect(write).toHaveBeenCalledWith('Name\tCity\tQty\nBolt\tİzmir\t10\nNut\tAnkara\t4');
  });

  it('exports only the block — its rows and its columns, without a summary', () => {
    press(cell(1, 1));
    dragTo(cell(2, 2));
    rightClick(cell(2, 2));
    menuItem('we-range-export')!.click();
    // The menu lives in an overlay outside the fixture's view tree
    TestBed.inject(ApplicationRef).tick();
    menuItem('we-range-export-csv')!.click();
    expect(exported.length).toBe(1);
    expect(exported[0].columns.map((c) => c.field)).toEqual(['city', 'qty']);
    expect(exported[0].rows.map((r) => r.text)).toEqual([['Ankara', '4'], ['İzmir', '1']]);
    expect(exported[0].summary).toBeNull();
  });

  it('starts a new one-cell block when the right click lands outside the block', () => {
    press(cell(0, 0));
    rightClick(cell(2, 2));
    expect(host.grid.getCellRange()).toEqual({ rows: [host.data[2]], fields: ['qty'] });
  });

  it('keeps the column menu reachable from the block menu under grouping', () => {
    host.grouping = true;
    host.groupBy = ['city'];
    fixture.detectChanges();
    rightClick(cell(0, 0));
    expect(menuItem('we-column-menu')).not.toBeNull();
  });

  it('changes nothing while off — no attributes, and the browser keeps its menu', () => {
    host.cellSelection = false;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-we-grid-field], [data-we-grid-item], [aria-selected]')).toBeNull();
    const td = fixture.nativeElement.querySelector('tr.we-grid__row td') as HTMLElement;
    td.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    expect(host.grid.getCellRange()).toBeNull();
    expect(rightClick(td).defaultPrevented).toBeFalse();
  });
});
