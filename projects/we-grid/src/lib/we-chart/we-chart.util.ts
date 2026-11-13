/** The chart forms `<we-chart>` draws */
export type WeChartType = 'column' | 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'gauge' | 'radialBar' | 'progress' | 'funnel' | 'sparkline';

/**
 * `<we-chart>`'s `pointClick`. `series` is null when a whole category was clicked (the empty part
 * of a column/bar band, a line/area band) on a chart with more than one series — `value` is then
 * the category's sum. A gauge reports its one value with the series name as the category.
 */
export interface WeChartPointClickEvent {
  category: string;
  series: string | null;
  value: number;
  index: number;
}

/** One series — `values[i]` belongs to `categories[i]`; null leaves a gap */
export interface WeChartSeries {
  name: string;
  values: (number | null)[];
}

export interface WeChartData {
  categories: string[];
  series: WeChartSeries[];
}

/** Series colours come from the theme in this fixed order — `--we-grid-chart-1` … `-8` */
export const WE_CHART_MAX_SERIES = 8;

/** Light fallbacks of `--we-grid-chart-N` — see styles/we-grid-theme.scss */
const FALLBACK = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

/** The CSS colour of series slot `index` (0-based) */
export function weChartColor(index: number): string {
  const slot = Math.min(index, WE_CHART_MAX_SERIES - 1);
  return `var(--we-grid-chart-${slot + 1}, ${FALLBACK[slot]})`;
}

/**
 * Round tick values covering `min … max` — 0 always included, about `count` steps of 1, 2, 2.5 or
 * 5 × 10ⁿ, so the axis reads 0 / 500 / 1,000 rather than 0 / 437 / 874.
 */
export function weChartTicks(min: number, max: number, count = 5): number[] {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  if (lo === hi) return [0, 1];
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step * 1e-9; v += step) ticks.push(Math.round(v * 1e9) / 1e9);
  if (ticks[ticks.length - 1] < hi) ticks.push(Math.round((ticks[ticks.length - 1] + step) * 1e9) / 1e9);
  return ticks;
}

/**
 * Keeps at most `max` series; the rest are added up into one "Other" series — a ninth colour is
 * never invented. Pie and donut charts do the same with categories.
 */
export function weChartFold(data: WeChartData, max: number, otherLabel: string, byCategory = false): WeChartData {
  if (!byCategory) {
    if (data.series.length <= max) return data;
    const kept = data.series.slice(0, max - 1);
    const rest = data.series.slice(max - 1);
    const other = data.categories.map((_, i) => {
      const vs = rest.map((s) => s.values[i]).filter((v): v is number => v !== null && Number.isFinite(v));
      return vs.length ? vs.reduce((a, b) => a + b, 0) : null;
    });
    return { categories: data.categories, series: [...kept, { name: otherLabel, values: other }] };
  }
  if (data.categories.length <= max) return data;
  const series = data.series.map((s) => {
    const restSum = s.values.slice(max - 1).reduce<number>((a, v) => a + (v ?? 0), 0);
    return { name: s.name, values: [...s.values.slice(0, max - 1), restSum] };
  });
  return { categories: [...data.categories.slice(0, max - 1), otherLabel], series };
}

/** A pie or donut slice as an SVG path, angles in radians from 12 o'clock clockwise */
export function weChartArc(cx: number, cy: number, r: number, inner: number, start: number, end: number): string {
  // A full circle can't be one arc — split it in two halves
  if (end - start >= Math.PI * 2 - 1e-6) {
    const mid = start + Math.PI;
    return `${weChartArc(cx, cy, r, inner, start, mid)} ${weChartArc(cx, cy, r, inner, mid, end)}`;
  }
  const pt = (radius: number, a: number) => [cx + radius * Math.sin(a), cy - radius * Math.cos(a)].map((n) => Math.round(n * 100) / 100);
  const large = end - start > Math.PI ? 1 : 0;
  const [x1, y1] = pt(r, start);
  const [x2, y2] = pt(r, end);
  if (inner <= 0) return `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`;
  const [x3, y3] = pt(inner, end);
  const [x4, y4] = pt(inner, start);
  return `M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${inner},${inner} 0 ${large} 0 ${x4},${y4} Z`;
}

/**
 * A bar with a 4px rounded data end and a square base, as a path — vertical (`column`) or
 * horizontal (`bar`), growing from `base` towards `tip`.
 */
export function weChartBarPath(orientation: 'column' | 'bar', across: number, thickness: number, base: number, tip: number, radius = 4): string {
  const len = Math.abs(tip - base);
  const r = Math.min(radius, thickness / 2, len);
  const dir = tip < base ? -1 : 1;
  const a0 = across;
  const a1 = across + thickness;
  if (orientation === 'column') {
    // y grows downwards: a positive value has tip < base
    return `M${a0},${base} L${a0},${tip - dir * r} Q${a0},${tip} ${a0 + r},${tip} L${a1 - r},${tip} Q${a1},${tip} ${a1},${tip - dir * r} L${a1},${base} Z`;
  }
  return `M${base},${a0} L${tip - dir * r},${a0} Q${tip},${a0} ${tip},${a0 + r} L${tip},${a1 - r} Q${tip},${a1} ${tip - dir * r},${a1} L${base},${a1} Z`;
}

/** A rectangle with all four corners rounded by `radius` (clamped to fit), as a path */
export function weChartRoundRect(x: number, y: number, w: number, h: number, radius = 4): string {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  const x1 = x + w;
  const y1 = y + h;
  return `M${x + r},${y} L${x1 - r},${y} Q${x1},${y} ${x1},${y + r} L${x1},${y1 - r} Q${x1},${y1} ${x1 - r},${y1} L${x + r},${y1} Q${x},${y1} ${x},${y1 - r} L${x},${y + r} Q${x},${y} ${x + r},${y} Z`;
}

/** Status colour of a value-to-target ratio: on target (≥ 100%) success, ≥ 70% warning, below that danger */
export function weChartStatusColor(ratio: number): string {
  if (ratio >= 1) return 'var(--we-grid-success-color, #0ab39c)';
  if (ratio >= 0.7) return 'var(--we-grid-warning-color, #f7b84b)';
  return 'var(--we-grid-danger-color, #f06548)';
}

/** `rrggbb` relative luminance (WCAG formula), used only to pick readable label text */
function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const chan = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan((n >> 16) & 255) + 0.7152 * chan((n >> 8) & 255) + 0.0722 * chan(n & 255);
}

/** Readable label text colour (dark or white) over series colour `index`'s fallback hue */
export function weChartLabelColor(index: number): string {
  const slot = Math.min(index, WE_CHART_MAX_SERIES - 1);
  return relativeLuminance(FALLBACK[slot]) > 0.45 ? '#1a1a1a' : '#fff';
}

/** Whether a stacked column/bar segment is tall/wide enough (px) to hold its value label inside */
export function weChartStackedLabelFits(segmentLength: number, min = 14): boolean {
  return segmentLength >= min;
}

/** Whether a pie/donut slice is wide enough to show its value label — default threshold ~12° */
export function weChartPieLabelFits(sweepRadians: number, minDegrees = 12): boolean {
  return sweepRadians >= (minDegrees * Math.PI) / 180;
}

/** Whether a column's value label fits above the bar (needs `margin` px between the tip and the plot top) */
export function weChartColumnLabelFits(tip: number, plotTop: number, margin = 14): boolean {
  return tip - plotTop >= margin;
}

/** Whether a bar's value label fits to the right of its end, given the estimated label width */
export function weChartBarLabelFits(tip: number, plotRight: number, textWidth: number, gap = 6): boolean {
  return plotRight - tip >= textWidth + gap;
}

/** Rough label width in px for the "fits outside" checks — same character-width estimate used for axis labels */
export function weChartLabelWidth(text: string): number {
  return text.length * 6.5;
}

/** Whether a label fits inside a mark `room` px across, with 2px to spare on each side */
export function weChartLabelFitsInside(text: string, room: number): boolean {
  return weChartLabelWidth(text) + 4 <= room;
}

/** True when a line/area point label at `x` would overlap the previously placed one — skip it */
export function weChartLabelCollides(prevX: number | null, x: number, minGap = 24): boolean {
  return prevX !== null && Math.abs(x - prevX) < minGap;
}

/** Turns rows into chart data: one category per row, one series per value field */
export function weChartFromRows<T>(
  rows: readonly T[],
  categoryOf: (row: T) => string,
  series: { name: string; value: (row: T) => unknown }[]
): WeChartData {
  return {
    categories: rows.map(categoryOf),
    series: series.map((s) => ({
      name: s.name,
      values: rows.map((r) => {
        const v = s.value(r);
        return typeof v === 'number' && Number.isFinite(v) ? v : null;
      })
    }))
  };
}
