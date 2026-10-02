import { Component, Input, OnDestroy, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WeGridComponent } from './we-grid.component';
import { WeGridCellDirective } from './directives/we-grid-cell.directive';
import { WeGridRowDetailDirective } from './directives/we-grid-row-detail.directive';
import { WeGridColumnDef } from './models/we-grid-column.model';
import { WeGridDetailToggleEvent } from './models/we-grid-row-detail.model';
import { WE_GRID_LOCALE, weGridLocaleEn, weGridLocaleTr } from './models/we-grid-locale.model';

interface Row {
  id: string;
  name: string;
  open: boolean;
  children?: Row[];
}

/** Counts its instances — tells a freshly created detail from a re-shown one */
@Component({ selector: 'detail-probe', standalone: true, template: `<span class="probe">{{ row.id }}</span>` })
class DetailProbeComponent implements OnDestroy {
  static created = 0;
  static destroyed = 0;
  @Input() row!: Row;
  constructor() {
    DetailProbeComponent.created++;
  }
  ngOnDestroy(): void {
    DetailProbeComponent.destroyed++;
  }
}

@Component({
  standalone: true,
  imports: [WeGridComponent, WeGridRowDetailDirective, WeGridCellDirective, DetailProbeComponent],
  template: `
    <div class="frame" [style.width.px]="frameWidth">
      <we-grid
        #grid
        gridKey="detail-spec"
        [columns]="columns"
        [data]="data"
        trackByField="id"
        [expandable]="true"
        [selectable]="selectable"
        [page]="page"
        [detailTrigger]="detailTrigger"
        [detailSticky]="detailSticky"
        [detailMaxWidth]="detailMaxWidth"
        [canExpandRow]="canExpandRow"
        [detailMount]="detailMount"
        [treeChildren]="treeChildren"
        [rowStateVersion]="version"
        (detailToggle)="toggles.push($event)"
      >
        <ng-template weGridRowDetail let-row let-close="close">
          <detail-probe [row]="row" />
          <input class="detail-input" />
          <button type="button" class="hide" (click)="close()">hide</button>
          <div class="wide" [style.width.px]="wide">wide</div>
        </ng-template>
        <ng-template weGridCell="name" let-row>
          <button type="button" class="open-btn" [attr.aria-controls]="grid.detailId(row)" (click)="grid.toggleRowDetail(row)">{{ row.name }}</button>
        </ng-template>
      </we-grid>
    </div>
  `
})
class DetailHostComponent {
  columns: WeGridColumnDef<Row>[] = Array.from({ length: 12 }, (_, i) =>
    i === 0 ? { field: 'id', header: 'Id', width: 100 } : i === 1 ? { field: 'name', header: 'Name', width: 160 } : { field: `c${i}`, header: `Column ${i}`, width: 150 }
  );
  data: Row[] = [
    { id: 'A', name: 'Alpha', open: true },
    { id: 'B', name: 'Beta', open: false },
    { id: 'C', name: 'Gamma', open: true }
  ];
  frameWidth = 700;
  wide = 100;
  selectable: 'none' | 'multi' = 'none';
  page = 1;
  detailTrigger: 'column' | 'none' = 'column';
  detailSticky = false;
  detailMaxWidth?: number | string;
  canExpandRow?: (row: Row) => boolean;
  detailMount: 'once' | 'whileOpen' = 'once';
  treeChildren?: (row: Row) => Row[] | undefined;
  version = 0;
  toggles: WeGridDetailToggleEvent<Row>[] = [];

  @ViewChild(WeGridComponent) grid!: WeGridComponent<Row>;
}

describe('WeGridComponent — full-width detail rows', () => {
  let fixture: ComponentFixture<DetailHostComponent>;
  let host: DetailHostComponent;

  const q = <E extends Element = HTMLElement>(selector: string): E => fixture.nativeElement.querySelector(selector) as E;
  const qa = (selector: string): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll(selector));
  const row = (id: string): Row => {
    const all = (list: Row[]): Row[] => list.flatMap((r) => [r, ...all(r.children ?? [])]);
    return all(host.data).find((r) => r.id === id)!;
  };
  const render = () => fixture.detectChanges();
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));

  beforeEach(async () => {
    localStorage.clear();
    DetailProbeComponent.created = 0;
    DetailProbeComponent.destroyed = 0;
    await TestBed.configureTestingModule({ imports: [DetailHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(DetailHostComponent);
    host = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
  });

  afterEach(() => {
    fixture.destroy();
    fixture.nativeElement.remove();
  });

  it('1. with the default inputs the detail markup is unchanged — no region wrapper, no aria-controls', () => {
    render();
    host.grid.toggleRowExpand(row('B'));
    render();
    const detail = q('.we-grid__detail-row');
    expect(detail.querySelector('.we-grid__detail-region')).toBeNull();
    expect(detail.classList.contains('we-grid__detail-row--sticky')).toBeFalse();
    expect((detail.firstElementChild as HTMLElement).firstElementChild!.tagName.toLowerCase()).toBe('detail-probe');
    expect(q('.we-grid__expand-btn').hasAttribute('aria-controls')).toBeFalse();
  });

  it("2. detailTrigger 'none': no arrow column, colspan without it, the API opens and closes with source 'api'", () => {
    host.detailTrigger = 'none';
    host.selectable = 'multi';
    render();
    expect(qa('.we-grid__expand-col').length).toBe(0);
    expect(host.grid.expandColWidthPx).toBe(0);
    expect(host.grid.totalColSpan).toBe(12 + 1);

    host.grid.openRowDetail(row('A'));
    render();
    expect(host.grid.isRowDetailOpen(row('A'))).toBeTrue();
    expect((q('.we-grid__detail-row td') as HTMLTableCellElement).colSpan).toBe(13);
    host.grid.toggleRowDetail(row('A'));
    host.grid.toggleRowDetail(row('B'), true);
    host.grid.closeRowDetail(row('B'));
    render();
    expect(host.toggles.map((t) => [t.row.id, t.open, t.source])).toEqual([
      ['A', true, 'api'],
      ['A', false, 'api'],
      ['B', true, 'api'],
      ['B', false, 'api']
    ]);
  });

  it('3. canExpandRow: false rows get no arrow and cannot open; a row that turns false closes its open detail', () => {
    host.canExpandRow = (r) => r.open;
    render();
    const buttons = qa('tbody tr.we-grid__row').map((tr) => !!tr.querySelector('.we-grid__expand-btn'));
    expect(buttons).toEqual([true, false, true]);
    host.grid.toggleRowDetail(row('B'));
    render();
    expect(host.grid.isRowDetailOpen(row('B'))).toBeFalse();

    host.grid.openRowDetail(row('C'));
    render();
    host.toggles = [];
    row('C').open = false;
    host.version++;
    render();
    expect(host.grid.isRowDetailOpen(row('C'))).toBeFalse();
    expect(host.toggles).toEqual([{ row: row('C'), open: false, source: 'api' }]);
  });

  it('4. in a tree: parent → detail → children; the detail shows with the children collapsed; no detail for rows canExpandRow refuses', () => {
    host.data = [
      { id: 'P', name: 'Parent', open: true, children: [{ id: 'K1', name: 'Kid 1', open: false }, { id: 'K2', name: 'Kid 2', open: false }] },
      { id: 'Q', name: 'Other', open: true }
    ];
    host.treeChildren = (r) => r.children;
    host.canExpandRow = (r) => r.open;
    host.detailTrigger = 'none';
    render();
    host.grid.openRowDetail(row('P'));
    render();
    const order = () =>
      qa('tbody > tr').map((tr) => (tr.classList.contains('we-grid__detail-row') ? 'detail' : tr.getAttribute('data-we-grid-row-key')));
    expect(order()).toEqual(['P', 'detail', 'Q']);
    host.grid.toggleTreeNode(row('P'), true);
    render();
    expect(order()).toEqual(['P', 'detail', 'K1', 'K2', 'Q']);
    host.grid.openRowDetail(row('K1'));
    render();
    expect(order()).toEqual(['P', 'detail', 'K1', 'K2', 'Q']);
  });

  it('5. detailSticky: a sticky wrapper sized from --we-grid-viewport-width, which follows the scroll area; detailMaxWidth caps it', async () => {
    host.detailSticky = true;
    render();
    host.grid.toggleRowExpand(row('A'));
    render();
    await frame();
    const scroll = q('.we-grid__scroll');
    const wrapper = q('.we-grid__detail-sticky');
    expect(getComputedStyle(wrapper).position).toBe('sticky');
    expect(getComputedStyle(wrapper).left).toBe('0px');
    expect(scroll.style.getPropertyValue('--we-grid-viewport-width')).toBe(`${scroll.clientWidth}px`);
    expect(Math.round(wrapper.getBoundingClientRect().width)).toBe(scroll.clientWidth);

    host.frameWidth = 500;
    render();
    await frame();
    expect(scroll.style.getPropertyValue('--we-grid-viewport-width')).toBe(`${scroll.clientWidth}px`);
    expect(Math.round(wrapper.getBoundingClientRect().width)).toBe(scroll.clientWidth);

    host.detailMaxWidth = 300;
    render();
    expect(Math.round(wrapper.getBoundingClientRect().width)).toBe(300);
    host.detailMaxWidth = 'min(200px, 90vw)';
    render();
    expect(Math.round(wrapper.getBoundingClientRect().width)).toBe(200);
  });

  it('6. scrolled sideways, the sticky detail stays at the left edge while the cells move', async () => {
    host.detailSticky = true;
    render();
    host.grid.toggleRowExpand(row('A'));
    render();
    await frame();
    const scroll = q('.we-grid__scroll');
    const cell = qa('tbody tr.we-grid__row')[0].querySelectorAll('td')[3] as HTMLElement;
    const cellBefore = cell.getBoundingClientRect().left;
    scroll.scrollLeft = 400;
    const wrapper = q('.we-grid__detail-sticky');
    expect(Math.round(wrapper.getBoundingClientRect().left)).toBe(Math.round(scroll.getBoundingClientRect().left));
    expect(Math.round(cellBefore - cell.getBoundingClientRect().left)).toBe(400);
  });

  it('7. an open detail never widens the table, even with 2000px of content', async () => {
    host.detailSticky = true;
    render();
    const table = q('table');
    const before = table.offsetWidth;
    host.wide = 2000;
    host.grid.toggleRowExpand(row('A'));
    render();
    await frame();
    expect(table.offsetWidth).toBe(before);
    host.grid.toggleRowExpand(row('A'));
    render();
    expect(table.offsetWidth).toBe(before);
  });

  it("8. detailMount 'whileOpen' removes the content on close and creates it fresh on open; 'once' only hides it", () => {
    host.detailMount = 'whileOpen';
    render();
    host.grid.openRowDetail(row('A'));
    render();
    expect(DetailProbeComponent.created).toBe(1);
    host.grid.closeRowDetail(row('A'));
    render();
    expect(q('.we-grid__detail-row')).toBeNull();
    expect(DetailProbeComponent.destroyed).toBe(1);
    host.grid.openRowDetail(row('A'));
    render();
    expect(DetailProbeComponent.created).toBe(2);
    // close() from inside the template
    (q('.we-grid__detail-row .hide') as HTMLElement).click();
    render();
    expect(q('.we-grid__detail-row')).toBeNull();

    host.detailMount = 'once';
    render();
    host.grid.openRowDetail(row('B'));
    render();
    host.grid.closeRowDetail(row('B'));
    render();
    expect((q('.we-grid__detail-row') as HTMLElement).hidden).toBeTrue();
  });

  it('9. a new data array with the same keys keeps the open detail, its DOM and the focus inside it', () => {
    render();
    host.grid.openRowDetail(row('B'));
    render();
    const input = q<HTMLInputElement>('.detail-input');
    input.focus();
    host.data = host.data.map((r) => ({ ...r }));
    render();
    expect(q('.detail-input')).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(host.grid.isRowDetailOpen(row('B'))).toBeTrue();
  });

  it('10. a page change closes every detail', () => {
    render();
    host.grid.openRowDetail(row('A'));
    render();
    host.page = 2;
    render();
    expect(host.grid.isRowDetailOpen(row('A'))).toBeFalse();
  });

  it('11. a11y: the region has role, id and a localized name; the arrow points at it with aria-controls', () => {
    host.detailSticky = true;
    render();
    host.grid.toggleRowExpand(row('A'), new MouseEvent('click'));
    render();
    const region = q('.we-grid__detail-region');
    expect(region.getAttribute('role')).toBe('region');
    expect(region.id).toBe('we-grid-detail-A');
    expect(region.getAttribute('aria-label')).toBe(weGridLocaleEn.detailRegionLabel('A'));
    expect(q('.we-grid__expand-btn').getAttribute('aria-controls')).toBe('we-grid-detail-A');
    expect(host.toggles[0].source).toBe('user');
  });

  it('12. one ResizeObserver for the grid however many details are open, disconnected on destroy', () => {
    const Original = window.ResizeObserver;
    let instances = 0;
    let disconnects = 0;
    class CountingObserver extends Original {
      constructor(callback: ResizeObserverCallback) {
        super(callback);
        instances++;
      }
      override disconnect(): void {
        disconnects++;
        super.disconnect();
      }
    }
    (window as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = CountingObserver;
    try {
      host.detailSticky = true;
      host.data = Array.from({ length: 50 }, (_, i) => ({ id: `R${i}`, name: `Row ${i}`, open: true }));
      render();
      host.data.forEach((r) => host.grid.openRowDetail(r));
      render();
      expect(qa('.we-grid__detail-sticky').length).toBe(50);
      expect(instances).toBe(1);
      fixture.destroy();
      expect(disconnects).toBe(1);
    } finally {
      (window as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = Original;
    }
  });

  it('13. print drops the sticky positioning; the offset is logical, so right-to-left sticks to the right edge', async () => {
    const printRule = Array.from(document.styleSheets)
      .flatMap((sheet) => Array.from(sheet.cssRules))
      .find((rule) => rule instanceof CSSMediaRule && rule.conditionText === 'print' && rule.cssText.includes('we-grid__detail-sticky')) as CSSMediaRule | undefined;
    expect(printRule).toBeDefined();
    expect(printRule!.cssText).toContain('position: static');

    host.detailSticky = true;
    fixture.nativeElement.querySelector('.frame').setAttribute('dir', 'rtl');
    render();
    host.grid.toggleRowExpand(row('A'));
    render();
    await frame();
    const wrapper = q('.we-grid__detail-sticky');
    const scroll = q('.we-grid__scroll');
    expect(getComputedStyle(wrapper).right).toBe('0px');
    expect(Math.round(wrapper.getBoundingClientRect().right)).toBe(Math.round(scroll.getBoundingClientRect().left + scroll.clientWidth));
  });

  it('14. a button of the consumer opens the detail and points at it through detailId', () => {
    host.detailTrigger = 'none';
    render();
    const button = qa('.open-btn')[1];
    expect(button.getAttribute('aria-controls')).toBe(host.grid.detailId(row('B')));
    button.click();
    render();
    expect(q(`#${host.grid.detailId(row('B'))}`)).not.toBeNull();
  });
});

describe('WeGridComponent — detail rows in Turkish', () => {
  it('11. the region name comes from the Turkish locale', async () => {
    await TestBed.configureTestingModule({
      imports: [DetailHostComponent],
      providers: [{ provide: WE_GRID_LOCALE, useValue: weGridLocaleTr }]
    }).compileComponents();
    const fixture = TestBed.createComponent(DetailHostComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.componentInstance.detailTrigger = 'none';
    fixture.detectChanges();
    fixture.componentInstance.grid.openRowDetail(fixture.componentInstance.data[0]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.we-grid__detail-region').getAttribute('aria-label')).toBe(weGridLocaleTr.detailRegionLabel('A'));
    fixture.destroy();
    fixture.nativeElement.remove();
  });
});
