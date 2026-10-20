import {
  WE_GRID_FORMULA_FUNCTIONS,
  WeGridFormulaError,
  WeGridFormulaScope,
  WeGridFormulaSyntaxError,
  WeGridSheetEvaluator,
  weGridColumnIndex,
  weGridColumnLetter,
  weGridCompileFormula,
  weGridFormulaValueToText,
  weGridIsFormula,
  weGridTryCompileFormula
} from './we-grid-formula.util';

const NOW = new Date(2026, 9, 19, 14, 30);

function calc(src: string, scope: WeGridFormulaScope = {}): unknown {
  return weGridCompileFormula(src).evaluate({ now: () => NOW, ...scope });
}

function code(v: unknown): string | null {
  return v instanceof WeGridFormulaError ? v.code : null;
}

/** A sheet from rows of raw inputs */
function sheet(rows: unknown[][]): WeGridSheetEvaluator {
  return new WeGridSheetEvaluator(
    (c, r) => rows[r]?.[c],
    () => ({ rows: rows.length, cols: Math.max(...rows.map(r => r.length)) }),
    { now: () => NOW }
  );
}

describe('weGridCompileFormula', () => {
  it('follows Excel precedence and associativity', () => {
    expect(calc('=1+2*3')).toBe(7);
    expect(calc('=(1+2)*3')).toBe(9);
    expect(calc('=-2^2')).toBe(4);
    expect(calc('=2^3^2')).toBe(64);
    expect(calc('=10-4-3')).toBe(3);
    expect(calc('=50%')).toBe(0.5);
    expect(calc('=200*10%')).toBe(20);
    expect(calc('1+1')).toBe(2);
  });

  it('cleans up floating point noise', () => {
    expect(calc('=0.1+0.2')).toBe(0.3);
    expect(calc('=0.1+0.2=0.3')).toBe(true);
    expect(weGridFormulaValueToText(0.1 + 0.2)).toBe('0.3');
  });

  it('concatenates and compares text case-insensitively', () => {
    expect(calc('="a"&1&TRUE')).toBe('a1TRUE');
    expect(calc('="say ""hi"""')).toBe('say "hi"');
    expect(calc('="abc"="ABC"')).toBe(true);
    expect(calc('="b">"A"')).toBe(true);
    expect(calc('=1<"a"')).toBe(true);
    expect(calc('=2<>2')).toBe(false);
    expect(calc('=3>=3')).toBe(true);
  });

  it('turns errors into values that propagate', () => {
    expect(code(calc('=1/0'))).toBe('#DIV/0!');
    expect(code(calc('=1/0+5'))).toBe('#DIV/0!');
    expect(code(calc('="a"*2'))).toBe('#VALUE!');
    expect(code(calc('=NOPE(1)'))).toBe('#NAME?');
    expect(code(calc('=foo'))).toBe('#NAME?');
    expect(code(calc('=SUM(1, 1/0)'))).toBe('#DIV/0!');
    expect(calc('=IFERROR(1/0, "x")')).toBe('x');
    expect(weGridFormulaValueToText(calc('=#N/A'))).toBe('#N/A');
    expect(String(new WeGridFormulaError('#NUM!'))).toBe('#NUM!');
  });

  it('resolves [Field] references through the scope', () => {
    const scope: WeGridFormulaScope = { field: n => ({ Price: 12.5, Qty: 4, Name: 'Pen', Empty: undefined } as Record<string, unknown>)[n] };
    expect(calc('=[Price]*[Qty]', scope)).toBe(50);
    expect(calc('=[Name]&"!"', scope)).toBe('Pen!');
    expect(calc('=[Empty]+1', scope)).toBe(1);
    expect(code(calc('=[Price]'))).toBe('#REF!');
    expect(calc('=SUM([Amount])', { field: () => [1, 2, null, 'x', 3] })).toBe(6);
    const f = weGridCompileFormula('=[Price]*[Qty]+[Price]');
    expect(f.fieldRefs).toEqual(['Price', 'Qty']);
    expect(f.hasCellRefs).toBeFalse();
    expect(weGridCompileFormula('=A1+B2').hasCellRefs).toBeTrue();
  });

  it('accepts Turkish names, mixed case and ; separators', () => {
    expect(calc('=TOPLA(1;2;3)')).toBe(6);
    expect(calc('=eğer(1>0; "evet"; "hayır")')).toBe('evet');
    expect(calc('=min(4;2)')).toBe(2);
    expect(calc('=MİN(4;2)')).toBe(2);
    expect(calc("=YUVARLA(2.345;2)")).toBe(2.35);
    expect(calc('=DOĞRU')).toBe(true);
    expect(calc('=yanlış')).toBe(false);
    expect(calc('=İNDİS(1;1)')).toBe(1);
    expect(calc('=YAZIM.DÜZENİ("ali veli")')).toBe('Ali Veli');
  });

  it('aggregates like Excel', () => {
    expect(calc('=SUM(1,"2",TRUE)')).toBe(4);
    expect(calc('=AVERAGE(2,4)')).toBe(3);
    expect(code(calc('=AVERAGE()'))).toBe('#DIV/0!');
    expect(calc('=MIN(3,1,2)')).toBe(1);
    expect(calc('=MAX(3,1,2)')).toBe(3);
    expect(calc('=MAX()')).toBe(0);
    expect(calc('=COUNT(1,"a",2,1/0)')).toBe(2);
    expect(calc('=COUNTA(1,"a",,1/0)')).toBe(3);
  });

  it('evaluates criteria functions', () => {
    const scope: WeGridFormulaScope = { field: n => (n === 'Q' ? [5, 12, 20, 'x', null] : ['a', 'b', 'a', 'c', 'a']) };
    expect(calc('=COUNTIF([Q], ">10")', scope)).toBe(2);
    expect(calc('=COUNTIF([Q], 5)', scope)).toBe(1);
    expect(calc('=COUNTIF([Q], "<>5")', scope)).toBe(4);
    expect(calc('=COUNTIF([Q], "")', scope)).toBe(1);
    expect(calc('=COUNTIF([C], "A")', scope)).toBe(3);
    expect(calc('=COUNTIF([C], "<>a")', scope)).toBe(2);
    expect(calc('=COUNTIF([C], "?")', scope)).toBe(5);
    expect(calc('=SUMIF([Q], ">=12")', scope)).toBe(32);
    expect(calc('=SUMIF([C], "a", [Q])', scope)).toBe(25);
    expect(calc('=AVERAGEIF([C], "a", [Q])', scope)).toBe(12.5);
    expect(code(calc('=AVERAGEIF([C], "z", [Q])', scope))).toBe('#DIV/0!');
  });

  it('evaluates logical functions lazily', () => {
    expect(calc('=IF(1>2, 1/0, "ok")')).toBe('ok');
    expect(calc('=IF(FALSE, 1)')).toBe(false);
    expect(calc('=IFS(1>2, "a", 2>1, "b")')).toBe('b');
    expect(code(calc('=IFS(1>2, "a")'))).toBe('#N/A');
    expect(calc('=AND(TRUE, 1)')).toBe(true);
    expect(calc('=OR(FALSE, 0)')).toBe(false);
    expect(calc('=NOT(FALSE)')).toBe(true);
    expect(code(calc('=AND("x")'))).toBe('#VALUE!');
  });

  it('evaluates math functions', () => {
    expect(calc('=ROUND(2.5)')).toBe(3);
    expect(calc('=ROUND(-2.5)')).toBe(-3);
    expect(calc('=ROUND(1.005, 2)')).toBe(1.01);
    expect(calc('=ROUND(1234, -2)')).toBe(1200);
    expect(calc('=ROUNDUP(1.21, 1)')).toBe(1.3);
    expect(calc('=ROUNDDOWN(-1.29, 1)')).toBe(-1.2);
    expect(calc('=ABS(-3)')).toBe(3);
    expect(calc('=INT(-1.5)')).toBe(-2);
    expect(calc('=MOD(-3, 2)')).toBe(1);
    expect(code(calc('=MOD(1, 0)'))).toBe('#DIV/0!');
    expect(calc('=POWER(2, 10)')).toBe(1024);
    expect(code(calc('=0^0'))).toBe('#NUM!');
    expect(calc('=SQRT(16)')).toBe(4);
    expect(code(calc('=SQRT(-1)'))).toBe('#NUM!');
  });

  it('evaluates text functions', () => {
    expect(calc('=LEN("abc")')).toBe(3);
    expect(calc('=LEFT("abc")')).toBe('a');
    expect(calc('=LEFT("abc", 2)')).toBe('ab');
    expect(calc('=RIGHT("abc", 2)')).toBe('bc');
    expect(calc('=MID("abcdef", 2, 3)')).toBe('bcd');
    expect(calc('=UPPER("ab")')).toBe('AB');
    expect(calc('=LOWER("AB")')).toBe('ab');
    expect(calc('=PROPER("hello WORLD")')).toBe('Hello World');
    expect(calc('=TRIM("  a   b ")')).toBe('a b');
    expect(calc('=CONCAT("a", 1, "b")')).toBe('a1b');
    expect(calc('=CONCATENATE("x", "y")')).toBe('xy');
    expect(calc('=TEXT(1234.5, "#,##0.00")')).toBe('1,234.50');
    expect(calc('=TEXT(0.256, "0.0%")')).toBe('25.6%');
    expect(calc('=TEXT(-3.14159, "0")')).toBe('-3');
  });

  it('evaluates date functions', () => {
    const today = calc('=TODAY()') as Date;
    expect(today.getHours()).toBe(0);
    expect(today.getDate()).toBe(19);
    expect(calc('=NOW()')).toBe(NOW);
    expect(calc('=YEAR(DATE(2026, 1, 5))')).toBe(2026);
    expect(calc('=MONTH(DATE(2026, 1, 5))')).toBe(1);
    expect(calc('=DAY(DATE(2026, 1, 5))')).toBe(5);
    expect(calc('=DAY(DATE(2026, 1, 31) + 1)')).toBe(1);
    expect(calc('=DATE(2026, 3, 1) - DATE(2026, 2, 1)')).toBe(28);
    expect(calc('=YEAR("2024-06-01")')).toBe(2024);
    expect(calc('=DATE(2026,1,2) > DATE(2026,1,1)')).toBe(true);
  });

  it('looks values up', () => {
    const table = [
      [10, 'ten'],
      [20, 'twenty'],
      [30, 'thirty']
    ];
    const scope: WeGridFormulaScope = { field: n => (n === 'T' ? table : ['x', 'y', 'z']) };
    expect(calc('=VLOOKUP(20, [T], 2, FALSE)', scope)).toBe('twenty');
    expect(calc('=VLOOKUP(25, [T], 2)', scope)).toBe('twenty');
    expect(code(calc('=VLOOKUP(5, [T], 2)', scope))).toBe('#N/A');
    expect(code(calc('=VLOOKUP(25, [T], 2, FALSE)', scope))).toBe('#N/A');
    expect(code(calc('=VLOOKUP(10, [T], 3, FALSE)', scope))).toBe('#REF!');
    expect(calc('=MATCH("Y", [L], 0)', scope)).toBe(2);
    expect(calc('=INDEX([L], 3)', scope)).toBe('z');
    expect(calc('=INDEX([T], 2, 2)', scope)).toBe('twenty');
    expect(code(calc('=INDEX([T], 9, 1)', scope))).toBe('#REF!');
  });

  it('reports syntax errors with their position', () => {
    expect(() => weGridCompileFormula('=1+')).toThrowError(WeGridFormulaSyntaxError);
    const r = weGridTryCompileFormula('=SUM(1,2');
    expect('error' in r && r.error.position).toBe(8);
    const r2 = weGridTryCompileFormula('=1 + @');
    expect('error' in r2 && r2.error.position).toBe(5);
    expect('error' in weGridTryCompileFormula('="abc')).toBeTrue();
    expect('error' in weGridTryCompileFormula('=')).toBeTrue();
    expect('formula' in weGridTryCompileFormula('=1')).toBeTrue();
  });

  it('caches compiled formulas by source', () => {
    expect(weGridCompileFormula('=1+2')).toBe(weGridCompileFormula('=1+2'));
  });
});

describe('weGridSheetEvaluator', () => {
  it('resolves cells, ranges and whole columns', () => {
    const s = sheet([
      ['10', '=A1*2', '=SUM(A1:B1)'],
      [5, '=A2+$A$1', '=SUM(A:A)'],
      ['x', '', '=A3&B3']
    ]);
    expect(s.value(0, 0)).toBe(10);
    expect(s.value(1, 0)).toBe(20);
    expect(s.value(2, 0)).toBe(30);
    expect(s.value(1, 1)).toBe(15);
    expect(s.value(2, 1)).toBe(15);
    expect(s.value(2, 2)).toBe('x');
    expect(s.value(1, 2)).toBeNull();
    expect(s.value(9, 9)).toBeNull();
  });

  it('detects cycles and bad formulas', () => {
    const s = sheet([['=B1', '=A1', '=C1+1', '=1+', '=A1:B1']]);
    expect(code(s.value(0, 0))).toBe('#CIRC!');
    expect(code(s.value(1, 0))).toBe('#CIRC!');
    expect(code(s.value(2, 0))).toBe('#CIRC!');
    expect(code(s.value(3, 0))).toBe('#ERROR!');
    expect(code(s.value(4, 0))).toBe('#VALUE!');
  });

  it('recomputes after invalidate', () => {
    const rows: unknown[][] = [[1, '=A1+1']];
    const s = sheet(rows);
    expect(s.value(1, 0)).toBe(2);
    rows[0][0] = 41;
    expect(s.value(1, 0)).toBe(2);
    s.invalidate();
    expect(s.value(1, 0)).toBe(42);
  });
});

describe('formula helpers', () => {
  it('converts column letters both ways', () => {
    expect(weGridColumnLetter(0)).toBe('A');
    expect(weGridColumnLetter(25)).toBe('Z');
    expect(weGridColumnLetter(26)).toBe('AA');
    expect(weGridColumnLetter(701)).toBe('ZZ');
    expect(weGridColumnLetter(702)).toBe('AAA');
    for (const i of [0, 25, 26, 701, 702, 16383]) expect(weGridColumnIndex(weGridColumnLetter(i))).toBe(i);
    expect(weGridColumnIndex('ab')).toBe(27);
  });

  it('recognises formulas and lists functions', () => {
    expect(weGridIsFormula('=1')).toBeTrue();
    expect(weGridIsFormula('1')).toBeFalse();
    expect(weGridIsFormula(1)).toBeFalse();
    expect(WE_GRID_FORMULA_FUNCTIONS).toContain('VLOOKUP');
    expect(weGridFormulaValueToText(true)).toBe('TRUE');
    expect(weGridFormulaValueToText(null)).toBe('');
  });
});

describe('formula edge cases (0.16.0 fixes)', () => {
  it('takes MIN and MAX of a range too large to spread onto the stack', () => {
    const big = Array.from({ length: 300000 }, (_, i) => i - 7);
    expect(calc('=MAX(A1:A300000)', { range: () => big.map(n => [n]) })).toBe(299992);
    expect(calc('=MIN(A1:A300000)', { range: () => big.map(n => [n]) })).toBe(-7);
  });

  it('skips text in a cell reference to SUM, AVERAGE, MIN and MAX, as Excel does', () => {
    const s = sheet([['label', 5, '=SUM(A1,B1)', '=AVERAGE(A1,B1)', '=MAX(A1,B1)']]);
    expect([s.value(2, 0), s.value(3, 0), s.value(4, 0)]).toEqual([5, 5, 5]);
    expect(code(calc('=SUM("abc", 1)'))).toBe('#VALUE!');
  });

  it('rounds TEXT the way ROUND does', () => {
    expect(calc('=TEXT(1.005, "0.00")')).toBe('1.01');
    expect(calc('=ROUND(1.005, 2)')).toBe(1.01);
  });

  it('reads decimal notation only, and leaves typed text alone with parseNumbers off', () => {
    const s = sheet([['0x10', '=A1+1', '12']]);
    expect(s.value(0, 0)).toBe('0x10');
    expect(code(s.value(1, 0))).toBe('#VALUE!');
    expect(s.value(2, 0)).toBe(12);
    expect(calc('="1.5e2"+0')).toBe(150);
    const rows = [['007', '=A1&"!"']];
    const typed = new WeGridSheetEvaluator((c, r) => rows[r]?.[c], () => ({ rows: 1, cols: 2 }), { parseNumbers: false });
    expect([typed.value(0, 0), typed.value(1, 0)]).toEqual(['007', '007!']);
  });
});

describe('more Excel functions (0.22.0)', () => {
  const s = () =>
    sheet([
      ['Region', 'Item', 'Qty', 'Price'],
      ['North', 'Pen', 10, 2],
      ['South', 'Pen', 5, 2],
      ['North', 'Book', 2, 12],
      ['North', 'Pen', '', 2]
    ]);
  const at = (src: string) => {
    const rows: unknown[][] = [
      ['Region', 'Item', 'Qty', 'Price'],
      ['North', 'Pen', 10, 2],
      ['South', 'Pen', 5, 2],
      ['North', 'Book', 2, 12],
      ['North', 'Pen', '', 2],
      [src]
    ];
    return sheet(rows).value(0, 5);
  };

  it('aggregates with several criteria', () => {
    expect(s()).toBeTruthy();
    expect(at('=SUMIFS(C2:C5, A2:A5, "North", B2:B5, "Pen")')).toBe(10);
    expect(at('=COUNTIFS(A2:A5; "North"; C2:C5; ">1")')).toBe(2);
    expect(at('=AVERAGEIFS(D2:D5, B2:B5, "Pen")')).toBe(2);
    expect(at('=ÇOKETOPLA(C2:C5; A2:A5; "South")')).toBe(5);
    expect(at('=COUNTBLANK(C2:C5)')).toBe(1);
    expect(at('=SUMPRODUCT(C2:C4, D2:D4)')).toBe(54);
    expect(code(at('=SUMIFS(C2:C5, A2:A4, "North")'))).toBe('#VALUE!');
  });

  it('looks values up across and down', () => {
    expect(at('=XLOOKUP("Book", B2:B5, C2:C5)')).toBe(2);
    expect(at('=XLOOKUP("Ink", B2:B5, C2:C5, "none")')).toBe('none');
    expect(code(at('=XLOOKUP("Ink", B2:B5, C2:C5)'))).toBe('#N/A');
    expect(at('=XLOOKUP(7, C2:C4, B2:B4, "x", 1)')).toBe('Pen');
    expect(at('=HLOOKUP("Qty", A1:D3, 3, FALSE)')).toBe(5);
    expect(at('=CHOOSE(2, "a", "b", "c")')).toBe('b');
    expect(at('=SWITCH(B3, "Pen", "writing", "Book", "reading", "other")')).toBe('writing');
  });

  it('works out statistics', () => {
    expect(calc('=MEDIAN(3, 1, 4, 1, 5)')).toBe(3);
    expect(calc('=MEDIAN(1, 2, 3, 4)')).toBe(2.5);
    expect(at('=LARGE(C2:C4, 2)')).toBe(5);
    expect(at('=SMALL(C2:C4, 1)')).toBe(2);
    expect(at('=RANK(5, C2:C4)')).toBe(2);
    expect(at('=RANK(5, C2:C4, 1)')).toBe(2);
    expect(calc('=ROUND(STDEV(2, 4, 4, 4, 5, 5, 7, 9), 4)')).toBe(2.1381);
    expect(calc('=PRODUCT(2, 3, 4)')).toBe(24);
    expect(code(calc('=LARGE(1, 3)'))).toBe('#NUM!');
  });

  it('rounds to multiples and takes logs', () => {
    expect(calc('=CEILING(4.2, 0.5)')).toBe(4.5);
    expect(calc('=FLOOR(4.7)')).toBe(4);
    expect(calc('=SIGN(-3)')).toBe(-1);
    expect(calc('=LOG(1000)')).toBe(3);
    expect(calc('=LOG(8, 2)')).toBe(3);
    expect(calc('=ROUND(LN(EXP(2)), 10)')).toBe(2);
    expect(calc('=ROUND(PI(), 4)')).toBe(3.1416);
    expect(code(calc('=LN(0)'))).toBe('#NUM!');
  });

  it('finds, replaces and joins text', () => {
    expect(calc('=FIND("b", "abcb")')).toBe(2);
    expect(calc('=FIND("B", "abcb")')).toEqual(jasmine.any(WeGridFormulaError));
    expect(calc('=SEARCH("B?", "abcb")')).toBe(2);
    expect(calc('=SEARCH("*c", "abcb", 2)')).toBe(2);
    expect(calc('=SUBSTITUTE("a-b-c", "-", "+")')).toBe('a+b+c');
    expect(calc('=SUBSTITUTE("a-b-c", "-", "+", 2)')).toBe('a-b+c');
    expect(calc('=REPLACE("abcdef", 2, 3, "X")')).toBe('aXef');
    expect(calc('=REPT("ab", 3)')).toBe('ababab');
    expect(calc('=EXACT("a", "A")')).toBeFalse();
    expect(calc('=VALUE("12.5") + 1')).toBe(13.5);
    expect(calc('=TEXTJOIN(", ", TRUE, "a", "", "b")')).toBe('a, b');
    expect(calc('=METİNBİRLEŞTİR("-"; YANLIŞ; "a"; ""; "b")')).toBe('a--b');
  });

  it('tells what a value is and catches #N/A', () => {
    expect(calc('=ISBLANK("")')).toBeFalse();
    expect(calc('=ISTEXT("")')).toBeTrue();
    expect(calc('=CEILING(-2.5, 2)')).toBe(-2);
    expect(calc('=FLOOR(-2.5, 2)')).toBe(-4);
    expect(calc('=FLOOR(0.3, 0.1)')).toBe(0.3);
    expect(code(calc('=CEILING(5, -2)'))).toBe('#NUM!');
    expect(at('=SIRA(5; C2:C4)')).toBe(2);
    expect(calc('=ISNUMBER(3)')).toBeTrue();
    expect(calc('=ISTEXT(3)')).toBeFalse();
    expect(calc('=ISERROR(1/0)')).toBeTrue();
    expect(calc('=IFNA(NA(), "none")')).toBe('none');
    expect(code(calc('=IFNA(1/0, "none")'))).toBe('#DIV/0!');
    expect(calc('=XOR(TRUE, TRUE, TRUE)')).toBeTrue();
  });

  it('works with dates and times', () => {
    expect(calc('=WEEKDAY(DATE(2026, 10, 19))')).toBe(2);
    expect(calc('=WEEKDAY(DATE(2026, 10, 19), 2)')).toBe(1);
    expect(calc('=DAY(EOMONTH(DATE(2024, 1, 15), 1))')).toBe(29);
    expect(calc('=DAY(EDATE(DATE(2024, 1, 31), 1))')).toBe(29);
    expect(calc('=DAYS(DATE(2026, 3, 1), DATE(2026, 2, 1))')).toBe(28);
    expect(calc('=HOUR(NOW())')).toBe(14);
    expect(calc('=MINUTE(NOW())')).toBe(30);
  });
});

describe('Excel edge cases (0.24.0 fixes)', () => {
  const grid = (rows: unknown[][], src: string) => sheet([...rows, [src]]).value(0, rows.length);

  it('looks up with XLOOKUP the way Excel does', () => {
    const rows = [[1, 'a', 'b'], [2, 'c', 'd'], [2, 'e', 'f']];
    expect(code(grid(rows, '=XLOOKUP(9, A1:A3, B1:B3, , 1)'))).toBe('#N/A');
    expect(grid(rows, '=XLOOKUP(2, A1:A3, B1:B3, "none", 0, -1)')).toBe('e');
    expect(grid(rows, '=INDEX(XLOOKUP(2, A1:A3, B1:C3), 2)')).toBe('d');
    expect(grid([['apple', 1], ['banana', 2]], '=XLOOKUP("ban*", A1:A2, B1:B2, "", 2)')).toBe(2);
  });

  it('counts, sums and searches with Excel wildcards and booleans', () => {
    expect(grid([['a*'], ['ab']], '=COUNTIFS(A1:A2, "a~*")')).toBe(1);
    expect(grid([['a*'], ['ab']], '=COUNTIF(A1:A2, "a*")')).toBe(2);
    expect(calc('=SEARCH("~?", "a?b")')).toBe(2);
    expect(grid([[true], [false], [true]], '=COUNTIFS(A1:A3, "TRUE")')).toBe(2);
    expect(grid([['TRUE'], [false]], '=XOR(A1:A2)')).toBeFalse();
  });

  it('gets the small cases right', () => {
    expect(grid([[''], ['']], '=PRODUCT(A1:A2)')).toBe(0);
    expect(calc('=DAYS(DATE(2024, 1, 2) + 0.75, DATE(2024, 1, 1))')).toBe(1);
    expect(calc('=WEEKDAY(DATE(2024, 1, 1), 11)')).toBe(1);
    expect(calc('=WEEKDAY(DATE(2024, 1, 1), 17)')).toBe(2);
    expect(code(calc('=LOG(10, 1)'))).toBe('#DIV/0!');
    expect(calc('=VALUE("10%")')).toBe(0.1);
  });
});
