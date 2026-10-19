import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Inject,
  Input,
  NgZone,
  OnChanges,
  OnDestroy
} from '@angular/core';
import { WE_GRID_LOCALE, WeGridLocale } from '../models/we-grid-locale.model';
import {
  WE_CHART_MAX_SERIES,
  WeChartData,
  WeChartType,
  weChartArc,
  weChartBarPath,
  weChartColor,
  weChartFold,
  weChartTicks
} from './we-chart.util';

interface Mark {
  /** SVG path of the mark */
  d: string;
  color: string;
  series: number;
  category: number;
}

interface Hit {
  x: number;
  y: number;
  w: number;
  h: number;
  category: number;
  series: number | null;
}

/**
 * `<we-chart>` — column, bar, line, area, pie and donut charts in plain SVG, themed by the grid's
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

  width = 600;
  shown: WeChartData = { categories: [], series: [] };
  marks: Mark[] = [];
  lines: { d: string; area: string | null; color: string; series: number }[] = [];
  dots: { x: number; y: number; color: string }[] = [];
  hits: Hit[] = [];
  ticks: { value: number; pos: number; label: string }[] = [];
  xLabels: { pos: number; text: string; anchor: 'middle' | 'end' }[] = [];
  plot = { left: 0, top: 12, right: 0, bottom: 0 };
  baseline = 0;
  hover: { x: number; y: number; category: number; series: number | null } | null = null;
  total = 0;

  private observer?: ResizeObserver;

  constructor(
    @Inject(WE_GRID_LOCALE) readonly locale: WeGridLocale,
    private readonly host: ElementRef<HTMLElement>,
    private readonly zone: NgZone,
    private readonly cdr: ChangeDetectorRef
  ) {}

  get isPie(): boolean {
    return this.type === 'pie' || this.type === 'donut';
  }

  get horizontal(): boolean {
    return this.type === 'bar';
  }

  /** Legend entries — series, or for a pie the categories */
  get legend(): { label: string; color: string }[] {
    if (this.isPie) return this.shown.categories.map((label, i) => ({ label, color: weChartColor(i) }));
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
  }

  toggleTable(): void {
    this.showTable = !this.showTable;
  }

  private layout(): void {
    const otherLabel = this.locale.chartOther;
    this.shown = this.isPie
      ? weChartFold({ categories: this.data.categories, series: this.data.series.slice(0, 1) }, WE_CHART_MAX_SERIES, otherLabel, true)
      : weChartFold(this.data, WE_CHART_MAX_SERIES, otherLabel);
    this.marks = [];
    this.lines = [];
    this.dots = [];
    this.hits = [];
    this.ticks = [];
    this.xLabels = [];
    this.hover = null;
    if (!this.shown.categories.length || !this.shown.series.length) return;
    if (this.isPie) this.layoutPie();
    else this.layoutCartesian();
  }

  private layoutPie(): void {
    const values = this.shown.series[0].values.map((v) => (v && v > 0 ? v : 0));
    this.total = values.reduce((a, b) => a + b, 0);
    const r = Math.max(20, Math.min(this.height, this.width) / 2 - 12);
    const cx = this.width / 2;
    const cy = this.height / 2;
    const inner = this.type === 'donut' ? r * 0.6 : 0;
    let angle = 0;
    values.forEach((v, i) => {
      if (!this.total || !v) return;
      const sweep = (v / this.total) * Math.PI * 2;
      this.marks.push({ d: weChartArc(cx, cy, r, inner, angle, angle + sweep), color: weChartColor(i), series: 0, category: i });
      const mid = angle + sweep / 2;
      this.hits.push({ x: cx + Math.sin(mid) * r * 0.7 - 1, y: cy - Math.cos(mid) * r * 0.7, w: 2, h: 2, category: i, series: 0 });
      angle += sweep;
    });
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
    const tickValues = weChartTicks(min, max);
    const lo = tickValues[0];
    const hi = tickValues[tickValues.length - 1];
    const compact = new Intl.NumberFormat(this.locale.intlLocale, { notation: 'compact', maximumFractionDigits: 1 });
    const tickLabels = tickValues.map((t) => compact.format(t));
    const labelChars = Math.max(...tickLabels.map((l) => l.length));
    const catChars = Math.min(18, Math.max(...categories.map((c) => c.length)));

    if (this.horizontal) {
      this.plot = { left: Math.min(this.width * 0.35, 8 + catChars * 6.5), top: 8, right: this.width - 16, bottom: this.height - 24 };
    } else {
      this.plot = { left: 10 + labelChars * 7, top: 12, right: this.width - 12, bottom: this.height - 28 };
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
        if (n <= 40) this.dots.push({ x, y, color: weChartColor(i) });
      }
      const area = this.type === 'area' && top.length > 1 ? `M${[...top, ...bottom].map(([x, y]) => `${x},${y}`).join(' L')} Z` : null;
      this.lines.push({ d: d.trim(), area, color: weChartColor(i), series: i });
    });
    for (let c = 0; c < n; c++) this.hits.push({ x: bandStart(c), y: p.top, w: bandLen, h: p.bottom - p.top, category: c, series: null });
  }
}
