import { Component, ViewChild } from '@angular/core';
import { OverlayRef } from '@angular/cdk/overlay';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WeGridComponent } from './we-grid.component';
import { WeGridEmptyDirective } from './directives/we-grid-empty.directive';
import { WeGridColumnDef } from './models/we-grid-column.model';
import { weGridLocaleEn } from './models/we-grid-locale.model';

interface Row {
  id: string;
  name: string;
}

@Component({
  standalone: true,
  imports: [WeGridComponent, WeGridEmptyDirective],
  template: `
    <button type="button" class="outside-anchor" [style.margin-left.px]="anchorOffset">Columns</button>
    <we-grid
      gridKey="shell-spec"
      [columns]="columns"
      [data]="data"
      trackByField="id"
      [loading]="loading"
      [filterRow]="filterRow"
      [exportFormats]="exportFormats"
      [importFormats]="importFormats"
      [toolbar]="toolbar"
      [headerMenuButton]="headerMenuButton"
      [rowStateVersion]="version"
    >
      @if (withEmptyTemplate) {
        <ng-template weGridEmpty let-ctx let-message="message">
          <p class="custom-empty" [attr.data-filters]="ctx.hasActiveFilters">{{ message }} · {{ outsideLabel }}</p>
          <button type="button" class="custom-clear" (click)="outsideCleared = true; ctx.clearAllFilters()">Clear</button>
        </ng-template>
      }
    </we-grid>
    <we-grid gridKey="shell-spec-2" [columns]="columns" [data]="data" trackByField="id" />
  `
})
class ShellHostComponent {
  columns: WeGridColumnDef<Row>[] = [
    { field: 'id', header: 'Id', width: 80 },
    { field: 'name', header: 'Name', width: 150, headerFilterMode: 'operator' }
  ];
  data: Row[] = [
    { id: 'a', name: 'Alpha' },
    { id: 'b', name: 'Beta' }
  ];
  loading = false;
  filterRow = false;
  exportFormats: ('csv' | 'xlsx' | 'pdf')[] = [];
  importFormats: ('csv' | 'xlsx')[] = [];
  toolbar: 'auto' | 'none' = 'auto';
  headerMenuButton: 'always' | 'hover' = 'always';
  version = 0;
  withEmptyTemplate = false;
  outsideLabel = 'outside';
  outsideCleared = false;
  anchorOffset = 0;

  @ViewChild(WeGridComponent) grid!: WeGridComponent<Row>;
}

describe('WeGridComponent — toolbar, header menu button and empty template', () => {
  let fixture: ComponentFixture<ShellHostComponent>;
  let host: ShellHostComponent;
  const render = () => fixture.detectChanges();
  const el = (): HTMLElement => fixture.nativeElement.querySelector('we-grid');
  const menus = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('we-grid-header-menu .we-grid-menu'));
  const menuPane = (): HTMLElement => document.querySelector<HTMLElement>('.cdk-overlay-pane.we-grid-menu-panel')!;
  // The overlay applies its position once the zone settles, which a spec never waits for — apply it now
  const openMenu = (grid: WeGridComponent<Row>, anchor?: HTMLElement, fromToolbar = false) => {
    if (fromToolbar) grid.openColumnsMenuFromToolbar();
    else grid.openColumnsMenu(anchor);
    (grid as unknown as { overlayRef: OverlayRef | null }).overlayRef?.updatePosition();
  };
  const pressEscape = () => menus()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  // Karma doesn't load @angular/cdk/overlay-prebuilt.css — just enough of it for positions to mean something
  let overlayCss: HTMLStyleElement;
  beforeAll(() => {
    overlayCss = document.createElement('style');
    overlayCss.textContent =
      '.cdk-overlay-container{position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1000}' +
      '.cdk-overlay-connected-position-bounding-box{position:absolute;display:flex;flex-direction:column}' +
      '.cdk-overlay-pane{position:absolute;pointer-events:auto;display:flex;max-width:100%;max-height:100%}' +
      '.cdk-overlay-backdrop{position:absolute;inset:0;pointer-events:auto}';
    document.head.appendChild(overlayCss);
  });
  afterAll(() => overlayCss.remove());

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [ShellHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(ShellHostComponent);
    host = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
  });

  afterEach(() => {
    fixture.destroy();
    fixture.nativeElement.remove();
  });

  describe('toolbar', () => {
    it("'none' leaves no toolbar in the DOM, even with filterRow and export formats on", () => {
      spyOn(console, 'warn');
      host.filterRow = true;
      host.exportFormats = ['csv'];
      host.toolbar = 'none';
      render();
      expect(el().querySelector('.we-grid__toolbar')).toBeNull();
      expect(el().querySelector('.we-grid__gear-btn')).toBeNull();
      expect(console.warn).toHaveBeenCalledTimes(1);
      expect((console.warn as jasmine.Spy).calls.argsFor(0)[0]).toContain('filterRow, exportFormats');
    });

    it("'none' keeps the import file input, so openImportPicker still works", () => {
      spyOn(console, 'warn');
      host.importFormats = ['csv'];
      host.toolbar = 'none';
      render();
      const input = el().querySelector('input.we-grid__file-input') as HTMLInputElement;
      expect(input).not.toBeNull();
      const click = spyOn(input, 'click');
      host.grid.openImportPicker();
      expect(click).toHaveBeenCalled();
    });

    it("'auto' keeps the toolbar and its Columns button", () => {
      render();
      expect(el().querySelector('.we-grid__toolbar .we-grid__gear-btn')).not.toBeNull();
    });

    it('toggleFilterRow opens and closes the filter row without a toolbar', () => {
      host.filterRow = true;
      host.toolbar = 'none';
      spyOn(console, 'warn');
      render();
      host.grid.toggleFilterRow(true);
      render();
      expect(host.grid.filterRowVisible).toBeTrue();
      host.grid.toggleFilterRow(true);
      expect(host.grid.filterRowVisible).toBeTrue();
      host.grid.toggleFilterRow();
      expect(host.grid.filterRowVisible).toBeFalse();
    });
  });

  describe('openColumnsMenu', () => {
    it('opens the toolbar menu under the given anchor and gives focus back to it on close', () => {
      host.toolbar = 'none';
      render();
      const anchor = fixture.nativeElement.querySelector('.outside-anchor') as HTMLElement;
      openMenu(host.grid, anchor);
      render();
      expect(menus().length).toBe(1);
      // The columns menu, not a column's — no "Hide column"
      expect(menus()[0].textContent).not.toContain(weGridLocaleEn.hideColumn);
      expect(menus()[0].textContent).toContain(weGridLocaleEn.showAllColumns);
      const a = anchor.getBoundingClientRect();
      const pane = menuPane().getBoundingClientRect();
      expect(Math.round(pane.top)).toBeGreaterThanOrEqual(Math.round(a.bottom));
      expect(Math.abs(pane.left - a.left)).toBeLessThan(1);
      pressEscape();
      render();
      expect(menus().length).toBe(0);
      expect(document.activeElement).toBe(anchor);
    });

    it('flips or pushes the menu back into view when the anchor sits at the right edge of the viewport', () => {
      host.anchorOffset = window.innerWidth - 90;
      render();
      const anchor = fixture.nativeElement.querySelector('.outside-anchor') as HTMLElement;
      openMenu(host.grid, anchor);
      render();
      const pane = menuPane().getBoundingClientRect();
      expect(pane.right).toBeLessThanOrEqual(window.innerWidth);
      // Not start-aligned any more: the menu opens towards the left of the anchor
      expect(pane.left).toBeLessThan(anchor.getBoundingClientRect().left);
    });

    it('without an anchor uses the Columns button — openColumnsMenuFromToolbar does the same', () => {
      render();
      const gear = el().querySelector('.we-grid__gear-btn') as HTMLElement;
      openMenu(host.grid, undefined, true);
      render();
      const pane = menuPane().getBoundingClientRect();
      const g = gear.getBoundingClientRect();
      // Start- or end-aligned to the button, whichever fits
      expect(Math.abs(pane.left - g.left) < 1 || Math.abs(pane.right - g.right) < 1).toBeTrue();
      expect(Math.round(pane.top)).toBeGreaterThanOrEqual(Math.round(g.bottom));
      pressEscape();
      expect(document.activeElement).toBe(gear);
    });

    it("with toolbar='none' and no anchor opens at the grid's top corner", () => {
      host.toolbar = 'none';
      render();
      openMenu(host.grid);
      render();
      const grid = el().getBoundingClientRect();
      const pane = menuPane().getBoundingClientRect();
      expect(Math.abs(pane.left - grid.left)).toBeLessThan(1);
      expect(Math.abs(pane.top - grid.top)).toBeLessThan(6);
    });

    it("closes another grid's open menu, and its own when the toolbar input changes", () => {
      render();
      const grids = fixture.debugElement.queryAll((d) => d.componentInstance instanceof WeGridComponent).map((d) => d.componentInstance as WeGridComponent<Row>);
      openMenu(grids[1]);
      render();
      openMenu(host.grid);
      render();
      expect(menus().length).toBe(1);
      host.toolbar = 'none';
      render();
      expect(menus().length).toBe(0);
    });
  });

  describe('headerMenuButton', () => {
    const menuBtn = (): HTMLElement => el().querySelector('.we-grid__th-menu-btn')!;
    const opacity = (e: HTMLElement): number => Number(getComputedStyle(e).opacity);
    const canHover = (): boolean => window.matchMedia('(hover: hover)').matches;

    it("'always' adds no class and keeps the faint button", () => {
      render();
      expect(el().querySelector('.we-grid--th-menu-hover')).toBeNull();
      expect(opacity(menuBtn())).toBe(0.5);
    });

    it("'hover' hides the button with opacity only, keeps its place and shows it while focus is inside the header", () => {
      render();
      const width = menuBtn().getBoundingClientRect().width;
      host.headerMenuButton = 'hover';
      render();
      expect(el().querySelector('.we-grid--th-menu-hover')).not.toBeNull();
      expect(getComputedStyle(menuBtn()).display).not.toBe('none');
      expect(menuBtn().getBoundingClientRect().width).toBe(width);
      if (!canHover()) {
        // A device that can't hover keeps the default look
        expect(opacity(menuBtn())).toBe(0.5);
        return;
      }
      expect(opacity(menuBtn())).toBe(0);
      const th = menuBtn().closest('th') as HTMLElement;
      th.focus();
      expect(document.activeElement).toBe(th);
      expect(opacity(menuBtn())).toBe(0.5);
      menuBtn().focus();
      expect(document.activeElement).toBe(menuBtn());
      expect(opacity(menuBtn())).toBeGreaterThanOrEqual(0.5);
    });
  });

  describe('weGridEmpty', () => {
    const emptyCell = (): HTMLElement | null => el().querySelector('td.we-grid__empty');

    it('replaces the default empty content inside a role="status" wrapper', () => {
      host.withEmptyTemplate = true;
      host.data = [];
      render();
      const cell = emptyCell()!;
      expect(cell.querySelector('[role="status"] .custom-empty')!.textContent).toContain(weGridLocaleEn.emptyMessage);
      expect(cell.querySelector('.we-grid__empty-clear-btn')).toBeNull();
      expect(cell.querySelector('p.mt-2')).toBeNull();
    });

    it('is not drawn while loading', () => {
      host.withEmptyTemplate = true;
      host.data = [];
      host.loading = true;
      render();
      expect(el().querySelector('.custom-empty')).toBeNull();
    });

    it('without a template the default empty state is unchanged', () => {
      host.data = [];
      render();
      expect(emptyCell()!.querySelector('[role="status"]')).toBeNull();
      expect(emptyCell()!.textContent).toContain(weGridLocaleEn.emptyMessage);
    });

    it("ctx.clearAllFilters clears the grid's own filters; the message follows them", () => {
      host.withEmptyTemplate = true;
      render();
      const name = host.grid.internalColumns.find((c) => c.field === 'name')!;
      host.grid.setFilterValue(name, 'zzz');
      render();
      expect(el().querySelector('.custom-empty')!.getAttribute('data-filters')).toBe('true');
      expect(el().querySelector('.custom-empty')!.textContent).toContain(weGridLocaleEn.noRecordsMatchFilter);
      (el().querySelector('.custom-clear') as HTMLElement).click();
      render();
      expect(host.outsideCleared).toBeTrue();
      expect(host.grid.hasActiveFilters).toBeFalse();
      expect(el().querySelectorAll('tbody tr.we-grid__row').length).toBe(2);
    });

    it('refreshes with rowStateVersion under OnPush', () => {
      host.withEmptyTemplate = true;
      host.data = [];
      render();
      host.outsideLabel = 'changed';
      host.version++;
      render();
      expect(el().querySelector('.custom-empty')!.textContent).toContain('changed');
    });
  });
});
