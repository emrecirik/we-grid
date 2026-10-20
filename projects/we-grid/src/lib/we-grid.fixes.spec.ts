import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { WeGridComponent } from './we-grid.component';
import { WeGridColumnDef } from './models/we-grid-column.model';
import { WeGridMenuAction } from './models/we-grid-menu-action.model';

interface Row {
  id: number;
  name: string;
  qty: number;
  kids?: Row[];
}

@Component({
  standalone: true,
  imports: [WeGridComponent],
  template: `<we-grid
    gridKey="fixes-spec"
    [columns]="columns"
    [data]="data"
    trackByField="id"
    [search]="true"
    [grouping]="true"
    [striped]="true"
    [allowFormulaColumns]="true"
    [treeChildren]="tree ? kidsOf : undefined"
    [rowStateVersion]="version"
  />`
})
class HostComponent {
  columns: WeGridColumnDef<Row>[] = [
    { field: 'name', header: 'Name' },
    { field: 'qty', header: 'Qty', type: 'number' }
  ];
  data: Row[] = [
    { id: 1, name: 'A', qty: 1 },
    { id: 2, name: 'B', qty: 2 },
    { id: 3, name: 'A', qty: 3 },
    { id: 4, name: 'B', qty: 4 }
  ];
  tree = false;
  version = 0;
  readonly kidsOf = (row: Row) => row.kids ?? null;
  @ViewChild(WeGridComponent) grid!: WeGridComponent<Row>;
}

describe('WeGridComponent — 0.33.1 fixes', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  const menu = (action: WeGridMenuAction) => (host.grid as unknown as { handleMenuAction(a: WeGridMenuAction): void }).handleMenuAction(action);

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('a search cleared while it was still being typed stays cleared', fakeAsync(() => {
    host.grid.onSearchInput('A');
    host.grid.clearSearch();
    tick(1000);
    expect(host.grid.displayData.length).toBe(4);
  }));

  it('recomputes formula columns after an in-place edit and drops them on reset', () => {
    host.grid.saveFormulaColumn({ field: 'fx:d', header: 'Double', formula: '=[Qty]*2' });
    fixture.detectChanges();
    const col = host.grid.internalColumns.find((c) => c.field === 'fx:d')!;
    expect(host.grid.cellValue(host.data[0], col)).toBe(2);
    host.data[0].qty = 50;
    host.version++;
    fixture.detectChanges();
    expect(host.grid.cellValue(host.data[0], col)).toBe(100);
    menu({ type: 'reset-layout' });
    expect(host.grid.renderColumns.map((c) => c.field)).toEqual(['name', 'qty']);
  });

  it('drops the grouping, sort and rules on a formula column when it is deleted', () => {
    const grid = host.grid;
    grid.saveFormulaColumn({ field: 'fx:d', header: 'Double', formula: '=[Qty]*2' });
    grid.setGrouping(['fx:d']);
    grid.onFormatRulesChange([{ id: 'r', field: 'fx:d', type: 'condition', operator: 'gt', value: 1, style: { bold: true } }]);
    grid.deleteFormulaColumn('fx:d');
    expect(grid.groupFields).toEqual([]);
    expect(grid.activeFormatRules.some((r) => r.field === 'fx:d')).toBeFalse();
    expect(grid.getCurrentView('v').sort).toBeNull();
  });

  it('shows #CIRC! on every column of a loop, even behind IFERROR', () => {
    const grid = host.grid;
    grid.saveFormulaColumn({ field: 'fx:a', header: 'FA', formula: '=IFERROR([FB],0)+1' });
    grid.saveFormulaColumn({ field: 'fx:b', header: 'FB', formula: '=IFERROR([FA],0)+1' });
    const a = grid.internalColumns.find((c) => c.field === 'fx:a')!;
    const b = grid.internalColumns.find((c) => c.field === 'fx:b')!;
    expect(String(grid.cellValue(host.data[0], a))).toBe('#CIRC!');
    expect(String(grid.cellValue(host.data[0], b))).toBe('#CIRC!');
    expect(String(grid.cellValue(host.data[1], b))).toBe('#CIRC!');
    expect(String(grid.cellValue(host.data[1], a))).toBe('#CIRC!');
  });

  it('warns that only the loaded page is searched on a server-side grid that searches itself', () => {
    host.grid.serverSide = true;
    host.grid.setSearch('A');
    expect(host.grid.isFilteringPageOnly).toBeTrue();
  });

  it('stripes rows within each group', () => {
    host.grid.setGrouping(['name']);
    fixture.detectChanges();
    const rows = Array.from(fixture.nativeElement.querySelectorAll('tr.we-grid__row')) as HTMLElement[];
    expect(rows.map((r) => r.classList.contains('we-grid__row--alt'))).toEqual([false, true, false, true]);
  });

  it('searches tree rows, keeping the parents of what it finds', () => {
    host.data = [
      { id: 1, name: 'Bikes', qty: 1, kids: [{ id: 11, name: 'Helmet', qty: 2 }] },
      { id: 2, name: 'Books', qty: 3, kids: [{ id: 21, name: 'Atlas', qty: 4 }] }
    ];
    host.tree = true;
    fixture.detectChanges();
    host.grid.setSearch('Helmet');
    fixture.detectChanges();
    expect(host.grid.treeFilteredRows.map((r) => r.name)).toEqual(['Bikes', 'Helmet']);
  });
});
