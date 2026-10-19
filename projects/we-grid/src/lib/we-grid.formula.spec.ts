import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { WeGridComponent } from './we-grid.component';
import { WeGridColumnDef } from './models/we-grid-column.model';
import { WeGridMenuAction } from './models/we-grid-menu-action.model';
import { WE_GRID_LAYOUT_STORE, WeGridLayout, WeGridLayoutStore } from './models/we-grid-layout.model';

interface Row {
  id: string;
  name: string;
  price: number;
  qty: number;
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
  template: `<we-grid gridKey="formula-spec" [columns]="columns" [data]="data" trackByField="id" [allowFormulaColumns]="true" />`
})
class FormulaHostComponent {
  columns: WeGridColumnDef<Row>[] = [
    { field: 'name', header: 'Name' },
    { field: 'price', header: 'Price', type: 'number' },
    { field: 'qty', header: 'Quantity', type: 'integer' },
    { field: 'total', header: 'Total', type: 'number', formula: '=[Price] * [qty]', summary: 'sum' }
  ];
  data: Row[] = [
    { id: 'a', name: 'Apple', price: 2.5, qty: 4 },
    { id: 'b', name: 'Bread', price: 10, qty: 0 },
    { id: 'c', name: 'Cheese', price: 4, qty: 5 }
  ];
  @ViewChild(WeGridComponent) grid!: WeGridComponent<Row>;
}

describe('WeGridComponent — formula columns', () => {
  let fixture: ComponentFixture<FormulaHostComponent>;
  let host: FormulaHostComponent;
  let store: MemoryStore;
  const menu = (action: WeGridMenuAction) => (host.grid as unknown as { handleMenuAction(a: WeGridMenuAction): void }).handleMenuAction(action);
  const column = (field: string) => host.grid.internalColumns.find((c) => c.field === field)!;
  const texts = (field: string) => host.grid.displayData.map((r) => host.grid.formatCell(r, column(field)));

  beforeEach(() => {
    store = new MemoryStore();
    TestBed.configureTestingModule({ imports: [FormulaHostComponent], providers: [{ provide: WE_GRID_LAYOUT_STORE, useValue: store }] });
    fixture = TestBed.createComponent(FormulaHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('computes a formula column from the row, read-only, and sums it', () => {
    expect(host.grid.displayData.map((r) => host.grid.cellValue(r, column('total')))).toEqual([10, 0, 20]);
    expect(column('total').editable).toBeFalse();
    expect(host.grid.summaryCellText(column('total'))).toContain('30');
  });

  it('sorts and filters by the computed value', () => {
    (host.grid as unknown as { applySort(f: string, d: 'desc'): void }).applySort('total', 'desc');
    expect(host.grid.displayData.map((r) => r.id)).toEqual(['c', 'a', 'b']);
    host.grid.applyView({ ...host.grid.getCurrentView('v'), filters: [{ field: 'total', operator: 'gt', value: 5 }] });
    expect(host.grid.displayData.map((r) => r.id)).toEqual(['c', 'a']);
  });

  it('adds, persists, edits and deletes a user formula column', async () => {
    host.grid.saveFormulaColumn({ field: 'fx:1', header: 'Unit check', formula: '=IF([Total] > 15, "High", "Low")', type: 'text' });
    expect(texts('fx:1')).toEqual(['Low', 'Low', 'High']);
    expect(column('fx:1').userFormula).toBeTrue();
    await new Promise((r) => setTimeout(r, 1200));
    expect(store.saved?.formulaColumns?.[0].field).toBe('fx:1');
    expect(store.saved?.columns.some((c) => c.field === 'fx:1')).toBeTrue();

    host.grid.saveFormulaColumn({ field: 'fx:1', header: 'Unit check', formula: '=[Price] / [Quantity]', type: 'number' });
    expect(host.grid.displayData.map((r) => host.grid.cellValue(r, column('fx:1')))[0]).toBe(0.625);
    expect(texts('fx:1')[1]).toBe('#DIV/0!');

    menu({ type: 'delete-formula-column', field: 'fx:1' });
    expect(host.grid.internalColumns.some((c) => c.field === 'fx:1')).toBeFalse();
  });

  it('restores user formula columns from a saved layout', () => {
    store.saved = {
      gridKey: 'formula-spec',
      version: 1,
      columns: [],
      formulaColumns: [{ field: 'fx:2', header: 'Double', formula: '=[Total]*2', type: 'number' }, { field: 'evil', header: 'x', formula: '=1' }]
    } as WeGridLayout;
    fixture = TestBed.createComponent(FormulaHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
    expect(texts('fx:2').length).toBe(3);
    expect(host.grid.internalColumns.some((c) => c.field === 'evil')).toBeFalse();
  });

  it('reports circular references instead of overflowing', () => {
    host.grid.saveFormulaColumn({ field: 'fx:1', header: 'Loop', formula: '=[Loop] + 1', type: 'number' });
    expect(texts('fx:1')[0]).toBe('#CIRC!');
  });

  it('opens the dialog from the menu with a live preview and saves through it', async () => {
    menu({ type: 'add-formula-column' });
    fixture.detectChanges();
    await fixture.whenStable();
    const dialog: HTMLElement = fixture.nativeElement.querySelector('we-grid-formula-dialog');
    const textarea = dialog.querySelector('textarea')!;
    textarea.value = '=[Price] +';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(dialog.querySelector('.we-grid-fx__error')).toBeTruthy();
    textarea.value = '=[Price] + 1';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(dialog.querySelector('.we-grid-fx__preview')?.textContent).toContain('3.5');
    (dialog.querySelector('button[type=submit]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('we-grid-formula-dialog')).toBeNull();
    expect(host.grid.internalColumns.some((c) => c.field === 'fx:1')).toBeTrue();
  });
});
