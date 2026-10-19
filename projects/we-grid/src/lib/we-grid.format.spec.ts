import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { WeGridComponent } from './we-grid.component';
import { WeGridColumnDef } from './models/we-grid-column.model';
import { WeGridFormatRule } from './models/we-grid-format.model';
import { WeGridMenuAction } from './models/we-grid-menu-action.model';
import { WE_GRID_LAYOUT_STORE, WeGridLayout, WeGridLayoutStore } from './models/we-grid-layout.model';

interface Row {
  id: string;
  name: string;
  amount: number;
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
  template: `<we-grid gridKey="format-spec" [columns]="columns" [data]="data" trackByField="id" [striped]="striped" [formatting]="true" [formatRules]="rules" />`
})
class FormatHostComponent {
  columns: WeGridColumnDef<Row>[] = [
    { field: 'name', header: 'Name', width: 120 },
    { field: 'amount', header: 'Amount', type: 'number', width: 100, cellStyle: { bold: true } }
  ];
  data: Row[] = [
    { id: 'a', name: 'Alpha', amount: 10 },
    { id: 'b', name: 'Beta', amount: 500 },
    { id: 'c', name: 'Gamma', amount: 90 }
  ];
  striped = false;
  rules: WeGridFormatRule[] = [{ id: 'r1', field: 'amount', type: 'condition', operator: 'gt', value: 100, style: { fill: 'red' } }];
  @ViewChild(WeGridComponent) grid!: WeGridComponent<Row>;
}

describe('WeGridComponent — formatting', () => {
  let fixture: ComponentFixture<FormatHostComponent>;
  let host: FormatHostComponent;
  let store: MemoryStore;
  const rows = (): HTMLTableRowElement[] => Array.from(fixture.nativeElement.querySelectorAll('tr.we-grid__row'));
  const cell = (row: number, col: number): HTMLElement => rows()[row].querySelectorAll('td')[col] as HTMLElement;
  const menu = (action: WeGridMenuAction) => (host.grid as unknown as { handleMenuAction(a: WeGridMenuAction): void }).handleMenuAction(action);

  beforeEach(() => {
    store = new MemoryStore();
    TestBed.configureTestingModule({
      imports: [FormatHostComponent],
      providers: [{ provide: WE_GRID_LAYOUT_STORE, useValue: store }]
    });
    fixture = TestBed.createComponent(FormatHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('applies the column style and matching rules to the cells', () => {
    expect(cell(0, 1).style.fontWeight).toBe('600');
    expect(cell(0, 1).style.background).toBe('');
    expect(cell(1, 1).style.background).toContain('--we-grid-format-red-bg');
    expect(cell(1, 0).style.background).toBe('');
  });

  it('tints every other row when striped', () => {
    expect(rows().some((r) => r.classList.contains('we-grid__row--alt'))).toBeFalse();
    host.striped = true;
    fixture.detectChanges();
    expect(rows().map((r) => r.classList.contains('we-grid__row--alt'))).toEqual([false, true, false]);
  });

  it('saves the user zebra choice and rules with the layout, and resets them', async () => {
    const grid = host.grid;
    menu({ type: 'toggle-striped' });
    grid.onFormatRulesChange([{ id: 'x', field: 'name', type: 'condition', operator: 'contains', value: 'et', style: { italic: true } }]);
    await new Promise((r) => setTimeout(r, 1200));
    expect(store.saved?.striped).toBeTrue();
    expect(store.saved?.formatRules?.[0].id).toBe('x');
    fixture.detectChanges();
    expect(cell(1, 0).style.fontStyle).toBe('italic');
    expect(cell(1, 1).style.background).toBe('');

    menu({ type: 'reset-layout' });
    fixture.detectChanges();
    expect(grid.stripedActive).toBeFalse();
    expect(grid.activeFormatRules).toBe(host.rules);
  });

  it('opens the format panel from the menu and applies a style change at once', () => {
    menu({ type: 'format', field: 'name' });
    fixture.detectChanges();
    const panel: HTMLElement = fixture.nativeElement.querySelector('we-grid-format-panel');
    expect(panel).toBeTruthy();
    (panel.querySelector('.we-grid-format__flag--italic') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(cell(0, 0).style.fontStyle).toBe('italic');
    (panel.querySelector('.we-grid-form__footer .we-grid-form__btn--primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('we-grid-format-panel')).toBeNull();
  });

  it('carries formatting in a saved view', () => {
    const grid = host.grid;
    menu({ type: 'toggle-striped' });
    const view = grid.getCurrentView('v');
    expect(view.striped).toBeTrue();
    expect(view.formatRules?.length).toBe(1);
    menu({ type: 'toggle-striped' });
    grid.applyView({ ...view, formatRules: [] });
    fixture.detectChanges();
    expect(grid.stripedActive).toBeTrue();
    expect(cell(1, 1).style.background).toBe('');
  });

  it('draws icon sets through CSS variables on the cell', () => {
    host.grid.onFormatRulesChange([{ id: 'i', field: 'amount', type: 'iconSet', icons: 'arrows' }]);
    fixture.detectChanges();
    expect(cell(1, 1).style.getPropertyValue('--we-grid-cell-icon')).toContain('data:image/svg+xml');
    expect(cell(1, 1).style.getPropertyValue('--we-grid-cell-icon-color')).toContain('--we-grid-format-green-fg');
    expect(getComputedStyle(cell(1, 1), '::before').width).not.toBe('auto');
  });

  it('evaluates formula rules against the row', () => {
    host.grid.onFormatRulesChange([{ id: 'f', field: 'name', type: 'condition', operator: 'formula', value: '=[Amount] < 50', style: { color: 'blue' } }]);
    fixture.detectChanges();
    expect(cell(0, 0).style.color).toContain('--we-grid-format-blue-fg');
    expect(cell(2, 0).style.color).toBe('');
  });
});
