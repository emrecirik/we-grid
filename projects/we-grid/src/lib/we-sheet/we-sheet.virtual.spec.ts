import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { WeSheetComponent } from './we-sheet.component';
import { WeWorkbookComponent, WeWorkbookData } from './we-workbook.component';
import { WE_SHEET_STORE, WeSheetData, WeSheetStore } from './we-sheet.model';
import { weGridColumnLetter } from '../services/we-grid-formula.util';

class NullStore implements WeSheetStore {
  load(): Observable<WeSheetData | null> {
    return of(null);
  }
  save(): Observable<void> {
    return of(undefined);
  }
}

// Small enough that no spec holds the browser for long: 300 × 30 already needs both windows in an
// 800 × 400 sheet. Only the first spec builds 1000 × 70, and only with the windows on.
function sheetOf(rows: number, cols: number, extra: Partial<WeSheetData> = {}): WeSheetData {
  const cells: WeSheetData['cells'] = {};
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells[`${weGridColumnLetter(c)}${r + 1}`] = { v: r * cols + c };
  return { version: 1, rows, cols, cells, ...extra };
}

@Component({
  standalone: true,
  imports: [WeSheetComponent],
  template: `<div style="width: 800px"><we-sheet [data]="data" [height]="400" [virtualScroll]="virtual" [virtualColumns]="virtual" /></div>`
})
class HostComponent {
  data = sheetOf(300, 30);
  virtual = true;
  @ViewChild(WeSheetComponent) sheet!: WeSheetComponent;
}

describe('WeSheetComponent — virtualScroll and virtualColumns', () => {
  let fixture: ComponentFixture<HostComponent> | null = null;
  let sheet: WeSheetComponent;

  const el = (): HTMLElement => fixture!.nativeElement;
  const box = (): HTMLElement => el().querySelector('.we-sheet__scroll')!;
  const rows = (): HTMLElement[] => Array.from(el().querySelectorAll<HTMLElement>('tbody > tr:not(.we-sheet__pad-row)'));
  const cell = (address: string): HTMLElement | null => el().querySelector(`[data-cell="${address}"]`);
  const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  const settle = async (): Promise<void> => {
    fixture!.detectChanges();
    await fixture!.whenStable();
    await frame();
    fixture!.detectChanges();
  };
  const scrollTo = async (top: number, left = box().scrollLeft): Promise<void> => {
    box().scrollTop = top;
    box().scrollLeft = left;
    box().dispatchEvent(new Event('scroll'));
    await settle();
  };
  const key = async (k: string, init: KeyboardEventInit = {}, target: HTMLElement = box()): Promise<void> => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
    fixture!.detectChanges();
    await Promise.resolve();
    await settle();
  };
  const inView = (target: HTMLElement): boolean => {
    const a = target.getBoundingClientRect();
    const b = box().getBoundingClientRect();
    return a.bottom > b.top && a.top < b.bottom && a.right > b.left && a.left < b.right;
  };
  /** Where a cell sits in the table — the same with or without the windows */
  const offset = (target: HTMLElement): { top: number; left: number } => {
    const t = el().querySelector('.we-sheet__table')!.getBoundingClientRect();
    const a = target.getBoundingClientRect();
    return { top: Math.round(a.top - t.top), left: Math.round(a.left - t.left) };
  };
  const head = (): number => el().querySelector<HTMLElement>('thead')!.offsetHeight;
  const rowHead = (): number => el().querySelector<HTMLElement>('.we-sheet__corner')!.offsetWidth;
  const create = async (setup: (h: HostComponent) => void = () => undefined): Promise<void> => {
    fixture = TestBed.createComponent(HostComponent);
    setup(fixture.componentInstance);
    document.body.appendChild(el());
    await settle();
    sheet = fixture.componentInstance.sheet;
  };
  const destroy = (): void => {
    fixture!.destroy();
    el().remove();
    fixture = null;
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent], providers: [{ provide: WE_SHEET_STORE, useClass: NullStore }] });
  });

  afterEach(() => {
    if (fixture) destroy();
  });

  it('draws a bounded window of 1000 × 70, with spacers making up the full size (first render logged)', async () => {
    fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.data = sheetOf(1000, 70);
    document.body.appendChild(el());
    const start = performance.now();
    fixture.detectChanges();
    void el().offsetHeight;
    const ms = performance.now() - start;
    // eslint-disable-next-line no-console
    console.log(`[we-sheet] first render of 1000 × 70 with the windows: ${ms.toFixed(1)} ms`);
    await settle();
    expect(rows().length).toBeGreaterThan(5);
    expect(rows().length).toBeLessThan(60);
    const cells = rows()[0].querySelectorAll('td.we-sheet__cell').length;
    expect(cells).toBeGreaterThan(5);
    expect(cells).toBeLessThan(20);
    expect(box().scrollHeight).toBe(head() + 1000 * rows()[0].offsetHeight);
    expect(box().scrollWidth).toBe(rowHead() + 70 * 104);
  });

  it('timing: first render without the windows, a small sample (logged)', () => {
    const f = TestBed.createComponent(HostComponent);
    f.componentInstance.data = sheetOf(30, 70);
    f.componentInstance.virtual = false;
    document.body.appendChild(f.nativeElement);
    const start = performance.now();
    f.detectChanges();
    void (f.nativeElement as HTMLElement).offsetHeight;
    const ms = performance.now() - start;
    // eslint-disable-next-line no-console
    console.log(`[we-sheet] first render of 30 × 70 without the windows: ${ms.toFixed(1)} ms (grows with the rows)`);
    f.destroy();
    (f.nativeElement as HTMLElement).remove();
    expect(ms).toBeGreaterThan(0);
  });

  it('moves the window with the scroll position, keeping rows and columns where they belong', async () => {
    await create();
    const rowPx = rows()[0].offsetHeight;
    await scrollTo(200 * rowPx, 20 * 104);
    const target = cell('U201');
    expect(target).not.toBeNull();
    expect(cell('A1')).toBeNull();
    expect(target!.getAttribute('aria-rowindex')).toBe('202');
    expect(offset(target!)).toEqual({ top: head() + 200 * rowPx, left: rowHead() + 20 * 104 });
    expect(rows().length).toBeLessThan(60);
  });

  it('lays a sheet out exactly as without the windows — custom heights, widths and hidden rows included', async () => {
    const data = sheetOf(120, 20, { heights: { '30': 60, '90': 45 }, widths: { C: 200, P: 50 }, hidden: [10, 11], hiddenColumns: ['E'] });
    const measure = async (virtual: boolean): Promise<{ height: number; width: number; at: { top: number; left: number } }> => {
      await create((h) => {
        h.data = data;
        h.virtual = virtual;
      });
      await scrollTo(90 * 29, 12 * 104);
      // The table, not the scroll box: the last row's resize grip pokes 2px below it, and only off is that row drawn
      const table = el().querySelector<HTMLElement>('.we-sheet__table')!;
      const result = { height: table.offsetHeight, width: table.offsetWidth, at: offset(cell('S100')!) };
      destroy();
      return result;
    };
    const off = await measure(false);
    const on = await measure(true);
    expect(on).toEqual(off);
  });

  it('always draws frozen rows and columns, stuck in place', async () => {
    await create((h) => (h.data = sheetOf(300, 30, { freeze: { rows: 2, cols: 1 } })));
    await scrollTo(5000, 1500);
    expect(cell('A1')).not.toBeNull();
    expect(cell('A2')).not.toBeNull();
    expect(cell('P2')).not.toBeNull();
    expect(inView(cell('A1')!)).toBeTrue();
    expect(inView(cell('P2')!)).toBeTrue();
    // Column A is drawn in a scrolled-to row too, stuck at the left edge
    const first = rows().at(-1)!.querySelector<HTMLElement>('td.we-sheet__cell')!;
    expect(first.getAttribute('data-cell')).toMatch(/^A\d+$/);
    expect(first.classList).toContain('we-sheet__cell--frozen-col');
  });

  it('draws a merge whose first row is above the window whole', async () => {
    await create((h) => (h.data = sheetOf(300, 30, { merges: ['A100:B140'] })));
    const rowPx = rows()[0].offsetHeight;
    await scrollTo(130 * rowPx);
    const anchor = cell('A100');
    expect(anchor).not.toBeNull();
    expect(anchor!.getAttribute('rowspan')).toBe('41');
    expect(anchor!.getAttribute('colspan')).toBe('2');
    expect(offset(cell('C141')!).top).toBe(head() + 140 * rowPx);
  });

  it('a title merged across every column holds the columns only while its row is drawn', async () => {
    await create((h) => (h.data = sheetOf(300, 30, { merges: ['A1:AD1'] })));
    expect(rows()[1].querySelectorAll('td.we-sheet__cell').length).toBe(30);
    await scrollTo(3000);
    expect(cell('A1')).toBeNull();
    expect(rows()[0].querySelectorAll('td.we-sheet__cell').length).toBeLessThan(20);
  });

  it('Ctrl+arrows jump to a far cell, draw it and make it the active cell', async () => {
    await create();
    sheet.select('A1');
    await key('ArrowDown', { ctrlKey: true });
    expect(sheet.selectionLabel).toBe('A300');
    expect(inView(cell('A300')!)).toBeTrue();
    await key('ArrowRight', { ctrlKey: true });
    expect(sheet.selectionLabel).toBe('AD300');
    expect(cell('AD300')!.classList).toContain('we-sheet__cell--active');
    expect(inView(cell('AD300')!)).toBeTrue();
    expect(el().querySelector<HTMLInputElement>('.we-sheet__formula')!.value).toBe(String(299 * 30 + 29));
    expect(box().getAttribute('aria-activedescendant')).toBe(cell('AD300')!.id);
  });

  it('find jumps to a far cell and draws it', async () => {
    await create((h) => (h.data.cells['AB250'] = { v: 'needle' }));
    await key('f', { ctrlKey: true });
    sheet.onFindInput('needle');
    await settle();
    expect(sheet.selectionLabel).toBe('AB250');
    expect(inView(cell('AB250')!)).toBeTrue();
  });

  it('copies a range reaching far past the drawn rows from the content, not the DOM', async () => {
    await create();
    sheet.select('A1:B250');
    const data = new DataTransfer();
    box().dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
    const lines = data.getData('text/plain').split('\n');
    expect(lines.length).toBe(250);
    expect(lines[249]).toBe(`${249 * 30}\t${249 * 30 + 1}`);
  });

  it('keeps the fill handle, selection and inserted rows working in the window', async () => {
    await create();
    sheet.select('C250:D251');
    await settle();
    expect(cell('C250')!.classList).toContain('we-sheet__cell--sel');
    expect(cell('D251')!.querySelector('.we-sheet__fill')).not.toBeNull();
    sheet.insertRows('before');
    await settle();
    expect(sheet.getData().rows).toBe(302);
    const rowPx = rows()[0].offsetHeight;
    expect(offset(cell('C252')!).top).toBe(head() + 251 * rowPx);
  });

  it('keeps a cell being edited — and its editor — in the DOM while the sheet scrolls away', async () => {
    await create();
    sheet.select('B10');
    await key('7');
    const editor = el().querySelector<HTMLInputElement>('.we-sheet__editor')!;
    expect(document.activeElement).toBe(editor);
    const rowPx = rows()[0].offsetHeight;
    await scrollTo(200 * rowPx);
    expect(editor.isConnected).toBeTrue();
    expect(document.activeElement).toBe(editor);
    // The rows around it still sit where they belong
    expect(offset(cell('B201')!).top).toBe(head() + 200 * rowPx);
    await key('Enter', {}, editor);
    expect(sheet.getValue('B10')).toBe(7);
    expect(sheet.editing).toBeNull();
  });

  it('typing on an active cell scrolled out of view brings it back and opens the editor', async () => {
    await create();
    sheet.select('B10');
    await settle();
    await scrollTo(5000, 1500);
    expect(cell('B10')).toBeNull();
    expect(box().getAttribute('aria-activedescendant')).toBeNull();
    await key('5');
    const editor = el().querySelector<HTMLInputElement>('.we-sheet__editor');
    expect(editor).not.toBeNull();
    expect(document.activeElement).toBe(editor);
    expect(inView(cell('B10')!)).toBeTrue();
  });

  it('an edit keeps the measured heights of the rows above, so nothing jumps', async () => {
    const tall = 'a long text that wraps over several lines in a narrow column of the sheet';
    await create((h) => {
      for (let r = 2; r <= 8; r++) h.data.cells[`A${r}`] = { v: tall, w: true };
    });
    await scrollTo(3000);
    const pad = (): number => el().querySelector<HTMLElement>('tbody > tr.we-sheet__pad-row')!.offsetHeight;
    const before = pad();
    const anchor = offset(rows()[3]);
    sheet.setCell('C150', 'x');
    await settle();
    expect(pad()).toBe(before);
    expect(offset(rows()[3])).toEqual(anchor);
  });

  it('turned off, draws every row and column and no spacer', async () => {
    await create((h) => {
      h.data = sheetOf(60, 20);
      h.virtual = false;
    });
    expect(rows().length).toBe(60);
    expect(rows()[0].querySelectorAll('td.we-sheet__cell').length).toBe(20);
    expect(el().querySelector('.we-sheet__pad-row, .we-sheet__pad-cell')).toBeNull();
    fixture!.componentInstance.virtual = true;
    await settle();
    expect(rows().length).toBeLessThan(60);
  });
});

@Component({
  standalone: true,
  imports: [WeWorkbookComponent],
  template: `<we-workbook [data]="book" [virtualScroll]="true" [virtualColumns]="true" [height]="300" />`
})
class BookHostComponent {
  book: WeWorkbookData = {
    version: 1,
    active: 0,
    sheets: [
      { name: 'Big', data: sheetOf(300, 30) },
      { name: 'Small', data: sheetOf(40, 5) }
    ]
  };
}

describe('WeWorkbookComponent — virtualScroll and virtualColumns', () => {
  it('hands both to its sheet, and a tab switch starts the next sheet at the top', async () => {
    TestBed.configureTestingModule({ imports: [BookHostComponent], providers: [{ provide: WE_SHEET_STORE, useClass: NullStore }] });
    const fixture = TestBed.createComponent(BookHostComponent);
    document.body.appendChild(fixture.nativeElement);
    const settle = async (): Promise<void> => {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      fixture.detectChanges();
    };
    await settle();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('tbody > tr:not(.we-sheet__pad-row)').length).toBeLessThan(60);
    expect(el.querySelector('.we-sheet__pad-row')).not.toBeNull();
    const box = el.querySelector<HTMLElement>('.we-sheet__scroll')!;
    box.scrollTop = 4000;
    box.dispatchEvent(new Event('scroll'));
    await settle();
    el.querySelectorAll<HTMLElement>('.we-book__tab')[1].click();
    await settle();
    expect(box.scrollTop).toBe(0);
    expect(el.querySelector('[data-cell="A1"]')).not.toBeNull();
    fixture.destroy();
    el.remove();
  });
});
