import { WeGridFormatRule } from '../models/we-grid-format.model';
import { weGridCellStyleCss, weGridResolveFormats, weGridSanitizeFormatRules } from './we-grid-format.util';

interface Row {
  name: string;
  amount: number | null;
}

const rows: Row[] = [
  { name: 'Ada', amount: 10 },
  { name: 'Bora', amount: 50 },
  { name: 'Cem', amount: 90 },
  { name: 'ada', amount: null }
];
const read = (row: Row, field: string): unknown => row[field as keyof Row];
const fields = ['name', 'amount'];

function resolve(rules: WeGridFormatRule[], formula?: (s: string, r: Row) => unknown) {
  return weGridResolveFormats(rows, rules, fields, read, new Map(), formula);
}

describe('weGridCellStyleCss', () => {
  it('maps a style to palette variables only', () => {
    expect(weGridCellStyleCss({ bold: true, italic: true, underline: true, strike: true, color: 'red', fill: 'green' })).toEqual({
      'font-weight': '600',
      'font-style': 'italic',
      'text-decoration': 'underline line-through',
      color: 'var(--we-grid-format-red-fg, #c41e16)',
      background: 'linear-gradient(var(--we-grid-format-green-bg, #e1f6e6), var(--we-grid-format-green-bg, #e1f6e6)), var(--we-grid-bg, #fff)'
    });
    expect(weGridCellStyleCss(undefined)).toEqual({});
  });
});

describe('weGridResolveFormats', () => {
  const cond = (operator: WeGridFormatRule['operator'], value?: string | number, value2?: string | number): WeGridFormatRule => ({
    id: 'r',
    field: 'amount',
    type: 'condition',
    operator,
    value,
    value2,
    style: { bold: true }
  });
  const boldRows = (rule: WeGridFormatRule) => {
    const map = resolve([rule]);
    return rows.filter((r) => map.get(r)?.[rule.field]?.['font-weight'] === '600').map((r) => r.name);
  };

  it('evaluates comparison operators', () => {
    expect(boldRows(cond('gt', 40))).toEqual(['Bora', 'Cem']);
    expect(boldRows(cond('lte', 50))).toEqual(['Ada', 'Bora']);
    expect(boldRows(cond('eq', '50'))).toEqual(['Bora']);
    expect(boldRows(cond('between', 20, 90))).toEqual(['Bora', 'Cem']);
    expect(boldRows(cond('notBetween', 20, 90))).toEqual(['Ada']);
  });

  it('evaluates statistical operators over the given rows', () => {
    expect(boldRows(cond('top', 1))).toEqual(['Cem']);
    expect(boldRows(cond('bottom', 2))).toEqual(['Ada', 'Bora']);
    expect(boldRows(cond('aboveAverage'))).toEqual(['Cem']);
    expect(boldRows(cond('empty'))).toEqual(['ada']);
  });

  it('evaluates text operators case-insensitively', () => {
    const rule = (operator: WeGridFormatRule['operator'], value?: string): WeGridFormatRule => ({ ...cond(operator, value), field: 'name' });
    expect(boldRows(rule('contains', 'OR'))).toEqual(['Bora']);
    expect(boldRows(rule('startsWith', 'a'))).toEqual(['Ada', 'ada']);
    expect(boldRows(rule('duplicate'))).toEqual(['Ada', 'ada']);
    expect(boldRows(rule('unique'))).toEqual(['Bora', 'Cem']);
  });

  it('evaluates formula rules through the supplied function', () => {
    const map = resolve([{ ...cond('formula', '=x'), field: 'name' }], (_s, r) => (r.amount ?? 0) > 40);
    expect(map.has(rows[0])).toBeFalse();
    expect(map.get(rows[1])?.['name']['font-weight']).toBe('600');
  });

  it('styles the whole row for applyTo row', () => {
    const map = resolve([{ ...cond('gt', 80), applyTo: 'row', style: { fill: 'red' } }]);
    expect(Object.keys(map.get(rows[2]) ?? {})).toEqual(['name', 'amount']);
  });

  it('lets the first rule win for a property both set', () => {
    const map = resolve([
      { ...cond('gt', 0), id: 'a', style: { color: 'red' } },
      { ...cond('gt', 0), id: 'b', style: { color: 'blue', italic: true } }
    ]);
    expect(map.get(rows[0])?.['amount']).toEqual(jasmine.objectContaining({ color: 'var(--we-grid-format-red-fg, #c41e16)', 'font-style': 'italic' }));
  });

  it('shades a colour scale from the lowest to the highest value', () => {
    const map = resolve([{ id: 's', field: 'amount', type: 'colorScale', colors: ['red', 'green'] }]);
    expect(map.get(rows[0])?.['amount']['background']).toContain('var(--we-grid-format-green-fg, #1e7a35) 0%');
    expect(map.get(rows[2])?.['amount']['background']).toContain('var(--we-grid-format-green-fg, #1e7a35) 100%');
    expect(map.has(rows[3])).toBeFalse();
  });

  it('sizes a data bar by the value share of the range', () => {
    const map = resolve([{ id: 'd', field: 'amount', type: 'dataBar', color: 'blue' }]);
    expect(map.get(rows[1])?.['amount']['background']).toContain('55.6%');
  });

  it('shows an icon by the value’s third of the range, reversible', () => {
    const map = resolve([{ id: 'i', field: 'amount', type: 'iconSet', icons: 'arrows' }]);
    expect(map.get(rows[2])?.['amount']['--we-grid-cell-icon-color']).toContain('green');
    expect(map.get(rows[1])?.['amount']['--we-grid-cell-icon-color']).toContain('yellow');
    expect(map.get(rows[0])?.['amount']['--we-grid-cell-icon-color']).toContain('red');
    expect(map.get(rows[0])?.['amount']['--we-grid-cell-icon']).toMatch(/^url\("data:image\/svg\+xml,/);
    const reversed = resolve([{ id: 'i', field: 'amount', type: 'iconSet', icons: 'dots', reverse: true }]);
    expect(reversed.get(rows[0])?.['amount']['--we-grid-cell-icon-color']).toContain('green');
    expect(weGridSanitizeFormatRules([{ id: 'x', field: 'a', type: 'iconSet', icons: 'evil', reverse: 'yes' }])).toEqual([
      { id: 'x', field: 'a', type: 'iconSet', icons: 'arrows' }
    ]);
  });

  it('ignores rules on columns that are not shown', () => {
    expect(weGridResolveFormats(rows, [cond('gt', 0)], ['name'], read).size).toBe(0);
  });
});

describe('weGridSanitizeFormatRules', () => {
  it('keeps well-formed rules and drops the rest', () => {
    const rules = weGridSanitizeFormatRules([
      { id: 'a', field: 'x', type: 'condition', operator: 'gt', value: 5, style: { bold: true, color: 'url(evil)' } },
      { id: 'b', field: 'x', type: 'condition', operator: 'drop table', style: { bold: true } },
      { id: 'c', field: 'x', type: 'colorScale', colors: ['red'] },
      { id: 'd', field: 'x', type: 'dataBar', color: 'blue', extra: 1 },
      'junk'
    ]);
    expect(rules).toEqual([
      { id: 'a', field: 'x', type: 'condition', operator: 'gt', style: { bold: true }, value: 5 },
      { id: 'd', field: 'x', type: 'dataBar', color: 'blue' }
    ]);
    expect(weGridSanitizeFormatRules({})).toEqual([]);
  });
});
