import { WE_GRID_FORMAT_COLORS } from '../models/we-grid-format.model';
import { WE_GRID_FORMULA_ALIASES, WeGridFormulaError, WeGridSheetEvaluator, weGridColumnIndex, weGridColumnLetter } from '../services/we-grid-formula.util';
import { WeGridXlsxCell, weGridBuildXlsxWorkbook, weGridXlsxSheetName } from '../services/we-grid-xlsx.util';
import { weGridSanitizeCellStyle, weGridSanitizeFormatRules } from '../services/we-grid-format.util';
import { WeSheetCell, WeSheetData, WeSheetFormatRule, WeSheetNumberFormat } from './we-sheet.model';

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
 * with a percent format, TRUE/FALSE become booleans, `'123` keeps 123 as text, and a date
 * (`2026-01-15`, or `15.01.2026` / `1/15/2026` in the order of `dateOrder`) becomes an Excel date
 * serial with the date format. An empty input clears the value.
 */
export function weSheetParseInput(
  text: string,
  decimalSeparator: '.' | ',',
  dateOrder: 'dmy' | 'mdy' = 'dmy'
): { value: WeSheetCell['v']; format?: WeSheetNumberFormat } {
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
  const date = weSheetParseDate(trimmed, dateOrder);
  if (date !== null) return { value: date, format: 'date' };
  return { value: text.slice(0, MAX_TEXT) };
}

/**
 * A date as an Excel serial (days since 1899-12-30), or null: `2026-01-15`, or day, month and year
 * separated by `.`, `/` or `-` in the given order (`15.01.2026`, `1/15/26`). Two-digit years are
 * 2000-2029 or 1930-1999. Days that do not exist (`31.02.2026`) are not dates.
 */
export function weSheetParseDate(text: string, order: 'dmy' | 'mdy' = 'dmy'): number | null {
  let y: number;
  let m: number;
  let d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const local = iso ? null : /^(\d{1,2})([./-])(\d{1,2})\2(\d{4}|\d{2})$/.exec(text);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (local) {
    const [a, b] = [Number(local[1]), Number(local[3])];
    [d, m] = order === 'dmy' ? [a, b] : [b, a];
    y = Number(local[4]);
    if (local[4].length === 2) y += y < 30 ? 2000 : 1900;
  } else return null;
  const ms = Date.UTC(y, m - 1, d);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return Math.round((ms - Date.UTC(1899, 11, 30)) / 86400000);
}

/** A number written with the locale's separators (the other one as an optional thousands separator), or null */
export function weSheetParseNumber(text: string, decimalSeparator: '.' | ','): number | null {
  const thousands = decimalSeparator === ',' ? '.' : ',';
  const pattern = new RegExp(
    `^[-+]?(\\d{1,3}(\\${thousands}\\d{3})+|\\d+)(\\${decimalSeparator}\\d+)?([eE][-+]?\\d+)?$|^[-+]?\\${decimalSeparator}\\d+([eE][-+]?\\d+)?$`
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
    const whole = /^(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})(?![A-Za-z0-9(])/.exec(formula.slice(i));
    if (whole && !/[A-Za-z0-9_.$]/.test(prev)) {
      const move = (abs: string, letters: string): string => {
        const col = weGridColumnIndex(letters.toUpperCase()) + (abs ? 0 : dCol);
        return col < 0 ? '#REF!' : abs + weGridColumnLetter(col);
      };
      const a = move(whole[1], whole[2]);
      const b = move(whole[3], whole[4]);
      out += a === '#REF!' || b === '#REF!' ? '#REF!' : `${a}:${b}`;
      i += whole[0].length;
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
 * format. A moved formula's relative references move with it, as in Excel.
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
      if (from) cells[key] = typeof from.v === 'string' && from.v.startsWith('=') ? { ...from, v: weSheetShiftFormula(from.v, 0, rows[i] - sorted[i]) } : from;
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
    const list = Array.isArray(r['l']) ? weSheetCleanList(r['l'].filter((x): x is string => typeof x === 'string')) : [];
    if (list.length) cell.l = list;
    if (typeof r['n'] === 'string' && r['n'].trim()) cell.n = r['n'].trim().slice(0, 1000);
    const sides = typeof r['b'] === 'string' ? weSheetBorderSides(r['b']) : '';
    if (sides) cell.b = sides;
    if (r['w'] === true) cell.w = true;
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
  const freeze = o['freeze'] as { rows?: unknown; cols?: unknown } | undefined;
  if (typeof freeze === 'object' && freeze !== null) {
    const count = (v: unknown, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? Math.min(v, max) : 0);
    const f = { rows: count(freeze.rows, Math.min(50, rows - 1)), cols: count(freeze.cols, Math.min(20, cols - 1)) };
    if (f.rows || f.cols) data.freeze = f;
  }
  if (o['autoFilter'] === true) data.autoFilter = true;
  const filters = o['filters'];
  if (data.autoFilter && typeof filters === 'object' && filters !== null) {
    const clean: Record<string, string[]> = {};
    for (const [letter, hidden] of Object.entries(filters as Record<string, unknown>)) {
      if (!/^[A-Z]{1,3}$/.test(letter) || !Array.isArray(hidden)) continue;
      const texts = hidden.filter((t): t is string => typeof t === 'string').slice(0, 1000).map((t) => t.slice(0, MAX_TEXT));
      if (texts.length) clean[letter] = texts;
    }
    if (Object.keys(clean).length) data.filters = clean;
  }
  const chart = o['chart'];
  if (typeof chart === 'object' && chart !== null) {
    const { range, type } = chart as Record<string, unknown>;
    if (typeof range === 'string' && /^[A-Z]{1,3}[1-9]\d{0,6}:[A-Z]{1,3}[1-9]\d{0,6}$/.test(range) && typeof type === 'string' && CHART_TYPES.has(type)) {
      data.chart = { range, type: type as NonNullable<WeSheetData['chart']>['type'] };
    }
  }
  const merges = weSheetSanitizeMerges(o['merges'], rows, cols);
  if (merges.length) data.merges = merges;
  const formats = weSheetSanitizeFormats(o['formats']);
  if (formats.length) data.formats = formats;
  return data;
}

/** Border sides in a fixed order, without repeats or unknown letters: `'lbt'` → `'tbl'` */
export function weSheetBorderSides(sides: string): string {
  return ['t', 'r', 'b', 'l'].filter((s) => sides.includes(s)).join('');
}

/** Merge ranges that are well formed, inside the sheet, bigger than one cell and not overlapping an earlier one — at most 1000 */
export function weSheetSanitizeMerges(input: unknown, rows = WE_SHEET_MAX_ROWS, cols = WE_SHEET_MAX_COLS): string[] {
  if (!Array.isArray(input)) return [];
  const kept: WeSheetRange[] = [];
  const out: string[] = [];
  for (const raw of input.slice(0, 1000)) {
    if (typeof raw !== 'string') continue;
    const [a, b] = raw.split(':').map((p) => weSheetParseAddress(p));
    if (!a || !b) continue;
    const r = weSheetNormalize(a, b);
    if ((r.c1 === r.c2 && r.r1 === r.r2) || r.r2 >= rows || r.c2 >= cols) continue;
    if (kept.some((k) => k.c1 <= r.c2 && r.c1 <= k.c2 && k.r1 <= r.r2 && r.r1 <= k.r2)) continue;
    kept.push(r);
    out.push(weSheetRangeLabel(r));
  }
  return out;
}

/** Well-formed conditional format rules of a sheet: a valid grid rule over a one-column range, at most 100 */
export function weSheetSanitizeFormats(input: unknown): WeSheetFormatRule[] {
  if (!Array.isArray(input)) return [];
  const out: WeSheetFormatRule[] = [];
  for (const raw of input.slice(0, 100)) {
    const range = (raw as { range?: unknown } | null)?.range;
    const m = typeof range === 'string' ? /^([A-Z]{1,3})[1-9]\d{0,6}:([A-Z]{1,3})[1-9]\d{0,6}$/.exec(range) : null;
    if (!m || m[1] !== m[2]) continue;
    const [rule] = weGridSanitizeFormatRules([{ ...(raw as object), field: m[1] }]);
    if (rule && rule.operator !== 'formula') out.push({ ...rule, range: range as string });
  }
  return out;
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
    const prev = i > 0 ? formula[i - 1] : '';
    const rest = formula.slice(i);
    // A reference to another sheet (`Sales!A5`, `'Q 1'!A5:A9`) is about that sheet's rows — kept as it is
    const qualified = /^(?:'(?:[^']|'')*'|[\p{L}\p{N}_.]+)!(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3})/u.exec(rest);
    if (qualified && !/[A-Za-z0-9_.$]/.test(prev)) {
      tokens.push(qualified[0]);
      i += qualified[0].length;
      continue;
    }
    if (ch === '"' || ch === '[' || ch === "'") {
      const close = formula.indexOf(ch === '[' ? ']' : ch, i + 1);
      const stop = close === -1 ? formula.length : close + 1;
      tokens.push(formula.slice(i, stop));
      i = stop;
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
  if (data.chart) {
    const range = weSheetMoveReferences(data.chart.range, axis, at, count);
    if (range.includes('#REF!')) delete out.chart;
    else out.chart = { ...data.chart, range };
  }
  if (data.merges) {
    const merges = data.merges.map((m) => weSheetMoveReferences(m, axis, at, count)).filter((m) => !m.includes('#REF!'));
    const clean = weSheetSanitizeMerges(merges, rows, cols);
    if (clean.length) out.merges = clean;
    else delete out.merges;
  }
  if (data.formats) {
    // A rule's range follows its cells; one whose cells are all gone goes with them
    const formats: WeSheetFormatRule[] = [];
    for (const rule of data.formats) {
      const range = weSheetMoveReferences(rule.range, axis, at, count);
      if (!range.includes('#REF!')) formats.push({ ...rule, range, field: range.replace(/\d.*$/, '') });
    }
    if (formats.length) out.formats = formats;
    else delete out.formats;
  }
  if (axis === 'col' && data.filters) {
    const filters: Record<string, string[]> = {};
    for (const [letter, hidden] of Object.entries(data.filters)) {
      const nc = shift(weGridColumnIndex(letter));
      if (nc !== null && nc < cols) filters[weGridColumnLetter(nc)] = hidden;
    }
    if (Object.keys(filters).length) out.filters = filters;
    else delete out.filters;
  }
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

/** A dropdown list's choices: trimmed, without blanks and repeats, at most 200 of up to 200 characters */
export function weSheetCleanList(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const v = item.trim().slice(0, 200);
    const key = v.toLocaleLowerCase();
    if (!v || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length === 200) break;
  }
  return out;
}

/**
 * The fill handle: extends the cells of `source` through `target` (which contains it and grows it
 * along one axis), as Excel does when the corner of a selection is dragged. Each column (or row) is
 * a series of its own: numbers continue their step (`1, 3` → `5, 7`; one number is copied), dates
 * go on by a day, text ending in a number counts on (`Item 9` → `Item 10`), formulas shift their
 * relative references, and anything else repeats. Styles and formats come with the cells.
 */
export function weSheetFill(data: WeSheetData, source: WeSheetRange, target: WeSheetRange): WeSheetData {
  const down = target.r1 < source.r1 || target.r2 > source.r2;
  const cells = { ...data.cells };
  const lines = down ? [source.c1, source.c2] : [source.r1, source.r2];
  const [from, to] = down ? [source.r1, source.r2] : [source.c1, source.c2];
  const [lo, hi] = down ? [target.r1, target.r2] : [target.c1, target.c2];
  const n = to - from + 1;
  for (let line = lines[0]; line <= lines[1]; line++) {
    const at = (i: number) => (down ? weSheetAddress(line, from + i) : weSheetAddress(from + i, line));
    const seq = Array.from({ length: n }, (_, i) => data.cells[at(i)]);
    const series = fillSeries(seq);
    for (let p = lo; p <= hi; p++) {
      if (p >= from && p <= to) continue;
      const t = p - from;
      const k = ((t % n) + n) % n;
      const base = seq[k];
      const key = down ? weSheetAddress(line, p) : weSheetAddress(p, line);
      let v: WeSheetCell['v'] = base?.v;
      if (typeof v === 'string' && v.startsWith('=')) v = weSheetShiftFormula(v, down ? 0 : t - k, down ? t - k : 0);
      else if (series) v = series(t);
      const cell: WeSheetCell = { ...(base ?? {}) };
      if (v === undefined || v === null) delete cell.v;
      else cell.v = v;
      if (Object.keys(cell).length) cells[key] = cell;
      else delete cells[key];
    }
  }
  return { ...data, cells };
}

/** The value at index `t` of the series the cells start, or null when they are simply repeated */
function fillSeries(seq: (WeSheetCell | undefined)[]): ((t: number) => WeSheetCell['v']) | null {
  const values = seq.map((c) => c?.v);
  const n = values.length;
  if (values.every((v) => typeof v === 'number')) {
    const nums = values as number[];
    if (n === 1) return seq[0]?.f === 'date' ? (t) => nums[0] + t : null;
    const step = (nums[n - 1] - nums[0]) / (n - 1);
    return (t) => Math.round((nums[0] + step * t) * 1e10) / 1e10;
  }
  const parts = values.map((v) => (typeof v === 'string' && !v.startsWith('=') ? /^(.*?)(\d+)$/.exec(v) : null));
  if (parts.every((m) => m && m[1] === parts[0]![1])) {
    const nums = parts.map((m) => Number(m![2]));
    const width = parts[0]![2].length;
    const step = n === 1 ? 1 : (nums[n - 1] - nums[0]) / (n - 1);
    if (!Number.isInteger(step)) return null;
    return (t) => {
      const x = nums[0] + step * t;
      return x < 0 ? null : parts[0]![1] + String(x).padStart(width, '0');
    };
  }
  return null;
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
/**
 * `weSheetMoveReferences` for references into the sheet `sheetName` from another sheet
 * (`Sales!A5`, `'Q 1'!A5:A9`) — what a workbook runs over its other sheets when rows or columns of
 * `sheetName` are inserted or deleted. A reference to deleted cells becomes `#REF!`.
 */
export function weSheetMoveSheetReferences(formula: string, sheetName: string, axis: 'row' | 'col', at: number, delta: number): string {
  if (delta === 0) return formula;
  const target = sheetName.toLocaleLowerCase();
  const ref = /(^|[^\p{L}\p{N}_.$'])('(?:[^']|'')*'|[\p{L}\p{N}_.]+)!(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?(?![A-Za-z0-9(])|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}(?![A-Za-z0-9(]))/gu;
  // Odd parts are text in quotes — left alone
  return formula
    .split(/("(?:[^"]|"")*")/)
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(ref, (all: string, lead: string, name: string, cells: string) => {
            const plain = name.startsWith("'") ? name.slice(1, -1).replace(/''/g, "'") : name;
            if (plain.toLocaleLowerCase() !== target) return all;
            const moved = weSheetMoveReferences(cells, axis, at, delta);
            return lead + (moved.includes('#REF!') ? '#REF!' : `${name}!${moved}`);
          })
    )
    .join('');
}

export function weSheetRenameReferences(formula: string, oldName: string, newName: string): string {
  return weSheetRenameSheets(formula, new Map([[oldName, newName]]));
}

/** `weSheetRenameReferences` for several sheets at once — each reference is renamed once, by its old name */
export function weSheetRenameSheets(formula: string, renames: ReadonlyMap<string, string>): string {
  const byName = new Map([...renames].map(([from, to]) => [from.toLocaleLowerCase(), to]));
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
    const renamed = name === null ? undefined : byName.get(name.toLocaleLowerCase());
    if (renamed !== undefined) {
      out += `${weSheetNameRef(renamed)}!`;
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

/** Functions newer than Excel 2007, which a file names with the `_xlfn.` prefix */
const XLFN = new Set(['IFS', 'SWITCH', 'XLOOKUP', 'TEXTJOIN', 'CONCAT', 'XOR', 'IFNA', 'DAYS', 'STDEV.S', 'RANK.EQ']);

/**
 * A sheet formula in Excel's own syntax: Turkish function names become English (`TOPLA` → `SUM`),
 * `;` separates arguments as `,`, `DOĞRU`/`YANLIŞ` become `TRUE`/`FALSE`. Quoted text and quoted
 * sheet names are left alone. Returns the formula without its `=`.
 */
export function weSheetFormulaToExcel(formula: string): string {
  let out = '';
  let i = formula.startsWith('=') ? 1 : 0;
  while (i < formula.length) {
    const ch = formula[i];
    if (ch === '"' || ch === "'") {
      let end = i + 1;
      // A doubled quote is the quote itself, inside text and sheet names alike
      while (end < formula.length && !(formula[end] === ch && formula[end + 1] !== ch)) end += formula[end] === ch ? 2 : 1;
      out += formula.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    if (ch === ';') {
      out += ',';
      i++;
      continue;
    }
    const word = /^[\p{L}_][\p{L}\p{N}_.]*/u.exec(formula.slice(i));
    if (word && !/[\p{L}\p{N}_.$]/u.test(formula[i - 1] ?? '')) {
      const name = word[0];
      const upper = name.toLocaleUpperCase('tr');
      const next = formula.slice(i + name.length).trimStart()[0];
      if (next === '(') {
        const fn = WE_GRID_FORMULA_ALIASES[upper] ?? WE_GRID_FORMULA_ALIASES[name.toUpperCase()] ?? name.toUpperCase();
        out += XLFN.has(fn) ? `_xlfn.${fn}` : fn;
      }
      else if (upper === 'DOĞRU') out += 'TRUE';
      else if (upper === 'YANLIŞ') out += 'FALSE';
      else out += name;
      i += name.length;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** The Excel number format code of a sheet cell's format */
function excelNumberFormat(cell: WeSheetCell): string | undefined {
  const d = cell.d;
  const places = (n: number) => (n > 0 ? `.${'0'.repeat(n)}` : '');
  switch (cell.f) {
    case 'number':
    case 'currency':
      // shortcut: currency is written as a number with its decimals, without the symbol — add the currency's Excel code if asked
      return `#,##0${places(d ?? 2)}`;
    case 'integer':
      return '#,##0';
    case 'percent':
      return `0${places(d ?? 2)}%`;
    case 'date':
      return 'mm-dd-yy';
    case 'text':
      return '@';
    default:
      return d !== undefined ? `0${places(d)}` : undefined;
  }
}

/**
 * The sheets of a workbook (or one sheet) as an .xlsx file Excel opens as the same workbook:
 * formulas in Excel's syntax with their current results, references between the sheets, bold and
 * italic text, number formats and column widths. Colours, lists, notes, charts and conditional
 * formats are not written.
 */
export function weSheetWorkbookXlsx(sheets: readonly { name: string; data: WeSheetData }[]): Blob {
  // The names the file can hold (31 characters, no []:*?/\, unique) — formulas follow them
  const used = new Set<string>();
  const renames = new Map<string, string>();
  for (const { name } of sheets) {
    const base = weGridXlsxSheetName(name);
    let fileName = base;
    for (let n = 2; used.has(fileName.toLowerCase()); n++) fileName = `${base.slice(0, 28)} ${n}`;
    used.add(fileName.toLowerCase());
    if (fileName !== name) renames.set(name, fileName);
  }
  const evaluators = new Map<string, WeGridSheetEvaluator>();
  for (const { name, data } of sheets) {
    evaluators.set(
      name.toLocaleLowerCase(),
      new WeGridSheetEvaluator(
        (c, r) => data.cells[weSheetAddress(c, r)]?.v ?? null,
        () => ({ cols: data.cols, rows: data.rows }),
        { sheet: (n) => evaluators.get(n.toLocaleLowerCase()) ?? null, parseNumbers: false }
      )
    );
  }
  return weGridBuildXlsxWorkbook(
    sheets.map(({ name, data }) => {
      const evaluator = evaluators.get(name.toLocaleLowerCase())!;
      const cells: WeGridXlsxCell[] = [];
      for (const [ref, cell] of Object.entries(data.cells)) {
        const at = weSheetParseAddress(ref);
        if (!at || cell.v === undefined || cell.v === null || cell.v === '') continue;
        const isFormula = typeof cell.v === 'string' && cell.v.startsWith('=');
        const value = isFormula ? evaluator.value(at.col, at.row) : cell.v;
        const error = value instanceof WeGridFormulaError;
        cells.push({
          ref,
          value: error ? (value as WeGridFormulaError).code : (value as WeGridXlsxCell['value']),
          formula: isFormula ? weSheetFormulaToExcel(renames.size ? weSheetRenameSheets(cell.v as string, renames) : (cell.v as string)) : undefined,
          error: error || undefined,
          bold: cell.s?.bold || (data.headerRow && at.row === 0) || undefined,
          italic: cell.s?.italic,
          numFmt: excelNumberFormat(cell),
          borders: cell.b || undefined,
          align: cell.a,
          wrap: cell.w
        });
      }
      const widths: Record<number, number> = {};
      for (const [letter, w] of Object.entries(data.widths ?? {})) widths[weGridColumnIndex(letter)] = w;
      return { name: renames.get(name) ?? name, cells, widths, merges: data.merges };
    })
  );
}

/**
 * A sheet from cells as a user would type them, by A1 address — what an Excel file reads into
 * (`weGridReadXlsxCells`). Kept within the sheet's limits; `truncated` tells when cells were left
 * out. At least `minRows` × `minCols`, with ten spare rows below the content.
 */
export function weSheetFromCells(
  input: Readonly<Record<string, string>>,
  decimalSeparator: '.' | ',',
  minRows = 1,
  minCols = 1,
  merges: readonly string[] = []
): { data: WeSheetData; truncated: boolean } {
  const cells: Record<string, WeSheetCell> = {};
  let rows = 0;
  let cols = 0;
  let truncated = false;
  for (const [ref, text] of Object.entries(input)) {
    const at = weSheetParseAddress(ref);
    if (!at) continue;
    if (at.row >= WE_SHEET_MAX_ROWS || at.col >= WE_SHEET_MAX_COLS) {
      truncated = true;
      continue;
    }
    const parsed = weSheetParseInput(text, decimalSeparator);
    if (parsed.value === null || parsed.value === undefined) continue;
    cells[weSheetAddress(at.col, at.row)] = parsed.format ? { v: parsed.value, f: parsed.format } : { v: parsed.value };
    rows = Math.max(rows, at.row + 1);
    cols = Math.max(cols, at.col + 1);
  }
  const data: WeSheetData = {
    ...weSheetEmpty(Math.min(WE_SHEET_MAX_ROWS, Math.max(minRows, rows + 10)), Math.min(WE_SHEET_MAX_COLS, Math.max(minCols, cols))),
    cells
  };
  // The sheet grows to hold every merge, as it does for every cell
  for (const m of merges) {
    const end = weSheetParseAddress(m.split(':')[1] ?? '');
    if (!end) continue;
    data.rows = Math.min(WE_SHEET_MAX_ROWS, Math.max(data.rows, end.row + 1));
    data.cols = Math.min(WE_SHEET_MAX_COLS, Math.max(data.cols, end.col + 1));
  }
  const kept = weSheetSanitizeMerges([...merges], data.rows, data.cols);
  if (kept.length) data.merges = kept;
  return { data, truncated };
}
