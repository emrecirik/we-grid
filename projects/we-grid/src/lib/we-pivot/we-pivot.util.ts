import { WeGridColumnDef, WeGridColumnType, WeGridSummaryFunction, weGridValueKind } from '../models/we-grid-column.model';
import { WeGridGroupAggregate, WeGridGroupNode } from '../models/we-grid-data-source.model';

/** How a value field is aggregated */
export type WePivotAggregate = Exclude<WeGridSummaryFunction, 'none'>;

/** A value field of a pivot — `{ field: 'total', aggregate: 'sum' }` is "Sum of Total" */
export interface WePivotValue {
  field: string;
  aggregate: WePivotAggregate;
}

/** What the pivot groups by and what it adds up */
export interface WePivotConfig {
  /** Row fields, outermost first */
  rows: string[];
  /** Column fields — their value combinations become columns */
  columns: string[];
  values: WePivotValue[];
}

/** The pivot as grid input: columns and rows ready for `<we-grid>`, grouped by every row field but the last */
export interface WePivotResult {
  columns: WeGridColumnDef<Record<string, unknown>>[];
  rows: Record<string, unknown>[];
  /** Fields of the outer row levels — bind to the grid's `groupBy` for subtotals */
  groupBy: string[];
  /** More column combinations existed than `maxColumns`; the rest were left out */
  truncated: boolean;
  /** Per result row (`pivot:id`): the raw value of every row field, keyed by field — blanks are null */
  rowValues?: Record<string, unknown>[];
  /** Per value/total column (`c:…`, `t:…`): the raw column field values and the value field it aggregates */
  cellSources?: Record<string, { columnValues: Record<string, unknown>; valueField: string }>;
}

/** `<we-pivot>`'s `cellClick` — raw values keyed by the original field names */
export interface WePivotCellClickEvent {
  rowValues: Record<string, unknown>;
  columnValues: Record<string, unknown>;
  /** The value field the clicked cell aggregates — `''` for a row header cell */
  valueField: string;
  value: unknown;
}

/** Labels the pivot needs — taken from the grid locale by the component */
export interface WePivotLabels {
  aggregate: Record<WePivotAggregate, string>;
  total: string;
  empty: string;
}

const KEY_SEP = '\u001f';

function blank(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

/** A value as the key and label of a pivot group */
function keyOf(v: unknown): string {
  if (blank(v)) return '';
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    // The local calendar day (and time, when there is one) — sorts in order and reads as a label
    const p = (n: number) => String(n).padStart(2, '0');
    const day = `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
    return v.getHours() || v.getMinutes() ? `${day} ${p(v.getHours())}:${p(v.getMinutes())}` : day;
  }
  return String(v);
}

interface Acc {
  sum: number;
  count: number;
  min: number;
  max: number;
  numbers: number;
}

function newAcc(): Acc {
  return { sum: 0, count: 0, min: Infinity, max: -Infinity, numbers: 0 };
}

function add(acc: Acc, v: unknown): void {
  if (blank(v)) return;
  acc.count++;
  const n = typeof v === 'number' ? v : Number.NaN;
  if (Number.isFinite(n)) {
    acc.numbers++;
    acc.sum += n;
    if (n < acc.min) acc.min = n;
    if (n > acc.max) acc.max = n;
  }
}

function result(acc: Acc | undefined, fn: WePivotAggregate): number | null {
  if (!acc) return null;
  switch (fn) {
    case 'count':
      return acc.count;
    case 'sum':
      return acc.numbers ? Math.round(acc.sum * 1e10) / 1e10 : null;
    case 'avg':
      return acc.numbers ? Math.round((acc.sum / acc.numbers) * 1e10) / 1e10 : null;
    case 'min':
      return acc.numbers ? acc.min : null;
    case 'max':
      return acc.numbers ? acc.max : null;
  }
}

/**
 * Builds a pivot table: one row per combination of the row fields, one column per combination of
 * the column fields and value field (plus a total per value field when there are column fields).
 * Rows and columns are sorted by their labels in the locale's order, blanks last. The grid shows
 * subtotals for the outer row levels by grouping on `groupBy`, and the grand total in its summary
 * row — both computed from these cells, so sums, counts, minimums and maximums are exact; averages
 * there are averages of the cells.
 */
export function wePivot(
  data: readonly Record<string, unknown>[],
  config: WePivotConfig,
  fields: readonly WeGridColumnDef<unknown>[],
  labels: WePivotLabels,
  read: (row: Record<string, unknown>, field: string) => unknown = (row, field) => row[field],
  intlLocale = 'en-US',
  maxColumns = 200
): WePivotResult {
  const values = pivotValues(config, fields);

  // Every row combination and column combination, with an accumulator per cell
  // First raw value seen per field and key — labels go through the field's formatter, clicks hand it back
  const raws = new Map<string, unknown>();
  const remember = (fields: string[], keys: string[], item: Record<string, unknown>) =>
    fields.forEach((f, i) => {
      const k = `${f}${KEY_SEP}${keys[i]}`;
      if (!raws.has(k)) raws.set(k, read(item, f));
    });
  const rowKeys = new Map<string, string[]>();
  const colKeys = new Map<string, string[]>();
  const cells = new Map<string, Acc[]>();
  const rowTotals = new Map<string, Acc[]>();
  for (const item of data) {
    const rk = config.rows.map((f) => keyOf(read(item, f)));
    const ck = config.columns.map((f) => keyOf(read(item, f)));
    const rKey = rk.join(KEY_SEP);
    const cKey = ck.join(KEY_SEP);
    if (!rowKeys.has(rKey)) {
      rowKeys.set(rKey, rk);
      remember(config.rows, rk, item);
    }
    if (!colKeys.has(cKey)) {
      colKeys.set(cKey, ck);
      remember(config.columns, ck, item);
    }
    const cellKey = `${rKey}${KEY_SEP}${KEY_SEP}${cKey}`;
    let accs = cells.get(cellKey);
    if (!accs) cells.set(cellKey, (accs = values.map(newAcc)));
    let totals = rowTotals.get(rKey);
    if (!totals) rowTotals.set(rKey, (totals = values.map(newAcc)));
    values.forEach((v, i) => {
      const raw = read(item, v.field);
      add(accs![i], raw);
      add(totals![i], raw);
    });
  }

  return buildPivot(
    {
      rowKeys,
      colKeys,
      raw: (field, key) => raws.get(`${field}${KEY_SEP}${key}`),
      cell: (rKey, cKey, i) => result(cells.get(`${rKey}${KEY_SEP}${KEY_SEP}${cKey}`)?.[i], values[i].aggregate),
      total: (rKey, i) => result(rowTotals.get(rKey)?.[i], values[i].aggregate)
    },
    config,
    values,
    fields,
    labels,
    intlLocale,
    maxColumns
  );
}

/** The value fields — "Count of" the first row field when the configuration has none */
function pivotValues(config: WePivotConfig, fields: readonly WeGridColumnDef<unknown>[]): WePivotValue[] {
  return config.values.length ? config.values : [{ field: config.rows[0] ?? fields[0]?.field ?? '', aggregate: 'count' }];
}

/**
 * What to ask a data source's `groups()` for, to build a pivot from it with `wePivotFromGroups`:
 * grouped by the row fields then the column fields, each value field with its aggregate and a count.
 */
export function wePivotGroupRequest(config: WePivotConfig, fields: readonly WeGridColumnDef<unknown>[]): { groupBy: string[]; aggregates: WeGridGroupAggregate[] } {
  const values = pivotValues(config, fields);
  return {
    groupBy: [...config.rows, ...config.columns],
    aggregates: values.flatMap((v, i) => [
      // The pivot's rule: count counts non-blank cells, the rest take the cells that are numbers
      { field: v.field, fn: v.aggregate, key: `v${i}`, ...(v.aggregate === 'count' ? {} : { numbersOnly: true }) },
      // How many numbers each figure covers — what merging two groups into one pivot cell weighs an average by
      { field: v.field, fn: 'count' as const, key: `n${i}`, numbersOnly: true }
    ])
  };
}

/**
 * The pivot of a data source: the same result `wePivot` builds from rows, built from the groups
 * `groups(wePivotGroupRequest(config))` returned — so a pivot over fifty million rows in a
 * `WeGridColumnStore` costs one aggregation pass. Groups whose values read as one pivot key (two
 * times of one day) are merged into one cell.
 */
export function wePivotFromGroups(
  groups: readonly WeGridGroupNode[],
  config: WePivotConfig,
  fields: readonly WeGridColumnDef<unknown>[],
  labels: WePivotLabels,
  intlLocale = 'en-US',
  maxColumns = 200
): WePivotResult {
  const values = pivotValues(config, fields);
  const rowDepth = config.rows.length;
  const allDepth = rowDepth + config.columns.length;
  const raws = new Map<string, unknown>();
  const rowKeys = new Map<string, string[]>();
  const colKeys = new Map<string, string[]>();
  const cells = new Map<string, Figure[]>();
  const totals = new Map<string, Figure[]>();
  const figures = (node: WeGridGroupNode | null): Figure[] =>
    values.map((v, i) => ({ fn: v.aggregate, value: node ? (node.aggregates[`v${i}`] ?? null) : null, count: node ? (node.aggregates[`n${i}`] ?? 0) : 0 }));
  const into = (map: Map<string, Figure[]>, key: string, add: Figure[]) => {
    const have = map.get(key);
    map.set(key, have ? have.map((f, i) => mergeFigure(f, add[i])) : add);
  };
  const walk = (nodes: readonly WeGridGroupNode[], path: WeGridGroupNode[]): void => {
    for (const node of nodes) {
      const here = [...path, node];
      const key = keyOf(node.value);
      if (!raws.has(`${node.field}${KEY_SEP}${key}`)) raws.set(`${node.field}${KEY_SEP}${key}`, node.value);
      if (rowDepth > 0 && here.length === rowDepth) {
        const rk = here.map((n) => keyOf(n.value));
        rowKeys.set(rk.join(KEY_SEP), rk);
        into(totals, rk.join(KEY_SEP), figures(node));
      }
      if (here.length === allDepth) {
        const rk = here.slice(0, rowDepth).map((n) => keyOf(n.value));
        const ck = here.slice(rowDepth).map((n) => keyOf(n.value));
        const rKey = rk.join(KEY_SEP);
        const cKey = ck.join(KEY_SEP);
        rowKeys.set(rKey, rk);
        colKeys.set(cKey, ck);
        into(cells, `${rKey}${KEY_SEP}${KEY_SEP}${cKey}`, figures(node));
        // No row fields: one row, whose totals add up every column combination
        if (rowDepth === 0) into(totals, '', figures(node));
      } else if (node.children) walk(node.children, here);
    }
  };
  if (allDepth > 0) walk(groups, []);
  return buildPivot(
    {
      rowKeys,
      colKeys,
      raw: (field, key) => raws.get(`${field}${KEY_SEP}${key}`),
      cell: (rKey, cKey, i) => figureValue(cells.get(`${rKey}${KEY_SEP}${KEY_SEP}${cKey}`)?.[i]),
      total: (rKey, i) => figureValue(totals.get(rKey)?.[i])
    },
    config,
    values,
    fields,
    labels,
    intlLocale,
    maxColumns
  );
}

/** One aggregate figure of a group, with how many cells it covers */
interface Figure {
  fn: WePivotAggregate;
  value: number | null;
  count: number;
}

/** Two groups' figures as one — an average weighted by the cells each covers */
function mergeFigure(a: Figure, b: Figure): Figure {
  if (a.value === null) return { ...b, count: a.count + b.count };
  if (b.value === null) return { ...a, count: a.count + b.count };
  const count = a.count + b.count;
  switch (a.fn) {
    case 'min':
      return { fn: a.fn, value: Math.min(a.value, b.value), count };
    case 'max':
      return { fn: a.fn, value: Math.max(a.value, b.value), count };
    case 'avg':
      return { fn: a.fn, value: count ? (a.value * a.count + b.value * b.count) / count : null, count };
    default:
      return { fn: a.fn, value: a.value + b.value, count };
  }
}

function figureValue(f: Figure | undefined): number | null {
  if (!f || f.value === null) return f?.fn === 'count' ? 0 : null;
  return f.fn === 'count' ? f.value : Math.round(f.value * 1e10) / 1e10;
}

/** What the result is built from — the row and column combinations and how to read a cell */
interface PivotCells {
  /** Row combination key → the key of each row field */
  rowKeys: Map<string, string[]>;
  colKeys: Map<string, string[]>;
  /** The first raw value seen for a field's key — labels go through the formatter, clicks hand it back */
  raw(field: string, key: string): unknown;
  /** A value cell — row combination, column combination, value index */
  cell(rKey: string, cKey: string, i: number): number | null;
  /** A row's total for a value, over every column combination */
  total(rKey: string, i: number): number | null;
}

/** The grid columns and rows of a pivot, from its cells — the same for rows and for a data source's groups */
function buildPivot(
  input: PivotCells,
  config: WePivotConfig,
  values: WePivotValue[],
  fields: readonly WeGridColumnDef<unknown>[],
  labels: WePivotLabels,
  intlLocale: string,
  maxColumns: number
): WePivotResult {
  const { rowKeys, colKeys } = input;
  const def = (field: string) => fields.find((f) => f.field === field);
  const header = (field: string) => def(field)?.header ?? field;
  // Two blanks are equal — or the fields after a blank one would never be compared
  const compare = (a: string, b: string) => (a === b ? 0 : a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, intlLocale, { numeric: true }));
  const rawOf = (field: string, key: string): unknown => (key === '' ? null : input.raw(field, key));
  const label = (field: string, key: string): string => {
    if (key === '') return labels.empty;
    const fmt = def(field)?.formatter;
    return fmt ? fmt(rawOf(field, key), null) : key;
  };

  const sortedCols = [...colKeys.entries()].sort((a, b) => {
    for (let i = 0; i < a[1].length; i++) {
      const c = compare(a[1][i], b[1][i]);
      if (c) return c;
    }
    return 0;
  });
  const truncated = sortedCols.length * values.length > maxColumns;
  const shownCols = truncated ? sortedCols.slice(0, Math.max(1, Math.floor(maxColumns / values.length))) : sortedCols;

  const valueType = (v: WePivotValue): WeGridColumnType => {
    if (v.aggregate === 'count') return 'integer';
    const t = def(v.field)?.type ?? 'number';
    return weGridValueKind(t) === 'number' ? t : 'number';
  };
  const valueLabel = (v: WePivotValue) => `${labels.aggregate[v.aggregate]} · ${header(v.field)}`;
  const summary = (v: WePivotValue): WeGridSummaryFunction => (v.aggregate === 'avg' ? 'avg' : v.aggregate === 'count' ? 'sum' : v.aggregate);

  const columns: WeGridColumnDef<Record<string, unknown>>[] = config.rows.map((f) => ({
    field: `r:${f}`,
    header: header(f),
    type: 'text',
    pinned: 'left',
    // Cells hold the group key (so sorting and grouping stay on it); only the text goes through the formatter
    ...(def(f)?.formatter ? { formatter: (v: unknown) => (v === labels.empty ? labels.empty : label(f, String(v ?? ''))) } : {})
  }));
  const cellSources: Record<string, { columnValues: Record<string, unknown>; valueField: string }> = {};
  const hasColumnFields = config.columns.length > 0;
  for (const [cKey, parts] of shownCols) {
    values.forEach((v, i) => {
      const colLabel = parts.map((p, j) => label(config.columns[j], p)).join(' / ');
      const field = `c:${cKey}${KEY_SEP}${i}`;
      cellSources[field] = { columnValues: Object.fromEntries(config.columns.map((f, j) => [f, rawOf(f, parts[j])])), valueField: v.field };
      columns.push({
        field,
        header: hasColumnFields ? (values.length > 1 ? `${colLabel} · ${valueLabel(v)}` : colLabel) : valueLabel(v),
        type: valueType(v),
        format: def(v.field)?.format,
        minorUnits: v.aggregate !== 'count' ? def(v.field)?.minorUnits : undefined,
        align: 'end',
        summary: summary(v),
        groupSummary: summary(v)
      });
    });
  }
  if (hasColumnFields) {
    values.forEach((v, i) => {
      cellSources[`t:${i}`] = { columnValues: {}, valueField: v.field };
      columns.push({
        field: `t:${i}`,
        header: values.length > 1 ? `${labels.total} · ${valueLabel(v)}` : labels.total,
        type: valueType(v),
        format: def(v.field)?.format,
        minorUnits: v.aggregate !== 'count' ? def(v.field)?.minorUnits : undefined,
        align: 'end',
        summary: summary(v),
        groupSummary: summary(v),
        cellStyle: { bold: true }
      });
    });
  }

  const sortedRows = [...rowKeys.entries()].sort((a, b) => {
    for (let i = 0; i < a[1].length; i++) {
      const c = compare(a[1][i], b[1][i]);
      if (c) return c;
    }
    return 0;
  });
  const rows = sortedRows.map(([rKey, parts], index) => {
    const row: Record<string, unknown> = { 'pivot:id': index };
    config.rows.forEach((f, i) => (row[`r:${f}`] = parts[i] || labels.empty));
    for (const [cKey] of shownCols) {
      values.forEach((_, i) => (row[`c:${cKey}${KEY_SEP}${i}`] = input.cell(rKey, cKey, i)));
    }
    if (hasColumnFields) {
      values.forEach((_, i) => (row[`t:${i}`] = input.total(rKey, i)));
    }
    return row;
  });

  const rowValues = sortedRows.map(([, parts]) => Object.fromEntries(config.rows.map((f, i) => [f, rawOf(f, parts[i])])));
  return { columns, rows, groupBy: config.rows.slice(0, -1).map((f) => `r:${f}`), truncated, rowValues, cellSources };
}
