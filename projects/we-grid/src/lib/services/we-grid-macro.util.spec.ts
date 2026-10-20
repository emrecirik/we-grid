import { WeGridSavedView } from '../models/we-grid-view.model';
import { weGridDiffViews, weGridMacroScript, weGridParseMacro, weGridSanitizeMacros } from './we-grid-macro.util';

describe('we-grid macro scripts', () => {
  it('parses every kind of step', () => {
    const { lines, errors } = weGridParseMacro(`
      # a comment
      SORT [Total] DESC
      FILTER [City] = "Istanbul"
      FILTER [Qty] BETWEEN 2 AND 10
      FILTER [Status] IN ("Open", "Shipped")
      FILTER [Name] STARTS WITH "A"
      CLEAR FILTERS
      GROUP BY [City], [Category]
      UNGROUP
      SHOW [Notes]
      HIDE [Id], [Code]
      DENSITY compact
      ZEBRA ON
      HIGHLIGHT [Total] >= 1000 GREEN BOLD ROW
      HIGHLIGHT [Qty] TOP 5
      HIGHLIGHT ROWS WHERE =[Qty] > [Stock] RED
      DATABAR [Total] BLUE
      COLORSCALE [Margin] RED YELLOW GREEN
      CLEAR FORMATS [Total]
      SET [Status] = IF([Qty] > 10, "Bulk", [Status]) WHERE [City] = "Ankara"
      VIEW "Monthly"
      EXPORT xlsx
      RUN notifyTeam
      MESSAGE "Done"
    `);
    expect(errors).toEqual([]);
    expect(lines.map((l) => l.step.op)).toEqual([
      'sort', 'filter', 'filter', 'filter', 'filter', 'clearFilters', 'group', 'ungroup', 'show', 'hide', 'density', 'zebra',
      'format', 'format', 'format', 'format', 'format', 'clearFormats', 'set', 'view', 'export', 'run', 'message'
    ]);
    expect(lines[0]).toEqual({ line: 3, step: { op: 'sort', field: 'Total', direction: 'desc' } });
    expect(lines[3].step).toEqual({ op: 'filter', field: 'Status', operator: 'in', values: ['Open', 'Shipped'] });
    expect(lines[12].step).toEqual({
      op: 'format',
      rule: { field: 'Total', type: 'condition', operator: 'gte', value: 1000, style: { fill: 'green', color: 'green', bold: true }, applyTo: 'row' }
    });
    expect(lines[13].step).toEqual(jasmine.objectContaining({ rule: jasmine.objectContaining({ operator: 'top', value: 5, style: { fill: 'yellow', color: 'yellow' } }) }));
    expect(lines[14].step).toEqual(jasmine.objectContaining({ rule: jasmine.objectContaining({ operator: 'formula', value: '=[Qty] > [Stock]', applyTo: 'row' }) }));
    expect(lines[18].step).toEqual({ op: 'set', field: 'Status', formula: '=IF([Qty] > 10, "Bulk", [Status])', where: '=[City] = "Ankara"' });
  });

  it('reports unreadable lines with their numbers and keeps the rest', () => {
    const { lines, errors } = weGridParseMacro('SORT [A] UP\nSORT [A] ASC\nFLY away\nSET [A] = 1 +\nFILTER [A] = "x');
    expect(lines.length).toBe(1);
    expect(errors.map((e) => e.line)).toEqual([1, 3, 4, 5]);
    expect(errors[1].message).toContain('FLY');
  });

  it('writes steps back as a script that parses to the same steps', () => {
    const script = [
      'SORT [Total] DESC',
      'FILTER [City] = "Ist""anbul"',
      'FILTER [Qty] BETWEEN 2 AND 10',
      'GROUP BY [City]',
      'HIGHLIGHT [Total] > 1000 GREEN BOLD ROW',
      'HIGHLIGHT ROWS WHERE [Qty] > 3 RED',
      'COLORSCALE [Margin] RED GREEN',
      'SET [A] = [B] * 2 WHERE [C] > 1',
      'EXPORT CSV'
    ].join('\n');
    const first = weGridParseMacro(script).lines.map((l) => l.step);
    const again = weGridParseMacro(weGridMacroScript(first)).lines.map((l) => l.step);
    expect(again).toEqual(first);
  });

  it('turns the difference between two views into steps', () => {
    const before: WeGridSavedView = {
      name: 'a',
      columns: [
        { field: 'city', visible: true, order: 0, pinned: null },
        { field: 'qty', visible: true, order: 1, pinned: null }
      ],
      sort: null,
      filters: [],
      groupField: null
    };
    const after: WeGridSavedView = {
      ...before,
      columns: [
        { field: 'city', visible: true, order: 0, pinned: null },
        { field: 'qty', visible: false, order: 1, pinned: null }
      ],
      sort: { field: 'qty', direction: 'desc' },
      filters: [{ field: 'city', operator: 'in', value: ['Izmir'] }],
      groupField: 'city',
      density: 'compact',
      striped: true
    };
    const headers: Record<string, string> = { city: 'City', qty: 'Qty' };
    const rule = { id: 'r1', field: 'qty', type: 'condition' as const, operator: 'gt' as const, value: 5, style: { bold: true } };
    const withRule = { ...before, formatRules: [rule] };
    expect(weGridMacroScript(weGridDiffViews(withRule, { ...withRule, formatRules: [rule, { ...rule, id: 'r2', value: 9 }] }, (f) => headers[f]))).toBe(
      'HIGHLIGHT [Qty] > 9 BOLD'
    );
    expect(weGridMacroScript(weGridDiffViews(withRule, { ...withRule, formatRules: [] }, (f) => headers[f]))).toBe('CLEAR FORMATS');
    expect(weGridMacroScript(weGridDiffViews(before, after, (f) => headers[f]))).toBe(
      ['HIDE [Qty]', 'CLEAR FILTERS', 'FILTER [City] IN ("Izmir")', 'GROUP BY [City]', 'SORT [Qty] DESC', 'DENSITY COMPACT', 'ZEBRA ON'].join('\n')
    );
  });

  it('records numbers as the user sees them and one-sided ranges as comparisons', () => {
    const base: WeGridSavedView = { name: 'a', columns: [], sort: null, filters: [], groupField: null };
    const after: WeGridSavedView = {
      ...base,
      filters: [
        { field: 'pct', operator: 'gt', value: 0.25 },
        { field: 'qty', operator: 'between', value: 5, value2: null },
        { field: 'qty2', operator: 'between', value: null, value2: 9 }
      ]
    };
    const script = weGridMacroScript(weGridDiffViews(base, after, (f) => f, (f) => (f === 'pct' ? 100 : 1)));
    expect(script).toBe(['CLEAR FILTERS', 'FILTER [pct] > 25', 'FILTER [qty] > 5', 'FILTER [qty2] < 9'].join('\n'));
    expect(weGridParseMacro(script).errors).toEqual([]);
  });

  it('reads, writes and records sorts on several columns', () => {
    const { lines, errors } = weGridParseMacro('SORT [City] ASC THEN [Total] DESC THEN [Qty] ASC');
    expect(errors).toEqual([]);
    expect(lines[0].step).toEqual({ op: 'sort', field: 'City', direction: 'asc', then: [{ field: 'Total', direction: 'desc' }, { field: 'Qty', direction: 'asc' }] });
    expect(weGridMacroScript([lines[0].step])).toBe('SORT [City] ASC THEN [Total] DESC THEN [Qty] ASC');
    expect(weGridParseMacro('SORT [City] ASC THEN [Total]').errors.length).toBe(1);
    const base: WeGridSavedView = { name: 'a', columns: [], sort: { field: 'city', direction: 'asc' }, filters: [], groupField: null };
    expect(weGridMacroScript(weGridDiffViews(base, { ...base, thenBy: [{ field: 'qty', direction: 'desc' }] }, (f) => f))).toBe('SORT [city] ASC THEN [qty] DESC');
  });

  it('reads and writes icon sets', () => {
    const { lines, errors } = weGridParseMacro('ICONSET [Total] DOTS REVERSE\nICONSET [Qty]');
    expect(errors).toEqual([]);
    expect(lines.map((l) => l.step)).toEqual([
      { op: 'format', rule: { field: 'Total', type: 'iconSet', icons: 'dots', reverse: true } },
      { op: 'format', rule: { field: 'Qty', type: 'iconSet', icons: 'arrows' } }
    ]);
    expect(weGridMacroScript(lines.map((l) => l.step))).toBe('ICONSET [Total] DOTS REVERSE\nICONSET [Qty] ARROWS');
  });

  it('sanitises stored macros', () => {
    expect(
      weGridSanitizeMacros([{ id: 'm1', name: ' Daily ', script: 'SORT [A] ASC', pinned: true, evil: 1 }, { id: 'm1', name: 'dup', script: '' }, { name: 'x' }, 7])
    ).toEqual([{ id: 'm1', name: 'Daily', script: 'SORT [A] ASC', pinned: true }]);
    expect(weGridSanitizeMacros('x')).toEqual([]);
  });

  it('reads and writes COLUMN steps', () => {
    const { lines, errors } = weGridParseMacro('COLUMN [Margin] CURRENCY = [Price] - [Cost]\nCOLUMN [Note] = "x"\nCOLUMN [Bad] SIDEWAYS = 1\nCOLUMN [Bad]');
    expect(lines.map((l) => l.step)).toEqual([
      { op: 'column', header: 'Margin', formula: '=[Price] - [Cost]', type: 'currency' },
      { op: 'column', header: 'Note', formula: '="x"' }
    ]);
    expect(errors.map((e) => e.line)).toEqual([3, 4]);
    expect(weGridMacroScript(lines.map((l) => l.step))).toBe('COLUMN [Margin] CURRENCY = [Price] - [Cost]\nCOLUMN [Note] = "x"');
  });
});
