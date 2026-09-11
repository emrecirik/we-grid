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
import { WeGridDensity, WeGridSortDirection, WeGridSummaryFunction, isWeGridNumericSummaryType } from '../models/we-grid-column.model';
import { WeGridInternalColumn, weGridDisplayHeader } from '../models/we-grid-internal.model';
import { WeGridMenuAction } from '../models/we-grid-menu-action.model';
import { weGridQuickFilterOperator } from '../models/we-grid-filter.model';
import { WE_GRID_ICONS, WeGridIcons } from '../models/we-grid-icons.model';
import { WE_GRID_LOCALE, WeGridLocale } from '../models/we-grid-locale.model';

/**
 * Header right-click / gear-button context menu.
 * Created imperatively by `WeGridComponent` through the CDK Overlay.
 */
@Component({
  selector: 'we-grid-header-menu',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './we-grid-header-menu.component.html',
  styleUrls: ['./we-grid-header-menu.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WeGridHeaderMenuComponent implements OnInit {
  /** Which column header the menu was opened from — null means it was opened from the toolbar's gear button */
  @Input() column: WeGridInternalColumn<unknown> | null = null;
  @Input() allColumns: WeGridInternalColumn<unknown>[] = [];
  @Input() density: WeGridDensity = 'normal';
  @Input() sort: { field: string; direction: WeGridSortDirection } | null = null;
  /** Shows the grouping/quick-filter section on grids where the `grouping` input is true — defaults to false (existing menu behavior unchanged) */
  @Input() enableGrouping = false;
  /** The currently active grouping field — used to show a checkmark on this column's group option */
  @Input() groupField: string | null = null;
  /** The value of the cell the menu was opened from (right-click), used for "Filter by this value" */
  @Input() cellValue: unknown = undefined;
  /** True when `cellValue` is valid (the menu was opened from a cell) — distinguishes "no value" from undefined/null */
  @Input() hasCellValue = false;

  @Output() action = new EventEmitter<WeGridMenuAction>();

  @ViewChildren('menuItem') menuItems!: QueryList<ElementRef<HTMLElement>>;

  columnsOpen = false;
  densityOpen = false;
  pinOpen = false;
  summaryOpen = false;
  renaming = false;
  renameValue = '';

  constructor(
    @Inject(WE_GRID_LOCALE) readonly locale: WeGridLocale,
    @Inject(WE_GRID_ICONS) private readonly icons: WeGridIcons,
    private readonly sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    if (this.column) {
      this.renameValue = weGridDisplayHeader(this.column);
    }
  }

  icon(key: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.icons[key] ?? '');
  }

  displayHeader(col: WeGridInternalColumn<unknown>): string {
    return weGridDisplayHeader(col);
  }

  /**
   * "Filter by this value" is left out on a column the user can't filter (`filterable: false`) and
   * on one whose `filterOperators` rule out the exact match it stands for — the grid ignores the
   * action there anyway, so offering it would be a button that does nothing.
   */
  get canQuickFilter(): boolean {
    return !!this.column && this.column.filterable && weGridQuickFilterOperator(this.column) !== null;
  }

  /** sum/avg/min/max options are only offered on numeric columns — text/date/boolean only get Count/None */
  isNumericColumn(col: WeGridInternalColumn<unknown>): boolean {
    return isWeGridNumericSummaryType(col.type);
  }

  emitSummary(field: string, summary: WeGridSummaryFunction): void {
    this.emit({ type: 'summary', field, summary });
  }

  emit(action: WeGridMenuAction): void {
    this.action.emit(action);
  }

  startRename(): void {
    if (!this.column) return;
    this.renameValue = weGridDisplayHeader(this.column);
    this.renaming = true;
    queueMicrotask(() => {
      const input = document.getElementById('we-grid-rename-input') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  }

  commitRename(): void {
    if (!this.column) return;
    const header = this.renameValue.trim() || this.column.defaultHeader;
    this.emit({ type: 'rename', field: this.column.field, header });
    this.renaming = false;
  }

  cancelRename(event: Event): void {
    event.stopPropagation();
    this.renaming = false;
  }

  onKeydown(event: KeyboardEvent): void {
    if (this.renaming) return;
    const items = this.menuItems?.toArray().filter((el) => !el.nativeElement.hasAttribute('disabled')) ?? [];
    if (items.length === 0) return;
    const active = document.activeElement;
    const currentIndex = items.findIndex((el) => el.nativeElement === active);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = items[(currentIndex + 1 + items.length) % items.length];
      next.nativeElement.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = items[(currentIndex - 1 + items.length) % items.length];
      prev.nativeElement.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0].nativeElement.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1].nativeElement.focus();
    }
  }

  focusFirstItem(): void {
    queueMicrotask(() => this.menuItems?.first?.nativeElement.focus());
  }
}
