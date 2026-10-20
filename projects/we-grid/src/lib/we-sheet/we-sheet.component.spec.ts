import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { WeSheetComponent } from './we-sheet.component';
import { WE_SHEET_STORE, WeSheetData, WeSheetStore } from './we-sheet.model';

class MemorySheetStore implements WeSheetStore {
  saved = new Map<string, WeSheetData>();
  load(key: string): Observable<WeSheetData | null> {
    return of(this.saved.get(key) ?? null);
  }
  save(key: string, data: WeSheetData): Observable<void> {
    this.saved.set(key, data);
    return of(undefined);
  }
}

@Component({
  standalone: true,
  imports: [WeSheetComponent],
  template: `<we-sheet [sheetKey]="key" [rows]="6" [cols]="4" (dataChange)="changes = changes + 1" />`
})
class SheetHostComponent {
  key = 'spec-sheet';
  changes = 0;
  @ViewChild(WeSheetComponent) sheet!: WeSheetComponent;
}

describe('WeSheetComponent', () => {
  let fixture: ComponentFixture<SheetHostComponent>;
  let host: SheetHostComponent;
  let store: MemorySheetStore;
  const sheet = () => host.sheet;
  const el = (): HTMLElement => fixture.nativeElement.querySelector('we-sheet');
  const cellEl = (address: string): HTMLElement => el().querySelector(`[data-cell="${address}"]`)!;
  const text = (address: string) => cellEl(address).textContent!.trim();
  const key = (k: string, init: KeyboardEventInit = {}) => {
    const target = (document.activeElement as HTMLElement) ?? el();
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
    fixture.detectChanges();
  };
  const click = (address: string, shiftKey = false) => {
    cellEl(address).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, shiftKey }));
    document.dispatchEvent(new MouseEvent('mouseup'));
    fixture.detectChanges();
  };

  beforeEach(() => {
    store = new MemorySheetStore();
    TestBed.configureTestingModule({ imports: [SheetHostComponent], providers: [{ provide: WE_SHEET_STORE, useValue: store }] });
    fixture = TestBed.createComponent(SheetHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders an empty sheet of the requested size', () => {
    expect(el().querySelectorAll('td').length).toBe(24);
    expect(el().querySelector('.we-sheet__name')!.getAttribute('value') ?? (el().querySelector('.we-sheet__name') as HTMLInputElement).value).toBe('A1');
  });

  it('names the active cell to assistive technology', () => {
    const grid = el().querySelector<HTMLElement>('[role="grid"]')!;
    expect(grid.classList).toContain('we-sheet__scroll');
    sheet().select('B3');
    fixture.detectChanges();
    expect(document.getElementById(grid.getAttribute('aria-activedescendant')!)?.getAttribute('data-cell')).toBe('B3');
  });

  it('evaluates formulas and recalculates when an input changes', () => {
    sheet().setCell('A1', '2');
    sheet().setCell('A2', '3');
    sheet().setCell('A3', '=SUM(A1:A2)*10');
    fixture.detectChanges();
    expect(text('A3')).toBe('50');
    sheet().setCell('A1', '7');
    fixture.detectChanges();
    expect(text('A3')).toBe('100');
    sheet().setCell('B1', '=1/0');
    fixture.detectChanges();
    expect(text('B1')).toBe('#DIV/0!');
  });

  it('types into the active cell, commits with Enter and moves down', () => {
    click('B2');
    el().querySelector<HTMLElement>('.we-sheet__scroll')!.focus();
    key('4');
    const editor = el().querySelector<HTMLInputElement>('.we-sheet__editor')!;
    expect(editor.value).toBe('4');
    editor.value = '42';
    editor.dispatchEvent(new Event('input'));
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(sheet().getValue('B2')).toBe(42);
    expect(sheet().selectionLabel).toBe('B3');
  });

  it('undoes and redoes edits', () => {
    sheet().setCell('A1', 'one');
    sheet().setCell('A1', 'two');
    sheet().undo();
    expect(sheet().getValue('A1')).toBe('one');
    sheet().redo();
    expect(sheet().getValue('A1')).toBe('two');
  });

  it('selects a range with Shift and shows its statistics', () => {
    sheet().setCell('A1', '1');
    sheet().setCell('A2', '2');
    sheet().setCell('A3', '3');
    fixture.detectChanges();
    click('A1');
    click('A3', true);
    expect(sheet().selectionLabel).toBe('A1:A3');
    expect(el().querySelector('.we-sheet__status')!.textContent).toContain('6');
  });

  it('fills down with relative references shifted', () => {
    sheet().setCell('A1', '5');
    sheet().setCell('A2', '6');
    sheet().setCell('B1', '=A1*2');
    sheet().select('B1:B2');
    sheet().fillDown();
    expect(sheet().getData().cells['B2'].v).toBe('=A2*2');
    expect(sheet().getValue('B2')).toBe(12);
  });

  it('keeps text-formatted input as text', () => {
    sheet().select('A1');
    sheet().setFormat('text');
    sheet().setCell('A1', '0012');
    expect(sheet().getValue('A1')).toBe('0012');
    sheet().setCell('A2', "'007");
    expect(sheet().getValue('A2')).toBe('007');
  });

  it('pastes a cut without shifting its references, and only once', () => {
    sheet().setCell('A1', 4);
    sheet().setCell('C1', '=A1');
    sheet().select('C1');
    const scroll = el().querySelector('.we-sheet__scroll')!;
    const data = new DataTransfer();
    scroll.dispatchEvent(new ClipboardEvent('cut', { clipboardData: data, bubbles: true, cancelable: true }));
    sheet().select('C3');
    scroll.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    expect(sheet().getData().cells['C3'].v).toBe('=A1');
    expect(sheet().getData().cells['C1']).toBeUndefined();
  });

  it('pastes values only after Ctrl+Shift+V', () => {
    sheet().setCell('A1', 4);
    sheet().setCell('B1', '=A1*2');
    sheet().select('B1');
    const scroll = el().querySelector('.we-sheet__scroll')!;
    const data = new DataTransfer();
    scroll.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
    sheet().select('C2');
    scroll.dispatchEvent(new KeyboardEvent('keydown', { key: 'V', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    scroll.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    expect(sheet().getData().cells['C2'].v).toBe(8);
    sheet().select('C3');
    scroll.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    expect(sheet().getData().cells['C3'].v).toBe('=B3*2');
  });

  it('refuses to insert rows that would push content off a full sheet', () => {
    sheet().setData({ version: 1, rows: 5000, cols: 2, cells: { A1: { v: 1 }, A5000: { v: 'last' } } });
    sheet().select('A1');
    sheet().insertRows('before');
    expect(sheet().getValue('A5000')).toBe('last');
    expect(sheet().getValue('A1')).toBe(1);
  });

  it('fills by dragging the handle at the selection corner, and down by double-clicking it', () => {
    sheet().setCell('A1', 1);
    sheet().setCell('A2', 2);
    sheet().select('A1:A2');
    fixture.detectChanges();
    const handle = () => el().querySelector<HTMLElement>('.we-sheet__fill')!;
    expect(handle().parentElement!.getAttribute('data-cell')).toBe('A2');
    handle().dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    cellEl('A4').dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(cellEl('A3').classList).toContain('we-sheet__cell--fill');
    document.dispatchEvent(new MouseEvent('mouseup'));
    fixture.detectChanges();
    expect(['A3', 'A4'].map((a) => sheet().getValue(a))).toEqual([3, 4]);
    expect(sheet().selectionLabel).toBe('A1:A4');

    sheet().setCell('B1', '=A1*2');
    sheet().select('B1');
    fixture.detectChanges();
    handle().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(['B2', 'B3', 'B4', 'B5'].map((a) => sheet().getValue(a))).toEqual([4, 6, 8, null]);
  });

  it('filters rows from a header cell and skips the hidden rows with the arrow keys', () => {
    sheet().setData({
      version: 1, rows: 8, cols: 3, headerRow: true, autoFilter: true,
      cells: { A1: { v: 'City' }, A2: { v: 'Izmir' }, A3: { v: 'Ankara' }, A4: { v: 'Izmir' }, A5: { v: 'Bursa' }, B1: { v: 'Qty' }, B2: { v: 1 } }
    });
    fixture.detectChanges();
    const btn = cellEl('A1').querySelector<HTMLElement>('.we-sheet__filter-btn')!;
    expect(btn.getAttribute('aria-label')).toBe('Filter “City”');
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(sheet().filterMenu!.values.map((v) => v.label)).toEqual(['Ankara', 'Bursa', 'Izmir']);
    sheet().filterMenu!.values[1].shown = false;
    sheet().filterMenu!.values[2].shown = false;
    sheet().applyFilter();
    fixture.detectChanges();
    expect(sheet().getData().filters).toEqual({ A: ['Bursa', 'Izmir'] });
    expect(['A2', 'A3', 'A4', 'A5', 'A6'].map((a) => !!cellEl(a))).toEqual([false, true, false, false, true]);
    expect(cellEl('A1').querySelector('.we-sheet__filter-btn--on')).toBeTruthy();
    sheet().select('A1');
    el().querySelector('.we-sheet__scroll')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    el().querySelector('.we-sheet__scroll')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(sheet().selectionLabel).toBe('A6');
    sheet().select('A1:B4');
    expect(el().querySelector('.we-sheet__status')!.textContent).not.toContain('Sum');
    const data = new DataTransfer();
    el().querySelector('.we-sheet__scroll')!.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
    expect(data.getData('text/plain')).toBe(['City\tQty', 'Ankara\t'].join('\n'));
    sheet().select('A1');
    el().querySelector('.we-sheet__scroll')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true }));
    expect(sheet().filterMenu?.col).toBe(0);
    sheet().closeFilter();
    sheet().toggleAutoFilter();
    fixture.detectChanges();
    expect(sheet().getData().filters).toBeUndefined();
    expect(cellEl('A2')).toBeTruthy();
  });

  it('keeps hidden rows out of edits, moves and pastes, and moves filters with their column', () => {
    sheet().setData({
      version: 1, rows: 8, cols: 3, headerRow: true, autoFilter: true, filters: { A: ['x'] },
      cells: { A1: { v: 'K' }, A2: { v: 'a' }, A3: { v: 'x' }, A4: { v: 'b' }, B2: { v: '=C2' }, B3: { v: 7 }, B4: { v: '=C4' }, C2: { v: 1 }, C4: { v: 0 } }
    });
    fixture.detectChanges();
    expect(cellEl('A3')).toBeNull();
    // Enter from the editor skips the hidden row
    sheet().select('A2');
    sheet().startEdit('z');
    el().querySelector<HTMLInputElement>('.we-sheet__editor')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(sheet().selectionLabel).toBe('A4');
    // Delete over the range clears the shown rows only; Ctrl+D fills them only
    sheet().select('B2:B4');
    sheet().clearContents();
    expect(sheet().getValue('B3')).toBe(7);
    sheet().setCell('B2', '=C2*2');
    sheet().select('B2:B4');
    sheet().fillDown();
    expect([sheet().getData().cells['B3'].v, sheet().getData().cells['B4'].v]).toEqual([7, '=C4*2']);
    // A filtered copy shifts each row from its own source row
    sheet().select('B2:B4');
    const scroll = el().querySelector('.we-sheet__scroll')!;
    const data = new DataTransfer();
    scroll.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
    sheet().toggleAutoFilter();
    sheet().select('C5');
    scroll.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    expect([sheet().getData().cells['C5'].v, sheet().getData().cells['C6'].v]).toEqual(['=D5*2', '=D6*2']);
    // Clear formatting keeps lists and notes
    sheet().setData({ version: 1, rows: 4, cols: 2, cells: { A1: { v: 'a', l: ['a', 'b'], n: 'note', s: { bold: true } } } });
    sheet().select('A1');
    sheet().clearFormatting();
    expect(sheet().getData().cells['A1']).toEqual({ v: 'a', l: ['a', 'b'], n: 'note' });
  });

  it('formats a column range conditionally through the Format panel', () => {
    sheet().setData({ version: 1, rows: 6, cols: 3, headerRow: true, cells: { A1: { v: 'Qty' }, A2: { v: 5 }, A3: { v: 50 }, A4: { v: '=A2*20' } } });
    sheet().select('A2');
    sheet().openFormatPanel();
    fixture.detectChanges();
    expect(sheet().formatPanel?.range).toBe('A2:A4');
    expect(el().querySelector('.we-grid-form__title')!.textContent).toContain('A2:A4');
    expect(el().querySelector('we-grid-format-panel .we-grid-format__flags')).toBeNull();
    sheet().onFormatRulesChange([{ id: 'r1', field: 'A', type: 'condition', operator: 'gt', value: 20, style: { fill: 'green' } }]);
    sheet().closeFormatPanel();
    fixture.detectChanges();
    expect(cellEl('A2').style.background).toBe('');
    expect(cellEl('A3').style.background).toContain('--we-grid-format-green-bg');
    expect(cellEl('A4').style.background).toContain('--we-grid-format-green-bg');
    sheet().setCell('A2', 99);
    fixture.detectChanges();
    expect(cellEl('A2').style.background).toContain('--we-grid-format-green-bg');
    expect(sheet().getData().formats).toEqual([jasmine.objectContaining({ range: 'A2:A4', field: 'A', operator: 'gt' })]);
  });

  it('adds a note to a cell, marks it and shows it on hover', () => {
    sheet().select('B2');
    sheet().openListEditor('note');
    fixture.detectChanges();
    const editor = el().querySelector<HTMLElement>('.we-sheet__list-editor')!;
    expect(editor.getAttribute('aria-label')).toBe('Note…');
    editor.querySelector('textarea')!.value = '  Checked with finance  ';
    editor.querySelector<HTMLButtonElement>('.we-sheet__list-save')!.click();
    fixture.detectChanges();
    expect(sheet().getData().cells['B2'].n).toBe('Checked with finance');
    expect(cellEl('B2').querySelector('.we-sheet__note-mark')).toBeTruthy();
    expect(cellEl('B2').getAttribute('title')).toBe('Checked with finance');
    sheet().saveNote('');
    fixture.detectChanges();
    expect(sheet().getData().cells['B2']).toBeUndefined();
    expect(cellEl('B2').hasAttribute('title')).toBeFalse();
  });

  it('fills a series down from the context menu, for keyboard users', () => {
    sheet().setCell('A1', 5);
    sheet().setCell('A2', 10);
    sheet().select('A1:A4');
    sheet().fillSeries();
    expect(['A3', 'A4'].map((a) => sheet().getValue(a))).toEqual([15, 20]);
  });

  it('gives cells a dropdown list, takes only its choices and picks them from the keyboard', () => {
    sheet().select('A1:A2');
    sheet().openMenu(10, 10);
    fixture.detectChanges();
    sheet().openListEditor();
    fixture.detectChanges();
    const editor = el().querySelector<HTMLElement>('.we-sheet__list-editor')!;
    editor.querySelector('textarea')!.value = ['Open', 'Closed', '', 'open'].join('\n');
    editor.querySelector<HTMLButtonElement>('.we-sheet__list-save')!.click();
    fixture.detectChanges();
    expect(sheet().getData().cells['A2'].l).toEqual(['Open', 'Closed']);

    sheet().select('A1');
    sheet().startEdit('maybe');
    sheet().commitEdit();
    expect(sheet().getValue('A1')).toBeNull();
    sheet().startEdit('closed');
    sheet().commitEdit();
    expect(sheet().getValue('A1')).toBe('Closed');

    fixture.detectChanges();
    expect(cellEl('A1').querySelector('.we-sheet__pick-btn')).toBeTruthy();
    const gridKey = (k: string, init: KeyboardEventInit = {}) => {
      el().querySelector('.we-sheet__scroll')!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
      fixture.detectChanges();
    };
    gridKey('ArrowDown', { altKey: true });
    expect(el().querySelectorAll('.we-sheet__picker [role="option"]').length).toBe(2);
    gridKey('ArrowUp');
    gridKey('Enter');
    expect(sheet().getValue('A1')).toBe('Open');
    expect(el().querySelector('.we-sheet__picker')).toBeNull();
  });

  it('sorts the used rows below the header row', () => {
    sheet().setData({ version: 1, rows: 6, cols: 4, headerRow: true, cells: { A1: { v: 'Name' }, A2: { v: 'b' }, A3: { v: 'c' }, A4: { v: 'a' } } });
    sheet().select('A2');
    sheet().sort('asc');
    expect(['A1', 'A2', 'A3', 'A4'].map((a) => sheet().getValue(a))).toEqual(['Name', 'a', 'b', 'c']);
  });

  it('pastes a table copied from another program as typed values', () => {
    sheet().select('B2');
    const data = new DataTransfer();
    data.setData('text/plain', 'x\t1.5\n=B3\t');
    el().querySelector('.we-sheet__scroll')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    expect(sheet().getValue('B2')).toBe('x');
    expect(sheet().getValue('C2')).toBe(1.5);
    expect(sheet().getData().cells['B3'].v).toBe('=B3');
    expect(sheet().getValue('B3')).toEqual(jasmine.objectContaining({ code: '#CIRC!' }));
  });

  it('styles the selection from the toolbar and keeps the style in the data', () => {
    sheet().setCell('A1', 'x');
    sheet().select('A1');
    el().querySelector<HTMLButtonElement>('.we-sheet__btn--bold')!.click();
    fixture.detectChanges();
    expect(sheet().getData().cells['A1'].s).toEqual({ bold: true });
    expect(cellEl('A1').style.fontWeight).toBe('600');
  });

  it('saves through the store and restores from it', async () => {
    sheet().setCell('A1', 'kept');
    await new Promise((r) => setTimeout(r, 1000));
    expect(store.saved.get('spec-sheet')?.cells['A1'].v).toBe('kept');
    expect(host.changes).toBeGreaterThan(0);

    const again = TestBed.createComponent(SheetHostComponent);
    again.detectChanges();
    expect(again.componentInstance.sheet.getValue('A1')).toBe('kept');
  });

  it('exports the used range with row 1 as the header', () => {
    sheet().setData({ version: 1, rows: 6, cols: 4, headerRow: true, cells: { A1: { v: 'Qty' }, B1: { v: 'Name' }, A2: { v: 2 }, B2: { v: 'x' }, A3: { v: '=A2*2' } } });
    const table = sheet().buildExportTable();
    expect(table.columns.map((c) => [c.header, c.type])).toEqual([
      ['Qty', 'number'],
      ['Name', 'text']
    ]);
    expect(table.rows.map((r) => r.values)).toEqual([
      [2, 'x'],
      [4, null]
    ]);
  });
});
