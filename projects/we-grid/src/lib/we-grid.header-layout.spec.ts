import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { WeGridComponent } from './we-grid.component';
import { WeGridHeaderDirective } from './directives/we-grid-header.directive';
import { WeGridColumnDef } from './models/we-grid-column.model';
import { WeGridInternalColumn } from './models/we-grid-internal.model';
import { WeGridLayout } from './models/we-grid-layout.model';
import { WeGridExportTable } from './models/we-grid-export.model';
import { weGridLocaleEn, weGridLocaleTr } from './models/we-grid-locale.model';

interface Row {
  id: string;
  name: string;
  qty: number;
  note: string;
}

@Component({
  standalone: true,
  imports: [WeGridComponent, WeGridHeaderDirective],
  template: `
    <we-grid
      gridKey="header-layout-spec"
      [columns]="columns"
      [data]="data"
      trackByField="id"
      [filterRow]="filterRow"
      [maxHeight]="maxHeight"
      [minHeight]="minHeight"
      [footer]="footer"
      [serverSide]="serverSide"
      [totalCount]="data.length"
      (layoutChange)="layouts.push($event)"
    >
      @if (withHeaderTemplate) {
        <ng-template weGridHeader="qty" let-title="title"><em class="custom-title">{{ title }}!</em></ng-template>
      }
    </we-grid>
  `
})
class HeaderHostComponent {
  columns: WeGridColumnDef<Row>[] = [
    { field: 'id', header: 'Id', width: 80 },
    { field: 'name', header: 'Name', width: 150, headerHint: 'Line one\nLine two', headerTooltip: 'native title' },
    { field: 'qty', header: 'Qty', type: 'number', width: 90, summary: 'sum' },
    { field: 'note', header: 'Note', width: 120 }
  ];
  data: Row[] = Array.from({ length: 40 }, (_, i) => ({ id: `r${i}`, name: `Name ${i}`, qty: i, note: '' }));
  filterRow = false;
  maxHeight?: number | string;
  minHeight?: number | string;
  footer: 'full' | 'count' | 'none' = 'full';
  serverSide = false;
  withHeaderTemplate = false;
  layouts: WeGridLayout[] = [];

  @ViewChild(WeGridComponent) grid!: WeGridComponent<Row>;
}

describe('WeGridComponent — header hint, column locks, bounded height, footer, keyboard', () => {
  let fixture: ComponentFixture<HeaderHostComponent>;
  let host: HeaderHostComponent;

  const q = <E extends Element = HTMLElement>(selector: string): E => fixture.nativeElement.querySelector(selector) as E;
  const headers = (): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll('th[role="columnheader"]'));
  const headerOf = (field: string): HTMLElement => headers()[host.grid.renderColumns.findIndex((c) => c.field === field)];
  const col = (field: string): WeGridInternalColumn<Row> => host.grid.internalColumns.find((c) => c.field === field)!;
  const order = (): string[] => host.grid.renderColumns.map((c) => c.field);
  const key = (target: Element, init: KeyboardEventInit): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  };
  const hintPanel = (): HTMLElement | null => document.querySelector('.cdk-overlay-container .we-grid-hint');

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [HeaderHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HeaderHostComponent);
    host = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
  });

  afterEach(() => {
    host.grid?.hideHeaderHint();
    fixture.destroy();
    fixture.nativeElement.remove();
  });

  // ─── A) header hint and header template ───────────────────────────
  it('1. headerHint renders a focusable info icon; hover and focus open an overlay hint, Esc and blur close it, a click neither sorts nor opens the menu', () => {
    fixture.detectChanges();
    const icon = headerOf('name').querySelector('.we-grid__th-hint') as HTMLElement;
    expect(icon.getAttribute('tabindex')).toBe('0');
    expect(icon.getAttribute('role')).toBe('img');
    expect(icon.getAttribute('aria-label')).toContain('Line one');

    icon.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    const panel = hintPanel()!;
    expect(panel).not.toBeNull();
    expect(document.body.contains(panel)).toBeTrue();
    expect(fixture.nativeElement.contains(panel)).toBeFalse();
    expect(panel.textContent).toContain('Line one\nLine two');
    expect(getComputedStyle(panel).whiteSpace).toBe('pre-line');
    expect(icon.getAttribute('aria-describedby')).toBe(panel.id);
    icon.dispatchEvent(new MouseEvent('mouseleave'));
    expect(hintPanel()).toBeNull();

    icon.focus();
    fixture.detectChanges();
    expect(hintPanel()).not.toBeNull();
    key(icon, { key: 'Escape' });
    expect(hintPanel()).toBeNull();
    icon.dispatchEvent(new FocusEvent('focus'));
    expect(hintPanel()).not.toBeNull();
    icon.dispatchEvent(new FocusEvent('blur'));
    expect(hintPanel()).toBeNull();

    icon.click();
    icon.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(host.grid.currentSort).toBeNull();
    expect(document.querySelector('.we-grid-menu')).toBeNull();
  });

  it('2. with headerHint the native title of headerTooltip is dropped; headerTooltip alone still works', () => {
    host.columns = host.columns.map((c) => (c.field === 'qty' ? { ...c, headerTooltip: 'qty title' } : c));
    fixture.detectChanges();
    expect(headerOf('name').hasAttribute('title')).toBeFalse();
    expect(headerOf('qty').getAttribute('title')).toBe('qty title');
    // A header without any tooltip carries no title at all (0.6 wrote title="null")
    expect(headerOf('id').hasAttribute('title')).toBeFalse();
  });

  it('3. a weGridHeader template replaces the header text; exports keep the plain header without the hint', () => {
    host.withHeaderTemplate = true;
    fixture.detectChanges();
    expect(headerOf('qty').querySelector('.custom-title')?.textContent).toBe('Qty!');
    // The sort arrow is still the grid's
    host.grid.onHeaderLabelClick(col('qty'));
    fixture.detectChanges();
    expect(headerOf('qty').querySelector('.we-grid__sort-icon')).not.toBeNull();

    const table = (host.grid as unknown as { buildExportTable: (rows: Row[]) => WeGridExportTable }).buildExportTable(host.grid.displayData);
    expect(table.columns.map((c) => c.header)).toEqual(['Id', 'Name', 'Qty', 'Note']);
  });

  it('3. headerTemplate on the column definition works like the directive', () => {
    fixture.detectChanges();
    const tpl = TestBed.createComponent(TemplateHostComponent);
    tpl.detectChanges();
    host.columns = host.columns.map((c) => (c.field === 'note' ? { ...c, headerTemplate: tpl.componentInstance.tpl } : c));
    fixture.detectChanges();
    expect(headerOf('note').querySelector('.from-def')?.textContent).toBe('Note (def)');
  });

  // ─── B) locks ─────────────────────────────────────────────────────
  function openMenuFor(field: string): string {
    host.grid.onHeaderContextMenu(new MouseEvent('contextmenu', { clientX: 10, clientY: 10 }), col(field));
    fixture.detectChanges();
    const text = document.querySelector('we-grid-header-menu')?.textContent ?? '';
    document.querySelector<HTMLElement>('.we-grid-menu-backdrop')?.click();
    return text;
  }

  it('4. lockPinned leaves the pin items out of the menu and ignores a pinned value from a saved layout', () => {
    host.columns = host.columns.map((c) => (c.field === 'id' ? { ...c, pinned: 'left', lockPinned: true } : c));
    localStorage.setItem(
      'we-grid-layout:header-layout-spec',
      JSON.stringify({ gridKey: 'header-layout-spec', version: 1, columns: [{ field: 'id', visible: true, order: 0, pinned: null }] })
    );
    fixture.detectChanges();
    expect(col('id').pinned).toBe('left');
    expect(openMenuFor('id')).not.toContain(weGridLocaleEn.pin);
    expect(openMenuFor('name')).toContain(weGridLocaleEn.pin);
  });

  it('5. lockOrder: no drag, nothing crosses it, Alt+arrows and the menu cannot move it', () => {
    host.columns = host.columns.map((c) => (c.field === 'name' ? { ...c, lockOrder: true } : c));
    fixture.detectChanges();
    expect(headerOf('name').classList.contains('cdk-drag-disabled')).toBeTrue();
    expect(headerOf('id').classList.contains('cdk-drag-disabled')).toBeFalse();

    const drag = (from: number, to: number) => {
      host.grid.onColumnDrop({ previousIndex: from, currentIndex: to } as CdkDragDrop<WeGridInternalColumn<Row>[]>);
      fixture.detectChanges();
    };
    drag(0, 2); // id would jump over the locked name
    expect(order()).toEqual(['id', 'name', 'qty', 'note']);
    drag(1, 3); // the locked column itself
    expect(order()).toEqual(['id', 'name', 'qty', 'note']);
    expect(host.grid.dropSortPredicate(1, { data: col('id') })).toBeFalse();
    drag(2, 3); // qty and note are free on their side
    expect(order()).toEqual(['id', 'name', 'note', 'qty']);

    key(headerOf('name'), { key: 'ArrowRight', altKey: true });
    expect(order()).toEqual(['id', 'name', 'note', 'qty']);
    key(headerOf('note'), { key: 'ArrowLeft', altKey: true });
    expect(order()).toEqual(['id', 'name', 'note', 'qty']);
    expect(openMenuFor('name')).not.toContain(weGridLocaleEn.moveColumnLeft);
  });

  it('5. lockOrder keeps the definition position whatever the saved layout says', () => {
    host.columns = host.columns.map((c) => (c.field === 'qty' ? { ...c, lockOrder: true } : c));
    localStorage.setItem(
      'we-grid-layout:header-layout-spec',
      JSON.stringify({
        gridKey: 'header-layout-spec',
        version: 1,
        columns: [
          { field: 'qty', visible: true, order: 0, pinned: null },
          { field: 'note', visible: true, order: 1, pinned: null },
          { field: 'name', visible: true, order: 2, pinned: null },
          { field: 'id', visible: true, order: 3, pinned: null }
        ]
      })
    );
    fixture.detectChanges();
    expect(order()).toEqual(['note', 'name', 'qty', 'id']);
  });

  it('6. fixed means all four locks; an explicit sub-flag wins', () => {
    host.columns = host.columns.map((c) =>
      c.field === 'id' ? { ...c, fixed: true } : c.field === 'note' ? { ...c, fixed: true, lockRename: false } : c
    );
    fixture.detectChanges();
    const id = col('id');
    expect([id.lockVisible, id.lockRename, id.lockPinned, id.lockOrder]).toEqual([true, true, true, true]);
    const note = col('note');
    expect([note.lockVisible, note.lockRename, note.lockPinned, note.lockOrder]).toEqual([true, false, true, true]);
    const menu = openMenuFor('note');
    expect(menu).toContain(weGridLocaleEn.rename);
    expect(menu).not.toContain(weGridLocaleEn.hideColumn);
    expect(menu).not.toContain(weGridLocaleEn.pin);
  });

  // ─── C) bounded height ────────────────────────────────────────────
  it('7. maxHeight scrolls inside the grid with the header, the filter row and the summary row stuck in place', () => {
    host.maxHeight = 200;
    host.minHeight = '120px';
    host.filterRow = true;
    fixture.detectChanges();
    host.grid.filterRowVisible = true;
    host.grid.refreshRows();
    fixture.detectChanges();

    const scroll = q('.we-grid__scroll');
    expect(getComputedStyle(scroll).overflowY).toBe('auto');
    expect(scroll.style.maxHeight).toBe('200px');
    expect(scroll.style.minHeight).toBe('120px');
    expect(scroll.clientHeight).toBeLessThanOrEqual(200);

    scroll.scrollTop = 300;
    const th = headers()[0];
    expect(Math.round(th.getBoundingClientRect().top)).toBe(Math.round(scroll.getBoundingClientRect().top));
    const filterCell = q('.we-grid__filter-row th');
    expect(getComputedStyle(filterCell).position).toBe('sticky');
    const offset = parseFloat(getComputedStyle(filterCell).top);
    expect(offset).toBeGreaterThan(0);
    expect(Math.round(filterCell.getBoundingClientRect().top)).toBe(Math.round(scroll.getBoundingClientRect().top + offset));

    const summaryCell = q('.we-grid__summary-row td');
    expect(getComputedStyle(summaryCell).position).toBe('sticky');
    expect(getComputedStyle(summaryCell).bottom).toBe('0px');
    expect(Math.round(summaryCell.getBoundingClientRect().bottom)).toBeLessThanOrEqual(Math.round(scroll.getBoundingClientRect().bottom));
  });

  it('8. without maxHeight the scroll area is unbounded and carries no new class or style', () => {
    fixture.detectChanges();
    const scroll = q('.we-grid__scroll');
    expect(scroll.classList.contains('we-grid__scroll--bounded')).toBeFalse();
    expect(scroll.getAttribute('style')).toBeNull();
    expect(getComputedStyle(q('.we-grid__summary-row td')).position).not.toBe('sticky');
  });

  // ─── D) footer ────────────────────────────────────────────────────
  it("9. footer 'count' keeps the record count without a pager, 'none' drops the footer, 'full' is unchanged", () => {
    fixture.detectChanges();
    expect(q('.we-grid__pager')).not.toBeNull();
    expect(q('.we-grid__footer-info').textContent).toContain(weGridLocaleEn.pageOf(1, 2));

    host.footer = 'count';
    fixture.detectChanges();
    expect(q('.we-grid__pager')).toBeNull();
    expect(q('.we-grid__footer-info').textContent!.trim()).toBe(`40 ${weGridLocaleEn.recordsLabel}`);

    host.footer = 'none';
    fixture.detectChanges();
    expect(q('.we-grid__footer')).toBeNull();
  });

  it('9. a hidden pager on a serverSide grid warns once in dev mode', () => {
    const warn = spyOn(console, 'warn');
    host.serverSide = true;
    host.footer = 'count';
    fixture.detectChanges();
    host.footer = 'none';
    fixture.detectChanges();
    expect(warn.calls.allArgs().filter((a) => String(a[0]).includes('footer=')).length).toBe(1);
  });

  // ─── E) keyboard ──────────────────────────────────────────────────
  it('10. Alt+arrows move the focused header within its group, Alt+Shift to the end, announced and saved once', fakeAsync(() => {
    host.columns = host.columns.map((c) => (c.field === 'note' ? { ...c, pinned: 'right' } : c));
    fixture.detectChanges();
    tick(600);
    host.layouts = [];

    key(headerOf('id'), { key: 'ArrowRight', altKey: true });
    expect(order()).toEqual(['name', 'id', 'qty', 'note']);
    tick(60);
    fixture.detectChanges();
    expect(q('[aria-live="polite"]').textContent).toBe(weGridLocaleEn.columnMoved('Id', 2));

    key(headerOf('id'), { key: 'ArrowRight', altKey: true, shiftKey: true });
    // note is pinned right — a different group, so qty is the last place id can reach
    expect(order()).toEqual(['name', 'qty', 'id', 'note']);
    key(headerOf('id'), { key: 'ArrowLeft', altKey: true, shiftKey: true });
    expect(order()).toEqual(['id', 'name', 'qty', 'note']);
    // At the edge nothing moves and nothing is announced
    key(headerOf('id'), { key: 'ArrowLeft', altKey: true });
    expect(order()).toEqual(['id', 'name', 'qty', 'note']);

    // Not on the header itself (a control inside it) — the browser keeps Alt+arrow
    const inside = key(headerOf('name').querySelector('.we-grid__th-menu-btn')!, { key: 'ArrowRight', altKey: true });
    expect(inside.defaultPrevented).toBeFalse();

    tick(600);
    expect(host.layouts.length).toBe(1);
    expect(host.layouts[0].columns.find((c) => c.field === 'id')?.order).toBe(0);
  }));

  it('10. in a right-to-left layout the arrows follow the visual direction', () => {
    fixture.nativeElement.style.direction = 'rtl';
    fixture.detectChanges();
    key(headerOf('name'), { key: 'ArrowLeft', altKey: true });
    expect(order()).toEqual(['id', 'qty', 'name', 'note']);
  });

  it('10. the header menu offers Move left / Move right', () => {
    fixture.detectChanges();
    host.grid.onHeaderContextMenu(new MouseEvent('contextmenu'), col('qty'));
    fixture.detectChanges();
    const items = Array.from(document.querySelectorAll<HTMLButtonElement>('we-grid-header-menu .we-grid-menu__item'));
    items.find((b) => b.textContent!.includes(weGridLocaleEn.moveColumnLeft))!.click();
    fixture.detectChanges();
    expect(order()).toEqual(['id', 'qty', 'name', 'note']);
  });

  it('11. the resize handle: arrows ±8px, Shift ±32px, Home to minWidth, Enter fits, Esc returns focus', () => {
    host.columns = host.columns.map((c) => (c.field === 'qty' ? { ...c, minWidth: 50 } : c));
    fixture.detectChanges();
    const handle = headerOf('qty').querySelector('.we-grid__resize-handle') as HTMLElement;
    expect(handle.getAttribute('role')).toBe('separator');
    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle.getAttribute('tabindex')).toBe('0');
    expect(handle.getAttribute('aria-label')).toBe(weGridLocaleEn.columnResizeAria('Qty'));

    key(handle, { key: 'ArrowRight' });
    expect(col('qty').width).toBe(98);
    key(handle, { key: 'ArrowLeft', shiftKey: true });
    expect(col('qty').width).toBe(66);
    key(handle, { key: 'Home' });
    expect(col('qty').width).toBe(50);
    key(handle, { key: 'ArrowLeft' });
    expect(col('qty').width).toBe(50);
    key(handle, { key: 'Enter' });
    expect(col('qty').width).toBeGreaterThan(50);

    handle.focus();
    key(handle, { key: 'Escape' });
    expect(document.activeElement).toBe(headerOf('qty'));
  });
});

@Component({
  standalone: true,
  template: `<ng-template #tpl let-title="title"><span class="from-def">{{ title }} (def)</span></ng-template>`
})
class TemplateHostComponent {
  @ViewChild('tpl', { static: true }) tpl!: import('@angular/core').TemplateRef<import('./models/we-grid-column.model').WeGridHeaderContext<Row>>;
}

describe('WeGridLocale — every key in both languages', () => {
  it('13. English and Turkish have the same keys, none empty', () => {
    // intlCurrency / intlTimeZone are optional formatting settings, not UI text
    const optional = new Set(['intlCurrency', 'intlTimeZone']);
    const en = Object.keys(weGridLocaleEn).filter((k) => !optional.has(k)).sort();
    const tr = Object.keys(weGridLocaleTr).filter((k) => !optional.has(k)).sort();
    expect(tr).toEqual(en);
    for (const locale of [weGridLocaleEn, weGridLocaleTr]) {
      for (const [name, value] of Object.entries(locale)) {
        if (optional.has(name)) continue;
        const text = typeof value === 'function' ? (value as (...args: unknown[]) => string)('X', 2) : value;
        expect(String(text).trim()).withContext(name).not.toBe('');
      }
    }
  });
});
