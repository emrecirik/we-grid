import { A11yModule } from '@angular/cdk/a11y';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Inject, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { WE_GRID_ICONS, WeGridIcons } from '../models/we-grid-icons.model';
import { WE_GRID_LOCALE, WeGridLocale } from '../models/we-grid-locale.model';
import { weGridDownloadBlob } from '../services/we-grid-csv.util';
import { weGridSafeIcon } from '../services/we-grid-icon.util';
import {
  WE_GRID_RANGE_CHART_TYPES,
  WeGridRangeChartAggregate,
  WeGridRangeChartResult,
  WeGridRangeChartType,
  weGridRangeChartData,
  weGridRangeChartRepeats,
  weGridRangeChartSheet
} from '../services/we-grid-range-chart.util';
import { weGridBuildXlsxWorkbook, weGridXlsxSheetName } from '../services/we-grid-xlsx.util';
import { weChartSvgToPng, weChartToSvg } from '../we-chart/we-chart-export.util';
import { WeChartComponent } from '../we-chart/we-chart.component';
import { WeChartPointClickEvent } from '../we-chart/we-chart.util';

/** A column the chart dialog can use — read through the grid, so formula columns and formatters apply */
export interface WeGridChartColumn<T> {
  field: string;
  header: string;
  /** Holds numbers — offered as a series */
  numeric: boolean;
  /** A click on its category can filter the grid */
  filterable: boolean;
  value: (row: T) => unknown;
  text: (row: T) => string;
  /** What a click on the row's category filters the grid by */
  filterValue: (row: T) => unknown;
  /** A number written the way the column writes its cells */
  format: (value: number) => string;
}

const STACKABLE: readonly WeGridRangeChartType[] = ['column', 'bar', 'line', 'area'];

/**
 * The range chart — the rows and columns of a selected block as a chart the user shapes: type,
 * category, series, how same categories combine, switched axes, values on the marks. Downloads as
 * PNG, SVG or an Excel file with a native chart; copies as an image; a click on a category can
 * filter the grid.
 */
@Component({
  selector: 'we-grid-chart-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, A11yModule, WeChartComponent],
  templateUrl: './we-grid-chart-dialog.component.html',
  styleUrls: ['../we-grid-edit-form/we-grid-edit-form.component.scss', './we-grid-chart-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WeGridChartDialogComponent<T> implements OnInit {
  @Input() rows: T[] = [];
  /** The block's columns, left to right */
  @Input() columns: WeGridChartColumn<T>[] = [];
  /** Further category choices outside the block — the grid's group columns */
  @Input() groupColumns: WeGridChartColumn<T>[] = [];
  @Input() type: WeGridRangeChartType = 'column';
  @Input() fileName = 'chart';

  @Output() closed = new EventEmitter<void>();
  /** A category was clicked while "click filters the grid" is on */
  @Output() filter = new EventEmitter<{ field: string; value: unknown }>();

  readonly types = WE_GRID_RANGE_CHART_TYPES;
  readonly aggregates: WeGridRangeChartAggregate[] = ['none', 'sum', 'avg', 'count', 'min', 'max'];

  stacked = false;
  categoryField = '';
  seriesFields = new Set<string>();
  aggregate: WeGridRangeChartAggregate = 'none';
  switched = false;
  showValues = false;
  filterOnClick = false;
  maximized = false;
  title = '';
  message: { text: string; error: boolean } | null = null;
  result: WeGridRangeChartResult = { data: { categories: [], series: [] }, raws: [] };
  /** The one charted column's own number format — several columns, switched axes or a count show plain numbers */
  valueFormatter?: (value: number) => string;

  constructor(
    @Inject(WE_GRID_LOCALE) readonly locale: WeGridLocale,
    @Inject(WE_GRID_ICONS) private readonly icons: WeGridIcons,
    private readonly sanitizer: DomSanitizer,
    private readonly host: ElementRef<HTMLElement>,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const category = this.groupColumns[0] ?? this.columns.find((c) => !c.numeric);
    this.categoryField = category?.field ?? '';
    for (const c of this.columns) if (c.numeric && c.field !== this.categoryField) this.seriesFields.add(c.field);
    this.aggregate = category && weGridRangeChartRepeats(this.rows, category.text) ? 'sum' : 'none';
    this.title = this.columns.filter((c) => this.seriesFields.has(c.field)).map((c) => c.header).join(', ');
    this.rebuild();
  }

  /** Every column a category can come from: group columns first, then the block's */
  get categoryColumns(): WeGridChartColumn<T>[] {
    return [...this.groupColumns, ...this.columns.filter((c) => !this.groupColumns.some((g) => g.field === c.field))];
  }

  get seriesColumns(): WeGridChartColumn<T>[] {
    return this.columns.filter((c) => c.numeric && c.field !== this.categoryField);
  }

  get category(): WeGridChartColumn<T> | undefined {
    return this.categoryColumns.find((c) => c.field === this.categoryField);
  }

  get stackable(): boolean {
    return STACKABLE.includes(this.type);
  }

  /** A click can filter only on a real, filterable category, one point per category */
  get canFilter(): boolean {
    return !!this.category?.filterable && !this.switched && this.result.raws.length > 0;
  }

  get chartHeight(): number {
    if (!this.maximized || typeof window === 'undefined') return 340;
    return Math.max(340, window.innerHeight - 220);
  }

  aggregateLabel(a: WeGridRangeChartAggregate): string {
    const labels: Record<WeGridRangeChartAggregate, string> = {
      none: this.locale.chartCombineNone,
      sum: this.locale.sum,
      avg: this.locale.average,
      count: this.locale.count,
      min: this.locale.min,
      max: this.locale.max
    };
    return labels[a];
  }

  setType(type: WeGridRangeChartType): void {
    this.type = type;
    this.rebuild();
  }

  toggleSeries(field: string, on: boolean): void {
    if (on) this.seriesFields.add(field);
    else this.seriesFields.delete(field);
    this.rebuild();
  }

  setCategory(field: string): void {
    this.categoryField = field;
    this.seriesFields.delete(field);
    const category = this.category;
    if (!category) this.aggregate = 'none';
    else if (this.aggregate === 'none' && weGridRangeChartRepeats(this.rows, category.text)) this.aggregate = 'sum';
    this.rebuild();
  }

  rebuild(): void {
    const category = this.category;
    const series = this.seriesColumns.filter((c) => this.seriesFields.has(c.field));
    // A count is a number of rows, not an amount in the column's units
    this.valueFormatter = series.length === 1 && !this.switched && !(category && this.aggregate === 'count') ? series[0].format : undefined;
    this.result = weGridRangeChartData(this.rows, {
      category: category ? { label: category.text, raw: category.filterValue } : null,
      series: series.map((c) => ({ name: c.header, value: c.value })),
      aggregate: category ? this.aggregate : 'none',
      switched: this.switched
    });
    if (!this.canFilter) this.filterOnClick = false;
    this.cdr.markForCheck();
  }

  onPointClick(event: WeChartPointClickEvent): void {
    const category = this.category;
    if (!this.filterOnClick || !this.canFilter || !category) return;
    this.filter.emit({ field: category.field, value: this.result.raws[event.index] });
    this.say(this.locale.chartFiltered(category.header, event.category), false);
  }

  async downloadPng(): Promise<void> {
    const blob = await this.png();
    if (blob) weGridDownloadBlob(blob, `${this.fileName}.png`);
  }

  downloadSvg(): void {
    const image = this.svg();
    if (image) weGridDownloadBlob(new Blob([image.svg], { type: 'image/svg+xml' }), `${this.fileName}.svg`);
  }

  downloadExcel(): void {
    const sheet = weGridRangeChartSheet(weGridXlsxSheetName(this.title || this.locale.chartInsert), this.switched ? '' : (this.category?.header ?? '#'), this.result.data, this.type);
    weGridDownloadBlob(weGridBuildXlsxWorkbook([sheet]), `${this.fileName}.xlsx`);
  }

  async copyImage(): Promise<void> {
    const blob = await this.png();
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      this.say(this.locale.chartCopied, false);
    } catch {
      this.say(this.locale.chartImageFailed, true);
    }
  }

  icon(key: string): SafeHtml {
    return weGridSafeIcon(this.sanitizer, this.icons, key);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.closed.emit();
    }
  }

  private svg(): { svg: string; width: number; height: number } | null {
    const dialog = this.host.nativeElement.querySelector('.we-grid-form');
    const background = dialog ? getComputedStyle(dialog).backgroundColor : undefined;
    const chart = this.host.nativeElement.querySelector('we-chart');
    const image = chart ? weChartToSvg(chart, { background, title: this.title }) : null;
    if (!image) this.say(this.locale.chartImageFailed, true);
    return image;
  }

  private async png(): Promise<Blob | null> {
    const image = this.svg();
    if (!image) return null;
    try {
      return await weChartSvgToPng(image.svg, image.width, image.height);
    } catch {
      this.say(this.locale.chartImageFailed, true);
      return null;
    }
  }

  private say(text: string, error: boolean): void {
    this.message = { text, error };
    this.cdr.markForCheck();
  }
}
