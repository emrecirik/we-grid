import { WeGridDensity } from '../models/we-grid-column.model';
import { WeGridExportFormat } from '../models/we-grid-export.model';
import { WE_GRID_FORMAT_COLORS, WeGridCellStyle, WeGridFormatColor, WeGridFormatOperator, WeGridFormatRule } from '../models/we-grid-format.model';
import { WeGridMacro, WeGridMacroError, WeGridMacroFilterOperator, WeGridMacroLine, WeGridMacroStep } from '../models/we-grid-macro.model';
import { WeGridFormulaColumn } from '../models/we-grid-layout.model';
import { WeGridSavedView } from '../models/we-grid-view.model';
import { weGridTryCompileFormula } from './we-grid-formula.util';
import { weGridToInputNumber } from './we-grid-value.util';

const MAX_LINES = 500;
const MAX_MACROS = 50;

/** A line being read left to right */
class Cursor {
  i = 0;
  constructor(readonly s: string) {}

  get done(): boolean {
    this.skipSpace();
    return this.i >= this.s.length;
  }

  skipSpace(): void {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++;
  }

  /** The next keyword, upper-cased, without consuming it */
  peekWord(): string {
    this.skipSpace();
    const m = /^[A-Za-z_]+/.exec(this.s.slice(this.i));
    return m ? m[0].toUpperCase() : '';
  }

  word(): string {
    const w = this.peekWord();
    this.i += w.length;
    return w;
  }

  /** Consumes the keyword when it is next */
  accept(word: string): boolean {
    if (this.peekWord() !== word) return false;
    this.i += word.length;
    return true;
  }

  peek(): string {
    this.skipSpace();
    return this.s[this.i] ?? '';
  }

  acceptChar(ch: string): boolean {
    if (this.peek() !== ch) return false;
    this.i++;
    return true;
  }

  field(): string {
    this.skipSpace();
    if (this.s[this.i] !== '[') throw new Error('expected a column like [Name]');
    const end = this.s.indexOf(']', this.i);
    if (end === -1) throw new Error('missing ]');
    const name = this.s.slice(this.i + 1, end).trim();
    if (!name) throw new Error('empty column name');
    this.i = end + 1;
    return name;
  }

  fields(): string[] {
    const out = [this.field()];
    while (this.acceptChar(',')) out.push(this.field());
    return out;
  }

  operator(): string {
    this.skipSpace();
    const m = /^(>=|<=|<>|!=|=|>|<)/.exec(this.s.slice(this.i));
    if (m) {
      this.i += m[0].length;
      return m[0];
    }
    return '';
  }

  /** A number, a "quoted string" or TRUE/FALSE */
  value(): string | number | boolean {
    this.skipSpace();
    const rest = this.s.slice(this.i);
    if (rest.startsWith('"')) {
      let out = '';
      let j = 1;
      while (j < rest.length) {
        if (rest[j] === '"') {
          if (rest[j + 1] === '"') {
            out += '"';
            j += 2;
            continue;
          }
          this.i += j + 1;
          return out;
        }
        out += rest[j++];
      }
      throw new Error('missing closing "');
    }
    const num = /^-?\d+(\.\d+)?/.exec(rest);
    if (num) {
      this.i += num[0].length;
      return Number(num[0]);
    }
    const word = this.peekWord();
    if (word === 'TRUE' || word === 'FALSE') {
      this.i += word.length;
      return word === 'TRUE';
    }
    throw new Error('expected a value — a number or "text"');
  }

  /** Everything left on the line */
  rest(): string {
    const out = this.s.slice(this.i).trim();
    this.i = this.s.length;
    return out;
  }
}

const COLORS = new Set<string>(WE_GRID_FORMAT_COLORS.map((c) => c.toUpperCase()));
const EXPORTS: Record<string, WeGridExportFormat> = { XLSX: 'xlsx', EXCEL: 'xlsx', CSV: 'csv', PDF: 'pdf' };
const DENSITIES: Record<string, WeGridDensity> = { COMPACT: 'compact', NORMAL: 'normal', COMFORTABLE: 'comfortable' };
const COLUMN_TYPES = new Set(['TEXT', 'NUMBER', 'INTEGER', 'CURRENCY', 'PERCENT', 'DATE', 'BOOLEAN']);

/**
 * Reads a macro script into steps. Every line is one step; empty lines and lines starting with `#`
 * or `//` are skipped. Unreadable lines are reported with their number and left out — the rest
 * still parses, so the editor can show every problem at once.
 */
export function weGridParseMacro(script: string): { lines: WeGridMacroLine[]; errors: WeGridMacroError[] } {
  const lines: WeGridMacroLine[] = [];
  const errors: WeGridMacroError[] = [];
  script
    .split(/\r?\n/)
    .slice(0, MAX_LINES)
    .forEach((text, index) => {
      const trimmed = text.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return;
      try {
        const step = parseLine(new Cursor(trimmed));
        lines.push({ line: index + 1, step });
      } catch (e) {
        errors.push({ line: index + 1, message: e instanceof Error ? e.message : String(e) });
      }
    });
  return { lines, errors };
}

function parseLine(c: Cursor): WeGridMacroStep {
  const keyword = c.word();
  let step: WeGridMacroStep;
  switch (keyword) {
    case 'SORT': {
      const field = c.field();
      const dir = c.word();
      if (dir !== 'ASC' && dir !== 'DESC' && dir !== 'NONE') throw new Error('SORT needs ASC, DESC or NONE');
      step = { op: 'sort', field, direction: dir === 'NONE' ? null : (dir.toLowerCase() as 'asc' | 'desc') };
      // SORT [City] ASC THEN [Total] DESC — further sort columns
      const then: { field: string; direction: 'asc' | 'desc' }[] = [];
      while (step.direction && c.accept('THEN')) {
        const f = c.field();
        const d = c.word();
        if (d !== 'ASC' && d !== 'DESC') throw new Error('THEN needs a column and ASC or DESC');
        then.push({ field: f, direction: d.toLowerCase() as 'asc' | 'desc' });
      }
      if (then.length) step.then = then;
      break;
    }
    case 'FILTER':
      step = parseFilter(c);
      break;
    case 'CLEAR': {
      const what = c.word();
      if (what === 'FILTERS') step = { op: 'clearFilters' };
      else if (what === 'FORMATS') step = { op: 'clearFormats', field: c.done ? null : c.field() };
      else if (what === 'SORT') step = { op: 'sort', field: '', direction: null };
      else throw new Error('CLEAR needs FILTERS, FORMATS or SORT');
      break;
    }
    case 'GROUP':
      if (!c.accept('BY')) throw new Error('write GROUP BY [Column]');
      step = { op: 'group', fields: c.fields() };
      break;
    case 'UNGROUP':
      step = { op: 'ungroup' };
      break;
    case 'SHOW':
      step = { op: 'show', fields: c.fields() };
      break;
    case 'HIDE':
      step = { op: 'hide', fields: c.fields() };
      break;
    case 'DENSITY': {
      const d = DENSITIES[c.word()];
      if (!d) throw new Error('DENSITY needs COMPACT, NORMAL or COMFORTABLE');
      step = { op: 'density', density: d };
      break;
    }
    case 'ZEBRA': {
      const w = c.word();
      if (w !== 'ON' && w !== 'OFF') throw new Error('ZEBRA needs ON or OFF');
      step = { op: 'zebra', on: w === 'ON' };
      break;
    }
    case 'HIGHLIGHT':
      step = parseHighlight(c);
      break;
    case 'DATABAR': {
      const field = c.field();
      const color = c.word();
      if (!COLORS.has(color)) throw new Error(`unknown colour — use ${[...COLORS].join(', ')}`);
      step = { op: 'format', rule: { field, type: 'dataBar', color: color.toLowerCase() as WeGridFormatColor } };
      break;
    }
    case 'ICONSET': {
      const field = c.field();
      const set = c.done ? 'ARROWS' : c.word();
      if (set !== 'ARROWS' && set !== 'DOTS') throw new Error('ICONSET needs ARROWS or DOTS');
      const reverse = c.accept('REVERSE');
      step = { op: 'format', rule: { field, type: 'iconSet', icons: set === 'DOTS' ? 'dots' : 'arrows', ...(reverse ? { reverse: true } : {}) } };
      break;
    }
    case 'COLORSCALE': {
      const field = c.field();
      const colors: WeGridFormatColor[] = [];
      while (!c.done) {
        const w = c.word();
        if (!COLORS.has(w)) throw new Error(`unknown colour — use ${[...COLORS].join(', ')}`);
        colors.push(w.toLowerCase() as WeGridFormatColor);
      }
      if (colors.length < 2 || colors.length > 3) throw new Error('COLORSCALE needs two or three colours');
      step = { op: 'format', rule: { field, type: 'colorScale', colors } };
      break;
    }
    case 'SET': {
      const field = c.field();
      if (!c.acceptChar('=')) throw new Error('write SET [Column] = formula');
      const [formula, where] = splitWhere(c.rest());
      checkFormula(formula);
      if (where !== null) checkFormula(where);
      step = { op: 'set', field, formula: `=${formula}`, where: where === null ? null : `=${where}` };
      break;
    }
    case 'DELETE': {
      if (c.word() !== 'COLUMN') throw new Error('write DELETE COLUMN [Name]');
      step = { op: 'deleteColumn', header: c.field() };
      break;
    }
    case 'COLUMN': {
      const header = c.field();
      const typeWord = c.acceptChar('=') ? null : c.word();
      if (typeWord !== null && (!COLUMN_TYPES.has(typeWord) || !c.acceptChar('='))) throw new Error('write COLUMN [Name] = formula, or COLUMN [Name] NUMBER = formula');
      const formula = c.rest();
      checkFormula(formula);
      step = { op: 'column', header: header.slice(0, 80), formula: `=${formula}`, ...(typeWord ? { type: typeWord.toLowerCase() as NonNullable<WeGridFormulaColumn['type']> } : {}) };
      break;
    }
    case 'VIEW': {
      const name = c.value();
      if (typeof name !== 'string') throw new Error('write VIEW "Name"');
      step = { op: 'view', name };
      break;
    }
    case 'EXPORT': {
      const f = EXPORTS[c.word()];
      if (!f) throw new Error('EXPORT needs XLSX, CSV or PDF');
      step = { op: 'export', format: f };
      break;
    }
    case 'RUN': {
      const m = /^[A-Za-z_][\w-]*$/.exec(c.rest());
      if (!m) throw new Error('write RUN commandName');
      step = { op: 'run', command: m[0] };
      break;
    }
    case 'MESSAGE': {
      const text = c.value();
      if (typeof text !== 'string') throw new Error('write MESSAGE "text"');
      step = { op: 'message', text: text.slice(0, 300) };
      break;
    }
    default:
      throw new Error(keyword ? `unknown step ${keyword}` : 'a step starts with a word such as SORT or FILTER');
  }
  if (!c.done) throw new Error(`unexpected "${c.rest()}"`);
  return step;
}

function parseFilter(c: Cursor): WeGridMacroStep {
  const field = c.field();
  const sym = c.operator();
  if (sym === '=' || sym === '>' || sym === '<') return { op: 'filter', field, operator: sym, values: [c.value()] };
  if (sym) throw new Error('FILTER supports =, >, <, CONTAINS, STARTS WITH, BETWEEN and IN');
  const w = c.word();
  if (w === 'CONTAINS') return { op: 'filter', field, operator: 'contains', values: [c.value()] };
  if (w === 'STARTS' && c.accept('WITH')) return { op: 'filter', field, operator: 'startsWith', values: [c.value()] };
  if (w === 'BETWEEN') {
    const a = c.value();
    if (!c.accept('AND')) throw new Error('write BETWEEN 1 AND 9');
    return { op: 'filter', field, operator: 'between', values: [a, c.value()] };
  }
  if (w === 'IN') {
    if (!c.acceptChar('(')) throw new Error('write IN ("a", "b")');
    const values = [c.value()];
    while (c.acceptChar(',')) values.push(c.value());
    if (!c.acceptChar(')')) throw new Error('missing )');
    return { op: 'filter', field, operator: 'in', values };
  }
  throw new Error('FILTER supports =, >, <, CONTAINS, STARTS WITH, BETWEEN and IN');
}

const HIGHLIGHT_SYMBOLS: Record<string, WeGridFormatOperator> = { '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte', '=': 'eq', '<>': 'neq', '!=': 'neq' };

function parseHighlight(c: Cursor): WeGridMacroStep {
  // HIGHLIGHT ROWS WHERE =formula COLOR … — a row-wide formula rule on the first column
  if (c.accept('ROWS')) {
    if (!c.accept('WHERE')) throw new Error('write HIGHLIGHT ROWS WHERE =[A] > [B] RED');
    const { formula, style } = splitTrailingStyle(c.rest());
    checkFormula(formula);
    return { op: 'format', rule: { field: '*', type: 'condition', operator: 'formula', value: `=${formula}`, style, applyTo: 'row' } };
  }
  const field = c.field();
  const rule: Omit<WeGridFormatRule, 'id'> = { field, type: 'condition' };
  const sym = c.operator();
  if (sym) {
    rule.operator = HIGHLIGHT_SYMBOLS[sym];
    rule.value = c.value() as string | number;
  } else {
    const w = c.word();
    if (w === 'CONTAINS') {
      rule.operator = 'contains';
      rule.value = c.value() as string | number;
    } else if (w === 'BETWEEN') {
      rule.operator = 'between';
      rule.value = c.value() as string | number;
      if (!c.accept('AND')) throw new Error('write BETWEEN 1 AND 9');
      rule.value2 = c.value() as string | number;
    } else if (w === 'TOP' || w === 'BOTTOM') {
      rule.operator = w === 'TOP' ? 'top' : 'bottom';
      rule.value = c.value() as number;
    } else if (w === 'ABOVE' || w === 'BELOW') {
      if (!c.accept('AVERAGE')) throw new Error(`write ${w} AVERAGE`);
      rule.operator = w === 'ABOVE' ? 'aboveAverage' : 'belowAverage';
    } else if (w === 'DUPLICATES' || w === 'UNIQUE' || w === 'EMPTY') {
      rule.operator = w === 'DUPLICATES' ? 'duplicate' : w === 'UNIQUE' ? 'unique' : 'empty';
    } else {
      throw new Error('HIGHLIGHT needs a comparison, CONTAINS, BETWEEN, TOP n, BOTTOM n, ABOVE/BELOW AVERAGE, DUPLICATES, UNIQUE or EMPTY');
    }
  }
  const { style, row } = readStyleWords(c);
  rule.style = style;
  if (row) rule.applyTo = 'row';
  return { op: 'format', rule };
}

/** `RED BOLD ITALIC ROW` after a highlight condition — a colour means its fill with matching text */
function readStyleWords(c: Cursor): { style: WeGridCellStyle; row: boolean } {
  const style: WeGridCellStyle = {};
  let row = false;
  while (!c.done) {
    const w = c.word();
    if (COLORS.has(w)) {
      const color = w.toLowerCase() as WeGridFormatColor;
      style.fill = color;
      style.color = color;
    } else if (w === 'BOLD') style.bold = true;
    else if (w === 'ITALIC') style.italic = true;
    else if (w === 'ROW') row = true;
    else throw new Error(`unknown style "${w || c.rest()}" — use a colour, BOLD, ITALIC or ROW`);
  }
  if (!Object.keys(style).length) {
    style.fill = 'yellow';
    style.color = 'yellow';
  }
  return { style, row };
}

/** A formula followed by style words — the words are peeled off the end */
function splitTrailingStyle(text: string): { formula: string; style: WeGridCellStyle } {
  const words = text.split(/\s+/);
  const style: WeGridCellStyle = {};
  while (words.length > 1) {
    const w = words[words.length - 1].toUpperCase();
    if (COLORS.has(w)) {
      style.fill = style.fill ?? (w.toLowerCase() as WeGridFormatColor);
      style.color = style.color ?? (w.toLowerCase() as WeGridFormatColor);
    } else if (w === 'BOLD') style.bold = true;
    else if (w === 'ITALIC') style.italic = true;
    else break;
    words.pop();
  }
  if (!Object.keys(style).length) {
    style.fill = 'yellow';
    style.color = 'yellow';
  }
  return { formula: words.join(' ').replace(/^=/, '').trim(), style };
}

/** Splits `formula WHERE condition` on a WHERE outside quotes and brackets */
function splitWhere(text: string): [string, string | null] {
  let quoted = false;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === '[') depth++;
    else if (!quoted && ch === ']') depth--;
    else if (!quoted && depth === 0 && /\s/.test(ch) && /^\s+WHERE\s/i.test(text.slice(i))) {
      const rest = text.slice(i).replace(/^\s+WHERE\s+/i, '');
      return [text.slice(0, i).trim().replace(/^=/, '').trim(), rest.replace(/^=/, '').trim()];
    }
  }
  return [text.trim().replace(/^=/, '').trim(), null];
}

function checkFormula(text: string): void {
  if (!text) throw new Error('missing formula');
  const result = weGridTryCompileFormula(`=${text}`);
  if ('error' in result) throw new Error(`formula: ${result.error.message}`);
}

/** Writes steps back as a script — the recorder's output */
export function weGridMacroScript(steps: readonly WeGridMacroStep[]): string {
  return steps.map(stepText).join('\n');
}

function quote(v: string | number | boolean): string {
  return typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v);
}

function fieldList(fields: string[]): string {
  return fields.map((f) => `[${f}]`).join(', ');
}

function styleWords(style: WeGridCellStyle | undefined, row: boolean): string {
  const words: string[] = [];
  const color = style?.fill ?? style?.color;
  if (color) words.push(color.toUpperCase());
  if (style?.bold) words.push('BOLD');
  if (style?.italic) words.push('ITALIC');
  if (row) words.push('ROW');
  return words.join(' ');
}

const OPERATOR_SYMBOLS: Partial<Record<WeGridFormatOperator, string>> = { gt: '>', gte: '>=', lt: '<', lte: '<=', eq: '=', neq: '<>' };

function stepText(step: WeGridMacroStep): string {
  switch (step.op) {
    case 'sort':
      return step.field
        ? `SORT [${step.field}] ${step.direction ? step.direction.toUpperCase() : 'NONE'}${(step.then ?? []).map((t) => ` THEN [${t.field}] ${t.direction.toUpperCase()}`).join('')}`
        : 'CLEAR SORT';
    case 'filter': {
      const v = step.values;
      if (step.operator === 'between') return `FILTER [${step.field}] BETWEEN ${quote(v[0])} AND ${quote(v[1])}`;
      if (step.operator === 'in') return `FILTER [${step.field}] IN (${v.map(quote).join(', ')})`;
      if (step.operator === 'contains') return `FILTER [${step.field}] CONTAINS ${quote(v[0])}`;
      if (step.operator === 'startsWith') return `FILTER [${step.field}] STARTS WITH ${quote(v[0])}`;
      return `FILTER [${step.field}] ${step.operator} ${quote(v[0])}`;
    }
    case 'clearFilters':
      return 'CLEAR FILTERS';
    case 'group':
      return `GROUP BY ${fieldList(step.fields)}`;
    case 'ungroup':
      return 'UNGROUP';
    case 'show':
      return `SHOW ${fieldList(step.fields)}`;
    case 'hide':
      return `HIDE ${fieldList(step.fields)}`;
    case 'density':
      return `DENSITY ${step.density.toUpperCase()}`;
    case 'zebra':
      return `ZEBRA ${step.on ? 'ON' : 'OFF'}`;
    case 'clearFormats':
      return step.field ? `CLEAR FORMATS [${step.field}]` : 'CLEAR FORMATS';
    case 'deleteColumn':
      return `DELETE COLUMN [${step.header}]`;
    case 'column':
      return `COLUMN [${step.header}]${step.type ? ` ${step.type.toUpperCase()}` : ''} = ${step.formula.replace(/^=/, '')}`;
    case 'set':
      return `SET [${step.field}] = ${step.formula.replace(/^=/, '')}${step.where ? ` WHERE ${step.where.replace(/^=/, '')}` : ''}`;
    case 'view':
      return `VIEW ${quote(step.name)}`;
    case 'export':
      return `EXPORT ${step.format.toUpperCase()}`;
    case 'run':
      return `RUN ${step.command}`;
    case 'message':
      return `MESSAGE ${quote(step.text)}`;
    case 'format':
      return ruleText(step.rule);
  }
}

function ruleText(rule: Omit<WeGridFormatRule, 'id'>): string {
  if (rule.type === 'dataBar') return `DATABAR [${rule.field}] ${(rule.color ?? 'blue').toUpperCase()}`;
  if (rule.type === 'colorScale') return `COLORSCALE [${rule.field}] ${(rule.colors ?? []).map((c) => c.toUpperCase()).join(' ')}`;
  if (rule.type === 'iconSet') return `ICONSET [${rule.field}] ${(rule.icons ?? 'arrows').toUpperCase()}${rule.reverse ? ' REVERSE' : ''}`;
  const style = styleWords(rule.style, rule.applyTo === 'row' && rule.operator !== 'formula');
  const tail = style ? ` ${style}` : '';
  const op = rule.operator ?? 'eq';
  const v = (x: string | number | null | undefined) => quote(x ?? '');
  if (op === 'formula') return `HIGHLIGHT ROWS WHERE ${String(rule.value ?? '').replace(/^=/, '')}${tail}`;
  if (OPERATOR_SYMBOLS[op]) return `HIGHLIGHT [${rule.field}] ${OPERATOR_SYMBOLS[op]} ${v(rule.value)}${tail}`;
  switch (op) {
    case 'contains':
      return `HIGHLIGHT [${rule.field}] CONTAINS ${v(rule.value)}${tail}`;
    case 'between':
      return `HIGHLIGHT [${rule.field}] BETWEEN ${v(rule.value)} AND ${v(rule.value2)}${tail}`;
    case 'top':
    case 'bottom':
      return `HIGHLIGHT [${rule.field}] ${op.toUpperCase()} ${Number(rule.value ?? 10)}${tail}`;
    case 'aboveAverage':
      return `HIGHLIGHT [${rule.field}] ABOVE AVERAGE${tail}`;
    case 'belowAverage':
      return `HIGHLIGHT [${rule.field}] BELOW AVERAGE${tail}`;
    case 'duplicate':
      return `HIGHLIGHT [${rule.field}] DUPLICATES${tail}`;
    case 'unique':
      return `HIGHLIGHT [${rule.field}] UNIQUE${tail}`;
    case 'empty':
      return `HIGHLIGHT [${rule.field}] EMPTY${tail}`;
    default:
      // Not expressible in a script (notBetween, startsWith …) — kept as a comment so nothing is silently lost
      return `# format rule on [${rule.field}] (${op}) — set it in the Format panel`;
  }
}

/**
 * The steps that turn the grid from `before` into `after` — what the macro recorder writes when
 * recording stops. Columns are named by their header, as a user would type them, and numbers as
 * the user sees them (`scaleOf` gives a column's input scale — 100 for a percent column).
 */
export function weGridDiffViews(
  before: WeGridSavedView,
  after: WeGridSavedView,
  headerOf: (field: string) => string,
  scaleOf: (field: string) => number = () => 1
): WeGridMacroStep[] {
  const steps: WeGridMacroStep[] = [];
  const name = headerOf;

  // Formula columns added or changed come first — later steps may sort or filter by them
  const columnsBefore = new Map((before.formulaColumns ?? []).map((c) => [c.field, c]));
  const fieldsAfter = new Set((after.formulaColumns ?? []).map((c) => c.field));
  for (const c of before.formulaColumns ?? []) if (!fieldsAfter.has(c.field)) steps.push({ op: 'deleteColumn', header: c.header });
  for (const c of after.formulaColumns ?? []) {
    const was = columnsBefore.get(c.field);
    if (!was || was.formula !== c.formula || was.header !== c.header || was.type !== c.type) {
      steps.push({ op: 'column', header: c.header, formula: c.formula, ...(c.type ? { type: c.type } : {}) });
    }
  }

  const visibleBefore = new Map(before.columns.map((c) => [c.field, c.visible]));
  const shown = after.columns.filter((c) => c.visible && visibleBefore.get(c.field) === false).map((c) => name(c.field));
  const hidden = after.columns.filter((c) => !c.visible && visibleBefore.get(c.field) !== false).map((c) => name(c.field));
  if (shown.length) steps.push({ op: 'show', fields: shown });
  if (hidden.length) steps.push({ op: 'hide', fields: hidden });

  if (JSON.stringify(before.filters ?? []) !== JSON.stringify(after.filters ?? [])) {
    steps.push({ op: 'clearFilters' });
    for (const f of after.filters ?? []) {
      const oneSided = f.operator === 'between' && (f.value === null || f.value === undefined || f.value2 === null || f.value2 === undefined);
      // shortcut: a one-sided range is written as > or <, which leaves out the boundary value itself — add >= / <= to FILTER if that matters
      const operator: WeGridMacroFilterOperator =
        f.operator === 'contains' ? 'contains' :
        f.operator === 'startsWith' ? 'startsWith' :
        oneSided ? (f.value === null || f.value === undefined ? '<' : '>') :
        f.operator === 'between' ? 'between' :
        f.operator === 'in' ? 'in' :
        f.operator === 'gt' || f.operator === 'after' ? '>' :
        f.operator === 'lt' || f.operator === 'before' ? '<' : '=';
      const raw = operator === 'in' ? (f.value as unknown[]) : operator === 'between' ? [f.value, f.value2] : operator === '<' && oneSided ? [f.value2] : [f.value];
      const scale = scaleOf(f.field);
      const values = raw
        .filter((v): v is string | number | boolean => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
        .map((v) => (typeof v === 'number' ? (weGridToInputNumber(v, scale) as number) : v));
      if (operator === 'between' ? values.length === 2 : values.length) steps.push({ op: 'filter', field: name(f.field), operator, values });
    }
  }

  const groupsBefore = before.groupFields ?? (before.groupField ? [before.groupField] : []);
  const groupsAfter = after.groupFields ?? (after.groupField ? [after.groupField] : []);
  if (groupsBefore.join('\u0000') !== groupsAfter.join('\u0000')) {
    steps.push(groupsAfter.length ? { op: 'group', fields: groupsAfter.map(name) } : { op: 'ungroup' });
  }

  const sb = before.sort ?? null;
  const sa = after.sort ?? null;
  if (sb?.field !== sa?.field || sb?.direction !== sa?.direction || JSON.stringify(before.thenBy ?? []) !== JSON.stringify(after.thenBy ?? [])) {
    const then = (after.thenBy ?? []).map((t) => ({ field: name(t.field), direction: t.direction }));
    steps.push(
      sa?.direction ? { op: 'sort', field: name(sa.field), direction: sa.direction, ...(then.length ? { then } : {}) } : { op: 'sort', field: '', direction: null }
    );
  }

  if (after.density && after.density !== before.density) steps.push({ op: 'density', density: after.density });
  if (after.striped !== undefined && after.striped !== before.striped) steps.push({ op: 'zebra', on: after.striped });

  const rulesBefore = before.formatRules ?? [];
  const rulesAfter = after.formatRules ?? [];
  if (JSON.stringify(rulesBefore) !== JSON.stringify(rulesAfter)) {
    // Rules only added at the end are written as additions; anything else starts from a clean slate
    const appended = JSON.stringify(rulesAfter.slice(0, rulesBefore.length)) === JSON.stringify(rulesBefore);
    if (!appended) steps.push({ op: 'clearFormats', field: null });
    for (const { id: _id, ...rule } of appended ? rulesAfter.slice(rulesBefore.length) : rulesAfter) {
      steps.push({ op: 'format', rule: { ...rule, field: rule.field === '*' ? '*' : name(rule.field) } });
    }
  }
  return steps;
}

/** Rebuilds macros from untrusted input — a stored layout or a shared view */
export function weGridSanitizeMacros(input: unknown): WeGridMacro[] {
  if (!Array.isArray(input)) return [];
  const out: WeGridMacro[] = [];
  for (const item of input.slice(0, MAX_MACROS)) {
    if (typeof item !== 'object' || item === null) continue;
    const { id, name, script, pinned } = item as Record<string, unknown>;
    if (typeof id !== 'string' || typeof name !== 'string' || typeof script !== 'string') continue;
    if (out.some((m) => m.id === id)) continue;
    const macro: WeGridMacro = { id: id.slice(0, 50), name: name.trim().slice(0, 80) || id, script: script.slice(0, 20000) };
    if (pinned === true) macro.pinned = true;
    out.push(macro);
  }
  return out;
}
