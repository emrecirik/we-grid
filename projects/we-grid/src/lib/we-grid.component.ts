import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { ComponentPortal } from '@angular/cdk/portal';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import {
  AfterContentInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ComponentRef,
  ContentChild,
  ContentChildren,
  ElementRef,
  EventEmitter,
  Inject,
  Input,
  NgZone,
  isDevMode,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  QueryList,
  SimpleChanges,
  TemplateRef,
  ViewChild
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subject, fromEvent, merge, take, takeUntil, debounce, debounceTime, timer } from 'rxjs';
import { WeGridCellDirective } from './directives/we-grid-cell.directive';
import { WeGridRowDetailDirective } from './directives/we-grid-row-detail.directive';
import {
  WeGridCellContext,
  WeGridColumnDef,
  WeGridDensity,
  WeGridSortDirection
} from './models/we-grid-column.model';
import { WeGridInternalColumn, weGridDisplayHeader } from './models/we-grid-internal.model';
import { WeGridLayout, WeGridLayoutStore, WE_GRID_LAYOUT_STORE } from './models/we-grid-layout.model';
import { WeGridMenuAction } from './models/we-grid-menu-action.model';
import {
  WeGridChecklistOption,
  WeGridColumnFilterState,
  WeGridFilterChangeEvent,
  WeGridFilterOperator,
  isWeGridFilterActive,
  weGridDefaultFilterOperator,
  weGridEmptyFilterValue,
  weGridFilterChangeEvent,
  weGridFilterValueKey
} from './models/we-grid-filter.model';
import { WeGridGroupSection } from './models/we-grid-group.model';
import {
  WeGridPageChange,
  WeGridRowClassFn,
  WeGridRowClickEvent,
  WeGridSelectionMode,
  WeGridSortChange
} from './models/we-grid-events.model';
import { WeGridRowDetailContext } from './models/we-grid-row-detail.model';
import { WE_GRID_ICONS, WeGridIcons } from './models/we-grid-icons.model';
import { WE_GRID_LOCALE, WeGridLocale } from './models/we-grid-locale.model';
import {
  WE_GRID_EXPORTER,
  WE_GRID_IMPORT_PARSER,
  WeGridExportFormat,
  WeGridExportRequest,
  WeGridExportScope,
  WeGridExportTable,
  WeGridExporter,
  WeGridImportFormat,
  WeGridImportParser,
  WeGridImportResult
} from './models/we-grid-export.model';
import {
  WE_GRID_NEW_ROW_KEY,
  WeGridEditState,
  WeGridRowDeleteEvent,
  WeGridRowEditEvent,
  weGridSameEditValue
} from './models/we-grid-edit.model';
import { mergeGridLayout, toColumnLayout } from './services/we-grid-layout-merge';
import {
  applyWeGridFilters,
  weGridFilterChipLabel,
  weGridInFilterValueLabel,
  weGridQuickFilterValueToInputString
} from './services/we-grid-filter.util';
import { buildWeGridSummaryText } from './services/we-grid-summary.util';
import { formatWeGridValue, getNestedValue, setNestedValue } from './services/we-grid-value.util';
import { weGridMapImportedRows } from './services/we-grid-import.util';
import { WeGridHeaderMenuComponent } from './we-grid-header-menu/we-grid-header-menu.component';
import { WeGridCellEditorComponent } from './we-grid-cell-editor/we-grid-cell-editor.component';
import { WeGridFilterPopoverAction, WeGridFilterPopoverComponent } from './we-grid-filter-popover/we-grid-filter-popover.component';

type WeGridMenuOrigin = HTMLElement | { x: number; y: number };

/**
 * Custom properties copied into the standalone print document — it is rendered in its own window
 * and inherits nothing from the host page's stylesheet (see we-grid-pdf.util.ts).
 */
const WE_GRID_EXPORT_THEME_VARIABLES = [
  '--we-grid-print-color',
  '--we-grid-print-bg',
  '--we-grid-print-border-color',
  '--we-grid-print-header-bg',
  '--we-grid-print-muted-color',
  '--we-grid-accent-color'
];

/** Width in px of the row-action column added when `editable` or `allowDelete` is on */
const WE_GRID_ACTION_COL_WIDTH = 92;

@Component({
  selector: 'we-grid',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule, WeGridCellEditorComponent],
  templateUrl: './we-grid.component.html',
  styleUrls: ['./we-grid.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'we-grid-host' }
})
export class WeGridComponent<T> implements OnInit, OnChanges, AfterContentInit, OnDestroy {
  @Input({ required: true }) gridKey!: string;
  @Input({ required: true }) columns: WeGridColumnDef<T>[] = [];
  @Input() data: T[] = [];
  @Input() loading = false;
  @Input() trackByField?: keyof T;

  // Server-side pagination/sorting
  @Input() totalCount = 0;
  @Input() page = 1;
  @Input() pageSize = 20;
  @Input() serverSide = false;
  @Input() sortField: string | null = null;
  @Input() sortDirection: WeGridSortDirection = null;

  /**
   * Who performs sorting. 'auto' (default): sorts on the server if serverSide=true AND the
   * consumer has bound (sortChange); otherwise the grid sorts the loaded page itself. This
   * removes the failure mode where a screen forgets to bind (sortChange) and clicking a header
   * silently does nothing. 'server' / 'client' force the behavior explicitly.
   */
  @Input() sortMode: 'auto' | 'client' | 'server' = 'auto';

  /**
   * Who performs filtering — same logic as sortMode. 'auto': if serverSide=true AND
   * (filterChange) is bound, the filter is NOT applied locally, it's only emitted outward (so it
   * isn't double-applied); otherwise a local filter runs over the loaded rows.
   */
  @Input() filterMode: 'auto' | 'client' | 'server' = 'auto';

  /**
   * How long the grid waits after the last filter edit before emitting `(filterChange)`. Only the
   * OUTGOING event is debounced — a client-side filter is still applied on every keystroke. Raise
   * it on a `filterMode='server'` grid where each emit costs a backend query, or set it to 0 to
   * emit immediately (the checklist header filter only emits once, on Apply, so it barely cares).
   */
  @Input() filterDebounceMs = 400;

  @Input() selectable: WeGridSelectionMode = 'none';
  /** Message shown when there are no rows — falls back to the current locale's `emptyMessage` when omitted */
  @Input() emptyMessage?: string;
  /** Per-row class generator — the returned value is applied to `<tr>` via `[ngClass]` (see WeGridRowClassFn) */
  @Input() rowClass?: WeGridRowClassFn<T>;
  /** Compatibility version of the saved user layout — bumping it discards the old saved layout */
  @Input() layoutVersion = 1;

  /**
   * OVERALL total(s) coming from the backend — when given, the summary row shows this instead of
   * the loaded page ("Grand total: ..."). Key = column field, value = the result the backend
   * computed for that column using whichever function is currently selected for it. Columns not
   * present here continue to be computed by the grid over the loaded rows (see README "Summary row").
   */
  @Input() summaryValues?: Record<string, number>;

  /** Whether row expansion (master-detail) is enabled — used together with the `weGridRowDetail` template */
  @Input() expandable = false;

  /**
   * Enables the per-cell filter row — defaults to false (behavior of existing screens is
   * UNCHANGED). When true, a "Filter row" button appears in the toolbar; the row's open/closed
   * state is stored in the user layout, filter VALUES are not persisted (see WeGridLayout).
   * Filtering always operates on the LOADED ROWS (the `data` input) — see README "Filter row".
   */
  @Input() filterRow = false;

  /**
   * Adds grouping + "filter by this value" + "show all columns" options to the column
   * header/cell context menu and attaches a right-click listener to cells — defaults to false.
   * While false, cells keep the browser's default right-click menu working exactly as before.
   */
  @Input() grouping = false;

  // ─── Export / import ─────────────────────────────────────────────────
  /**
   * Formats offered by the toolbar's export buttons — empty (the default) hides the whole group,
   * so existing grids are unchanged. The export always covers the LOADED rows in their current
   * order, after the client-side filter and sort, and only the columns the user currently has
   * visible (a hidden column is not exported). When rows are selected, only those are exported.
   */
  @Input() exportFormats: WeGridExportFormat[] = [];

  /** Export file name without an extension — defaults to `gridKey` */
  @Input() exportFileName?: string;

  /**
   * Who produces the file — same 'auto' logic as sortMode/filterMode. 'auto': while serverSide=true
   * AND (exportRequest) is bound, the grid does NOT generate a file, it only emits the request so
   * the backend can export the FULL result set rather than the loaded page. 'client' always
   * generates locally, 'server' always delegates.
   */
  @Input() exportMode: 'auto' | 'client' | 'server' = 'auto';

  /** Formats the toolbar's import button accepts — empty (the default) hides the button */
  @Input() importFormats: WeGridImportFormat[] = [];

  // ─── Row editing (create / update / delete) ──────────────────────────
  /** Enables inline row editing — adds an edit button to each row's action cell */
  @Input() editable = false;

  /** Adds an "Add row" toolbar button that opens an empty draft row at the top of the table */
  @Input() allowAdd = false;

  /** Adds a delete button to each row's action cell */
  @Input() allowDelete = false;

  /** Whether deleting asks for confirmation first — turn off to run your own dialog before the event */
  @Input() confirmDelete = true;

  /** Adds a toolbar button that only emits (refresh) — the consumer decides what reloading means */
  @Input() showRefresh = false;

  /** Field values a newly created draft row starts from */
  @Input() newRowTemplate?: Partial<T>;

  @Output() pageChange = new EventEmitter<WeGridPageChange>();
  @Output() sortChange = new EventEmitter<WeGridSortChange>();
  @Output() rowClick = new EventEmitter<WeGridRowClickEvent<T>>();
  @Output() rowDblClick = new EventEmitter<WeGridRowClickEvent<T>>();
  @Output() selectionChange = new EventEmitter<T[]>();
  @Output() layoutChange = new EventEmitter<WeGridLayout>();
  /**
   * Emits the list of active filters whenever the filter row, a filter popover or a checklist
   * changes (debounced — see `filterDebounceMs`). The default behavior is ENTIRELY client-side (no
   * request is sent to the backend); screens with serverSide=true can listen to this event and
   * trigger their own backend query if they want — see docs/server-side.md.
   *
   * The payload IS the `WeGridColumnFilterState[]` it has always been; it additionally carries
   * `resetPage`, which is true when the filter set really changed and the reload therefore belongs
   * on page 1. The grid never emits `(pageChange)` alongside it, so a screen that sets `page = 1`
   * on `resetPage` issues exactly one request.
   */
  @Output() filterChange = new EventEmitter<WeGridFilterChangeEvent>();
  /** Emitted when the grouping field changes (a group was selected/cleared) — fired on click, no debounce needed */
  @Output() groupChange = new EventEmitter<string | null>();

  /**
   * Emitted for every export, carrying both the rows and the fully built table. On a serverSide
   * grid where this is bound, the grid produces no file itself — see `exportMode`.
   */
  @Output() exportRequest = new EventEmitter<WeGridExportRequest<T>>();

  /**
   * Emitted after an imported file has been parsed and mapped onto the columns. The grid does NOT
   * add the rows to `data` — the consumer owns the data and decides what to do (post them to the
   * backend, show a preview, merge them).
   */
  @Output() importData = new EventEmitter<WeGridImportResult<T>>();

  /** A draft row was submitted — call `event.done(true)` once the backend accepted it */
  @Output() rowCreate = new EventEmitter<WeGridRowEditEvent<T>>();

  /** An existing row was edited — call `event.done(true)` once the backend accepted it */
  @Output() rowUpdate = new EventEmitter<WeGridRowEditEvent<T>>();

  /** A row's delete button was confirmed — call `event.done(true)` once the backend accepted it */
  @Output() rowDelete = new EventEmitter<WeGridRowDeleteEvent<T>>();

  /** The toolbar's refresh button was pressed — reloading is entirely the consumer's business */
  @Output() refresh = new EventEmitter<void>();

  @ContentChildren(WeGridCellDirective) cellTemplateDirectives!: QueryList<WeGridCellDirective<T>>;
  @ContentChild(WeGridRowDetailDirective) rowDetailDirective?: WeGridRowDetailDirective<T>;
  @ViewChild('gearButton') gearButtonRef?: ElementRef<HTMLElement>;
  @ViewChild('importFileInput') importFileInputRef?: ElementRef<HTMLInputElement>;

  internalColumns: WeGridInternalColumn<T>[] = [];
  renderColumns: WeGridInternalColumn<T>[] = [];
  displayData: T[] = [];
  density: WeGridDensity = 'normal';
  selectedKeys = new Set<unknown>();
  /** Keys of expanded rows — NOT persisted, resets when the page changes */
  expandedKeys = new Set<unknown>();
  /**
   * A row is added here the first time it's expanded, and is NEVER removed again even after it's
   * collapsed — see the note on `toggleRowExpand`: the detail content is mounted with `@if` only
   * once (on first expansion), subsequent toggles use `[hidden]`. This works around a behavior
   * observed reproducibly in this environment's test setup: once an `@if`/`*ngIf` view has become
   * true, transitioning back to false does NOT remove it from the DOM again — only the very first
   * false→true transition is reliable.
   */
  private readonly mountedDetailKeys = new Set<unknown>();
  readonly skeletonRows = Array.from({ length: 6 }, (_, i) => i);
  readonly expandColWidth = 32;

  // ─── Filter row state ────────────────────────────────────────────────
  /** Whether the filter row is open — only togglable from the toolbar while `filterRow=true` */
  filterRowVisible = false;
  /** field → that column's current filter state; a column the user never touched is absent from the Map entirely */
  readonly filterState = new Map<string, WeGridColumnFilterState>();

  // ─── Grouping state ──────────────────────────────────────────────────
  /** The field currently grouped by — null means grouping is off (single-level grouping only) */
  groupField: string | null = null;
  /** null means the template renders the old (ungrouped) rows — see we-grid.component.html */
  groupedSections: WeGridGroupSection<T>[] | null = null;
  /** Collapsed group keys — preserves the user's open/closed preference even as displayData refreshes */
  private readonly groupCollapsedKeys = new Set<string>();

  private readonly destroy$ = new Subject<void>();
  private readonly layoutSave$ = new Subject<void>();
  /** The filter row applies LOCALLY on every keystroke instantly; this subject only debounces the
   * OUTGOING (filterChange) event by 400ms — if the consumer binds it to the backend, it won't fire one request per keystroke. */
  private readonly filterEmit$ = new Subject<void>();
  private readonly cellTemplateMap = new Map<string, TemplateRef<WeGridCellContext<T>>>();
  private readonly measureCanvas: HTMLCanvasElement | null = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  private clientSort: { field: string; direction: WeGridSortDirection } | null = null;
  private overlayRef: OverlayRef | null = null;
  /** The filter popover opened from a column header's funnel icon — a SEPARATE overlay, independent from the header menu; the two never stay open at once */
  private filterOverlayRef: OverlayRef | null = null;
  private filterPopoverComponentRef: ComponentRef<WeGridFilterPopoverComponent> | null = null;
  /** Which column's popover was opened by clicking its funnel icon, so a second click on the same icon toggles it closed */
  filterPopoverOpenField: string | null = null;
  /** The column behind the open popover — kept so a `data` change can refresh an open checklist's values */
  private filterPopoverColumn: WeGridInternalColumn<T> | null = null;
  /**
   * field → (value key → readable label) of every checklist value seen so far. A picked value that
   * the next page no longer contains still has to render with its own label, both in the list and
   * on the filter chip, and by then there is no row left to run `displayValue` against.
   */
  private readonly checklistLabels = new Map<string, Map<string, string>>();
  /** Signature of the last emitted filter set — drives `resetPage` on the (filterChange) payload */
  private lastEmittedFilterSignature: string | null = null;
  /** A warning is logged once per field — doesn't spam the console every time the menu is opened */
  private readonly warnedNumericCustomFields = new Set<string>();

  // ─── Row editing state ───────────────────────────────────────────────
  /** The row currently being edited or created — null while nothing is in edit mode */
  edit: WeGridEditState<T> | null = null;
  /** Row keys whose delete is waiting on the consumer's `done` callback */
  readonly deletingKeys = new Set<unknown>();

  /**
   * The single strip under the toolbar used to report the outcome of an import, a failed commit or
   * a failed delete. One mechanism rather than three: these are all "something the user just asked
   * for finished this way" messages, and only the most recent one is worth showing.
   */
  notice: { text: string; error: boolean } | null = null;

  constructor(
    private readonly overlay: Overlay,
    private readonly cdr: ChangeDetectorRef,
    private readonly elementRef: ElementRef<HTMLElement>,
    private readonly ngZone: NgZone,
    private readonly sanitizer: DomSanitizer,
    @Inject(WE_GRID_LAYOUT_STORE) private readonly layoutStore: WeGridLayoutStore,
    @Inject(WE_GRID_LOCALE) readonly locale: WeGridLocale,
    @Inject(WE_GRID_ICONS) private readonly icons: WeGridIcons,
    @Inject(WE_GRID_EXPORTER) private readonly exporter: WeGridExporter,
    @Inject(WE_GRID_IMPORT_PARSER) private readonly importParser: WeGridImportParser
  ) {}

  icon(key: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.icons[key] ?? '');
  }

  /** `emptyMessage` input if given, otherwise the current locale's default */
  get resolvedEmptyMessage(): string {
    return this.emptyMessage || this.locale.emptyMessage;
  }

  /**
   * Whether sorting is really happening on the server. While 'auto', whether (sortChange) has a
   * subscriber is the criterion — if the template wrote `(sortChange)="..."`, the EventEmitter's
   * `observed` becomes true.
   */
  get isServerSort(): boolean {
    if (!this.serverSide || this.sortMode === 'client') return false;
    return this.sortMode === 'server' || this.sortChange.observed;
  }

  /** Whether filtering is really happening on the server — see isServerSort */
  get isServerFilter(): boolean {
    if (!this.serverSide || this.filterMode === 'client') return false;
    return this.filterMode === 'server' || this.filterChange.observed;
  }

  get currentSort(): { field: string; direction: WeGridSortDirection } | null {
    if (this.isServerSort) {
      return this.sortField ? { field: this.sortField, direction: this.sortDirection } : null;
    }
    return this.clientSort;
  }

  /**
   * serverSide=true but the grid is sorting on its own — meaning only the LOADED PAGE was sorted.
   * The sort counterpart of the "only this page is searched" filter warning.
   */
  get isSortingPageOnly(): boolean {
    return this.serverSide && !this.isServerSort && !!this.clientSort;
  }

  /**
   * `table-layout:fixed` only fixes column sizes from the first row's widths in the browser, but
   * the table doesn't shrink itself with `width:auto` (confirmed in Chromium: after a resize that
   * narrows a column, the table's overall width isn't updated). So we compute the table's total
   * width here and bind it directly to `<table>`.
   */
  get tableWidthPx(): number {
    return (
      this.expandColWidthPx +
      this.selectColWidthPx +
      this.actionColWidthPx +
      this.renderColumns.reduce((sum, c) => sum + c.width, 0)
    );
  }

  /** Whether the row-action column is rendered at all — it costs a column, so only when it is used */
  get hasRowActions(): boolean {
    return this.editable || this.allowDelete;
  }

  /**
   * Row-action column width in px. It is pinned to the far RIGHT, so it also shifts every
   * right-pinned data column inward (see recomputeRenderColumns) — otherwise the last pinned
   * column would sit underneath the action buttons.
   */
  get actionColWidthPx(): number {
    return this.hasRowActions ? WE_GRID_ACTION_COL_WIDTH : 0;
  }

  /** Selection column width in px — also used when computing pinned-left offsets (recomputeRenderColumns) */
  private get selectColWidthPx(): number {
    return this.selectable !== 'none' ? 42 : 0;
  }

  /**
   * Expand/collapse arrow column width in px — sits to the left of even the selection column
   * (leftmost of all). Public because the template binds it for the select-col's [style.left.px].
   */
  get expandColWidthPx(): number {
    return this.expandable ? this.expandColWidth : 0;
  }

  /** Total column count for the empty row's colspan and the detail row's single cell */
  get totalColSpan(): number {
    return (
      this.renderColumns.length +
      (this.selectable !== 'none' ? 1 : 0) +
      (this.expandable ? 1 : 0) +
      (this.hasRowActions ? 1 : 0)
    );
  }

  /** The summary row is never rendered when no column has a summary selected — avoids an empty-looking strip */
  get hasSummaryRow(): boolean {
    return this.internalColumns.some((c) => c.summary !== 'none');
  }

  /** Whether at least one column has a truly applied (non-empty/default) filter */
  get hasActiveFilters(): boolean {
    for (const f of this.filterState.values()) {
      if (isWeGridFilterActive(f)) return true;
    }
    return false;
  }

  /**
   * While serverSide=true, filtering only operates on the LOADED PAGE — to prevent the user from
   * assuming "I'm searching across all records", this flag drives a warning shown in the active
   * filter chip strip. NOTE: this used to also depend on `filterRowVisible` — since filtering is
   * now primarily done via the header funnel icon, the filter row's open/closed state does NOT
   * affect this warning's visibility any more.
   */
  get isFilteringPageOnly(): boolean {
    return this.serverSide && !this.isServerFilter && this.hasColumnFilters && this.hasActiveFilters;
  }

  /**
   * Whether any column filtering UI exists on this grid at all — either the filter row is enabled,
   * or a column opted into the checklist header filter. Drives the chip strip and the page-scope
   * warning, which used to key off `filterRow` alone.
   */
  get hasColumnFilters(): boolean {
    return this.filterRow || this.internalColumns.some((c) => c.headerFilterMode === 'checklist');
  }

  /**
   * Whether this column's header shows a funnel icon. A checklist column carries its own, so
   * `headerFilterMode: 'checklist'` works without turning the whole filter row on; every other
   * column keeps the previous rule (visible only while `filterRow` is true).
   */
  showFilterIcon(col: WeGridInternalColumn<T>): boolean {
    return col.filterable && (this.filterRow || col.headerFilterMode === 'checklist');
  }

  /** Active filter chips — "Column: value ×" style, shown in the strip above the table (see we-grid.component.html) */
  get activeFilterChips(): { field: string; label: string }[] {
    if (this.filterState.size === 0) return [];
    const chips: { field: string; label: string }[] = [];
    for (const col of this.internalColumns) {
      const filter = this.filterState.get(col.field);
      if (filter && isWeGridFilterActive(filter)) {
        chips.push({
          field: col.field,
          label: weGridFilterChipLabel(
            { type: col.type, format: col.format, header: weGridDisplayHeader(col) },
            filter,
            this.locale,
            (value) => this.checklistValueLabel(col, value)
          )
        });
      }
    }
    return chips;
  }

  /** "how many records" — the backend's overall total when serverSide, otherwise the loaded row count */
  get totalRecordCountForSummary(): number {
    return this.serverSide ? this.totalCount : this.displayData.length;
  }

  get totalPagesComputed(): number {
    return Math.max(1, Math.ceil(this.totalCount / Math.max(1, this.pageSize)));
  }

  /**
   * The library-independent equivalent of ngb-pagination's maxSize=5 + rotate behavior — we-grid
   * must not depend on ng-bootstrap (it should work in other projects too), so the page window is
   * computed by hand here. The active page stays centered in the window, clamping at the ends.
   * First/last page numbers not in the window are shown separately by the template (with an
   * ellipsis if needed).
   */
  get pageNumbersComputed(): number[] {
    const total = this.totalPagesComputed;
    const maxSize = 5;
    if (total <= maxSize) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    let start = this.page - Math.floor(maxSize / 2);
    let end = this.page + Math.ceil(maxSize / 2) - 1;
    if (start < 1) {
      end += 1 - start;
      start = 1;
    }
    if (end > total) {
      start -= end - total;
      end = total;
    }
    start = Math.max(start, 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  get allSelected(): boolean {
    return this.displayData.length > 0 && this.displayData.every((row) => this.isSelected(row));
  }

  ngOnInit(): void {
    this.layoutSave$.pipe(debounceTime(500), takeUntil(this.destroy$)).subscribe(() => this.persistLayout());
    // debounce(() => timer(...)) rather than debounceTime(400) so a consumer can change
    // filterDebounceMs at runtime without the grid having to rebuild the subscription.
    this.filterEmit$
      .pipe(
        debounce(() => timer(Math.max(0, this.filterDebounceMs))),
        takeUntil(this.destroy$)
      )
      .subscribe(() => this.emitFilterChange());
    this.loadLayout();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['columns'] && !changes['columns'].firstChange) {
      this.rebuildColumnsFromDefs();
    }
    if (changes['data'] || changes['sortField'] || changes['sortDirection'] || changes['serverSide']) {
      this.refreshDisplayData();
    }
    // A checklist lists the values of the LOADED rows, so a new page has to be reflected in an
    // already open popover — the selection itself lives in the popover and is left alone.
    if (changes['data'] && this.filterPopoverColumn?.headerFilterMode === 'checklist') {
      this.filterPopoverComponentRef?.setInput('options', this.checklistOptionsFor(this.filterPopoverColumn));
    }
    // Expanded rows reset when the page changes — prevents the wrong row from appearing open;
    // expansion is transient UI state, not a persisted layout preference.
    if (changes['page'] && !changes['page'].firstChange) {
      this.expandedKeys.clear();
      this.mountedDetailKeys.clear();
      // An open editor belongs to a row of the page being left — keeping it would attach the
      // draft to whichever row happens to land on the same key on the new page.
      this.edit = null;
    }
    // The action column is pinned right, so turning it on or off changes every right-pinned
    // column's offset — without this the pinned columns would sit underneath the buttons.
    if ((changes['editable'] || changes['allowDelete']) && this.internalColumns.length > 0) {
      this.recomputeRenderColumns();
    }
  }

  ngAfterContentInit(): void {
    this.rebuildCellTemplateMap();
    this.cellTemplateDirectives.changes.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.rebuildCellTemplateMap();
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.closeHeaderMenu();
    this.closeFilterPopover();
    this.destroy$.next();
    this.destroy$.complete();
  }

  trackByRow = (row: T): unknown => this.rowKey(row);

  // ─── Layout loading / merging ─────────────────────────────────────────
  private loadLayout(): void {
    this.layoutStore
      .load(this.gridKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe((saved) => {
        const merged = mergeGridLayout(this.columns, saved, this.layoutVersion);
        this.internalColumns = merged.columns;
        if (merged.density) this.density = merged.density;
        this.filterRowVisible = merged.filterRowVisible ?? false;
        this.recomputeRenderColumns();
        this.refreshDisplayData();
        this.cdr.markForCheck();
      });
  }

  private rebuildColumnsFromDefs(): void {
    const synthetic: WeGridLayout = {
      gridKey: this.gridKey,
      version: this.layoutVersion,
      density: this.density,
      columns: toColumnLayout(this.internalColumns, this.columns)
    };
    const merged = mergeGridLayout(this.columns, synthetic, this.layoutVersion);
    this.internalColumns = merged.columns;
    this.recomputeRenderColumns();
  }

  private recomputeRenderColumns(): void {
    const visible = this.internalColumns.filter((c) => c.visible).sort((a, b) => a.order - b.order);
    const left = visible.filter((c) => c.pinned === 'left');
    const right = visible.filter((c) => c.pinned === 'right');
    const middle = visible.filter((c) => !c.pinned);

    // Left-pinned columns are laid out cumulatively after the expand arrow (32px if present) and
    // the selection column (42px if present) — otherwise they'd all get left:0 and overlap.
    let leftOffset = this.expandColWidthPx + this.selectColWidthPx;
    for (const col of left) {
      col.pinnedOffset = leftOffset;
      leftOffset += col.width;
    }

    // On the right side, the last-rendered (rightmost) column gets right:0, and each preceding
    // one shifts inward by the cumulative width of the ones after it. The row-action column is
    // itself pinned right at right:0, so the whole stack starts after it.
    let rightOffset = this.actionColWidthPx;
    for (let i = right.length - 1; i >= 0; i--) {
      right[i].pinnedOffset = rightOffset;
      rightOffset += right[i].width;
    }

    this.renderColumns = [...left, ...middle, ...right];
  }

  private persistLayout(): void {
    const layout = this.buildLayoutSnapshot();
    this.layoutStore.save(this.gridKey, layout).pipe(takeUntil(this.destroy$)).subscribe();
    this.layoutChange.emit(layout);
  }

  private buildLayoutSnapshot(): WeGridLayout {
    return {
      gridKey: this.gridKey,
      version: this.layoutVersion,
      density: this.density,
      columns: toColumnLayout(this.internalColumns, this.columns),
      filterRowVisible: this.filterRowVisible
    };
  }

  private scheduleLayoutSave(): void {
    this.layoutSave$.next();
  }

  // ─── Cell templates ────────────────────────────────────────────────────
  private rebuildCellTemplateMap(): void {
    this.cellTemplateMap.clear();
    this.cellTemplateDirectives?.forEach((d) => this.cellTemplateMap.set(d.field, d.templateRef));
  }

  getCellTemplate(col: WeGridInternalColumn<T>): TemplateRef<WeGridCellContext<T>> | null {
    return this.cellTemplateMap.get(col.field) ?? col.cellTemplate ?? null;
  }

  buildCellContext(row: T, col: WeGridInternalColumn<T>, rowIndex: number): WeGridCellContext<T> {
    return {
      $implicit: row,
      row,
      value: getNestedValue(row, col.field),
      rowIndex,
      column: { field: col.field, header: weGridDisplayHeader(col), type: col.type }
    };
  }

  formatCell(row: T, col: WeGridInternalColumn<T>): string {
    return formatWeGridValue(getNestedValue(row, col.field), col.type, col.format, { yesLabel: this.locale.yes, noLabel: this.locale.no });
  }

  displayHeader(col: WeGridInternalColumn<T>): string {
    return weGridDisplayHeader(col);
  }

  // ─── Sorting ─────────────────────────────────────────────────────────
  onHeaderLabelClick(col: WeGridInternalColumn<T>): void {
    if (!col.sortable) return;
    let next: WeGridSortDirection;
    const current = this.currentSort;
    if (!current || current.field !== col.field) next = 'asc';
    else if (current.direction === 'asc') next = 'desc';
    else next = null;
    this.applySort(col.field, next);
  }

  private applySort(field: string, direction: WeGridSortDirection): void {
    if (!this.isServerSort) {
      this.clientSort = direction ? { field, direction } : null;
      this.refreshDisplayData();
    }
    this.sortChange.emit({ field: direction ? field : null, direction });
    this.scheduleLayoutSave();
    this.cdr.markForCheck();
  }

  ariaSort(col: WeGridInternalColumn<T>): 'ascending' | 'descending' | 'none' {
    const sort = this.currentSort;
    if (!sort || sort.field !== col.field) return 'none';
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  }

  private refreshDisplayData(): void {
    // The filter row only ever operates on the loaded rows (this.data) — on screens with
    // serverSide=true, that means "the loaded page", not the entire dataset (see the filterRow
    // Input JSDoc and the "only this page is searched" hint in the template). If there's no
    // filter, the same reference is kept as-is — no unnecessary copy or CD trigger.
    // If isServerFilter is true, the backend already returns filtered data — filtering again here
    // would double-apply it (especially with operators like 'contains', where the backend and the
    // local comparison rules can differ, causing rows to be lost).
    const source =
      this.hasActiveFilters && !this.isServerFilter
        ? applyWeGridFilters(this.data, this.filterState, this.internalColumns)
        : this.data;

    if (this.isServerSort || !this.clientSort) {
      this.displayData = source;
      this.applyGrouping();
      return;
    }
    const { field, direction } = this.clientSort;
    const copy = [...source];
    copy.sort((a, b) => {
      const va = getNestedValue(a, field);
      const vb = getNestedValue(b, field);
      if (va == null && vb == null) return 0;
      if (va == null) return direction === 'asc' ? -1 : 1;
      if (vb == null) return direction === 'asc' ? 1 : -1;
      if (va < vb) return direction === 'asc' ? -1 : 1;
      if (va > vb) return direction === 'asc' ? 1 : -1;
      return 0;
    });
    this.displayData = copy;
    this.applyGrouping();
  }

  // ─── Pagination ──────────────────────────────────────────────────────
  goToPage(newPage: number): void {
    const clamped = Math.min(Math.max(1, newPage), this.totalPagesComputed);
    if (clamped === this.page) return;
    this.pageChange.emit({ page: clamped, pageSize: this.pageSize });
  }

  // ─── Row events / selection ────────────────────────────────────────
  onRowClick(row: T, index: number): void {
    this.rowClick.emit({ row, rowIndex: index });
  }

  onRowDblClick(row: T, index: number): void {
    this.rowDblClick.emit({ row, rowIndex: index });
  }

  /** Returns null when `rowClass` isn't given — [ngClass] accepts null fine, no extra class is added */
  rowClassFor(row: T, index: number): string | string[] | Record<string, boolean> | null {
    return this.rowClass ? this.rowClass(row, index) : null;
  }

  private rowKey(row: T): unknown {
    return this.trackByField ? row[this.trackByField] : row;
  }

  // ─── Subtotal (summary row) ────────────────────────────────────────────
  /** Builds a column's summary cell text — null when 'none' (nothing at all is printed in the cell) */
  summaryCellText(col: WeGridInternalColumn<T>): string | null {
    const scope = this.serverSide ? 'server' : 'client';
    return buildWeGridSummaryText(this.displayData, col, scope, this.summaryValues?.[col.field], this.locale);
  }

  // ─── Filter row ────────────────────────────────────────────────────────
  toggleFilterRowVisible(): void {
    if (!this.filterRow) return;
    this.filterRowVisible = !this.filterRowVisible;
    this.scheduleLayoutSave();
    this.cdr.markForCheck();
  }

  /** Returns the column's current filter state, producing a type-appropriate empty default if never touched (does NOT write to the Map) */
  getFilterState(col: WeGridInternalColumn<T>): WeGridColumnFilterState {
    const current = this.filterState.get(col.field);
    if (current) return current;
    // A checklist column starts from an empty 'in' selection rather than the type's operator
    // default — that is what the popover reads to seed its checkboxes.
    if (col.headerFilterMode === 'checklist') {
      return { field: col.field, operator: 'in', value: [] };
    }
    return {
      field: col.field,
      operator: weGridDefaultFilterOperator(col.type),
      value: weGridEmptyFilterValue(col.type)
    };
  }

  setFilterOperator(col: WeGridInternalColumn<T>, operator: WeGridFilterOperator): void {
    const current = this.getFilterState(col);
    this.filterState.set(col.field, { ...current, operator, value2: operator === 'between' ? current.value2 : undefined });
    this.applyFiltersNow();
  }

  /**
   * `rawValue`'s type varies with the control: Angular's `NumberValueAccessor` gives a plain
   * `number | null` on a number input, while a date/text input gives a `string`. Both are
   * normalized here in one place.
   */
  setFilterValue(col: WeGridInternalColumn<T>, rawValue: string | number | null, which: 'value' | 'value2' = 'value'): void {
    const current = this.getFilterState(col);
    const isEmpty = rawValue === '' || rawValue === null || rawValue === undefined;
    let value: unknown;
    if (col.type === 'number' || col.type === 'currency') {
      value = isEmpty ? null : Number(rawValue);
    } else if (isEmpty) {
      value = col.type === 'boolean' ? 'all' : null;
    } else {
      value = rawValue;
    }
    this.filterState.set(col.field, { ...current, [which]: value });
    this.applyFiltersNow();
  }

  // ─── Checklist header filter ──────────────────────────────────────────
  /**
   * The distinct values of the LOADED rows for a checklist popover. Deliberately computed from the
   * `data` input only — collecting the values a column can take across every page would need a
   * request the library has no business making, so the list is what the user can currently see.
   *
   * Anything the user already picked is merged in even when this page no longer contains it:
   * otherwise paging would silently drop ticks off an active filter.
   */
  checklistOptionsFor(col: WeGridInternalColumn<T>): WeGridChecklistOption[] {
    const labels = this.checklistLabelsFor(col.field);
    const byKey = new Map<string, WeGridChecklistOption>();

    for (const row of this.data) {
      const raw = getNestedValue(row, col.field);
      const blank = raw === null || raw === undefined || raw === '';
      const value = blank ? null : raw;
      const key = weGridFilterValueKey(value);
      if (byKey.has(key)) continue;
      const label = blank ? this.locale.emptyGroupValue : col.displayValue ? col.displayValue(row) : this.formatCell(row, col);
      labels.set(key, label);
      byKey.set(key, { value, key, label, blank });
    }

    const current = this.filterState.get(col.field);
    if (current?.operator === 'in' && Array.isArray(current.value)) {
      for (const value of current.value as unknown[]) {
        const key = weGridFilterValueKey(value);
        if (byKey.has(key)) continue;
        const blank = value === null || value === undefined || value === '';
        byKey.set(key, { value: blank ? null : value, key, label: this.checklistValueLabel(col, value), blank });
      }
    }

    // "(Empty)" first, then alphabetically by label — the same ordering the group headers use.
    return Array.from(byKey.values()).sort((a, b) => {
      if (a.blank !== b.blank) return a.blank ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
  }

  /** Applies a checklist selection — an empty selection removes the column's filter entirely */
  setChecklistFilter(col: WeGridInternalColumn<T>, values: unknown[]): void {
    if (values.length === 0) {
      this.clearColumnFilter(col);
      return;
    }
    this.filterState.set(col.field, { field: col.field, operator: 'in', value: values });
    this.applyFiltersNow();
  }

  /** What the filter row's checklist cell shows — the picked labels, or "All" while nothing is picked */
  checklistButtonLabel(col: WeGridInternalColumn<T>): string {
    const filter = this.filterState.get(col.field);
    if (!filter || !isWeGridFilterActive(filter) || !Array.isArray(filter.value)) return this.locale.all;
    return weGridInFilterValueLabel(filter.value as unknown[], (value) => this.checklistValueLabel(col, value));
  }

  /** The readable label of a single picked value — the remembered one, falling back to plain formatting */
  private checklistValueLabel(col: WeGridInternalColumn<T>, value: unknown): string {
    if (value === null || value === undefined || value === '') return this.locale.emptyGroupValue;
    const remembered = this.checklistLabels.get(col.field)?.get(weGridFilterValueKey(value));
    if (remembered) return remembered;
    return formatWeGridValue(value, col.type, col.format, { yesLabel: this.locale.yes, noLabel: this.locale.no });
  }

  private checklistLabelsFor(field: string): Map<string, string> {
    let labels = this.checklistLabels.get(field);
    if (!labels) {
      labels = new Map<string, string>();
      this.checklistLabels.set(field, labels);
    }
    return labels;
  }

  clearColumnFilter(col: WeGridInternalColumn<T>): void {
    if (!this.filterState.has(col.field)) return;
    this.filterState.delete(col.field);
    this.applyFiltersNow();
  }

  clearAllFilters(): void {
    if (this.filterState.size === 0) return;
    this.filterState.clear();
    this.applyFiltersNow();
  }

  /** The header funnel icon appears filled/colored when this column has an active filter */
  isColumnFilterActive(col: WeGridInternalColumn<T>): boolean {
    return isWeGridFilterActive(this.filterState.get(col.field));
  }

  /** The × button on an active filter chip — looks up the column by field and delegates to clearColumnFilter */
  clearFilterByField(field: string): void {
    const col = this.internalColumns.find((c) => c.field === field);
    if (col) this.clearColumnFilter(col);
  }

  // ─── Header funnel icon — filter popover ──────────────────────────────
  onFilterIconClick(event: Event, col: WeGridInternalColumn<T>, anchorEl: HTMLElement): void {
    event.stopPropagation();
    if (this.filterPopoverOpenField === col.field) {
      this.closeFilterPopover();
      return;
    }
    this.openFilterPopover(anchorEl, col);
  }

  private openFilterPopover(origin: HTMLElement, col: WeGridInternalColumn<T>): void {
    this.closeHeaderMenu();
    this.closeFilterPopover();

    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(origin)
      .withPositions([
        { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
        { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -4 },
        { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
        { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 }
      ])
      .withPush(true)
      .withViewportMargin(8);

    this.filterOverlayRef = this.overlay.create({
      positionStrategy,
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      hasBackdrop: true,
      backdropClass: 'we-grid-menu-backdrop',
      panelClass: 'we-grid-menu-panel'
    });
    this.filterPopoverOpenField = col.field;

    this.filterOverlayRef
      .backdropClick()
      .pipe(take(1), takeUntil(this.destroy$))
      .subscribe(() => this.closeFilterPopover(origin));

    this.filterOverlayRef
      .keydownEvents()
      .pipe(takeUntil(this.destroy$))
      .subscribe((e) => {
        if (e.key === 'Escape') this.closeFilterPopover(origin);
      });

    const portal = new ComponentPortal(WeGridFilterPopoverComponent);
    const componentRef = this.filterOverlayRef.attach(portal);
    this.filterPopoverComponentRef = componentRef;
    this.filterPopoverColumn = col;
    componentRef.setInput('column', col);
    componentRef.setInput('filterState', this.getFilterState(col));
    componentRef.setInput('options', col.headerFilterMode === 'checklist' ? this.checklistOptionsFor(col) : []);

    componentRef.instance.action.pipe(takeUntil(this.destroy$)).subscribe((action) => this.handleFilterPopoverAction(col, action, origin));

    componentRef.changeDetectorRef.detectChanges();
    componentRef.instance.focusFirstControl();
  }

  private handleFilterPopoverAction(col: WeGridInternalColumn<T>, action: WeGridFilterPopoverAction, returnFocusEl: HTMLElement): void {
    switch (action.type) {
      case 'operator':
        this.setFilterOperator(col, action.operator);
        break;
      case 'value':
        this.setFilterValue(col, action.value, action.which);
        break;
      case 'checklist':
        // Unlike the operator mode the checklist applies once, on Apply — so it closes right after,
        // the way a dialog with an OK button does.
        this.setChecklistFilter(col, action.values);
        this.closeFilterPopover(returnFocusEl);
        return;
      case 'clear':
        this.clearColumnFilter(col);
        this.closeFilterPopover(returnFocusEl);
        return;
      case 'close':
        this.closeFilterPopover(returnFocusEl);
        return;
    }
    // Selecting the 'between' operator reveals a value2 field etc. — the popover has its own CD
    // (OnPush, a separate component), so we feed the up-to-date state back manually (same pattern
    // as re-setInput'ing allColumns after a 'toggle-column' in the header menu).
    this.filterPopoverComponentRef?.setInput('filterState', this.getFilterState(col));
  }

  private closeFilterPopover(returnFocusEl?: HTMLElement | null): void {
    this.filterPopoverOpenField = null;
    this.filterPopoverColumn = null;
    if (!this.filterOverlayRef) return;
    this.filterOverlayRef.dispose();
    this.filterOverlayRef = null;
    this.filterPopoverComponentRef = null;
    returnFocusEl?.focus();
  }

  private applyFiltersNow(): void {
    // Local application happens INSTANTLY (no backend request per keystroke) — only the outgoing
    // (filterChange) event is debounced, see the filterEmit$ subscription in ngOnInit.
    this.refreshDisplayData();
    this.filterEmit$.next();
    this.cdr.markForCheck();
  }

  /**
   * Emits the debounced (filterChange). `resetPage` compares the filter set against the previously
   * emitted one: a debounce window that happens to end on the same filters (typed and deleted
   * again) is not a reason to send the screen back to page 1.
   */
  private emitFilterChange(): void {
    const active = Array.from(this.filterState.values()).filter(isWeGridFilterActive);
    const signature = JSON.stringify(active.map((f) => [f.field, f.operator, f.value ?? null, f.value2 ?? null]));
    const resetPage = signature !== this.lastEmittedFilterSignature;
    this.lastEmittedFilterSignature = signature;
    this.filterChange.emit(weGridFilterChangeEvent(active, resetPage));
  }

  private applyQuickFilter(field: string, rawValue: unknown): void {
    const col = this.internalColumns.find((c) => c.field === field);
    if (!col) return;
    const value = weGridQuickFilterValueToInputString(rawValue, col.type);
    const operator: WeGridFilterOperator = col.type === 'text' || col.type === 'custom' ? 'equals' : 'eq';
    this.filterState.set(field, { field, operator, value });
    this.filterRowVisible = true;
    this.applyFiltersNow();
    this.scheduleLayoutSave();
  }

  // ─── Grouping ────────────────────────────────────────────────────────
  /** Called at the end of refreshDisplayData whenever displayData (post filter+sort) changes */
  private applyGrouping(): void {
    if (!this.groupField) {
      this.groupedSections = null;
      return;
    }
    const field = this.groupField;
    const col = this.internalColumns.find((c) => c.field === field);
    // When displayValue is given, the group key is also built from the LABEL — otherwise
    // different raw codes that map to the same label (e.g. two legacy status codes both showing
    // "Draft") would end up as two separate groups with the same visible heading, which is confusing.
    const buckets = new Map<string, T[]>();
    for (const row of this.displayData) {
      const raw = getNestedValue(row, field);
      const isEmptyRaw = raw === null || raw === undefined || raw === '';
      const key = isEmptyRaw ? ' EMPTY' : col?.displayValue ? col.displayValue(row) : String(raw);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(row);
      else buckets.set(key, [row]);
    }
    this.groupedSections = Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, rows]) => {
        const isEmpty = key === ' EMPTY';
        const label = isEmpty
          ? this.locale.emptyGroupValue
          : col?.displayValue
            ? col.displayValue(rows[0])
            : col
              ? formatWeGridValue(getNestedValue(rows[0], field), col.type, col.format, { yesLabel: this.locale.yes, noLabel: this.locale.no })
              : key;
        return {
          key,
          label,
          collapsed: this.groupCollapsedKeys.has(key),
          rows: rows.map((row) => ({ row, index: this.displayData.indexOf(row) }))
        };
      });
  }

  /** The × button on the toolbar's grouping chip — does the same thing as 'Remove grouping' in the context menu */
  clearGrouping(): void {
    if (!this.groupField) return;
    this.groupField = null;
    this.applyGrouping();
    this.groupChange.emit(null);
    this.cdr.markForCheck();
  }

  toggleGroupCollapse(section: WeGridGroupSection<T>): void {
    section.collapsed = !section.collapsed;
    if (section.collapsed) this.groupCollapsedKeys.add(section.key);
    else this.groupCollapsedKeys.delete(section.key);
    this.cdr.markForCheck();
  }

  groupFieldHeaderLabel(): string {
    const col = this.internalColumns.find((c) => c.field === this.groupField);
    return col ? weGridDisplayHeader(col) : (this.groupField ?? '');
  }

  /** "Column Label: value" fragments shown in the group header — null if no column has a summary selected (see hasSummaryRow) */
  groupSummaryLabel(section: WeGridGroupSection<T>): string | null {
    if (!this.hasSummaryRow) return null;
    const rows = section.rows.map((e) => e.row);
    const parts: string[] = [];
    for (const col of this.internalColumns) {
      if (col.summary === 'none') continue;
      const text = buildWeGridSummaryText(rows, col, 'client', undefined, this.locale);
      if (text) parts.push(`${weGridDisplayHeader(col)} ${text}`);
    }
    return parts.length ? parts.join(' · ') : null;
  }

  // ─── Row expansion (master-detail) ─────────────────────────────────────
  /** Expansion is active when expandable=true AND the consumer supplied a weGridRowDetail template */
  get canExpandRows(): boolean {
    return this.expandable && !!this.rowDetailDirective;
  }

  isRowExpanded(row: T): boolean {
    return this.expandedKeys.has(this.rowKey(row));
  }

  /** Whether the detail content has been mounted at least once for this row — see the note on `mountedDetailKeys` */
  isRowDetailMounted(row: T): boolean {
    return this.mountedDetailKeys.has(this.rowKey(row));
  }

  toggleRowExpand(row: T, event?: Event): void {
    event?.stopPropagation();
    const key = this.rowKey(row);
    if (this.expandedKeys.has(key)) {
      this.expandedKeys.delete(key);
    } else {
      this.expandedKeys.add(key);
      this.mountedDetailKeys.add(key);
    }
    this.cdr.markForCheck();
  }

  /**
   * If `ngTemplateOutlet` is given a brand-new context object on every CD cycle (reference
   * change), the directive tears down and rebuilds its own view — colliding with the `*ngIf`
   * wrapping this row in the SAME CD cycle meant the detail row wasn't being removed from the DOM
   * on collapse (reproduced reliably, see we-grid.component.spec.ts). We cache the context object
   * per rowKey and only refresh it when row/rowIndex actually change.
   */
  private readonly rowDetailContextCache = new Map<unknown, WeGridRowDetailContext<T>>();

  buildRowDetailContext(row: T, rowIndex: number): WeGridRowDetailContext<T> {
    const key = this.rowKey(row);
    const cached = this.rowDetailContextCache.get(key);
    if (cached && cached.row === row && cached.rowIndex === rowIndex) {
      return cached;
    }
    const ctx: WeGridRowDetailContext<T> = { $implicit: row, row, rowIndex };
    this.rowDetailContextCache.set(key, ctx);
    return ctx;
  }

  isSelected(row: T): boolean {
    return this.selectedKeys.has(this.rowKey(row));
  }

  toggleRowSelection(row: T, event?: Event): void {
    event?.stopPropagation();
    if (this.selectable === 'none') return;
    const key = this.rowKey(row);
    if (this.selectable === 'single') {
      this.selectedKeys.clear();
      this.selectedKeys.add(key);
    } else if (this.selectedKeys.has(key)) {
      this.selectedKeys.delete(key);
    } else {
      this.selectedKeys.add(key);
    }
    this.emitSelectionChange();
  }

  toggleSelectAll(): void {
    if (this.allSelected) {
      this.displayData.forEach((row) => this.selectedKeys.delete(this.rowKey(row)));
    } else {
      this.displayData.forEach((row) => this.selectedKeys.add(this.rowKey(row)));
    }
    this.emitSelectionChange();
  }

  private emitSelectionChange(): void {
    this.selectionChange.emit(this.selectedRows);
    this.cdr.markForCheck();
  }

  // ─── Export ──────────────────────────────────────────────────────────
  /** The rows currently ticked, in display order — also what an export covers when non-empty */
  get selectedRows(): T[] {
    return this.displayData.filter((row) => this.isSelected(row));
  }

  /**
   * An export covers the selection when there is one, otherwise every loaded row. There is
   * deliberately no menu to choose between them: "export what I picked, or everything if I picked
   * nothing" is what users expect, and the button's tooltip says which one will happen.
   */
  get exportScope(): WeGridExportScope {
    return this.selectedRows.length > 0 ? 'selected' : 'all';
  }

  /** Hidden columns and columns marked `exportable: false` (action buttons, ...) stay out of the file */
  get exportColumns(): WeGridInternalColumn<T>[] {
    return this.renderColumns.filter((c) => c.exportable);
  }

  /** Whether the backend produces the file — see isServerSort for the same 'auto' reasoning */
  get isServerExport(): boolean {
    if (!this.serverSide || this.exportMode === 'client') return false;
    return this.exportMode === 'server' || this.exportRequest.observed;
  }

  exportFormatLabel(format: WeGridExportFormat): string {
    if (format === 'csv') return this.locale.exportCsv;
    if (format === 'xlsx') return this.locale.exportExcel;
    return this.locale.exportPdf;
  }

  exportFormatIcon(format: WeGridExportFormat): string {
    return format === 'pdf' ? 'fileDoc' : 'fileTable';
  }

  /** "Excel (.xlsx) · Selected rows" — makes the scope visible before the click, not after */
  exportButtonTitle(format: WeGridExportFormat): string {
    const scope = this.exportScope === 'selected' ? this.locale.exportSelectedRows : this.locale.exportAllRows;
    return `${this.exportFormatLabel(format)} · ${scope}`;
  }

  exportAs(format: WeGridExportFormat): void {
    const scope = this.exportScope;
    const rows = scope === 'selected' ? this.selectedRows : this.displayData;
    const table = this.buildExportTable(rows);
    this.exportRequest.emit({ format, scope, rows, table });
    if (this.isServerExport) return;
    void Promise.resolve(this.exporter.export(table, format)).catch((error: unknown) => {
      this.showNotice(this.describeError(error, this.locale.saveFailed), true);
    });
  }

  /** Flattens the current column/row state into the renderer-agnostic shape every exporter consumes */
  private buildExportTable(rows: T[]): WeGridExportTable {
    const columns = this.exportColumns;
    const title = this.exportFileName || this.gridKey;
    return {
      fileName: title,
      title,
      columns: columns.map((col) => ({
        field: col.field,
        header: weGridDisplayHeader(col),
        type: col.type,
        format: col.format,
        align: col.align,
        width: col.width,
        useDisplayText: !!col.displayValue
      })),
      rows: rows.map((row) => ({
        values: columns.map((col) => getNestedValue(row, col.field)),
        text: columns.map((col) => (col.displayValue ? col.displayValue(row) : this.formatCell(row, col)))
      })),
      summary: this.hasSummaryRow ? columns.map((col) => this.summaryCellText(col)) : null,
      cssVariables: this.readExportThemeVariables()
    };
  }

  private readExportThemeVariables(): Record<string, string> {
    if (typeof window === 'undefined') return {};
    const styles = window.getComputedStyle(this.elementRef.nativeElement);
    const variables: Record<string, string> = {};
    for (const name of WE_GRID_EXPORT_THEME_VARIABLES) {
      const value = styles.getPropertyValue(name).trim();
      if (value) variables[name] = value;
    }
    return variables;
  }

  // ─── Import ──────────────────────────────────────────────────────────
  /** `accept` attribute of the hidden file input, built from `importFormats` */
  get importAccept(): string {
    const parts: string[] = [];
    if (this.importFormats.includes('csv')) parts.push('.csv', 'text/csv');
    if (this.importFormats.includes('xlsx')) {
      parts.push('.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
    return parts.join(',');
  }

  openImportPicker(): void {
    this.importFileInputRef?.nativeElement.click();
  }

  async onImportFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Cleared straight away so picking the SAME file again still fires a change event.
    input.value = '';
    if (!file) return;

    const format: WeGridImportFormat = /\.xlsx$/i.test(file.name) ? 'xlsx' : 'csv';
    if (!this.importFormats.includes(format)) {
      this.showNotice(this.locale.importFailed, true);
      return;
    }

    try {
      const sheet = await this.importParser.parse(file, format);
      // Every column is offered for matching, including hidden ones — a file may legitimately
      // carry a column the user has hidden on screen.
      const mapped = weGridMapImportedRows(
        sheet,
        this.internalColumns.map((col) => ({ field: col.field, header: weGridDisplayHeader(col), type: col.type }))
      );
      const result: WeGridImportResult<T> = {
        format,
        fileName: file.name,
        rows: mapped.rows as Partial<T>[],
        headers: sheet.headers,
        unmappedHeaders: mapped.unmappedHeaders,
        errors: mapped.errors
      };
      const details = mapped.unmappedHeaders.length
        ? ` · ${this.locale.importUnmappedColumns} ${mapped.unmappedHeaders.join(', ')}`
        : '';
      this.showNotice(this.locale.importSucceeded(result.rows.length) + details, mapped.errors.length > 0);
      this.importData.emit(result);
    } catch (error: unknown) {
      this.showNotice(this.describeError(error, this.locale.importFailed), true);
    }
  }

  private describeError(error: unknown, fallback: string): string {
    const message = error instanceof Error ? error.message : '';
    return message ? `${fallback} — ${message}` : fallback;
  }

  private showNotice(text: string, isError: boolean): void {
    this.notice = { text, error: isError };
    this.cdr.markForCheck();
  }

  dismissNotice(): void {
    this.notice = null;
    this.cdr.markForCheck();
  }

  // ─── Inline row editing ──────────────────────────────────────────────
  /** True while the draft row of a NEW record is open */
  get isCreating(): boolean {
    return this.edit?.key === WE_GRID_NEW_ROW_KEY;
  }

  isEditingRow(row: T): boolean {
    return !!this.edit && !this.isCreating && this.edit.key === this.rowKey(row);
  }

  isRowDeleting(row: T): boolean {
    return this.deletingKeys.has(this.rowKey(row));
  }

  /** Whether this cell shows an editor right now — the row is in edit mode AND the column allows it */
  isCellEditing(row: T, col: WeGridInternalColumn<T>): boolean {
    return col.editable && this.isEditingRow(row);
  }

  draftValue(col: WeGridInternalColumn<T>): unknown {
    return this.edit ? this.edit.draft[col.field] : null;
  }

  hasDraftError(col: WeGridInternalColumn<T>): boolean {
    return !!this.edit?.errors[col.field];
  }

  setDraftValue(col: WeGridInternalColumn<T>, value: unknown): void {
    if (!this.edit) return;
    this.edit.draft[col.field] = value;
    // Clearing the field's own error as soon as it is touched — leaving it red while the user is
    // fixing it is the classic "the form keeps shouting at me" annoyance.
    delete this.edit.errors[col.field];
    this.edit.error = null;
    this.cdr.markForCheck();
  }

  startEdit(row: T, rowIndex: number, event?: Event): void {
    event?.stopPropagation();
    if (!this.editable || this.edit?.saving) return;
    const draft: Record<string, unknown> = {};
    for (const col of this.internalColumns) {
      draft[col.field] = getNestedValue(row, col.field);
    }
    this.edit = { key: this.rowKey(row), original: row, rowIndex, draft, errors: {}, saving: false, error: null };
    this.cdr.markForCheck();
  }

  startCreate(): void {
    if (!this.allowAdd || this.edit?.saving) return;
    const template = (this.newRowTemplate ?? {}) as Record<string, unknown>;
    const draft: Record<string, unknown> = {};
    for (const col of this.internalColumns) {
      draft[col.field] = template[col.field] ?? null;
    }
    this.edit = { key: WE_GRID_NEW_ROW_KEY, original: null, rowIndex: -1, draft, errors: {}, saving: false, error: null };
    this.cdr.markForCheck();
  }

  cancelEdit(): void {
    if (this.edit?.saving) return;
    this.edit = null;
    this.cdr.markForCheck();
  }

  commitEdit(): void {
    if (!this.edit || this.edit.saving) return;

    const errors = this.validateDraft();
    if (Object.keys(errors).length > 0) {
      this.edit.errors = errors;
      this.cdr.markForCheck();
      return;
    }

    const creating = this.isCreating;
    const row = this.buildRowFromDraft();
    const changes = creating ? {} : this.collectDraftChanges();

    // Nothing actually changed — close the editor instead of sending an empty PUT.
    if (!creating && Object.keys(changes).length === 0) {
      this.edit = null;
      this.cdr.markForCheck();
      return;
    }

    const emitter = creating ? this.rowCreate : this.rowUpdate;
    if (!emitter.observed) {
      this.applyLocalCommit(row, creating);
      return;
    }

    this.edit.saving = true;
    emitter.emit({
      row,
      original: this.edit.original,
      rowIndex: this.edit.rowIndex,
      changes,
      done: (success, error) => this.finishCommit(success, error)
    });
    this.cdr.markForCheck();
  }

  private validateDraft(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!this.edit) return errors;
    for (const col of this.internalColumns) {
      if (!col.editable || !col.required) continue;
      const value = this.edit.draft[col.field];
      if (value === null || value === undefined || value === '') {
        errors[col.field] = this.locale.requiredField;
      }
    }
    return errors;
  }

  /** A shallow copy of the original (or of `newRowTemplate`) with every editable field overwritten */
  private buildRowFromDraft(): T {
    const base = this.edit?.original
      ? ({ ...(this.edit.original as object) } as T)
      : ({ ...((this.newRowTemplate ?? {}) as object) } as T);
    for (const col of this.internalColumns) {
      if (!col.editable) continue;
      setNestedValue(base, col.field, this.edit?.draft[col.field] ?? null);
    }
    return base;
  }

  private collectDraftChanges(): Record<string, unknown> {
    const changes: Record<string, unknown> = {};
    if (!this.edit?.original) return changes;
    for (const col of this.internalColumns) {
      if (!col.editable) continue;
      const before = getNestedValue(this.edit.original, col.field);
      const after = this.edit.draft[col.field];
      if (!weGridSameEditValue(before, after)) changes[col.field] = after;
    }
    return changes;
  }

  /**
   * Fallback for a grid whose (rowCreate)/(rowUpdate) output nobody bound — the edit is applied
   * to the loaded rows so playgrounds, demos and purely local grids still work. It writes through
   * to the consumer's own objects, which is exactly why binding the output is the documented way:
   * only then does the consumer control when and whether the change lands.
   */
  private applyLocalCommit(row: T, creating: boolean): void {
    if (creating) {
      this.data = [row, ...this.data];
    } else if (this.edit?.original) {
      Object.assign(this.edit.original as object, row as object);
    }
    this.edit = null;
    this.refreshDisplayData();
    this.cdr.markForCheck();
  }

  private finishCommit(success: boolean, error?: string): void {
    if (!this.edit) return;
    if (success) {
      this.edit = null;
    } else {
      this.edit.saving = false;
      this.edit.error = error ?? this.locale.saveFailed;
      this.showNotice(this.edit.error, true);
    }
    this.cdr.markForCheck();
  }

  requestDelete(row: T, rowIndex: number, event?: Event): void {
    event?.stopPropagation();
    if (!this.allowDelete || this.isRowDeleting(row)) return;
    // A blocking confirm() is deliberate: the library has no dialog system of its own and must not
    // acquire one. Turn `confirmDelete` off and run your own dialog before letting the click through.
    if (this.confirmDelete && typeof window !== 'undefined' && !window.confirm(this.locale.confirmDeleteRow)) {
      return;
    }

    if (!this.rowDelete.observed) {
      this.data = this.data.filter((candidate) => candidate !== row);
      this.refreshDisplayData();
      this.cdr.markForCheck();
      return;
    }

    const key = this.rowKey(row);
    this.deletingKeys.add(key);
    this.rowDelete.emit({
      row,
      rowIndex,
      done: (success, error) => {
        this.deletingKeys.delete(key);
        if (!success) this.showNotice(error ?? this.locale.saveFailed, true);
        this.cdr.markForCheck();
      }
    });
    this.cdr.markForCheck();
  }

  emitRefresh(): void {
    this.refresh.emit();
  }

  // ─── Column width dragging ───────────────────────────────────────────
  // NOTE: this used to listen on `document` — every pixel of movement re-entered the zone and
  // triggered change detection for the WHOLE application, and if the pointer left the window and
  // pointerup never fired, the subscription stayed open until the component was destroyed. Using
  // setPointerCapture pins events to the handle element (they keep arriving even once the cursor
  // moves outside it) and pointercancel/lostpointercapture are also treated as an end condition.
  onResizeStart(event: PointerEvent, col: WeGridInternalColumn<T>, _thEl: HTMLElement): void {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = col.width;
    const handleEl = event.currentTarget as HTMLElement;
    const pointerId = event.pointerId;
    const stop$ = new Subject<void>();

    try {
      handleEl.setPointerCapture(pointerId);
    } catch {
      // Not available in some environments (e.g. unit tests) — ignore silently, dragging still works
    }

    this.ngZone.runOutsideAngular(() => {
      fromEvent<PointerEvent>(handleEl, 'pointermove')
        .pipe(takeUntil(stop$), takeUntil(this.destroy$))
        .subscribe((moveEvent) => {
          const delta = moveEvent.clientX - startX;
          const next = Math.max(col.minWidth, Math.round(startWidth + delta));
          if (next === col.width) return;
          col.width = next;
          // If a pinned column's width changed, the offset of subsequent pinned columns must be recomputed too
          if (col.pinned) this.recomputeRenderColumns();
          // NOTE: staying outside the zone and triggering this component's own CD directly —
          // ngZone.run(...) here would trigger ApplicationRef.tick() and cancel out the benefit of
          // runOutsideAngular (clientX is an integer, so this fires on nearly every drag event).
          // OnPush + destroy$ already protect us; detectChanges() doesn't leak outside this component's tree.
          this.cdr.detectChanges();
        });

      merge(
        fromEvent<PointerEvent>(handleEl, 'pointerup'),
        fromEvent<PointerEvent>(handleEl, 'pointercancel'),
        fromEvent<PointerEvent>(handleEl, 'lostpointercapture')
      )
        .pipe(take(1), takeUntil(this.destroy$))
        .subscribe(() => {
          stop$.next();
          stop$.complete();
          try {
            handleEl.releasePointerCapture(pointerId);
          } catch {
            // may already be released
          }
          this.ngZone.run(() => {
            this.scheduleLayoutSave();
            this.cdr.markForCheck();
          });
        });
    });
  }

  // ─── Column drag-and-drop reordering ─────────────────────────────────
  onColumnDrop(event: CdkDragDrop<WeGridInternalColumn<T>[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    moveItemInArray(this.renderColumns, event.previousIndex, event.currentIndex);
    this.renderColumns.forEach((c, i) => (c.order = i));
    const hidden = this.internalColumns.filter((c) => !c.visible);
    hidden.forEach((c, i) => (c.order = this.renderColumns.length + i));
    // When the order changes, pinned columns' left/right offsets must also be recomputed —
    // otherwise the DOM order changes but the old offsets remain, and pinned columns overlap on horizontal scroll.
    this.recomputeRenderColumns();
    this.scheduleLayoutSave();
    this.cdr.markForCheck();
  }

  // ─── Header / cell context menu ────────────────────────────────────────
  onHeaderContextMenu(event: MouseEvent, col: WeGridInternalColumn<T>): void {
    event.preventDefault();
    this.openHeaderMenu({ x: event.clientX, y: event.clientY }, col);
  }

  onHeaderKeydown(event: KeyboardEvent, col: WeGridInternalColumn<T>, thEl: HTMLElement): void {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault();
      this.openHeaderMenu(thEl, col);
    }
  }

  openColumnsMenuFromToolbar(): void {
    if (this.gearButtonRef) {
      this.openHeaderMenu(this.gearButtonRef.nativeElement, null);
    }
  }

  /**
   * Right-click on a cell — only takes effect while `grouping=true`. While false it returns
   * early and NEVER calls `preventDefault`, so the browser's default context menu keeps working
   * exactly as it did on existing screens (the handler is bound but stays inert).
   */
  onCellContextMenu(event: MouseEvent, col: WeGridInternalColumn<T>, row: T): void {
    if (!this.grouping) return;
    event.preventDefault();
    // When displayValue is given, "filter by this value" uses the label the user sees instead of the raw code
    const value = col.displayValue ? col.displayValue(row) : getNestedValue(row, col.field);
    this.openHeaderMenu({ x: event.clientX, y: event.clientY }, col, { value });
  }

  private openHeaderMenu(origin: WeGridMenuOrigin, column: WeGridInternalColumn<T> | null, cellCtx?: { value: unknown }): void {
    this.closeHeaderMenu();
    this.closeFilterPopover();
    if (column) this.warnIfNumericCustomColumn(column);

    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(origin)
      .withPositions([
        { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
        { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
        { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
        { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -4 }
      ])
      .withPush(true)
      .withViewportMargin(8);

    this.overlayRef = this.overlay.create({
      positionStrategy,
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      hasBackdrop: true,
      backdropClass: 'we-grid-menu-backdrop',
      panelClass: 'we-grid-menu-panel'
    });

    const returnFocusEl = origin instanceof HTMLElement ? origin : (this.gearButtonRef?.nativeElement ?? null);

    this.overlayRef
      .backdropClick()
      .pipe(take(1), takeUntil(this.destroy$))
      .subscribe(() => this.closeHeaderMenu(returnFocusEl));

    this.overlayRef
      .keydownEvents()
      .pipe(takeUntil(this.destroy$))
      .subscribe((e) => {
        if (e.key === 'Escape') this.closeHeaderMenu(returnFocusEl);
      });

    const portal = new ComponentPortal(WeGridHeaderMenuComponent);
    const componentRef = this.overlayRef.attach(portal);
    componentRef.setInput('column', column);
    componentRef.setInput('allColumns', this.internalColumns);
    componentRef.setInput('density', this.density);
    componentRef.setInput('sort', this.currentSort);
    componentRef.setInput('enableGrouping', this.grouping);
    componentRef.setInput('groupField', this.groupField);
    componentRef.setInput('cellValue', cellCtx?.value);
    componentRef.setInput('hasCellValue', !!cellCtx);

    componentRef.instance.action.pipe(takeUntil(this.destroy$)).subscribe((action) => {
      this.handleMenuAction(action);
      if (action.type === 'toggle-column') {
        componentRef.setInput('allColumns', this.internalColumns);
      } else {
        this.closeHeaderMenu(returnFocusEl);
      }
    });

    // NOTE: right after overlay.attach() the @ViewChildren query may not have resolved yet —
    // the queueMicrotask inside focusFirstItem() could lose the race against Angular's own CD
    // microtask (the menu opens but focus stayed on the header). Forcing a synchronous view check
    // here guarantees ViewChildren is populated before we try to focus it.
    componentRef.changeDetectorRef.detectChanges();
    componentRef.instance.focusFirstItem();
  }

  // type: 'custom' hides the fact that the data could actually be numeric — to nudge the
  // developer toward the correct column definition, we sample a few loaded rows and log a
  // one-time console warning.
  private warnIfNumericCustomColumn(col: WeGridInternalColumn<T>): void {
    if (!isDevMode() || col.type !== 'custom' || this.warnedNumericCustomFields.has(col.field)) return;

    const sample = this.displayData
      .slice(0, 20)
      .map((row) => getNestedValue(row, col.field))
      .filter((v) => v !== null && v !== undefined && v !== '');
    if (sample.length === 0) return;

    const allNumeric = sample.every((v) => !isNaN(Number(v)));
    if (!allNumeric) return;

    this.warnedNumericCustomFields.add(col.field);
    // eslint-disable-next-line no-console
    console.warn(
      `[we-grid] Column '${col.field}' contains numeric data but is declared as type: 'custom' — as a result ` +
        `the Sum/Average/Min/Max options aren't offered in the summary menu (only Count/None are). ` +
        `A cellTemplate works independently of type: declare the column as type: 'number' or 'currency', ` +
        `you can keep the weGridCell template as-is.`
    );
  }

  private closeHeaderMenu(returnFocusEl?: HTMLElement | null): void {
    if (!this.overlayRef) return;
    this.overlayRef.dispose();
    this.overlayRef = null;
    returnFocusEl?.focus();
  }

  private handleMenuAction(action: WeGridMenuAction): void {
    switch (action.type) {
      case 'hide-column': {
        const col = this.internalColumns.find((c) => c.field === action.field);
        if (col) col.visible = false;
        break;
      }
      case 'toggle-column': {
        const col = this.internalColumns.find((c) => c.field === action.field);
        if (col) col.visible = action.visible;
        break;
      }
      case 'rename': {
        const col = this.internalColumns.find((c) => c.field === action.field);
        if (col) col.headerOverride = action.header === col.defaultHeader ? null : action.header;
        break;
      }
      case 'toggle-wrap': {
        const col = this.internalColumns.find((c) => c.field === action.field);
        if (col) col.wrap = !col.wrap;
        break;
      }
      case 'autofit': {
        const col = this.internalColumns.find((c) => c.field === action.field);
        if (col) this.autofitColumn(col);
        break;
      }
      case 'pin': {
        const col = this.internalColumns.find((c) => c.field === action.field);
        if (col) col.pinned = action.pinned;
        break;
      }
      case 'sort':
        this.applySort(action.field, action.direction);
        break;
      case 'density':
        this.density = action.density;
        break;
      case 'summary': {
        const col = this.internalColumns.find((c) => c.field === action.field);
        if (col) col.summary = action.summary;
        break;
      }
      case 'reset-layout':
        // Resetting already fires its own DELETE request — if it fell through to the shared
        // scheduleLayoutSave(), the default layout would be PUT back 500ms later, reviving the
        // soft-deleted record.
        this.resetLayout();
        this.recomputeRenderColumns();
        this.cdr.markForCheck();
        return;
      case 'show-all-columns':
        this.internalColumns.forEach((c) => (c.visible = true));
        break;
      case 'group-by':
        // Grouping is NOT part of the layout (WeGridLayout) — it isn't persisted, so we return
        // early and skip scheduleLayoutSave() (otherwise every group change would trigger an
        // unnecessary PUT/localStorage write).
        this.groupField = action.field;
        this.applyGrouping();
        this.groupChange.emit(this.groupField);
        this.cdr.markForCheck();
        return;
      case 'clear-grouping':
        this.clearGrouping();
        return;
      case 'quick-filter':
        this.applyQuickFilter(action.field, action.value);
        this.cdr.markForCheck();
        return;
    }
    this.recomputeRenderColumns();
    this.scheduleLayoutSave();
    this.cdr.markForCheck();
  }

  private resetLayout(): void {
    this.layoutStore.reset(this.gridKey).pipe(takeUntil(this.destroy$)).subscribe();
    const merged = mergeGridLayout(this.columns, null, this.layoutVersion);
    this.internalColumns = merged.columns;
    this.density = 'normal';
    this.clientSort = null;
    this.filterRowVisible = false;
    this.filterState.clear();
    this.checklistLabels.clear();
    this.groupField = null;
    this.groupCollapsedKeys.clear();
    this.refreshDisplayData();
  }

  private autofitColumn(col: WeGridInternalColumn<T>): void {
    const ctx = this.measureCanvas?.getContext('2d');
    if (!ctx) return;
    ctx.font = this.getMeasureFont();
    let max = ctx.measureText(weGridDisplayHeader(col)).width;
    const hasTemplate = !!this.getCellTemplate(col);
    const sample = this.displayData.slice(0, 200);
    for (const row of sample) {
      if (hasTemplate) continue;
      const text = this.formatCell(row, col);
      const width = ctx.measureText(text).width;
      if (width > max) max = width;
    }
    const fitted = Math.max(col.minWidth, Math.ceil(max) + 40);
    col.width = col.maxWidth ? Math.min(fitted, col.maxWidth) : fitted;
  }

  private getMeasureFont(): string {
    if (typeof window === 'undefined') return '13px sans-serif';
    const styles = window.getComputedStyle(this.elementRef.nativeElement);
    return `${styles.fontSize} ${styles.fontFamily}`;
  }
}
