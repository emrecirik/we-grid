import { ChangeDetectorRef, Component, ComponentRef, ViewChild } from '@angular/core';
import { Observable, Subject, of, throwError } from 'rxjs';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { WeGridComponent } from './we-grid.component';
import { WeGridRowDetailDirective } from './directives/we-grid-row-detail.directive';
import { WeGridColumnDef } from './models/we-grid-column.model';
import { WeGridInternalColumn } from './models/we-grid-internal.model';
import { WeGridSortChange } from './models/we-grid-events.model';
import {
  WeGridChecklistValue,
  WeGridChecklistValuesRequest,
  WeGridChecklistValuesResult,
  WeGridFilterChangeEvent
} from './models/we-grid-filter.model';
import { WeGridRowDeleteEvent, WeGridRowEditEvent } from './models/we-grid-edit.model';
import { WeGridImportResult } from './models/we-grid-export.model';
import { WE_GRID_LAYOUT_STORE, WeGridLayout } from './models/we-grid-layout.model';
import { WE_GRID_LOCALE, WeGridLocale, weGridLocaleTr } from './models/we-grid-locale.model';
import { WeGridMenuAction } from './models/we-grid-menu-action.model';
import { WeGridFilterPopoverComponent } from './we-grid-filter-popover/we-grid-filter-popover.component';

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

describe('WeGridComponent — checklist header filter and server-side filtering', () => {
  interface OrderRow {
    code: string;
    status: number | null;
  }

  let component: WeGridComponent<OrderRow>;
  let fixture: ComponentFixture<WeGridComponent<OrderRow>>;

  const statusLabels: Record<string, string> = { '1': 'Draft', '2': 'Approved' };

  const columns: WeGridColumnDef<OrderRow>[] = [
    { field: 'code', header: 'Code' },
    {
      field: 'status',
      header: 'Status',
      type: 'number',
      headerFilterMode: 'checklist',
      displayValue: (row) => (row.status === null ? '' : statusLabels[String(row.status)])
    }
  ];

  const firstPage: OrderRow[] = [
    { code: 'A1', status: 1 },
    { code: 'B2', status: 2 },
    { code: 'C3', status: null },
    { code: 'D4', status: 1 }
  ];

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [WeGridComponent] }).compileComponents();
    fixture = TestBed.createComponent(WeGridComponent<OrderRow>);
    document.body.appendChild(fixture.nativeElement);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('gridKey', 'spec-checklist-grid');
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('data', firstPage);
    fixture.componentRef.setInput('trackByField', 'code');
  });

  afterEach(() => fixture.nativeElement.remove());

  function statusColumn(): WeGridInternalColumn<OrderRow> {
    return component.internalColumns.find((c) => c.field === 'status')!;
  }

  it('gives a checklist column a funnel icon without turning the filter row on, and leaves the others alone', () => {
    fixture.detectChanges();
    expect(component.showFilterIcon(statusColumn())).toBeTrue();
    expect(component.showFilterIcon(component.internalColumns[0])).toBeFalse();
    expect(fixture.nativeElement.querySelectorAll('.we-grid__th-filter-btn').length).toBe(1);
  });

  it('builds the distinct values of the loaded rows, labelled through displayValue, "(Empty)" first', () => {
    fixture.detectChanges();
    const options = component.checklistOptionsFor(statusColumn());
    expect(options.map((o) => o.label)).toEqual([component.locale.emptyGroupValue, 'Approved', 'Draft']);
    expect(options.map((o) => o.value)).toEqual([null, 2, 1]);
    expect(options[0].blank).toBeTrue();
  });

  it('filters the loaded rows on the picked values in client mode', () => {
    fixture.detectChanges();
    component.setChecklistFilter(statusColumn(), [1]);
    fixture.detectChanges();

    expect(component.displayData.map((r) => r.code)).toEqual(['A1', 'D4']);
    expect(component.filterState.get('status')).toEqual({ field: 'status', operator: 'in', value: [1] });
    expect(component.isColumnFilterActive(statusColumn())).toBeTrue();
  });

  it('shows the picked labels on the chip and shortens a long selection', () => {
    fixture.detectChanges();
    component.checklistOptionsFor(statusColumn());
    component.setChecklistFilter(statusColumn(), [1, 2, null]);
    fixture.detectChanges();

    // The chip lists the values in the order they were picked, not in list order
    expect(component.activeFilterChips[0].label).toBe('Status: Draft, Approved (+1)');
    expect(component.checklistButtonLabel(statusColumn())).toContain('Draft');
  });

  it('clears the column filter when the selection is emptied', () => {
    fixture.detectChanges();
    component.setChecklistFilter(statusColumn(), [1]);
    component.setChecklistFilter(statusColumn(), []);
    expect(component.filterState.has('status')).toBeFalse();
    expect(component.hasActiveFilters).toBeFalse();
  });

  it('keeps a picked value in the list after a page change that no longer contains it', () => {
    fixture.detectChanges();
    component.checklistOptionsFor(statusColumn());
    component.setChecklistFilter(statusColumn(), [1]);

    // The next page holds no status=1 row at all
    fixture.componentRef.setInput('data', [{ code: 'E5', status: 2 }]);
    fixture.detectChanges();

    const options = component.checklistOptionsFor(statusColumn());
    expect(options.map((o) => o.label)).toContain('Draft');
    expect(component.filterState.get('status')?.value).toEqual([1]);
  });

  it('emits the selection as an "in" filter with resetPage, and never pages by itself', fakeAsync(() => {
    fixture.componentRef.setInput('serverSide', true);
    fixture.componentRef.setInput('filterMode', 'server');
    fixture.componentRef.setInput('totalCount', 120);
    fixture.detectChanges();

    const emitted: WeGridFilterChangeEvent[] = [];
    const pages: number[] = [];
    component.filterChange.subscribe((e) => emitted.push(e));
    component.pageChange.subscribe((e) => pages.push(e.page));

    component.setChecklistFilter(statusColumn(), [1, 2]);
    tick(400);

    expect(emitted.length).toBe(1);
    // The payload still IS the plain array of active filters a pre-0.3 consumer expects
    expect([...emitted[0]]).toEqual([{ field: 'status', operator: 'in', value: [1, 2] }]);
    expect(emitted[0].filters[0].operator).toBe('in');
    expect(emitted[0].resetPage).toBeTrue();
    expect(pages).toEqual([]);
    // The backend already returned filtered rows — the grid must not filter them a second time
    expect(component.displayData.length).toBe(4);
  }));

  it('collapses a burst of edits into one emit and honours filterDebounceMs', fakeAsync(() => {
    fixture.componentRef.setInput('filterRow', true);
    fixture.componentRef.setInput('filterDebounceMs', 1000);
    fixture.detectChanges();

    const emitted: WeGridFilterChangeEvent[] = [];
    component.filterChange.subscribe((e) => emitted.push(e));

    component.setFilterValue(component.internalColumns[0], 'A');
    tick(400);
    expect(emitted.length).toBe(0);

    component.setFilterValue(component.internalColumns[0], 'A1');
    tick(1000);

    expect(emitted.length).toBe(1);
    expect(emitted[0][0].value).toBe('A1');
    expect(emitted[0].resetPage).toBeTrue();
  }));

  it('reports resetPage:false when the debounce window ends on the filters that were already sent', fakeAsync(() => {
    fixture.componentRef.setInput('filterRow', true);
    fixture.detectChanges();

    const emitted: WeGridFilterChangeEvent[] = [];
    component.filterChange.subscribe((e) => emitted.push(e));

    component.setFilterValue(component.internalColumns[0], 'A1');
    tick(400);
    component.setFilterValue(component.internalColumns[0], 'A1');
    tick(400);

    expect(emitted.length).toBe(2);
    expect(emitted[0].resetPage).toBeTrue();
    expect(emitted[1].resetPage).toBeFalse();
  }));
});

/** Private members reached the way the rest of this file does — through a narrow cast */
type WithMenuAction = { handleMenuAction: (action: WeGridMenuAction) => void };
type WithFilterPopover = { filterPopoverComponentRef: ComponentRef<WeGridFilterPopoverComponent> | null };

// ─── Reset layout ──────────────────────────────────────────────────────
describe('WeGridComponent — reset layout', () => {
  let component: WeGridComponent<Row>;
  let fixture: ComponentFixture<WeGridComponent<Row>>;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [WeGridComponent] }).compileComponents();
    fixture = TestBed.createComponent(WeGridComponent<Row>);
    document.body.appendChild(fixture.nativeElement);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('gridKey', 'spec-reset-grid');
    fixture.componentRef.setInput('columns', [
      { field: 'code', header: 'Code' },
      { field: 'name', header: 'Name', headerFilterMode: 'checklist' }
    ] as WeGridColumnDef<Row>[]);
    fixture.componentRef.setInput('filterRow', true);
    fixture.componentRef.setInput('data', [
      { code: 'A1', name: 'Product A' },
      { code: 'B1', name: 'Product B' }
    ]);
  });

  afterEach(() => fixture.nativeElement.remove());

  function column(field: string): WeGridInternalColumn<Row> {
    return component.internalColumns.find((c) => c.field === field)!;
  }

  /** The header menu's action output lands in handleMenuAction — the same path a real click takes */
  function resetLayout(): void {
    (component as unknown as WithMenuAction).handleMenuAction({ type: 'reset-layout' });
  }

  it('emits one empty (filterChange) with resetPage after clearing an operator filter', fakeAsync(() => {
    fixture.detectChanges();
    const emitted: WeGridFilterChangeEvent[] = [];
    component.filterChange.subscribe((e) => emitted.push(e));
    component.setFilterValue(column('code'), 'A1');
    tick(400);
    expect(emitted.length).toBe(1);

    resetLayout();
    tick(1000);

    expect(emitted.length).toBe(2);
    expect([...emitted[1]]).toEqual([]);
    expect(emitted[1].resetPage).toBeTrue();
  }));

  it('does the same for a checklist selection, which no longer shows as picked afterwards', fakeAsync(() => {
    fixture.detectChanges();
    const emitted: WeGridFilterChangeEvent[] = [];
    component.filterChange.subscribe((e) => emitted.push(e));
    component.setChecklistFilter(column('name'), ['Product A']);
    tick(400);

    resetLayout();
    tick(1000);

    expect(emitted.length).toBe(2);
    expect([...emitted[1]]).toEqual([]);
    expect(emitted[1].resetPage).toBeTrue();
    expect(component.filterState.has('name')).toBeFalse();
    expect(component.getFilterState(column('name')).value).toEqual([]);
  }));

  it('emits no (filterChange) when no filter was active', fakeAsync(() => {
    fixture.detectChanges();
    const emitted: WeGridFilterChangeEvent[] = [];
    component.filterChange.subscribe((e) => emitted.push(e));

    resetLayout();
    tick(1000);

    expect(emitted.length).toBe(0);
  }));

  it('emits (layoutChange) exactly once per reset, with or without an active filter', fakeAsync(() => {
    fixture.detectChanges();
    const layouts: WeGridLayout[] = [];
    component.layoutChange.subscribe((layout) => layouts.push(layout));

    resetLayout();
    tick(1000);
    expect(layouts.length).toBe(1);
    expect(layouts[0].density).toBe('normal');
    expect(layouts[0].filterRowVisible).toBeFalse();

    component.setFilterValue(column('code'), 'A1');
    resetLayout();
    tick(1000);
    expect(layouts.length).toBe(2);
  }));

  it('deletes the saved layout without writing it back', fakeAsync(() => {
    const store = TestBed.inject(WE_GRID_LAYOUT_STORE);
    const save = spyOn(store, 'save').and.callThrough();
    const reset = spyOn(store, 'reset').and.callThrough();
    fixture.detectChanges();

    component.setFilterValue(column('code'), 'A1');
    resetLayout();
    tick(1000);

    expect(reset).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  }));

  it('emits straight away instead of waiting out filterDebounceMs', fakeAsync(() => {
    fixture.componentRef.setInput('filterDebounceMs', 5000);
    fixture.detectChanges();
    const emitted: WeGridFilterChangeEvent[] = [];
    component.filterChange.subscribe((e) => emitted.push(e));

    component.setFilterValue(column('code'), 'A1');
    resetLayout();

    // No tick: the reset's emit is already out, and the keystroke's pending one collapsed into it
    expect(emitted.length).toBe(1);
    expect([...emitted[0]]).toEqual([]);
    expect(emitted[0].resetPage).toBeTrue();
    tick(6000);
    expect(emitted.length).toBe(1);
  }));
});

// ─── "Filter by this value" on non-filterable, checklist and restricted columns ─────────
describe('WeGridComponent — quick filter on a non-filterable column', () => {
  interface StatusRow {
    code: string;
    name: string;
    status: number | null;
    qty: number;
  }

  let component: WeGridComponent<StatusRow>;
  let fixture: ComponentFixture<WeGridComponent<StatusRow>>;

  const statusLabels: Record<string, string> = { '1': 'Draft', '2': 'Approved' };
  const columns: WeGridColumnDef<StatusRow>[] = [
    { field: 'code', header: 'Code', filterable: false },
    { field: 'name', header: 'Name' },
    {
      field: 'status',
      header: 'Status',
      type: 'number',
      headerFilterMode: 'checklist',
      displayValue: (row) => (row.status === null ? '' : statusLabels[String(row.status)])
    },
    { field: 'qty', header: 'Qty', type: 'number', filterOperators: ['gt', 'lt'] }
  ];

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [WeGridComponent] }).compileComponents();
    fixture = TestBed.createComponent(WeGridComponent<StatusRow>);
    document.body.appendChild(fixture.nativeElement);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('gridKey', 'spec-quick-filter-grid');
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('grouping', true);
    fixture.componentRef.setInput('filterRow', true);
    fixture.componentRef.setInput('data', [
      { code: 'A1', name: 'Product A', status: 1, qty: 5 },
      { code: 'B2', name: 'Product B', status: 2, qty: 9 }
    ]);
    fixture.detectChanges();
  });

  afterEach(() => fixture.nativeElement.remove());

  function column(field: string): WeGridInternalColumn<StatusRow> {
    return component.internalColumns.find((c) => c.field === field)!;
  }

  function quickFilter(field: string, value: unknown): void {
    (component as unknown as WithMenuAction).handleMenuAction({ type: 'quick-filter', field, value });
  }

  /** Right-clicks the first row's cell and returns the menu's "Filter by this value" item, if any */
  function quickFilterItemFor(field: string): HTMLButtonElement | undefined {
    component.onCellContextMenu(new MouseEvent('contextmenu', { clientX: 10, clientY: 10 }), column(field), component.displayData[0]);
    const items = Array.from(document.querySelectorAll<HTMLButtonElement>('we-grid-header-menu .we-grid-menu__item'));
    return items.find((item) => item.textContent?.includes(component.locale.filterByThisValue));
  }

  it('ignores the action on a filterable:false column — no filter, no emit, no chip', fakeAsync(() => {
    const emitted: WeGridFilterChangeEvent[] = [];
    component.filterChange.subscribe((e) => emitted.push(e));

    quickFilter('code', 'A1');
    tick(400);

    expect(component.filterState.has('code')).toBeFalse();
    expect(emitted.length).toBe(0);
    expect(component.activeFilterChips.length).toBe(0);
  }));

  it('does not offer the menu item on a filterable:false column', () => {
    expect(quickFilterItemFor('code')).toBeUndefined();
  });

  it('keeps filtering a default column exactly as before', fakeAsync(() => {
    const emitted: WeGridFilterChangeEvent[] = [];
    component.filterChange.subscribe((e) => emitted.push(e));

    quickFilter('name', 'Product A');
    // Past both the filter debounce and the layout save the quick filter schedules
    tick(600);

    expect(component.filterState.get('name')).toEqual({ field: 'name', operator: 'equals', value: 'Product A' });
    expect(emitted.length).toBe(1);
    expect(component.displayData.map((r) => r.code)).toEqual(['A1']);
  }));

  it("writes an 'in' filter over the raw value on a checklist column, which the popover shows as ticked", () => {
    quickFilter('status', 1);
    expect(component.filterState.get('status')).toEqual({ field: 'status', operator: 'in', value: [1] });

    const anchor = document.createElement('button');
    fixture.nativeElement.appendChild(anchor);
    component.onFilterIconClick(new MouseEvent('click'), column('status'), anchor);
    const popover = (component as unknown as WithFilterPopover).filterPopoverComponentRef!.instance;
    expect(popover.options.filter((option) => popover.isOptionSelected(option)).map((option) => option.label)).toEqual(['Draft']);
  });

  it('sends the raw code, not the displayValue label, when a checklist cell is right-clicked', () => {
    quickFilterItemFor('status')!.click();

    expect(component.filterState.get('status')).toEqual({ field: 'status', operator: 'in', value: [1] });
    expect(component.activeFilterChips[0].label).toBe('Status: Draft');
  });

  it('neither offers nor applies an exact match that filterOperators rule out', () => {
    expect(quickFilterItemFor('qty')).toBeUndefined();
    quickFilter('qty', 5);
    expect(component.filterState.has('qty')).toBeFalse();
  });
});

// ─── Per-column operator restriction ──────────────────────────────────
describe('WeGridComponent — restricted filter operators (filterOperators)', () => {
  interface QtyRow {
    code: string;
    qty: number;
  }

  let component: WeGridComponent<QtyRow>;
  let fixture: ComponentFixture<WeGridComponent<QtyRow>>;
  let warn: jasmine.Spy;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [WeGridComponent] }).compileComponents();
    fixture = TestBed.createComponent(WeGridComponent<QtyRow>);
    document.body.appendChild(fixture.nativeElement);
    component = fixture.componentInstance;
    warn = spyOn(console, 'warn');
    fixture.componentRef.setInput('gridKey', 'spec-operators-grid');
    fixture.componentRef.setInput('columns', [
      { field: 'code', header: 'Code', filterOperators: ['gt'] },
      { field: 'qty', header: 'Qty', type: 'number', filterOperators: ['lt', 'gt'] }
    ] as WeGridColumnDef<QtyRow>[]);
    fixture.componentRef.setInput('filterRow', true);
    fixture.componentRef.setInput('data', [
      { code: 'A1', qty: 5 },
      { code: 'B2', qty: 9 }
    ]);
    fixture.detectChanges();
  });

  afterEach(() => fixture.nativeElement.remove());

  function column(field: string): WeGridInternalColumn<QtyRow> {
    return component.internalColumns.find((c) => c.field === field)!;
  }

  it('offers only the listed operators in the filter row, in their order, and defaults to the first', () => {
    expect(component.filterOperatorsFor(column('qty'))).toEqual(['lt', 'gt']);
    expect(component.getFilterState(column('qty')).operator).toBe('lt');

    component.toggleFilterRowVisible();
    fixture.debugElement.injector.get(ChangeDetectorRef).detectChanges();

    const selects = fixture.nativeElement.querySelectorAll('.we-grid__filter-op') as NodeListOf<HTMLSelectElement>;
    const qtySelect = selects[1];
    expect(Array.from(qtySelect.options).map((o) => o.value)).toEqual(['lt', 'gt']);
    expect(Array.from(qtySelect.options).map((o) => o.textContent?.trim())).toEqual(['<', '>']);
  });

  it('falls back to the full list with a single dev-mode warning when nothing in the list fits the type', () => {
    expect(component.filterOperatorsFor(column('code'))).toEqual(['contains', 'startsWith', 'equals']);
    component.filterOperatorsFor(column('code'));

    const codeWarnings = warn.calls.allArgs().filter((args) => String(args[0]).includes("'code'"));
    expect(codeWarnings.length).toBe(1);
  });

  it('refuses an operator outside the list', () => {
    component.setFilterOperator(column('qty'), 'eq');
    expect(component.filterState.has('qty')).toBeFalse();

    component.setFilterOperator(column('qty'), 'gt');
    expect(component.filterState.get('qty')?.operator).toBe('gt');
  });

  it('keeps the full list and the old default on a column without filterOperators', () => {
    fixture.componentRef.setInput('columns', [{ field: 'qty', header: 'Qty', type: 'number' }] as WeGridColumnDef<QtyRow>[]);
    fixture.detectChanges();

    expect(component.filterOperatorsFor(column('qty'))).toEqual(['eq', 'gt', 'lt', 'between']);
    expect(component.getFilterState(column('qty')).operator).toBe('eq');
  });
});

// ─── Locale-aware formatting, comparison and sorting ──────────────────
describe('WeGridComponent — Turkish formatting, comparison and sorting', () => {
  interface CityRow {
    code: string;
    city: string;
    amount: number;
  }

  let component: WeGridComponent<CityRow>;
  let fixture: ComponentFixture<WeGridComponent<CityRow>>;

  // Corum/Çanakkale and İSTANBUL are where Turkish and English collation disagree
  const rows: CityRow[] = [
    { code: 'R1', city: 'Şanlıurfa', amount: 1234.5 },
    { code: 'R2', city: 'Çanakkale', amount: 10 },
    { code: 'R3', city: 'Corum', amount: 20 },
    { code: 'R4', city: 'Sakarya', amount: 30 },
    { code: 'R5', city: 'Ankara', amount: 40 },
    { code: 'R6', city: 'İSTANBUL', amount: 50 }
  ];

  async function createGrid(locale?: WeGridLocale): Promise<void> {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [WeGridComponent],
      providers: locale ? [{ provide: WE_GRID_LOCALE, useValue: locale }] : []
    }).compileComponents();
    fixture = TestBed.createComponent(WeGridComponent<CityRow>);
    document.body.appendChild(fixture.nativeElement);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('gridKey', 'spec-turkish-grid');
    fixture.componentRef.setInput('columns', [
      { field: 'code', header: 'Kod' },
      { field: 'city', header: 'Şehir' },
      { field: 'amount', header: 'Tutar', type: 'currency' }
    ] as WeGridColumnDef<CityRow>[]);
    fixture.componentRef.setInput('filterRow', true);
    fixture.componentRef.setInput('grouping', true);
    fixture.componentRef.setInput('data', rows);
    fixture.detectChanges();
  }

  afterEach(() => fixture.nativeElement.remove());

  function column(field: string): WeGridInternalColumn<CityRow> {
    return component.internalColumns.find((c) => c.field === field)!;
  }

  function groupBy(field: string): void {
    (component as unknown as WithMenuAction).handleMenuAction({ type: 'group-by', field });
  }

  it('sorts group headers in Turkish alphabetical order', async () => {
    await createGrid(weGridLocaleTr);
    groupBy('city');
    expect(component.groupedSections!.map((s) => s.label)).toEqual(['Ankara', 'Corum', 'Çanakkale', 'İSTANBUL', 'Sakarya', 'Şanlıurfa']);
  });

  it('keeps the English default ordering unchanged', async () => {
    await createGrid();
    groupBy('city');
    expect(component.groupedSections!.map((s) => s.label)).toEqual(['Ankara', 'Çanakkale', 'Corum', 'İSTANBUL', 'Sakarya', 'Şanlıurfa']);
  });

  it('orders checklist values in Turkish alphabetical order', async () => {
    await createGrid(weGridLocaleTr);
    expect(component.checklistOptionsFor(column('city')).map((o) => o.label)).toEqual([
      'Ankara',
      'Corum',
      'Çanakkale',
      'İSTANBUL',
      'Sakarya',
      'Şanlıurfa'
    ]);
  });

  it('matches "İSTANBUL" when the text filter says "istanbul"', async () => {
    await createGrid(weGridLocaleTr);
    component.setFilterValue(column('city'), 'istanbul');
    expect(component.displayData.map((r) => r.code)).toEqual(['R6']);
  });

  it('formats currency cells with Turkish separators, in lira when the column names no currency', async () => {
    await createGrid(weGridLocaleTr);
    const text = component.formatCell(rows[0], column('amount'));
    expect(text).toContain('1.234,50');
    expect(text).toContain('₺');
  });

  it('still formats in en-US dollars without a locale provider', async () => {
    await createGrid();
    expect(component.formatCell(rows[0], column('amount'))).toBe('$1,234.50');
  });
});

// ─── Checklist values from a provider ─────────────────────────────────
// The 0.3.0 behaviour this builds on — distinct loaded values, the "(Empty)" bucket, ticks surviving
// a page change, the debounced 'in' emit — stays locked by the "checklist header filter" suite above.
describe('WeGridComponent — checklist values from a provider (checklistValuesProvider)', () => {
  interface OrderRow {
    code: string;
    status: number | null;
    amount: number;
  }

  let component: WeGridComponent<OrderRow>;
  let fixture: ComponentFixture<WeGridComponent<OrderRow>>;
  let warn: jasmine.Spy;

  const columns: WeGridColumnDef<OrderRow>[] = [
    { field: 'code', header: 'Code', headerFilterMode: 'checklist', headerFilterSource: 'loaded' },
    { field: 'status', header: 'Status', type: 'number', headerFilterMode: 'checklist', checklistValueLabel: (value) => `Status ${value}` },
    { field: 'amount', header: 'Amount', type: 'number', headerFilterMode: 'checklist', checklistValuesLimit: 5 }
  ];

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [WeGridComponent] }).compileComponents();
    fixture = TestBed.createComponent(WeGridComponent<OrderRow>);
    document.body.appendChild(fixture.nativeElement);
    component = fixture.componentInstance;
    warn = spyOn(console, 'warn');
    fixture.componentRef.setInput('gridKey', 'spec-checklist-provider-grid');
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('data', [{ code: 'A1', status: 1, amount: 10 }]);
    fixture.componentRef.setInput('serverSide', true);
    fixture.componentRef.setInput('filterMode', 'server');
  });

  afterEach(() => fixture.nativeElement.remove());

  function column(field: string): WeGridInternalColumn<OrderRow> {
    return component.internalColumns.find((c) => c.field === field)!;
  }

  function result(values: WeGridChecklistValue[], hasMore = false): WeGridChecklistValuesResult {
    return { values, hasMore };
  }

  /** Clicks the column's funnel — a second call for the same column closes the popover again */
  function open(field: string, provider?: (request: WeGridChecklistValuesRequest) => Observable<WeGridChecklistValuesResult>): WeGridFilterPopoverComponent {
    if (provider) fixture.componentRef.setInput('checklistValuesProvider', provider);
    fixture.detectChanges();
    const anchor = document.createElement('button');
    fixture.nativeElement.appendChild(anchor);
    component.onFilterIconClick(new MouseEvent('click'), column(field), anchor);
    return popoverRef().instance;
  }

  function popoverRef(): ComponentRef<WeGridFilterPopoverComponent> {
    return (component as unknown as WithFilterPopover).filterPopoverComponentRef!;
  }

  function popoverText(): string {
    popoverRef().changeDetectorRef.detectChanges();
    return (popoverRef().location.nativeElement as HTMLElement).textContent ?? '';
  }

  /** A second click on the funnel of the column whose popover is open — closes it */
  function clickFunnelAgain(field: string): void {
    component.onFilterIconClick(new MouseEvent('click'), column(field), document.createElement('button'));
  }

  it('asks for the unsearched list with every other active filter — never the column\'s own — and the limit', () => {
    const provider = jasmine.createSpy('provider').and.returnValue(of(result([{ value: 1 }])));
    fixture.detectChanges();
    component.setChecklistFilter(column('code'), ['A1']);
    component.setChecklistFilter(column('status'), [1]);

    open('status', provider);

    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider.calls.mostRecent().args[0]).toEqual({
      field: 'status',
      search: null,
      filters: [{ field: 'code', operator: 'in', value: ['A1'] }],
      limit: 200
    });
  });

  it('labels values by the provider label, then checklistValueLabel, then plain formatting', () => {
    const provider = jasmine
      .createSpy('provider')
      .and.callFake((request: WeGridChecklistValuesRequest) =>
        of(request.field === 'status' ? result([{ value: 2 }, { value: 1, label: 'From the server' }, { value: null }]) : result([{ value: 1234.5 }]))
      );

    let popover = open('status', provider);
    expect(popover.options.map((o) => o.label)).toEqual([component.locale.emptyGroupValue, 'From the server', 'Status 2']);
    expect(popover.options[0].blank).toBeTrue();
    expect(popover.remoteSearch).toBeTrue();

    popover = open('amount');
    expect(provider.calls.mostRecent().args[0].limit).toBe(5);
    expect(popover.options.map((o) => o.label)).toEqual(['1,234.5']);
  });

  it('shows the loading state until the provider answers', () => {
    const response = new Subject<WeGridChecklistValuesResult>();
    const popover = open('status', () => response);

    expect(popover.loading).toBeTrue();
    expect(popover.options).toEqual([]);
    expect(popoverText()).toContain(component.locale.checklistValuesLoading);

    response.next(result([{ value: 1 }]));

    expect(popover.loading).toBeFalse();
    expect(popover.options.map((o) => o.label)).toEqual(['Status 1']);
  });

  it('debounces the search box into one request and cancels the requests it replaced', fakeAsync(() => {
    let cancelled = 0;
    const provider = jasmine
      .createSpy('provider')
      .and.callFake(() => new Observable<WeGridChecklistValuesResult>(() => () => cancelled++));
    const popover = open('status', provider);
    expect(provider).toHaveBeenCalledTimes(1);

    popover.onSearchChange('i');
    tick(100);
    popover.onSearchChange('is');
    tick(100);
    popover.onSearchChange(' ist ');
    tick(299);
    expect(provider).toHaveBeenCalledTimes(1);
    tick(1);

    expect(provider).toHaveBeenCalledTimes(2);
    expect(provider.calls.mostRecent().args[0].search).toBe('ist');
    // The unsearched request was still in flight when typing began — dropped, not left to land late
    expect(cancelled).toBe(1);
  }));

  it('notes a truncated list only when the provider reports more values', () => {
    open('status', () => of(result([{ value: 1 }], true)));
    expect(popoverText()).toContain(component.locale.checklistValuesTruncated(200));

    clickFunnelAgain('status');
    open('status', () => of(result([{ value: 1 }], false)));
    expect(popoverText()).not.toContain(component.locale.checklistValuesTruncated(200));
  });

  it('reports a failed request with a retry button that repeats it', () => {
    let calls = 0;
    const provider = jasmine
      .createSpy('provider')
      .and.callFake(() => (++calls === 1 ? throwError(() => new Error('backend down')) : of(result([{ value: 1 }]))));
    const popover = open('status', provider);

    expect(popover.loadError).toBeTrue();
    expect(popoverText()).toContain(component.locale.checklistValuesError);

    (popoverRef().location.nativeElement.querySelector('.we-grid-filter-popover__retry') as HTMLButtonElement).click();

    expect(provider).toHaveBeenCalledTimes(2);
    expect(provider.calls.mostRecent().args[0].search).toBeNull();
    expect(popover.loadError).toBeFalse();
    expect(popover.options.map((o) => o.label)).toEqual(['Status 1']);
  });

  it('keeps a ticked value the provider no longer returns, listed and ticked', () => {
    fixture.detectChanges();
    component.setChecklistFilter(column('status'), [9]);

    const popover = open('status', () => of(result([{ value: 1 }])));

    expect(popover.options.map((o) => o.label)).toEqual(['Status 1', 'Status 9']);
    expect(popover.options.filter((o) => popover.isOptionSelected(o)).map((o) => o.label)).toEqual(['Status 9']);
  });

  it('does not pad a search result with ticked values that don\'t match it', fakeAsync(() => {
    fixture.detectChanges();
    component.setChecklistFilter(column('status'), [9]);
    const popover = open('status', (request) => of(result(request.search ? [{ value: 1 }] : [])));

    popover.onSearchChange('1');
    tick(300);

    expect(popover.options.map((o) => o.label)).toEqual(['Status 1']);
    tick(100); // the checklist's own filter emit
  }));

  it('turns the "(Empty)" entry into null in the applied filter', () => {
    const popover = open('status', () => of(result([{ value: null }, { value: 1 }])));
    popover.toggleOption(popover.options[0]);
    popover.applyChecklist();
    expect(component.filterState.get('status')).toEqual({ field: 'status', operator: 'in', value: [null] });
  });

  it('keeps radio behaviour — one value at a time — with a provider', () => {
    fixture.componentRef.setInput(
      'columns',
      columns.map((c) => (c.field === 'status' ? { ...c, headerFilterSelection: 'single' as const } : c))
    );
    const popover = open('status', () => of(result([{ value: 1 }, { value: 2 }])));

    popover.toggleOption(popover.options[0]);
    popover.toggleOption(popover.options[1]);
    popover.applyChecklist();

    expect(component.filterState.get('status')?.value).toEqual([2]);
  });

  it('never calls the provider on a client-filtered grid, and says why once in dev mode', () => {
    fixture.componentRef.setInput('filterMode', 'client');
    const provider = jasmine.createSpy('provider').and.returnValue(of(result([{ value: 7 }])));

    const popover = open('status', provider);

    expect(provider).not.toHaveBeenCalled();
    expect(popover.remoteSearch).toBeFalse();
    expect(popover.options.map((o) => o.label)).toEqual(['1']);
    expect(warn.calls.allArgs().filter((args) => String(args[0]).includes('ignores checklistValuesProvider')).length).toBe(1);
  });

  it("leaves a column declared headerFilterSource: 'loaded' on the loaded rows while the others use the provider", () => {
    const provider = jasmine.createSpy('provider').and.returnValue(of(result([{ value: 1 }])));

    let popover = open('code', provider);
    expect(provider).not.toHaveBeenCalled();
    expect(popover.options.map((o) => o.label)).toEqual(['A1']);

    popover = open('status');
    expect(provider).toHaveBeenCalledTimes(1);
    expect(popover.remoteSearch).toBeTrue();
  });

  it('without a provider on a server-filtered grid, warns once and says the list is the loaded page only', () => {
    const popover = open('status');

    expect(popover.remoteSearch).toBeFalse();
    expect(popover.pageOnlyHint).toBeTrue();
    expect(popoverText()).toContain(component.locale.onlyThisPageSearched);

    clickFunnelAgain('status');
    open('status');
    expect(warn.calls.allArgs().filter((args) => String(args[0]).includes("'status'")).length).toBe(1);
  });

  it('keeps a client-side checklist without a provider as it was — same options, no hint, no warning, no extra markup', () => {
    fixture.componentRef.setInput('serverSide', false);
    fixture.componentRef.setInput('filterMode', 'auto');

    const popover = open('status');

    expect(popover.options).toEqual(component.checklistOptionsFor(column('status')));
    expect(popover.remoteSearch).toBeFalse();
    expect(popover.pageOnlyHint).toBeFalse();
    expect(warn).not.toHaveBeenCalled();
    popoverRef().changeDetectorRef.detectChanges();
    expect(popoverRef().location.nativeElement.querySelector('.we-grid-filter-popover__status')).toBeNull();
  });

  it('leaves a provider-backed list alone when the page changes', () => {
    const popover = open('status', () => of(result([{ value: 7 }])));

    fixture.componentRef.setInput('data', [{ code: 'Z9', status: 3, amount: 1 }]);
    fixture.detectChanges();

    expect(popover.options.map((o) => o.label)).toEqual(['Status 7']);
  });

  it('drops a pending request when the popover closes', () => {
    const response = new Subject<WeGridChecklistValuesResult>();
    open('status', () => response);
    expect(response.observed).toBeTrue();

    clickFunnelAgain('status');

    expect(response.observed).toBeFalse();
  });
});
