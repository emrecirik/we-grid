import { weGridSafeIcon } from '../services/we-grid-icon.util';
import { CommonModule } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, EventEmitter, Inject, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  WE_GRID_FORMAT_COLORS,
  WE_GRID_FORMAT_PRESETS,
  WE_GRID_FORMAT_SCALES,
  WeGridCellStyle,
  WeGridFormatColor,
  WeGridFormatOperator,
  WeGridFormatPreset,
  WeGridFormatRule,
  WeGridFormatScalePreset
} from '../models/we-grid-format.model';
import { WeGridInternalColumn, weGridDisplayHeader } from '../models/we-grid-internal.model';
import { weGridValueKind } from '../models/we-grid-column.model';
import { WE_GRID_ICONS, WeGridIcons } from '../models/we-grid-icons.model';
import { WE_GRID_LOCALE, WeGridLocale } from '../models/we-grid-locale.model';
import { weGridCellStyleCss, weGridFormatBg, weGridFormatFg } from '../services/we-grid-format.util';

type StyleFlag = 'bold' | 'italic' | 'underline' | 'strike';

const NUMBER_OPERATORS: WeGridFormatOperator[] = [
  'gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'between', 'notBetween', 'top', 'bottom', 'aboveAverage', 'belowAverage',
  'duplicate', 'unique', 'empty', 'notEmpty', 'formula'
];
const TEXT_OPERATORS: WeGridFormatOperator[] = [
  'contains', 'notContains', 'startsWith', 'endsWith', 'eq', 'neq', 'duplicate', 'unique', 'empty', 'notEmpty', 'formula'
];
const NO_VALUE = new Set<WeGridFormatOperator>(['aboveAverage', 'belowAverage', 'duplicate', 'unique', 'empty', 'notEmpty']);

/**
 * The column Format panel — the base style of a column and its conditional formatting rules, as in
 * Excel's "Conditional Formatting" dialog. Every change applies at once (there is no Save button);
 * the grid owns the state and persists it with the layout.
 */
@Component({
  selector: 'we-grid-format-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, A11yModule],
  templateUrl: './we-grid-format-panel.component.html',
  styleUrls: ['../we-grid-edit-form/we-grid-edit-form.component.scss', './we-grid-format-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WeGridFormatPanelComponent {
  @Input({ required: true }) column!: WeGridInternalColumn<unknown>;
  /** Every rule of the grid — the panel shows and edits the column's own */
  @Input() rules: WeGridFormatRule[] = [];
  /** Conditional formatting only — no column style, decimals, whole-row or formula rules (the sheet's use) */
  @Input() rulesOnly = false;

  @Output() styleChange = new EventEmitter<WeGridCellStyle>();
  @Output() rulesChange = new EventEmitter<WeGridFormatRule[]>();
  /** Decimal places as a column format (`'2-2'`), or undefined for the column's default */
  @Output() numberFormatChange = new EventEmitter<string | undefined>();
  @Output() closed = new EventEmitter<void>();

  readonly colors = WE_GRID_FORMAT_COLORS;
  readonly presets = Object.keys(WE_GRID_FORMAT_PRESETS) as WeGridFormatPreset[];
  readonly scales = Object.keys(WE_GRID_FORMAT_SCALES) as WeGridFormatScalePreset[];
  readonly flags: StyleFlag[] = ['bold', 'italic', 'underline', 'strike'];

  // The "add rule" form
  newType: WeGridFormatRule['type'] = 'condition';
  newOperator: WeGridFormatOperator | null = null;
  newValue = '';
  newValue2 = '';
  newPreset: WeGridFormatPreset = 'redFill';
  newScale: WeGridFormatScalePreset = 'redYellowGreen';
  newBarColor: WeGridFormatColor = 'blue';
  newIcons: 'arrows' | 'dots' = 'arrows';
  readonly iconSets: ('arrows' | 'dots')[] = ['arrows', 'dots'];
  newReverse = false;
  newApplyToRow = false;

  constructor(
    @Inject(WE_GRID_LOCALE) readonly locale: WeGridLocale,
    @Inject(WE_GRID_ICONS) private readonly icons: WeGridIcons,
    private readonly sanitizer: DomSanitizer
  ) {}

  get title(): string {
    return this.locale.formatPanelTitle(weGridDisplayHeader(this.column));
  }

  get style(): WeGridCellStyle {
    return this.column.style ?? {};
  }

  get isNumeric(): boolean {
    const kind = weGridValueKind(this.column.type);
    return kind === 'number' || kind === 'date';
  }

  /** Decimal places apply to plain numbers and percentages — currency follows its currency */
  get hasDecimals(): boolean {
    return this.column.type === 'number' || this.column.type === 'percent';
  }

  /** The column's fixed decimal places, or null while it formats automatically */
  get decimals(): number | null {
    const m = /^(\d)-(\d)$/.exec(this.column.format ?? '');
    return m ? Number(m[2]) : null;
  }

  changeDecimals(delta: number): void {
    const current = this.decimals ?? (this.column.type === 'percent' ? 1 : 2);
    const next = Math.max(0, Math.min(6, current + delta));
    this.numberFormatChange.emit(`${next}-${next}`);
  }

  get operators(): WeGridFormatOperator[] {
    const all = this.isNumeric ? NUMBER_OPERATORS : TEXT_OPERATORS;
    return this.rulesOnly ? all.filter((o) => o !== 'formula') : all;
  }

  get operator(): WeGridFormatOperator {
    return this.newOperator ?? this.operators[0];
  }

  get columnRules(): WeGridFormatRule[] {
    return this.rules.filter((r) => r.field === this.column.field);
  }

  get needsValue(): boolean {
    return !NO_VALUE.has(this.operator);
  }

  get needsSecondValue(): boolean {
    return this.operator === 'between' || this.operator === 'notBetween';
  }

  get canAdd(): boolean {
    if (this.newType !== 'condition' || !this.needsValue) return true;
    if (this.newValue.trim() === '') return false;
    return !this.needsSecondValue || this.newValue2.trim() !== '';
  }

  icon(key: string): SafeHtml {
    return weGridSafeIcon(this.sanitizer, this.icons, key);
  }

  fg(color: WeGridFormatColor): string {
    return weGridFormatFg(color);
  }

  bg(color: WeGridFormatColor): string {
    return weGridFormatBg(color);
  }

  presetCss(preset: WeGridFormatPreset): Record<string, string> {
    return weGridCellStyleCss(WE_GRID_FORMAT_PRESETS[preset]);
  }

  scaleCss(preset: WeGridFormatScalePreset): string {
    return this.scaleCssFor(WE_GRID_FORMAT_SCALES[preset]);
  }

  toggleFlag(flag: StyleFlag): void {
    this.styleChange.emit({ ...this.style, [flag]: !this.style[flag] || undefined });
  }

  setColor(key: 'color' | 'fill', color: WeGridFormatColor | null): void {
    this.styleChange.emit({ ...this.style, [key]: color ?? undefined });
  }

  onOperatorChange(op: WeGridFormatOperator): void {
    this.newOperator = op;
    if (op === 'top' || op === 'bottom') this.newValue = this.newValue || '10';
  }

  addRule(): void {
    if (!this.canAdd) return;
    const rule: WeGridFormatRule = { id: this.nextId(), field: this.column.field, type: this.newType };
    if (this.newType === 'condition') {
      rule.operator = this.operator;
      rule.style = { ...WE_GRID_FORMAT_PRESETS[this.newPreset] };
      if (this.needsValue) rule.value = this.parse(this.newValue);
      if (this.needsSecondValue) rule.value2 = this.parse(this.newValue2);
      if (this.newApplyToRow) rule.applyTo = 'row';
    } else if (this.newType === 'colorScale') {
      rule.colors = [...WE_GRID_FORMAT_SCALES[this.newScale]];
    } else if (this.newType === 'iconSet') {
      rule.icons = this.newIcons;
      if (this.newReverse) rule.reverse = true;
    } else {
      rule.color = this.newBarColor;
    }
    this.rulesChange.emit([...this.rules, rule]);
    this.newValue = '';
    this.newValue2 = '';
  }

  deleteRule(rule: WeGridFormatRule): void {
    this.rulesChange.emit(this.rules.filter((r) => r !== rule));
  }

  /** Swaps the rule with the column's previous rule — the first one wins where two rules overlap */
  raise(rule: WeGridFormatRule): void {
    const own = this.columnRules;
    const prev = own[own.indexOf(rule) - 1];
    if (!prev) return;
    const next = [...this.rules];
    const a = next.indexOf(rule);
    const b = next.indexOf(prev);
    [next[a], next[b]] = [next[b], next[a]];
    this.rulesChange.emit(next);
  }

  clearRules(): void {
    this.rulesChange.emit(this.rules.filter((r) => r.field !== this.column.field));
  }

  describe(rule: WeGridFormatRule): string {
    if (rule.type === 'colorScale') return this.locale.formatTypeColorScale;
    if (rule.type === 'dataBar') return this.locale.formatTypeDataBar;
    if (rule.type === 'iconSet') return `${this.locale.formatTypeIconSet} · ${this.locale.formatIconSetLabels[rule.icons ?? 'arrows']}`;
    const op = rule.operator ?? 'eq';
    const label = this.locale.formatOperatorLabels[op];
    if (NO_VALUE.has(op)) return label;
    if (op === 'between' || op === 'notBetween') return `${label} ${rule.value} ${this.locale.formatValueAnd} ${rule.value2}`;
    if (op === 'top' || op === 'bottom') return `${label} ${rule.value} ${this.locale.formatTopCount}`;
    return `${label} ${rule.value ?? ''}`;
  }

  ruleCss(rule: WeGridFormatRule): Record<string, string> | string {
    if (rule.type === 'colorScale') return { background: this.scaleCssFor(rule.colors ?? []) };
    if (rule.type === 'dataBar' && rule.color) {
      return { background: `linear-gradient(to right, color-mix(in srgb, ${weGridFormatFg(rule.color)} 30%, transparent) 60%, transparent 60%)` };
    }
    return weGridCellStyleCss(rule.style);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.closed.emit();
    }
  }

  private scaleCssFor(colors: WeGridFormatColor[]): string {
    const stops = colors.map((c) => `color-mix(in srgb, ${weGridFormatFg(c)} 45%, transparent)`);
    return stops.length > 1 ? `linear-gradient(to right, ${stops.join(', ')})` : 'none';
  }

  /** Numeric text becomes a number so a saved rule compares numerically; a formula or text stays text */
  private parse(text: string): string | number {
    const trimmed = text.trim();
    return trimmed !== '' && !trimmed.startsWith('=') && Number.isFinite(Number(trimmed)) ? Number(trimmed) : trimmed;
  }

  private nextId(): string {
    const used = new Set(this.rules.map((r) => r.id));
    let i = this.rules.length + 1;
    while (used.has(`r${i}`)) i++;
    return `r${i}`;
  }
}
