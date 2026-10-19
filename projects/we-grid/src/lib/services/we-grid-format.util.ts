import { WE_GRID_FORMAT_COLORS, WeGridCellStyle, WeGridFormatColor, WeGridFormatIconSet, WeGridFormatOperator, WeGridFormatRule } from '../models/we-grid-format.model';

/** Inline CSS for one cell, ready for `[ngStyle]` — only `var(--we-grid-format-*)` colours, never a literal */
export type WeGridCellCss = Record<string, string>;

/** Evaluates a `'formula'` rule for a row — the grid passes its formula engine in */
export type WeGridFormatFormulaFn<T> = (source: string, row: T) => unknown;

const OPERATORS = new Set<WeGridFormatOperator>([
  'gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'between', 'notBetween', 'contains', 'notContains', 'startsWith', 'endsWith',
  'empty', 'notEmpty', 'top', 'bottom', 'aboveAverage', 'belowAverage', 'duplicate', 'unique', 'formula'
]);
const MAX_RULES = 100;
const MAX_TEXT = 500;

/** Light-theme values, the fallback when no theme file is loaded — see styles/we-grid-theme.scss */
const FALLBACK: Record<WeGridFormatColor, [string, string]> = {
  red: ['#c41e16', '#ffe5e3'],
  orange: ['#b35900', '#ffedd9'],
  yellow: ['#8a6d00', '#fff6cc'],
  green: ['#1e7a35', '#e1f6e6'],
  teal: ['#0b7285', '#dcf3f7'],
  blue: ['#0a5cc2', '#e0edff'],
  purple: ['#7e3bb0', '#f1e6fb'],
  pink: ['#b5235f', '#fde4ee'],
  gray: ['#545961', '#eceef1']
};

/** A palette colour's text variable */
export function weGridFormatFg(color: WeGridFormatColor): string {
  return `var(--we-grid-format-${color}-fg, ${FALLBACK[color][0]})`;
}

/** A palette colour's fill variable */
export function weGridFormatBg(color: WeGridFormatColor): string {
  return `var(--we-grid-format-${color}-bg, ${FALLBACK[color][1]})`;
}

/**
 * Turns a style into CSS. A fill is layered over the grid background rather than replacing it: the
 * palette fills are translucent in the dark theme, and a pinned cell must stay opaque while the
 * other columns scroll underneath it.
 */
export function weGridCellStyleCss(style: WeGridCellStyle | null | undefined): WeGridCellCss {
  const css: WeGridCellCss = {};
  if (!style) return css;
  if (style.bold) css['font-weight'] = '600';
  if (style.italic) css['font-style'] = 'italic';
  const decorations = [style.underline ? 'underline' : '', style.strike ? 'line-through' : ''].filter(Boolean);
  if (decorations.length) css['text-decoration'] = decorations.join(' ');
  // Checked here too, not only when sanitising: a style reaches this sink from the column definition and the layout store as well
  if (isFormatColor(style.color)) css['color'] = weGridFormatFg(style.color);
  if (isFormatColor(style.fill)) css['background'] = layered(weGridFormatBg(style.fill));
  return css;
}

function layered(color: string): string {
  return `linear-gradient(${color}, ${color}), var(--we-grid-bg, #fff)`;
}

/** Statistics a rule needs about its column — computed once per rule per data change */
interface RuleStats {
  numbers: number[];
  min: number;
  max: number;
  avg: number;
  /** For top/bottom: the value a cell must reach (>=, or <= for bottom) */
  threshold: number;
  counts: Map<string, number>;
}

/**
 * Resolves every cell's formatting for the rows on screen. The result maps a row to its fields'
 * CSS; rows and fields with no formatting are absent, so the template binds `null` for them.
 *
 * `columnStyles` are the columns' base styles; rules are layered on top, the first rule in the list
 * winning for each property it sets. A row-scoped rule styles every column of the row.
 */
export function weGridResolveFormats<T>(
  rows: readonly T[],
  rules: readonly WeGridFormatRule[],
  fields: readonly string[],
  read: (row: T, field: string) => unknown,
  columnStyles: ReadonlyMap<string, WeGridCellStyle> = new Map(),
  formula?: WeGridFormatFormulaFn<T>
): Map<T, Record<string, WeGridCellCss>> {
  const result = new Map<T, Record<string, WeGridCellCss>>();
  const active = rules.filter((r) => fields.includes(r.field));
  if (active.length === 0 && columnStyles.size === 0) return result;

  const stats = new Map<WeGridFormatRule, RuleStats>();
  for (const rule of active) stats.set(rule, computeStats(rows, rule, read));

  for (const row of rows) {
    const cells: Record<string, WeGridCellCss> = {};
    // Last rule first, so earlier rules overwrite what later ones set
    const cellStyles = new Map<string, WeGridCellStyle>();
    const rowStyle: WeGridCellStyle = {};
    const extras = new Map<string, WeGridCellCss>();
    const icons = new Map<string, WeGridCellCss>();
    for (let i = active.length - 1; i >= 0; i--) {
      const rule = active[i];
      const value = read(row, rule.field);
      const s = stats.get(rule)!;
      if (rule.type === 'colorScale') {
        const css = colorScaleCss(rule, value, s);
        if (css) extras.set(rule.field, { ...(extras.get(rule.field) ?? {}), ...css });
      } else if (rule.type === 'dataBar') {
        const css = dataBarCss(rule, value, s);
        if (css) extras.set(rule.field, { ...(extras.get(rule.field) ?? {}), ...css });
      } else if (rule.type === 'iconSet') {
        const css = iconCss(rule, value, s);
        if (css) icons.set(rule.field, css);
      } else if (rule.style && matches(rule, value, row, s, formula)) {
        if (rule.applyTo === 'row') Object.assign(rowStyle, definedOnly(rule.style));
        else cellStyles.set(rule.field, { ...(cellStyles.get(rule.field) ?? {}), ...definedOnly(rule.style) });
      }
    }
    for (const field of fields) {
      const cellStyle = cellStyles.get(field) ?? {};
      const css = weGridCellStyleCss({ ...(columnStyles.get(field) ?? {}), ...rowStyle, ...cellStyle });
      // A colour scale or bar beats the column's fill, a matching rule's fill beats both
      if (!cellStyle.fill && !rowStyle.fill) Object.assign(css, extras.get(field));
      Object.assign(css, icons.get(field));
      if (Object.keys(css).length) cells[field] = css;
    }
    if (Object.keys(cells).length) result.set(row, cells);
  }
  return result;
}

function definedOnly(style: WeGridCellStyle): WeGridCellStyle {
  return Object.fromEntries(Object.entries(style).filter(([, v]) => v !== undefined && v !== false)) as WeGridCellStyle;
}

function computeStats<T>(rows: readonly T[], rule: WeGridFormatRule, read: (row: T, field: string) => unknown): RuleStats {
  const numbers: number[] = [];
  const counts = new Map<string, number>();
  const needsCounts = rule.operator === 'duplicate' || rule.operator === 'unique';
  for (const row of rows) {
    const value = read(row, rule.field);
    const n = toNumber(value);
    if (n !== null) numbers.push(n);
    if (needsCounts && !isEmpty(value)) {
      const key = textKey(value);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const n of numbers) {
    if (n < min) min = n;
    if (n > max) max = n;
    sum += n;
  }
  let threshold = NaN;
  if ((rule.operator === 'top' || rule.operator === 'bottom') && numbers.length) {
    const take = Math.max(1, Math.floor(toNumber(rule.value) ?? 10));
    const sorted = [...numbers].sort((a, b) => (rule.operator === 'top' ? b - a : a - b));
    threshold = sorted[Math.min(take, sorted.length) - 1];
  }
  return { numbers, min, max, avg: numbers.length ? sum / numbers.length : NaN, threshold, counts };
}

function matches<T>(rule: WeGridFormatRule, value: unknown, row: T, s: RuleStats, formula?: WeGridFormatFormulaFn<T>): boolean {
  const op = rule.operator ?? 'eq';
  switch (op) {
    case 'empty':
      return isEmpty(value);
    case 'notEmpty':
      return !isEmpty(value);
    case 'contains':
      return !isEmpty(value) && lower(value).includes(lower(rule.value));
    case 'notContains':
      return !lower(value).includes(lower(rule.value));
    case 'startsWith':
      return !isEmpty(value) && lower(value).startsWith(lower(rule.value));
    case 'endsWith':
      return !isEmpty(value) && lower(value).endsWith(lower(rule.value));
    case 'top': {
      const n = toNumber(value);
      return n !== null && n >= s.threshold;
    }
    case 'bottom': {
      const n = toNumber(value);
      return n !== null && n <= s.threshold;
    }
    case 'aboveAverage': {
      const n = toNumber(value);
      return n !== null && n > s.avg;
    }
    case 'belowAverage': {
      const n = toNumber(value);
      return n !== null && n < s.avg;
    }
    case 'duplicate':
      return !isEmpty(value) && (s.counts.get(textKey(value)) ?? 0) > 1;
    case 'unique':
      return !isEmpty(value) && s.counts.get(textKey(value)) === 1;
    case 'formula': {
      if (!formula || typeof rule.value !== 'string') return false;
      const result = formula(rule.value, row);
      return result === true || (typeof result === 'number' && result !== 0 && Number.isFinite(result));
    }
    case 'between':
    case 'notBetween': {
      if (isEmpty(value)) return false;
      const lo = compare(value, rule.value);
      const hi = compare(value, rule.value2);
      if (lo === null || hi === null) return false;
      const inside = lo >= 0 && hi <= 0;
      return op === 'between' ? inside : !inside;
    }
    default: {
      if (isEmpty(value)) return op === 'neq' && !isEmpty(rule.value);
      const c = compare(value, rule.value);
      if (c === null) return false;
      return op === 'gt' ? c > 0 : op === 'gte' ? c >= 0 : op === 'lt' ? c < 0 : op === 'lte' ? c <= 0 : op === 'eq' ? c === 0 : c !== 0;
    }
  }
}

function colorScaleCss(rule: WeGridFormatRule, value: unknown, s: RuleStats): WeGridCellCss | null {
  const n = toNumber(value);
  const colors = (rule.colors ?? []).filter(isFormatColor);
  if (n === null || colors.length < 2 || !Number.isFinite(s.min)) return null;
  const t = s.max === s.min ? 1 : (n - s.min) / (s.max - s.min);
  let mix: string;
  if (colors.length >= 3) {
    const [low, mid, high] = colors;
    mix = t <= 0.5 ? mixColors(weGridFormatFg(mid), weGridFormatFg(low), t * 2) : mixColors(weGridFormatFg(high), weGridFormatFg(mid), (t - 0.5) * 2);
  } else {
    mix = mixColors(weGridFormatFg(colors[1]), weGridFormatFg(colors[0]), t);
  }
  return { background: layered(`color-mix(in srgb, ${mix} 32%, transparent)`) };
}

function dataBarCss(rule: WeGridFormatRule, value: unknown, s: RuleStats): WeGridCellCss | null {
  const n = toNumber(value);
  if (n === null || !rule.color || !isFormatColor(rule.color) || !Number.isFinite(s.max)) return null;
  // Bars grow from zero, so an all-positive column starts at an empty bar for its smallest value only when it is 0
  const low = Math.min(0, s.min);
  const span = Math.max(s.max, 0) - low;
  const pct = span === 0 ? 100 : Math.round(((n - low) / span) * 1000) / 10;
  const bar = `color-mix(in srgb, ${weGridFormatFg(rule.color)} 30%, transparent)`;
  return { background: `linear-gradient(to right, ${bar} ${pct}%, transparent ${pct}%), var(--we-grid-bg, #fff)` };
}

/** Colourless shapes, used as a CSS mask so the colour comes from the theme */
const ICON_SHAPES: Record<WeGridFormatIconSet, [string, string, string]> = {
  arrows: ['M8 2 14 9H10V14H6V9H2Z', 'M14 8 7 2V6H2V10H7V14Z', 'M8 14 2 7H6V2H10V7H14Z'],
  dots: ['M8 2A6 6 0 1 0 8 14A6 6 0 1 0 8 2Z', 'M8 2A6 6 0 1 0 8 14A6 6 0 1 0 8 2Z', 'M8 2A6 6 0 1 0 8 14A6 6 0 1 0 8 2Z']
};

function iconMask(path: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='${path}'/></svg>`)}")`;
}

function iconCss(rule: WeGridFormatRule, value: unknown, s: RuleStats): WeGridCellCss | null {
  const n = toNumber(value);
  const set = rule.icons === 'dots' ? 'dots' : 'arrows';
  if (n === null || !Number.isFinite(s.min)) return null;
  const t = s.max === s.min ? 1 : (n - s.min) / (s.max - s.min);
  const level = t >= 2 / 3 ? 0 : t >= 1 / 3 ? 1 : 2;
  const colors: WeGridFormatColor[] = rule.reverse ? ['red', 'yellow', 'green'] : ['green', 'yellow', 'red'];
  // Read by the `--we-grid-cell-icon` rule in the grid's stylesheet, which draws the icon before the text
  return { '--we-grid-cell-icon': iconMask(ICON_SHAPES[set][level]), '--we-grid-cell-icon-color': weGridFormatFg(colors[level]) };
}

/** `share` of `a` mixed into `b`, as CSS */
function mixColors(a: string, b: string, share: number): string {
  const pct = Math.round(Math.min(1, Math.max(0, share)) * 100);
  return `color-mix(in srgb, ${a} ${pct}%, ${b})`;
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

function lower(value: unknown): string {
  return isEmpty(value) ? '' : String(value).toLocaleLowerCase();
}

function textKey(value: unknown): string {
  return value instanceof Date ? String(value.getTime()) : lower(value);
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

/** Numbers and dates compare numerically, everything else as case-insensitive text; null when `b` is missing */
function compare(a: unknown, b: unknown): number | null {
  if (isEmpty(b)) return null;
  const na = toNumber(a);
  let nb = toNumber(b);
  if (a instanceof Date && nb === null && typeof b === 'string') {
    const parsed = new Date(b).getTime();
    nb = Number.isNaN(parsed) ? null : parsed;
  }
  if (na !== null && nb !== null) return na === nb ? 0 : na > nb ? 1 : -1;
  return lower(a).localeCompare(lower(b));
}

function isFormatColor(value: unknown): value is WeGridFormatColor {
  return typeof value === 'string' && (WE_GRID_FORMAT_COLORS as readonly string[]).includes(value);
}

/** Rebuilds a style from untrusted input — a stored layout or a shared view link */
export function weGridSanitizeCellStyle(input: unknown): WeGridCellStyle | undefined {
  if (!isRecord(input)) return undefined;
  const style: WeGridCellStyle = {};
  for (const key of ['bold', 'italic', 'underline', 'strike'] as const) if (input[key] === true) style[key] = true;
  if (isFormatColor(input['color'])) style.color = input['color'];
  if (isFormatColor(input['fill'])) style.fill = input['fill'];
  return Object.keys(style).length ? style : undefined;
}

/** Rebuilds a rule list from untrusted input, dropping anything that is not a well-formed rule */
export function weGridSanitizeFormatRules(input: unknown): WeGridFormatRule[] {
  if (!Array.isArray(input)) return [];
  const rules: WeGridFormatRule[] = [];
  for (const item of input.slice(0, MAX_RULES)) {
    if (!isRecord(item) || typeof item['id'] !== 'string' || typeof item['field'] !== 'string') continue;
    const type = item['type'];
    if (type !== 'condition' && type !== 'colorScale' && type !== 'dataBar' && type !== 'iconSet') continue;
    const rule: WeGridFormatRule = { id: item['id'].slice(0, 100), field: item['field'], type };
    if (type === 'condition') {
      if (!OPERATORS.has(item['operator'] as WeGridFormatOperator)) continue;
      rule.operator = item['operator'] as WeGridFormatOperator;
      const style = weGridSanitizeCellStyle(item['style']);
      if (!style) continue;
      rule.style = style;
      if (item['applyTo'] === 'row') rule.applyTo = 'row';
    }
    if (type === 'colorScale') {
      const colors = Array.isArray(item['colors']) ? item['colors'].filter(isFormatColor).slice(0, 3) : [];
      if (colors.length < 2) continue;
      rule.colors = colors;
    }
    if (type === 'dataBar') {
      if (!isFormatColor(item['color'])) continue;
      rule.color = item['color'];
    }
    if (type === 'iconSet') {
      rule.icons = item['icons'] === 'dots' ? 'dots' : 'arrows';
      if (item['reverse'] === true) rule.reverse = true;
    }
    for (const key of ['value', 'value2'] as const) {
      const v = item[key];
      if (typeof v === 'number' && Number.isFinite(v)) rule[key] = v;
      else if (typeof v === 'string') rule[key] = v.slice(0, MAX_TEXT);
    }
    rules.push(rule);
  }
  return rules;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
