import { weGridParseClipboardTable } from './we-grid-clipboard.util';

describe('weGridParseClipboardTable', () => {
  it('splits tab-separated rows and drops the trailing line break a spreadsheet adds', () => {
    expect(weGridParseClipboardTable('A1\tProduct A\r\nB2\tProduct B\r\n')).toEqual([
      ['A1', 'Product A'],
      ['B2', 'Product B']
    ]);
  });

  it('keeps empty cells, including a trailing one', () => {
    expect(weGridParseClipboardTable('a\t\tc\nd\t\t\n')).toEqual([
      ['a', '', 'c'],
      ['d', '', '']
    ]);
  });

  it('reads a single copied cell, an empty one included', () => {
    expect(weGridParseClipboardTable('42')).toEqual([['42']]);
    expect(weGridParseClipboardTable('\r\n')).toEqual([['']]);
  });

  it('unwraps quoted cells holding line breaks, tabs and doubled quotes', () => {
    expect(weGridParseClipboardTable('"line 1\nline 2"\t"say ""hi"""\t"a\tb"\n')).toEqual([['line 1\nline 2', 'say "hi"', 'a\tb']]);
  });

  it('leaves a quote that does not wrap the whole cell as text', () => {
    expect(weGridParseClipboardTable('"5" inch\tx')).toEqual([['"5" inch', 'x']]);
  });
});
