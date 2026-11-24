import { WeChartData } from '../we-chart/we-chart.util';
import { WeGridXlsxCell, WeGridXlsxChart, WeGridXlsxSheet } from './we-grid-xlsx.util';
import { weGridColumnLetter } from './we-grid-formula.util';

/** The chart types a range chart offers */
export type WeGridRangeChartType = 'column' | 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'radialBar' | 'funnel' | 'waterfall';

export const WE_GRID_RANGE_CHART_TYPES: readonly WeGridRangeChartType[] = ['column', 'bar', 'line', 'area', 'pie', 'donut', 'radialBar', 'funnel', 'waterfall'];

/** How rows that share a category become one point; `'none'` keeps one point per row */
export type WeGridRangeChartAggregate = 'none' | 'sum' | 'avg' | 'count' | 'min' | 'max';

export interface WeGridRangeChartSpec<T> {
  /** The category of a row: its label and the raw value behind it (what a click filters on); null charts rows in order */
  category: { label: (row: T) => string; raw: (row: T) => unknown } | null;
  series: { name: string; value: (row: T) => unknown }[];
  aggregate: WeGridRangeChartAggregate;
  /** Series become categories and categories series */
  switched?: boolean;
}

export interface WeGridRangeChartResult {
  data: WeChartData;
  /** The raw category value behind each category — empty when switched or charted in row order */
  raws: unknown[];
}

/** Turns rows into chart data: one category per row (or per distinct category when aggregated), one series per value column */
export function weGridRangeChartData<T>(rows: readonly T[], spec: WeGridRangeChartSpec<T>): WeGridRangeChartResult {
  const { category, series, aggregate } = spec;
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const groups: { label: string; raw: unknown; rows: T[] }[] = [];
  if (category && aggregate !== 'none') {
    const byLabel = new Map<string, { label: string; raw: unknown; rows: T[] }>();
    for (const row of rows) {
      const label = category.label(row);
      let group = byLabel.get(label);
      if (!group) {
        group = { label, raw: category.raw(row), rows: [] };
        byLabel.set(label, group);
        groups.push(group);
      }
      group.rows.push(row);
    }
  } else {
    rows.forEach((row, i) => groups.push({ label: category ? category.label(row) : String(i + 1), raw: category?.raw(row), rows: [row] }));
  }
  const reduce = (values: (number | null)[]): number | null => {
    const nums = values.filter((v): v is number => v !== null);
    if (aggregate === 'none') return values[0] ?? null;
    if (aggregate === 'count') return nums.length;
    if (nums.length === 0) return null;
    if (aggregate === 'sum') return nums.reduce((a, b) => a + b, 0);
    if (aggregate === 'avg') return nums.reduce((a, b) => a + b, 0) / nums.length;
    return aggregate === 'min' ? Math.min(...nums) : Math.max(...nums);
  };
  const data: WeChartData = {
    categories: groups.map((g) => g.label),
    series: series.map((s) => ({ name: s.name, values: groups.map((g) => reduce(g.rows.map((r) => num(s.value(r))))) }))
  };
  if (!spec.switched) return { data, raws: category ? groups.map((g) => g.raw) : [] };
  return {
    data: {
      categories: data.series.map((s) => s.name),
      series: data.categories.map((name, ci) => ({ name, values: data.series.map((s) => s.values[ci]) }))
    },
    raws: []
  };
}

/** Whether a category column repeats a label — then combining is the sensible default */
export function weGridRangeChartRepeats<T>(rows: readonly T[], label: (row: T) => string): boolean {
  const seen = new Set<string>();
  for (const row of rows) {
    const l = label(row);
    if (seen.has(l)) return true;
    seen.add(l);
  }
  return false;
}

/** Chart types Excel draws natively; the rest go into the workbook as data only */
const XLSX_TYPES: Partial<Record<WeGridRangeChartType, WeGridXlsxChart['type']>> = { column: 'column', bar: 'bar', line: 'line', area: 'area', pie: 'pie', donut: 'donut' };

/** A worksheet with the chart's data in a table and, for the types Excel has, a native Excel chart over it */
export function weGridRangeChartSheet(name: string, categoryHeader: string, data: WeChartData, type: WeGridRangeChartType): WeGridXlsxSheet {
  const cells: WeGridXlsxCell[] = [{ ref: 'A1', value: categoryHeader, bold: true }];
  data.series.forEach((s, si) => cells.push({ ref: `${weGridColumnLetter(si + 1)}1`, value: s.name, bold: true }));
  data.categories.forEach((c, ci) => {
    cells.push({ ref: `A${ci + 2}`, value: c });
    data.series.forEach((s, si) => cells.push({ ref: `${weGridColumnLetter(si + 1)}${ci + 2}`, value: s.values[ci] ?? null }));
  });
  const last = data.categories.length + 1;
  const xlsxType = XLSX_TYPES[type];
  const sheet: WeGridXlsxSheet = { name, cells, widths: { 0: 180 } };
  if (xlsxType && data.categories.length > 0 && data.series.length > 0) {
    // A pie draws one series, as on screen
    const series = (xlsxType === 'pie' || xlsxType === 'donut' ? data.series.slice(0, 1) : data.series).map((_, si) => {
      const col = weGridColumnLetter(si + 1);
      return { name: `${col}1`, values: `${col}2:${col}${last}` };
    });
    sheet.chart = { type: xlsxType, categories: `A2:A${last}`, series, at: { col: data.series.length + 2, row: 1 } };
  }
  return sheet;
}
