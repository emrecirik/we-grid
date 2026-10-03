import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WeGridComponent } from './we-grid.component';
import { WeGridCellDirective } from './directives/we-grid-cell.directive';
import { WeGridColumnDef } from './models/we-grid-column.model';
import { WeGridRowClickEvent } from './models/we-grid-events.model';
import { WE_GRID_EXPORTER, WeGridExportTable } from './models/we-grid-export.model';
import { WE_GRID_LOCALE, weGridLocaleEn, weGridLocaleTr } from './models/we-grid-locale.model';
import { WeGridTreeExpandEvent, WeGridTreeInfo } from './models/we-grid-tree.model';

interface Node {
  key: string;
  kind: 'parent' | 'child';
  product: string;
  supplier?: string;
  qty: number;
  price?: number;
  children?: Node[];
}

function sampleData(): Node[] {
  return [
    {
      key: 'P1',
      kind: 'parent',
      product: 'Bike',
      qty: 10,
      children: [
        { key: 'C1', kind: 'child', product: 'Bike', supplier: 'Acme', qty: 1, price: 100 },
        { key: 'C2', kind: 'child', product: 'Bike', supplier: 'Beta', qty: 3, price: 90 }
      ]
    },
    {
      key: 'P2',
      kind: 'parent',
      product: 'Helmet',
      qty: 5,
      children: [{ key: 'C3', kind: 'child', product: 'Helmet', supplier: 'Acme', qty: 2, price: 20 }]
    },
    { key: 'P3', kind: 'parent', product: 'Lamp', qty: 2 }
  ];
}

@Component({
  standalone: true,
  imports: [WeGridComponent, WeGridCellDirective],
  template: `
    <we-grid
      [gridKey]="gridKey"
      [columns]="columns"
      [data]="data"
      [trackByField]="trackBy"
      [treeChildren]="treeChildren"
      [treeColumn]="treeColumn"
      [treeDefaultExpanded]="treeDefaultExpanded"
      [treeRetainState]="treeRetainState"
      [treeStateRetainLimit]="retainLimit"
      [treeSummaryLevel]="treeSummaryLevel"
      [grouping]="grouping"
      [serverSide]="serverSide"
      [totalCount]="totalCount"
      [page]="page"
      [selectable]="selectable"
      [rowClass]="rowClass"
      [exportFormats]="['csv']"
      (rowClick)="clicks.push($event)"
      (treeExpandChange)="expandEvents.push($event)"
    >
      @if (withTemplate) {
        <ng-template weGridCell="qty" let-row let-value="value" let-tree="tree">
          <span class="tpl" [attr.data-level]="tree?.level" [attr.data-parent]="tree?.parent?.key" [attr.data-has]="tree?.hasChildren" [attr.data-open]="tree?.expanded">{{ value }}</span>
        </ng-template>
      }
    </we-grid>
  `
})
class TreeHostComponent {
  columns: WeGridColumnDef<Node>[] = [
    { field: 'product', header: 'Product', width: 200, pinned: 'left', childField: 'supplier', headerFilterMode: 'operator' },
    { field: 'qty', header: 'Qty', type: 'number', width: 90 },
    {
      field: 'price',
      header: 'Price',
      type: 'number',
      width: 90,
      treeValue: (row: Node, tree: WeGridTreeInfo<Node>) => (tree.level === 0 ? Math.min(...(row.children ?? []).map((c) => c.price ?? Infinity)) : row.price)
    },
    { field: 'kind', header: 'Kind', width: 90, childField: null }
  ];
  data: Node[] = sampleData();
  trackBy: keyof Node | undefined = 'key';
  treeChildren: ((row: Node) => Node[] | undefined) | undefined = (row: Node) => row.children;
  treeColumn?: string;
  gridKey = 'tree-spec';
  treeDefaultExpanded: boolean | number = false;
  treeRetainState = false;
  retainLimit = 5000;
  treeSummaryLevel: 'root' | 'leaf' | 'all' = 'root';
  grouping = false;
  serverSide = false;
  totalCount = 0;
  page = 1;
  selectable: 'none' | 'multi' = 'none';
  withTemplate = false;
  rowClass?: (row: Node, index: number, tree?: WeGridTreeInfo<Node>) => string;
  clicks: WeGridRowClickEvent<Node>[] = [];
  expandEvents: WeGridTreeExpandEvent<Node>[] = [];

  @ViewChild(WeGridComponent) grid!: WeGridComponent<Node>;
}

const exported: WeGridExportTable[] = [];

describe('WeGridComponent — tree rows', () => {
  let fixture: ComponentFixture<TreeHostComponent>;
  let host: TreeHostComponent;

  const rows = (): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll('tbody tr.we-grid__row'));
  const keys = (): string[] => rows().map((r) => r.getAttribute('data-we-grid-row-key')!);
  const rowEl = (key: string): HTMLElement => fixture.nativeElement.querySelector(`#we-grid-row-${key}`);
  const cellText = (key: string, colIndex: number): string => (rowEl(key).querySelectorAll('td')[colIndex] as HTMLElement).textContent!.trim();
  const node = (key: string): Node => {
    const find = (list: Node[]): Node | undefined => {
      for (const n of list) {
        if (n.key === key) return n;
        const hit = find(n.children ?? []);
        if (hit) return hit;
      }
      return undefined;
    };
    return find(host.data)!;
  };
  const render = () => fixture.detectChanges();

  beforeEach(async () => {
    localStorage.clear();
    exported.length = 0;
    await TestBed.configureTestingModule({
      imports: [TreeHostComponent],
      providers: [{ provide: WE_GRID_EXPORTER, useValue: { export: (table: WeGridExportTable) => void exported.push(table) } }]
    }).compileComponents();
    fixture = TestBed.createComponent(TreeHostComponent);
    host = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
  });

  afterEach(() => {
    fixture.destroy();
    fixture.nativeElement.remove();
  });

  it('2. shows only the roots while collapsed; toggleTreeNode inserts the children right below their parent', () => {
    render();
    expect(keys()).toEqual(['P1', 'P2', 'P3']);
    host.grid.toggleTreeNode(node('P1'));
    render();
    expect(keys()).toEqual(['P1', 'C1', 'C2', 'P2', 'P3']);
    expect(host.expandEvents).toEqual([{ row: node('P1'), expanded: true, source: 'api' }]);
    host.grid.toggleTreeNode(node('P1'), false);
    render();
    expect(keys()).toEqual(['P1', 'P2', 'P3']);
  });

  it('3. child cells line up with the parent: same widths and the same pinned left offset', () => {
    host.treeDefaultExpanded = true;
    render();
    const parentCells = Array.from(rowEl('P1').querySelectorAll('td'));
    const childCells = Array.from(rowEl('C1').querySelectorAll('td'));
    expect(childCells.map((td) => td.style.width)).toEqual(parentCells.map((td) => td.style.width));
    expect(childCells[0].style.left).toBe(parentCells[0].style.left);
    expect(childCells[0].classList.contains('we-grid__td--pinned-left')).toBeTrue();
    expect(Math.round(childCells[1].getBoundingClientRect().left)).toBe(Math.round(parentCells[1].getBoundingClientRect().left));
  });

  it('4. treeValue wins over childField, which wins over field; childField: null leaves child cells empty; templates get ctx.tree', () => {
    host.treeDefaultExpanded = true;
    host.withTemplate = true;
    render();
    // product: field on the parent, childField (supplier) on the child
    expect(cellText('P1', 0)).toContain('Bike');
    expect(cellText('C1', 0)).toContain('Acme');
    // price: treeValue — the cheapest offer on the parent, its own price on the child
    expect(cellText('P1', 2)).toBe('90');
    expect(cellText('C1', 2)).toBe('100');
    // kind: childField null
    expect(cellText('P1', 3)).toBe('parent');
    expect(cellText('C1', 3)).toBe('');

    const parentTpl = rowEl('P1').querySelector('.tpl') as HTMLElement;
    const childTpl = rowEl('C2').querySelector('.tpl') as HTMLElement;
    expect([parentTpl.dataset['level'], parentTpl.dataset['has'], parentTpl.dataset['open']]).toEqual(['0', 'true', 'true']);
    expect([childTpl.dataset['level'], childTpl.dataset['parent'], childTpl.dataset['has']]).toEqual(['1', 'P1', 'false']);
    expect(childTpl.textContent).toBe('3');
  });

  it('5. the tree column is indented level × treeIndentPx; a leaf gets a placeholder instead of a toggle', () => {
    host.treeDefaultExpanded = true;
    host.treeColumn = 'qty';
    render();
    const parentCell = rowEl('P1').querySelectorAll('td')[1] as HTMLElement;
    const childCell = rowEl('C1').querySelectorAll('td')[1] as HTMLElement;
    expect(parentCell.style.paddingInlineStart).toBe('calc(0px + 0.5rem)');
    expect(childCell.style.paddingInlineStart).toBe('calc(16px + 0.5rem)');
    expect(parentCell.querySelector('.we-grid__tree-toggle')).not.toBeNull();
    expect(childCell.querySelector('.we-grid__tree-toggle')).toBeNull();
    expect(childCell.querySelector('.we-grid__tree-spacer')).not.toBeNull();
    // Other columns are not indented
    expect((rowEl('C1').querySelectorAll('td')[0] as HTMLElement).style.paddingInlineStart).toBe('');
  });

  it('5. without treeColumn the first visible unpinned column carries the toggle', () => {
    render();
    expect(rowEl('P1').querySelectorAll('td')[1].querySelector('.we-grid__tree-toggle')).not.toBeNull();
  });

  it('6. the toggle never reaches (rowClick); a click on the row does', () => {
    render();
    (rowEl('P1').querySelector('.we-grid__tree-toggle') as HTMLElement).click();
    render();
    expect(host.clicks.length).toBe(0);
    expect(keys()).toEqual(['P1', 'C1', 'C2', 'P2', 'P3']);
    expect(host.expandEvents[0].source).toBe('user');
    rowEl('C1').click();
    expect(host.clicks.length).toBe(1);
  });

  it('7. expandAllTree, collapseAllTree and treeAllExpanded', () => {
    render();
    expect(host.grid.treeAllExpanded).toBeFalse();
    host.grid.expandAllTree();
    render();
    expect(keys()).toEqual(['P1', 'C1', 'C2', 'P2', 'C3', 'P3']);
    expect(host.grid.treeAllExpanded).toBeTrue();
    expect(host.expandEvents.every((e) => e.source === 'api' && e.expanded)).toBeTrue();
    host.grid.collapseAllTree();
    render();
    expect(keys()).toEqual(['P1', 'P2', 'P3']);
    expect(host.grid.treeAllExpanded).toBeFalse();
  });

  it('7. treeDefaultExpanded: false, true, or a number of levels', () => {
    const deep = (): Node[] => [
      { key: 'A', kind: 'parent', product: 'A', qty: 1, children: [{ key: 'B', kind: 'child', product: 'B', qty: 1, children: [{ key: 'D', kind: 'child', product: 'D', qty: 1 }] }] }
    ];
    host.data = deep();
    host.treeDefaultExpanded = 1;
    render();
    expect(keys()).toEqual(['A', 'B']);

    fixture.destroy();
    fixture = TestBed.createComponent(TreeHostComponent);
    host = fixture.componentInstance;
    host.data = deep();
    host.treeDefaultExpanded = true;
    render();
    expect(keys()).toEqual(['A', 'B', 'D']);
  });

  it('8. a new data array keeps the open rows and their DOM, and forgets rows that are gone', () => {
    render();
    host.grid.toggleTreeNode(node('P1'));
    host.grid.toggleTreeNode(node('P2'));
    render();
    const openRow = rowEl('C1');

    host.data = sampleData().filter((n) => n.key !== 'P2');
    render();
    expect(keys()).toEqual(['P1', 'C1', 'C2', 'P3']);
    expect(rowEl('C1')).toBe(openRow);
    expect(host.grid.treeExpandedKeys.has('P2')).toBeFalse();
    expect(host.grid.treeExpandedKeys.has('P1')).toBeTrue();
  });

  it('8. treeRetainState: a row that leaves data and comes back keeps its open state, without an event', () => {
    host.treeRetainState = true;
    render();
    host.grid.toggleTreeNode(node('P2'));
    render();
    host.expandEvents.length = 0;

    host.data = sampleData().filter((n) => n.key !== 'P2');
    render();
    expect(keys()).toEqual(['P1', 'P3']);
    host.data = sampleData();
    render();
    expect(keys()).toEqual(['P1', 'P2', 'C3', 'P3']);
    expect(host.expandEvents).toEqual([]);
  });

  it('8. without treeRetainState a returning row starts from treeDefaultExpanded again (0.7.0)', () => {
    render();
    host.grid.toggleTreeNode(node('P2'));
    render();
    host.data = sampleData().filter((n) => n.key !== 'P2');
    render();
    host.data = sampleData();
    render();
    expect(keys()).toEqual(['P1', 'P2', 'P3']);
  });

  it('8. treeRetainState: a row closed against treeDefaultExpanded stays closed; an unseen row gets the default', () => {
    host.treeRetainState = true;
    host.treeDefaultExpanded = true;
    host.data = sampleData().filter((n) => n.key !== 'P2');
    render();
    host.grid.toggleTreeNode(node('P1'), false);
    host.data = sampleData().filter((n) => n.key !== 'P1');
    render();
    // P2 has never been seen: it opens by default
    expect(keys()).toEqual(['P2', 'C3', 'P3']);
    host.data = sampleData();
    render();
    expect(keys()).toEqual(['P1', 'P2', 'C3', 'P3']);
  });

  it('8. treeStateRetainLimit forgets the earliest rows to leave first', () => {
    host.treeRetainState = true;
    host.retainLimit = 1;
    render();
    host.grid.toggleTreeNode(node('P1'));
    host.grid.toggleTreeNode(node('P2'));
    render();
    host.data = sampleData().filter((n) => n.key !== 'P1');
    render();
    host.data = sampleData().filter((n) => n.key === 'P3');
    render();
    // P1 left first and is over the limit; P2 is still remembered
    expect(host.grid.treeExpandedKeys.has('P1')).toBeFalse();
    expect(host.grid.treeExpandedKeys.has('P2')).toBeTrue();
    host.data = sampleData();
    render();
    expect(keys()).toEqual(['P1', 'P2', 'C3', 'P3']);
  });

  it('8. clearTreeState forgets everything and applies treeDefaultExpanded again; a gridKey change does it too', () => {
    host.treeRetainState = true;
    host.treeDefaultExpanded = 1;
    render();
    host.grid.toggleTreeNode(node('P1'), false);
    host.data = sampleData().filter((n) => n.key !== 'P2');
    render();
    expect(host.grid.treeExpandedKeys.has('P2')).toBeTrue();
    host.grid.clearTreeState();
    render();
    expect(keys()).toEqual(['P1', 'C1', 'C2', 'P3']);
    expect(host.grid.treeExpandedKeys.has('P2')).toBeFalse();

    host.grid.toggleTreeNode(node('P1'), false);
    render();
    host.gridKey = 'tree-spec-other';
    render();
    expect(keys()).toEqual(['P1', 'C1', 'C2', 'P3']);
  });

  it('8. collapseAllTree leaves the remembered state of rows outside data alone', () => {
    host.treeRetainState = true;
    render();
    host.grid.toggleTreeNode(node('P1'));
    host.grid.toggleTreeNode(node('P2'));
    host.data = sampleData().filter((n) => n.key !== 'P2');
    render();
    host.grid.collapseAllTree();
    render();
    expect(host.grid.treeExpandedKeys.has('P1')).toBeFalse();
    expect(host.grid.treeExpandedKeys.has('P2')).toBeTrue();
  });

  it('9. the client sort orders siblings only and keeps ties stable; children stay under their parent', () => {
    host.treeDefaultExpanded = true;
    host.data = sampleData();
    host.data[0].children!.push({ key: 'C4', kind: 'child', product: 'Bike', supplier: 'Cora', qty: 3, price: 80 });
    render();
    const qty = host.grid.internalColumns.find((c) => c.field === 'qty')!;
    host.grid.onHeaderLabelClick(qty); // asc
    render();
    expect(keys()).toEqual(['P3', 'P2', 'C3', 'P1', 'C1', 'C2', 'C4']);
    host.grid.onHeaderLabelClick(qty); // desc
    render();
    // C2 and C4 tie on 3 and keep their original order
    expect(keys()).toEqual(['P1', 'C2', 'C4', 'C1', 'P2', 'C3', 'P3']);
  });

  it('10. a matching child keeps its parent and opens the path; clearing the filter restores the open state', () => {
    render();
    host.grid.toggleTreeNode(node('P2'));
    render();
    const product = host.grid.internalColumns.find((c) => c.field === 'product')!;
    host.grid.setFilterValue(product, 'beta');
    render();
    expect(keys()).toEqual(['P1', 'C2']);
    expect(host.grid.isTreeExpanded(node('P1'))).toBeTrue();
    expect(host.grid.treeExpandedKeys.has('P1')).toBeFalse();

    host.grid.clearAllFilters();
    render();
    expect(keys()).toEqual(['P1', 'P2', 'C3', 'P3']);
  });

  it('10. a matching parent without a matching child keeps all its children', () => {
    host.treeDefaultExpanded = true;
    render();
    const product = host.grid.internalColumns.find((c) => c.field === 'product')!;
    host.grid.setFilterValue(product, 'helmet');
    render();
    expect(keys()).toEqual(['P2', 'C3']);
  });

  it('11. serverSide: counts and pages are about root rows; a page change drops the open state', () => {
    host.serverSide = true;
    host.totalCount = 3;
    render();
    host.grid.toggleTreeNode(node('P1'));
    render();
    expect((fixture.nativeElement.querySelector('.we-grid__footer-info') as HTMLElement).textContent).toContain('3');
    expect(host.grid.displayData.length).toBe(3);

    host.page = 2;
    render();
    expect(host.grid.treeExpandedKeys.size).toBe(0);
    expect(keys()).toEqual(['P1', 'P2', 'P3']);
  });

  it('12. grouping is ignored next to a tree, with a dev warning', () => {
    const warn = spyOn(console, 'warn');
    host.grouping = true;
    render();
    host.grid.groupField = 'kind';
    (host.grid as unknown as { applyGrouping: () => void }).applyGrouping();
    render();
    expect(host.grid.groupedSections).toBeNull();
    expect(fixture.nativeElement.querySelector('.we-grid__group-row')).toBeNull();
    expect(warn.calls.allArgs().some((a) => String(a[0]).includes('grouping is ignored'))).toBeTrue();
  });

  it('13. treeSummaryLevel decides which rows the summary adds up', () => {
    host.columns = host.columns.map((c) => (c.field === 'qty' ? { ...c, summary: 'sum' } : c));
    render();
    const qty = () => host.grid.summaryCellText(host.grid.internalColumns.find((c) => c.field === 'qty')!);
    expect(qty()).toContain('17'); // roots: 10 + 5 + 2
    host.treeSummaryLevel = 'leaf';
    render();
    expect(qty()).toContain('8'); // C1 1 + C2 3 + C3 2 + P3 2
    host.treeSummaryLevel = 'all';
    render();
    expect(qty()).toContain('23');
  });

  it('14. exports every filtered row depth first, collapsed children included, indented in the first column', () => {
    render();
    host.grid.exportAs('csv');
    const table = exported[0];
    expect(table.rows.map((r) => r.text[0])).toEqual(['Bike', '  Acme', '  Beta', 'Helmet', '  Acme', 'Lamp']);
    expect(table.columns.map((c) => c.header)).toEqual(['Product', 'Qty', 'Price', 'Kind']);
  });

  it('14. with a selection, only the selected rows are exported', () => {
    host.selectable = 'multi';
    render();
    host.grid.toggleRowSelection(node('C2'));
    host.grid.toggleRowSelection(node('P3'));
    host.grid.exportAs('csv');
    expect(exported[0].rows.map((r) => r.text[0])).toEqual(['  Beta', 'Lamp']);
  });

  it('15. treegrid semantics: role, aria-level/posinset/setsize/expanded and the toggle name', () => {
    render();
    host.grid.toggleTreeNode(node('P1'));
    render();
    expect(fixture.nativeElement.querySelector('table').getAttribute('role')).toBe('treegrid');
    const parent = rowEl('P1');
    const child = rowEl('C2');
    expect([parent.getAttribute('aria-level'), parent.getAttribute('aria-posinset'), parent.getAttribute('aria-setsize'), parent.getAttribute('aria-expanded')]).toEqual([
      '1',
      '1',
      '3',
      'true'
    ]);
    expect([child.getAttribute('aria-level'), child.getAttribute('aria-posinset'), child.getAttribute('aria-setsize')]).toEqual(['2', '2', '2']);
    expect(child.hasAttribute('aria-expanded')).toBeFalse();
    expect(rowEl('P2').getAttribute('aria-expanded')).toBe('false');
    expect(parent.querySelector('.we-grid__tree-toggle')!.getAttribute('aria-label')).toBe(weGridLocaleEn.treeCollapseRow('10'));
  });

  it('16. scrollToRow opens collapsed ancestors and scrolls; false for a filtered or unknown row', async () => {
    render();
    const scroll = spyOn(Element.prototype, 'scrollIntoView');
    expect(host.grid.scrollToRow('C3')).toBeTrue();
    render();
    await fixture.whenStable();
    render();
    expect(keys()).toContain('C3');
    expect(scroll).toHaveBeenCalled();
    expect(scroll.calls.mostRecent().object).toBe(rowEl('C3'));

    expect(host.grid.scrollToRow('nope')).toBeFalse();
    const product = host.grid.internalColumns.find((c) => c.field === 'product')!;
    host.grid.setFilterValue(product, 'bike');
    render();
    expect(host.grid.scrollToRow('C3')).toBeFalse();
  });

  it('16. scrollToRow falls back to an instant scroll when the user prefers reduced motion', async () => {
    render();
    spyOn(window, 'matchMedia').and.returnValue({ matches: true } as MediaQueryList);
    const scroll = spyOn(Element.prototype, 'scrollIntoView');
    host.grid.scrollToRow('C1', { behavior: 'smooth', block: 'start' });
    render();
    await fixture.whenStable();
    render();
    expect(scroll.calls.mostRecent().args[0]).toEqual({ block: 'start', behavior: 'auto' });
  });

  it('17. dev warnings for a missing or duplicate trackByField; a cyclic tree stops at 32 levels', () => {
    const warn = spyOn(console, 'warn');
    host.trackBy = undefined;
    render();
    expect(warn.calls.allArgs().some((a) => String(a[0]).includes('needs trackByField'))).toBeTrue();

    fixture.destroy();
    fixture = TestBed.createComponent(TreeHostComponent);
    host = fixture.componentInstance;
    host.data = sampleData();
    host.data[1].children![0].key = 'C1';
    render();
    expect(warn.calls.allArgs().some((a) => String(a[0]).includes('share a trackByField value'))).toBeTrue();

    fixture.destroy();
    fixture = TestBed.createComponent(TreeHostComponent);
    host = fixture.componentInstance;
    const loop: Node = { key: 'L', kind: 'parent', product: 'Loop', qty: 1 };
    loop.children = [loop];
    host.data = [loop];
    expect(() => render()).toThrowError(/deeper than 32 levels/);
  });

  it('18. rowClass gets the tree info as a third argument; a two-argument function still works', () => {
    host.rowClass = (row, _index, tree) => (tree && tree.level > 0 ? 'is-child' : 'is-root');
    host.treeDefaultExpanded = true;
    render();
    expect(rowEl('P1').classList.contains('is-root')).toBeTrue();
    expect(rowEl('C1').classList.contains('is-child')).toBeTrue();

    host.rowClass = (row: Node) => (row.qty > 4 ? 'big' : '');
    render();
    expect(rowEl('P1').classList.contains('big')).toBeTrue();
    expect(rowEl('C1').classList.contains('big')).toBeFalse();
  });

  it('treeChildren removed: back to flat rows, the open state dropped', () => {
    render();
    host.grid.toggleTreeNode(node('P1'));
    render();
    host.treeChildren = undefined;
    render();
    expect(fixture.nativeElement.querySelector('table').getAttribute('role')).toBe('grid');
    expect(fixture.nativeElement.querySelectorAll('tbody tr.we-grid__row').length).toBe(3);
    expect(host.grid.treeExpandedKeys.size).toBe(0);
  });

  it('the header menu offers expand/collapse all in tree mode', () => {
    render();
    host.grid.openColumnsMenuFromToolbar();
    render();
    const item = Array.from(document.querySelectorAll<HTMLButtonElement>('we-grid-header-menu .we-grid-menu__item')).find((b) =>
      b.textContent!.includes(weGridLocaleEn.treeExpandAll)
    )!;
    item.click();
    render();
    expect(host.grid.treeAllExpanded).toBeTrue();
  });

  it('19. performance: 500 roots + 2000 children, all open, render within ~30% of 2500 flat rows', () => {
    const roots: Node[] = Array.from({ length: 500 }, (_, r) => ({
      key: `R${r}`,
      kind: 'parent' as const,
      product: `Root ${r}`,
      qty: r,
      children: Array.from({ length: 4 }, (_, c) => ({ key: `R${r}-${c}`, kind: 'child' as const, product: `Root ${r}`, supplier: `S${c}`, qty: c, price: c }))
    }));
    const flat: Node[] = roots.flatMap((r) => [{ ...r, children: undefined }, ...r.children!]);
    const plainColumns: WeGridColumnDef<Node>[] = [
      { field: 'product', header: 'Product', width: 200 },
      { field: 'qty', header: 'Qty', type: 'number', width: 90 },
      { field: 'price', header: 'Price', type: 'number', width: 90 },
      { field: 'kind', header: 'Kind', width: 90 }
    ];

    const once = (tree: boolean): number => {
      const f = TestBed.createComponent(TreeHostComponent);
      const h = f.componentInstance;
      h.columns = plainColumns;
      h.treeChildren = tree ? (row: Node) => row.children : undefined;
      h.treeDefaultExpanded = true;
      h.data = tree ? roots : flat;
      const start = performance.now();
      f.detectChanges();
      // a data refresh with the same keys
      h.data = tree ? [...roots] : [...flat];
      f.detectChanges();
      const elapsed = performance.now() - start;
      f.destroy();
      return elapsed;
    };
    const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

    // A warm-up of each, then alternating runs, so neither side pays for JIT warm-up or the other's garbage
    once(false);
    once(true);
    const flatRuns: number[] = [];
    const treeRuns: number[] = [];
    for (let i = 0; i < 5; i++) {
      flatRuns.push(once(false));
      treeRuns.push(once(true));
    }
    const flatMs = median(flatRuns);
    const treeMs = median(treeRuns);
    // Loose bound so a busy CI machine doesn't flake it: the target is 1.3×, the limit leaves room for noise
    expect(treeMs).withContext(`flat ${flatMs.toFixed(0)}ms, tree ${treeMs.toFixed(0)}ms`).toBeLessThan(flatMs * 1.3 + 150);
  });
});

describe('WeGridComponent — tree rows in Turkish', () => {
  it('15. the toggle name comes from the Turkish locale', async () => {
    await TestBed.configureTestingModule({
      imports: [TreeHostComponent],
      providers: [{ provide: WE_GRID_LOCALE, useValue: weGridLocaleTr }]
    }).compileComponents();
    const fixture = TestBed.createComponent(TreeHostComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const toggle = fixture.nativeElement.querySelector('.we-grid__tree-toggle') as HTMLElement;
    expect(toggle.getAttribute('aria-label')).toBe(weGridLocaleTr.treeExpandRow('10'));
    fixture.destroy();
    fixture.nativeElement.remove();
  });
});
