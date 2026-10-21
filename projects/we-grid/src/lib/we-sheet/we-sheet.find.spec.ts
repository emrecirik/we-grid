import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { WeSheetComponent } from './we-sheet.component';
import { WE_SHEET_STORE, WeSheetData, WeSheetStore } from './we-sheet.model';
import { weSheetFormatValue } from './we-sheet.util';

class NullStore implements WeSheetStore {
  load(): Observable<WeSheetData | null> {
    return of(null);
  }
  save(): Observable<void> {
    return of(undefined);
  }
}

@Component({
  standalone: true,
  imports: [WeSheetComponent],
  template: `<we-sheet [data]="data" />`
})
class HostComponent {
  data: WeSheetData = {
    version: 1,
    rows: 6,
    cols: 3,
    cells: { A1: { v: 'Apple pie' }, A2: { v: 'apple' }, B1: { v: '=A1&" x"' }, C3: { v: 'Pear' }, B3: { v: 1.23456 } }
  };
  @ViewChild(WeSheetComponent) sheet!: WeSheetComponent;
}

describe('WeSheetComponent — find, replace and decimal places', () => {
  let fixture: ComponentFixture<HostComponent>;
  let sheet: WeSheetComponent;
  const el = (): HTMLElement => fixture.nativeElement.querySelector('we-sheet');

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent], providers: [{ provide: WE_SHEET_STORE, useClass: NullStore }] });
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    sheet = fixture.componentInstance.sheet;
  });

  it('opens with Ctrl+F, counts matches and walks through them', () => {
    el().querySelector('.we-sheet__scroll')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(el().querySelector('.we-sheet__find')).toBeTruthy();
    sheet.onFindInput('apple');
    fixture.detectChanges();
    expect(sheet.findMatches).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 0, row: 1 }
    ]);
    expect(el().querySelector('.we-sheet__find-count')!.textContent).toContain('1 of 3');
    sheet.findNext();
    expect(sheet.selectionLabel).toBe('B1');
    sheet.findNext(-1);
    sheet.findNext(-1);
    expect(sheet.selectionLabel).toBe('A2');
    sheet.setMatchCase(true);
    expect(sheet.findMatches.length).toBe(1);
  });

  it('replaces one match or all of them, undoably', () => {
    sheet.openFind(true);
    // Focused at once: a microtask would run before an event-coalescing app renders the box
    expect((document.activeElement as HTMLElement).classList).toContain('we-sheet__find-input');
    sheet.find = null;
    sheet.openMenu(10, 10);
    expect((document.activeElement as HTMLElement).closest('.we-sheet__menu')).not.toBeNull();
    sheet.openTextToColumns();
    expect((document.activeElement as HTMLElement).closest('.we-sheet__split')).not.toBeNull();
    sheet.splitDialog = null;
    sheet.openFind(true);
    sheet.onFindInput('apple');
    sheet.find!.replace = 'Plum';
    sheet.replaceOne();
    expect(sheet.getValue('A1')).toBe('Plum pie');
    expect(sheet.getValue('B1')).toBe('Plum pie x');
    sheet.replaceAll();
    expect(sheet.getValue('A2')).toBe('Plum');
    expect(sheet.findMatches.length).toBe(0);
    sheet.undo();
    expect(sheet.getValue('A2')).toBe('apple');
  });

  it('sets decimal places on the selection', () => {
    sheet.select('B3');
    sheet.changeDecimals(1);
    expect(sheet.getData().cells['B3']).toEqual({ v: 1.23456, f: 'number', d: 3 });
    fixture.detectChanges();
    expect(el().querySelector('[data-cell="B3"]')!.textContent!.trim()).toBe('1.235');
    sheet.changeDecimals(-3);
    expect(sheet.getData().cells['B3'].d).toBe(0);
    expect(weSheetFormatValue(0.1234, 'percent', 'en-US', 'USD', 1)).toBe('12.3%');
    expect(weSheetFormatValue(5, 'currency', 'en-US', 'USD', 0)).toBe('$5');
  });
});
