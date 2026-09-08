import { ChangeDetectorRef, Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { WeGridComponent } from './we-grid.component';
import { WeGridRowDetailDirective } from './directives/we-grid-row-detail.directive';
import { WeGridColumnDef } from './models/we-grid-column.model';
import { WeGridInternalColumn } from './models/we-grid-internal.model';
import { WeGridSortChange } from './models/we-grid-events.model';
import { WeGridRowDeleteEvent, WeGridRowEditEvent } from './models/we-grid-edit.model';
import { WeGridImportResult } from './models/we-grid-export.model';

interface Row {
  code: string;
  name: string;
}

describe('WeGridComponent', () => {
  let component: WeGridComponent<Row>;
  let fixture: ComponentFixture<WeGridComponent<Row>>;

  const columns: WeGridColumnDef<Row>[] = [
    { field: 'code', header: 'Code' },
    { field: 'name', header: 'Name' }
  ];

  const unsortedRows: Row[] = [
    { code: 'C3', name: 'Product C' },
    { code: 'A1', name: 'Product A' },
    { code: 'B2', name: 'Product B' }
  ];

  beforeEach(async () => {
    // Test isolation: clean localStorage for every test
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [WeGridComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(WeGridComponent<Row>);
    // CDK Overlay positioning needs real layout measurements (getBoundingClientRect) — if the
    // fixture isn't attached to document.body, context-menu tests find a null/zero origin rect.
    document.body.appendChild(fixture.nativeElement);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('gridKey', 'spec-test-grid');
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('data', [
      { code: 'A1', name: 'Product A' },
      { code: 'B1', name: 'Product B' }
    ]);
  });

  afterEach(() => {
    fixture.nativeElement.remove();
  });

  it('should be created', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should build the internal column list from the columns definition', () => {
    fixture.detectChanges();
    expect(component.internalColumns.map((c) => c.field)).toEqual(['code', 'name']);
    expect(component.renderColumns.length).toBe(2);
  });

  it('should show the empty row with emptyMessage when there is no data', () => {
    fixture.componentRef.setInput('data', []);
    fixture.detectChanges();
    const emptyCell = fixture.nativeElement.querySelector('.we-grid__empty');
    expect(emptyCell).toBeTruthy();
  });

  it('should show skeleton rows while loading with no data yet', () => {
    fixture.componentRef.setInput('data', []);
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    const skeletonRows = fixture.nativeElement.querySelectorAll('.we-grid__skeleton-row');
    expect(skeletonRows.length).toBeGreaterThan(0);
  });

  it('should not show skeletons while reloading with existing rows — existing rows should remain', () => {
    fixture.detectChanges();
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    const skeletonRows = fixture.nativeElement.querySelectorAll('.we-grid__skeleton-row');
    const dataRows = fixture.nativeElement.querySelectorAll('.we-grid__row');
    expect(skeletonRows.length).toBe(0);
    expect(dataRows.length).toBe(2);
  });

  it('should emit rowClick when a row is clicked', () => {
    fixture.detectChanges();
    const emitted: Row[] = [];
    component.rowClick.subscribe((e) => emitted.push(e.row));

    const firstRow = fixture.nativeElement.querySelector('.we-grid__row') as HTMLElement;
    firstRow.click();

    expect(emitted.length).toBe(1);
    expect(emitted[0].code).toBe('A1');
  });

  it('the cursor should not be a pointer without a rowClick listener, and should become one once a listener is added', () => {
    // NOTE: on a standalone OnPush root component, fixture.detectChanges() doesn't force
    // non-@Input mutations in some Angular/TestBed versions — calling through the component's
    // own injected ChangeDetectorRef is reliable, same fix used in the "density" test below.
    const cdr = fixture.debugElement.injector.get(ChangeDetectorRef);
    cdr.detectChanges();
    const hostEl = fixture.nativeElement.querySelector('.we-grid') as HTMLElement;
    expect(hostEl.classList.contains('we-grid--clickable')).toBeFalse();

    component.rowClick.subscribe(() => {});
    cdr.detectChanges();
    expect(hostEl.classList.contains('we-grid--clickable')).toBeTrue();
  });

  it('a click on a column with stopRowClick=true should not bubble into rowClick', () => {
    fixture.componentRef.setInput('columns', [
      { field: 'code', header: 'Code' },
      { field: 'name', header: 'Name', stopRowClick: true }
    ]);
    fixture.detectChanges();

    const emitted: Row[] = [];
    component.rowClick.subscribe((e) => emitted.push(e.row));

    const cells = fixture.nativeElement.querySelectorAll('.we-grid__row td');
    // 2nd cell: the 'name' column with stopRowClick=true
    (cells[1] as HTMLElement).click();

    expect(emitted.length).toBe(0);
  });

  it('should emit selectionChange when a row is selected with selectable=multi', () => {
    fixture.componentRef.setInput('selectable', 'multi');
    fixture.componentRef.setInput('trackByField', 'code');
    fixture.detectChanges();

    let lastSelection: Row[] = [];
    component.selectionChange.subscribe((rows) => (lastSelection = rows));

    component.toggleRowSelection({ code: 'A1', name: 'Product A' });

    expect(lastSelection.length).toBe(1);
    expect(lastSelection[0].code).toBe('A1');
  });

  it('should emit pageChange clamped within page bounds', () => {
    fixture.componentRef.setInput('totalCount', 45);
    fixture.componentRef.setInput('pageSize', 20);
    fixture.componentRef.setInput('page', 1);
    fixture.detectChanges();

    const changes: { page: number; pageSize: number }[] = [];
    component.pageChange.subscribe((e) => changes.push(e));

    component.goToPage(2);
    expect(changes[0]).toEqual({ page: 2, pageSize: 20 });

    component.goToPage(99); // should be clamped to totalPages = 3
    expect(changes[1]).toEqual({ page: 3, pageSize: 20 });
  });

  // ─── Sorting ───────────────────────────────────────────────────────
  it('in client-side mode (serverSide=false), clicking the header should actually sort the data ascending/descending', () => {
    fixture.componentRef.setInput('serverSide', false);
    fixture.componentRef.setInput('data', unsortedRows);
    fixture.detectChanges();

    const codeCol = component.internalColumns.find((c) => c.field === 'code')!;

    // 1st click: ascending
    component.onHeaderLabelClick(codeCol);
    expect(component.displayData.map((r) => r.code)).toEqual(['A1', 'B2', 'C3']);

    // 2nd click: descending
    component.onHeaderLabelClick(codeCol);
    expect(component.displayData.map((r) => r.code)).toEqual(['C3', 'B2', 'A1']);

    // 3rd click: sort cleared, back to the original (data) order
    component.onHeaderLabelClick(codeCol);
    expect(component.displayData).toBe(component.data);
    expect(component.displayData.map((r) => r.code)).toEqual(['C3', 'A1', 'B2']);
  });

  it('in client-side mode, sortChange should also emit the correct payload', () => {
    fixture.componentRef.setInput('serverSide', false);
    fixture.componentRef.setInput('data', unsortedRows);
    fixture.detectChanges();

    const emitted: WeGridSortChange[] = [];
    component.sortChange.subscribe((e) => emitted.push(e));

    const codeCol = component.internalColumns.find((c) => c.field === 'code')!;
    component.onHeaderLabelClick(codeCol);
    component.onHeaderLabelClick(codeCol);

    expect(emitted).toEqual([
      { field: 'code', direction: 'asc' },
      { field: 'code', direction: 'desc' }
    ]);
  });

  it('in serverSide=true mode, clicking the header should NOT sort the data itself, only emit the sortChange payload', () => {
    fixture.componentRef.setInput('serverSide', true);
    fixture.componentRef.setInput('data', unsortedRows);
    fixture.componentRef.setInput('sortField', null);
    fixture.componentRef.setInput('sortDirection', null);
    fixture.detectChanges();

    const emitted: WeGridSortChange[] = [];
    component.sortChange.subscribe((e) => emitted.push(e));

    const codeCol = component.internalColumns.find((c) => c.field === 'code')!;
    component.onHeaderLabelClick(codeCol);

    // In server mode the grid never sorts data itself — the parent must listen to sortChange and refetch
    expect(component.displayData).toBe(component.data);
    expect(component.displayData.map((r) => r.code)).toEqual(['C3', 'A1', 'B2']);
    expect(emitted).toEqual([{ field: 'code', direction: 'asc' }]);
  });

  // ─── Density ───────────────────────────────────────────────────────
  // NOTE: the real user flow (toolbar > Columns > Density > Compact) was verified end-to-end in a
  // browser with Playwright (row height: normal 44px, compact 33.6px, comfortable 52px — see the
  // report). Here we only check at the unit level that the CSS class reacts correctly to `density`.
  it('should apply the matching CSS class to the host element when density changes', () => {
    // NOTE: fixture.detectChanges() doesn't force non-@Input field mutations on standalone OnPush
    // root components in some Angular/TestBed versions — calling through the component's own
    // injected ChangeDetectorRef gives a reliable result.
    const cdr = fixture.debugElement.injector.get(ChangeDetectorRef);
    cdr.detectChanges();
    const hostEl = fixture.nativeElement.querySelector('.we-grid') as HTMLElement;
    expect(hostEl.classList.contains('we-grid--compact')).toBeFalse();
    expect(hostEl.classList.contains('we-grid--comfortable')).toBeFalse();

    component.density = 'compact';
    cdr.detectChanges();
    expect(hostEl.classList.contains('we-grid--compact')).toBeTrue();

    component.density = 'comfortable';
    cdr.detectChanges();
    expect(hostEl.classList.contains('we-grid--compact')).toBeFalse();
    expect(hostEl.classList.contains('we-grid--comfortable')).toBeTrue();
  });

  // ─── Selection ───────────────────────────────────────────────────────
  it("with selectable='single', selecting a new row should clear the previous selection", () => {
    fixture.componentRef.setInput('selectable', 'single');
    fixture.componentRef.setInput('trackByField', 'code');
    fixture.detectChanges();

    const selections: Row[][] = [];
    component.selectionChange.subscribe((rows) => selections.push(rows));

    component.toggleRowSelection({ code: 'A1', name: 'Product A' });
    component.toggleRowSelection({ code: 'B1', name: 'Product B' });

    expect(selections.length).toBe(2);
    expect(selections[0].map((r) => r.code)).toEqual(['A1']);
    expect(selections[1].map((r) => r.code)).toEqual(['B1']); // A1 was auto-deselected
    expect(component.isSelected({ code: 'A1', name: 'Product A' })).toBeFalse();
    expect(component.isSelected({ code: 'B1', name: 'Product B' })).toBeTrue();
  });

  it("with selectable='multi', toggleSelectAll should select and deselect all visible rows", () => {
    fixture.componentRef.setInput('selectable', 'multi');
    fixture.componentRef.setInput('trackByField', 'code');
    fixture.detectChanges();

    component.toggleSelectAll();
    expect(component.allSelected).toBeTrue();

    component.toggleSelectAll();
    expect(component.allSelected).toBeFalse();
  });

  // ─── Pinned column offset ────────────────────────────────────────────
  it('multiple pinned-left columns should get a cumulative offset — the selection column (42px) is factored in too', () => {
    fixture.componentRef.setInput('selectable', 'multi');
    fixture.componentRef.setInput('columns', [
      { field: 'code', header: 'Code', pinned: 'left', width: 100 },
      { field: 'name', header: 'Name', pinned: 'left', width: 150 }
    ]);
    fixture.detectChanges();

    const codeCol = component.renderColumns.find((c) => c.field === 'code')!;
    const nameCol = component.renderColumns.find((c) => c.field === 'name')!;

    expect(codeCol.pinnedOffset).toBe(42);
    expect(nameCol.pinnedOffset).toBe(142); // 42 (selection) + 100 (code's width)
  });

  it('pinned-left offset starts at 0 when there is no selection column', () => {
    fixture.componentRef.setInput('columns', [
      { field: 'code', header: 'Code', pinned: 'left', width: 100 },
      { field: 'name', header: 'Name', pinned: 'left', width: 150 }
    ]);
    fixture.detectChanges();

    const codeCol = component.renderColumns.find((c) => c.field === 'code')!;
    const nameCol = component.renderColumns.find((c) => c.field === 'name')!;

    expect(codeCol.pinnedOffset).toBe(0);
    expect(nameCol.pinnedOffset).toBe(100);
  });

  it('pinned-right columns should get a cumulative offset starting from the rightmost one (right:0) going backwards', () => {
    fixture.componentRef.setInput('columns', [
      { field: 'code', header: 'Code', pinned: 'right', width: 100 },
      { field: 'name', header: 'Name', pinned: 'right', width: 150 }
    ]);
    fixture.detectChanges();

    const codeCol = component.renderColumns.find((c) => c.field === 'code')!;
    const nameCol = component.renderColumns.find((c) => c.field === 'name')!;

    // renderColumns order: [...middle, code, name] -> in the DOM the rightmost 'name' gets right:0
    expect(nameCol.pinnedOffset).toBe(0);
    expect(codeCol.pinnedOffset).toBe(150);
  });

  it('the next pinned-left column offset should update when a column width changes (autofit)', () => {
    fixture.componentRef.setInput('columns', [
      { field: 'code', header: 'Code', pinned: 'left', width: 100, minWidth: 60 },
      { field: 'name', header: 'Name', pinned: 'left', width: 150 }
    ]);
    fixture.detectChanges();

    const codeCol = component.internalColumns.find((c) => c.field === 'code')!;
    const nameColBefore = component.renderColumns.find((c) => c.field === 'name')!;
    expect(nameColBefore.pinnedOffset).toBe(100);

    codeCol.width = 60; // simulates the shrink-after-autofit scenario
    // recomputeRenderColumns is private — accessed here to confirm the offset is really
    // recomputed after a width mutation (that the component's own autofit/resize flows call the
    // same method can be verified in we-grid.component.ts).
    type WithRecompute = { recomputeRenderColumns: () => void };
    (component as unknown as WithRecompute).recomputeRenderColumns();
    fixture.detectChanges();

    const nameColAfter = component.renderColumns.find((c) => c.field === 'name')!;
    expect(nameColAfter.pinnedOffset).toBe(60);
  });

  it('reordering via drag-and-drop should recompute pinned-left offsets (prevents overlap)', () => {
    fixture.componentRef.setInput('columns', [
      { field: 'code', header: 'Code', pinned: 'left', width: 100 },
      { field: 'name', header: 'Name', pinned: 'left', width: 150 },
      { field: 'extra', header: 'Extra' }
    ]);
    fixture.detectChanges();

    // Start: code is first (offset 0), name is second (offset 100 — code's width)
    expect(component.renderColumns.find((c) => c.field === 'code')!.pinnedOffset).toBe(0);
    expect(component.renderColumns.find((c) => c.field === 'name')!.pinnedOffset).toBe(100);

    // code and name swap places via drag-and-drop (index 0 -> index 1)
    const dropEvent = { previousIndex: 0, currentIndex: 1 } as CdkDragDrop<WeGridInternalColumn<Row>[]>;
    component.onColumnDrop(dropEvent);
    fixture.detectChanges();

    // If recomputeRenderColumns() weren't called, these offsets would stay stale and the two
    // columns would overlap — now name is first (offset 0), code is second (offset 150 — name's width)
    expect(component.renderColumns.find((c) => c.field === 'name')!.pinnedOffset).toBe(0);
    expect(component.renderColumns.find((c) => c.field === 'code')!.pinnedOffset).toBe(150);
  });

  // ─── Numbered pagination ─────────────────────────────────────────────
  it('should return every page number when the total is below maxSize (5)', () => {
    fixture.componentRef.setInput('totalCount', 30);
    fixture.componentRef.setInput('pageSize', 10);
    fixture.componentRef.setInput('page', 1);
    fixture.detectChanges();

    expect(component.pageNumbersComputed).toEqual([1, 2, 3]);
  });

  it('should keep the active page centered in the window (rotate behavior)', () => {
    fixture.componentRef.setInput('totalCount', 200);
    fixture.componentRef.setInput('pageSize', 10); // 20 pages
    fixture.componentRef.setInput('page', 10);
    fixture.detectChanges();

    expect(component.pageNumbersComputed).toEqual([8, 9, 10, 11, 12]);
  });

  it('the window should not overflow left on early pages, nor right on late pages', () => {
    fixture.componentRef.setInput('totalCount', 200);
    fixture.componentRef.setInput('pageSize', 10); // 20 pages
    fixture.componentRef.setInput('page', 1);
    fixture.detectChanges();
    expect(component.pageNumbersComputed).toEqual([1, 2, 3, 4, 5]);

    fixture.componentRef.setInput('page', 20);
    fixture.detectChanges();
    expect(component.pageNumbersComputed).toEqual([16, 17, 18, 19, 20]);
  });

  it('clicking a page number should trigger goToPage (numbered pagination works through the DOM)', () => {
    fixture.componentRef.setInput('totalCount', 45);
    fixture.componentRef.setInput('pageSize', 20);
    fixture.componentRef.setInput('page', 1);
    fixture.detectChanges();

    const changes: { page: number; pageSize: number }[] = [];
    component.pageChange.subscribe((e) => changes.push(e));

    const pagerButtons = fixture.nativeElement.querySelectorAll('.we-grid__pager-btn') as NodeListOf<HTMLButtonElement>;
    const pageThreeBtn = Array.from(pagerButtons).find((b) => b.textContent?.trim() === '3');
    expect(pageThreeBtn).toBeTruthy();
    pageThreeBtn!.click();

    expect(changes).toEqual([{ page: 3, pageSize: 20 }]);
  });

  // ─── Row-level style (rowClass) ──────────────────────────────────────
  it('rowClass should be called with (row, index) for every row and the returned string applied as a <tr> class', () => {
    const calls: Array<{ row: Row; index: number }> = [];
    fixture.componentRef.setInput('rowClass', (row: Row, index: number) => {
      calls.push({ row, index });
      return row.code === 'A1' ? 'table-light' : '';
    });
    fixture.detectChanges();

    expect(calls).toEqual([
      { row: { code: 'A1', name: 'Product A' }, index: 0 },
      { row: { code: 'B1', name: 'Product B' }, index: 1 }
    ]);

    const rows = fixture.nativeElement.querySelectorAll('.we-grid__row') as NodeListOf<HTMLElement>;
    expect(rows[0].classList.contains('table-light')).toBeTrue();
    expect(rows[1].classList.contains('table-light')).toBeFalse();
  });

  it('rowClass may return a string[] — all classes are applied to the <tr>', () => {
    fixture.componentRef.setInput('rowClass', () => ['table-light', 'fw-bold']);
    fixture.detectChanges();

    const firstRow = fixture.nativeElement.querySelector('.we-grid__row') as HTMLElement;
    expect(firstRow.classList.contains('table-light')).toBeTrue();
    expect(firstRow.classList.contains('fw-bold')).toBeTrue();
  });

  it('rowClass may return Record<string, boolean> — only keys with a true value are applied as classes', () => {
    fixture.componentRef.setInput('rowClass', (row: Row) => ({
      'table-light': row.code === 'A1',
      'fw-bold': row.code === 'A1'
    }));
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('.we-grid__row') as NodeListOf<HTMLElement>;
    expect(rows[0].classList.contains('table-light')).toBeTrue();
    expect(rows[1].classList.contains('table-light')).toBeFalse();
  });

  it('the existing we-grid__row / we-grid__row--selected classes should be unaffected when rowClass is not given', () => {
    fixture.componentRef.setInput('selectable', 'multi');
    fixture.componentRef.setInput('trackByField', 'code');
    fixture.detectChanges();

    component.toggleRowSelection({ code: 'A1', name: 'Product A' });
    fixture.detectChanges();

    const firstRow = fixture.nativeElement.querySelector('.we-grid__row') as HTMLElement;
    expect(firstRow.classList.contains('we-grid__row--selected')).toBeTrue();
  });

  // ─── Autofit maxWidth bound ──────────────────────────────────────────
  it('autofit should not exceed maxWidth on a column that has it set', () => {
    const longText = 'x'.repeat(2000); // simulates the unbounded length a STRING_AGG-style value could accumulate
    fixture.componentRef.setInput('columns', [
      { field: 'code', header: 'Code' },
      { field: 'name', header: 'Name', maxWidth: 300 }
    ]);
    fixture.componentRef.setInput('data', [{ code: 'A1', name: longText }]);
    fixture.detectChanges();

    const nameCol = component.internalColumns.find((c) => c.field === 'name')!;
    type WithAutofit = { autofitColumn: (col: WeGridInternalColumn<Row>) => void };
    (component as unknown as WithAutofit).autofitColumn(nameCol);

    expect(nameCol.width).toBe(300);
  });

  it('without maxWidth, autofit should apply the unbounded measured width as-is (old behavior)', () => {
    const longText = 'x'.repeat(2000);
    fixture.componentRef.setInput('columns', [
      { field: 'code', header: 'Code' },
      { field: 'name', header: 'Name' } // no maxWidth
    ]);
    fixture.componentRef.setInput('data', [{ code: 'A1', name: longText }]);
    fixture.detectChanges();

    const nameCol = component.internalColumns.find((c) => c.field === 'name')!;
    type WithAutofit = { autofitColumn: (col: WeGridInternalColumn<Row>) => void };
    (component as unknown as WithAutofit).autofitColumn(nameCol);

    // The equivalent test above with maxWidth=300 for the same content clamps at 300 — here,
    // without clamping, the measured width should be well above that.
    expect(nameCol.width).toBeGreaterThan(300);
  });

  // ─── Keyboard accessibility ────────────────────────────────────────────
  it('Shift+F10 on a header should open the context menu from the keyboard', () => {
    fixture.detectChanges();
    const codeCol = component.internalColumns.find((c) => c.field === 'code')!;
    const thEl = fixture.nativeElement.querySelector('we-grid th[role="columnheader"]') as HTMLElement;

    expect(document.querySelector('we-grid-header-menu')).toBeNull();

    const event = new KeyboardEvent('keydown', { key: 'F10', shiftKey: true });
    component.onHeaderKeydown(event, codeCol, thEl);
    fixture.detectChanges();

    expect(document.querySelector('we-grid-header-menu')).not.toBeNull();
  });
});

// ─── Subtotal (summary row) ──────────────────────────────────────────
describe('WeGridComponent — summary row', () => {
  interface QtyRow {
    code: string;
    qty: number | null;
  }

  let fixture: ComponentFixture<WeGridComponent<QtyRow>>;
  let component: WeGridComponent<QtyRow>;

  const qtyColumns: WeGridColumnDef<QtyRow>[] = [
    { field: 'code', header: 'Code' },
    { field: 'qty', header: 'Quantity', type: 'number' }
  ];
  const qtyData: QtyRow[] = [
    { code: 'A', qty: 10 },
    { code: 'B', qty: 20 },
    { code: 'C', qty: null }
  ];

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [WeGridComponent] }).compileComponents();
    fixture = TestBed.createComponent(WeGridComponent<QtyRow>);
    document.body.appendChild(fixture.nativeElement);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('gridKey', 'spec-summary-grid');
    fixture.componentRef.setInput('columns', qtyColumns);
    fixture.componentRef.setInput('data', qtyData);
  });

  afterEach(() => fixture.nativeElement.remove());

  function setSummary(field: string, fn: 'sum' | 'count' | 'avg' | 'min' | 'max' | 'none'): void {
    component.internalColumns.find((c) => c.field === field)!.summary = fn;
    fixture.debugElement.injector.get(ChangeDetectorRef).detectChanges();
  }

  it('the tfoot row is never rendered when no column has a summary function selected', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.we-grid__summary-row')).toBeNull();
  });

  it('the summary row appears once a column has sum selected, and uses the scope-free "Sum:" label in client mode', () => {
    fixture.detectChanges();
    setSummary('qty', 'sum');

    const row = fixture.nativeElement.querySelector('.we-grid__summary-row');
    expect(row).toBeTruthy();
    expect(row.textContent).toContain('Sum: 30');
  });

  it('says "Page sum:" when serverSide=true and there is no override — should not be mistaken for the grand total', () => {
    fixture.componentRef.setInput('serverSide', true);
    fixture.componentRef.setInput('totalCount', 500);
    fixture.detectChanges();
    setSummary('qty', 'sum');

    const row = fixture.nativeElement.querySelector('.we-grid__summary-row');
    expect(row.textContent).toContain('Page sum: 30');
    expect(row.textContent).not.toContain('Grand');
  });

  it('ignores the loaded page and shows "Grand sum:" with the server value when a summaryValues override is given', () => {
    fixture.componentRef.setInput('serverSide', true);
    fixture.componentRef.setInput('summaryValues', { qty: 999 });
    fixture.detectChanges();
    setSummary('qty', 'sum');

    const row = fixture.nativeElement.querySelector('.we-grid__summary-row');
    expect(row.textContent).toContain('Grand sum: 999');
    expect(row.textContent).not.toContain('30'); // the page total must not leak through
  });

  it('count produces a meaningful result on a non-numeric column (no NaN leaks through)', () => {
    fixture.detectChanges();
    setSummary('code', 'count');

    const row = fixture.nativeElement.querySelector('.we-grid__summary-row');
    expect(row.textContent).toContain('Count: 3');
    expect(row.textContent).not.toContain('NaN');
  });

  it('also shows the total record count once the summary row is visible (even if count isn\'t selected)', () => {
    fixture.detectChanges();
    setSummary('qty', 'sum'); // count isn't selected on the code column, but the record count should still show

    expect(component.totalRecordCountForSummary).toBe(3);
    const row = fixture.nativeElement.querySelector('.we-grid__summary-row');
    expect(row.textContent).toContain('3 records');
  });

  it('while serverSide=true, the total record count is computed from totalCount (not the loaded page)', () => {
    fixture.componentRef.setInput('serverSide', true);
    fixture.componentRef.setInput('totalCount', 250);
    fixture.detectChanges();

    expect(component.totalRecordCountForSummary).toBe(250);
  });

  it('reloading the page (reloading the layout) preserves the chosen summary function via localStorage', () => {
    fixture.detectChanges();
    setSummary('qty', 'avg');
    // saved after debounce — we trigger the component's own persistLayout() directly
    type WithPersist = { persistLayout: () => void };
    (component as unknown as WithPersist).persistLayout();

    // A new grid instance with the same gridKey should restore the saved summary function
    const fixture2 = TestBed.createComponent(WeGridComponent<QtyRow>);
    document.body.appendChild(fixture2.nativeElement);
    fixture2.componentRef.setInput('gridKey', 'spec-summary-grid');
    fixture2.componentRef.setInput('columns', qtyColumns);
    fixture2.componentRef.setInput('data', qtyData);
    fixture2.detectChanges();

    expect(fixture2.componentInstance.internalColumns.find((c) => c.field === 'qty')?.summary).toBe('avg');
    fixture2.nativeElement.remove();
  });
});

// ─── Row expansion (master-detail) ───────────────────────────────────
@Component({
  standalone: true,
  imports: [WeGridComponent, WeGridRowDetailDirective],
  template: `
    <we-grid gridKey="spec-detail-grid" [columns]="columns" [data]="data" [expandable]="true" [trackByField]="'code'">
      <ng-template weGridRowDetail [weGridRowDetailRowsOf]="data" let-row let-i="rowIndex">
        <div class="detail-content">{{ row.code }}-{{ i }}</div>
      </ng-template>
    </we-grid>
  `
})
class RowDetailHostComponent {
  columns: WeGridColumnDef<Row>[] = [
    { field: 'code', header: 'Code' },
    { field: 'name', header: 'Name' }
  ];
  data: Row[] = [
    { code: 'A1', name: 'Product A' },
    { code: 'B1', name: 'Product B' }
  ];

  @ViewChild(WeGridComponent) gridRef!: WeGridComponent<Row>;
}

describe('WeGridComponent — row expansion (master-detail)', () => {
  let hostFixture: ComponentFixture<RowDetailHostComponent>;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [RowDetailHostComponent] }).compileComponents();
    hostFixture = TestBed.createComponent(RowDetailHostComponent);
    document.body.appendChild(hostFixture.nativeElement);
    hostFixture.detectChanges();
  });

  afterEach(() => hostFixture.nativeElement.remove());

  it('projecting a weGridRowDetail template should make canExpandRows true and render expand arrows', () => {
    const grid = hostFixture.componentInstance.gridRef;
    expect(grid.canExpandRows).toBeTrue();
    const btns = hostFixture.nativeElement.querySelectorAll('.we-grid__expand-btn');
    expect(btns.length).toBe(2);
  });

  it('clicking the expand arrow should open (show) the detail row, and close (hide) it on a second click', () => {
    // NOTE: the detail row is never removed from the DOM, it's toggled with [hidden] (see the note
    // in we-grid.component.ts near mountedDetailKeys) — so we check the .hidden property here
    // instead of querySelector(...).toBeNull().
    expect(hostFixture.nativeElement.querySelector('.we-grid__detail-row')).toBeNull(); // not even mounted if never opened

    // NOTE: we re-query the button reference before every click — a safe habit.
    (hostFixture.nativeElement.querySelector('.we-grid__expand-btn') as HTMLButtonElement).click();
    hostFixture.detectChanges();
    const detailRow = hostFixture.nativeElement.querySelector('.we-grid__detail-row') as HTMLElement;
    expect(detailRow).toBeTruthy();
    expect(detailRow.hidden).toBeFalse();
    expect(detailRow.textContent).toContain('A1-0');
    expect(hostFixture.nativeElement.querySelector('.we-grid__expand-btn').getAttribute('aria-expanded')).toBe('true');

    (hostFixture.nativeElement.querySelector('.we-grid__expand-btn') as HTMLButtonElement).click();
    hostFixture.detectChanges();
    expect((hostFixture.nativeElement.querySelector('.we-grid__detail-row') as HTMLElement).hidden).toBeTrue();
    expect(hostFixture.nativeElement.querySelector('.we-grid__expand-btn').getAttribute('aria-expanded')).toBe('false');

    // reopening should also work correctly (after mount-once, only [hidden] changes)
    (hostFixture.nativeElement.querySelector('.we-grid__expand-btn') as HTMLButtonElement).click();
    hostFixture.detectChanges();
    expect((hostFixture.nativeElement.querySelector('.we-grid__detail-row') as HTMLElement).hidden).toBeFalse();
  });

  it('grid.isRowExpanded and isRowDetailMounted should stay consistent with button clicks', () => {
    const grid = hostFixture.componentInstance.gridRef;
    const row = hostFixture.componentInstance.data[0];
    expect(grid.isRowExpanded(row)).toBeFalse();
    expect(grid.isRowDetailMounted(row)).toBeFalse();

    (hostFixture.nativeElement.querySelector('.we-grid__expand-btn') as HTMLButtonElement).click();
    hostFixture.detectChanges();
    expect(grid.isRowExpanded(row)).toBeTrue();
    expect(grid.isRowDetailMounted(row)).toBeTrue();

    (hostFixture.nativeElement.querySelector('.we-grid__expand-btn') as HTMLButtonElement).click();
    hostFixture.detectChanges();
    expect(grid.isRowExpanded(row)).toBeFalse();
    expect(grid.isRowDetailMounted(row)).toBeTrue(); // stays "mounted" once it's been mounted once, only hidden
  });

  it('clicking the expand arrow should not bubble into the row\'s rowClick event', () => {
    const grid = hostFixture.componentInstance.gridRef;
    const emitted: unknown[] = [];
    grid.rowClick.subscribe((e) => emitted.push(e));

    const firstBtn = hostFixture.nativeElement.querySelector('.we-grid__expand-btn') as HTMLButtonElement;
    firstBtn.click();
    hostFixture.detectChanges();

    expect(emitted.length).toBe(0);
  });

  it('the expand arrow is a native <button> — naturally accessible from the keyboard (Enter/Space)', () => {
    const firstBtn = hostFixture.nativeElement.querySelector('.we-grid__expand-btn') as HTMLButtonElement;
    expect(firstBtn.tagName).toBe('BUTTON');
    expect(firstBtn.type).toBe('button');
  });
});

describe('WeGridComponent — row expansion state (expandedKeys)', () => {
  let fixture: ComponentFixture<WeGridComponent<Row>>;
  let component: WeGridComponent<Row>;

  const columns: WeGridColumnDef<Row>[] = [
    { field: 'code', header: 'Code' },
    { field: 'name', header: 'Name' }
  ];

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [WeGridComponent] }).compileComponents();
    fixture = TestBed.createComponent(WeGridComponent<Row>);
    document.body.appendChild(fixture.nativeElement);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('gridKey', 'spec-expand-state-grid');
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('data', [{ code: 'A1', name: 'Product A' }]);
    fixture.componentRef.setInput('trackByField', 'code');
    fixture.componentRef.setInput('page', 1);
  });

  afterEach(() => fixture.nativeElement.remove());

  it('the DOM element that would otherwise show the expand column is not rendered while expandable=false', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.we-grid__expand-col')).toBeNull();
  });

  it('canExpandRows stays false when expandable=true without a weGridRowDetail template (the button can\'t be pressed)', () => {
    fixture.componentRef.setInput('expandable', true);
    fixture.detectChanges();
    expect(component.canExpandRows).toBeFalse();
    expect(fixture.nativeElement.querySelector('.we-grid__expand-btn')).toBeNull();
  });

  it('expanded rows reset when the page changes — prevents the wrong row from appearing open', () => {
    fixture.detectChanges();
    component.expandedKeys.add('A1');
    expect(component.expandedKeys.has('A1')).toBeTrue();

    fixture.componentRef.setInput('page', 2);
    fixture.detectChanges();

    expect(component.expandedKeys.size).toBe(0);
  });

  it('an input change other than page does not reset expanded rows', () => {
    fixture.detectChanges();
    component.expandedKeys.add('A1');

    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    expect(component.expandedKeys.has('A1')).toBeTrue();
  });
});

// ─── Export / import / inline row editing ──────────────────────────────────────────────
describe('WeGridComponent — export, import and row editing', () => {
  interface EditRow {
    code: string;
    name: string;
    qty: number;
  }

  let component: WeGridComponent<EditRow>;
  let fixture: ComponentFixture<WeGridComponent<EditRow>>;

  const columns: WeGridColumnDef<EditRow>[] = [
    { field: 'code', header: 'Code', required: true },
    { field: 'name', header: 'Name' },
    { field: 'qty', header: 'Qty', type: 'number' }
  ];

  const rows: EditRow[] = [
    { code: 'A1', name: 'Product A', qty: 2 },
    { code: 'B2', name: 'Product B', qty: 5 }
  ];

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [WeGridComponent] }).compileComponents();
    fixture = TestBed.createComponent(WeGridComponent<EditRow>);
    document.body.appendChild(fixture.nativeElement);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('gridKey', 'spec-edit-grid');
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput(
      'data',
      rows.map((r) => ({ ...r }))
    );
    fixture.componentRef.setInput('trackByField', 'code');
  });

  afterEach(() => fixture.nativeElement.remove());

  it('renders no export or import controls by default', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.we-grid__export-group')).toBeNull();
    expect(fixture.nativeElement.querySelector('.we-grid__file-input')).toBeNull();
  });

  it('renders one export button per requested format', () => {
    fixture.componentRef.setInput('exportFormats', ['csv', 'xlsx', 'pdf']);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.we-grid__export-btn').length).toBe(3);
  });

  it('exports every loaded row when nothing is selected, and only the selection otherwise', () => {
    fixture.componentRef.setInput('exportFormats', ['csv']);
    fixture.componentRef.setInput('selectable', 'multi');
    fixture.componentRef.setInput('exportMode', 'server');
    fixture.detectChanges();

    const requests: number[] = [];
    component.exportRequest.subscribe((e) => requests.push(e.rows.length));

    component.exportAs('csv');
    expect(component.exportScope).toBe('all');

    component.toggleRowSelection(component.displayData[0]);
    fixture.detectChanges();
    component.exportAs('csv');

    expect(component.exportScope).toBe('selected');
    expect(requests).toEqual([2, 1]);
  });

  it('leaves a column marked exportable:false out of the exported table', () => {
    fixture.componentRef.setInput('columns', [
      { field: 'code', header: 'Code' },
      { field: 'name', header: 'Name', exportable: false }
    ]);
    fixture.componentRef.setInput('exportFormats', ['csv']);
    fixture.detectChanges();
    expect(component.exportColumns.map((c) => c.field)).toEqual(['code']);
  });

  it('does not generate a file itself when a serverSide grid handles (exportRequest)', () => {
    fixture.componentRef.setInput('exportFormats', ['csv']);
    fixture.componentRef.setInput('serverSide', true);
    fixture.detectChanges();
    expect(component.isServerExport).toBeFalse();

    component.exportRequest.subscribe(() => {});
    expect(component.isServerExport).toBeTrue();
  });

  it('adds the action column only when editing or deleting is enabled', () => {
    fixture.detectChanges();
    expect(component.hasRowActions).toBeFalse();
    expect(fixture.nativeElement.querySelector('.we-grid__action-col')).toBeNull();

    fixture.componentRef.setInput('editable', true);
    fixture.detectChanges();
    expect(component.hasRowActions).toBeTrue();
    expect(fixture.nativeElement.querySelector('.we-grid__action-col')).toBeTruthy();
  });

  it('shifts right-pinned columns inward by the action column width', () => {
    fixture.componentRef.setInput('columns', [
      { field: 'code', header: 'Code' },
      { field: 'name', header: 'Name', pinned: 'right' }
    ]);
    fixture.componentRef.setInput('editable', true);
    fixture.detectChanges();
    const pinned = component.renderColumns.find((c) => c.field === 'name');
    expect(pinned?.pinnedOffset).toBe(component.actionColWidthPx);
  });

  it('renders editors in the edited row only, and only for editable columns', () => {
    fixture.componentRef.setInput('columns', [
      { field: 'code', header: 'Code' },
      { field: 'name', header: 'Name', editable: false }
    ]);
    fixture.componentRef.setInput('editable', true);
    fixture.detectChanges();

    component.startEdit(component.displayData[0], 0);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('we-grid-cell-editor').length).toBe(1);
  });

  it('emits rowUpdate with only the changed fields and stays in edit mode until done() succeeds', () => {
    fixture.componentRef.setInput('editable', true);
    fixture.detectChanges();

    const events: WeGridRowEditEvent<EditRow>[] = [];
    component.rowUpdate.subscribe((e) => events.push(e));

    const row = component.displayData[0];
    component.startEdit(row, 0);
    component.setDraftValue(component.internalColumns[1], 'Renamed');
    component.commitEdit();

    expect(events.length).toBe(1);
    expect(events[0].changes).toEqual({ name: 'Renamed' });
    expect(events[0].row.code).toBe('A1');
    // The row the grid renders is untouched until the consumer confirms the write.
    expect(row.name).toBe('Product A');
    expect(component.edit?.saving).toBeTrue();

    events[0].done(true);
    expect(component.edit).toBeNull();
  });

  it('keeps the editor open and reports the reason when done() rejects the commit', () => {
    fixture.componentRef.setInput('editable', true);
    fixture.detectChanges();
    component.rowUpdate.subscribe((e) => e.done(false, 'Conflict'));

    component.startEdit(component.displayData[0], 0);
    component.setDraftValue(component.internalColumns[1], 'Renamed');
    component.commitEdit();

    expect(component.edit).not.toBeNull();
    expect(component.edit?.saving).toBeFalse();
    expect(component.notice).toEqual({ text: 'Conflict', error: true });
  });

  it('closes the editor without emitting when nothing was actually changed', () => {
    fixture.componentRef.setInput('editable', true);
    fixture.detectChanges();
    let emitted = 0;
    component.rowUpdate.subscribe(() => emitted++);

    component.startEdit(component.displayData[0], 0);
    component.commitEdit();

    expect(emitted).toBe(0);
    expect(component.edit).toBeNull();
  });

  it('blocks the commit and marks the cell while a required field is empty', () => {
    fixture.componentRef.setInput('editable', true);
    fixture.detectChanges();
    let emitted = 0;
    component.rowUpdate.subscribe(() => emitted++);

    component.startEdit(component.displayData[0], 0);
    component.setDraftValue(component.internalColumns[0], '');
    component.commitEdit();

    expect(emitted).toBe(0);
    expect(component.hasDraftError(component.internalColumns[0])).toBeTrue();

    component.setDraftValue(component.internalColumns[0], 'A9');
    expect(component.hasDraftError(component.internalColumns[0])).toBeFalse();
  });

  it('writes the edit onto the row itself when nobody listens to rowUpdate', () => {
    fixture.componentRef.setInput('editable', true);
    fixture.detectChanges();

    const row = component.displayData[0];
    component.startEdit(row, 0);
    component.setDraftValue(component.internalColumns[1], 'Local edit');
    component.commitEdit();

    expect(row.name).toBe('Local edit');
    expect(component.edit).toBeNull();
  });

  it('opens a draft row for a new record and emits it through rowCreate', () => {
    fixture.componentRef.setInput('allowAdd', true);
    fixture.componentRef.setInput('editable', true);
    fixture.componentRef.setInput('newRowTemplate', { qty: 1 });
    fixture.detectChanges();

    const events: WeGridRowEditEvent<EditRow>[] = [];
    component.rowCreate.subscribe((e) => events.push(e));

    component.startCreate();
    fixture.detectChanges();
    expect(component.isCreating).toBeTrue();
    expect(fixture.nativeElement.querySelector('.we-grid__row--editing')).toBeTruthy();

    component.setDraftValue(component.internalColumns[0], 'C3');
    component.commitEdit();

    expect(events.length).toBe(1);
    expect(events[0].original).toBeNull();
    expect(events[0].row).toEqual(jasmine.objectContaining({ code: 'C3', qty: 1 }));
  });

  it('emits rowDelete and disables the button until done() answers', () => {
    fixture.componentRef.setInput('allowDelete', true);
    fixture.componentRef.setInput('confirmDelete', false);
    fixture.detectChanges();

    const events: WeGridRowDeleteEvent<EditRow>[] = [];
    component.rowDelete.subscribe((e) => events.push(e));

    const row = component.displayData[0];
    component.requestDelete(row, 0);
    expect(component.isRowDeleting(row)).toBeTrue();

    events[0].done(true);
    expect(component.isRowDeleting(row)).toBeFalse();
  });

  it('does not delete when the confirmation is declined', () => {
    fixture.componentRef.setInput('allowDelete', true);
    fixture.detectChanges();
    spyOn(window, 'confirm').and.returnValue(false);
    let emitted = 0;
    component.rowDelete.subscribe(() => emitted++);

    component.requestDelete(component.displayData[0], 0);

    expect(emitted).toBe(0);
  });

  it('cancels an open editor when the page changes', () => {
    fixture.componentRef.setInput('editable', true);
    fixture.componentRef.setInput('page', 1);
    fixture.detectChanges();

    component.startEdit(component.displayData[0], 0);
    expect(component.edit).not.toBeNull();

    fixture.componentRef.setInput('page', 2);
    fixture.detectChanges();

    expect(component.edit).toBeNull();
  });

  it('maps a picked file onto the columns and emits it without touching the data', async () => {
    fixture.componentRef.setInput('importFormats', ['csv']);
    fixture.detectChanges();

    const results: WeGridImportResult<EditRow>[] = [];
    component.importData.subscribe((r) => results.push(r));

    const file = new File(['Code;Name;Qty\nC3;Product C;7\n'], 'rows.csv', { type: 'text/csv' });
    await component.onImportFileSelected({ target: { files: [file], value: '' } } as unknown as Event);

    expect(results.length).toBe(1);
    expect(results[0].rows).toEqual([{ code: 'C3', name: 'Product C', qty: 7 }]);
    expect(component.data.length).toBe(2);
    expect(component.notice?.error).toBeFalse();
  });
});
