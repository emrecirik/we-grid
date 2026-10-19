import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { WeGridFormulaError, WeGridSheetEvaluator, weGridCompileFormula } from '../services/we-grid-formula.util';
import { WE_SHEET_STORE, WeSheetData, WeSheetStore } from './we-sheet.model';
import { WeSheetComponent } from './we-sheet.component';
import { weSheetInsert, weSheetMoveReferences, weSheetNameRef, weSheetRenameReferences, weSheetShiftFormula } from './we-sheet.util';
import { WeWorkbookComponent } from './we-workbook.component';

describe('sheet references in formulas', () => {
  it('reads cells and ranges of other sheets', () => {
    const sales = new WeGridSheetEvaluator((c, r) => [[10], [20], [30]][r]?.[c] ?? null, () => ({ cols: 1, rows: 3 }));
    const sheets = (name: string) => (name.toLowerCase() === 'sales data' || name.toLowerCase() === 'sales' ? sales : null);
    const scope = new WeGridSheetEvaluator((c, r) => (r === 0 && c === 0 ? "=SUM('Sales data'!A1:A3) + Sales!A2" : null), () => ({ cols: 1, rows: 1 }), { sheet: sheets });
    expect(scope.value(0, 0)).toBe(80);
    const missing = weGridCompileFormula('=Nope!A1').evaluate({});
    expect(missing).toEqual(jasmine.any(WeGridFormulaError));
    expect((missing as WeGridFormulaError).code).toBe('#REF!');
  });

  it('keeps sheet names out of copying and inserting, and rewrites them on rename', () => {
    expect(weSheetShiftFormula('=Sales!A1+AB1!B2', 0, 1)).toBe('=Sales!A2+AB1!B3');
    expect(weSheetMoveReferences('=A5+Sales!A5+SUM(Sales!A1:A9)', 'row', 2, 1)).toBe('=A6+Sales!A5+SUM(Sales!A1:A9)');
    expect(weSheetRenameReferences("=Sales!A1+'Sales'!B2+\"Sales!A1\"+Other!A1", 'sales', 'Q1 sales')).toBe("='Q1 sales'!A1+'Q1 sales'!B2+\"Sales!A1\"+Other!A1");
    expect(weSheetNameRef('Budget')).toBe('Budget');
    expect(weSheetNameRef('AB1')).toBe("'AB1'");
    expect(weSheetNameRef("Bob's")).toBe("'Bob''s'");
    const data: WeSheetData = { version: 1, rows: 4, cols: 1, cells: { A1: { v: '=Sales!A3' } } };
    expect(weSheetInsert(data, 'row', 0, 1).cells['A2'].v).toBe('=Sales!A3');
  });
});

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
  imports: [WeWorkbookComponent],
  template: `<we-workbook [data]="book" />`
})
class HostComponent {
  book = {
    version: 1 as const,
    active: 0,
    sheets: [
      { name: 'Summary', data: { version: 1 as const, rows: 4, cols: 2, cells: { A1: { v: '=SUM(Sales!B1:B3)' } } } },
      { name: 'Sales', data: { version: 1 as const, rows: 4, cols: 2, cells: { B1: { v: 5 }, B2: { v: 7 } } } }
    ]
  };
  @ViewChild(WeWorkbookComponent) workbook!: WeWorkbookComponent;
}

describe('WeWorkbookComponent — formulas across sheets', () => {
  let fixture: ComponentFixture<HostComponent>;
  const sheet = (): WeSheetComponent => fixture.debugElement.query((d) => d.componentInstance instanceof WeSheetComponent).componentInstance;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent], providers: [{ provide: WE_SHEET_STORE, useClass: NullStore }] });
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('computes from another sheet and follows its changes', () => {
    expect(sheet().getValue('A1')).toBe(12);
    const wb = fixture.componentInstance.workbook;
    wb.activate(1);
    fixture.detectChanges();
    sheet().setCell('B3', '30');
    fixture.detectChanges();
    wb.activate(0);
    fixture.detectChanges();
    expect(sheet().getValue('A1')).toBe(42);
  });

  it('renames references when a sheet is renamed, and shows #REF! once it is gone', () => {
    const wb = fixture.componentInstance.workbook;
    wb.startRename(1);
    wb.finishRename(1, 'Q1 sales');
    fixture.detectChanges();
    expect(wb.getData().sheets[0].data.cells['A1'].v).toBe("=SUM('Q1 sales'!B1:B3)");
    expect(sheet().getValue('A1')).toBe(12);
    wb.deleteSheet(1);
    fixture.detectChanges();
    expect((sheet().getValue('A1') as WeGridFormulaError).code).toBe('#REF!');
  });
});
