import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WeGridComponent } from './we-grid.component';
import { WeGridColumnDef } from './models/we-grid-column.model';
import { WeGridMenuAction } from './models/we-grid-menu-action.model';
import { weGridLocaleEn } from './models/we-grid-locale.model';

interface Sale {
  id: string;
  city: string;
  status: string;
  qty: number;
  amount: number;
}

@Component({
  standalone: true,
  imports: [WeGridComponent],
  template: `
    <we-grid
      gridKey="grouping-spec"
      [columns]="columns"
      [data]="data"
      trackByField="id"
      [grouping]="true"
      [savedViews]="true"
      [groupBy]="groupBy"
      [groupAutoSummary]="groupAutoSummary"
      [groupSummaryPosition]="groupSummaryPosition"
      [selectable]="selectable"
      (groupChange)="outer.push($event)"
      (groupFieldsChange)="levels.push($event)"
    ></we-grid>
  `
})
class GroupingHostComponent {
  columns: WeGridColumnDef<Sale>[] = [
    { field: 'id', header: 'Id', width: 80 },
    { field: 'city', header: 'City', width: 120 },
    { field: 'status', header: 'Status', width: 120 },
    { field: 'qty', header: 'Qty', type: 'number', width: 90 },
    { field: 'amount', header: 'Amount', type: 'number', width: 110 }
  ];
  data: Sale[] = [
    { id: 's1', city: 'Ankara', status: 'Open', qty: 1, amount: 100 },
    { id: 's2', city: 'Ankara', status: 'Closed', qty: 2, amount: 200 },
    { id: 's3', city: 'Ankara', status: 'Open', qty: 3, amount: 300 },
    { id: 's4', city: 'Izmir', status: 'Open', qty: 4, amount: 400 }
  ];
  groupBy?: string[] | null;
  groupAutoSummary = false;
  groupSummaryPosition: 'header' | 'footer' | 'both' = 'header';
  selectable: 'none' | 'multi' = 'none';
  outer: (string | null)[] = [];
  levels: string[][] = [];

  @ViewChild(WeGridComponent) grid!: WeGridComponent<Sale>;
}

describe('WeGridComponent — multi-level grouping and group summaries', () => {
  let fixture: ComponentFixture<GroupingHostComponent>;
  let host: GroupingHostComponent;

  const render = () => fixture.detectChanges();
  const menu = (action: WeGridMenuAction) => {
    (host.grid as unknown as { handleMenuAction: (a: WeGridMenuAction) => void }).handleMenuAction(action);
    render();
  };
  /** The body as a list: "G0:City: Ankara (3)", "R:s1", "F1:Status: Open" … */
  const outline = (): string[] =>
    Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('tbody > tr')).map((tr) => {
      if (tr.classList.contains('we-grid__group-row')) {
        const level = tr.classList.contains('we-grid__group-row--nested') ? 'G1' : 'G0';
        const count = tr.querySelector('.we-grid__group-count')!.textContent!.trim().split(' ')[0];
        return `${level}:${tr.querySelector('.we-grid__group-label')!.textContent!.trim()} (${count})`;
      }
      if (tr.classList.contains('we-grid__group-footer-row')) return `F:${tr.querySelector('.we-grid__summary-count')!.textContent!.trim()}`;
      return `R:${tr.querySelectorAll('td')[0].textContent!.trim()}`;
    });

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [GroupingHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(GroupingHostComponent);
    host = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
  });

  afterEach(() => {
    fixture.destroy();
    fixture.nativeElement.remove();
  });

  it('groups by several fields, one under the other, with the record count of each group', () => {
    host.groupBy = ['city', 'status'];
    render();
    expect(host.grid.groupFields).toEqual(['city', 'status']);
    expect(host.grid.groupField).toBe('city');
    expect(outline()).toEqual([
      'G0:City: Ankara (3)',
      'G1:Status: Closed (1)',
      'R:s2',
      'G1:Status: Open (2)',
      'R:s1',
      'R:s3',
      'G0:City: Izmir (1)',
      'G1:Status: Open (1)',
      'R:s4'
    ]);
    const nested = fixture.nativeElement.querySelector('.we-grid__group-row--nested td') as HTMLElement;
    expect(nested.style.paddingInlineStart).not.toBe('');
    const outerCell = fixture.nativeElement.querySelector('.we-grid__group-row td') as HTMLElement;
    expect(outerCell.hasAttribute('style')).toBeFalse();
  });

  it('collapsing an outer group hides its sub-groups; the state survives a new data array', () => {
    host.groupBy = ['city', 'status'];
    render();
    host.grid.toggleGroupCollapse(host.grid.groupedSections![0].children![1]); // Ankara › Open
    render();
    expect(outline()).toEqual(['G0:City: Ankara (3)', 'G1:Status: Closed (1)', 'R:s2', 'G1:Status: Open (2)', 'G0:City: Izmir (1)', 'G1:Status: Open (1)', 'R:s4']);

    host.data = host.data.map((s) => ({ ...s }));
    render();
    expect(outline()).toContain('G1:Status: Open (2)');
    expect(outline()).not.toContain('R:s1');

    host.grid.toggleGroupCollapse(host.grid.groupedSections![0]);
    render();
    expect(outline()).toEqual(['G0:City: Ankara (3)', 'G0:City: Izmir (1)', 'G1:Status: Open (1)', 'R:s4']);

    host.grid.expandAllGroups();
    render();
    expect(outline().filter((l) => l.startsWith('R:')).length).toBe(4);
    host.grid.collapseAllGroups();
    render();
    expect(outline()).toEqual(['G0:City: Ankara (3)', 'G0:City: Izmir (1)']);
  });

  it('the menu replaces, adds and removes levels; groupChange reports the outer field, groupFieldsChange every level', () => {
    render();
    menu({ type: 'group-by', field: 'status' });
    menu({ type: 'group-add', field: 'city' });
    expect(host.grid.groupFields).toEqual(['status', 'city']);
    menu({ type: 'group-add', field: 'city' }); // already there
    menu({ type: 'group-remove', field: 'status' });
    expect(host.grid.groupFields).toEqual(['city']);
    menu({ type: 'group-by', field: 'qty' });
    expect(host.grid.groupFields).toEqual(['qty']);
    expect(host.outer).toEqual(['status', 'city', 'qty']);
    expect(host.levels).toEqual([['status'], ['status', 'city'], ['city'], ['qty']]);
  });

  it('the header menu offers "Add to grouping" and "Remove from grouping"', () => {
    host.groupBy = ['city', 'status'];
    render();
    const textFor = (field: string): string => {
      host.grid.onHeaderContextMenu(new MouseEvent('contextmenu'), host.grid.internalColumns.find((c) => c.field === field)!);
      render();
      const text = document.querySelector('we-grid-header-menu')!.textContent!;
      document.querySelector<HTMLElement>('.we-grid-menu-backdrop')!.click();
      return text;
    };
    expect(textFor('qty')).toContain(weGridLocaleEn.addToGrouping);
    expect(textFor('status')).toContain(weGridLocaleEn.removeFromGrouping);
    expect(textFor('status')).not.toContain(weGridLocaleEn.addToGrouping);
  });

  it('the toolbar chip lists every level, each removable', () => {
    host.groupBy = ['city', 'status'];
    render();
    const chip = fixture.nativeElement.querySelector('.we-grid__group-chip--levels') as HTMLElement;
    expect(chip.textContent).toContain('City');
    expect(chip.textContent).toContain('Status');
    const removes = chip.querySelectorAll<HTMLButtonElement>('.we-grid__group-chip-level .we-grid__group-chip-remove');
    expect(removes.length).toBe(2);
    removes[0].click();
    render();
    expect(host.grid.groupFields).toEqual(['status']);
    // Back to one level — the chip is the single-level one again
    expect(fixture.nativeElement.querySelector('.we-grid__group-chip--levels')).toBeNull();
    expect(fixture.nativeElement.querySelector('.we-grid__group-chip')).not.toBeNull();
  });

  it('groupAutoSummary adds up every numeric column in the group header', () => {
    host.groupBy = ['city'];
    host.groupAutoSummary = true;
    render();
    const summary = (fixture.nativeElement.querySelector('.we-grid__group-summary') as HTMLElement).textContent!;
    expect(summary).toContain(`Qty ${weGridLocaleEn.sum}: 6`);
    expect(summary).toContain(`Amount ${weGridLocaleEn.sum}: 600`);
    expect(summary).not.toContain('City');
  });

  it('a column groupSummary wins over summary and over the automatic sum; text columns can only count', () => {
    host.columns = host.columns.map((c) =>
      c.field === 'amount' ? { ...c, summary: 'sum', groupSummary: 'avg' } : c.field === 'city' ? { ...c, groupSummary: 'sum' } : c.field === 'status' ? { ...c, groupSummary: 'count' } : c
    );
    host.groupBy = ['city'];
    host.groupAutoSummary = true;
    render();
    const summary = (fixture.nativeElement.querySelector('.we-grid__group-summary') as HTMLElement).textContent!;
    expect(summary).toContain(`Amount ${weGridLocaleEn.average}: 200`);
    expect(summary).toContain(`Status ${weGridLocaleEn.count}: 3`);
    expect(summary).not.toContain(`City ${weGridLocaleEn.sum}`);
    // The grand summary row still uses summary
    expect(host.grid.summaryCellText(host.grid.internalColumns.find((c) => c.field === 'amount')!)).toContain('1,000');
  });

  it("groupSummaryPosition 'footer': a footer row closes each expanded group, values under their columns", () => {
    host.groupBy = ['city', 'status'];
    host.groupAutoSummary = true;
    host.groupSummaryPosition = 'footer';
    render();
    expect(fixture.nativeElement.querySelector('.we-grid__group-summary')).toBeNull();
    expect(outline()).toEqual([
      'G0:City: Ankara (3)',
      'G1:Status: Closed (1)',
      'R:s2',
      `F:1 ${weGridLocaleEn.recordsLabel}`,
      'G1:Status: Open (2)',
      'R:s1',
      'R:s3',
      `F:2 ${weGridLocaleEn.recordsLabel}`,
      `F:3 ${weGridLocaleEn.recordsLabel}`,
      'G0:City: Izmir (1)',
      'G1:Status: Open (1)',
      'R:s4',
      `F:1 ${weGridLocaleEn.recordsLabel}`,
      `F:1 ${weGridLocaleEn.recordsLabel}`
    ]);
    const ankaraFooter = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.we-grid__group-footer-row'))[2];
    const cells = ankaraFooter.querySelectorAll('td');
    expect(cells.length).toBe(host.grid.renderColumns.length);
    expect(cells[3].textContent).toContain('6');
    expect(cells[4].textContent).toContain('600');
    expect(cells[1].querySelector('.we-grid__summary-value')).toBeNull();

    host.grid.toggleGroupCollapse(host.grid.groupedSections![1]);
    render();
    expect(outline().slice(-1)).toEqual(['G0:City: Izmir (1)']);
  });

  it("groupSummaryPosition 'both' keeps the header text as well; a selection column carries the count", () => {
    host.groupBy = ['city'];
    host.groupAutoSummary = true;
    host.groupSummaryPosition = 'both';
    host.selectable = 'multi';
    render();
    expect(fixture.nativeElement.querySelector('.we-grid__group-summary')).not.toBeNull();
    const footer = fixture.nativeElement.querySelector('.we-grid__group-footer-row') as HTMLElement;
    expect(footer.querySelector('td.we-grid__select-col')!.textContent!.trim()).toBe('3');
  });

  it('saved views keep every level; a view from before (groupField only) still applies', () => {
    host.groupBy = ['city', 'status'];
    render();
    host.grid.saveCurrentView('Two levels');
    expect(host.grid.views[0].groupFields).toEqual(['city', 'status']);
    host.grid.clearGrouping();
    render();
    host.grid.applyView(host.grid.views[0]);
    render();
    expect(host.grid.groupFields).toEqual(['city', 'status']);

    host.grid.applyView({ name: 'Old', columns: [], groupField: 'status' });
    expect(host.grid.groupFields).toEqual(['status']);
  });

  it('groupBy ignores unknown and repeated fields', () => {
    host.groupBy = ['gone', 'city', 'city'];
    render();
    expect(host.grid.groupFields).toEqual(['city']);
    host.groupBy = [];
    render();
    expect(host.grid.groupFields).toEqual([]);
    expect(host.grid.groupedSections).toBeNull();
  });
});
