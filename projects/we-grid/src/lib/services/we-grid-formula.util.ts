/**
 * Excel-style formula engine — `=SUM(A1:A5)`, `=[Price] * [Qty]`, `=EĞER(B2>100; "High"; "Low")`.
 *
 * Source is tokenised and parsed into a small tree, then walked against a `WeGridFormulaScope` — no
 * `eval` / `new Function`, so formulas typed by a user (or loaded from a shared view) can never run
 * code. Evaluation errors are values (`WeGridFormulaError`), exactly as in a spreadsheet: they flow
 * through operators and functions until `IFERROR` catches them. Only malformed source throws, and
 * only when compiling (`WeGridFormulaSyntaxError`).
 */

export type WeGridFormulaErrorCode = '#DIV/0!' | '#VALUE!' | '#NAME?' | '#REF!' | '#N/A' | '#NUM!' | '#CIRC!' | '#ERROR!';

/** An evaluation error — a value, not an exception */
export class WeGridFormulaError {
  constructor(readonly code: WeGridFormulaErrorCode) {}

  toString(): string {
    return this.code;
  }
}

/** Thrown by `weGridCompileFormula` for source that does not parse; `position` is the 0-based offset */
export class WeGridFormulaSyntaxError extends Error {
  constructor(
    message: string,
    readonly position: number
  ) {
    super(message);
    this.name = 'WeGridFormulaSyntaxError';
  }
}

/** Where references are resolved — every member is optional, a reference the scope can't resolve is #REF! */
export interface WeGridFormulaScope {
  /** [Name] — the scope decides: a row's value in a computed column, the whole column's values (array) in a footer */
  field?(name: string): unknown;
  /** A1 reference, 0-based column/row */
  cell?(col: number, row: number): unknown;
  /** Rectangular range, rows of values; endRow is `Infinity` for a whole column (A:A) — the scope clamps */
  range?(startCol: number, startRow: number, endCol: number, endRow: number): unknown[][];
  /** `Sheet2!A1` — a cell of another sheet; undefined or missing for an unknown sheet (→ #REF!) */
  sheetCell?(sheet: string, col: number, row: number): unknown;
  /** `'Sales data'!A1:B9` — a range of another sheet, or undefined for an unknown sheet */
  sheetRange?(sheet: string, startCol: number, startRow: number, endCol: number, endRow: number): unknown[][] | undefined;
  /** Used by TODAY/NOW so tests are deterministic */
  now?(): Date;
}

export interface WeGridFormula {
  readonly source: string;
  evaluate(scope: WeGridFormulaScope): unknown;
  /** Every `[Field]` name the formula reads, once each */
  readonly fieldRefs: readonly string[];
  /** Whether the formula reads A1 cells or ranges */
  readonly hasCellRefs: boolean;
}

/** A string starting with '=' */
export function weGridIsFormula(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('=');
}

/** 0 → A, 25 → Z, 26 → AA */
export function weGridColumnLetter(index: number): string {
  let s = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** A → 0, AA → 26 (case-insensitive) */
export function weGridColumnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Display text of a formula result: errors as their code, booleans TRUE/FALSE, 0.1+0.2 as 0.3 */
export function weGridFormulaValueToText(v: unknown): string {
  if (Array.isArray(v)) return '#VALUE!';
  const t = toText(v);
  return isErr(t) ? t.code : t;
}

// ---------------------------------------------------------------------------------------------
// Values

type Thunk = () => unknown;

const isErr = (v: unknown): v is WeGridFormulaError => v instanceof WeGridFormulaError;
const isBlank = (v: unknown): boolean => v === null || v === undefined || v === '';
const err = (code: WeGridFormulaErrorCode) => new WeGridFormulaError(code);

/** Excel keeps 15 significant digits — this is what makes 0.1 + 0.2 equal 0.3 */
function clean(n: number): number {
  return Number.isFinite(n) ? parseFloat(n.toPrecision(15)) : n;
}

const MS_PER_DAY = 86_400_000;
// Excel's day 0 is 1899-12-30 (it keeps the 1900 leap-year bug, which this offset absorbs for modern dates)
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function toSerial(d: Date): number {
  const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
  return (utc - EXCEL_EPOCH) / MS_PER_DAY;
}

function fromSerial(serial: number): Date {
  const u = new Date(EXCEL_EPOCH + Math.round(serial * MS_PER_DAY));
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds(), u.getUTCMilliseconds());
}

function flatten(v: unknown, out: unknown[] = []): unknown[] {
  if (Array.isArray(v)) for (const x of v) flatten(x, out);
  else out.push(v);
  return out;
}

/** A value used where one value is expected — a 1×1 range is fine, anything bigger is #VALUE! */
function scalar(v: unknown): unknown {
  if (!Array.isArray(v)) return v;
  const f = flatten(v);
  return f.length === 1 ? f[0] : err('#VALUE!');
}

function toNumber(v: unknown): number | WeGridFormulaError {
  v = scalar(v);
  if (isErr(v)) return v;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isBlank(v)) return 0;
  if (v instanceof Date) return toSerial(v);
  if (typeof v === 'string') {
    const s = v.trim();
    // Decimal notation only — Number() would also read "0x1A", "0b11" and "Infinity"
    if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return Number(s);
  }
  return err('#VALUE!');
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

function toText(v: unknown): string | WeGridFormulaError {
  v = scalar(v);
  if (isErr(v)) return v;
  if (isBlank(v)) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return String(clean(v));
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  return String(v);
}

function toBool(v: unknown): boolean | WeGridFormulaError {
  v = scalar(v);
  if (isErr(v)) return v;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (isBlank(v)) return false;
  if (typeof v === 'string') {
    const u = normName(v.trim());
    if (u === 'TRUE' || u === 'DOĞRU') return true;
    if (u === 'FALSE' || u === 'YANLIŞ') return false;
  }
  return err('#VALUE!');
}

function toDate(v: unknown): Date | WeGridFormulaError {
  v = scalar(v);
  if (isErr(v)) return v;
  if (v instanceof Date) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isFinite(Number(v))) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? err('#VALUE!') : d;
  }
  const n = toNumber(v);
  return isErr(n) ? n : fromSerial(n);
}

function toInt(v: unknown): number | WeGridFormulaError {
  const n = toNumber(v);
  return isErr(n) ? n : Math.trunc(n);
}

/** Excel ordering: numbers (and dates) < text < booleans; text is case-insensitive; blank equals 0 / "" / FALSE */
function compare(a: unknown, b: unknown): number {
  if (isBlank(a) && isBlank(b)) return 0;
  if (isBlank(a)) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
  if (isBlank(b)) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
  if (a instanceof Date) a = toSerial(a);
  if (b instanceof Date) b = toSerial(b);
  const rank = (x: unknown) => (typeof x === 'number' ? 0 : typeof x === 'boolean' ? 2 : 1);
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 0) return Math.sign(clean(a as number) - clean(b as number));
  if (ra === 2) return Number(a) - Number(b);
  const la = String(a).toLowerCase();
  const lb = String(b).toLowerCase();
  return la < lb ? -1 : la > lb ? 1 : 0;
}

function numResult(n: number): number | WeGridFormulaError {
  return Number.isFinite(n) ? clean(n) : err('#NUM!');
}

// ---------------------------------------------------------------------------------------------
// Functions

interface FnDef {
  /** Arguments arrive as thunks — IF/IFS/IFERROR must not evaluate the branch they don't take */
  lazy?: boolean;
  /** Direct error arguments are passed in instead of short-circuiting (COUNT ignores them, COUNTA counts them) */
  errors?: boolean;
  /** A cell reference argument counts like a one-cell range — text in it is skipped, as in Excel's SUM(A1) */
  refs?: boolean;
  fn: (args: any[], scope: WeGridFormulaScope) => unknown;
}

/**
 * Numbers for SUM/AVERAGE/MIN/MAX: inside ranges and arrays only real numbers and dates count (text
 * and blanks are skipped); a direct argument is coerced, so `SUM("5", TRUE)` is 6.
 */
function numbersOf(args: unknown[]): number[] | WeGridFormulaError {
  const out: number[] = [];
  for (const a of args) {
    if (Array.isArray(a)) {
      for (const x of flatten(a)) {
        if (isErr(x)) return x;
        if (typeof x === 'number') out.push(x);
        else if (x instanceof Date) out.push(toSerial(x));
      }
    } else if (!isBlank(a)) {
      const n = toNumber(a);
      if (isErr(n)) return n;
      out.push(n);
    }
  }
  return out;
}

function wildcard(pattern: string): RegExp {
  const src = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${src}$`, 'is');
}

/** COUNTIF-style criteria: 5, ">10", "<>x", "ab*", "" (blank) */
function criteria(c: unknown): (v: unknown) => boolean {
  c = scalar(c);
  if (typeof c !== 'string') return v => !isBlank(v) && !isErr(v) && compare(v, c) === 0;
  const m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(c)!;
  const op = m[1] ?? '=';
  const rhs = m[2];
  const num = rhs.trim() !== '' && Number.isFinite(Number(rhs)) ? Number(rhs) : null;
  const test = (cmp: number) =>
    op === '=' ? cmp === 0 : op === '<>' ? cmp !== 0 : op === '<' ? cmp < 0 : op === '>' ? cmp > 0 : op === '<=' ? cmp <= 0 : cmp >= 0;
  if (num !== null) {
    return v => {
      const n = typeof v === 'number' ? v : v instanceof Date ? toSerial(v) : null;
      return n === null ? op === '<>' : test(Math.sign(clean(n) - num));
    };
  }
  if (op === '=' || op === '<>') {
    const re = wildcard(rhs);
    const eq = (v: unknown) => (rhs === '' ? isBlank(v) : typeof v === 'string' && re.test(v));
    return op === '=' ? eq : v => !eq(v);
  }
  return v => typeof v === 'string' && test(compare(v, rhs));
}

function ifAggregate(args: unknown[], kind: 'sum' | 'avg'): unknown {
  const range = flatten(args[0]);
  const values = args.length > 2 ? flatten(args[2]) : range;
  const match = criteria(args[1]);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < range.length; i++) {
    if (!match(range[i])) continue;
    const v = values[i];
    if (isErr(v)) return v;
    if (typeof v === 'number') {
      sum += v;
      count++;
    }
  }
  if (kind === 'sum') return clean(sum);
  return count ? clean(sum / count) : err('#DIV/0!');
}

/** A table argument as rows: a 2D range stays as is, a 1D array (a field's values) is one column */
function rowsOf(v: unknown): unknown[][] {
  if (!Array.isArray(v)) return [[v]];
  return v.map(r => (Array.isArray(r) ? r : [r]));
}

function roundBy(v: unknown, d: unknown, mode: 'round' | 'up' | 'down'): unknown {
  const n = toNumber(v);
  const digits = d === undefined ? 0 : toInt(d);
  if (isErr(n)) return n;
  if (isErr(digits)) return digits;
  const f = Math.pow(10, digits);
  const abs = clean(Math.abs(n) * f);
  const r = mode === 'round' ? Math.floor(abs + 0.5) : mode === 'up' ? Math.ceil(abs) : Math.floor(abs);
  return clean((Math.sign(n) * r) / f);
}

function text1(v: unknown, f: (s: string) => unknown): unknown {
  const s = toText(v);
  return isErr(s) ? s : f(s);
}

function logical(args: unknown[], all: boolean): unknown {
  const vals: boolean[] = [];
  for (const a of args) {
    if (Array.isArray(a)) {
      for (const x of flatten(a)) {
        if (isErr(x)) return x;
        if (typeof x === 'number' || typeof x === 'boolean') vals.push(Boolean(x));
      }
    } else {
      const b = toBool(a);
      if (isErr(b)) return b;
      vals.push(b);
    }
  }
  if (!vals.length) return err('#VALUE!');
  return all ? vals.every(Boolean) : vals.some(Boolean);
}

/** TEXT(value, format) — the common number formats only: "0", "0.00", "#,##0.00", "0%", "0.0%" */
function formatText(v: unknown, fmt: unknown): unknown {
  const f = toText(fmt);
  if (isErr(f)) return f;
  // shortcut: number formats only, no date codes (dd.mm.yyyy) or sections — add when a consumer needs them
  if (!/^[#0,.%]+$/.test(f)) return toText(v);
  let n = toNumber(v);
  if (isErr(n)) return n;
  const percent = f.endsWith('%');
  if (percent) n *= 100;
  const decimals = (f.split('.')[1] ?? '').replace(/[^0#]/g, '').length;
  const [int, frac] = Math.abs(roundBy(n, decimals, 'round') as number).toFixed(decimals).split('.');
  const grouped = f.includes(',') ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : int;
  return (n < 0 ? '-' : '') + grouped + (frac ? '.' + frac : '') + (percent ? '%' : '');
}

function lookupApprox(list: unknown[], value: unknown, descending: boolean): number {
  let found = -1;
  for (let i = 0; i < list.length; i++) {
    const c = compare(list[i], value);
    if (descending ? c >= 0 : c <= 0) found = i;
    else break;
  }
  return found;
}

const FUNCTIONS: Record<string, FnDef> = {
  SUM: { refs: true, fn: a => { const n = numbersOf(a); return isErr(n) ? n : clean(n.reduce((s, x) => s + x, 0)); } },
  AVERAGE: { refs: true, fn: a => { const n = numbersOf(a); return isErr(n) ? n : n.length ? clean(n.reduce((s, x) => s + x, 0) / n.length) : err('#DIV/0!'); } },
  MIN: { refs: true, fn: a => { const n = numbersOf(a); return isErr(n) ? n : n.length ? n.reduce((m, x) => (x < m ? x : m)) : 0; } },
  MAX: { refs: true, fn: a => { const n = numbersOf(a); return isErr(n) ? n : n.length ? n.reduce((m, x) => (x > m ? x : m)) : 0; } },
  COUNT: {
    errors: true,
    fn: a =>
      a.reduce((c: number, x) => {
        if (Array.isArray(x)) return c + flatten(x).filter(y => typeof y === 'number' || y instanceof Date).length;
        return c + (!isErr(x) && !isBlank(x) && !isErr(toNumber(x)) ? 1 : 0);
      }, 0)
  },
  COUNTA: { errors: true, fn: a => flatten(a).filter(x => !isBlank(x)).length },
  COUNTIF: { fn: a => { const m = criteria(a[1]); return flatten(a[0]).filter(x => m(x)).length; } },
  SUMIF: { fn: a => ifAggregate(a, 'sum') },
  AVERAGEIF: { fn: a => ifAggregate(a, 'avg') },

  IF: {
    lazy: true,
    fn: (a: Thunk[]) => {
      const c = toBool(a[0]?.());
      if (isErr(c)) return c;
      if (c) return a[1] ? a[1]() : true;
      return a[2] ? a[2]() : false;
    }
  },
  IFS: {
    lazy: true,
    fn: (a: Thunk[]) => {
      if (!a.length || a.length % 2) return err('#VALUE!');
      for (let i = 0; i < a.length; i += 2) {
        const c = toBool(a[i]());
        if (isErr(c)) return c;
        if (c) return a[i + 1]();
      }
      return err('#N/A');
    }
  },
  IFERROR: {
    lazy: true,
    fn: (a: Thunk[]) => {
      const v = a[0]?.();
      return isErr(v) ? (a[1] ? a[1]() : 0) : v;
    }
  },
  AND: { fn: a => logical(a, true) },
  OR: { fn: a => logical(a, false) },
  NOT: { fn: a => { const b = toBool(a[0]); return isErr(b) ? b : !b; } },

  ROUND: { fn: a => roundBy(a[0], a[1], 'round') },
  ROUNDUP: { fn: a => roundBy(a[0], a[1], 'up') },
  ROUNDDOWN: { fn: a => roundBy(a[0], a[1], 'down') },
  ABS: { fn: a => { const n = toNumber(a[0]); return isErr(n) ? n : Math.abs(n); } },
  INT: { fn: a => { const n = toNumber(a[0]); return isErr(n) ? n : Math.floor(n); } },
  MOD: {
    fn: a => {
      const n = toNumber(a[0]);
      const d = toNumber(a[1]);
      if (isErr(n)) return n;
      if (isErr(d)) return d;
      return d === 0 ? err('#DIV/0!') : clean(n - d * Math.floor(n / d));
    }
  },
  POWER: { fn: a => power(a[0], a[1]) },
  SQRT: { fn: a => { const n = toNumber(a[0]); return isErr(n) ? n : n < 0 ? err('#NUM!') : clean(Math.sqrt(n)); } },

  LEN: { fn: a => text1(a[0], s => s.length) },
  LEFT: { fn: a => { const n = a[1] === undefined ? 1 : toInt(a[1]); return isErr(n) ? n : n < 0 ? err('#VALUE!') : text1(a[0], s => s.slice(0, n)); } },
  RIGHT: { fn: a => { const n = a[1] === undefined ? 1 : toInt(a[1]); return isErr(n) ? n : n < 0 ? err('#VALUE!') : text1(a[0], s => (n ? s.slice(-n) : '')); } },
  MID: {
    fn: a => {
      const start = toInt(a[1]);
      const n = toInt(a[2]);
      if (isErr(start)) return start;
      if (isErr(n)) return n;
      return start < 1 || n < 0 ? err('#VALUE!') : text1(a[0], s => s.substr(start - 1, n));
    }
  },
  // shortcut: invariant casing (i → I, not İ) — pass a locale through the scope if Turkish casing is needed here
  UPPER: { fn: a => text1(a[0], s => s.toUpperCase()) },
  LOWER: { fn: a => text1(a[0], s => s.toLowerCase()) },
  PROPER: { fn: a => text1(a[0], s => s.toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (_, p, c) => p + c.toUpperCase())) },
  TRIM: { fn: a => text1(a[0], s => s.trim().replace(/ {2,}/g, ' ')) },
  CONCAT: { fn: a => concat(a) },
  CONCATENATE: { fn: a => concat(a) },
  TEXT: { fn: a => formatText(a[0], a[1]) },

  TODAY: { fn: (_, s) => { const d = s.now?.() ?? new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); } },
  NOW: { fn: (_, s) => s.now?.() ?? new Date() },
  YEAR: { fn: a => { const d = toDate(a[0]); return isErr(d) ? d : d.getFullYear(); } },
  MONTH: { fn: a => { const d = toDate(a[0]); return isErr(d) ? d : d.getMonth() + 1; } },
  DAY: { fn: a => { const d = toDate(a[0]); return isErr(d) ? d : d.getDate(); } },
  DATE: {
    fn: a => {
      const [y, m, d] = [toInt(a[0]), toInt(a[1]), toInt(a[2])];
      if (isErr(y)) return y;
      if (isErr(m)) return m;
      if (isErr(d)) return d;
      return new Date(y, m - 1, d);
    }
  },

  VLOOKUP: {
    fn: a => {
      const value = scalar(a[0]);
      const rows = rowsOf(a[1]);
      const col = toInt(a[2]);
      const approx = a[3] === undefined ? true : toBool(a[3]);
      if (isErr(value)) return value;
      if (isErr(col)) return col;
      if (isErr(approx)) return approx;
      if (col < 1) return err('#VALUE!');
      if (rows.every(r => col > r.length)) return err('#REF!');
      const first = rows.map(r => r[0]);
      const i = approx ? lookupApprox(first, value, false) : first.findIndex(x => compare(x, value) === 0);
      return i < 0 ? err('#N/A') : rows[i][col - 1] ?? null;
    }
  },
  MATCH: {
    fn: a => {
      const value = scalar(a[0]);
      const list = flatten(a[1]);
      const type = a[2] === undefined ? 1 : toInt(a[2]);
      if (isErr(value)) return value;
      if (isErr(type)) return type;
      const i = type === 0 ? list.findIndex(x => compare(x, value) === 0) : lookupApprox(list, value, type < 0);
      return i < 0 ? err('#N/A') : i + 1;
    }
  },
  INDEX: {
    fn: a => {
      const rows = rowsOf(a[0]);
      let r = toInt(a[1]);
      let c = a[2] === undefined ? 1 : toInt(a[2]);
      if (isErr(r)) return r;
      if (isErr(c)) return c;
      // A single row indexed with one number picks a column, as in Excel
      if (rows.length === 1 && a[2] === undefined) [r, c] = [1, r];
      if (r < 1 || c < 1 || r > rows.length || c > rows[r - 1].length) return err('#REF!');
      return rows[r - 1][c - 1] ?? null;
    }
  },

  // ── 0.22.0: the rest of what spreadsheets use every day ──
  SUMIFS: { fn: a => ifsAggregate(a[0], a.slice(1), 'sum') },
  AVERAGEIFS: { fn: a => ifsAggregate(a[0], a.slice(1), 'avg') },
  COUNTIFS: { fn: a => ifsAggregate(null, a, 'count') },
  COUNTBLANK: { errors: true, fn: a => flatten(a[0]).filter(isBlank).length },
  PRODUCT: { refs: true, fn: a => { const n = numbersOf(a); return isErr(n) ? n : numResult(n.reduce((p, x) => p * x, 1)); } },
  SUMPRODUCT: {
    fn: a => {
      const lists = a.map(x => flatten(x));
      if (!lists.length || lists.some(l => l.length !== lists[0].length)) return err('#VALUE!');
      let sum = 0;
      for (let i = 0; i < lists[0].length; i++) {
        let p = 1;
        for (const l of lists) {
          if (isErr(l[i])) return l[i];
          p *= typeof l[i] === 'number' ? (l[i] as number) : 0;
        }
        sum += p;
      }
      return clean(sum);
    }
  },
  MEDIAN: {
    refs: true,
    fn: a => {
      const n = numbersOf(a);
      if (isErr(n)) return n;
      if (!n.length) return err('#NUM!');
      const s = [...n].sort((x, y) => x - y);
      const m = s.length >> 1;
      return clean(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
    }
  },
  LARGE: { fn: a => kth(a[0], a[1], true) },
  SMALL: { fn: a => kth(a[0], a[1], false) },
  RANK: { fn: a => rank(a[0], a[1], a[2]) },
  'RANK.EQ': { fn: a => rank(a[0], a[1], a[2]) },
  STDEV: { refs: true, fn: a => stdev(a) },
  'STDEV.S': { refs: true, fn: a => stdev(a) },

  CEILING: { fn: a => toMultiple(a[0], a[1], Math.ceil) },
  FLOOR: { fn: a => toMultiple(a[0], a[1], Math.floor) },
  SIGN: { fn: a => { const n = toNumber(a[0]); return isErr(n) ? n : Math.sign(n); } },
  PI: { fn: () => Math.PI },
  EXP: { fn: a => { const n = toNumber(a[0]); return isErr(n) ? n : numResult(Math.exp(n)); } },
  LN: { fn: a => { const n = toNumber(a[0]); return isErr(n) ? n : n <= 0 ? err('#NUM!') : clean(Math.log(n)); } },
  LOG10: { fn: a => { const n = toNumber(a[0]); return isErr(n) ? n : n <= 0 ? err('#NUM!') : clean(Math.log10(n)); } },
  LOG: {
    fn: a => {
      const n = toNumber(a[0]);
      const b = a[1] === undefined ? 10 : toNumber(a[1]);
      if (isErr(n)) return n;
      if (isErr(b)) return b;
      return n <= 0 || b <= 0 || b === 1 ? err('#NUM!') : clean(Math.log(n) / Math.log(b));
    }
  },

  FIND: { fn: a => findText(a, false) },
  SEARCH: { fn: a => findText(a, true) },
  SUBSTITUTE: {
    fn: a => {
      const [s, from, to] = [toText(a[0]), toText(a[1]), toText(a[2])];
      if (isErr(s)) return s;
      if (isErr(from)) return from;
      if (isErr(to)) return to;
      if (from === '') return s;
      if (a[3] === undefined) return s.split(from).join(to);
      const nth = toInt(a[3]);
      if (isErr(nth)) return nth;
      if (nth < 1) return err('#VALUE!');
      let at = -1;
      for (let i = 0; i < nth; i++) {
        at = s.indexOf(from, at + 1);
        if (at < 0) return s;
      }
      return s.slice(0, at) + to + s.slice(at + from.length);
    }
  },
  REPLACE: {
    fn: a => {
      const [s, start, n, to] = [toText(a[0]), toInt(a[1]), toInt(a[2]), toText(a[3])];
      if (isErr(s)) return s;
      if (isErr(start)) return start;
      if (isErr(n)) return n;
      if (isErr(to)) return to;
      return start < 1 || n < 0 ? err('#VALUE!') : s.slice(0, start - 1) + to + s.slice(start - 1 + n);
    }
  },
  REPT: {
    fn: a => {
      const s = toText(a[0]);
      const n = toInt(a[1]);
      if (isErr(s)) return s;
      if (isErr(n)) return n;
      return n < 0 || s.length * n > 32767 ? err('#VALUE!') : s.repeat(n);
    }
  },
  EXACT: { fn: a => { const [x, y] = [toText(a[0]), toText(a[1])]; return isErr(x) ? x : isErr(y) ? y : x === y; } },
  VALUE: { fn: a => toNumber(a[0]) },
  TEXTJOIN: {
    fn: a => {
      const delim = toText(a[0]);
      const skip = toBool(a[1]);
      if (isErr(delim)) return delim;
      if (isErr(skip)) return skip;
      const parts: string[] = [];
      for (const x of flatten(a.slice(2))) {
        const t = toText(x);
        if (isErr(t)) return t;
        if (!(skip && t === '')) parts.push(t);
      }
      return parts.join(delim);
    }
  },

  // "" is text, not a blank cell, as in Excel
  ISBLANK: { errors: true, fn: a => { const v = scalar(a[0]); return v === null || v === undefined; } },
  ISNUMBER: { errors: true, fn: a => { const v = scalar(a[0]); return typeof v === 'number' || v instanceof Date; } },
  ISTEXT: { errors: true, fn: a => typeof scalar(a[0]) === 'string' },
  ISERROR: { errors: true, fn: a => isErr(scalar(a[0])) },
  IFNA: {
    lazy: true,
    fn: (a: Thunk[]) => {
      const v = a[0]?.();
      return isErr(v) && v.code === '#N/A' ? (a[1] ? a[1]() : 0) : v;
    }
  },
  NA: { fn: () => err('#N/A') },
  XOR: { fn: a => { const r = logical(a, false); if (isErr(r)) return r; return flatten(a).filter(x => toBool(x) === true).length % 2 === 1; } },
  CHOOSE: {
    lazy: true,
    fn: (a: Thunk[]) => {
      const i = toInt(a[0]?.());
      if (isErr(i)) return i;
      return i < 1 || i >= a.length ? err('#VALUE!') : a[i]();
    }
  },
  SWITCH: {
    lazy: true,
    fn: (a: Thunk[]) => {
      if (a.length < 3) return err('#VALUE!');
      const v = a[0]();
      if (isErr(v)) return v;
      for (let i = 1; i + 1 < a.length; i += 2) {
        const c = a[i]();
        if (isErr(c)) return c;
        if (compare(v, c) === 0) return a[i + 1]();
      }
      return a.length % 2 === 0 ? a[a.length - 1]() : err('#N/A');
    }
  },

  XLOOKUP: {
    fn: a => {
      const value = scalar(a[0]);
      if (isErr(value)) return value;
      const keys = flatten(a[1]);
      const results = flatten(a[2]);
      if (keys.length !== results.length) return err('#VALUE!');
      const mode = a[4] === undefined ? 0 : toInt(a[4]);
      if (isErr(mode)) return mode;
      let i = keys.findIndex(k => compare(k, value) === 0);
      // -1: the next smaller value, 1: the next larger one, when there is no exact match
      if (i < 0 && (mode === -1 || mode === 1)) {
        let best = -1;
        keys.forEach((k, j) => {
          const c = compare(k, value);
          if (isBlank(k) || (mode === -1 ? c > 0 : c < 0)) return;
          if (best < 0 || (mode === -1 ? compare(k, keys[best]) > 0 : compare(k, keys[best]) < 0)) best = j;
        });
        i = best;
      }
      if (i >= 0) return results[i] ?? null;
      return a[3] === undefined ? err('#N/A') : a[3];
    }
  },
  HLOOKUP: {
    fn: a => {
      const value = scalar(a[0]);
      const rows = rowsOf(a[1]);
      const row = toInt(a[2]);
      const approx = a[3] === undefined ? true : toBool(a[3]);
      if (isErr(value)) return value;
      if (isErr(row)) return row;
      if (isErr(approx)) return approx;
      if (row < 1) return err('#VALUE!');
      if (row > rows.length) return err('#REF!');
      const first = rows[0];
      const i = approx ? lookupApprox(first, value, false) : first.findIndex(x => compare(x, value) === 0);
      return i < 0 ? err('#N/A') : rows[row - 1][i] ?? null;
    }
  },

  WEEKDAY: {
    fn: a => {
      const d = toDate(a[0]);
      const type = a[1] === undefined ? 1 : toInt(a[1]);
      if (isErr(d)) return d;
      if (isErr(type)) return type;
      const day = d.getDay();
      return type === 1 ? day + 1 : type === 2 ? ((day + 6) % 7) + 1 : type === 3 ? (day + 6) % 7 : err('#NUM!');
    }
  },
  EDATE: { fn: a => addMonths(a[0], a[1], false) },
  EOMONTH: { fn: a => addMonths(a[0], a[1], true) },
  DAYS: {
    fn: a => {
      const [end, start] = [toDate(a[0]), toDate(a[1])];
      if (isErr(end)) return end;
      if (isErr(start)) return start;
      return Math.round(toSerial(end)) - Math.round(toSerial(start));
    }
  },
  HOUR: { fn: a => { const d = toDate(a[0]); return isErr(d) ? d : d.getHours(); } },
  MINUTE: { fn: a => { const d = toDate(a[0]); return isErr(d) ? d : d.getMinutes(); } },
  SECOND: { fn: a => { const d = toDate(a[0]); return isErr(d) ? d : d.getSeconds(); } }
};

/** SUMIFS / AVERAGEIFS / COUNTIFS: every (range, criteria) pair must match, cell by cell */
function ifsAggregate(values: unknown, pairs: unknown[], kind: 'sum' | 'avg' | 'count'): unknown {
  if (!pairs.length || pairs.length % 2) return err('#VALUE!');
  const ranges: unknown[][] = [];
  const tests: ((v: unknown) => boolean)[] = [];
  for (let i = 0; i < pairs.length; i += 2) {
    ranges.push(flatten(pairs[i]));
    tests.push(criteria(pairs[i + 1]));
  }
  const vals = values === null ? null : flatten(values);
  const size = ranges[0].length;
  if (ranges.some(r => r.length !== size) || (vals && vals.length !== size)) return err('#VALUE!');
  let sum = 0;
  let count = 0;
  for (let i = 0; i < size; i++) {
    if (!tests.every((t, j) => t(ranges[j][i]))) continue;
    if (!vals) {
      count++;
      continue;
    }
    const v = vals[i];
    if (isErr(v)) return v;
    if (typeof v === 'number') {
      sum += v;
      count++;
    }
  }
  if (kind === 'count') return count;
  if (kind === 'sum') return clean(sum);
  return count ? clean(sum / count) : err('#DIV/0!');
}

function kth(range: unknown, k: unknown, largest: boolean): unknown {
  const n = numbersOf([range]);
  const i = toInt(k);
  if (isErr(n)) return n;
  if (isErr(i)) return i;
  if (i < 1 || i > n.length) return err('#NUM!');
  const s = [...n].sort((x, y) => (largest ? y - x : x - y));
  return s[i - 1];
}

function rank(value: unknown, range: unknown, order: unknown): unknown {
  const v = toNumber(value);
  const n = numbersOf([range]);
  const asc = order === undefined ? false : toBool(order);
  if (isErr(v)) return v;
  if (isErr(n)) return n;
  if (isErr(asc)) return asc;
  if (!n.some(x => clean(x) === clean(v))) return err('#N/A');
  return 1 + n.filter(x => (asc ? x < v : x > v)).length;
}

function stdev(args: unknown[]): unknown {
  const n = numbersOf(args);
  if (isErr(n)) return n;
  if (n.length < 2) return err('#DIV/0!');
  const mean = n.reduce((s, x) => s + x, 0) / n.length;
  return clean(Math.sqrt(n.reduce((s, x) => s + (x - mean) ** 2, 0) / (n.length - 1)));
}

function toMultiple(value: unknown, significance: unknown, round: (x: number) => number): unknown {
  const n = toNumber(value);
  const s = significance === undefined ? 1 : toNumber(significance);
  if (isErr(n)) return n;
  if (isErr(s)) return s;
  if (s === 0) return 0;
  if ((n > 0 && s < 0) || (n < 0 && s > 0)) return err('#NUM!');
  return clean(round(n / s) * s);
}

function findText(a: unknown[], insensitive: boolean): unknown {
  const [find, within] = [toText(a[0]), toText(a[1])];
  const start = a[2] === undefined ? 1 : toInt(a[2]);
  if (isErr(find)) return find;
  if (isErr(within)) return within;
  if (isErr(start)) return start;
  if (start < 1 || start > within.length + 1) return err('#VALUE!');
  let at: number;
  if (insensitive) {
    // SEARCH takes ? and * wildcards and ignores case
    const re = new RegExp(find.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[\\s\\S]*').replace(/\?/g, '[\\s\\S]'), 'i');
    const m = re.exec(within.slice(start - 1));
    at = m ? m.index + start - 1 : -1;
  } else {
    at = within.indexOf(find, start - 1);
  }
  return at < 0 ? err('#VALUE!') : at + 1;
}

function addMonths(start: unknown, months: unknown, endOfMonth: boolean): unknown {
  const d = toDate(start);
  const m = toInt(months);
  if (isErr(d)) return d;
  if (isErr(m)) return m;
  const y = d.getFullYear();
  const mo = d.getMonth() + m;
  const last = new Date(y, mo + 1, 0).getDate();
  return endOfMonth ? new Date(y, mo + 1, 0) : new Date(y, mo, Math.min(d.getDate(), last));
}

function concat(args: unknown[]): unknown {
  let s = '';
  for (const x of flatten(args)) {
    const t = toText(x);
    if (isErr(t)) return t;
    s += t;
  }
  return s;
}

function power(a: unknown, b: unknown): unknown {
  const x = toNumber(a);
  const y = toNumber(b);
  if (isErr(x)) return x;
  if (isErr(y)) return y;
  if (x === 0 && y === 0) return err('#NUM!');
  if (x === 0 && y < 0) return err('#DIV/0!');
  return numResult(Math.pow(x, y));
}

/** Upper-cases with every i (i, ı, İ, I) folded to I, so `min`, `MİN` and `MIN` are the same name */
function normName(s: string): string {
  return s.replace(/[iıİ]/g, 'I').toUpperCase();
}

const ALIASES: Record<string, string> = {
  TOPLA: 'SUM', ORTALAMA: 'AVERAGE', EĞER: 'IF', MAK: 'MAX', MİN: 'MIN', BAĞ_DEĞ_SAY: 'COUNT',
  BAĞ_DEĞ_DOLU_SAY: 'COUNTA', EĞERSAY: 'COUNTIF', ETOPLA: 'SUMIF', EĞERORTALAMA: 'AVERAGEIF', YUVARLA: 'ROUND',
  YUKARIYUVARLA: 'ROUNDUP', AŞAĞIYUVARLA: 'ROUNDDOWN', MUTLAK: 'ABS', TAMSAYI: 'INT', KUVVET: 'POWER',
  KAREKÖK: 'SQRT', UZUNLUK: 'LEN', SOLDAN: 'LEFT', SAĞDAN: 'RIGHT', PARÇAAL: 'MID', BÜYÜKHARF: 'UPPER',
  KÜÇÜKHARF: 'LOWER', 'YAZIM.DÜZENİ': 'PROPER', KIRP: 'TRIM', BİRLEŞTİR: 'CONCATENATE', METNEÇEVİR: 'TEXT',
  BUGÜN: 'TODAY', ŞİMDİ: 'NOW', YIL: 'YEAR', AY: 'MONTH', GÜN: 'DAY', TARİH: 'DATE', VE: 'AND', YADA: 'OR',
  DEĞİL: 'NOT', EĞERHATA: 'IFERROR', DÜŞEYARA: 'VLOOKUP', KAÇINCI: 'MATCH', İNDİS: 'INDEX', ÇOKEĞER: 'IFS',
  ÇOKETOPLA: 'SUMIFS', ÇOKEĞERORTALAMA: 'AVERAGEIFS', ÇOKEĞERSAY: 'COUNTIFS', BOŞLUKSAY: 'COUNTBLANK', ÇARPIM: 'PRODUCT',
  'TOPLA.ÇARPIM': 'SUMPRODUCT', ORTANCA: 'MEDIAN', BÜYÜK: 'LARGE', KÜÇÜK: 'SMALL', SIRA: 'RANK', 'SIRA.EŞİT': 'RANK.EQ', STDSAPMA: 'STDEV',
  'STDSAPMA.S': 'STDEV.S', TAVANAYUVARLA: 'CEILING', TABANAYUVARLA: 'FLOOR', İŞARET: 'SIGN', Pİ: 'PI', ÜS: 'EXP',
  BUL: 'FIND', MBUL: 'SEARCH', YERİNEKOY: 'SUBSTITUTE', DEĞİŞTİR: 'REPLACE', YİNELE: 'REPT', ÖZDEŞ: 'EXACT',
  SAYIYAÇEVİR: 'VALUE', METİNBİRLEŞTİR: 'TEXTJOIN', EBOŞSA: 'ISBLANK', ESAYIYSA: 'ISNUMBER', EMETİNSE: 'ISTEXT',
  EHATALIYSA: 'ISERROR', EĞERYOKSA: 'IFNA', YOKSAY: 'NA', ÖZELVEYA: 'XOR', ELEMAN: 'CHOOSE', İLKEŞLEŞEN: 'SWITCH',
  ÇAPRAZARA: 'XLOOKUP', YATAYARA: 'HLOOKUP', HAFTANINGÜNÜ: 'WEEKDAY', SERİTARİH: 'EDATE', SERİAY: 'EOMONTH',
  GÜNSAY: 'DAYS', SAAT: 'HOUR', DAKİKA: 'MINUTE', SANİYE: 'SECOND'
};

const NAME_LOOKUP = new Map<string, string>([
  ...Object.keys(FUNCTIONS).map(k => [normName(k), k] as [string, string]),
  ...Object.entries(ALIASES).map(([k, v]) => [normName(k), v] as [string, string])
]);

/** Canonical (English) function names, sorted — for autocomplete */
export const WE_GRID_FORMULA_FUNCTIONS: readonly string[] = Object.keys(FUNCTIONS).sort();

/** Turkish Excel names and the function each one means — `TOPLA` → `SUM` */
export const WE_GRID_FORMULA_ALIASES: Readonly<Record<string, string>> = ALIASES;

/** Argument hints shown while a formula is typed — `[x]` is optional, `…` repeats */
export const WE_GRID_FORMULA_SIGNATURES: Readonly<Record<string, string>> = {
  SUM: 'number1, [number2], …', AVERAGE: 'number1, [number2], …', MIN: 'number1, [number2], …', MAX: 'number1, [number2], …',
  COUNT: 'value1, [value2], …', COUNTA: 'value1, [value2], …', COUNTIF: 'range, criteria', SUMIF: 'range, criteria, [sum_range]',
  AVERAGEIF: 'range, criteria, [average_range]', IF: 'condition, value_if_true, [value_if_false]', IFS: 'condition1, value1, …',
  IFERROR: 'value, value_if_error', AND: 'logical1, [logical2], …', OR: 'logical1, [logical2], …', NOT: 'logical',
  ROUND: 'number, digits', ROUNDUP: 'number, digits', ROUNDDOWN: 'number, digits', ABS: 'number', INT: 'number',
  MOD: 'number, divisor', POWER: 'number, power', SQRT: 'number', LEN: 'text', LEFT: 'text, [count]', RIGHT: 'text, [count]',
  MID: 'text, start, count', UPPER: 'text', LOWER: 'text', PROPER: 'text', TRIM: 'text', CONCAT: 'text1, [text2], …',
  CONCATENATE: 'text1, [text2], …', TEXT: 'value, format', TODAY: '', NOW: '', YEAR: 'date', MONTH: 'date', DAY: 'date',
  DATE: 'year, month, day', VLOOKUP: 'lookup, table, column, [approximate]', MATCH: 'lookup, range, [type]', INDEX: 'range, row, [column]',
  SUMIFS: 'sum_range, range1, criteria1, …', AVERAGEIFS: 'average_range, range1, criteria1, …', COUNTIFS: 'range1, criteria1, …',
  COUNTBLANK: 'range', PRODUCT: 'number1, [number2], …', SUMPRODUCT: 'array1, [array2], …', MEDIAN: 'number1, [number2], …',
  LARGE: 'range, k', SMALL: 'range, k', RANK: 'number, range, [ascending]', 'RANK.EQ': 'number, range, [ascending]',
  STDEV: 'number1, [number2], …', 'STDEV.S': 'number1, [number2], …', CEILING: 'number, [significance]',
  FLOOR: 'number, [significance]', SIGN: 'number', PI: '', EXP: 'number', LN: 'number', LOG: 'number, [base]', LOG10: 'number',
  FIND: 'find, within, [start]', SEARCH: 'find, within, [start]', SUBSTITUTE: 'text, old, new, [instance]',
  REPLACE: 'text, start, count, new', REPT: 'text, times', EXACT: 'text1, text2', VALUE: 'text',
  TEXTJOIN: 'delimiter, ignore_empty, text1, …', ISBLANK: 'value', ISNUMBER: 'value', ISTEXT: 'value', ISERROR: 'value',
  IFNA: 'value, value_if_na', NA: '', XOR: 'logical1, [logical2], …', CHOOSE: 'index, value1, [value2], …',
  SWITCH: 'expression, value1, result1, …, [default]', XLOOKUP: 'lookup, lookup_range, return_range, [if_not_found], [match_mode]',
  HLOOKUP: 'lookup, table, row, [approximate]', WEEKDAY: 'date, [type]', EDATE: 'date, months', EOMONTH: 'date, months',
  DAYS: 'end_date, start_date', HOUR: 'time', MINUTE: 'time', SECOND: 'time'
};

// ---------------------------------------------------------------------------------------------
// Parser

type Node =
  | { k: 'lit'; v: unknown }
  | { k: 'field'; name: string }
  | { k: 'cell'; c: number; r: number; s?: string }
  | { k: 'range'; c1: number; r1: number; c2: number; r2: number; s?: string }
  | { k: 'neg'; a: Node }
  | { k: 'pct'; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'call'; name: string; args: Node[] };

interface Token {
  t: 'num' | 'str' | 'word' | 'field' | 'err' | 'op' | '(' | ')' | ',' | ':' | 'sheet' | 'end';
  v: string;
  pos: number;
}

const ERROR_LITERALS: WeGridFormulaErrorCode[] = ['#DIV/0!', '#VALUE!', '#NAME?', '#REF!', '#N/A', '#NUM!'];

function tokenize(src: string, offset: number): Token[] {
  const out: Token[] = [];
  const word = /[\p{L}\p{N}_.$]+/uy;
  const num = /(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/y;
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const pos = i + offset;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '"') {
      let s = '';
      let j = i + 1;
      for (;;) {
        if (j >= src.length) throw new WeGridFormulaSyntaxError('Unterminated text — a closing " is missing', pos);
        if (src[j] === '"') {
          if (src[j + 1] === '"') {
            s += '"';
            j += 2;
            continue;
          }
          break;
        }
        s += src[j++];
      }
      out.push({ t: 'str', v: s, pos });
      i = j + 1;
      continue;
    }
    // 'Sales data'!A1 — a quoted sheet name ('' is a quote inside it)
    if (ch === "'") {
      let s = '';
      let j = i + 1;
      for (;;) {
        if (j >= src.length) throw new WeGridFormulaSyntaxError("Unterminated sheet name — a closing ' is missing", pos);
        if (src[j] === "'") {
          if (src[j + 1] === "'") {
            s += "'";
            j += 2;
            continue;
          }
          break;
        }
        s += src[j++];
      }
      if (src[j + 1] !== '!') throw new WeGridFormulaSyntaxError("A quoted sheet name is followed by '!'", pos);
      out.push({ t: 'sheet', v: s, pos });
      i = j + 2;
      continue;
    }
    if (ch === '[') {
      const end = src.indexOf(']', i);
      if (end < 0) throw new WeGridFormulaSyntaxError('Unterminated field reference — a closing ] is missing', pos);
      out.push({ t: 'field', v: src.slice(i + 1, end).trim(), pos });
      i = end + 1;
      continue;
    }
    if (ch === '#') {
      const lit = ERROR_LITERALS.find(e => src.startsWith(e, i));
      if (!lit) throw new WeGridFormulaSyntaxError(`Unexpected '#'`, pos);
      out.push({ t: 'err', v: lit, pos });
      i += lit.length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>') {
      out.push({ t: 'op', v: two, pos });
      i += 2;
      continue;
    }
    if ('+-*/^&=<>%'.includes(ch)) {
      out.push({ t: 'op', v: ch, pos });
      i++;
      continue;
    }
    if (ch === '(' || ch === ')' || ch === ':') {
      out.push({ t: ch, v: ch, pos });
      i++;
      continue;
    }
    if (ch === ',' || ch === ';') {
      out.push({ t: ',', v: ch, pos });
      i++;
      continue;
    }
    num.lastIndex = i;
    const n = num.exec(src);
    // A number directly followed by a letter is a word (e.g. a name) — let the word rule have it
    if (n && !/[\p{L}_$]/u.test(src[i + n[0].length] ?? '')) {
      out.push({ t: 'num', v: n[0], pos });
      i += n[0].length;
      continue;
    }
    word.lastIndex = i;
    const w = word.exec(src);
    if (w) {
      // Sheet2!A1 — a word right before '!' names a sheet
      if (src[i + w[0].length] === '!') {
        out.push({ t: 'sheet', v: w[0], pos });
        i += w[0].length + 1;
        continue;
      }
      out.push({ t: 'word', v: w[0], pos });
      i += w[0].length;
      continue;
    }
    throw new WeGridFormulaSyntaxError(`Unexpected '${ch}'`, pos);
  }
  out.push({ t: 'end', v: '', pos: src.length + offset });
  return out;
}

const BINARY_PRECEDENCE: Record<string, number> = {
  '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5
};

const CELL_RE = /^\$?([A-Za-z]{1,3})\$?([1-9]\d*)$/;
const COLUMN_RE = /^\$?([A-Za-z]{1,3})$/;

class Parser {
  private i = 0;
  readonly fields = new Set<string>();
  cellRefs = false;

  constructor(private readonly tokens: Token[]) {}

  parse(): Node {
    if (this.peek().t === 'end') throw new WeGridFormulaSyntaxError('The formula is empty', this.peek().pos);
    const node = this.expr(0);
    const rest = this.peek();
    if (rest.t !== 'end') throw new WeGridFormulaSyntaxError(`Unexpected '${rest.v}'`, rest.pos);
    return node;
  }

  private peek(ahead = 0): Token {
    return this.tokens[Math.min(this.i + ahead, this.tokens.length - 1)];
  }

  private next(): Token {
    return this.tokens[this.i++];
  }

  private expect(t: Token['t'], what: string): void {
    const tok = this.next();
    if (tok.t !== t) throw new WeGridFormulaSyntaxError(`Expected ${what}`, tok.pos);
  }

  private expr(min: number): Node {
    let left = this.unary();
    for (;;) {
      const tok = this.peek();
      const prec = tok.t === 'op' ? BINARY_PRECEDENCE[tok.v] : undefined;
      if (prec === undefined || prec < min) return left;
      this.next();
      // Every Excel binary operator is left-associative, `^` included (2^3^2 = 64)
      left = { k: 'bin', op: tok.v, a: left, b: this.expr(prec + 1) };
    }
  }

  // Negation binds tighter than ^ in Excel, which is why -2^2 is 4
  private unary(): Node {
    const tok = this.peek();
    if (tok.t === 'op' && (tok.v === '-' || tok.v === '+')) {
      this.next();
      const a = this.unary();
      return tok.v === '-' ? { k: 'neg', a } : a;
    }
    let node = this.primary();
    while (this.peek().t === 'op' && this.peek().v === '%') {
      this.next();
      node = { k: 'pct', a: node };
    }
    return node;
  }

  private primary(): Node {
    const tok = this.next();
    switch (tok.t) {
      case 'num':
        return { k: 'lit', v: Number(tok.v) };
      case 'str':
        return { k: 'lit', v: tok.v };
      case 'err':
        return { k: 'lit', v: err(tok.v as WeGridFormulaErrorCode) };
      case 'field':
        this.fields.add(tok.v);
        return { k: 'field', name: tok.v };
      case '(': {
        const node = this.expr(0);
        this.expect(')', `')'`);
        return node;
      }
      case 'word':
        return this.word(tok);
      case 'sheet': {
        const ref = this.next();
        const node = ref.t === 'word' ? this.word(ref) : null;
        if (!node || (node.k !== 'cell' && node.k !== 'range')) throw new WeGridFormulaSyntaxError(`Expected a cell or range after ${tok.v}!`, ref.pos);
        return { ...node, s: tok.v };
      }
      default:
        throw new WeGridFormulaSyntaxError(tok.t === 'end' ? 'The formula ends unexpectedly' : `Unexpected '${tok.v}'`, tok.pos);
    }
  }

  private word(tok: Token): Node {
    if (this.peek().t === '(') {
      this.next();
      const args: Node[] = [];
      if (this.peek().t !== ')') {
        for (;;) {
          // An empty argument — IF(A1,,"x") — is a blank
          args.push(this.peek().t === ',' || this.peek().t === ')' ? { k: 'lit', v: null } : this.expr(0));
          if (this.peek().t !== ',') break;
          this.next();
        }
      }
      this.expect(')', `')' to close ${tok.v}(`);
      return { k: 'call', name: NAME_LOOKUP.get(normName(tok.v)) ?? normName(tok.v), args };
    }
    const upper = normName(tok.v);
    if (upper === 'TRUE' || upper === 'DOĞRU') return { k: 'lit', v: true };
    if (upper === 'FALSE' || upper === 'YANLIŞ') return { k: 'lit', v: false };

    const cell = CELL_RE.exec(tok.v);
    const second = this.peek().t === ':' ? this.peek(1) : null;
    if (cell) {
      const c = weGridColumnIndex(cell[1]);
      const r = Number(cell[2]) - 1;
      this.cellRefs = true;
      const end = second?.t === 'word' ? CELL_RE.exec(second.v) : null;
      if (!end) return { k: 'cell', c, r };
      this.i += 2;
      return { k: 'range', c1: c, r1: r, c2: weGridColumnIndex(end[1]), r2: Number(end[2]) - 1 };
    }
    const col = COLUMN_RE.exec(tok.v);
    const endCol = col && second?.t === 'word' ? COLUMN_RE.exec(second.v) : null;
    if (col && endCol) {
      this.i += 2;
      this.cellRefs = true;
      return { k: 'range', c1: weGridColumnIndex(col[1]), r1: 0, c2: weGridColumnIndex(endCol[1]), r2: Infinity };
    }
    // An unknown name is not a syntax error in Excel — it evaluates to #NAME?
    return { k: 'lit', v: err('#NAME?') };
  }
}

// ---------------------------------------------------------------------------------------------
// Evaluation

function evaluate(node: Node, scope: WeGridFormulaScope): unknown {
  switch (node.k) {
    case 'lit':
      return node.v;
    case 'field': {
      if (!scope.field) return err('#REF!');
      const v = scope.field(node.name);
      return v === undefined ? null : v;
    }
    case 'cell':
      if (node.s !== undefined) {
        const v = scope.sheetCell?.(node.s, node.c, node.r);
        return v === undefined ? err('#REF!') : v;
      }
      return scope.cell ? (scope.cell(node.c, node.r) ?? null) : err('#REF!');
    case 'range': {
      const box = [Math.min(node.c1, node.c2), Math.min(node.r1, node.r2), Math.max(node.c1, node.c2), Math.max(node.r1, node.r2)] as const;
      if (node.s !== undefined) return scope.sheetRange?.(node.s, ...box) ?? err('#REF!');
      return scope.range ? scope.range(...box) : err('#REF!');
    }
    case 'neg': {
      const n = toNumber(evaluate(node.a, scope));
      return isErr(n) ? n : -n;
    }
    case 'pct': {
      const n = toNumber(evaluate(node.a, scope));
      return isErr(n) ? n : clean(n / 100);
    }
    case 'bin':
      return binary(node.op, evaluate(node.a, scope), evaluate(node.b, scope));
    case 'call': {
      const def = FUNCTIONS[node.name];
      if (!def) return err('#NAME?');
      if (def.lazy) return def.fn(node.args.map(a => () => evaluate(a, scope)), scope);
      const args = node.args.map(a => {
        const v = evaluate(a, scope);
        return def.refs && a.k === 'cell' && !isErr(v) ? [[v]] : v;
      });
      if (!def.errors) {
        const e = args.find(isErr);
        if (e) return e;
      }
      return def.fn(args, scope);
    }
  }
}

function binary(op: string, a: unknown, b: unknown): unknown {
  a = scalar(a);
  b = scalar(b);
  if (isErr(a)) return a;
  if (isErr(b)) return b;
  if (op === '&') {
    const x = toText(a);
    const y = toText(b);
    return isErr(x) ? x : isErr(y) ? y : x + y;
  }
  if (BINARY_PRECEDENCE[op] === 1) {
    const c = compare(a, b);
    return op === '=' ? c === 0 : op === '<>' ? c !== 0 : op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0;
  }
  if (op === '^') return power(a, b);
  const x = toNumber(a);
  const y = toNumber(b);
  if (isErr(x)) return x;
  if (isErr(y)) return y;
  switch (op) {
    case '+':
      // date + days stays a date, as the user expects to see it
      if (a instanceof Date && !(b instanceof Date)) return fromSerial(x + y);
      if (b instanceof Date && !(a instanceof Date)) return fromSerial(x + y);
      return numResult(x + y);
    case '-':
      if (a instanceof Date && !(b instanceof Date)) return fromSerial(x - y);
      return numResult(x - y);
    case '*':
      return numResult(x * y);
    default:
      return y === 0 ? err('#DIV/0!') : numResult(x / y);
  }
}

const COMPILE_CACHE = new Map<string, WeGridFormula>();
const COMPILE_CACHE_LIMIT = 1000;

/** Parses `source` (with or without the leading '='); throws `WeGridFormulaSyntaxError` when it does not parse */
export function weGridCompileFormula(source: string): WeGridFormula {
  const cached = COMPILE_CACHE.get(source);
  if (cached) return cached;
  const offset = source.startsWith('=') ? 1 : 0;
  const parser = new Parser(tokenize(source.slice(offset), offset));
  const root = parser.parse();
  const formula: WeGridFormula = {
    source,
    fieldRefs: [...parser.fields],
    hasCellRefs: parser.cellRefs,
    evaluate: scope => evaluate(root, scope)
  };
  if (COMPILE_CACHE.size >= COMPILE_CACHE_LIMIT) COMPILE_CACHE.clear();
  COMPILE_CACHE.set(source, formula);
  return formula;
}

/** Non-throwing `weGridCompileFormula` — for validating what a user typed */
export function weGridTryCompileFormula(source: string): { formula: WeGridFormula } | { error: WeGridFormulaSyntaxError } {
  try {
    return { formula: weGridCompileFormula(source) };
  } catch (e) {
    if (e instanceof WeGridFormulaSyntaxError) return { error: e };
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------
// Spreadsheet mode

/** Evaluates a grid of raw cell inputs where strings starting with '=' are formulas. Memoised, cycle-safe (#CIRC!). */
export class WeGridSheetEvaluator {
  private readonly cache = new Map<string, unknown>();
  private readonly pending = new Set<string>();
  private readonly scope: WeGridFormulaScope;
  private readonly parseNumbers: boolean;

  constructor(
    private readonly raw: (col: number, row: number) => unknown,
    private readonly size: () => { cols: number; rows: number },
    options: {
      now?: () => Date;
      field?: (name: string) => unknown;
      sheet?: (name: string) => WeGridSheetEvaluator | null;
      /** Reads text such as "12" as a number (the default); false when the inputs are typed already */
      parseNumbers?: boolean;
    } = {}
  ) {
    this.parseNumbers = options.parseNumbers !== false;
    const other = (name: string) => options.sheet?.(name) ?? null;
    this.scope = {
      sheetCell: (s, c, r) => {
        const e = other(s);
        return e ? (e.value(c, r) ?? null) : undefined;
      },
      sheetRange: (s, c1, r1, c2, r2) => other(s)?.rangeValues(c1, r1, c2, r2),
      cell: (c, r) => this.value(c, r),
      range: (c1, r1, c2, r2) => {
        const { cols, rows } = this.size();
        const out: unknown[][] = [];
        for (let r = r1; r <= Math.min(r2, rows - 1); r++) {
          const line: unknown[] = [];
          for (let c = c1; c <= Math.min(c2, cols - 1); c++) line.push(this.value(c, r));
          out.push(line);
        }
        return out;
      },
      now: options.now,
      field: options.field
    };
  }

  /** The cell's computed value: a formula's result, a numeric-looking string as a number, '' as blank */
  value(col: number, row: number): unknown {
    const key = `${col},${row}`;
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.pending.has(key)) return err('#CIRC!');
    const { cols, rows } = this.size();
    if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
    this.pending.add(key);
    let v: unknown;
    try {
      v = this.compute(this.raw(col, row));
    } finally {
      this.pending.delete(key);
    }
    this.cache.set(key, v);
    return v;
  }

  /** Rows of values of a rectangle, clamped to the sheet — what a range reference reads */
  rangeValues(c1: number, r1: number, c2: number, r2: number): unknown[][] {
    const { cols, rows } = this.size();
    const out: unknown[][] = [];
    for (let r = r1; r <= Math.min(r2, rows - 1); r++) {
      const line: unknown[] = [];
      for (let c = c1; c <= Math.min(c2, cols - 1); c++) line.push(this.value(c, r));
      out.push(line);
    }
    return out;
  }

  /** Drops every cached value — call after any edit */
  invalidate(): void {
    this.cache.clear();
  }

  private compute(raw: unknown): unknown {
    if (weGridIsFormula(raw)) {
      const compiled = weGridTryCompileFormula(raw);
      if ('error' in compiled) return err('#ERROR!');
      const v = compiled.formula.evaluate(this.scope);
      // shortcut: no array spilling — a formula returning a range shows #VALUE!, as pre-365 Excel did
      return Array.isArray(v) ? scalar(v) : v;
    }
    if (typeof raw === 'string') {
      const s = raw.trim();
      if (s === '') return null;
      if (!this.parseNumbers) return raw;
      const n = toNumber(s);
      return typeof n === 'number' ? n : raw;
    }
    return raw ?? null;
  }
}
