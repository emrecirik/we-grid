import { weGridRangeStats, weGridSpan, weGridToTsv, weGridTsvCell } from './we-grid-cell-range.util';

describe('we-grid-cell-range.util', () => {
  it('quotes only the cells a spreadsheet would misread', () => {
    expect(weGridTsvCell('plain')).toBe('plain');
    expect(weGridTsvCell('a\tb')).toBe('"a\tb"');
    expect(weGridTsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('writes rows as tab-separated lines, with or without a header line', () => {
    expect(weGridToTsv(['A', 'B'], [['1', '2'], ['3', '4']])).toBe('A\tB\n1\t2\n3\t4');
    expect(weGridToTsv(null, [['1', '2']])).toBe('1\t2');
  });

  it('orders a span either way and refuses a missing end', () => {
    expect(weGridSpan(4, 1)).toEqual([1, 4]);
    expect(weGridSpan(2, 2)).toEqual([2, 2]);
    expect(weGridSpan(-1, 3)).toBeNull();
  });

  it('counts non-empty cells and does the arithmetic on numbers only', () => {
    const stats = weGridRangeStats([10, 'x', null, '', undefined, -4, 0, NaN]);
    expect(stats).toEqual({ count: 5, numbers: 3, sum: 6, average: 2, min: -4, max: 10 });
  });

  it('gives zeros when the block holds no number', () => {
    expect(weGridRangeStats(['a', 'b'])).toEqual({ count: 2, numbers: 0, sum: 0, average: 0, min: 0, max: 0 });
  });
});
