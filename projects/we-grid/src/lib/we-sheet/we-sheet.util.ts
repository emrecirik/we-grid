import { WE_GRID_FORMAT_COLORS } from '../models/we-grid-format.model';
import { WeGridFormulaError, weGridColumnIndex, weGridColumnLetter } from '../services/we-grid-formula.util';
import { weGridSanitizeCellStyle } from '../services/we-grid-format.util';
import { WeSheetCell, WeSheetData, WeSheetNumberFormat } from './we-sheet.model';

/** Limits applied to anything loaded from a store — keep a hostile record from freezing the page */
export const WE_SHEET_MAX_ROWS = 5000;
export const WE_SHEET_MAX_COLS = 200;
const MAX_CELLS = 200_000;
const MAX_TEXT = 32_767;
const FORMATS = new Set<WeSheetNumberFormat>(['general', 'number', 'integer', 'currency', 'percent', 'date', 'text']);
const CHART_TYPES = new Set(['column', 'bar', 'line', 'area', 'pie', 'donut']);

/** A rectangle of cells, 0-based and inclusive, always with c1 <= c2 and r1 <= r2 */
export interface WeSheetRange {
  c1: number;
  r1: number;
  c2: number;
  r2: number;
}

/** `(1, 2)` → `'B3'` */
export function weSheetAddress(col: number, row: number): string {
  return `${weGridColumnLetter(col)}${row + 1}`;
}

/** `'B3'` → `{ col: 1, row: 2 }`, null when it isn't an address */
export function weSheetParseAddress(address: string): { col: number; row: number } | null {
  const m = /^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(address);
  return m ? { col: weGridColumnIndex(m[1]), row: Number(m[2]) - 1 } : null;
}

/** Orders the corners so c1 <= c2 and r1 <= r2 */
export function weSheetNormalize(a: { col: number; row: number }, b: { col: number; row: number }): WeSheetRange {
  return { c1: Math.min(a.col, b.col), r1: Math.min(a.row, b.row), c2: Math.max(a.col, b.col), r2: Math.max(a.row, b.row) };
}

/** `'A1'` for one cell, `'A1:C4'` for a block */
export function weSheetRangeLabel(r: WeSheetRange): string {
  const start = weSheetAddress(r.c1, r.r1);
  return r.c1 === r.c2 && r.r1 === r.r2 ? start : `${start}:${weSheetAddress(r.c2, r.r2)}`;
}

export function weSheetEmpty(rows = 50, cols = 12): WeSheetData {
  return { version: 1, rows, cols, cells: {} };
}

/**
 * Turns what the user typed into a cell value, the way Excel does: `=…` stays a formula, numbers in
 * the user's locale (`1.234,5` with a comma decimal separator) become numbers, `15%` becomes 0.15
 * with a percent format, TRUE/FALSE become booleans, `'123` keeps 123 as text. An empty input
 * clears the value.
 */
export function weSheetParseInput(text: string, decimalSeparator: '.' | ','): { value: WeSheetCell['v']; format?: WeSheetNumberFormat } {
  if (text === '') return { value: null };
  if (text.startsWith('=')) return { value: text };
  if (text.startsWith("'")) return { value: text.slice(1), format: 'text' };
  const trimmed = text.trim();
  const upper = trimmed.toUpperCase();
  if (upper === 'TRUE' || upper === 'DOĞRU') return { value: true };
  if (upper === 'FALSE' || upper === 'YANLIŞ') return { value: false };
  const percent = trimmed.endsWith('%');
  const n = weSheetParseNumber(percent ? trimmed.slice(0, -1) : trimmed, decimalSeparator);
  if (n !== null) return percent ? { value: n / 100, format: 'percent' } : { value: n };
  return { value: text.slice(0, MAX_TEXT) };
}

/** A number written with the locale's separators (the other one as an optional thousands separator), or null */
export function weSheetParseNumber(text: string, decimalSeparator: '.' | ','): number | null {
  const thousands = decimalSeparator === ',' ? '.' : ',';
  const pattern = new RegExp(
    `^[-+]?(\\d{1,3}(\\${thousands}\\d{3})+|\\d+)(\\${decimalSeparator}\\d+)?$|^[-+]?\\${decimalSeparator}\\d+$`
  );
  const s = text.trim();
  if (!pattern.test(s)) {
    // A dot always reads as a decimal point too — people paste "12.5" whatever their locale
    return decimalSeparator === ',' && /^[-+]?\d+\.\d+$/.test(s) && !/^[-+]?\d{1,3}\.\d{3}$/.test(s) ? Number(s) : null;
  }
  const normalized = s.split(thousands).join('').replace(decimalSeparator, '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * Moves a formula's relative references by `dCol`/`dRow`, as Excel does when a formula is copied or
 * filled: `=A1+$B$2` filled one row down becomes `=A2+$B$2`. Text in quotes and `[Field]`
 * references are left alone; a reference pushed off the sheet becomes `#REF!`.
 */
export function weSheetShiftFormula(formula: string, dCol: number, dRow: number): string {
  if (dCol === 0 && dRow === 0) return formula;
  let out = '';
  let i = 0;
  while (i < formula.length) {
    const ch = formula[i];
    if (ch === '"') {
      const end = formula.indexOf('"', i + 1);
      const stop = end === -1 ? formula.length : end + 1;
      out += formula.slice(i, stop);
      i = stop;
      continue;
    }
    if (ch === '[' || ch === "'") {
      const end = formula.indexOf(ch === '[' ? ']' : "'", i + 1);
      const stop = end === -1 ? formula.length : end + 1;
      out += formula.slice(i, stop);
      i = stop;
      continue;
    }
    const m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)/.exec(formula.slice(i));
    const prev = i > 0 ? formula[i - 1] : '';
    // `AB1!C2`: a word before '!' is a sheet name, not a reference
    if (m && !/[A-Za-z0-9_.]/.test(prev) && !/^[A-Za-z0-9_(!]/.test(formula.slice(i + m[0].length))) {
      const col = m[1] ? weGridColumnIndex(m[2].toUpperCase()) : weGridColumnIndex(m[2].toUpperCase()) + dCol;
      const row = m[3] ? Number(m[4]) - 1 : Number(m[4]) - 1 + dRow;
      out += col < 0 || row < 0 ? '#REF!' : `${m[1]}${weGridColumnLetter(col)}${m[3]}${row + 1}`;
      i += m[0].length;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Sum, average, count, min and max of the numbers among `values` — the status bar of a selection */
export interface WeSheetStats {
  /** Non-empty cells */
  count: number;
  /** Numeric cells */
  numbers: number;
  sum: number;
  average: number | null;
  min: number | null;
  max: number | null;
}

export function weSheetStats(values: readonly unknown[]): WeSheetStats {
  let count = 0;
  let numbers = 0;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    count++;
    if (typeof v === 'number' && Number.isFinite(v)) {
      numbers++;
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return {
    count,
    numbers,
    sum: Math.round(sum * 1e10) / 1e10,
    average: numbers ? Math.round((sum / numbers) * 1e10) / 1e10 : null,
    min: numbers ? min : null,
    max: numbers ? max : null
  };
}

/**
 * Sorts the rows of `range` by the computed value in column `byCol`: numbers before text, text in
 * the locale's order, blanks last whatever the direction. Whole cells move — content, style and
 * format. Formulas move as written.
 */
export function weSheetSortRange(
  data: WeSheetData,
  range: WeSheetRange,
  byCol: number,
  direction: 'asc' | 'desc',
  valueOf: (col: number, row: number) => unknown,
  intlLocale: string
): WeSheetData {
  const rows: number[] = [];
  for (let r = range.r1; r <= range.r2; r++) rows.push(r);
  const rank = (v: unknown): number => (v === null || v === undefined || v === '' ? 2 : typeof v === 'number' ? 0 : 1);
  const sorted = [...rows].sort((a, b) => {
    const va = valueOf(byCol, a);
    const vb = valueOf(byCol, b);
    const ra = rank(va);
    const rb = rank(vb);
    if (ra !== rb || ra === 2) return ra - rb;
    const cmp = ra === 0 ? (va as number) - (vb as number) : String(va).localeCompare(String(vb), intlLocale);
    return direction === 'asc' ? cmp : -cmp;
  });
  const cells = { ...data.cells };
  for (let i = 0; i < rows.length; i++) {
    for (let c = range.c1; c <= range.c2; c++) {
      const from = data.cells[weSheetAddress(c, sorted[i])];
      const key = weSheetAddress(c, rows[i]);
      if (from) cells[key] = from;
      else delete cells[key];
    }
  }
  return { ...data, cells };
}

/** Formats a computed value for display — errors show their code */
export function weSheetFormatValue(value: unknown, format: WeSheetNumberFormat | undefined, intlLocale: string, currency: string, decimals?: number): string {
  if (value === null || value === undefined) return '';
  if (value instanceof WeGridFormulaError) return value.code;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : new Intl.DateTimeFormat(intlLocale, { dateStyle: 'medium' }).format(value);
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value !== 'number') return String(value);
  if (!Number.isFinite(value)) return '#NUM!';
  const fixed = decimals !== undefined && decimals >= 0 && decimals <= 10 ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals } : null;
  switch (format ?? 'general') {
    case 'number':
      return new Intl.NumberFormat(intlLocale, fixed ?? { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    case 'integer':
      return new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 0 }).format(value);
    case 'currency':
      return new Intl.NumberFormat(intlLocale, { style: 'currency', currency, ...(fixed ?? {}) }).format(value);
    case 'percent':
      return new Intl.NumberFormat(intlLocale, { style: 'percent', ...(fixed ?? { maximumFractionDigits: 2 }) }).format(value);
    case 'date': {
      // Excel serial date — day 1 is 1900-01-01 (with Excel's 1900 leap-year quirk)
      const ms = Date.UTC(1899, 11, 30) + Math.round(value) * 86400000;
      return new Intl.DateTimeFormat(intlLocale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(ms));
    }
    case 'text':
      return String(value);
    default:
      return new Intl.NumberFormat(intlLocale, fixed ? { ...fixed, useGrouping: false } : { maximumFractionDigits: 10, useGrouping: false }).format(value);
  }
}

/** Rebuilds sheet data from untrusted input — a stored record or a file — or null when it isn't one */
export function weSheetSanitize(input: unknown): WeSheetData | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const o = input as Record<string, unknown>;
  const rows = clampInt(o['rows'], 1, WE_SHEET_MAX_ROWS);
  const cols = clampInt(o['cols'], 1, WE_SHEET_MAX_COLS);
  if (rows === null || cols === null || typeof o['cells'] !== 'object' || o['cells'] === null) return null;
  const cells: Record<string, WeSheetCell> = {};
  let count = 0;
  for (const [key, raw] of Object.entries(o['cells'] as Record<string, unknown>)) {
    if (++count > MAX_CELLS) break;
    const at = weSheetParseAddress(key);
    if (!at || at.col >= cols || at.row >= rows || typeof raw !== 'object' || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const cell: WeSheetCell = {};
    const v = r['v'];
    if (typeof v === 'string') cell.v = v.slice(0, MAX_TEXT);
    else if ((typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean') cell.v = v;
    const s = weGridSanitizeCellStyle(r['s']);
    if (s) cell.s = s;
    if (r['a'] === 'start' || r['a'] === 'center' || r['a'] === 'end') cell.a = r['a'];
    if (FORMATS.has(r['f'] as WeSheetNumberFormat)) cell.f = r['f'] as WeSheetNumberFormat;
    if (typeof r['d'] === 'number' && Number.isInteger(r['d']) && r['d'] >= 0 && r['d'] <= 10) cell.d = r['d'];
    if (Object.keys(cell).length) cells[key] = cell;
  }
  const data: WeSheetData = { version: 1, rows, cols, cells };
  if (typeof o['widths'] === 'object' && o['widths'] !== null) {
    const widths: Record<string, number> = {};
    for (const [k, w] of Object.entries(o['widths'] as Record<string, unknown>)) {
      if (/^[A-Z]{1,3}$/.test(k) && typeof w === 'number' && w >= 30 && w <= 1000) widths[k] = Math.round(w);
    }
    data.widths = widths;
  }
  if (o['headerRow'] === true) data.headerRow = true;
  if (o['striped'] === true) data.striped = true;
  if (o['freezeColumn'] === true) data.freezeColumn = true;
  const chart = o['chart'];
  if (typeof chart === 'object' && chart !== null) {
    const { range, type } = chart as Record<string, unknown>;
    if (typeof range === 'string' && /^[A-Z]{1,3}[1-9]\d{0,6}:[A-Z]{1,3}[1-9]\d{0,6}$/.test(range) && typeof type === 'string' && CHART_TYPES.has(type)) {
      data.chart = { range, type: type as NonNullable<WeSheetData['chart']>['type'] };
    }
  }
  return data;
}

function clampInt(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= min ? Math.min(v, max) : null;
}

/** Palette colours a sheet toolbar offers — the grid's format palette */
export const WE_SHEET_COLORS = WE_GRID_FORMAT_COLORS;

/**
 * Rewrites a formula's references after rows or columns are inserted or deleted, as Excel does:
 * references at or after `at` move by `delta` (absolute ones too — `$` pins a reference against
 * copying, not against inserting). With a negative `delta` the cells `at … at - delta - 1` are
 * gone: a single reference to them becomes `#REF!`, a range that loses an end shrinks, a range
 * that loses everything becomes `#REF!`. Quoted text and `[Field]` references are left alone.
 */
export function weSheetMoveReferences(formula: string, axis: 'row' | 'col', at: number, delta: number): string {
  if (delta === 0) return formula;
  const deletedEnd = delta < 0 ? at - delta : at;
  interface Ref {
    abs: [string, string];
    col: number;
    row: number;
    colOnly: boolean;
  }
  const tokens: (string | Ref)[] = [];
  let i = 0;
  while (i < formula.length) {
    const ch = formula[i];
    if (ch === '"' || ch === '[' || ch === "'") {
      const close = formula.indexOf(ch === '[' ? ']' : ch, i + 1);
      const stop = close === -1 ? formula.length : close + 1;
      tokens.push(formula.slice(i, stop));
      i = stop;
      continue;
    }
    const prev = i > 0 ? formula[i - 1] : '';
    const rest = formula.slice(i);
    // A reference to another sheet (`Sales!A5`, `'Q 1'!A5:A9`) is about that sheet's rows — kept as it is
    const qualified = /^(?:'(?:[^']|'')*'|[\p{L}\p{N}_.]+)!(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3})/u.exec(rest);
    if (qualified && !/[A-Za-z0-9_.$]/.test(prev)) {
      tokens.push(qualified[0]);
      i += qualified[0].length;
      continue;
    }
    const m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)/.exec(rest);
    if (m && !/[A-Za-z0-9_.]/.test(prev) && !/^[A-Za-z0-9_(]/.test(formula.slice(i + m[0].length))) {
      tokens.push({ abs: [m[1], m[3]], col: weGridColumnIndex(m[2].toUpperCase()), row: Number(m[4]) - 1, colOnly: false });
      i += m[0].length;
      continue;
    }
    // Whole columns (A:A) — only column changes move them
    const c = /^(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})(?![A-Za-z0-9(])/.exec(rest);
    if (c && !/[A-Za-z0-9_.$]/.test(prev)) {
      tokens.push({ abs: [c[1], ''], col: weGridColumnIndex(c[2].toUpperCase()), row: -1, colOnly: true });
      tokens.push(':');
      tokens.push({ abs: [c[3], ''], col: weGridColumnIndex(c[4].toUpperCase()), row: -1, colOnly: true });
      i += c[0].length;
      continue;
    }
    tokens.push(ch);
    i++;
  }

  const pos = (r: Ref): number => (axis === 'row' ? r.row : r.col);
  const write = (r: Ref, value: number): string => {
    const col = axis === 'col' ? value : r.col;
    const row = axis === 'row' ? value : r.row;
    return r.colOnly ? `${r.abs[0]}${weGridColumnLetter(col)}` : `${r.abs[0]}${weGridColumnLetter(col)}${r.abs[1]}${row + 1}`;
  };
  const shiftOne = (p: number): number => (delta > 0 ? (p >= at ? p + delta : p) : p >= deletedEnd ? p + delta : p);

  let out = '';
  for (let t = 0; t < tokens.length; t++) {
    const tok = tokens[t];
    if (typeof tok === 'string') {
      out += tok;
      continue;
    }
    const next = tokens[t + 2];
    const end = tokens[t + 1] === ':' && typeof next === 'object' ? next : null;
    if (axis === 'row' && tok.colOnly) {
      // A:A spans every row — inserting or deleting rows doesn't touch it
      out += write(tok, tok.col) + (end ? `:${write(end, end.col)}` : '');
      if (end) t += 2;
      continue;
    }
    if (end) {
      let a = pos(tok);
      let b = pos(end);
      if (delta > 0) {
        a = shiftOne(a);
        b = shiftOne(b);
      } else {
        const hi = deletedEnd - 1;
        if (a >= at && b <= hi) {
          out += '#REF!';
          t += 2;
          continue;
        }
        a = a > hi ? a + delta : a >= at ? at : a;
        b = b > hi ? b + delta : b >= at ? at - 1 : b;
      }
      out += `${write(tok, a)}:${write(end, b)}`;
      t += 2;
      continue;
    }
    const p = pos(tok);
    out += delta < 0 && p >= at && p < deletedEnd ? '#REF!' : write(tok, shiftOne(p));
  }
  return out;
}

/**
 * Inserts `count` empty rows or columns before `at` (a negative count deletes them): cells move,
 * every formula's references follow, column widths move with their columns.
 */
export function weSheetInsert(data: WeSheetData, axis: 'row' | 'col', at: number, count: number): WeSheetData {
  if (count === 0) return data;
  const deletedEnd = count < 0 ? at - count : at;
  const shift = (v: number): number | null => {
    if (count < 0 && v >= at && v < deletedEnd) return null;
    return count > 0 ? (v >= at ? v + count : v) : v >= deletedEnd ? v + count : v;
  };
  const size = axis === 'row' ? data.rows : data.cols;
  const max = axis === 'row' ? WE_SHEET_MAX_ROWS : WE_SHEET_MAX_COLS;
  const newSize = Math.max(1, Math.min(max, size + count));
  const rows = axis === 'row' ? newSize : data.rows;
  const cols = axis === 'col' ? newSize : data.cols;
  const cells: Record<string, WeSheetCell> = {};
  for (const [key, cell] of Object.entries(data.cells)) {
    const p = weSheetParseAddress(key);
    if (!p) continue;
    const nv = shift(axis === 'row' ? p.row : p.col);
    if (nv === null) continue;
    const col = axis === 'col' ? nv : p.col;
    const row = axis === 'row' ? nv : p.row;
    // Cells pushed past the edge go with the edge
    if (row >= rows || col >= cols) continue;
    cells[weSheetAddress(col, row)] = typeof cell.v === 'string' && cell.v.startsWith('=') ? { ...cell, v: weSheetMoveReferences(cell.v, axis, at, count) } : cell;
  }
  const out: WeSheetData = { ...data, rows, cols, cells };
  if (axis === 'col' && data.widths) {
    const widths: Record<string, number> = {};
    for (const [letter, w] of Object.entries(data.widths)) {
      const nc = shift(weGridColumnIndex(letter));
      if (nc !== null && nc < cols) widths[weGridColumnLetter(nc)] = w;
    }
    out.widths = widths;
  }
  return out;
}

/**
 * Excel's AutoSum: with a block selected, a `=SUM()` of each column goes under it; with one cell
 * selected, the numbers right above it (or, failing that, to its left) are summed into it.
 * Returns the cells to write — empty when there is nothing to sum.
 */
export function weSheetAutoSum(range: WeSheetRange, isNumber: (col: number, row: number) => boolean): { col: number; row: number; formula: string }[] {
  if (range.r2 > range.r1 || range.c2 > range.c1) {
    const out: { col: number; row: number; formula: string }[] = [];
    for (let c = range.c1; c <= range.c2; c++) {
      out.push({ col: c, row: range.r2 + 1, formula: `=SUM(${weSheetAddress(c, range.r1)}:${weSheetAddress(c, range.r2)})` });
    }
    return out;
  }
  const { c1: col, r1: row } = range;
  let top = row;
  while (top > 0 && isNumber(col, top - 1)) top--;
  if (top < row) return [{ col, row, formula: `=SUM(${weSheetAddress(col, top)}:${weSheetAddress(col, row - 1)})` }];
  let left = col;
  while (left > 0 && isNumber(left - 1, row)) left--;
  if (left < col) return [{ col, row, formula: `=SUM(${weSheetAddress(left, row)}:${weSheetAddress(col - 1, row)})` }];
  return [];
}


/** How a sheet name is written in a formula: bare when it is a plain word, else in single quotes */
export function weSheetNameRef(name: string): string {
  return /^[\p{L}_][\p{L}\p{N}_.]*$/u.test(name) && !/^[A-Za-z]{1,3}\d+$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
}

/** Rewrites `Old!A1` and `'Old'!A1` to the new sheet name, as Excel does when a sheet is renamed */
export function weSheetRenameReferences(formula: string, oldName: string, newName: string): string {
  const target = oldName.toLocaleLowerCase();
  let out = '';
  let i = 0;
  while (i < formula.length) {
    const ch = formula[i];
    if (ch === '"') {
      const close = formula.indexOf('"', i + 1);
      const stop = close === -1 ? formula.length : close + 1;
      out += formula.slice(i, stop);
      i = stop;
      continue;
    }
    const rest = formula.slice(i);
    const quoted = /^'((?:[^']|'')*)'!/.exec(rest);
    const bare = quoted ? null : /^([\p{L}\p{N}_.]+)!/u.exec(rest);
    const prev = i > 0 ? formula[i - 1] : '';
    const name = quoted ? quoted[1].replace(/''/g, "'") : bare && !/[\p{L}\p{N}_.]/u.test(prev) ? bare[1] : null;
    if (name !== null && name.toLocaleLowerCase() === target) {
      out += `${weSheetNameRef(newName)}!`;
      i += (quoted ?? bare)![0].length;
      continue;
    }
    if (quoted) {
      out += quoted[0];
      i += quoted[0].length;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}
