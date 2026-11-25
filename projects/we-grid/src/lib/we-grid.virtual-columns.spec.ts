import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { WeGridComponent } from './we-grid.component';
import { WeGridColumnDef } from './models/we-grid-column.model';

type Row = Record<string, number | string>;

const COLUMN_COUNT = 100;
const COLUMN_PX = 100;

const makeColumns = (): WeGridColumnDef<Row>[] =>
  Array.from({ length: COLUMN_COUNT }, (_, c) => ({ field: `c${c}`, header: `C${c}`, width: COLUMN_PX }));
const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, r) => {
    const row: Row = { id: r };
    for (let c = 0; c < COLUMN_COUNT; c++) row[`c${c}`] = `r${r}c${c}`;
    return row;
  });

@Component({
  standalone: true,
  imports: [WeGridComponent],
  template: `
    <div style="width: 600px">
      <we-grid
        gridKey="virtual-columns-spec"
        [columns]="columns"
        [data]="data"
        trackByField="id"
        [virtualColumns]="virtualColumns"
        [virtualScroll]="virtualScroll"
        [maxHeight]="maxHeight"
        [rowHeight]="30"
        [filterRow]="true"
        [cellSelection]="true"
        [autoFitColumns]="false"
        [editable]="editable"
        [grouping]="true"
        [groupBy]="groupBy"
        footer="none"
      />
    </div>
  `
})
class HostComponent {
  @ViewChild(WeGridComponent) grid!: WeGridComponent<Row>;
  columns = makeColumns();
  data = makeRows(200);
  virtualColumns = true;
  editable = false;
  maxHeight = 300;
  virtualScroll = true;
  groupBy: string[] | null = null;
}

describe('WeGridComponent virtualColumns', () => {
  let fixture: ComponentFixture<HostComponent> | null = null;
  let host: HostComponent;

  const el = (): HTMLElement => fixture!.nativeElement;
  const area = (): HTMLElement => el().querySelector('.we-grid__scroll')!;
  const firstRow = (): HTMLElement => el().querySelector('tbody > tr.we-grid__row')!;
  const dataFields = (row = firstRow()): string[] =>
    Array.from(row.querySelectorAll('td[data-we-grid-field]')).map((td) => td.getAttribute('data-we-grid-field')!);
  const headerFields = (): string[] =>
    Array.from(el().querySelectorAll('.we-grid__header-row th[role="columnheader"] .we-grid__th-label')).map((s) => 'c' + s.textContent!.trim().slice(1));
  const pads = (selector: string): HTMLElement[] => Array.from(el().querySelectorAll<HTMLElement>(`${selector} > .we-grid__col-pad`));
  const settle = async (): Promise<void> => {
    fixture!.detectChanges();
    await fixture!.whenStable();
    fixture!.detectChanges();
  };
  const scrollTo = async (left: number): Promise<void> => {
    area().scrollLeft = left;
    area().dispatchEvent(new Event('scroll'));
    await settle();
  };
  /** Every drawn header starts at the x it has with all columns drawn */
  const expectAligned = (): void => {
    const x = new Map<string, number>();
    let at = 0;
    for (const c of host.grid.renderColumns) {
      x.set(c.field, at);
      at += c.width;
    }
    const headers = Array.from(el().querySelectorAll<HTMLElement>('.we-grid__header-row th[role="columnheader"]'));
    const table = el().querySelector<HTMLElement>('.we-grid__table')!.getBoundingClientRect().left;
    const pinned = new Set(host.grid.renderColumns.filter((c) => c.pinned).map((c) => c.field));
    expect(headers.length).toBeGreaterThan(0);
    // Pinned headers sit where they stick, not where they would scroll to
    headerFields().forEach((field, i) => {
      if (!pinned.has(field)) expect(headers[i].getBoundingClientRect().left - table).withContext(field).toBe(x.get(field)!);
    });
  };
  const create = async (setup: (h: HostComponent) => void = () => undefined): Promise<void> => {
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    setup(host);
    document.body.appendChild(el());
    await settle();
  };

  beforeEach(async () => {
    localStorage.removeItem('we-grid-layout:virtual-columns-spec');
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
  });

  afterEach(() => {
    if (!fixture) return;
    fixture.destroy();
    el().remove();
    fixture = null;
  });

  it('renders only a window of the columns, with a spacer as wide as the columns left out', async () => {
    await create();
    const fields = dataFields();
    // 600px viewport + 300px overscan on the right, nothing scrolled on the left
    expect(fields.length).toBe(9);
    expect(fields[0]).toBe('c0');
    expect(firstRow().querySelectorAll(':scope > .we-grid__col-pad').length).toBe(1);
    expect(pads('.we-grid__header-row')[0].getBoundingClientRect().width).toBe((COLUMN_COUNT - 9) * COLUMN_PX);
    // The table is exactly as wide as with every column rendered
    const table = el().querySelector<HTMLElement>('.we-grid__table')!;
    expect(table.getBoundingClientRect().width).toBe(COLUMN_COUNT * COLUMN_PX);
    expect(area().scrollWidth).toBe(COLUMN_COUNT * COLUMN_PX);
  });

  it('moves the window with the horizontal scroll, keeping every column at its own x', async () => {
    await create();
    await scrollTo(3000);
    const fields = dataFields();
    expect(fields).toContain('c30');
    expect(fields).not.toContain('c0');
    expect(fields).not.toContain('c99');
    const start = pads('.we-grid__header-row')[0];
    expect(start.getBoundingClientRect().width).toBe(Number(fields[0].slice(1)) * COLUMN_PX);
    const c30 = firstRow().querySelector<HTMLElement>('td[data-we-grid-field="c30"]')!;
    expect(c30.offsetLeft).toBe(30 * COLUMN_PX);
    expect(area().scrollWidth).toBe(COLUMN_COUNT * COLUMN_PX);
  });

  it('header, filter and data rows draw the same columns and spacers', async () => {
    await create();
    host.grid.filterRowVisible = true;
    await scrollTo(4000);
    expect(headerFields()).toEqual(dataFields());
    const filterCells = el().querySelectorAll('.we-grid__filter-row > th.we-grid__filter-cell').length;
    expect(filterCells).toBe(dataFields().length);
    expect(pads('.we-grid__header-row').length).toBe(2);
    expect(pads('.we-grid__filter-row').length).toBe(2);
    expect(firstRow().querySelectorAll(':scope > .we-grid__col-pad').length).toBe(2);
  });

  it('always draws pinned columns, at their sticky offsets', async () => {
    await create((h) => {
      h.columns = makeColumns().map((c, i) => (i === 0 ? { ...c, pinned: 'left' } : i === COLUMN_COUNT - 1 ? { ...c, pinned: 'right' } : c));
    });
    await scrollTo(5000);
    const fields = dataFields();
    expect(fields[0]).toBe('c0');
    expect(fields.at(-1)).toBe('c99');
    expect(fields).toContain('c50');
    expect(fields.length).toBeLessThan(20);
    const pinned = firstRow().querySelector<HTMLElement>('td[data-we-grid-field="c99"]')!;
    expect(pinned.style.right).toBe('0px');
    expect(area().scrollWidth).toBe(COLUMN_COUNT * COLUMN_PX);
  });

  it('clips a header band over columns partly left out to the drawn ones', async () => {
    await create((h) => (h.columns = makeColumns().map((c) => ({ ...c, headerGroup: 'All' }))));
    await scrollTo(3000);
    const band = Array.from(el().querySelectorAll<HTMLElement>('.we-grid__band')).find((b) => b.textContent!.includes('All'))!;
    expect(Number(band.getAttribute('colspan'))).toBe(dataFields().length);
    expect(el().querySelectorAll('colgroup > col').length).toBe(dataFields().length + 2);
  });

  it('the arrow keys move the range onto a column out of the DOM, scrolling it into view', async () => {
    await create();
    const cell = firstRow().querySelector<HTMLElement>('td[data-we-grid-field="c0"]')!;
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    await settle();
    for (let i = 0; i < 20; i++) {
      firstRow().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      fixture!.detectChanges();
    }
    await settle();
    expect(host.grid.getCellRange()?.fields).toEqual(['c20']);
    const focus = firstRow().querySelector<HTMLElement>('td[data-we-grid-field="c20"]');
    expect(focus).not.toBeNull();
    expect(focus!.classList).toContain('we-grid__td--range-focus');
    const box = focus!.getBoundingClientRect();
    const view = area().getBoundingClientRect();
    expect(box.left).toBeGreaterThanOrEqual(view.left - 1);
    expect(box.right).toBeLessThanOrEqual(view.right + 1);
  });

  it('copies a block from the data, columns out of the DOM included', async () => {
    await create();
    const grid = host.grid;
    const first = firstRow().querySelector<HTMLElement>('td[data-we-grid-field="c0"]')!;
    first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    for (let i = 0; i < 30; i++) firstRow().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true, cancelable: true }));
    await settle();
    expect(grid.rangeText(false)!.split('\t').length).toBe(31);
  });

  it('turned off, draws every column and no spacer', async () => {
    await create((h) => (h.virtualColumns = false));
    expect(dataFields().length).toBe(COLUMN_COUNT);
    expect(el().querySelector('.we-grid__col-pad')).toBeNull();
    expect(el().querySelector('[aria-colindex]')).toBeNull();
    host.virtualColumns = true;
    await settle();
    expect(dataFields().length).toBeLessThan(20);
  });

  it('performance: a screen of rows × 100 columns draws a fraction of the cells with the columns windowed', async () => {
    const drawn = { on: { rows: 0, cells: 0 }, off: { rows: 0, cells: 0 } };
    const once = (virtualColumns: boolean): number => {
      const f = TestBed.createComponent(HostComponent);
      f.componentInstance.virtualColumns = virtualColumns;
      f.componentInstance.data = makeRows(30);
      // The 30 rows a tall screen shows: no row window, so the first render draws all of them
      f.componentInstance.virtualScroll = false;
      document.body.appendChild(f.nativeElement);
      const start = performance.now();
      f.detectChanges();
      // Layout included: that is where the customer's 0.8 s went too
      void (f.nativeElement as HTMLElement).querySelector<HTMLElement>('.we-grid__table')!.offsetHeight;
      const elapsed = performance.now() - start;
      const rows = (f.nativeElement as HTMLElement).querySelectorAll('tbody > tr.we-grid__row');
      drawn[virtualColumns ? 'on' : 'off'] = { rows: rows.length, cells: rows[0].children.length };
      f.destroy();
      (f.nativeElement as HTMLElement).remove();
      return elapsed;
    };
    const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    // A pause between renders: one long block of them starves Karma's socket and disconnects the run
    const pause = (): Promise<void> => new Promise((resolve) => setTimeout(resolve));
    const off: number[] = [];
    const on: number[] = [];
    for (let i = 0; i < 4; i++) {
      off.push(once(false));
      await pause();
      on.push(once(true));
      await pause();
    }
    // The first of each warmed the code up
    off.shift();
    on.shift();
    // eslint-disable-next-line no-console
    console.log(
      `[we-grid] ${drawn.off.rows} rows × 100 columns, first render: virtualColumns off ${median(off).toFixed(1)} ms (${drawn.off.cells} cells a row), ` +
        `on ${median(on).toFixed(1)} ms (${drawn.on.cells} cells a row)`
    );
    // Timings are only logged — a wall-clock comparison flakes on a busy machine; the cell count is what makes the difference
    expect(drawn.on.rows).toBe(30);
    expect(drawn.off.rows).toBe(30);
    expect(drawn.off.cells).toBe(COLUMN_COUNT);
    expect(drawn.on.cells).toBeLessThan(20);
    // Eight renders of 100 columns can take longer than Jasmine's default 5 s for an async spec on a slow runner
  }, 30_000);

  it('maps a drop to the headers rendered when the drag started, even after a scroll during the drag', async () => {
    await create();
    await scrollTo(3000);
    const grid = host.grid;
    const atStart = headerFields();
    const order = (): string[] => grid.renderColumns.map((c) => c.field);
    const target = order().indexOf(atStart[2]);
    grid.onColumnDragStarted();
    // Shift+wheel while dragging: the window waits for the drop
    await scrollTo(6000);
    expect(headerFields()).toEqual(atStart);
    // The CDK's order: `ended`, then `dropped` in the same tick
    grid.onColumnDragEnded();
    grid.onColumnDrop({ previousIndex: 0, currentIndex: 2 } as CdkDragDrop<typeof grid.renderColumns>);
    await settle();
    expect(order().indexOf(atStart[0])).toBe(target);
    await new Promise((resolve) => setTimeout(resolve));
    await settle();
    // Afterwards the window follows the scroll again
    expect(headerFields()).toContain('c60');
    expectAligned();
  });

  it('keeps the keyboard on a header moved out of the window', async () => {
    await create();
    const grid = host.grid;
    const th = Array.from(el().querySelectorAll<HTMLElement>('.we-grid__header-row th[role="columnheader"]'))[2];
    th.focus();
    th.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve));
    await settle();
    expect(grid.renderColumns.at(-1)!.field).toBe('c2');
    const focused = document.activeElement as HTMLElement;
    expect(focused.isConnected).toBeTrue();
    expect(focused.getAttribute('role')).toBe('columnheader');
    expect(focused.querySelector('.we-grid__th-label')!.textContent!.trim()).toBe('C2');
    expectAligned();
  });

  it('tells assistive technology each drawn column\'s position among all of them', async () => {
    await create();
    await scrollTo(3000);
    const th = Array.from(el().querySelectorAll<HTMLElement>('.we-grid__header-row th[role="columnheader"]'));
    expect(th[headerFields().indexOf('c30')].getAttribute('aria-colindex')).toBe('31');
    expect(firstRow().querySelector('td[data-we-grid-field="c30"]')!.getAttribute('aria-colindex')).toBe('31');
    expect(el().querySelector('.we-grid__col-pad')!.getAttribute('aria-hidden')).toBe('true');
    expect(el().querySelector('.we-grid__col-pad[aria-colindex]')).toBeNull();
  });

  it('draws a right-pinned column inside the action column, with the window', async () => {
    await create((h) => {
      h.editable = true;
      h.columns = makeColumns().map((c, i) => (i === COLUMN_COUNT - 1 ? { ...c, pinned: 'right' } : c));
    });
    await scrollTo(5000);
    const cells = Array.from(firstRow().children) as HTMLElement[];
    expect(cells.at(-1)!.classList).toContain('we-grid__action-col');
    expect(cells.at(-2)!.getAttribute('data-we-grid-field')).toBe('c99');
    expect(cells.at(-2)!.style.right).toBe('92px');
    expect(area().scrollWidth).toBe(COLUMN_COUNT * COLUMN_PX + 92);
    expectAligned();
  });

  it('keeps the spacers exact after a column is resized', async () => {
    await create();
    await scrollTo(3000);
    const headers = Array.from(el().querySelectorAll<HTMLElement>('.we-grid__header-row th[role="columnheader"]'));
    const handle = headers[headerFields().indexOf('c32')].querySelector<HTMLElement>('.we-grid__resize-handle')!;
    for (let i = 0; i < 5; i++) handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true, cancelable: true }));
    await settle();
    expect(host.grid.renderColumns.find((c) => c.field === 'c32')!.width).toBe(COLUMN_PX + 5 * 32);
    expectAligned();
    expect(area().scrollWidth).toBe(COLUMN_COUNT * COLUMN_PX + 5 * 32);
    await scrollTo(8000);
    expectAligned();
  });

  it('group rows and the summary row span the window and its spacers', async () => {
    await create((h) => {
      h.groupBy = ['c1'];
      h.columns = makeColumns().map((c) => ({ ...c, summary: 'count' as const }));
    });
    await scrollTo(3000);
    const headerCells = el().querySelector('.we-grid__header-row')!.children.length;
    const group = el().querySelector<HTMLElement>('tr.we-grid__group-row > td')!;
    expect(Number(group.getAttribute('colspan'))).toBe(headerCells);
    const summary = el().querySelector('tr.we-grid__summary-row')!;
    expect(summary.children.length).toBe(headerCells);
    expect(summary.querySelectorAll(':scope > .we-grid__col-pad').length).toBe(2);
    expectAligned();
  });
});
