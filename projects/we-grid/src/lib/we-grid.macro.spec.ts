import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { WeGridComponent } from './we-grid.component';
import { WeGridColumnDef } from './models/we-grid-column.model';
import { WeGridMacro, WeGridMacroCommand } from './models/we-grid-macro.model';
import { WE_GRID_LAYOUT_STORE, WeGridLayout, WeGridLayoutStore } from './models/we-grid-layout.model';

interface Row {
  id: number;
  city: string;
  qty: number;
  status: string;
}

class MemoryStore implements WeGridLayoutStore {
  saved: WeGridLayout | null = null;
  load(): Observable<WeGridLayout | null> {
    return of(this.saved);
  }
  save(_key: string, layout: WeGridLayout): Observable<void> {
    this.saved = layout;
    return of(undefined);
  }
  reset(): Observable<void> {
    this.saved = null;
    return of(undefined);
  }
}

@Component({
  standalone: true,
  imports: [WeGridComponent],
  template: `<we-grid
    gridKey="macro-spec"
    [columns]="columns"
    [data]="data"
    trackByField="id"
    [grouping]="true"
    [formatting]="true"
    [allowMacros]="true"
    [editable]="true"
    [macros]="macros"
    [macroCommands]="commands"
  />`
})
class MacroHostComponent {
  columns: WeGridColumnDef<Row>[] = [
    { field: 'city', header: 'City' },
    { field: 'qty', header: 'Quantity', type: 'integer' },
    { field: 'status', header: 'Status' },
    { field: 'double', header: 'Double', type: 'integer', formula: '=[Quantity] * 2' }
  ];
  data: Row[] = [
    { id: 1, city: 'Izmir', qty: 5, status: 'open' },
    { id: 2, city: 'Ankara', qty: 12, status: 'open' },
    { id: 3, city: 'Izmir', qty: 30, status: 'done' }
  ];
  ran: number[] = [];
  commands: Record<string, WeGridMacroCommand<Row>> = { collect: (grid) => void this.ran.push(grid.displayData.length) };
  macros: WeGridMacro[] = [{ id: 'dev', name: 'Big Izmir orders', script: 'FILTER [City] = "Izmir"\nSORT [Quantity] DESC', pinned: true }];
  @ViewChild(WeGridComponent) grid!: WeGridComponent<Row>;
}

describe('WeGridComponent — macros', () => {
  let fixture: ComponentFixture<MacroHostComponent>;
  let host: MacroHostComponent;
  let store: MemoryStore;
  const ids = () => host.grid.displayData.map((r) => r.id);

  beforeEach(() => {
    store = new MemoryStore();
    TestBed.configureTestingModule({ imports: [MacroHostComponent], providers: [{ provide: WE_GRID_LAYOUT_STORE, useValue: store }] });
    fixture = TestBed.createComponent(MacroHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('runs filter and sort steps, from a pinned toolbar button too', async () => {
    const pinned = Array.from(fixture.nativeElement.querySelectorAll('.we-grid__toolbar button') as NodeListOf<HTMLButtonElement>).find((b) =>
      b.textContent!.includes('Big Izmir orders')
    )!;
    pinned.click();
    await fixture.whenStable();
    expect(ids()).toEqual([3, 1]);
  });

  it('groups, hides, highlights and switches zebra rows', async () => {
    const errors = await host.grid.runScript('GROUP BY [City]\nHIDE [Status]\nHIGHLIGHT [Quantity] > 10 RED\nZEBRA ON\nDENSITY COMPACT');
    expect(errors).toEqual([]);
    expect(host.grid.groupFields).toEqual(['city']);
    expect(host.grid.internalColumns.find((c) => c.field === 'status')!.visible).toBeFalse();
    expect(host.grid.activeFormatRules.map((r) => [r.field, r.operator, r.value])).toEqual([['qty', 'gt', 10]]);
    expect(host.grid.stripedActive).toBeTrue();
    expect(host.grid.density).toBe('compact');
  });

  it('leaves the name of the active view alone — a macro is not a saved view', async () => {
    host.grid.activeViewName = 'Mine';
    await host.grid.runScript('SORT [Quantity] DESC');
    expect(ids()).toEqual([3, 2, 1]);
    expect(host.grid.activeViewName).toBe('Mine');
  });

  it('sets values through formulas, only where the condition holds, and skips read-only columns', async () => {
    const errors = await host.grid.runScript('SET [Status] = IF([Quantity] > 10, "bulk", [Status]) WHERE [City] = "Izmir"\nSET [Double] = 1');
    expect(host.data.map((r) => r.status)).toEqual(['open', 'open', 'bulk']);
    expect(errors).toEqual([{ line: 2, message: 'Double cannot be changed' }]);
  });

  it('reports unknown columns, views and commands, and calls registered commands', async () => {
    const errors = await host.grid.runScript('SORT [Nope] ASC\nVIEW "Missing"\nRUN collect\nRUN nothing');
    expect(errors.map((e) => e.line)).toEqual([1, 2, 4]);
    expect(host.ran).toEqual([3]);
  });

  it('records a macro from what the user does and saves it with the layout', async () => {
    host.grid.startRecording();
    await host.grid.runScript('FILTER [Quantity] > 6\nSORT [City] ASC');
    host.grid.exportAs('csv');
    const script = host.grid.stopRecording();
    expect(script).toBe('CLEAR FILTERS\nFILTER [Quantity] > 6\nSORT [City] ASC\nEXPORT CSV');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('we-grid-macro-dialog')).toBeTruthy();

    host.grid.saveMacro({ id: 'macro1', name: 'Mine', script, pinned: true });
    await new Promise((r) => setTimeout(r, 1200));
    expect(store.saved?.macros).toEqual([{ id: 'macro1', name: 'Mine', script, pinned: true }]);
    expect(host.grid.pinnedMacros.map((m) => m.id)).toEqual(['dev', 'macro1']);
    host.grid.deleteMacro(host.grid.userMacros[0]);
    expect(host.grid.userMacros).toEqual([]);
  });

  it('reports script syntax errors without running anything for that line', async () => {
    const errors = await host.grid.runScript('SORT [City] SIDEWAYS\nSORT [Quantity] DESC');
    expect(errors.length).toBe(1);
    expect(errors[0].line).toBe(1);
    expect(ids()).toEqual([3, 2, 1]);
  });

  it('adds or updates a formula column with COLUMN, refuses the grid\'s own columns, and records new ones', async () => {
    host.grid.startRecording();
    let errors = await host.grid.runScript('COLUMN [Triple] INTEGER = [Quantity] * 3\nSORT [Triple] DESC\nCOLUMN [City] = 1');
    expect(errors).toEqual([{ line: 3, message: 'City is a column of the grid, not a formula column' }]);
    expect(host.grid.userFormulaColumns).toEqual([{ field: 'fx:1', header: 'Triple', formula: '=[Quantity] * 3', type: 'integer' }]);
    expect(ids()).toEqual([3, 2, 1]);
    const script = host.grid.stopRecording();
    expect(script).toBe('COLUMN [Triple] INTEGER = [Quantity] * 3\nSORT [Triple] DESC');
    errors = await host.grid.runScript('COLUMN [triple] = [Quantity] * 4');
    expect(errors).toEqual([]);
    expect(host.grid.userFormulaColumns.map((c) => [c.field, c.formula])).toEqual([['fx:1', '=[Quantity] * 4']]);
  });

  it('deletes a formula column with DELETE COLUMN', async () => {
    await host.grid.runScript('COLUMN [Triple] = [Quantity] * 3');
    expect(host.grid.userFormulaColumns.length).toBe(1);
    const errors = await host.grid.runScript('DELETE COLUMN [triple]\nDELETE COLUMN [Nope]');
    expect(errors).toEqual([{ line: 2, message: 'there is no column called Nope' }]);
    expect(host.grid.userFormulaColumns).toEqual([]);
  });
});
