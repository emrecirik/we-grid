import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Inject,
  Input,
  OnInit,
  Output,
  QueryList,
  ViewChildren
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { WeGridInternalColumn, weGridDisplayHeader } from '../models/we-grid-internal.model';
import {
  WeGridChecklistOption,
  WeGridColumnFilterState,
  WeGridFilterOperator,
  weGridFilterOperatorsFor,
  weGridFilterValueKey
} from '../models/we-grid-filter.model';
import { WE_GRID_ICONS, WeGridIcons } from '../models/we-grid-icons.model';
import { WE_GRID_LOCALE, WeGridLocale } from '../models/we-grid-locale.model';
import { weGridFilterOperatorLabel } from '../services/we-grid-filter.util';

/**
 * A single change made in the popover, reported to `WeGridComponent`. Operator-mode changes are
 * applied IMMEDIATELY (same behavior as the filter row); the checklist instead collects its
 * selection locally and reports it once, when the user presses Apply.
 */
export type WeGridFilterPopoverAction =
  | { type: 'operator'; operator: WeGridFilterOperator }
  | { type: 'value'; which: 'value' | 'value2'; value: string | number | null }
  | { type: 'checklist'; values: unknown[] }
  /** The checklist's search box changed while its values come from a provider — the grid debounces it */
  | { type: 'search'; term: string }
  /** Repeat the provider request that failed */
  | { type: 'retry' }
  | { type: 'clear' }
  | { type: 'close' };

/**
 * The filter popover opened via CDK Overlay by clicking the funnel icon in a column header.
 *
 * In its default 'operator' mode it uses the SAME operator/value logic as the filter row (see the
 * `we-grid__filter-row` markup in we-grid.component.html) — it only reports changes outward through
 * `action`; the actual state (filterState) is always owned and applied by WeGridComponent. After
 * each change, WeGridComponent feeds the up-to-date `filterState` back via `setInput` (see
 * we-grid.component.ts's openFilterPopover).
 *
 * With `headerFilterMode: 'checklist'` on the column it instead renders the distinct values of the
 * loaded rows (supplied ready-made in `options`, the grid computes them — the popover never touches
 * the data). The pending selection lives here until Apply, which is why Cancel can simply close.
 */
@Component({
  selector: 'we-grid-filter-popover',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './we-grid-filter-popover.component.html',
  styleUrls: ['./we-grid-filter-popover.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WeGridFilterPopoverComponent implements OnInit {
  @Input() column: WeGridInternalColumn<unknown> | null = null;
  @Input() filterState: WeGridColumnFilterState = { field: '', operator: 'contains', value: null };
  /** Distinct values offered by the checklist — built by WeGridComponent from the loaded rows or its provider */
  @Input() options: WeGridChecklistOption[] = [];
  /**
   * True while WeGridComponent feeds `options` from its `checklistValuesProvider`. The search box is
   * then reported outward as a `search` action and the list shows exactly what came back, instead
   * of being narrowed locally — the popover itself still makes no request.
   */
  @Input() remoteSearch = false;
  /** A provider request is in flight */
  @Input() loading = false;
  /** The last provider request failed */
  @Input() loadError = false;
  /** The provider holds more values than it returned */
  @Input() hasMore = false;
  /** The limit the provider was asked for — interpolated into the truncation note */
  @Input() valuesLimit = 0;
  /** The list is the loaded page's values on a grid that filters on the server — says so */
  @Input() pageOnlyHint = false;

  @Output() action = new EventEmitter<WeGridFilterPopoverAction>();

  @ViewChildren('checklistInput') checklistInputs!: QueryList<ElementRef<HTMLElement>>;

  /** Text typed into the checklist's search box — narrows the list by label, never by raw value */
  search = '';

  /**
   * The pending selection, `weGridFilterValueKey(value)` → the raw value that will be emitted.
   * Keyed rather than a plain array so a value picked twice can't end up in the payload twice, and
   * so a selection keeps matching its option after the page (and therefore the raw object) changed.
   */
  private readonly selection = new Map<string, unknown>();

  constructor(
    private readonly elementRef: ElementRef<HTMLElement>,
    @Inject(WE_GRID_LOCALE) readonly locale: WeGridLocale,
    @Inject(WE_GRID_ICONS) private readonly icons: WeGridIcons,
    private readonly sanitizer: DomSanitizer
  ) {}

  /**
   * The popover is created fresh on every open, so reading the incoming filter once here is enough
   * — nothing re-seeds the pending selection behind the user's back while they are picking values.
   */
  ngOnInit(): void {
    if (Array.isArray(this.filterState.value)) {
      for (const value of this.filterState.value as unknown[]) {
        this.selection.set(weGridFilterValueKey(value), value);
      }
    }
  }

  icon(key: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.icons[key] ?? '');
  }

  get headerLabel(): string {
    return this.column ? weGridDisplayHeader(this.column) : '';
  }

  // ─── Checklist mode ────────────────────────────────────────────────────
  get isChecklist(): boolean {
    return this.column?.headerFilterMode === 'checklist';
  }

  /** 'single' renders radio buttons, so picking a value replaces the previous one */
  get isSingleSelect(): boolean {
    return this.column?.headerFilterSelection === 'single';
  }

  /** The options left after the search box — everything while the box is empty, or when the provider already searched */
  get visibleOptions(): WeGridChecklistOption[] {
    if (this.remoteSearch) return this.options;
    const locale = this.locale.intlLocale;
    const needle = this.search.trim().toLocaleLowerCase(locale);
    if (!needle) return this.options;
    return this.options.filter((option) => option.label.toLocaleLowerCase(locale).includes(needle));
  }

  isOptionSelected(option: WeGridChecklistOption): boolean {
    return this.selection.has(option.key);
  }

  toggleOption(option: WeGridChecklistOption): void {
    if (this.isSingleSelect) {
      const alreadyOnlyThis = this.selection.size === 1 && this.selection.has(option.key);
      this.selection.clear();
      // A radio that is clicked again keeps its value — unticking it is what Clear is for.
      if (!alreadyOnlyThis) this.selection.set(option.key, option.value);
      return;
    }
    if (this.selection.has(option.key)) this.selection.delete(option.key);
    else this.selection.set(option.key, option.value);
  }

  /** Select-all only covers what the search currently shows — the Excel/DevExpress behaviour */
  get allVisibleSelected(): boolean {
    const visible = this.visibleOptions;
    return visible.length > 0 && visible.every((option) => this.selection.has(option.key));
  }

  get someVisibleSelected(): boolean {
    return !this.allVisibleSelected && this.visibleOptions.some((option) => this.selection.has(option.key));
  }

  toggleSelectAll(): void {
    const visible = this.visibleOptions;
    if (this.allVisibleSelected) {
      visible.forEach((option) => this.selection.delete(option.key));
      return;
    }
    visible.forEach((option) => this.selection.set(option.key, option.value));
  }

  applyChecklist(): void {
    this.action.emit({ type: 'checklist', values: Array.from(this.selection.values()) });
  }

  onSearchChange(term: string): void {
    this.search = term;
    if (this.remoteSearch) this.action.emit({ type: 'search', term });
  }

  retry(): void {
    this.action.emit({ type: 'retry' });
  }

  // ─── Operator mode ─────────────────────────────────────────────────────
  /** Same list as the filter row's cell — the column's `filterOperators` narrow the type's operators */
  get operators(): WeGridFilterOperator[] {
    return this.column ? weGridFilterOperatorsFor(this.column.type, this.column.filterOperators) : [];
  }

  operatorLabel(operator: WeGridFilterOperator): string {
    return weGridFilterOperatorLabel(operator, this.column?.type ?? 'text', this.locale);
  }

  emitOperator(operator: WeGridFilterOperator): void {
    this.action.emit({ type: 'operator', operator });
  }

  emitValue(value: string | number | null, which: 'value' | 'value2' = 'value'): void {
    this.action.emit({ type: 'value', which, value });
  }

  clear(): void {
    this.action.emit({ type: 'clear' });
  }

  close(): void {
    this.action.emit({ type: 'close' });
  }

  /**
   * Enter. In operator mode the value has already been applied on every keystroke, so this only
   * closes the popover; in checklist mode nothing has been applied yet, so it commits first.
   */
  onEnterKey(event: Event): void {
    event.preventDefault();
    if (this.isChecklist) {
      this.applyChecklist();
      return;
    }
    this.close();
  }

  /** Arrow/Home/End movement through the value list — same pattern as the header menu's onKeydown */
  onChecklistKeydown(event: KeyboardEvent): void {
    const items = this.checklistInputs?.toArray() ?? [];
    if (items.length === 0) return;
    const currentIndex = items.findIndex((el) => el.nativeElement === document.activeElement);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(currentIndex + 1 + items.length) % items.length].nativeElement.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(currentIndex - 1 + items.length) % items.length].nativeElement.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0].nativeElement.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1].nativeElement.focus();
    }
  }

  /** Focuses the first control as soon as the overlay opens — same pattern as focusFirstItem in the header menu */
  focusFirstControl(): void {
    queueMicrotask(() => {
      const el = this.elementRef.nativeElement.querySelector<HTMLElement>('select, input');
      el?.focus();
    });
  }
}
