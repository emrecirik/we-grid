import { WeGridColumnDef, WeGridColumnType, WeGridSummaryFunction, weGridValueKind } from '../models/we-grid-column.model';

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
  const def = (field: string) => fields.find((f) => f.field === field);
  const header = (field: string) => def(field)?.header ?? field;
  const values = config.values.length ? config.values : [{ field: config.rows[0] ?? fields[0]?.field ?? '', aggregate: 'count' as const }];

  const compare = (a: string, b: string) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, intlLocale, { numeric: true }));

  // Every row combination and column combination, with an accumulator per cell
  const rowKeys = new Map<string, string[]>();
  const colKeys = new Map<string, string[]>();
  const cells = new Map<string, Acc[]>();
  const rowTotals = new Map<string, Acc[]>();
  for (const item of data) {
    const rk = config.rows.map((f) => keyOf(read(item, f)));
    const ck = config.columns.map((f) => keyOf(read(item, f)));
    const rKey = rk.join(KEY_SEP);
    const cKey = ck.join(KEY_SEP);
    if (!rowKeys.has(rKey)) rowKeys.set(rKey, rk);
    if (!colKeys.has(cKey)) colKeys.set(cKey, ck);
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
    pinned: 'left'
  }));
  const hasColumnFields = config.columns.length > 0;
  for (const [cKey, parts] of shownCols) {
    values.forEach((v, i) => {
      const label = parts.map((p) => p || labels.empty).join(' / ');
      columns.push({
        field: `c:${cKey}${KEY_SEP}${i}`,
        header: hasColumnFields ? (values.length > 1 ? `${label} · ${valueLabel(v)}` : label) : valueLabel(v),
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
      const accs = cells.get(`${rKey}${KEY_SEP}${KEY_SEP}${cKey}`);
      values.forEach((v, i) => (row[`c:${cKey}${KEY_SEP}${i}`] = result(accs?.[i], v.aggregate)));
    }
    if (hasColumnFields) {
      const totals = rowTotals.get(rKey);
      values.forEach((v, i) => (row[`t:${i}`] = result(totals?.[i], v.aggregate)));
    }
    return row;
  });

  return { columns, rows, groupBy: config.rows.slice(0, -1).map((f) => `r:${f}`), truncated };
}
