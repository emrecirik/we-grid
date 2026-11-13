import { FlexibleConnectedPositionStrategy, Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EmbeddedViewRef,
  EventEmitter,
  Inject,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  TemplateRef,
  ViewChild,
  ViewContainerRef
} from '@angular/core';
import { WE_GRID_LOCALE, WeGridLocale } from '../models/we-grid-locale.model';
import {
  WE_CHART_MAX_SERIES,
  WeChartData,
  WeChartPointClickEvent,
  WeChartType,
  weChartArc,
  weChartBarLabelFits,
  weChartBarPath,
  weChartColor,
  weChartColumnLabelFits,
  weChartFold,
  weChartLabelCollides,
  weChartLabelColor,
  weChartLabelFitsInside,
  weChartLabelWidth,
  weChartPieLabelFits,
  weChartRoundRect,
  weChartStackedLabelFits,
  weChartStatusColor,
  weChartTicks
} from './we-chart.util';

interface Mark {
  /** SVG path of the mark */
  d: string;
  color: string;
  series: number;
  category: number;
}

interface ValueLabel {
  x: number;
  y: number;
  text: string;
  anchor: 'start' | 'middle' | 'end';
  /** Set only when the label sits inside a coloured mark and needs contrasting text */
  color?: string;
  /** Extra class — the big centre value of a gauge or donut, its caption, progress row texts */
  cls?: string;
}

interface Hit {
  x: number;
  y: number;
  w: number;
  h: number;
  category: number;
  series: number | null;
}

const PIE_LIKE: readonly WeChartType[] = ['pie', 'donut', 'radialBar', 'funnel'];
const SPARKLINE_HEIGHT = 40;

/**
 * `<we-chart>` — column, bar, line, area, pie, donut, gauge, radial bar, progress, funnel and
 * sparkline charts in plain SVG, themed by the grid's
 * CSS variables (`--we-grid-chart-1` … `-8`). Hovering shows the values, the legend names every
 * series, and a table view carries the same numbers for screen readers and print.
 */
@Component({
  selector: 'we-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './we-chart.component.html',
  styleUrls: ['./we-chart.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WeChartComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() type: WeChartType = 'column';
  @Input() data: WeChartData = { categories: [], series: [] };
  /** Stack the series (column, bar, area) instead of placing them side by side */
  @Input() stacked = false;
  /** Shown above the chart; also the chart's accessible name */
  @Input() title = '';
  @Input() height = 300;
  /** Value text in tooltips, labels and the table — the locale's number format otherwise */
  @Input() valueFormatter?: (value: number) => string;
  /** Start in the table view */
  @Input() showTable = false;
  /** Draw each data point's value on the chart, using `valueFormatter` */
  @Input() showValues = false;
  /** Gauge, radial bar and progress (without a target series): the value of a full arc/bar — the data's own maximum otherwise */
  @Input() max?: number;
  /** Gauge: the target, marked on the arc; the arc turns green at ≥ 100%, amber at ≥ 70%, red below */
  @Input() target?: number;
  /** Donut: show the total in the middle, with this caption under it (`''` for the total alone) */
  @Input() centerLabel?: string;

  /** A mark (bar, point, slice, ring, row, funnel step) or a category band was clicked, or Enter pressed on it */
  @Output() pointClick = new EventEmitter<WeChartPointClickEvent>();

  @ViewChild('tipTpl', { static: true }) private tipTpl?: TemplateRef<unknown>;

  width = 600;
  shown: WeChartData = { categories: [], series: [] };
  marks: Mark[] = [];
  lines: { d: string; area: string | null; color: string; series: number }[] = [];
  dots: { x: number; y: number; color: string; series: number; category: number }[] = [];
  /** Background rails of gauge, radial bar and progress — and target markers */
  tracks: { d: string; target?: boolean }[] = [];
  labels: ValueLabel[] = [];
  hits: Hit[] = [];
  ticks: { value: number; pos: number; label: string }[] = [];
  xLabels: { pos: number; text: string; anchor: 'middle' | 'end' }[] = [];
  plot = { left: 0, top: 12, right: 0, bottom: 0 };
  baseline = 0;
  hover: { x: number; y: number; category: number; series: number | null } | null = null;
  total = 0;
  /** The drawn height — `height`, or 40px for a sparkline left at the default height */
  h = 300;

  private observer?: ResizeObserver;
  /** The tooltip lives in the CDK overlay container on `body`, so no `overflow` or `transform` ancestor clips or offsets it */
  private tipRef?: OverlayRef;
  private tipPosition?: FlexibleConnectedPositionStrategy;
  private tipView?: EmbeddedViewRef<unknown>;
  // The tooltip sits at fixed viewport coordinates — any scroll or resize hides it rather than leave it behind
  private readonly onViewportChange = () =>
    this.zone.run(() => {
      this.hideTip();
      this.cdr.markForCheck();
    });

  constructor(
    @Inject(WE_GRID_LOCALE) readonly locale: WeGridLocale,
    private readonly host: ElementRef<HTMLElement>,
    private readonly zone: NgZone,
    private readonly cdr: ChangeDetectorRef,
    private readonly overlay: Overlay,
    private readonly viewContainerRef: ViewContainerRef
  ) {}

  get isPie(): boolean {
    return this.type === 'pie' || this.type === 'donut';
  }

  /** One series over categories, coloured by category: pie, donut, radial bar, funnel */
  get categorical(): boolean {
    return PIE_LIKE.includes(this.type);
  }

  /** Charts with value and category axes */
  get axes(): boolean {
    return this.type === 'column' || this.type === 'bar' || this.type === 'line' || this.type === 'area';
  }

  get clickable(): boolean {
    return this.pointClick.observed;
  }

  get horizontal(): boolean {
    return this.type === 'bar';
  }

  /** Legend entries — series, or for a pie the categories */
  get legend(): { label: string; color: string }[] {
    if (this.categorical) return this.shown.categories.map((label, i) => ({ label, color: weChartColor(i) }));
    if (this.type === 'gauge' || this.type === 'progress' || this.type === 'sparkline') return [];
    return this.shown.series.length > 1 ? this.shown.series.map((s, i) => ({ label: s.name, color: weChartColor(i) })) : [];
  }

  ngOnChanges(): void {
    this.layout();
  }

  ngAfterViewInit(): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.observer = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (w > 0 && Math.abs(w - this.width) > 1) {
        this.zone.run(() => {
          this.width = w;
          this.layout();
          this.cdr.markForCheck();
        });
      }
    });
    this.observer.observe(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.hideTip();
    this.tipRef?.dispose();
  }

  format(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    return this.valueFormatter ? this.valueFormatter(value) : new Intl.NumberFormat(this.locale.intlLocale, { maximumFractionDigits: 2 }).format(value);
  }

  share(value: number | null): string {
    if (!value || !this.total) return '';
    return new Intl.NumberFormat(this.locale.intlLocale, { style: 'percent', maximumFractionDigits: 1 }).format(value / this.total);
  }

  color(i: number): string {
    return weChartColor(i);
  }

  onHit(hit: Hit): void {
    this.hover = { x: hit.x + hit.w / 2, y: hit.y, category: hit.category, series: hit.series };
    this.showTip();
  }

  hideTip(): void {
    this.hover = null;
    if (!this.tipRef?.hasAttached()) return;
    this.tipRef.detach();
    this.tipView = undefined;
    window.removeEventListener('scroll', this.onViewportChange, true);
    window.removeEventListener('resize', this.onViewportChange);
  }

  /** Above the hovered point, below it when there is no room, kept 8px inside the viewport */
  private showTip(): void {
    const matrix = this.host.nativeElement.querySelector('svg')?.getScreenCTM();
    if (!this.hover || !matrix || !this.tipTpl) return;
    // SVG units to viewport pixels — through the viewBox scaling and any ancestor transform
    const { x, y } = new DOMPoint(this.hover.x, this.hover.y).matrixTransform(matrix);
    const origin = { x, y };
    if (!this.tipRef || !this.tipPosition) {
      this.tipPosition = this.overlay
        .position()
        .flexibleConnectedTo(origin)
        .withPositions([
          { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -8 },
          { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 8 }
        ])
        .withFlexibleDimensions(false)
        .withPush(true)
        .withViewportMargin(8);
      this.tipRef = this.overlay.create({ positionStrategy: this.tipPosition });
      // The pane must not take the pointer, or it would end the hover it shows
      this.tipRef.overlayElement.style.pointerEvents = 'none';
    } else {
      this.tipPosition.setOrigin(origin);
    }
    if (!this.tipRef.hasAttached()) {
      this.tipView = this.tipRef.attach(new TemplatePortal(this.tipTpl, this.viewContainerRef));
      this.zone.runOutsideAngular(() => {
        window.addEventListener('scroll', this.onViewportChange, true);
        window.addEventListener('resize', this.onViewportChange);
      });
    }
    this.tipView?.detectChanges();
    this.tipRef.updatePosition();
  }

  /** Hover from a mark or dot drawn over the category bands */
  hoverCategory(category: number): void {
    const hit = this.hits.find((h) => h.category === category);
    if (hit) this.onHit(hit);
  }

  /** The click payload of category `category` — of one series, or of the whole category when `series` is null */
  point(category: number, series: number | null): WeChartPointClickEvent {
    const list = this.shown.series;
    if (this.type === 'gauge') return { category: list[0].name, series: list[0].name, value: this.total, index: 0 };
    // Progress always reports the value series — the second one is the target
    const s = series ?? (list.length === 1 || this.type === 'progress' ? 0 : null);
    const value = s !== null ? list[s].values[category] ?? 0 : list.reduce((a, x) => a + (x.values[category] ?? 0), 0);
    return { category: this.shown.categories[category], series: s !== null ? list[s].name : null, value, index: category };
  }

  pointLabel(category: number, series: number | null): string {
    const p = this.point(category, series);
    return `${p.category}${p.series && this.shown.series.length > 1 ? ` · ${p.series}` : ''}: ${this.format(p.value)}`;
  }

  onPoint(category: number, series: number | null, event?: Event): void {
    if (!this.clickable) return;
    event?.preventDefault();
    this.pointClick.emit(this.point(category, series));
  }

  toggleTable(): void {
    this.showTable = !this.showTable;
  }

  private layout(): void {
    const otherLabel = this.locale.chartOther;
    const byCategory = (count: number) => weChartFold({ categories: this.data.categories, series: this.data.series.slice(0, count) }, WE_CHART_MAX_SERIES, otherLabel, true);
    this.h = this.type === 'sparkline' && this.height === 300 ? SPARKLINE_HEIGHT : this.height;
    if (this.categorical) this.shown = byCategory(1);
    else if (this.type === 'progress') this.shown = byCategory(2);
    else if (this.type === 'gauge') this.shown = { categories: this.data.categories, series: this.data.series.slice(0, 1) };
    else this.shown = weChartFold(this.data, WE_CHART_MAX_SERIES, otherLabel);
    this.tracks = [];
    this.marks = [];
    this.lines = [];
    this.dots = [];
    this.labels = [];
    this.hits = [];
    this.ticks = [];
    this.xLabels = [];
    this.hideTip();
    if (!this.shown.categories.length || !this.shown.series.length) return;
    if (this.isPie) this.layoutPie();
    else if (this.type === 'gauge') this.layoutGauge();
    else if (this.type === 'radialBar') this.layoutRadialBar();
    else if (this.type === 'progress') this.layoutProgress();
    else if (this.type === 'funnel') this.layoutFunnel();
    else if (this.type === 'sparkline') this.layoutSparkline();
    else this.layoutCartesian();
  }

  /** A half ring from 9 to 3 o'clock — the first series' total over `max`, coloured by its share of `target` */
  private layoutGauge(): void {
    const value = this.shown.series[0].values.reduce<number>((a, v) => a + (v ?? 0), 0);
    this.total = value;
    const target = this.target;
    const ticks = weChartTicks(0, Math.max(value, target ?? 0));
    const max = this.max && this.max > 0 ? this.max : ticks[ticks.length - 1];
    const r = Math.max(24, Math.min(this.width / 2 - 12, this.h - 40));
    const inner = r * 0.72;
    const cx = this.width / 2;
    const cy = 8 + r;
    const start = -Math.PI / 2;
    const share = (v: number) => Math.min(1, Math.max(0, v / max));
    this.tracks.push({ d: weChartArc(cx, cy, r, inner, start, Math.PI / 2) });
    if (share(value) > 0) {
      this.marks.push({ d: weChartArc(cx, cy, r, inner, start, start + share(value) * Math.PI), color: weChartStatusColor(value / (target || max)), series: 0, category: 0 });
    }
    if (target !== undefined) {
      const a = start + share(target) * Math.PI;
      const at = (rad: number) => `${Math.round((cx + rad * Math.sin(a)) * 100) / 100},${Math.round((cy - rad * Math.cos(a)) * 100) / 100}`;
      this.tracks.push({ d: `M${at(inner - 4)} L${at(r + 4)}`, target: true });
    }
    this.labels.push({ x: cx, y: cy - 6, text: this.format(value), anchor: 'middle', cls: 'we-chart__center-value' });
    this.labels.push({ x: cx - (r + inner) / 2, y: cy + 16, text: this.format(0), anchor: 'middle', cls: 'we-chart__muted-label' });
    this.labels.push({ x: cx + (r + inner) / 2, y: cy + 16, text: this.format(max), anchor: 'middle', cls: 'we-chart__muted-label' });
    if (target !== undefined) this.labels.push({ x: cx, y: cy + 16, text: this.locale.chartTarget(this.format(target)), anchor: 'middle', cls: 'we-chart__muted-label' });
  }

  /** Concentric 270° rings, one per category, outermost first — the free top-left quadrant holds the value labels */
  private layoutRadialBar(): void {
    const values = this.shown.series[0].values.map((v) => (v && v > 0 ? v : 0));
    this.total = values.reduce((a, b) => a + b, 0);
    const max = this.max && this.max > 0 ? this.max : Math.max(...values) || 1;
    const outerR = Math.max(30, Math.min(this.width, this.h) / 2 - 8);
    const cx = this.width / 2;
    const cy = this.h / 2;
    const ring = (outerR - outerR * 0.3) / values.length;
    const thickness = ring * 0.75;
    const sweepMax = Math.PI * 1.5;
    values.forEach((v, i) => {
      const r = outerR - i * ring;
      const inner = r - thickness;
      this.tracks.push({ d: weChartArc(cx, cy, r, inner, 0, sweepMax) });
      const sweep = Math.min(1, v / max) * sweepMax;
      if (sweep > 0) this.marks.push({ d: weChartArc(cx, cy, r, inner, 0, sweep), color: weChartColor(i), series: 0, category: i });
      this.hits.push({ x: cx - 1, y: cy - r, w: 2, h: 2, category: i, series: 0 });
      if (this.showValues && thickness >= 11) this.labels.push({ x: cx - 6, y: cy - (r + inner) / 2 + 4, text: this.format(this.shown.series[0].values[i]), anchor: 'end' });
    });
  }

  /** One row per category: name, value and share of the target (second series) or of `max`, over a rail */
  private layoutProgress(): void {
    const [valueSeries, targetSeries] = this.shown.series;
    const n = this.shown.categories.length;
    const fallbackMax = this.max && this.max > 0 ? this.max : Math.max(...valueSeries.values.map((v) => v ?? 0)) || 1;
    const rowH = Math.min(targetSeries ? 50 : 36, this.h / n);
    // The "Target: X" line needs its own row height; when squeezed it moves next to the value
    const targetLine = !!targetSeries && rowH >= 46;
    const pct = new Intl.NumberFormat(this.locale.intlLocale, { style: 'percent', maximumFractionDigits: 0 });
    const w = this.width;
    this.shown.categories.forEach((name, c) => {
      const v = valueSeries.values[c] ?? 0;
      const t = targetSeries?.values[c] ?? 0;
      const hasTarget = t > 0;
      const ratio = v / (hasTarget ? t : fallbackMax);
      const y0 = c * rowH;
      const barY = y0 + 20;
      this.tracks.push({ d: weChartRoundRect(0, barY, w, 8) });
      const fill = Math.min(1, Math.max(0, ratio)) * w;
      if (fill > 0) this.marks.push({ d: weChartRoundRect(0, barY, fill, 8), color: hasTarget ? weChartStatusColor(ratio) : weChartColor(0), series: 0, category: c });
      this.hits.push({ x: 0, y: y0, w, h: rowH, category: c, series: null });
      const tail = hasTarget && !targetLine ? ` · ${this.locale.chartTarget(this.format(t))}` : '';
      this.labels.push({ x: 0, y: y0 + 13, text: name, anchor: 'start', cls: 'we-chart__row-label' });
      this.labels.push({ x: w, y: y0 + 13, text: `${this.format(v)}${hasTarget ? ` · ${pct.format(ratio)}` : ''}${tail}`, anchor: 'end' });
      if (hasTarget && targetLine) this.labels.push({ x: 0, y: barY + 21, text: this.locale.chartTarget(this.format(t)), anchor: 'start', cls: 'we-chart__muted-label' });
    });
  }

  /** Centred steps, widest (largest value) first */
  private layoutFunnel(): void {
    const values = this.shown.series[0].values.map((v) => (v && v > 0 ? v : 0));
    this.total = values.reduce((a, b) => a + b, 0);
    const max = Math.max(...values) || 1;
    const order = values.map((_, i) => i).sort((a, b) => values[b] - values[a]);
    const rowH = this.h / order.length;
    const barH = Math.max(4, rowH - 4);
    order.forEach((c, k) => {
      const w = Math.max(2, (values[c] / max) * this.width);
      const x = (this.width - w) / 2;
      const y = k * rowH + 2;
      this.marks.push({ d: weChartRoundRect(x, y, w, barH, 3), color: weChartColor(c), series: 0, category: c });
      this.hits.push({ x: this.width / 2 - 1, y, w: 2, h: 2, category: c, series: 0 });
      if (barH >= 14) {
        const text = this.showValues ? `${this.shown.categories[c]} · ${this.format(values[c])}` : this.shown.categories[c];
        const inside = weChartLabelWidth(text) + 8 <= w;
        this.labels.push({ x: this.width / 2, y: y + barH / 2 + 4, text, anchor: 'middle', color: inside ? weChartLabelColor(c) : undefined });
      }
    });
  }

  /** A line (the first series with a faint area) over the data's own range — no axes, no labels */
  private layoutSparkline(): void {
    const { categories, series } = this.shown;
    const n = categories.length;
    const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null && Number.isFinite(v));
    if (!all.length) return;
    let lo = Math.min(...all);
    let hi = Math.max(...all);
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }
    this.plot = { left: 2, top: 3, right: this.width - 2, bottom: this.h - 3 };
    const p = this.plot;
    const step = n > 1 ? (p.right - p.left) / (n - 1) : 0;
    const xAt = (c: number) => Math.round((n > 1 ? p.left + c * step : this.width / 2) * 10) / 10;
    const yAt = (v: number) => Math.round((p.bottom - ((v - lo) / (hi - lo)) * (p.bottom - p.top)) * 10) / 10;
    series.forEach((s, i) => {
      const pts: [number, number][] = [];
      let d = '';
      let pen = false;
      s.values.forEach((v, c) => {
        if (v === null || v === undefined) {
          pen = false;
          return;
        }
        const x = xAt(c);
        const y = yAt(v);
        d += `${pen ? 'L' : 'M'}${x},${y} `;
        pen = true;
        pts.push([x, y]);
      });
      const area = i === 0 && pts.length > 1 ? `M${pts[0][0]},${p.bottom} L${pts.map(([x, y]) => `${x},${y}`).join(' L')} L${pts[pts.length - 1][0]},${p.bottom} Z` : null;
      this.lines.push({ d: d.trim(), area, color: weChartColor(i), series: i });
    });
    const band = n > 1 ? step : this.width;
    for (let c = 0; c < n; c++) this.hits.push({ x: xAt(c) - band / 2, y: 0, w: band, h: this.h, category: c, series: null });
  }

  private layoutPie(): void {
    const values = this.shown.series[0].values.map((v) => (v && v > 0 ? v : 0));
    this.total = values.reduce((a, b) => a + b, 0);
    const r = Math.max(20, Math.min(this.h, this.width) / 2 - 12);
    const cx = this.width / 2;
    const cy = this.h / 2;
    const inner = this.type === 'donut' ? r * 0.6 : 0;
    let angle = 0;
    values.forEach((v, i) => {
      if (!this.total || !v) return;
      const sweep = (v / this.total) * Math.PI * 2;
      this.marks.push({ d: weChartArc(cx, cy, r, inner, angle, angle + sweep), color: weChartColor(i), series: 0, category: i });
      const mid = angle + sweep / 2;
      this.hits.push({ x: cx + Math.sin(mid) * r * 0.7 - 1, y: cy - Math.cos(mid) * r * 0.7, w: 2, h: 2, category: i, series: 0 });
      if (this.showValues && weChartPieLabelFits(sweep)) {
        const labelR = inner > 0 ? (r + inner) / 2 : r * 0.65;
        this.labels.push({
          x: cx + Math.sin(mid) * labelR,
          y: cy - Math.cos(mid) * labelR + 4,
          text: this.format(v),
          anchor: 'middle',
          color: weChartLabelColor(i)
        });
      }
      angle += sweep;
    });
    if (this.type === 'donut' && this.centerLabel !== undefined) {
      const caption = this.centerLabel !== '';
      this.labels.push({ x: cx, y: cy + (caption ? 2 : 8), text: this.format(this.total), anchor: 'middle', cls: 'we-chart__center-value' });
      if (caption) this.labels.push({ x: cx, y: cy + 20, text: this.centerLabel!, anchor: 'middle', cls: 'we-chart__muted-label' });
    }
  }

  private layoutCartesian(): void {
    const { categories, series } = this.shown;
    const n = categories.length;
    // Stacked totals (positive and negative separately) or the plain extremes
    let min = 0;
    let max = 0;
    for (let c = 0; c < n; c++) {
      let pos = 0;
      let neg = 0;
      for (const s of series) {
        const v = s.values[c] ?? 0;
        if (this.stacked && this.type !== 'line') {
          if (v >= 0) pos += v;
          else neg += v;
        } else {
          pos = Math.max(pos, v);
          neg = Math.min(neg, v);
        }
      }
      max = Math.max(max, pos);
      min = Math.min(min, neg);
    }
    const catChars = Math.min(18, Math.max(...categories.map((c) => c.length)));
    // Reserve room above the plot for value labels that sit above bars/dots — bar labels sit beside the bar, not above
    const topPad = this.showValues && !this.horizontal ? 14 : 0;
    // Headroom on the value axis, so the label of the largest value fits outside its bar or above its point
    if (this.showValues && max > 0 && !(this.stacked && this.horizontal)) {
      const valueLen = this.horizontal ? this.width - 16 - Math.min(this.width * 0.35, 8 + catChars * 6.5) : this.h - 40 - topPad;
      const widest = Math.max(...series.flatMap((s) => s.values.map((v) => (v && v > 0 ? weChartLabelWidth(this.format(v)) : 0))));
      const reserve = this.horizontal ? Math.min(valueLen / 2, widest + 6) : 14;
      if (valueLen > reserve) max += ((max - min) * reserve) / (valueLen - reserve);
    }
    const tickValues = weChartTicks(min, max);
    const lo = tickValues[0];
    const hi = tickValues[tickValues.length - 1];
    const compact = new Intl.NumberFormat(this.locale.intlLocale, { notation: 'compact', maximumFractionDigits: 1 });
    const tickLabels = tickValues.map((t) => compact.format(t));
    const labelChars = Math.max(...tickLabels.map((l) => l.length));
    if (this.horizontal) {
      this.plot = { left: Math.min(this.width * 0.35, 8 + catChars * 6.5), top: 8, right: this.width - 16, bottom: this.h - 24 };
    } else {
      this.plot = { left: 10 + labelChars * 7, top: 12 + topPad, right: this.width - 12, bottom: this.h - 28 };
    }
    const p = this.plot;
    const valueLen = this.horizontal ? p.right - p.left : p.bottom - p.top;
    const toPos = (v: number) => (this.horizontal ? p.left + ((v - lo) / (hi - lo)) * valueLen : p.bottom - ((v - lo) / (hi - lo)) * valueLen);
    this.baseline = toPos(0);
    this.ticks = tickValues.map((value, i) => ({ value, pos: toPos(value), label: tickLabels[i] }));

    const bandLen = (this.horizontal ? p.bottom - p.top : p.right - p.left) / n;
    const bandStart = (c: number) => (this.horizontal ? p.top : p.left) + c * bandLen;

    // Category labels — thinned out so they never collide
    const labelRoom = this.horizontal ? 16 : Math.min(120, catChars * 6.5 + 8);
    const every = Math.max(1, Math.ceil(labelRoom / bandLen));
    categories.forEach((text, c) => {
      if (c % every) return;
      this.xLabels.push({ pos: bandStart(c) + bandLen / 2, text: text.length > 18 ? `${text.slice(0, 17)}…` : text, anchor: this.horizontal ? 'end' : 'middle' });
    });

    if (this.type === 'column' || this.type === 'bar') {
      const groups = this.stacked ? 1 : series.length;
      const thickness = Math.max(2, Math.min(24, (bandLen * 0.72) / groups - 2));
      for (let c = 0; c < n; c++) {
        const groupWidth = groups * thickness + (groups - 1) * 2;
        const start = bandStart(c) + (bandLen - groupWidth) / 2;
        let posAcc = 0;
        let negAcc = 0;
        series.forEach((s, i) => {
          const v = s.values[c];
          if (v === null || v === undefined || v === 0) return;
          const across = this.stacked ? start : start + i * (thickness + 2);
          let from: number;
          let to: number;
          if (this.stacked) {
            from = v >= 0 ? posAcc : negAcc;
            to = from + v;
            if (v >= 0) posAcc = to;
            else negAcc = to;
          } else {
            from = 0;
            to = v;
          }
          // The 2px surface gap between stacked segments
          const gap = this.stacked && from !== 0 ? (v >= 0 ? 1 : -1) * ((hi - lo) / valueLen) * 2 : 0;
          const base = toPos(from + gap);
          const tip = toPos(to);
          const last = !this.stacked || i === series.length - 1 || series.slice(i + 1).every((x) => !x.values[c]);
          this.marks.push({ d: weChartBarPath(this.horizontal ? 'bar' : 'column', across, thickness, base, tip, last ? 4 : 0), color: weChartColor(i), series: i, category: c });
          if (this.showValues) this.labels.push(...this.barLabel(v, across, thickness, base, tip, i, p));
        });
        this.hits.push(
          this.horizontal
            ? { x: p.left, y: bandStart(c), w: p.right - p.left, h: bandLen, category: c, series: null }
            : { x: bandStart(c), y: p.top, w: bandLen, h: p.bottom - p.top, category: c, series: null }
        );
      }
      return;
    }

    // line / area
    const xAt = (c: number) => bandStart(c) + bandLen / 2;
    const acc = new Array(n).fill(0);
    series.forEach((s, i) => {
      let d = '';
      let pen = false;
      let prevLabelX: number | null = null;
      const top: [number, number][] = [];
      const bottom: [number, number][] = [];
      for (let c = 0; c < n; c++) {
        const v = s.values[c];
        if (v === null || v === undefined) {
          pen = false;
          continue;
        }
        const from = this.stacked && this.type === 'area' ? acc[c] : 0;
        const to = from + v;
        if (this.stacked && this.type === 'area') acc[c] = to;
        const x = Math.round(xAt(c) * 10) / 10;
        const y = Math.round(toPos(to) * 10) / 10;
        d += `${pen ? 'L' : 'M'}${x},${y} `;
        pen = true;
        top.push([x, y]);
        bottom.unshift([x, Math.round(toPos(from) * 10) / 10]);
        if (n <= 40) {
          this.dots.push({ x, y, color: weChartColor(i), series: i, category: c });
          if (this.showValues && !weChartLabelCollides(prevLabelX, x)) {
            this.labels.push({ x, y: y - 10, text: this.format(v), anchor: 'middle' });
            prevLabelX = x;
          }
        }
      }
      const area = this.type === 'area' && top.length > 1 ? `M${[...top, ...bottom].map(([x, y]) => `${x},${y}`).join(' L')} Z` : null;
      this.lines.push({ d: d.trim(), area, color: weChartColor(i), series: i });
    });
    for (let c = 0; c < n; c++) this.hits.push({ x: bandStart(c), y: p.top, w: bandLen, h: p.bottom - p.top, category: c, series: null });
  }

  /** Value label for one column/bar segment — outside the bar when there's room, else inside with contrasting text */
  private barLabel(v: number, across: number, thickness: number, base: number, tip: number, i: number, p: { left: number; top: number; right: number; bottom: number }): ValueLabel[] {
    const mid = across + thickness / 2;
    const text = this.format(v);
    const length = Math.abs(tip - base);
    if (this.stacked) {
      if (!weChartStackedLabelFits(length)) return [];
      const along = (base + tip) / 2;
      const inside = this.insideText(v, this.horizontal ? length : thickness);
      if (inside === null) return [];
      return [this.horizontal ? { x: along, y: mid + 4, text: inside, anchor: 'middle', color: weChartLabelColor(i) } : { x: mid, y: along + 4, text: inside, anchor: 'middle', color: weChartLabelColor(i) }];
    }
    const dir = tip < base ? -1 : 1;
    // shortcut: a negative value's label always sits inside near the tip — only the common positive case checks for outside room
    if (this.horizontal) {
      if (dir > 0 && weChartBarLabelFits(tip, p.right, weChartLabelWidth(text))) return [{ x: tip + 6, y: mid + 4, text, anchor: 'start' }];
      const inside = this.insideText(v, length - 6);
      return inside === null ? [] : [{ x: tip - dir * 6, y: mid + 4, text: inside, anchor: dir > 0 ? 'end' : 'start', color: weChartLabelColor(i) }];
    }
    if (dir < 0 && weChartColumnLabelFits(tip, p.top)) return [{ x: mid, y: tip - 6, text, anchor: 'middle' }];
    const inside = this.insideText(v, thickness);
    return inside === null ? [] : [{ x: mid, y: tip - dir * 10, text: inside, anchor: 'middle', color: weChartLabelColor(i) }];
  }

  /** The label inside a mark `room` px across — the full text, else the compact one (19.9M), else none: never clipped text */
  private insideText(v: number, room: number): string | null {
    const full = this.format(v);
    if (weChartLabelFitsInside(full, room)) return full;
    const short = new Intl.NumberFormat(this.locale.intlLocale, { notation: 'compact', maximumFractionDigits: 1 }).format(v);
    return weChartLabelFitsInside(short, room) ? short : null;
  }
}
