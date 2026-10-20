import { weGridReadXlsxCells } from '../services/we-grid-xlsx.util';
import { WeSheetData } from './we-sheet.model';
import { weSheetFormulaToExcel, weSheetFromCells, weSheetShiftFormula, weSheetWorkbookXlsx } from './we-sheet.util';

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

describe('Excel round trip (0.24.0 fixes)', () => {
  it('keeps text as text, numbers in exponent form as numbers and newer functions working', async () => {
    const data: WeSheetData = {
      version: 1, rows: 4, cols: 4,
      cells: { A1: { v: '00123', f: 'text' }, B1: { v: 'TRUE' }, C1: { v: 1e-7 }, D1: { v: '=IFS(C1>0;"ok";TRUE;"no")' } }
    };
    const blob = weSheetWorkbookXlsx([{ name: 'S', data }]);
    expect(await new Response(blob).text()).toContain('<f>_xlfn.IFS(C1&gt;0,&quot;ok&quot;,TRUE,&quot;no&quot;)</f>');
    const [read] = await weGridReadXlsxCells(blob);
    expect(read.cells['A1']).toBe("'00123");
    expect(read.cells['B1']).toBe("'TRUE");
    expect(read.cells['D1']).toBe('=IFS(C1>0,"ok",TRUE,"no")');
    const { data: back } = weSheetFromCells(read.cells, '.');
    expect(back.cells['A1']).toEqual({ v: '00123', f: 'text' });
    expect(back.cells['C1'].v).toBe(1e-7);
  });

  it('renames sheets the file cannot hold and makes the formulas follow', async () => {
    const long = 'Quarterly revenue by region 2024 north';
    const blob = weSheetWorkbookXlsx([
      { name: long, data: { version: 1, rows: 2, cols: 1, cells: { A1: { v: 5 } } } },
      { name: 'Q1/Q2', data: { version: 1, rows: 2, cols: 1, cells: { A1: { v: 7 } } } },
      { name: 'Sum', data: { version: 1, rows: 2, cols: 1, cells: { A1: { v: `='${long}'!A1+'Q1/Q2'!A1` } } } }
    ]);
    const sheets = await weGridReadXlsxCells(blob);
    expect(sheets.map((s) => s.name)).toEqual(['Quarterly revenue by region 202', 'Q1 Q2', 'Sum']);
    expect(sheets[2].cells['A1']).toBe("='Quarterly revenue by region 202'!A1+'Q1 Q2'!A1");
  });

  it('reads prefixed namespaces, cells without addresses and leaves phonetic guides out', async () => {
    const enc = new TextEncoder();
    // A minimal stored ZIP with a workbook, shared strings and one worksheet written the unusual way
    const files: Record<string, string> = {
      'xl/workbook.xml': '<x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><x:sheets><x:sheet name="P" sheetId="1" r:id="rId1"/></x:sheets></x:workbook>',
      'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="t" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/sharedStrings.xml': '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><r><t>Tok</t></r><r><t>yo</t></r><rPh sb="0" eb="1"><t>TOH</t></rPh></si></sst>',
      'xl/worksheets/sheet1.xml': '<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData><x:row r="2"><x:c t="s"><x:v>0</x:v></x:c><x:c><x:v>1.5E+3</x:v></x:c></x:row></x:sheetData></x:worksheet>'
    };
    const parts: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;
    for (const [name, text] of Object.entries(files)) {
      const nameBytes = enc.encode(name);
      const data = enc.encode(text);
      const local = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, nameBytes.length, true);
      local.set(nameBytes, 30);
      const dir = new Uint8Array(46 + nameBytes.length);
      const dv = new DataView(dir.buffer);
      dv.setUint32(0, 0x02014b50, true);
      dv.setUint32(20, data.length, true);
      dv.setUint32(24, data.length, true);
      dv.setUint16(28, nameBytes.length, true);
      dv.setUint32(42, offset, true);
      dir.set(nameBytes, 46);
      parts.push(local, data);
      central.push(dir);
      offset += local.length + data.length;
    }
    const size = central.reduce((n, d) => n + d.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(10, central.length, true);
    ev.setUint32(12, size, true);
    ev.setUint32(16, offset, true);
    const [read] = await weGridReadXlsxCells(new Blob([...parts, ...central, end]));
    expect(read.name).toBe('P');
    expect(read.cells).toEqual({ A2: 'Tokyo', B2: '1.5E+3' });
    expect(weSheetFromCells(read.cells, '.').data.cells['B2'].v).toBe(1500);
  });
});
