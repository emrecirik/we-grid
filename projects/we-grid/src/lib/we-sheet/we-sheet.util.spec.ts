import { WeGridFormulaError } from '../services/we-grid-formula.util';
import {
  weSheetAddress,
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
