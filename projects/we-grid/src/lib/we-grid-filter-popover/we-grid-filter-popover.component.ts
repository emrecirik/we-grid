import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Inject, Input, Output } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { WeGridInternalColumn, weGridDisplayHeader } from '../models/we-grid-internal.model';
import { WeGridColumnFilterState, WeGridFilterOperator } from '../models/we-grid-filter.model';
import { WE_GRID_ICONS, WeGridIcons } from '../models/we-grid-icons.model';
import { WE_GRID_LOCALE, WeGridLocale } from '../models/we-grid-locale.model';

/** A single change made in the popover, reported to `WeGridComponent` — applied IMMEDIATELY (same behavior as the filter row) */
export type WeGridFilterPopoverAction =
  | { type: 'operator'; operator: WeGridFilterOperator }
  | { type: 'value'; which: 'value' | 'value2'; value: string | number | null }
  | { type: 'clear' }
  | { type: 'close' };

/**
 * The filter popover opened via CDK Overlay by clicking the funnel icon in a column header.
 * Uses the SAME operator/value logic as the filter row (see the `we-grid__filter-row` markup in
 * we-grid.component.html) — here it only reports changes outward through `action`; the actual
 * state (filterState) is always owned and applied by WeGridComponent. After each change,
 * WeGridComponent feeds the up-to-date `filterState` back via `setInput` (see
 * we-grid.component.ts's openFilterPopover).
 */
@Component({
  selector: 'we-grid-filter-popover',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './we-grid-filter-popover.component.html',
  styleUrls: ['./we-grid-filter-popover.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WeGridFilterPopoverComponent {
  @Input() column: WeGridInternalColumn<unknown> | null = null;
  @Input() filterState: WeGridColumnFilterState = { field: '', operator: 'contains', value: null };

  @Output() action = new EventEmitter<WeGridFilterPopoverAction>();

  constructor(
    private readonly elementRef: ElementRef<HTMLElement>,
    @Inject(WE_GRID_LOCALE) readonly locale: WeGridLocale,
    @Inject(WE_GRID_ICONS) private readonly icons: WeGridIcons,
    private readonly sanitizer: DomSanitizer
  ) {}

  icon(key: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.icons[key] ?? '');
  }

  get headerLabel(): string {
    return this.column ? weGridDisplayHeader(this.column) : '';
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

  /** Enter — the value has already been applied instantly on every keystroke, this just closes the popover */
  onEnterKey(event: Event): void {
    event.preventDefault();
    this.close();
  }

  /** Focuses the first control as soon as the overlay opens — same pattern as focusFirstItem in the header menu */
  focusFirstControl(): void {
    queueMicrotask(() => {
      const el = this.elementRef.nativeElement.querySelector<HTMLElement>('select, input');
      el?.focus();
    });
  }
}
