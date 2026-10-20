import { weGridReadXlsxCells } from '../services/we-grid-xlsx.util';
import { WeSheetData } from './we-sheet.model';
import { weSheetFormulaToExcel, weSheetShiftFormula, weSheetWorkbookXlsx } from './we-sheet.util';

describe('weSheetFormulaToExcel', () => {
  it('writes Turkish names, semicolons and booleans the way Excel reads them', () => {
    expect(weSheetFormulaToExcel('=EĞER(TOPLA(A1:A3;B1)>0;DOĞRU;"a;b")')).toBe('IF(SUM(A1:A3,B1)>0,TRUE,"a;b")');
    expect(weSheetFormulaToExcel("=sum('Q;1'!A1, Sales!B2)*ortalama(C1:C2)")).toBe("SUM('Q;1'!A1, Sales!B2)*AVERAGE(C1:C2)");
    expect(weSheetFormulaToExcel('=min(A1;A2)')).toBe('MIN(A1,A2)');
  });
});

describe('weSheetWorkbookXlsx', () => {
  it('writes every sheet with its formulas, results and formats, and reads them back', async () => {
    const budget: WeSheetData = {
      version: 1,
      rows: 5,
      cols: 3,
      headerRow: true,
      widths: { A: 140 },
      cells: {
        A1: { v: 'Item' },
        B1: { v: 'Cost' },
        A2: { v: 'Rent' },
        B2: { v: 1200, f: 'currency' },
        B3: { v: '=TOPLA(B2;Sales!A1)', s: { bold: true } },
        C3: { v: '=1/0' },
        C2: { v: 0.25, f: 'percent', d: 0 }
      }
    };
    const sales: WeSheetData = { version: 1, rows: 3, cols: 2, cells: { A1: { v: 300 }, B1: { v: true } } };
    const blob = weSheetWorkbookXlsx([
      { name: 'Budget', data: budget },
      { name: 'Sales', data: sales }
    ]);
    const sheets = await weGridReadXlsxCells(blob, weSheetShiftFormula);
    expect(sheets.map((s) => s.name)).toEqual(['Budget', 'Sales']);
    expect(sheets[0].cells).toEqual({ A1: 'Item', B1: 'Cost', A2: 'Rent', B2: '1200', B3: '=SUM(B2,Sales!A1)', C3: '=1/0', C2: '0.25' });
    expect(sheets[1].cells).toEqual({ A1: '300', B1: 'TRUE' });

    const files = await new Response(blob).text();
    expect(files).toContain('<f>SUM(B2,Sales!A1)</f><v>1500</v>');
    expect(files).toContain('t="e"');
    expect(files).toContain('numFmtId="9"');
    expect(files).toContain('<calcPr fullCalcOnLoad="1"/>');
  });

  it('moves a shared formula to each cell it covers when reading', async () => {
    // Excel writes a filled-down formula once and shares it below; rewrite our file that way, keeping
    // every part the same size (the stored ZIP records sizes but the reader does not check CRCs)
    const pad = ' '.repeat(30);
    const data: WeSheetData = { version: 1, rows: 4, cols: 2, cells: { A1: { v: 1 }, A2: { v: 2 }, B1: { v: `=A1*2${pad}` }, B2: { v: `=A2*2${pad}` } } };
    const bytes = new Uint8Array(await weSheetWorkbookXlsx([{ name: 'S', data }]).arrayBuffer());
    let raw = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
    const swap = (from: string, to: string) => {
      expect(raw).toContain(from);
      raw = raw.replace(from, to + ' '.repeat(from.length - to.length));
    };
    swap(`<f>A1*2${pad}</f>`, '<f t="shared" ref="B1:B2" si="0">A1*2</f>');
    swap(`<f>A2*2${pad}</f>`, '<f t="shared" si="0"/>');
    const file = new Blob([Uint8Array.from(raw, (c) => c.charCodeAt(0))]);
    const [read] = await weGridReadXlsxCells(file, weSheetShiftFormula);
    expect(read.cells['B1']).toBe('=A1*2');
    expect(read.cells['B2']).toBe('=A2*2');
    const [plain] = await weGridReadXlsxCells(file);
    expect(plain.cells['B2']).toBe('4');
  });
});
