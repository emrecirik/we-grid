import { weGridSafeIcon } from '../services/we-grid-icon.util';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Inject, Input, OnChanges, OnInit, Output, ViewChild } from '@angular/core';
import { WeGridDataSource } from '../models/we-grid-data-source.model';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { WeGridColumnDef, weGridValueKind } from '../models/we-grid-column.model';
import { WeGridExportFormat } from '../models/we-grid-export.model';
import { WE_GRID_ICONS, WeGridIcons } from '../models/we-grid-icons.model';
import { WE_GRID_LOCALE, WeGridLocale } from '../models/we-grid-locale.model';
import { WeGridComponent } from '../we-grid.component';
import { WeGridFormulaError, weGridTryCompileFormula } from '../services/we-grid-formula.util';
import { getNestedValue } from '../services/we-grid-value.util';
import { WeGridCellClickEvent } from '../models/we-grid-events.model';
import { WePivotAggregate, WePivotCellClickEvent, WePivotConfig, WePivotLabels, WePivotResult, wePivot, wePivotFromGroups, wePivotGroupRequest } from './we-pivot.util';
import { WeChartComponent } from '../we-chart/we-chart.component';
import { WeChartData, WeChartType } from '../we-chart/we-chart.util';

type Zone = 'rows' | 'columns' | 'values';

/**
 * `<we-pivot>` — Excel's pivot table over any rows: pick row fields, column fields and values
 * (sum, count, average, min, max) and read the result in a we-grid with subtotals per outer row
 * group, a grand total, sorting, formatting and export.
 */
@Component({
  selector: 'we-pivot',
  standalone: true,
  imports: [CommonModule, FormsModule, WeGridComponent, WeChartComponent],
  templateUrl: './we-pivot.component.html',
  styleUrls: ['./we-pivot.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WePivotComponent<T = Record<string, unknown>> implements OnChanges, OnInit {
  /** The rows to summarise — all of them, not a page */
  @Input() data: readonly T[] = [];
  /** The fields that can be used — headers, types and formats come from here (formula columns too) */
  @Input({ required: true }) fields: WeGridColumnDef<T>[] = [];
  /**
   * Rows from a data source instead of `data` — the pivot is worked out by its `groups()` in one
   * aggregation pass, so a `WeGridColumnStore` or `WeGridWorkerStore` pivots tens of millions of
   * rows. Formula fields can't be pivoted this way; the source needs at least one row or column field.
   */
  @Input() dataSource?: WeGridDataSource<T> | null;
  @Input() config: WePivotConfig = { rows: [], columns: [], values: [] };
  /** Layout key of the result grid — the configuration is part of it, so each pivot keeps its own widths */
  @Input() gridKey = 'pivot';
  @Input() exportFormats: WeGridExportFormat[] = ['xlsx', 'csv', 'pdf'];
  @Input() maxHeight: number | string = 520;
  /** Most value columns before the rest are left out */
  @Input() maxColumns = 200;
  /** Pass-through to the result grid's `virtualScroll` — only the result rows in view are drawn */
  @Input() virtualScroll = false;
  /** Pass-through to the result grid's `virtualColumns` — only the value columns in view are drawn */
  @Input() virtualColumns = false;

  /** Shows the pivot as a chart above the table — null for none; the user switches it */
  @Input() chart: WeChartType | null = null;
  /** Pass-through to the chart's `showValues` */
  @Input() chartShowValues = false;

  @Output() configChange = new EventEmitter<WePivotConfig>();
  @Output() chartChange = new EventEmitter<WeChartType | null>();
  /**
   * A click on a result cell, with the raw dimension values behind it. A value cell carries its row
   * and column members; a row header cell only its own row field and the outer ones (`valueField`
   * `''`, `value` the member). Group/subtotal rows don't emit.
   */
  @Output() cellClick = new EventEmitter<WePivotCellClickEvent>();

  @ViewChild(WeGridComponent, { static: true }) private grid?: WeGridComponent<Record<string, unknown>>;

  readonly chartTypes: (keyof WeGridLocale['chartTypeLabels'])[] = ['column', 'bar', 'line', 'area', 'pie', 'donut'];
  chartData: WeChartData = { categories: [], series: [] };

  result: WePivotResult = { columns: [], rows: [], groupBy: [], truncated: false };
  /** Waiting for a data source's groups */
  loading = false;
  /** A data source failed — the message shown above the table */
  error: string | null = null;
  /** Bumped per rebuild, so a slow answer for an older configuration is dropped */
  private generation = 0;
  readonly aggregates: WePivotAggregate[] = ['sum', 'count', 'avg', 'min', 'max'];

  constructor(
    @Inject(WE_GRID_LOCALE) readonly locale: WeGridLocale,
    @Inject(WE_GRID_ICONS) private readonly icons: WeGridIcons,
    private readonly sanitizer: DomSanitizer,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnChanges(): void {
    this.rebuild();
  }

  ngOnInit(): void {
    // Listen only when the consumer does — a bound listener would give every pivot a pointer cursor
    if (this.cellClick.observed) this.grid?.cellClick.subscribe((e) => this.onGridCellClick(e));
  }

  /** The result grid's key — a new configuration is a new table with its own layout */
  get resultKey(): string {
    const c = this.config;
    return `${this.gridKey}:${c.rows.join(',')}|${c.columns.join(',')}|${c.values.map((v) => `${v.aggregate}.${v.field}`).join(',')}`.slice(0, 90);
  }

  icon(key: string): SafeHtml {
    return weGridSafeIcon(this.sanitizer, this.icons, key);
  }

  header(field: string): string {
    return this.fields.find((f) => f.field === field)?.header ?? field;
  }

  aggregateLabel(fn: WePivotAggregate): string {
    return fn === 'avg' ? this.locale.average : this.locale[fn];
  }

  /** Fields a zone can still take — values only offer numbers for sums, but anything can be counted */
  available(zone: Zone): WeGridColumnDef<T>[] {
    const used = new Set(zone === 'values' ? [] : [...this.config.rows, ...this.config.columns]);
    return this.fields.filter((f) => !used.has(f.field) && f.type !== 'custom');
  }

  add(zone: Zone, field: string, select?: HTMLSelectElement): void {
    if (select) select.value = '';
    if (!field) return;
    const c = this.config;
    if (zone === 'values') {
      const numeric = weGridValueKind(this.fields.find((f) => f.field === field)?.type) === 'number';
      this.update({ ...c, values: [...c.values, { field, aggregate: numeric ? 'sum' : 'count' }] });
    } else {
      this.update({ ...c, [zone]: [...c[zone], field] });
    }
  }

  remove(zone: Zone, index: number): void {
    const c = this.config;
    if (zone === 'values') this.update({ ...c, values: c.values.filter((_, i) => i !== index) });
    else this.update({ ...c, [zone]: c[zone].filter((_, i) => i !== index) });
  }

  /** Moves a field one place left within its zone — the outer level first */
  moveLeft(zone: 'rows' | 'columns', index: number): void {
    if (index === 0) return;
    const list = [...this.config[zone]];
    [list[index - 1], list[index]] = [list[index], list[index - 1]];
    this.update({ ...this.config, [zone]: list });
  }

  setAggregate(index: number, aggregate: WePivotAggregate): void {
    this.update({ ...this.config, values: this.config.values.map((v, i) => (i === index ? { ...v, aggregate } : v)) });
  }

  setChart(type: WeChartType | null): void {
    this.chart = type;
    this.chartChange.emit(type);
  }

  onGridCellClick(e: WeGridCellClickEvent<Record<string, unknown>>): void {
    const rowValues = this.result.rowValues?.[e.row['pivot:id'] as number];
    if (!rowValues) return;
    if (e.field.startsWith('r:')) {
      const field = e.field.slice(2);
      const upTo = this.config.rows.indexOf(field);
      const own = Object.fromEntries(this.config.rows.slice(0, upTo + 1).map((f) => [f, rowValues[f]]));
      this.cellClick.emit({ rowValues: own, columnValues: {}, valueField: '', value: rowValues[field] });
      return;
    }
    const source = this.result.cellSources?.[e.field];
    if (source) this.cellClick.emit({ rowValues, columnValues: source.columnValues, valueField: source.valueField, value: e.value });
  }

  swap(): void {
    this.update({ ...this.config, rows: this.config.columns, columns: this.config.rows });
  }

  private update(config: WePivotConfig): void {
    this.config = config;
    this.configChange.emit(config);
    this.rebuild();
  }

  /** A field's value — nested paths and formula columns (`=[Qty] * [Price]`) included */
  private readonly read = (row: Record<string, unknown>, field: string, depth = 0): unknown => {
    const def = this.fields.find((f) => f.field === field);
    if (!def?.formula) return getNestedValue(row, field);
    if (depth > 8) return new WeGridFormulaError('#CIRC!');
    const compiled = weGridTryCompileFormula(def.formula);
    if ('error' in compiled) return new WeGridFormulaError('#ERROR!');
    const value = compiled.formula.evaluate({
      field: (name) => {
        const key = name.trim().toLocaleLowerCase();
        const ref = this.fields.find((f) => f.field.toLocaleLowerCase() === key) ?? this.fields.find((f) => f.header.toLocaleLowerCase() === key);
        return ref ? this.read(row, ref.field, depth + 1) : new WeGridFormulaError('#NAME?');
      }
    });
    return value instanceof WeGridFormulaError ? null : value;
  };

  private rowLabel(row: Record<string, unknown>, field: string): string {
    const fmt = this.result.columns.find((c) => c.field === field)?.formatter;
    return fmt ? fmt(row[field], row) : String(row[field] ?? '');
  }

  private get labels(): WePivotLabels {
    return {
      aggregate: { sum: this.locale.sum, count: this.locale.count, avg: this.locale.average, min: this.locale.min, max: this.locale.max },
      total: this.locale.pivotTotal,
      empty: this.locale.emptyGroupValue
    };
  }

  private rebuild(): void {
    const generation = ++this.generation;
    const source = this.dataSource;
    const fields = this.fields as WeGridColumnDef<unknown>[];
    if (source?.groups) {
      // A formula is worked out per row on the page; the source never sees one
      const formula = [...this.config.rows, ...this.config.columns, ...this.config.values.map((v) => v.field)].find(
        (f) => this.fields.find((d) => d.field === f)?.formula
      );
      if (formula) {
        this.loading = false;
        this.error = this.locale.pivotFormulaFromSource(this.header(formula));
        this.apply({ columns: [], rows: [], groupBy: [], truncated: false });
        return;
      }
      this.loading = true;
      this.error = null;
      Promise.resolve()
        .then(() => source.groups!(wePivotGroupRequest(this.config, fields)))
        .then(
          (groups) => {
            if (generation !== this.generation) return;
            this.loading = false;
            this.apply(wePivotFromGroups(groups, this.config, fields, this.labels, this.locale.intlLocale, this.maxColumns));
          },
          (error: unknown) => {
            if (generation !== this.generation) return;
            this.loading = false;
            this.error = error instanceof Error && error.message ? `${this.locale.loadFailed}: ${error.message}` : this.locale.loadFailed;
            this.cdr.markForCheck();
          }
        );
      return;
    }
    this.loading = false;
    this.error = null;
    this.apply(wePivot(this.data as readonly Record<string, unknown>[], this.config, fields, this.labels, this.read, this.locale.intlLocale, this.maxColumns));
  }

  private apply(result: WePivotResult): void {
    this.result = result;
    // The chart plots the value cells (not the row totals): one category per pivot row
    const valueColumns = this.result.columns.filter((c) => c.field.startsWith('c:'));
    const labelFields = this.result.columns.filter((c) => c.field.startsWith('r:')).map((c) => c.field);
    this.chartData = {
      categories: this.result.rows.map((r) => labelFields.map((f) => this.rowLabel(r, f)).join(' · ') || this.locale.pivotTotal),
      series: valueColumns.map((c) => ({ name: c.header, values: this.result.rows.map((r) => (typeof r[c.field] === 'number' ? (r[c.field] as number) : null)) }))
    };
    this.cdr.markForCheck();
  }
}
