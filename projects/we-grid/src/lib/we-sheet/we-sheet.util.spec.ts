import { WeGridFormulaError } from '../services/we-grid-formula.util';
import {
  weSheetAddress,
  weSheetAutoSum,
  weSheetInsert,
  weSheetMoveReferences,
  weSheetMoveSheetReferences,
  weSheetFill,
  weSheetCleanList,
  weSheetFromCells,
  weSheetSanitizeMerges,
  weSheetEmpty,
  weSheetFormatValue,
  weSheetNormalize,
  weSheetParseAddress,
  weSheetParseInput,
  weSheetParseNumber,
  weSheetRangeLabel,
  weSheetSanitize,
  weSheetShiftFormula,
  weSheetSortRange,
  weSheetStats
} from './we-sheet.util';

describe('we-sheet utils', () => {
  it('converts addresses both ways and labels ranges', () => {
    expect(weSheetAddress(0, 0)).toBe('A1');
    expect(weSheetAddress(27, 9)).toBe('AB10');
    expect(weSheetParseAddress('AB10')).toEqual({ col: 27, row: 9 });
    expect(weSheetParseAddress('A0')).toBeNull();
    expect(weSheetParseAddress('a1')).toBeNull();
    const r = weSheetNormalize({ col: 2, row: 5 }, { col: 0, row: 1 });
    expect(r).toEqual({ c1: 0, r1: 1, c2: 2, r2: 5 });
    expect(weSheetRangeLabel(r)).toBe('A2:C6');
    expect(weSheetRangeLabel({ c1: 1, r1: 1, c2: 1, r2: 1 })).toBe('B2');
  });

  it('parses input like Excel in either locale', () => {
    expect(weSheetParseInput('=A1+1', ',')).toEqual({ value: '=A1+1' });
    expect(weSheetParseInput('1.234,5', ',')).toEqual({ value: 1234.5 });
    expect(weSheetParseInput('1,234.5', '.')).toEqual({ value: 1234.5 });
    expect(weSheetParseInput('12.5', ',')).toEqual({ value: 12.5 });
    expect(weSheetParseInput('15%', '.')).toEqual({ value: 0.15, format: 'percent' });
    expect(weSheetParseInput("'007", '.')).toEqual({ value: '007', format: 'text' });
    expect(weSheetParseInput('true', '.')).toEqual({ value: true });
    expect(weSheetParseInput('Elma', '.')).toEqual({ value: 'Elma' });
    expect(weSheetParseInput('', '.')).toEqual({ value: null });
    expect(weSheetParseNumber('1.234', ',')).toBe(1234);
    expect(weSheetParseNumber('12a', '.')).toBeNull();
  });

  it('shifts relative references and keeps absolute ones, strings and fields', () => {
    expect(weSheetShiftFormula('=A1+$B$2+B$3+$C4', 1, 1)).toBe('=B2+$B$2+C$3+$C5');
    expect(weSheetShiftFormula('=SUM(A1:A3)*LOG10(2)', 0, 2)).toBe('=SUM(A3:A5)*LOG10(2)');
    expect(weSheetShiftFormula('="A1"&[B2]&A1', 0, 1)).toBe('="A1"&[B2]&A2');
    expect(weSheetShiftFormula('=A1', 0, -1)).toBe('=#REF!');
  });

  it('summarises a selection', () => {
    expect(weSheetStats([1, 2, 'x', null, '', 3])).toEqual({ count: 4, numbers: 3, sum: 6, average: 2, min: 1, max: 3 });
    expect(weSheetStats([]).average).toBeNull();
  });

  it('sorts whole rows by a column, blanks last', () => {
    const data = weSheetEmpty(4, 2);
    data.cells = { A1: { v: 'b' }, B1: { v: 2 }, A2: { v: 'a' }, B2: { v: 1, s: { bold: true } }, B4: { v: 3 } };
    const values = (c: number, r: number) => data.cells[weSheetAddress(c, r)]?.v ?? null;
    const sorted = weSheetSortRange(data, { c1: 0, r1: 0, c2: 1, r2: 3 }, 1, 'asc', values, 'en');
    expect(['B1', 'B2', 'B3', 'B4'].map((k) => sorted.cells[k]?.v)).toEqual([1, 2, 3, undefined]);
    expect(sorted.cells['B1'].s?.bold).toBeTrue();
    expect(sorted.cells['A3']).toBeUndefined();
    const desc = weSheetSortRange(data, { c1: 0, r1: 0, c2: 1, r2: 3 }, 0, 'desc', values, 'en');
    expect(['A1', 'A2'].map((k) => desc.cells[k]?.v)).toEqual(['b', 'a']);
  });

  it('formats values by number format', () => {
    expect(weSheetFormatValue(1234.5, 'number', 'tr-TR', 'TRY')).toBe('1.234,50');
    expect(weSheetFormatValue(0.255, 'percent', 'en-US', 'USD')).toBe('25.5%');
    expect(weSheetFormatValue(45658, 'date', 'en-US', 'USD')).toBe('Jan 1, 2025');
    expect(weSheetFormatValue(0.1 + 0.2, 'general', 'en-US', 'USD')).toBe('0.3');
    expect(weSheetFormatValue(new WeGridFormulaError('#DIV/0!'), undefined, 'en-US', 'USD')).toBe('#DIV/0!');
    expect(weSheetFormatValue(true, undefined, 'en-US', 'USD')).toBe('TRUE');
  });

  it('sanitises untrusted sheet data', () => {
    const data = weSheetSanitize({
      rows: 3,
      cols: 2,
      cells: { A1: { v: 1, s: { color: 'red', fill: 'expression(x)' }, f: 'bogus' }, Z9: { v: 'off sheet' }, B2: { v: { evil: 1 } } },
      widths: { A: 120, B: 5, '<x>': 100 },
      headerRow: true
    });
    expect(data).toEqual({ version: 1, rows: 3, cols: 2, cells: { A1: { v: 1, s: { color: 'red' } } }, widths: { A: 120 }, headerRow: true });
    expect(weSheetSanitize({ rows: 'x', cols: 2, cells: {} })).toBeNull();
    expect(weSheetSanitize(null)).toBeNull();
  });
});

describe('we-sheet structure', () => {
  it('moves references when rows or columns are inserted', () => {
    expect(weSheetMoveReferences('=A1+A5+$A$6+SUM(A2:A9)', 'row', 4, 2)).toBe('=A1+A7+$A$8+SUM(A2:A11)');
    expect(weSheetMoveReferences('=B2*C2+SUM(A:C)', 'col', 1, 1)).toBe('=C2*D2+SUM(A:D)');
    expect(weSheetMoveReferences('=SUM(A:A)+A3', 'row', 0, 1)).toBe('=SUM(A:A)+A4');
    expect(weSheetMoveReferences('="A1"&[B2]&A1', 'row', 0, 1)).toBe('="A1"&[B2]&A2');
  });

  it('moves, shrinks or breaks references when rows are deleted', () => {
    expect(weSheetMoveReferences('=A1+A5+A9', 'row', 3, -3)).toBe('=A1+#REF!+A6');
    expect(weSheetMoveReferences('=SUM(A2:A9)', 'row', 3, -3)).toBe('=SUM(A2:A6)');
    expect(weSheetMoveReferences('=SUM(A4:A6)', 'row', 3, -3)).toBe('=SUM(#REF!)');
    expect(weSheetMoveReferences('=SUM(A5:A9)', 'row', 3, -3)).toBe('=SUM(A4:A6)');
    expect(weSheetMoveReferences('=SUM(A1:A4)', 'row', 3, -3)).toBe('=SUM(A1:A3)');
  });

  it('inserts and deletes rows and columns in the data', () => {
    const data = weSheetEmpty(5, 3);
    data.widths = { B: 200 };
    data.cells = { A1: { v: 1 }, A2: { v: 2 }, A3: { v: '=A1+A2' }, B1: { v: 'x' } };
    const grown = weSheetInsert(data, 'row', 1, 1);
    expect(grown.rows).toBe(6);
    expect(grown.cells['A3']).toEqual({ v: 2 });
    expect(grown.cells['A4']).toEqual({ v: '=A1+A3' });
    const shrunk = weSheetInsert(grown, 'row', 1, -1);
    expect(shrunk.cells).toEqual(data.cells);
    const cols = weSheetInsert(data, 'col', 0, 1);
    expect(cols.cells['B3']).toEqual({ v: '=B1+B2' });
    expect(cols.widths).toEqual({ C: 200 });
    const gone = weSheetInsert(data, 'col', 1, -1);
    expect(gone.cols).toBe(2);
    expect(gone.cells['B1']).toBeUndefined();
    expect(gone.widths).toEqual({});
  });

  it('sums like Excel AutoSum', () => {
    const numbers = new Set(['0,0', '0,1', '0,2', '1,3', '2,3']);
    const isNumber = (c: number, r: number) => numbers.has(`${c},${r}`);
    expect(weSheetAutoSum({ c1: 0, r1: 3, c2: 0, r2: 3 }, isNumber)).toEqual([{ col: 0, row: 3, formula: '=SUM(A1:A3)' }]);
    expect(weSheetAutoSum({ c1: 3, r1: 3, c2: 3, r2: 3 }, isNumber)).toEqual([{ col: 3, row: 3, formula: '=SUM(B4:C4)' }]);
    expect(weSheetAutoSum({ c1: 0, r1: 0, c2: 1, r2: 2 }, isNumber)).toEqual([
      { col: 0, row: 3, formula: '=SUM(A1:A3)' },
      { col: 1, row: 3, formula: '=SUM(B1:B3)' }
    ]);
    expect(weSheetAutoSum({ c1: 4, r1: 0, c2: 4, r2: 0 }, isNumber)).toEqual([]);
  });
});

describe('we-sheet references (0.16.0 fixes)', () => {
  it('moves a sorted row formula with its row', () => {
    const data = { ...weSheetEmpty(5, 3), cells: { A1: { v: 1 }, A2: { v: 3 }, A3: { v: 2 }, B1: { v: '=A1*10' }, B2: { v: '=A2*10' }, B3: { v: '=A3*10' } } };
    const values: Record<string, number> = { A1: 1, A2: 3, A3: 2 };
    const sorted = weSheetSortRange(data, { c1: 0, r1: 0, c2: 1, r2: 2 }, 0, 'desc', (c, r) => (c === 0 ? values[weSheetAddress(c, r)] : null), 'en');
    expect(['B1', 'B2', 'B3'].map((a) => sorted.cells[a].v)).toEqual(['=A1*10', '=A2*10', '=A3*10']);
    expect(['A1', 'A2', 'A3'].map((a) => sorted.cells[a].v)).toEqual([3, 2, 1]);
  });

  it('leaves quoted references to another sheet alone when this sheet changes', () => {
    expect(weSheetMoveReferences("='Q 1'!A5+Sales!A5+A5", 'row', 0, 1)).toBe("='Q 1'!A5+Sales!A5+A6");
  });

  it('moves references into a sheet from the other sheets', () => {
    expect(weSheetMoveSheetReferences("=Sales!B1+'q 1'!A1:A3+B1+\"Sales!B1\"", 'Sales', 'row', 0, 1)).toBe("=Sales!B2+'q 1'!A1:A3+B1+\"Sales!B1\"");
    expect(weSheetMoveSheetReferences("='Q 1'!A1:A3*2", 'q 1', 'row', 1, 1)).toBe("='Q 1'!A1:A4*2");
    expect(weSheetMoveSheetReferences('=Sales!B2', 'Sales', 'row', 1, -1)).toBe('=#REF!');
  });

  it('shifts whole-column references when copied sideways', () => {
    expect(weSheetShiftFormula('=SUM(A:A)+$B:$B', 1, 3)).toBe('=SUM(B:B)+$B:$B');
  });

  it('keeps the chart on its cells when rows are inserted, and drops it when they are deleted', () => {
    const data = { ...weSheetEmpty(5, 3), chart: { range: 'A1:B2', type: 'column' as const } };
    expect(weSheetInsert(data, 'row', 0, 1).chart?.range).toBe('A2:B3');
    expect(weSheetInsert(data, 'row', 0, -2).chart).toBeUndefined();
  });
});

describe('weSheetFill', () => {
  const sheet = (cells: Record<string, { v?: string | number | boolean; f?: 'date' }>) => ({ ...weSheetEmpty(10, 5), cells });
  const col = (data: Parameters<typeof weSheetFill>[0], c: string, from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => data.cells[`${c}${from + i}`]?.v ?? null);

  it('continues number steps, copies a lone number and counts on text ending in a number', () => {
    const data = sheet({ A1: { v: 1 }, A2: { v: 3 }, B1: { v: 7 }, C1: { v: 'Item 09' }, D1: { v: 'x' }, D2: { v: 'y' } });
    const out = weSheetFill(data, { c1: 0, r1: 0, c2: 3, r2: 1 }, { c1: 0, r1: 0, c2: 3, r2: 4 });
    expect(col(out, 'A', 1, 5)).toEqual([1, 3, 5, 7, 9]);
    expect(col(out, 'B', 1, 5)).toEqual([7, null, 7, null, 7]);
    expect(col(out, 'D', 1, 5)).toEqual(['x', 'y', 'x', 'y', 'x']);
    const items = weSheetFill(data, { c1: 2, r1: 0, c2: 2, r2: 0 }, { c1: 2, r1: 0, c2: 2, r2: 2 });
    expect(col(items, 'C', 1, 3)).toEqual(['Item 09', 'Item 10', 'Item 11']);
  });

  it('moves dates on by a day, shifts formulas and fills sideways and backwards', () => {
    const data = sheet({ B2: { v: 45000, f: 'date' }, C2: { v: '=B2*2' } });
    const right = weSheetFill(data, { c1: 1, r1: 1, c2: 2, r2: 1 }, { c1: 1, r1: 1, c2: 4, r2: 1 });
    expect([right.cells['D2'].v, right.cells['E2'].v]).toEqual([45000, '=D2*2']);
    const down = weSheetFill(data, { c1: 1, r1: 1, c2: 2, r2: 1 }, { c1: 1, r1: 0, c2: 2, r2: 3 });
    expect(col(down, 'B', 1, 4)).toEqual([44999, 45000, 45001, 45002]);
    expect(down.cells['B4'].f).toBe('date');
    expect(col(down, 'C', 1, 4)).toEqual(['=B1*2', '=B2*2', '=B3*2', '=B4*2']);
  });
});

describe('dropdown lists', () => {
  it('cleans choices and keeps them through sanitising', () => {
    expect(weSheetCleanList([' Open ', '', 'open', 'Closed', '  '])).toEqual(['Open', 'Closed']);
    const clean = weSheetSanitize({ version: 1, rows: 3, cols: 3, cells: { A1: { v: 'Open', l: ['Open', 7, 'Closed', 'open'] }, A2: { l: 'x' } } });
    expect(clean?.cells['A1'].l).toEqual(['Open', 'Closed']);
    expect(clean?.cells['A2']).toBeUndefined();
  });
});

describe('sheet conditional formats', () => {
  it('keeps well-formed one-column rules and moves their ranges with inserted rows and columns', () => {
    const clean = weSheetSanitize({
      version: 1, rows: 9, cols: 4, cells: {},
      formats: [
        { id: 'a', field: 'X', range: 'B2:B9', type: 'condition', operator: 'gt', value: 5, style: { bold: true } },
        { id: 'b', field: 'B', range: 'B2:C9', type: 'dataBar', color: 'blue' },
        { id: 'c', field: 'B', range: 'B2:B9', type: 'condition', operator: 'formula', value: '=1' },
        { id: 'd', range: 'C1:C3', type: 'iconSet', icons: 'dots' }
      ]
    })!;
    expect(clean.formats?.map((f) => [f.id, f.field, f.range])).toEqual([['a', 'B', 'B2:B9'], ['d', 'C', 'C1:C3']]);
    const moved = weSheetInsert(clean, 'col', 0, 1);
    expect(moved.formats?.map((f) => [f.field, f.range])).toEqual([['C', 'C2:C9'], ['D', 'D1:D3']]);
    expect(weSheetInsert(clean, 'row', 0, -3).formats?.map((f) => f.range)).toEqual(['B1:B6']);
  });
});

describe('sheet filters', () => {
  it('keeps the filters of an AutoFilter sheet only', () => {
    const input = { version: 1, rows: 3, cols: 3, cells: {}, headerRow: true, filters: { A: ['x', 3], b: ['y'], C: 'z' } };
    expect(weSheetSanitize({ ...input, autoFilter: true })?.filters).toEqual({ A: ['x'] });
    expect(weSheetSanitize(input)?.filters).toBeUndefined();
    const data = { version: 1 as const, rows: 3, cols: 3, cells: {}, headerRow: true, autoFilter: true, filters: { A: ['x'], B: ['y'] } };
    expect(weSheetInsert(data, 'col', 0, 1).filters).toEqual({ B: ['x'], C: ['y'] });
    expect(weSheetInsert(data, 'col', 0, -1).filters).toEqual({ A: ['y'] });
  });
});

describe('weSheetFromCells', () => {
  it('builds a sheet from typed cells, within the limits', () => {
    const { data, truncated } = weSheetFromCells({ A1: 'Name', B2: '1.5', C3: '=B2*2', A5001: 'x', GS1: 'y' }, '.', 4, 2);
    expect(truncated).toBeTrue();
    expect(data.cells).toEqual({ A1: { v: 'Name' }, B2: { v: 1.5 }, C3: { v: '=B2*2' } });
    expect([data.rows, data.cols]).toEqual([13, 3]);
  });
});

describe('typed dates', () => {
  it('reads ISO and local dates in the locale\'s order, and refuses days that do not exist', () => {
    expect(weSheetParseInput('2026-01-15', ',')).toEqual({ value: 46037, format: 'date' });
    expect(weSheetParseInput('15.01.2026', ',')).toEqual({ value: 46037, format: 'date' });
    expect(weSheetParseInput('1/15/2026', '.', 'mdy')).toEqual({ value: 46037, format: 'date' });
    expect(weSheetParseInput('15/1/26', '.', 'dmy').value).toBe(46037);
    expect(weSheetParseInput('31.02.2026', ',').value).toBe('31.02.2026');
    expect(weSheetParseInput('1.5', '.').value).toBe(1.5);
    expect(weSheetFormatValue(46037, 'date', 'en-US', 'USD')).toBe('Jan 15, 2026');
  });
});

describe('merged cells', () => {
  it('keeps valid, non-overlapping merges and moves them with inserted rows and columns', () => {
    expect(weSheetSanitizeMerges(['A1:B2', 'B2:C3', 'D4:D4', 'x', 'E1:F1', 'A1:Z9999'], 100, 20)).toEqual(['A1:B2', 'E1:F1']);
    const data = { version: 1 as const, rows: 10, cols: 6, cells: {}, merges: ['B2:C3'] };
    expect(weSheetInsert(data, 'row', 0, 1).merges).toEqual(['B3:C4']);
    expect(weSheetInsert(data, 'col', 1, -1).merges).toEqual(['B2:B3']);
    expect(weSheetInsert(data, 'row', 1, -1).merges).toEqual(['B2:C2']);
    expect(weSheetInsert({ ...data, merges: ['B2:B3'] }, 'row', 1, -1).merges).toBeUndefined();
  });
});

describe('frozen panes', () => {
  it('move with inserted and deleted rows and columns', () => {
    const data = { version: 1 as const, rows: 10, cols: 6, cells: {}, freeze: { rows: 2, cols: 1 } };
    expect(weSheetInsert(data, 'row', 0, 1).freeze).toEqual({ rows: 3, cols: 1 });
    expect(weSheetInsert(data, 'row', 5, 1).freeze).toEqual({ rows: 2, cols: 1 });
    expect(weSheetInsert(data, 'row', 0, -2).freeze).toEqual({ rows: 0, cols: 1 });
    expect(weSheetInsert(data, 'col', 0, -1).freeze).toEqual({ rows: 2, cols: 0 });
    expect(weSheetInsert({ ...data, freeze: { rows: 0, cols: 1 } }, 'col', 0, -1).freeze).toBeUndefined();
  });
});
