import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { WE_SHEET_STORE, WeSheetData, WeSheetStore } from './we-sheet.model';
import { WeSheetComponent } from './we-sheet.component';
import { WeWorkbookComponent, weWorkbookSanitize } from './we-workbook.component';

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
    book().finishRename(1, 'Budget');
    book().duplicateSheet(1);
    fixture.detectChanges();
    expect(tabs()).toEqual(['Sheet1', 'Budget', 'Budget2']);
    book().deleteSheet(0);
    fixture.detectChanges();
    expect(tabs()).toEqual(['Budget', 'Budget2']);
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
});
