import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { WE_SHEET_STORE, WeSheetData, WeSheetStore } from './we-sheet.model';
import { WeSheetComponent } from './we-sheet.component';
import { WeWorkbookComponent, weWorkbookSanitize } from './we-workbook.component';
import { weSheetWorkbookXlsx } from './we-sheet.util';

class MemoryStore implements WeSheetStore {
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
  imports: [WeWorkbookComponent],
  template: `<we-workbook workbookKey="spec-book" [rows]="5" [cols]="3" />`
})
class HostComponent {
  @ViewChild(WeWorkbookComponent) book!: WeWorkbookComponent;
}

describe('WeWorkbookComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let store: MemoryStore;
  const book = () => fixture.componentInstance.book;
  const sheet = (): WeSheetComponent => fixture.debugElement.query((d) => d.componentInstance instanceof WeSheetComponent).componentInstance;
  const tabs = (): string[] => Array.from(fixture.nativeElement.querySelectorAll('[role="tab"]') as NodeListOf<HTMLElement>).map((t) => t.textContent!.trim());

  beforeEach(() => {
    store = new MemoryStore();
    TestBed.configureTestingModule({ imports: [HostComponent], providers: [{ provide: WE_SHEET_STORE, useValue: store }] });
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('starts with one sheet and adds, renames, duplicates and deletes sheets', () => {
    expect(tabs()).toEqual(['Sheet1']);
    book().addSheet();
    fixture.detectChanges();
    expect(tabs()).toEqual(['Sheet1', 'Sheet2']);
    expect(book().getData().active).toBe(1);
    book().startRename(1);
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.we-book__rename'));
    book().finishRename(1, 'Budget');
    book().duplicateSheet(1);
    fixture.detectChanges();
    expect(tabs()).toEqual(['Sheet1', 'Budget', 'Budget (2)']);
    book().duplicateSheet(2);
    fixture.detectChanges();
    expect(tabs()).toEqual(['Sheet1', 'Budget', 'Budget (2)', 'Budget (3)']);
    book().deleteSheet(0);
    fixture.detectChanges();
    expect(tabs()).toEqual(['Budget', 'Budget (2)', 'Budget (3)']);
  });

  it('deletes an empty sheet at once and asks before deleting one with content', () => {
    const el = fixture.nativeElement as HTMLElement;
    const trash = () => el.querySelector<HTMLButtonElement>('button[aria-label="Delete sheet"]')!;
    book().addSheet();
    fixture.detectChanges();
    trash().click();
    fixture.detectChanges();
    expect(tabs()).toEqual(['Sheet1']);

    sheet().setCell('A1', 'keep');
    book().addSheet();
    book().activate(0);
    fixture.detectChanges();
    trash().click();
    fixture.detectChanges();
    expect(tabs()).toEqual(['Sheet1', 'Sheet2']);
    // Focus lands on the safe answer straight away — no microtask that event coalescing would outrun
    expect(document.activeElement).toBe(el.querySelector('.we-book__confirm-no'));
    el.querySelector<HTMLButtonElement>('.we-book__confirm-no')!.click();
    fixture.detectChanges();
    expect(el.querySelector('.we-book__confirm')).toBeNull();
    expect(tabs()).toEqual(['Sheet1', 'Sheet2']);

    trash().click();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.we-book__confirm-yes')!.click();
    fixture.detectChanges();
    expect(tabs()).toEqual(['Sheet2']);
  });

  it('moves other sheets’ references when rows are inserted into a sheet', () => {
    sheet().setCell('B1', 5);
    book().addSheet();
    fixture.detectChanges();
    sheet().setCell('A1', '=Sheet1!B1');
    book().activate(0);
    fixture.detectChanges();
    sheet().select('A1');
    sheet().insertRows('before');
    fixture.detectChanges();
    expect(book().getData().sheets[1].data.cells['A1'].v).toBe('=Sheet1!B2');
    book().activate(1);
    fixture.detectChanges();
    expect(sheet().getValue('A1')).toBe(5);
  });

  it('adds the sheets of an Excel file, renaming taken names and the formulas that use them', () => {
    book().importSheets([
      { name: 'Sheet1', cells: { A1: '5' } },
      { name: 'Data', cells: { A1: '=Sheet1!A1*2', B3: 'x' } }
    ]);
    fixture.detectChanges();
    expect(tabs()).toEqual(['Sheet1', 'Sheet1 2', 'Data']);
    expect(book().getData().active).toBe(1);
    const data = book().getData().sheets[2].data;
    expect(data.cells['A1'].v).toBe("='Sheet1 2'!A1*2");
    // Renames happen once each: Sheet1 → "Sheet1 2" is not renamed again as the file's own "Sheet1 2"
    book().importSheets([
      { name: 'Data', cells: { A1: '1' } },
      { name: 'Data 2', cells: { A1: '2' } },
      { name: 'Use', cells: { A1: '=Data!A1+\'Data 2\'!A1' } }
    ]);
    const use = book().getData().sheets.find((s) => s.name === 'Use')!;
    expect(use.data.cells['A1'].v).toBe("='Data 2'!A1+'Data 2 2'!A1");
    book().activate(2);
    fixture.detectChanges();
    expect(sheet().getValue('A1')).toBe(10);
  });

  it('keeps each sheet’s cells and saves the workbook under one key', async () => {
    sheet().setCell('A1', 'first');
    book().addSheet();
    fixture.detectChanges();
    expect(sheet().getValue('A1')).toBeNull();
    sheet().setCell('A1', '=2*21');
    book().activate(0);
    fixture.detectChanges();
    expect(sheet().getValue('A1')).toBe('first');
    book().activate(1);
    fixture.detectChanges();
    expect(sheet().getValue('A1')).toBe(42);
    await new Promise((r) => setTimeout(r, 1000));
    const saved = store.saved.get('book:spec-book') as unknown as { sheets: { data: WeSheetData }[] };
    expect(saved.sheets.map((s) => s.data.cells['A1']?.v)).toEqual(['first', '=2*21']);
  });

  it('moves sheets and sanitises stored workbooks', () => {
    book().addSheet();
    book().moveSheet(1, -1);
    fixture.detectChanges();
    expect(tabs()).toEqual(['Sheet2', 'Sheet1']);
    expect(weWorkbookSanitize({ sheets: [{ name: ' x ', data: { rows: 2, cols: 2, cells: {} } }, { name: 'bad' }], active: 9 })).toEqual({
      version: 1,
      sheets: [{ name: 'x', data: { version: 1, rows: 2, cols: 2, cells: {} } }],
      active: 0
    });
    expect(weWorkbookSanitize({ sheets: [] })).toBeNull();
  });

  it('colours the active tab and keeps the colour when stored', () => {
    book().setTabColor('green');
    fixture.detectChanges();
    expect(book().getData().sheets[0].color).toBe('green');
    expect(fixture.nativeElement.querySelector('.we-book__tab').style.boxShadow).toContain('inset');
    expect(weWorkbookSanitize({ sheets: [{ name: 'a', color: 'green', data: { rows: 1, cols: 1, cells: {} } }, { name: 'b', color: 'neon', data: { rows: 1, cols: 1, cells: {} } }] })!.sheets.map((s) => s.color)).toEqual(['green', undefined]);
    book().duplicateSheet();
    expect(book().getData().sheets[1].color).toBe('green');
    book().activate(0);
    book().setTabColor(null);
    expect(book().getData().sheets[0].color).toBeUndefined();
  });

  it('lets one sheet use a name another sheet defines', () => {
    book().addSheet();
    book().activate(0);
    fixture.detectChanges();
    sheet().setCell('A1', 4);
    sheet().setCell('A2', 6);
    sheet().defineName('Stock', 'A1:A2');
    book().activate(1);
    fixture.detectChanges();
    sheet().setCell('B1', '=SUM(Stock)');
    expect(sheet().getValue('B1')).toBe(10);
  });
  it('hands out one SafeHtml per icon, so a click on an icon is not lost to a rewritten SVG', () => {
    expect(book().icon('plus')).toBe(book().icon('plus'));
    const svg = fixture.nativeElement.querySelector('.we-book__icon svg');
    fixture.detectChanges();
    expect(svg.isConnected).toBeTrue();
  });

  it('closes the tab-colour palette on a press outside it and on Esc', () => {
    book().colorMenu = true;
    fixture.detectChanges();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(book().colorMenu).toBeFalse();
    book().colorMenu = true;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(book().colorMenu).toBeFalse();
  });

  it('adds a one-sheet Excel file as a new sheet named after the file, never overwriting the open one', async () => {
    sheet().setCell('A1', 'mine');
    const file = new File([weSheetWorkbookXlsx([{ name: 'Sheet1', data: { version: 1, rows: 2, cols: 2, cells: { A1: { v: 7 } } } }])], 'Prices.xlsx');
    await sheet().onImportFile({ target: { files: [file], value: '' } } as unknown as Event);
    fixture.detectChanges();
    expect(tabs()).toEqual(['Sheet1', 'Prices']);
    expect(book().getData().sheets[0].data.cells['A1'].v).toBe('mine');
    expect(sheet().getValue('A1')).toBe(7);
  });

  it('writes a change still in the debounce when it is destroyed', () => {
    sheet().setCell('A1', 'late');
    expect(store.saved.has('book:spec-book')).toBeFalse();
    fixture.destroy();
    const saved = store.saved.get('book:spec-book') as unknown as { sheets: { data: WeSheetData }[] };
    expect(saved.sheets[0].data.cells['A1'].v).toBe('late');
  });

  it('emits contentChange for content but not for switching tabs', () => {
    const content: number[] = [];
    book().contentChange.subscribe((b) => content.push(b.active));
    book().addSheet();
    fixture.detectChanges();
    expect(content.length).toBe(1);
    book().activate(0);
    fixture.detectChanges();
    book().activate(1);
    fixture.detectChanges();
    expect(content.length).toBe(1);
    sheet().setCell('A1', 1);
    expect(content.length).toBe(2);
  });

  it('refreshes an app block on any sheet, keeping what the user added and moving references', () => {
    sheet().setCell('A1', 'Item');
    book().replaceRange('Sheet1', 'A2:B3', [['a', 1], ['b', 2]]);
    sheet().setCell('B4', '=SUM(B2:B3)');
    sheet().setCell('C2', '=B2*2');
    book().addSheet();
    fixture.detectChanges();
    sheet().setCell('A1', "=Sheet1!B4");
    // Sheet1 is not open: refreshed through the workbook, Sheet2's reference follows the total down
    expect(book().replaceRange('Sheet1', 'A2:B3', [['a', 10], ['b', 20], ['c', 30]])).toBe('A2:B4');
    fixture.detectChanges();
    const s1 = book().getData().sheets[0].data.cells;
    expect(s1['B5'].v).toBe('=SUM(B2:B4)');
    expect(s1['C2'].v).toBe('=B2*2');
    expect(book().getData().sheets[1].data.cells['A1'].v).toBe('=Sheet1!B5');
    expect(sheet().getValue('A1')).toBe(60);
    // Open sheet: one undoable step
    book().activate(0);
    fixture.detectChanges();
    expect(book().replaceRange('Sheet1', 'A2:B4', [['z', 5]])).toBe('A2:B2');
    expect(sheet().getValue('B3')).toBe(5);
    sheet().undo();
    expect(sheet().getValue('B5')).toBe(60);
    expect(book().replaceRange('Nope', 'A1', [[1]])).toBeNull();
  });
});

describe('WeWorkbookComponent with its own store', () => {
  @Component({
    standalone: true,
    imports: [WeWorkbookComponent],
    template: `<we-workbook workbookKey="own" [store]="store" (storeError)="errors.push($event.action)" />`
  })
  class OwnStoreHost {
    @ViewChild(WeWorkbookComponent) book!: WeWorkbookComponent;
    store: WeSheetStore = { load: () => of(null), save: () => throwError(() => new Error('down')) };
    errors: string[] = [];
  }

  it('uses the [store] input over the token and reports a failed save', fakeAsync(() => {
    const tokenStore = new MemoryStore();
    TestBed.configureTestingModule({ imports: [OwnStoreHost], providers: [{ provide: WE_SHEET_STORE, useValue: tokenStore }] });
    const fixture = TestBed.createComponent(OwnStoreHost);
    fixture.detectChanges();
    fixture.componentInstance.book.addSheet();
    tick(500);
    fixture.detectChanges();
    expect(tokenStore.saved.size).toBe(0);
    expect(fixture.componentInstance.errors).toEqual(['save']);
    expect(fixture.nativeElement.querySelector('.we-book__notice').textContent).toContain('could not be saved');
  }));
});
