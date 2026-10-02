import { Component, NO_ERRORS_SCHEMA, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { WeGridComponent } from './we-grid.component';
import { WeGridCellDirective } from './directives/we-grid-cell.directive';
import { WeGridColumnDef } from './models/we-grid-column.model';
import { WeGridRowClickEvent } from './models/we-grid-events.model';
import { WE_GRID_INTERACTIVE_SELECTOR, weGridIsInteractiveTarget } from './services/we-grid-interactive.util';

interface Row {
  id: string;
  name: string;
  note: string;
}

@Component({
  standalone: true,
  imports: [WeGridComponent, WeGridCellDirective, FormsModule],
  // ng-select is only a tag name here — the selector must recognise it without the library
  schemas: [NO_ERRORS_SCHEMA],
  template: `
    <we-grid
      gridKey="interactive-spec"
      [columns]="columns"
      [data]="data"
      trackByField="id"
      [grouping]="grouping"
      [selectable]="selectable"
      [expandable]="expandable"
      [ignoreInteractiveTargets]="ignoreInteractive"
      [rowStateVersion]="version"
      [rowClass]="rowClass"
      (rowClick)="clicks.push($event)"
      (rowDblClick)="dblClicks.push($event)"
    >
      <ng-template weGridCell="name" let-row>
        <span class="plain">{{ row.name }}</span>
        <button type="button" class="btn" (click)="decide(row)">Approve</button>
        <input class="text" />
        <select class="sel"><option>a</option></select>
        <a class="link" href="#x">link</a>
        <span class="switch" role="switch" aria-checked="false">s</span>
        <ng-select class="ngs"><span class="ngs-inner">x</span></ng-select>
        <span class="ignored" data-we-grid-ignore><b class="ignored-inner">i</b></span>
        <span data-we-grid-allow><button type="button" class="allowed">go</button></span>
      </ng-template>
      <ng-template weGridCell="note" let-row>
        <input class="note-input" [(ngModel)]="notes[row.id]" />
      </ng-template>
    </we-grid>
  `
})
class InteractiveHostComponent {
  columns: WeGridColumnDef<Row>[] = [
    { field: 'id', header: 'Id', width: 80, pinned: 'left' },
    { field: 'name', header: 'Name', width: 400 },
    { field: 'note', header: 'Note', width: 200 }
  ];
  data: Row[] = [
    { id: 'r1', name: 'One', note: '' },
    { id: 'r2', name: 'Two', note: '' }
  ];
  grouping = false;
  selectable: 'none' | 'multi' = 'none';
  expandable = false;
  ignoreInteractive = false;
  version = 0;
  decisions = new Map<string, string>();
  notes: Record<string, string> = {};
  clicks: WeGridRowClickEvent<Row>[] = [];
  dblClicks: WeGridRowClickEvent<Row>[] = [];
  rowClassCalls = 0;

  rowClass = (row: Row): string => {
    this.rowClassCalls++;
    return this.decisions.get(row.id) ?? '';
  };

  decide(row: Row): void {
    this.decisions.set(row.id, 'decided');
    this.version++;
  }

  @ViewChild(WeGridComponent) grid!: WeGridComponent<Row>;
}

describe('WeGridComponent — interactive controls in cell templates', () => {
  let fixture: ComponentFixture<InteractiveHostComponent>;
  let host: InteractiveHostComponent;
  let style: HTMLStyleElement;
  // The test page has a <base href>, so following even "#x" would reload it
  const stopNavigation = (event: Event) => {
    if ((event.target as Element | null)?.closest?.('a[href]')) event.preventDefault();
  };

  const el = <E extends Element = HTMLElement>(selector: string, root: ParentNode = fixture.nativeElement): E =>
    root.querySelector(selector) as E;
  const firstRow = (): HTMLElement => el('tbody tr.we-grid__row');
  const fire = (target: Element, type: string): MouseEvent => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  };

  beforeEach(async () => {
    localStorage.clear();
    style = document.createElement('style');
    style.textContent = `
      tr.decided { --we-grid-row-bg: rgb(1, 2, 3); }
      tr.accent { --we-grid-row-accent: rgb(255, 0, 0); }
    `;
    document.head.appendChild(style);
    document.addEventListener('click', stopNavigation);
    await TestBed.configureTestingModule({ imports: [InteractiveHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(InteractiveHostComponent);
    host = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
  });

  afterEach(() => {
    fixture.nativeElement.remove();
    style.remove();
    document.removeEventListener('click', stopNavigation);
  });

  it('1. stopRowEvents: true keeps click, dblclick and contextmenu in the cell; stopRowClick alone keeps only click', () => {
    host.columns = host.columns.map((c) => (c.field === 'name' ? { ...c, stopRowEvents: true } : c));
    host.grouping = true;
    fixture.detectChanges();
    const btn = el('.btn', firstRow());
    fire(btn, 'click');
    fire(btn, 'dblclick');
    const ctx = fire(btn, 'contextmenu');
    expect(host.clicks.length).toBe(0);
    expect(host.dblClicks.length).toBe(0);
    expect(ctx.defaultPrevented).toBeFalse();
    expect(document.querySelector('.we-grid-menu')).toBeNull();

    host.columns = host.columns.map((c) => (c.field === 'name' ? { field: 'name', header: 'Name', width: 400, stopRowClick: true } : c));
    fixture.detectChanges();
    const btn2 = el('.btn', firstRow());
    fire(btn2, 'click');
    fire(btn2, 'dblclick');
    expect(host.clicks.length).toBe(0);
    expect(host.dblClicks.length).toBe(1);
  });

  it('2. without ignoreInteractiveTargets a button click still reaches the row (the 0.6 behaviour)', () => {
    fixture.detectChanges();
    fire(el('.btn', firstRow()), 'click');
    expect(host.clicks.length).toBe(1);
  });

  it('3. with ignoreInteractiveTargets, clicks on controls stay with them; empty cell space and data-we-grid-allow reach the row', () => {
    host.ignoreInteractive = true;
    fixture.detectChanges();
    const row = firstRow();
    for (const selector of ['.btn', '.text', '.sel', '.link', '.switch', '.ngs-inner', '.ignored-inner']) {
      fire(el(selector, row), 'click');
      fire(el(selector, row), 'dblclick');
    }
    expect(host.clicks.length).toBe(0);
    expect(host.dblClicks.length).toBe(0);

    fire(el('.plain', row), 'click');
    fire(row.querySelectorAll('td')[0], 'dblclick');
    expect(host.clicks.length).toBe(1);
    expect(host.dblClicks.length).toBe(1);

    fire(el('.allowed', row), 'click');
    expect(host.clicks.length).toBe(2);
  });

  it('4. with grouping on, a right click on an input keeps the browser menu and opens no grid menu', () => {
    host.ignoreInteractive = true;
    host.grouping = true;
    fixture.detectChanges();
    const event = fire(el('.text', firstRow()), 'contextmenu');
    expect(event.defaultPrevented).toBeFalse();
    expect(document.querySelector('.we-grid-menu')).toBeNull();

    // A right click on plain cell text still opens the grid's menu
    const plain = fire(el('.plain', firstRow()), 'contextmenu');
    expect(plain.defaultPrevented).toBeTrue();
    fixture.detectChanges();
    expect(document.querySelector('.we-grid-menu')).not.toBeNull();
    document.querySelector<HTMLElement>('.we-grid-menu-backdrop')?.click();
  });

  it('6. a rowStateVersion change re-evaluates rowClass with the same data reference', () => {
    fixture.detectChanges();
    const dataBefore = host.data;
    host.decisions.set('r1', 'decided');
    fixture.detectChanges();
    // OnPush: a Map mutation alone is invisible to the grid
    expect(firstRow().classList.contains('decided')).toBeFalse();

    const callsBefore = host.rowClassCalls;
    host.version++;
    fixture.detectChanges();
    expect(host.rowClassCalls).toBeGreaterThan(callsBefore);
    expect(firstRow().classList.contains('decided')).toBeTrue();
    expect(host.data).toBe(dataBefore);
  });

  it('7. typing in a template input survives a new data array with the same keys', () => {
    fixture.detectChanges();
    const input = el<HTMLInputElement>('.note-input', firstRow());
    input.focus();
    input.value = 'hello';
    input.dispatchEvent(new Event('input'));
    input.setSelectionRange(2, 2);
    fixture.detectChanges();

    host.data = host.data.map((r) => ({ ...r }));
    fixture.detectChanges();

    const after = el<HTMLInputElement>('.note-input', firstRow());
    expect(after).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(after.selectionStart).toBe(2);
    expect(host.notes['r1']).toBe('hello');
  });

  it('8. a template button that changes screen state is reflected through rowStateVersion, without refreshRows()', () => {
    fixture.detectChanges();
    spyOn(host.grid, 'refreshRows').and.callThrough();
    el('.btn', firstRow()).click();
    fixture.detectChanges();
    expect(firstRow().classList.contains('decided')).toBeTrue();
    expect(host.grid.refreshRows).not.toHaveBeenCalled();
  });

  it('refreshRows() picks up state the grid cannot see', () => {
    fixture.detectChanges();
    host.decisions.set('r2', 'decided');
    host.grid.refreshRows();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr.we-grid__row')[1].classList.contains('decided')).toBeTrue();
  });

  it('9. --we-grid-row-bg paints every cell of the row, pinned ones included; unset, cells keep the old background', () => {
    host.selectable = 'multi';
    fixture.detectChanges();
    const plainCells = Array.from(firstRow().querySelectorAll('td')).map((td) => getComputedStyle(td).backgroundColor);
    expect(new Set(plainCells)).toEqual(new Set(['rgb(255, 255, 255)']));

    host.decisions.set('r1', 'decided');
    host.version++;
    fixture.detectChanges();
    const row = firstRow();
    const pinned = el('td.we-grid__td--pinned-left', row);
    const select = el('td.we-grid__select-col', row);
    const regular = row.querySelectorAll('td')[3] as HTMLElement;
    for (const td of [pinned, select, regular]) {
      expect(getComputedStyle(td).backgroundColor).toBe('rgb(1, 2, 3)');
    }
  });

  it('10. allowOverflow lets that column overflow; the others still clip', () => {
    host.columns = host.columns.map((c) => (c.field === 'note' ? { ...c, allowOverflow: true } : c));
    fixture.detectChanges();
    const cells = firstRow().querySelectorAll('td');
    expect(getComputedStyle(cells[2]).overflow).toBe('visible');
    expect(getComputedStyle(cells[2]).position).toBe('relative');
    expect(getComputedStyle(cells[1]).overflow).toBe('hidden');
  });

  it('11. --we-grid-row-accent draws a stripe on the first visible cell, the selection column included', () => {
    host.selectable = 'multi';
    host.rowClass = (row: Row) => (row.id === 'r1' ? 'accent' : '');
    fixture.detectChanges();
    const cells = Array.from(firstRow().querySelectorAll('td'));
    expect(cells[0].classList.contains('we-grid__select-col')).toBeTrue();
    expect(getComputedStyle(cells[0]).boxShadow).toContain('rgb(255, 0, 0)');
    expect(getComputedStyle(cells[1]).boxShadow).toBe('none');
    const second = fixture.nativeElement.querySelectorAll('tbody tr.we-grid__row')[1] as HTMLElement;
    expect(getComputedStyle(second.querySelector('td')!).boxShadow).toBe('none');
  });
});

describe('weGridIsInteractiveTarget', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    root.innerHTML = `
      <label class="outer-label"><table><tbody><tr class="row"><td class="cell">
        <span class="text">t</span>
        <button class="btn"><i class="icon">*</i></button>
        <div data-we-grid-allow><input class="allowed" /></div>
        <span class="host"></span>
      </td></tr></tbody></table></label>`;
    document.body.appendChild(root);
  });

  afterEach(() => root.remove());

  /** The function is meant to run inside a handler, while composedPath() is still filled in */
  function check(target: Element, boundary: Element | null): boolean {
    let result = false;
    // Only the dispatched click: activating the surrounding <label> fires a second one at its control
    const listener = (event: Event) => (result = weGridIsInteractiveTarget(event, boundary));
    root.addEventListener('click', listener, { once: true });
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    return result;
  }

  it('5. finds the control from a nested element, stops at the boundary, honours data-we-grid-allow', () => {
    const row = root.querySelector('.row')!;
    expect(check(root.querySelector('.icon')!, row)).toBeTrue();
    // The <label> around the whole table is outside the row — it doesn't make every click interactive
    expect(check(root.querySelector('.text')!, row)).toBeFalse();
    expect(check(root.querySelector('.text')!, null)).toBeTrue();
    expect(check(root.querySelector('.allowed')!, row)).toBeFalse();
    // A target outside the boundary is never interactive for that boundary
    expect(check(root.querySelector('.btn')!, root.querySelector('.text'))).toBeFalse();
  });

  it('5. reads the real target from composedPath, through a shadow root', () => {
    const shadowHost = root.querySelector('.host')!;
    const shadow = shadowHost.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<span class="wrap"><button class="inner">x</button></span><span class="plain">p</span>';
    const row = root.querySelector('.row')!;
    expect(check(shadow.querySelector('.inner')!, row)).toBeTrue();
    expect(check(shadow.querySelector('.plain')!, row)).toBeFalse();
  });

  it('exports the selector consumers can reuse', () => {
    expect(WE_GRID_INTERACTIVE_SELECTOR).toContain('[data-we-grid-ignore]');
    expect(WE_GRID_INTERACTIVE_SELECTOR).toContain('ng-select');
  });
});
