import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { WeSheetComponent } from './we-sheet.component';
import { WE_SHEET_STORE, WeSheetData, WeSheetStore } from './we-sheet.model';

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
    rows: 8,
    cols: 4,
    cells: { A1: { v: 1 }, A2: { v: 2 }, A3: { v: 3 }, B1: { v: '=A1*10' }, C1: { v: '=SUM(A1:A3)' } }
  };
  @ViewChild(WeSheetComponent) sheet!: WeSheetComponent;
}

describe('WeSheetComponent — structure, AutoSum, suggestions, import', () => {
  let fixture: ComponentFixture<HostComponent>;
  let sheet: WeSheetComponent;
  const el = (): HTMLElement => fixture.nativeElement.querySelector('we-sheet');
  const cell = (a: string): HTMLElement => el().querySelector(`[data-cell="${a}"]`)!;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent], providers: [{ provide: WE_SHEET_STORE, useClass: NullStore }] });
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    sheet = fixture.componentInstance.sheet;
  });

  it('inserts and deletes rows from the right-click menu, formulas following', () => {
    cell('A2').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 }));
    fixture.detectChanges();
    const items = Array.from(el().querySelectorAll<HTMLButtonElement>('.we-sheet__menu button'));
    expect(items.length).toBeGreaterThan(6);
    items[0].click();
    fixture.detectChanges();
    expect(sheet.getData().cells['C1'].v).toBe('=SUM(A1:A4)');
    expect(sheet.getValue('A3')).toBe(2);
    expect(sheet.getValue('C1')).toBe(6);
    sheet.select('A2');
    sheet.deleteRows();
    expect(sheet.getData().cells['C1'].v).toBe('=SUM(A1:A3)');
    sheet.select('A1');
    sheet.insertColumns('before');
    expect(sheet.getData().cells['C1'].v).toBe('=B1*10');
    expect(sheet.getValue('C1')).toBe(10);
    sheet.undo();
    expect(sheet.getData().cells['B1'].v).toBe('=A1*10');
  });

  it('sums with AutoSum and with Alt+=', () => {
    sheet.select('A4');
    sheet.autoSum();
    expect(sheet.getData().cells['A4'].v).toBe('=SUM(A1:A3)');
    expect(sheet.getValue('A4')).toBe(6);
    sheet.select('A1:A3');
    sheet.undo();
    sheet.select('A1:A3');
    el().querySelector('.we-sheet__scroll')!.dispatchEvent(new KeyboardEvent('keydown', { key: '=', altKey: true, bubbles: true, cancelable: true }));
    expect(sheet.getData().cells['A4'].v).toBe('=SUM(A1:A3)');
  });

  it('suggests functions while a formula is typed and inserts the chosen one', () => {
    sheet.select('D1');
    sheet.startEdit('=SU');
    fixture.detectChanges();
    const editor = el().querySelector<HTMLInputElement>('.we-sheet__editor')!;
    editor.setSelectionRange(3, 3);
    editor.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const names = Array.from(el().querySelectorAll('.we-sheet__suggest li strong')).map((n) => n.textContent);
    expect(names).toContain('SUM');
    expect(names).toContain('SUMIF');
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(editor.value).toBe('=SUM(');
    expect(el().querySelector('.we-sheet__suggest')).toBeNull();

    editor.value = '=EĞ';
    editor.setSelectionRange(3, 3);
    editor.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(Array.from(el().querySelectorAll('.we-sheet__suggest li strong')).map((n) => n.textContent)).toContain('EĞER');
  });

  it('opens a CSV file into the sheet from A1, undoably', async () => {
    const file = new File(['Name,Qty\nBolt,12\nNut,3.5\n'], 'stock.csv', { type: 'text/csv' });
    const input = el().querySelector<HTMLInputElement>('.we-sheet__file')!;
    Object.defineProperty(input, 'files', { value: [file] });
    await sheet.onImportFile({ target: input } as unknown as Event);
    expect(sheet.getValue('A1')).toBe('Name');
    expect(sheet.getValue('B2')).toBe(12);
    expect(sheet.getValue('B3')).toBe(3.5);
    expect(sheet.getData().headerRow).toBeTrue();
    sheet.undo();
    expect(sheet.getValue('A1')).toBe(1);
  });

  it('charts the selection and keeps the chart with the sheet', () => {
    sheet.setData({
      version: 1,
      rows: 8,
      cols: 4,
      cells: { A1: { v: 'Month' }, B1: { v: 'Sales' }, A2: { v: 'Jan' }, B2: { v: 10 }, A3: { v: 'Feb' }, B3: { v: '=B2*2' } }
    });
    sheet.select('A1:B3');
    sheet.insertChart('line');
    fixture.detectChanges();
    expect(sheet.getData().chart).toEqual({ range: 'A1:B3', type: 'line' });
    expect(sheet.chartData).toEqual({ categories: ['Jan', 'Feb'], series: [{ name: 'Sales', values: [10, 20] }] });
    expect(el().querySelector('we-chart')).toBeTruthy();
    sheet.setCell('B2', '5');
    expect(sheet.chartData?.series[0].values).toEqual([5, 10]);
    sheet.removeChart();
    fixture.detectChanges();
    expect(el().querySelector('we-chart')).toBeNull();
  });

  it('toggles table options from the toolbar menu', () => {
    el().querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!.click();
    fixture.detectChanges();
    const items = Array.from(el().querySelectorAll<HTMLButtonElement>('.we-sheet__options button'));
    expect(items.length).toBe(5);
    items[0].click();
    fixture.detectChanges();
    expect(sheet.getData().headerRow).toBeTrue();
    expect(el().querySelector('.we-sheet__options [aria-checked="true"]')).toBeTruthy();
  });

  it('freezes the first column', () => {
    sheet.toggleFreezeColumn();
    fixture.detectChanges();
    expect(el().querySelector('.we-sheet--freeze-col')).toBeTruthy();
    expect(cell('A1').classList).toContain('we-sheet__cell--first');
  });
});
