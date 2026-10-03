import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { ComponentPortal, TemplatePortal } from '@angular/cdk/portal';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import {
  AfterContentInit,
  AfterViewInit,
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
  SimpleChange,
  SimpleChanges,
  TemplateRef,
  ViewChild,
  ViewContainerRef,
  afterNextRender,
  Injector
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  Observable,
  Subject,
  catchError,
  debounce,
  debounceTime,
  defer,
  fromEvent,
  map,
  merge,
  of,
  switchMap,
  take,
  takeUntil,
  timer
} from 'rxjs';
import { WeGridCellDirective } from './directives/we-grid-cell.directive';
import { WeGridRowDetailDirective } from './directives/we-grid-row-detail.directive';
import { WeGridHeaderDirective } from './directives/we-grid-header.directive';
import { WeGridEmptyDirective } from './directives/we-grid-empty.directive';
import { WeGridEmptyContext } from './models/we-grid-empty.model';
import {
  WeGridCellContext,
  WeGridColumnDef,
  WeGridDensity,
  WeGridHeaderContext,
  WeGridHeaderFilterMode,
  WeGridSortDirection,
  WeGridSummaryFunction,
  WeGridValueKind,
  isWeGridNumericSummaryType,
  weGridValueKind
} from './models/we-grid-column.model';
import { WeGridInternalColumn, WeGridRenderItem, weGridDisplayHeader } from './models/we-grid-internal.model';
import { WeGridScrollToRowOptions, WeGridTreeExpandEvent, WeGridTreeInfo, WeGridTreeNode } from './models/we-grid-tree.model';
import { WeGridLayout, WeGridLayoutStore, WE_GRID_LAYOUT_STORE } from './models/we-grid-layout.model';
import { WeGridMenuAction } from './models/we-grid-menu-action.model';
import {
  WeGridChecklistOption,
  WeGridChecklistValue,
  WeGridChecklistValuesProvider,
  WeGridChecklistValuesRequest,
  WeGridChecklistValuesResult,
  WeGridColumnFilterState,
  WeGridFilterChangeEvent,
  WeGridFilterOperator,
  isWeGridFilterActive,
  weGridEmptyFilterValue,
  weGridFilterChangeEvent,
  weGridFilterOperatorsFor,
  weGridFilterValueKey,
  weGridQuickFilterOperator
} from './models/we-grid-filter.model';
import { WeGridGroupSection } from './models/we-grid-group.model';
import {
  WeGridPageChange,
  WeGridRowClassFn,
  WeGridRowClickEvent,
  WeGridSelectionMode,
  WeGridSortChange
} from './models/we-grid-events.model';
import { WeGridDetailToggleEvent, WeGridRowDetailContext } from './models/we-grid-row-detail.model';
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
  WeGridEditMode,
  WeGridEditState,
  WeGridPastedRow,
  WeGridRowDeleteEvent,
  WeGridRowsPasteEvent,
  WeGridRowEditEvent,
  weGridSameEditValue
} from './models/we-grid-edit.model';
import { mergeGridLayout, toColumnLayout } from './services/we-grid-layout-merge';
import {
  applyWeGridFilters,
  weGridFilterChipLabel,
  weGridFilterOperatorLabel,
  weGridInFilterValueLabel,
  weGridQuickFilterValueToInputString
} from './services/we-grid-filter.util';
import { buildWeGridSummaryText } from './services/we-grid-summary.util';
import {
  WeGridFormatValueOptions,
  formatWeGridColumnValue,
  getNestedValue,
  setNestedValue,
  weGridCurrencyFractionDigits,
  weGridFromInputNumber,
  weGridInputScale,
  weGridLinkHref,
  weGridResolveCurrency,
  weGridToInputNumber
} from './services/we-grid-value.util';
import { WeGridImportColumn, weGridCoerceImportValue, weGridMapImportedRows } from './services/we-grid-import.util';
import { weGridParseClipboardTable } from './services/we-grid-clipboard.util';
import { weGridIsInteractiveTarget } from './services/we-grid-interactive.util';
import { weGridDecodeView, weGridEncodeView, weGridSanitizeView, weGridViewParamName } from './services/we-grid-view.util';
import { WeGridSavedView, WeGridViewShareEvent } from './models/we-grid-view.model';
import { WeGridHeaderMenuComponent } from './we-grid-header-menu/we-grid-header-menu.component';
import { WeGridCellEditorComponent } from './we-grid-cell-editor/we-grid-cell-editor.component';
import { WeGridEditFormChange, WeGridEditFormComponent } from './we-grid-edit-form/we-grid-edit-form.component';
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

/** A row of the full (unfiltered) tree — built from `data` and `treeChildren` once per data change */
interface WeGridTreeModelNode<T> {
  row: T;
  key: unknown;
  level: number;
  parent: WeGridTreeModelNode<T> | null;
  children: WeGridTreeModelNode<T>[];
}

interface WeGridTreeModel<T> {
  roots: WeGridTreeModelNode<T>[];
  /** Every row, depth first */
  all: WeGridTreeModelNode<T>[];
  /** First row per key */
  byKey: Map<unknown, WeGridTreeModelNode<T>>;
}

/** A row of the filtered and sorted tree; `heldOpen` = an active filter matched below it */
interface WeGridFilteredNode<T> {
  node: WeGridTreeModelNode<T>;
  children: WeGridFilteredNode<T>[];
  heldOpen: boolean;
}

/** Deeper than this the data is taken to be cyclic */
const WE_GRID_TREE_MAX_DEPTH = 32;

/** Width in px of the row-action column added when `editable` or `allowDelete` is on */
const WE_GRID_ACTION_COL_WIDTH = 92;

/**
 * Upper bound of the automatic fit when the column declares no `maxWidth`. The automatic pass runs
 * without anyone asking, so a single long free-text value must not stretch the table; an explicit
 * fit from the menu is not bounded by this.
 */
const WE_GRID_AUTO_FIT_MAX_WIDTH = 400;

/** Closes whichever grid's menu is open, so opening one from code never leaves two on screen */
let weGridOpenMenuCloser: (() => void) | null = null;

@Component({
  selector: 'we-grid',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule, WeGridCellEditorComponent, WeGridEditFormComponent],
  templateUrl: './we-grid.component.html',
  styleUrls: ['./we-grid.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'we-grid-host' }
})
export class WeGridComponent<T> implements OnInit, OnChanges, AfterContentInit, AfterViewInit, OnDestroy {
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

  /**
   * What the header funnel of a column that doesn't declare its own `headerFilterMode` opens.
   * `'checklist'` (the default since 0.5.0) gives every filterable column the Excel/DevExpress style
   * list of its distinct values — the funnel shows even with `filterRow` off, and the filter row
   * shows a checklist button for those columns. `'operator'` restores the pre-0.5.0 behaviour: the
   * operator + value popover, with the funnel only while `filterRow` is on. `'custom'` columns
   * always default to `'operator'`.
   */
  @Input() headerFilterMode: WeGridHeaderFilterMode = 'checklist';

  /**
   * Where checklist columns take their values from on a server-filtered grid. Without it a checklist
   * lists the distinct values of the LOADED rows, exactly as before; with it the popover asks this
   * function instead — for the whole dataset, narrowed by the other active filters — and sends its
   * search box along too. Only consulted while filtering really runs on the server
   * (`isServerFilter`): a client-filtered grid applies the selection to the loaded rows, where a
   * value found anywhere else could never match. A column opts out with `headerFilterSource: 'loaded'`.
   */
  @Input() checklistValuesProvider?: WeGridChecklistValuesProvider;

  /** The most values one provider request asks for — a column's own `checklistValuesLimit` overrides it */
  @Input() checklistValuesLimit = 200;

  /** How long a provider-backed checklist waits after the last keystroke in its search box before asking again */
  @Input() checklistSearchDebounceMs = 300;

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
  /**
   * `'row'` edits in place; `'form'` opens a modal form for both editing and "Add row". The events,
   * the `done` callback and the validation are the same in both modes.
   */
  @Input() editMode: WeGridEditMode = 'row';

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

  /**
   * On an `editable` grid, clicking a cell makes it the paste target and Ctrl+V writes a range
   * copied from Excel or Google Sheets across the editable columns, starting there. Rows that run
   * past the last row become new rows when `allowAdd` is on. Turn off to keep paste out entirely.
   */
  @Input() allowPaste = true;

  /**
   * Adds a Views button to the toolbar: the user saves the current columns, filters, sort and
   * grouping under a name, switches between them, and copies a link that opens the grid in that
   * view. Views are stored through the layout store under `<gridKey>::views`.
   */
  @Input() savedViews = false;

  /**
   * When true, a click, double click or right click that starts on an interactive element inside a
   * row — a button, an input, a link, anything matching `WE_GRID_INTERACTIVE_SELECTOR` or marked
   * `data-we-grid-ignore` — stays with that element: no `(rowClick)` / `(rowDblClick)`, no grid cell
   * menu, and the browser's own context menu keeps working. `data-we-grid-allow` opts an element
   * back in. Defaults to false (every click reaches the row, as before).
   */
  @Input() ignoreInteractiveTargets = false;

  /**
   * Bump this when state the rows are drawn from changes outside `data` — a Map of unsaved
   * decisions, say. Any change (`!==`) makes the grid re-evaluate `rowClass` and the cell templates
   * without rebuilding them, so an input inside a template keeps its focus. Use a counter or a
   * Symbol: a new object literal on every change detection would refresh on every cycle.
   */
  @Input() rowStateVersion?: unknown;

  /**
   * Upper bound of the scrolling area — a px number or any CSS length (`'calc(100vh - 330px)'`).
   * Given, the grid scrolls vertically inside itself with the header (and the filter row) stuck to
   * the top and the summary row to the bottom. Left out, the grid grows with its rows, as before.
   */
  @Input() maxHeight?: number | string;

  /** Lower bound of the scrolling area — keeps an empty or loading grid from collapsing */
  @Input() minHeight?: number | string;

  /**
   * `'full'`: record count and pager (the default). `'count'`: the record count only. `'none'`: no
   * footer. Display only — on a `serverSide` grid hiding the pager leaves no way to change pages.
   */
  @Input() footer: 'full' | 'count' | 'none' = 'full';

  /**
   * `'auto'`: the toolbar is drawn as before. `'none'`: no toolbar at all — the features behind its
   * buttons (filterRow, exportFormats, savedViews, showRefresh, allowAdd …) still work, but have
   * no button; drive them from your own controls (`openColumnsMenu`, `toggleFilterRow`, `exportAs` …).
   */
  @Input() toolbar: 'auto' | 'none' = 'auto';

  /**
   * `'always'`: the column menu button shows on every header (the default). `'hover'`: it shows
   * only while the pointer is over the header or focus is inside it — it keeps its place, stays
   * reachable by keyboard, and stays visible on touch screens.
   */
  @Input() headerMenuButton: 'always' | 'hover' = 'always';

  /**
   * Turns on tree mode: `data` holds the root rows and this returns a row's children (empty,
   * null or undefined for a leaf). Children are drawn in the same columns as their parent,
   * indented and collapsible. `trackByField` must be unique across every level.
   */
  @Input() treeChildren?: (row: T) => readonly T[] | null | undefined;

  /** Field of the column that carries the indentation and the toggle — defaults to the first visible unpinned column */
  @Input() treeColumn?: string;

  /** `'inline'`: the grid draws the toggle and the indentation. `'none'`: a cell template does, from `ctx.tree` and `toggleTreeNode` */
  @Input() treeToggle: 'inline' | 'none' = 'inline';

  /** Indentation per tree level, in px */
  @Input() treeIndentPx = 16;

  /** Which rows start open: false (none), true (all), or a number n (levels below n) */
  @Input() treeDefaultExpanded: boolean | number = false;

  /**
   * false: a row that leaves `data` loses its open/closed state. true: the state is kept, so a row
   * an outside filter took away comes back the way the user left it. See `treeStateRetainLimit`.
   */
  @Input() treeRetainState = false;

  /** With `treeRetainState`: how many keys of rows missing from `data` are remembered — beyond it the earliest to go are forgotten first */
  @Input() treeStateRetainLimit = 5000;

  /** Rows the summary row adds up in tree mode — the roots (no double counting), only leaves, or every row */
  @Input() treeSummaryLevel: 'root' | 'leaf' | 'all' = 'root';

  /**
   * `'column'`: the expand arrow column opens the detail (the default). `'none'`: no arrow column
   * at all — open the detail from your own control with `toggleRowDetail` / `openRowDetail`, and
   * bind `detailId(row)` to its `aria-controls`.
   */
  @Input() detailTrigger: 'column' | 'none' = 'column';

  /** Keeps the detail content in view while the table scrolls sideways — it sticks to the left edge of the scroll area */
  @Input() detailSticky = false;

  /** With `detailSticky`: the largest width of the detail content, px or a CSS length (`'min(960px, 70vw)'`). Defaults to the scroll area's width */
  @Input() detailMaxWidth?: number | string;

  /** Whether a row has a detail at all — rows answering false get no arrow and can't be opened. Defaults to every row */
  @Input() canExpandRow?: (row: T) => boolean;

  /** `'once'`: mounted on first open, hidden when closed (the default). `'whileOpen'`: removed when closed and created fresh on every open */
  @Input() detailMount: 'once' | 'whileOpen' = 'once';

  /**
   * Groups the rows by these fields, outermost first — the same as the user picking "Group by this
   * field" and then "Add to grouping". Applies whenever the input changes; the user can still change
   * the grouping from the menu while `grouping` is on.
   */
  @Input() groupBy?: string[] | null;

  /**
   * Where group summaries appear: `'header'` in the group header line (the default), `'footer'`
   * in a row closing each expanded group with every value under its column, or `'both'`.
   */
  @Input() groupSummaryPosition: 'header' | 'footer' | 'both' = 'header';

  /** Adds up every numeric column in groups, without picking a summary per column — `groupSummary` or `summary` still win */
  @Input() groupAutoSummary = false;

  /**
   * Fits every column without an explicit width (neither `width` on its definition nor one in the
   * saved layout) to its content once, when the first rows arrive. Paging doesn't refit, so the
   * columns don't jump; a saved or dragged width always wins.
   */
  @Input() autoFitColumns = true;

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
  /** Every grouping change, with all levels — `groupChange` keeps reporting only the outermost field */
  @Output() groupFieldsChange = new EventEmitter<string[]>();

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
  /**
   * A spreadsheet range was pasted onto the grid — call `event.done(true)` once it is saved. When
   * nothing is bound, the grid writes the values onto the loaded rows itself, like the row editor.
   */
  @Output() rowsPaste = new EventEmitter<WeGridRowsPasteEvent<T>>();
  /**
   * "Copy link" in the Views panel. Unbound, the grid copies the current page's URL with the view
   * in a `we-grid-view-<gridKey>` query parameter, which it reads back on load; bound, the grid
   * only emits and the consumer builds the link.
   */
  @Output() viewShare = new EventEmitter<WeGridViewShareEvent>();
  /** A tree row was opened or closed — by its toggle (`'user'`) or by a method call (`'api'`) */
  @Output() treeExpandChange = new EventEmitter<WeGridTreeExpandEvent<T>>();
  /** A row's detail opened or closed — by the arrow column (`'user'`) or a method call (`'api'`) */
  @Output() detailToggle = new EventEmitter<WeGridDetailToggleEvent<T>>();

  /** The toolbar's refresh button was pressed — reloading is entirely the consumer's business */
  @Output() refresh = new EventEmitter<void>();

  @ContentChildren(WeGridCellDirective) cellTemplateDirectives!: QueryList<WeGridCellDirective<T>>;
  @ContentChild(WeGridRowDetailDirective) rowDetailDirective?: WeGridRowDetailDirective<T>;
  @ContentChildren(WeGridHeaderDirective) headerTemplateDirectives!: QueryList<WeGridHeaderDirective>;
  @ContentChild(WeGridEmptyDirective) emptyDirective?: WeGridEmptyDirective;
  @ViewChild('headerHintTpl') headerHintTemplate?: TemplateRef<{ $implicit: string; id: string }>;
  @ViewChild('scrollArea') scrollAreaRef?: ElementRef<HTMLElement>;
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
  /** Every field grouped by, outermost first — empty while grouping is off */
  groupFields: string[] = [];

  /** The outermost grouping field — null means grouping is off. Setting it groups by that one field */
  get groupField(): string | null {
    return this.groupFields[0] ?? null;
  }

  set groupField(field: string | null) {
    this.groupFields = field ? [field] : [];
  }
  /** null means the template renders the old (ungrouped) rows — see we-grid.component.html */
  groupedSections: WeGridGroupSection<T>[] | null = null;
  /** Collapsed group keys — preserves the user's open/closed preference even as displayData refreshes */
  private readonly groupCollapsedKeys = new Set<string>();

  /** What the body renders, in order — rows and group headers; see WeGridRenderItem */
  renderItems: WeGridRenderItem<T>[] = [];
  /** One stable track token per group key, so a group header keeps its DOM across refreshes */
  private readonly groupTrackTokens = new Map<string, object>();

  // ─── Tree state (treeChildren) ───────────────────────────────────────
  /** Keys of the rows the user (or the API) opened — survives new `data` arrays, cleared on a page change */
  readonly treeExpandedKeys = new Set<unknown>();
  /** Keys already seen, so `treeDefaultExpanded` applies to a row once, not on every refresh */
  private readonly treeKnownKeys = new Set<unknown>();
  /** Rows the user closed although an active filter holds them open — forgotten when the filters change */
  private readonly treeFilterClosedKeys = new Set<unknown>();
  /** With `treeRetainState`: keys kept although their row left `data`, in the order they left */
  private readonly treeRetainedKeys = new Set<unknown>();
  private treeModel: WeGridTreeModel<T> | null = null;
  private treeModelSource: { data: T[]; children: unknown } | null = null;
  /** The filtered and sorted tree the visible rows are flattened from */
  private treeFiltered: WeGridFilteredNode<T>[] = [];
  /** Every row's tree info — for the visible rows and the collapsed ones alike */
  private readonly treeInfoByRow = new Map<T, WeGridTreeInfo<T>>();
  /** The visible tree rows, in render order */
  treeNodes: WeGridTreeNode<T>[] = [];
  private treeFilterSignature = '';
  private treeColumnField: string | null = null;
  private readonly treeWarnings = new Set<string>();

  private readonly destroy$ = new Subject<void>();
  private readonly layoutSave$ = new Subject<void>();
  /** The filter row applies LOCALLY on every keystroke instantly; this subject only debounces the
   * OUTGOING (filterChange) event by 400ms — if the consumer binds it to the backend, it won't fire one request per keystroke. */
  private readonly filterEmit$ = new Subject<void>();
  /** Ends a pending `filterEmit$` debounce window right away — see resetLayout */
  private readonly filterEmitFlush$ = new Subject<void>();
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
  /** Search requests of the open provider-backed checklist — null while no such checklist is open */
  private checklistRequest$: Subject<{ search: string | null; debounce: boolean }> | null = null;
  /** The term the open checklist last asked the provider for, so Retry repeats exactly that request */
  private checklistSearch: string | null = null;
  /** Ends the open checklist's request stream when its popover closes */
  private readonly filterPopoverClosed$ = new Subject<void>();
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
  /** Same once-per-field rule for a `filterOperators` list that shares nothing with the column type */
  private readonly warnedFilterOperatorFields = new Set<string>();
  /** Same once-per-field rule for a checklist whose provider is missing or can't apply */
  private readonly warnedChecklistSourceFields = new Set<string>();

  // ─── Row editing state ───────────────────────────────────────────────
  /** The user's saved views, see `savedViews` */
  views: WeGridSavedView[] = [];
  viewsPanelOpen = false;
  newViewName = '';
  /** Name of the view last applied or saved — shown on the Views button */
  activeViewName: string | null = null;
  /** A view link is applied once, on the first layout load, not again on every reload of the layout */
  private sharedViewChecked = false;

  /**
   * The paste target cell — set by a click on an editable grid, see `allowPaste`. Held by row key,
   * so it stays put when the consumer answers a paste by replacing the row objects.
   */
  activeCell: { key: unknown; field: string } | null = null;

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
    @Inject(WE_GRID_IMPORT_PARSER) private readonly importParser: WeGridImportParser,
    private readonly viewContainerRef: ViewContainerRef,
    private readonly injector: Injector
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
    return this.showExpandCol ? this.expandColWidth : 0;
  }

  /** The arrow column is drawn for `expandable` grids unless `detailTrigger` is 'none' */
  get showExpandCol(): boolean {
    return this.expandable && this.detailTrigger === 'column';
  }

  /** Total column count for the empty row's colspan and the detail row's single cell */
  get totalColSpan(): number {
    return (
      this.renderColumns.length +
      (this.selectable !== 'none' ? 1 : 0) +
      (this.showExpandCol ? 1 : 0) +
      (this.hasRowActions ? 1 : 0)
    );
  }

  /** The summary row is never rendered when no column has a summary selected — avoids an empty-looking strip */
  get hasSummaryRow(): boolean {
    return this.internalColumns.some((c) => c.summary !== 'none');
  }

  private emptyContextCache: WeGridEmptyContext | null = null;

  /** Context of the `weGridEmpty` template — the same object while nothing in it changed */
  get emptyContext(): WeGridEmptyContext {
    const hasActiveFilters = this.hasActiveFilters;
    const message = hasActiveFilters ? this.locale.noRecordsMatchFilter : this.resolvedEmptyMessage;
    const cached = this.emptyContextCache;
    if (cached && cached.hasActiveFilters === hasActiveFilters && cached.message === message) return cached;
    const state = { hasActiveFilters, clearAllFilters: () => this.clearAllFilters(), message };
    this.emptyContextCache = { $implicit: state, ...state };
    return this.emptyContextCache;
  }

  private toolbarWarned = false;

  private warnToolbarlessFeatures(): void {
    if (this.toolbar !== 'none' || this.toolbarWarned || !isDevMode()) return;
    const features = [
      this.filterRow && 'filterRow',
      this.exportFormats.length > 0 && 'exportFormats',
      this.importFormats.length > 0 && 'importFormats',
      this.savedViews && 'savedViews',
      this.showRefresh && 'showRefresh',
      this.allowAdd && 'allowAdd'
    ].filter(Boolean);
    if (features.length === 0) return;
    this.toolbarWarned = true;
    console.warn(`[we-grid] "${this.gridKey}": toolbar="none" — ${features.join(', ')} still work but have no button; trigger them from your own controls.`);
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
            { type: col.type, format: col.format, minorUnits: col.minorUnits, formatter: col.formatter, header: weGridDisplayHeader(col) },
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
    const rows = this.selectableRows;
    return rows.length > 0 && rows.every((row) => this.isSelected(row));
  }

  /** Rows "select all" covers — every filtered tree row in tree mode (each selects on its own), otherwise displayData */
  private get selectableRows(): T[] {
    return this.treeActive ? this.treeFilteredRows : this.displayData;
  }

  ngOnInit(): void {
    this.layoutSave$.pipe(debounceTime(500), takeUntil(this.destroy$)).subscribe(() => this.persistLayout());
    // debounce(() => timer(...)) rather than debounceTime(400) so a consumer can change
    // filterDebounceMs at runtime without the grid having to rebuild the subscription.
    this.filterEmit$
      .pipe(
        debounce(() => merge(timer(Math.max(0, this.filterDebounceMs)), this.filterEmitFlush$)),
        takeUntil(this.destroy$)
      )
      .subscribe(() => this.emitFilterChange());
    this.loadLayout();
    if (this.savedViews) this.loadViews();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      (changes['columns'] && !changes['columns'].firstChange) ||
      (changes['headerFilterMode'] && !changes['headerFilterMode'].firstChange)
    ) {
      this.rebuildColumnsFromDefs();
    }
    if (changes['treeChildren'] && !changes['treeChildren'].firstChange && !this.treeChildren) {
      // Back to flat rows — the tree's open state belongs to the tree
      this.resetTreeState();
    }
    if (changes['gridKey'] && !changes['gridKey'].firstChange && this.treeActive) {
      // Another record set — the open rows of the previous one mean nothing here
      this.resetTreeState();
    }
    if (changes['toolbar'] && !changes['toolbar'].firstChange) this.closeHeaderMenu();
    if (changes['toolbar'] || changes['exportFormats'] || changes['importFormats'] || changes['savedViews'] || changes['showRefresh'] || changes['allowAdd'] || changes['filterRow']) {
      this.warnToolbarlessFeatures();
    }
    if (changes['treeColumn'] || changes['treeChildren']) this.resolveTreeColumn();
    if (
      (changes['gridKey'] && !changes['gridKey'].firstChange && this.treeActive) ||
      changes['data'] ||
      changes['sortField'] ||
      changes['sortDirection'] ||
      changes['serverSide'] ||
      changes['treeChildren'] ||
      changes['treeDefaultExpanded']
    ) {
      this.refreshDisplayData();
    }
    // A checklist lists the values of the LOADED rows, so a new page has to be reflected in an
    // already open popover — the selection itself lives in the popover and is left alone.
    // A provider-backed list doesn't come from the page, so paging leaves it alone.
    if (
      changes['data'] &&
      this.filterPopoverColumn?.headerFilterMode === 'checklist' &&
      this.checklistSource(this.filterPopoverColumn) === 'loaded'
    ) {
      this.filterPopoverComponentRef?.setInput('options', this.checklistOptionsFor(this.filterPopoverColumn));
    }
    // Expanded rows reset when the page changes — prevents the wrong row from appearing open;
    // expansion is transient UI state, not a persisted layout preference.
    if (changes['page'] && !changes['page'].firstChange) {
      this.expandedKeys.clear();
      this.mountedDetailKeys.clear();
      if (this.treeActive) {
        this.resetTreeState();
        this.refreshDisplayData();
      }
      // An open editor belongs to a row of the page being left — keeping it would attach the
      // draft to whichever row happens to land on the same key on the new page.
      this.edit = null;
    }
    if (changes['rowStateVersion']) this.warnRowStateVersionLiteral(changes['rowStateVersion']);
    if (changes['detailSticky'] && !changes['detailSticky'].firstChange) this.syncViewportObserver();
    if (changes['groupBy'] && this.internalColumns.length > 0) this.setGrouping(this.groupBy ?? [], false);
    if ((changes['groupSummaryPosition'] && !changes['groupSummaryPosition'].firstChange) || changes['groupAutoSummary']) this.rebuildRenderItems();
    if ((changes['canExpandRow'] || changes['rowStateVersion']) && !changes['data']) this.closeDetailsThatCannotExpand();
    if (changes['detailTrigger'] && !changes['detailTrigger'].firstChange && this.internalColumns.length > 0) this.recomputeRenderColumns();
    if ((changes['footer'] || changes['serverSide']) && this.serverSide && this.footer !== 'full' && isDevMode() && !this.footerWarned) {
      this.footerWarned = true;
      console.warn(`[we-grid] "${this.gridKey}": footer="${this.footer}" on a serverSide grid hides the pager — the user can't reach other pages.`);
    }
    // The action column is pinned right, so turning it on or off changes every right-pinned
    // column's offset — without this the pinned columns would sit underneath the buttons.
    if ((changes['editable'] || changes['allowDelete']) && this.internalColumns.length > 0) {
      this.recomputeRenderColumns();
    }
  }

  ngAfterViewInit(): void {
    this.syncViewportObserver();
  }

  ngAfterContentInit(): void {
    this.rebuildCellTemplateMap();
    this.cellTemplateDirectives.changes.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.rebuildCellTemplateMap();
      this.cdr.markForCheck();
    });
    this.headerTemplateDirectives.changes.pipe(takeUntil(this.destroy$)).subscribe(() => this.cdr.markForCheck());
  }

  ngOnDestroy(): void {
    this.closeHeaderMenu();
    this.closeFilterPopover();
    this.hideHeaderHint();
    if (this.liveTimer) clearTimeout(this.liveTimer);
    this.viewportObserver?.disconnect();
    this.viewportObserver = null;
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
        const merged = mergeGridLayout(this.columns, saved, this.layoutVersion, this.headerFilterMode);
        this.internalColumns = merged.columns;
        if (merged.density) this.density = merged.density;
        this.filterRowVisible = merged.filterRowVisible ?? false;
        this.recomputeRenderColumns();
        if (this.groupBy?.length && this.groupFields.length === 0) this.groupFields = this.validGroupFields(this.groupBy);
        this.refreshDisplayData();
        if (!this.sharedViewChecked) {
          this.sharedViewChecked = true;
          // A synchronous store answers inside ngOnInit — the view's (sortChange)/(filterChange)
          // must not reach the consumer while its own template is still being checked.
          void Promise.resolve().then(() => this.applyViewFromUrl());
        }
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
    const merged = mergeGridLayout(this.columns, synthetic, this.layoutVersion, this.headerFilterMode);
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
    this.resolveTreeColumn();
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

  /** The column's header template — the `weGridHeader` directive first, then the definition's `headerTemplate` */
  getHeaderTemplate(col: WeGridInternalColumn<T>): TemplateRef<WeGridHeaderContext<T>> | null {
    const directive = this.headerTemplateDirectives?.find((d) => d.field === col.field);
    return (directive?.templateRef as TemplateRef<WeGridHeaderContext<T>> | undefined) ?? col.headerTemplate ?? null;
  }

  private readonly headerContextCache = new Map<string, WeGridHeaderContext<T>>();

  /** Cached per column so the template view is updated, not rebuilt, on every check */
  headerContext(col: WeGridInternalColumn<T>): WeGridHeaderContext<T> {
    const def = this.columns.find((d) => d.field === col.field) ?? ({ field: col.field, header: col.defaultHeader } as WeGridColumnDef<T>);
    const title = weGridDisplayHeader(col);
    const cached = this.headerContextCache.get(col.field);
    if (cached && cached.column === def && cached.title === title) return cached;
    const ctx: WeGridHeaderContext<T> = { $implicit: def, column: def, title };
    this.headerContextCache.set(col.field, ctx);
    return ctx;
  }

  /** The `title` attribute of a header — dropped when a `headerHint` icon already explains the column */
  headerTitle(col: WeGridInternalColumn<T>): string | null {
    return col.headerHint ? null : col.headerTooltip || null;
  }

  // ─── Header hint (headerHint) ───────────────────────────────────────
  private hintOverlayRef: OverlayRef | null = null;
  /** The icon whose hint is open — a second show for the same icon is a no-op */
  hintOpenFor: HTMLElement | null = null;
  private hintSeq = 0;
  hintId: string | null = null;

  showHeaderHint(anchor: HTMLElement, col: WeGridInternalColumn<T>): void {
    if (!col.headerHint || !this.headerHintTemplate) return;
    if (this.hintOpenFor === anchor) return;
    this.hideHeaderHint();
    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(anchor)
      .withPositions([
        { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 6 },
        { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -6 }
      ])
      .withPush(true)
      .withViewportMargin(8);
    this.hintOverlayRef = this.overlay.create({
      positionStrategy,
      scrollStrategy: this.overlay.scrollStrategies.close(),
      panelClass: 'we-grid-hint-panel'
    });
    this.hintId = `we-grid-hint-${++this.hintSeq}`;
    this.hintOverlayRef.attach(new TemplatePortal(this.headerHintTemplate, this.viewContainerRef, { $implicit: col.headerHint, id: this.hintId }));
    this.hintOpenFor = anchor;
    this.cdr.markForCheck();
  }

  hideHeaderHint(): void {
    if (!this.hintOverlayRef) return;
    this.hintOverlayRef.dispose();
    this.hintOverlayRef = null;
    this.hintOpenFor = null;
    this.hintId = null;
    this.cdr.markForCheck();
  }

  onHeaderHintKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.hintOverlayRef) {
      event.stopPropagation();
      this.hideHeaderHint();
    }
  }

  // ─── Bounded height (maxHeight / minHeight) ────────────────────────
  get scrollMaxHeight(): string | null {
    return this.cssLength(this.maxHeight);
  }

  get scrollMinHeight(): string | null {
    return this.cssLength(this.minHeight);
  }

  private cssLength(value: number | string | undefined): string | null {
    if (value === undefined || value === null || value === '') return null;
    return typeof value === 'number' ? `${value}px` : value;
  }

  private footerWarned = false;

  // ─── Live announcements ──────────────────────────────────────────────
  /** The polite live region is only added once there is something to say, so it never costs markup up front */
  liveRegionOn = false;
  liveMessage = '';
  private liveTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Announces `text` to screen readers. The region is created first and filled a moment later —
   * a live region that appears together with its text is not reliably read out.
   */
  announce(text: string): void {
    this.liveRegionOn = true;
    this.liveMessage = '';
    this.cdr.markForCheck();
    if (this.liveTimer) clearTimeout(this.liveTimer);
    this.liveTimer = setTimeout(() => {
      this.liveTimer = null;
      this.liveMessage = text;
      this.cdr.markForCheck();
    }, 50);
  }

  getCellTemplate(col: WeGridInternalColumn<T>): TemplateRef<WeGridCellContext<T>> | null {
    return this.cellTemplateMap.get(col.field) ?? col.cellTemplate ?? null;
  }

  buildCellContext(row: T, col: WeGridInternalColumn<T>, rowIndex: number): WeGridCellContext<T> {
    const context: WeGridCellContext<T> = {
      $implicit: row,
      row,
      value: this.cellValue(row, col),
      rowIndex,
      column: { field: col.field, header: weGridDisplayHeader(col), type: col.type }
    };
    const tree = this.treeActive ? this.treeInfoByRow.get(row) : undefined;
    if (tree) context.tree = tree;
    return context;
  }

  formatCell(row: T, col: WeGridInternalColumn<T>): string {
    return formatWeGridColumnValue(this.cellValue(row, col), col, this.valueFormatOptions(), row);
  }

  /**
   * The value a cell shows, sorts, filters and exports by. Outside tree mode that is the field; in
   * tree mode `treeValue` wins, then `childField` on child rows, then the field.
   */
  cellValue(row: T, col: WeGridInternalColumn<T>): unknown {
    if (!this.treeActive) return getNestedValue(row, col.field);
    const tree = this.treeInfoByRow.get(row);
    if (!tree) return getNestedValue(row, col.field);
    if (col.treeValue) return col.treeValue(row, tree);
    if (tree.level > 0 && col.childField !== undefined) {
      return col.childField === null ? undefined : getNestedValue(row, col.childField);
    }
    return getNestedValue(row, col.field);
  }

  /** `cellValue` by field — the shape the filter and summary helpers read through */
  private readonly readCellValue = (row: T, field: string): unknown => {
    const col = this.internalColumns.find((c) => c.field === field);
    return col ? this.cellValue(row, col) : getNestedValue(row, field);
  };

  /** Whether a tree cell shows a mapped value (`treeValue` / `childField`) — editing and paste leave those alone */
  private isMappedTreeCell(row: T, col: WeGridInternalColumn<T>): boolean {
    if (!this.treeActive) return false;
    const tree = this.treeInfoByRow.get(row);
    return !!tree && (!!col.treeValue || (tree.level > 0 && col.childField !== undefined));
  }

  /** A value's display text without its row — the column's formatter or the built-in formatting */
  private formatColumnValue(col: WeGridInternalColumn<T>, value: unknown): string {
    return formatWeGridColumnValue(value, col, this.valueFormatOptions());
  }

  /** The `href` of an email/url/phone cell — null renders plain text (other types, empty values) */
  cellLink(row: T, col: WeGridInternalColumn<T>): string | null {
    return weGridLinkHref(this.cellValue(row, col), col.type);
  }

  /** The family the column filters and edits like — the templates branch on this, not on `type` */
  valueKind(col: WeGridInternalColumn<T>): WeGridValueKind {
    return weGridValueKind(col.type);
  }

  /**
   * Stored value × this = the number the user types in a filter input or the inline editor — 100 on
   * a percent column, 0.01 on a `minorUnits` currency column, 1 otherwise.
   */
  inputScale(col: WeGridInternalColumn<T>): number {
    return weGridInputScale(col, this.locale.intlCurrency);
  }

  /** A filter row number input's value, in the units the user types — the filter state keeps stored units */
  filterInputNumber(col: WeGridInternalColumn<T>, which: 'value' | 'value2'): number | null {
    return weGridToInputNumber(this.getFilterState(col)[which], this.inputScale(col));
  }

  /** What every rendering of a cell value shares — the locale's Intl settings and its yes/no words */
  private valueFormatOptions(): WeGridFormatValueOptions {
    return {
      locale: this.locale.intlLocale,
      currency: this.locale.intlCurrency,
      timeZone: this.locale.intlTimeZone,
      yesLabel: this.locale.yes,
      noLabel: this.locale.no
    };
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
    if (this.treeActive) {
      this.refreshTree();
      this.autoFitPendingColumns();
      this.closeDetailsThatCannotExpand();
      return;
    }
    // The filter row only ever operates on the loaded rows (this.data) — on screens with
    // serverSide=true, that means "the loaded page", not the entire dataset (see the filterRow
    // Input JSDoc and the "only this page is searched" hint in the template). If there's no
    // filter, the same reference is kept as-is — no unnecessary copy or CD trigger.
    // If isServerFilter is true, the backend already returns filtered data — filtering again here
    // would double-apply it (especially with operators like 'contains', where the backend and the
    // local comparison rules can differ, causing rows to be lost).
    const source =
      this.hasActiveFilters && !this.isServerFilter
        ? applyWeGridFilters(this.data, this.filterState, this.internalColumns, this.locale)
        : this.data;

    if (this.isServerSort || !this.clientSort) {
      this.displayData = source;
      this.applyGrouping();
      this.autoFitPendingColumns();
      this.closeDetailsThatCannotExpand();
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
    this.autoFitPendingColumns();
    this.closeDetailsThatCannotExpand();
  }

  // ─── Pagination ──────────────────────────────────────────────────────
  goToPage(newPage: number): void {
    const clamped = Math.min(Math.max(1, newPage), this.totalPagesComputed);
    if (clamped === this.page) return;
    this.pageChange.emit({ page: clamped, pageSize: this.pageSize });
  }

  // ─── Row events / selection ────────────────────────────────────────
  onRowClick(row: T, index: number, event?: Event): void {
    if (event && this.isFromInteractiveTarget(event)) return;
    this.rowClick.emit({ row, rowIndex: index });
  }

  onRowDblClick(row: T, index: number, event?: Event): void {
    if (event && this.isFromInteractiveTarget(event)) return;
    this.rowDblClick.emit({ row, rowIndex: index });
  }

  /** `ignoreInteractiveTargets` — whether the event began on a control inside the row it reached */
  private isFromInteractiveTarget(event: Event): boolean {
    if (!this.ignoreInteractiveTargets) return false;
    const current = event.currentTarget instanceof Element ? event.currentTarget : null;
    const row = current?.closest('tr') ?? null;
    return weGridIsInteractiveTarget(event, row);
  }

  /** A cell keeps a double click to itself when its column lists it in `stopRowEvents` */
  onCellDblClick(event: MouseEvent, col: WeGridInternalColumn<T>): void {
    if (col.stopRowEvents.includes('dblclick')) event.stopPropagation();
  }

  /**
   * Re-evaluates `rowClass` and the cell templates now — the imperative twin of `rowStateVersion`,
   * for state the grid cannot see changing. Template views are updated in place, never rebuilt.
   */
  refreshRows(): void {
    this.cdr.markForCheck();
  }

  private rowStateVersionWarned = false;

  /** A fresh object literal each cycle compares unequal every time — worth one hint in dev mode */
  private warnRowStateVersionLiteral(change: SimpleChange): void {
    if (this.rowStateVersionWarned || change.firstChange || !isDevMode()) return;
    const { previousValue, currentValue } = change;
    if (typeof currentValue !== 'object' || currentValue === null || typeof previousValue !== 'object' || previousValue === null) return;
    let same = false;
    try {
      same = JSON.stringify(previousValue) === JSON.stringify(currentValue);
    } catch {
      return;
    }
    if (!same) return;
    this.rowStateVersionWarned = true;
    console.warn(
      `[we-grid] "${this.gridKey}": rowStateVersion received a new object with the same content — every such change refreshes the rows. Pass a counter or a Symbol instead.`
    );
  }

  /** Returns null when `rowClass` isn't given — [ngClass] accepts null fine, no extra class is added */
  rowClassFor(row: T, index: number, tree?: WeGridTreeInfo<T> | null): string | string[] | Record<string, boolean> | null {
    if (!this.rowClass) return null;
    return tree ? this.rowClass(row, index, tree) : this.rowClass(row, index);
  }

  private rowKey(row: T): unknown {
    return this.trackByField ? row[this.trackByField] : row;
  }

  // ─── Subtotal (summary row) ────────────────────────────────────────────
  /** Builds a column's summary cell text — null when 'none' (nothing at all is printed in the cell) */
  summaryCellText(col: WeGridInternalColumn<T>): string | null {
    const scope = this.serverSide ? 'server' : 'client';
    if (!this.treeActive) return buildWeGridSummaryText(this.displayData, col, scope, this.summaryValues?.[col.field], this.locale);
    return buildWeGridSummaryText(this.treeSummaryRows, col, scope, this.summaryValues?.[col.field], this.locale, this.readCellValue);
  }

  /** The rows `treeSummaryLevel` adds up — over the filtered tree, collapsed rows included */
  private get treeSummaryRows(): T[] {
    if (this.treeSummaryLevel === 'root') return this.displayData;
    const rows = this.treeFilteredRows;
    if (this.treeSummaryLevel === 'all') return rows;
    return rows.filter((row) => !this.treeInfoByRow.get(row)?.hasChildren);
  }

  // ─── Filter row ────────────────────────────────────────────────────────
  toggleFilterRowVisible(): void {
    this.toggleFilterRow();
  }

  /** Opens or closes the filter row (`open` picks the state) — only while `filterRow=true` */
  toggleFilterRow(open?: boolean): void {
    if (!this.filterRow) return;
    const next = open ?? !this.filterRowVisible;
    if (next === this.filterRowVisible) return;
    this.filterRowVisible = next;
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
      operator: this.filterOperatorsFor(col)[0],
      value: weGridEmptyFilterValue(col.type)
    };
  }

  /**
   * The operators a column's filter row cell and popover offer — the type's list narrowed by the
   * column's `filterOperators`. A list that shares nothing with the type falls back to the full list
   * and says so once per field in dev mode, rather than silently leaving the restriction off.
   */
  filterOperatorsFor(col: WeGridInternalColumn<T>): WeGridFilterOperator[] {
    const operators = weGridFilterOperatorsFor(col.type, col.filterOperators);
    if (
      col.filterOperators &&
      isDevMode() &&
      !this.warnedFilterOperatorFields.has(col.field) &&
      !col.filterOperators.some((op) => operators.includes(op))
    ) {
      this.warnedFilterOperatorFields.add(col.field);
      // eslint-disable-next-line no-console
      console.warn(
        `[we-grid] Column '${col.field}' declares filterOperators [${col.filterOperators.join(', ')}], none of which ` +
          `apply to type: '${col.type}' — the full operator list (${operators.join(', ')}) is offered instead.`
      );
    }
    return operators;
  }

  filterOperatorLabel(col: WeGridInternalColumn<T>, operator: WeGridFilterOperator): string {
    return weGridFilterOperatorLabel(operator, col.type, this.locale);
  }

  setFilterOperator(col: WeGridInternalColumn<T>, operator: WeGridFilterOperator): void {
    if (!this.filterOperatorsFor(col).includes(operator)) return;
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
    if (weGridValueKind(col.type) === 'number') {
      // Typed in display units (25 for 25%, 123.45 for 12345 kuruş) — kept and emitted in the units
      // the rows hold, so a server-side filter compares like with like.
      value = isEmpty ? null : weGridFromInputNumber(rawValue, this.inputScale(col));
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

    for (const row of this.treeActive ? (this.treeModel?.all.map((n) => n.row) ?? this.data) : this.data) {
      const raw = this.cellValue(row, col);
      const blank = raw === null || raw === undefined || raw === '';
      const value = blank ? null : raw;
      const key = weGridFilterValueKey(value);
      if (byKey.has(key)) continue;
      const label = blank ? this.locale.emptyGroupValue : col.displayValue ? col.displayValue(row) : this.formatCell(row, col);
      labels.set(key, label);
      byKey.set(key, { value, key, label, blank });
    }

    this.mergeTickedChecklistValues(col, byKey);
    return this.sortChecklistOptions(byKey);
  }

  /**
   * The provider counterpart of `checklistOptionsFor`: the same option shape, labelled by the
   * provider's `label`, then the column's `checklistValueLabel`, then plain formatting. Only the
   * unsearched list keeps ticked values the provider didn't return — a search result that listed
   * every tick regardless of the term would no longer be a search result.
   */
  private checklistOptionsFromValues(col: WeGridInternalColumn<T>, values: WeGridChecklistValue[], keepTicked: boolean): WeGridChecklistOption[] {
    const labels = this.checklistLabelsFor(col.field);
    const byKey = new Map<string, WeGridChecklistOption>();

    for (const entry of values) {
      const blank = entry.value === null || entry.value === undefined || entry.value === '';
      const value = blank ? null : entry.value;
      const key = weGridFilterValueKey(value);
      if (byKey.has(key)) continue;
      const label = blank
        ? this.locale.emptyGroupValue
        : (entry.label ?? col.checklistValueLabel?.(value) ?? this.formatColumnValue(col, value));
      labels.set(key, label);
      byKey.set(key, { value, key, label, blank });
    }

    if (keepTicked) this.mergeTickedChecklistValues(col, byKey);
    return this.sortChecklistOptions(byKey);
  }

  /** Adds every ticked value the list doesn't already contain — otherwise paging or a narrower result would silently drop ticks */
  private mergeTickedChecklistValues(col: WeGridInternalColumn<T>, byKey: Map<string, WeGridChecklistOption>): void {
    const current = this.filterState.get(col.field);
    if (current?.operator !== 'in' || !Array.isArray(current.value)) return;
    for (const value of current.value as unknown[]) {
      const key = weGridFilterValueKey(value);
      if (byKey.has(key)) continue;
      const blank = value === null || value === undefined || value === '';
      byKey.set(key, { value: blank ? null : value, key, label: this.checklistValueLabel(col, value), blank });
    }
  }

  /** "(Empty)" first, then alphabetically by label in the locale's collation — the same ordering the group headers use */
  private sortChecklistOptions(byKey: Map<string, WeGridChecklistOption>): WeGridChecklistOption[] {
    return Array.from(byKey.values()).sort((a, b) => {
      if (a.blank !== b.blank) return a.blank ? -1 : 1;
      return a.label.localeCompare(b.label, this.locale.intlLocale);
    });
  }

  /**
   * Where a checklist column's values come from right now. The provider applies only while the grid
   * filters on the server; a column can pin itself to the loaded rows. Both misconfigurations — a
   * server-filtered checklist without a provider, a provider on a client-filtered grid — fall back
   * to the loaded rows and say so once per field in dev mode.
   */
  private checklistSource(col: WeGridInternalColumn<T>): 'loaded' | 'provider' {
    if (col.headerFilterSource === 'loaded') return 'loaded';
    if (!this.checklistValuesProvider) {
      if (this.isServerFilter) {
        this.warnChecklistSourceOnce(
          col,
          `lists only the loaded page's values although filtering runs on the server — pass checklistValuesProvider ` +
            `to list the whole dataset, or set headerFilterSource: 'loaded' on the column if the page is enough.`
        );
      }
      return 'loaded';
    }
    if (!this.isServerFilter) {
      this.warnChecklistSourceOnce(
        col,
        `ignores checklistValuesProvider because filtering runs client-side (filterMode / serverSide), where a ` +
          `value the loaded rows don't contain could never match — it lists the loaded rows' values instead.`
      );
      return 'loaded';
    }
    return 'provider';
  }

  private warnChecklistSourceOnce(col: WeGridInternalColumn<T>, message: string): void {
    if (!isDevMode() || this.warnedChecklistSourceFields.has(col.field)) return;
    this.warnedChecklistSourceFields.add(col.field);
    // eslint-disable-next-line no-console
    console.warn(`[we-grid] The checklist of column '${col.field}' ${message}`);
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

  /** The readable label of a single picked value — the remembered one, then the column's `checklistValueLabel`, then plain formatting */
  private checklistValueLabel(col: WeGridInternalColumn<T>, value: unknown): string {
    if (value === null || value === undefined || value === '') return this.locale.emptyGroupValue;
    const remembered = this.checklistLabels.get(col.field)?.get(weGridFilterValueKey(value));
    if (remembered) return remembered;
    return col.checklistValueLabel?.(value) ?? this.formatColumnValue(col, value);
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
    const source = col.headerFilterMode === 'checklist' ? this.checklistSource(col) : null;
    componentRef.setInput('options', source === 'loaded' ? this.checklistOptionsFor(col) : []);
    if (source === 'provider') {
      componentRef.setInput('remoteSearch', true);
      componentRef.setInput('valuesLimit', col.checklistValuesLimit ?? this.checklistValuesLimit);
    }
    componentRef.setInput('pageOnlyHint', source === 'loaded' && this.isServerFilter);
    componentRef.setInput('valueScale', this.inputScale(col));

    componentRef.instance.action.pipe(takeUntil(this.destroy$)).subscribe((action) => this.handleFilterPopoverAction(col, action, origin));
    if (source === 'provider') this.startChecklistRequests(col);

    componentRef.changeDetectorRef.detectChanges();
    componentRef.instance.focusFirstControl();
  }

  /**
   * Wires the open popover to `checklistValuesProvider`: the unsearched list right away, then one
   * request per search term once `checklistSearchDebounceMs` has passed. `switchMap` unsubscribes an
   * outdated request as soon as a newer term arrives — a slow answer for "ist" can never overwrite
   * the list for "istanbul" — and the stream ends with the popover.
   */
  private startChecklistRequests(col: WeGridInternalColumn<T>): void {
    const provider = this.checklistValuesProvider;
    if (!provider) return;
    const requests$ = new Subject<{ search: string | null; debounce: boolean }>();
    this.checklistRequest$ = requests$;

    requests$
      .pipe(
        switchMap(({ search, debounce: debounced }) => {
          const wait$: Observable<unknown> = debounced ? timer(Math.max(0, this.checklistSearchDebounceMs)) : of(null);
          return wait$.pipe(
            switchMap(() => {
              this.checklistSearch = search;
              const request = this.buildChecklistValuesRequest(col, search);
              this.updateChecklistPopover({ loading: true, loadError: false });
              return defer(() => provider(request)).pipe(
                map((result): { request: WeGridChecklistValuesRequest; result: WeGridChecklistValuesResult | null } => ({ request, result })),
                catchError(() => of({ request, result: null }))
              );
            })
          );
        }),
        takeUntil(merge(this.filterPopoverClosed$, this.destroy$))
      )
      .subscribe(({ request, result }) => {
        if (!result) {
          this.updateChecklistPopover({ loading: false, loadError: true, hasMore: false, options: [] });
          return;
        }
        this.updateChecklistPopover({
          loading: false,
          loadError: false,
          hasMore: result.hasMore,
          options: this.checklistOptionsFromValues(col, result.values ?? [], request.search === null)
        });
      });

    requests$.next({ search: null, debounce: false });
  }

  private buildChecklistValuesRequest(col: WeGridInternalColumn<T>, search: string | null): WeGridChecklistValuesRequest {
    const term = search?.trim() ?? '';
    return {
      field: col.field,
      search: term === '' ? null : term,
      // The column's own filter stays out — see WeGridChecklistValuesRequest.filters
      filters: Array.from(this.filterState.values()).filter((filter) => filter.field !== col.field && isWeGridFilterActive(filter)),
      limit: col.checklistValuesLimit ?? this.checklistValuesLimit
    };
  }

  /** The popover is OnPush and owns no state of its own here — every change is fed in through setInput */
  private updateChecklistPopover(state: { loading?: boolean; loadError?: boolean; hasMore?: boolean; options?: WeGridChecklistOption[] }): void {
    const ref = this.filterPopoverComponentRef;
    if (!ref) return;
    for (const [name, value] of Object.entries(state)) {
      ref.setInput(name, value);
    }
  }

  private handleFilterPopoverAction(col: WeGridInternalColumn<T>, action: WeGridFilterPopoverAction, returnFocusEl: HTMLElement): void {
    switch (action.type) {
      case 'search':
        this.checklistRequest$?.next({ search: action.term, debounce: true });
        return;
      case 'retry':
        this.checklistRequest$?.next({ search: this.checklistSearch, debounce: false });
        return;
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
    // Ended before the overlay goes: a response arriving after this has no popover to write into
    this.filterPopoverClosed$.next();
    this.checklistRequest$ = null;
    this.checklistSearch = null;
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
    // The header menu already hides the item on a non-filterable column and on one whose
    // filterOperators rule out an exact match — this guards every other way the action can arrive.
    const operator = col?.filterable ? weGridQuickFilterOperator(col) : null;
    if (!col || !operator) return;
    if (operator === 'in') {
      // A checklist column's filter is always 'in' over raw values: the shape its popover reads the
      // ticks back from, and the only operator the server-side contract gives an array.
      const blank = rawValue === null || rawValue === undefined || rawValue === '';
      this.filterState.set(field, { field, operator, value: [blank ? null : rawValue] });
    } else {
      this.filterState.set(field, { field, operator, value: weGridQuickFilterValueToInputString(rawValue, col.type) });
    }
    this.filterRowVisible = true;
    this.applyFiltersNow();
    this.scheduleLayoutSave();
  }

  // ─── Grouping ────────────────────────────────────────────────────────
  /** Called at the end of refreshDisplayData whenever displayData (post filter+sort) changes */
  private applyGrouping(): void {
    if (this.groupField && this.treeActive) {
      this.warnTreeOnce('grouping', 'grouping is ignored while treeChildren is set — rows and a tree cannot be grouped at the same time.');
    }
    if (!this.groupField || this.treeActive) {
      this.groupedSections = null;
      this.rebuildRenderItems();
      return;
    }
    const indexOf = new Map<T, number>();
    this.displayData.forEach((row, i) => indexOf.set(row, i));
    this.groupedSections = this.buildGroupSections(this.displayData, 0, '', indexOf);
    this.rebuildRenderItems();
  }

  /** One grouping level: buckets `rows` by `groupFields[level]` and recurses into the next field */
  private buildGroupSections(rows: T[], level: number, parentPath: string, indexOf: Map<T, number>): WeGridGroupSection<T>[] {
    const field = this.groupFields[level];
    const col = this.internalColumns.find((c) => c.field === field);
    // When displayValue is given, the group key is also built from the LABEL — otherwise
    // different raw codes that map to the same label (e.g. two legacy status codes both showing
    // "Draft") would end up as two separate groups with the same visible heading, which is confusing.
    const buckets = new Map<string, T[]>();
    for (const row of rows) {
      const raw = getNestedValue(row, field);
      const isEmptyRaw = raw === null || raw === undefined || raw === '';
      const key = isEmptyRaw ? ' EMPTY' : col?.displayValue ? col.displayValue(row) : String(raw);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(row);
      else buckets.set(key, [row]);
    }
    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0], this.locale.intlLocale))
      .map(([key, bucketRows]) => {
        const isEmpty = key === ' EMPTY';
        const label = isEmpty
          ? this.locale.emptyGroupValue
          : col?.displayValue
            ? col.displayValue(bucketRows[0])
            : col
              ? this.formatColumnValue(col, getNestedValue(bucketRows[0], field))
              : key;
        // The outermost level keeps its plain key, so a collapsed group from before survives
        const path = level === 0 ? key : `${parentPath}\u001f${key}`;
        const section: WeGridGroupSection<T> = {
          key,
          label,
          collapsed: this.groupCollapsedKeys.has(path),
          rows: bucketRows.map((row) => ({ row, index: indexOf.get(row) ?? -1 })),
          field,
          level,
          path
        };
        if (level + 1 < this.groupFields.length) section.children = this.buildGroupSections(bucketRows, level + 1, path, indexOf);
        return section;
      });
  }

  /** The × button on the toolbar's grouping chip — does the same thing as 'Remove grouping' in the context menu */
  clearGrouping(): void {
    if (!this.groupField) return;
    this.setGrouping([]);
  }

  /**
   * Groups by `fields`, outermost first — unknown fields are dropped. Emits `(groupFieldsChange)`
   * and, when the outermost field changed, `(groupChange)`.
   */
  setGrouping(fields: string[], emit = true): void {
    const next = this.validGroupFields(fields);
    if (next.join('\u0000') === this.groupFields.join('\u0000')) return;
    const outerBefore = this.groupField;
    this.groupFields = next;
    this.applyGrouping();
    if (emit) {
      if (this.groupField !== outerBefore) this.groupChange.emit(this.groupField);
      this.groupFieldsChange.emit([...this.groupFields]);
    }
    this.cdr.markForCheck();
  }

  /** Adds a grouping level under the current ones */
  addGroupField(field: string): void {
    if (this.groupFields.includes(field)) return;
    this.setGrouping([...this.groupFields, field]);
  }

  removeGroupField(field: string): void {
    this.setGrouping(this.groupFields.filter((f) => f !== field));
  }

  expandAllGroups(): void {
    this.groupCollapsedKeys.clear();
    this.applyGrouping();
    this.cdr.markForCheck();
  }

  collapseAllGroups(): void {
    const collect = (sections: WeGridGroupSection<T>[]): void =>
      sections.forEach((section) => {
        this.groupCollapsedKeys.add(section.path ?? section.key);
        collect(section.children ?? []);
      });
    collect(this.groupedSections ?? []);
    this.applyGrouping();
    this.cdr.markForCheck();
  }

  /** Distinct fields of known columns, at most one level per field */
  private validGroupFields(fields: readonly string[]): string[] {
    const known = new Set(this.internalColumns.map((c) => c.field));
    return Array.from(new Set(fields)).filter((f) => known.has(f));
  }

  toggleGroupCollapse(section: WeGridGroupSection<T>): void {
    section.collapsed = !section.collapsed;
    const key = section.path ?? section.key;
    if (section.collapsed) this.groupCollapsedKeys.add(key);
    else this.groupCollapsedKeys.delete(key);
    this.rebuildRenderItems();
    this.cdr.markForCheck();
  }

  /** Lays out what the body renders — see `renderItems` */
  private rebuildRenderItems(): void {
    if (this.treeActive) {
      this.renderItems = this.treeNodes.map((node, index) => ({
        kind: 'row',
        row: node.row,
        index,
        tree: this.treeInfoByRow.get(node.row) ?? null,
        trackKey: this.rowKey(node.row)
      }));
      return;
    }
    if (!this.groupedSections) {
      this.renderItems = this.displayData.map((row, index) => ({ kind: 'row', row, index, tree: null, trackKey: this.rowKey(row) }));
      return;
    }
    const items: WeGridRenderItem<T>[] = [];
    const footers = this.groupSummaryPosition !== 'header';
    const walk = (sections: WeGridGroupSection<T>[], level: number): void => {
      for (const section of sections) {
        const path = section.path ?? section.key;
        items.push({ kind: 'group', section, level, trackKey: this.groupTrackToken(path) });
        if (section.collapsed) continue;
        if (section.children) {
          walk(section.children, level + 1);
        } else {
          for (const entry of section.rows) {
            items.push({ kind: 'row', row: entry.row, index: entry.index, tree: null, trackKey: this.rowKey(entry.row) });
          }
        }
        if (footers) items.push({ kind: 'groupFooter', section, level, trackKey: this.groupTrackToken(`\u0001${path}`) });
      }
    };
    walk(this.groupedSections, 0);
    this.renderItems = items;
  }

  private groupTrackToken(key: string): object {
    let token = this.groupTrackTokens.get(key);
    if (!token) {
      token = { group: key };
      this.groupTrackTokens.set(key, token);
    }
    return token;
  }

  groupFieldHeaderLabel(field: string | null = this.groupField): string {
    const col = this.internalColumns.find((c) => c.field === field);
    return col ? weGridDisplayHeader(col) : (field ?? '');
  }

  /** The header text of a group section's own field */
  groupSectionFieldLabel(section: WeGridGroupSection<T>): string {
    return this.groupFieldHeaderLabel(section.field ?? this.groupField);
  }

  /** Inner levels are indented; the outermost keeps the plain cell padding */
  groupIndent(level: number): string | null {
    return level > 0 ? `calc(0.6rem + ${level * 1.25}rem)` : null;
  }

  /**
   * The function a column summarises a group with: its `groupSummary`, else its `summary`, else
   * 'sum' for a numeric column when `groupAutoSummary` is on.
   */
  groupSummaryFunction(col: WeGridInternalColumn<T>): WeGridSummaryFunction {
    if (col.groupSummary) return col.groupSummary;
    if (col.summary !== 'none') return col.summary;
    return this.groupAutoSummary && isWeGridNumericSummaryType(col.type) ? 'sum' : 'none';
  }

  /** Whether any column has a group summary — drives the header text and the footer row */
  get hasGroupSummary(): boolean {
    return this.internalColumns.some((c) => this.groupSummaryFunction(c) !== 'none');
  }

  /** "Column Label: value" fragments shown in the group header — null if no column has a group summary */
  groupSummaryLabel(section: WeGridGroupSection<T>): string | null {
    if (this.groupSummaryPosition === 'footer' || !this.hasGroupSummary) return null;
    const rows = section.rows.map((e) => e.row);
    const parts: string[] = [];
    for (const col of this.internalColumns) {
      const fn = this.groupSummaryFunction(col);
      if (fn === 'none') continue;
      const text = buildWeGridSummaryText(rows, { ...col, summary: fn }, 'client', undefined, this.locale);
      if (text) parts.push(`${weGridDisplayHeader(col)} ${text}`);
    }
    return parts.length ? parts.join(' · ') : null;
  }

  /** A group footer cell — the column's group summary over the group's rows, or null */
  groupFooterCellText(section: WeGridGroupSection<T>, col: WeGridInternalColumn<T>): string | null {
    const fn = this.groupSummaryFunction(col);
    if (fn === 'none') return null;
    return buildWeGridSummaryText(
      section.rows.map((e) => e.row),
      { ...col, summary: fn },
      'client',
      undefined,
      this.locale
    );
  }

  // ─── Tree rows (treeChildren) ───────────────────────────────────────
  /** Whether the grid is in tree mode — `treeChildren` is set */
  get treeActive(): boolean {
    return !!this.treeChildren;
  }

  /** Every row of the filtered tree, depth first — collapsed ones included (exports, selection, summaries) */
  treeFilteredRows: T[] = [];

  /** Whether this cell draws the tree's indentation and toggle */
  isTreeCell(item: WeGridRenderItem<T>, col: WeGridInternalColumn<T>): boolean {
    return item.kind === 'row' && item.tree !== null && this.treeToggle === 'inline' && col.field === this.treeColumnField;
  }

  treeIndent(tree: WeGridTreeInfo<T> | null): string | null {
    return tree ? `calc(0.5rem + ${tree.level * this.treeIndentPx}px)` : null;
  }

  /** The text a toggle's accessible name is built from — the row's value in the tree column */
  treeRowLabel(row: T): string {
    const col = this.internalColumns.find((c) => c.field === this.treeColumnField);
    return col ? this.formatCell(row, col) : '';
  }

  /** `id` of a tree row's element — the target `scrollToRow` and deep links use; only with `trackByField` */
  rowDomId(row: T): string | null {
    return this.treeActive && this.trackByField ? `we-grid-row-${encodeURIComponent(String(this.rowKey(row)))}` : null;
  }

  rowKeyAttr(row: T): string | null {
    return this.treeActive && this.trackByField ? encodeURIComponent(String(this.rowKey(row))) : null;
  }

  isTreeExpanded(row: T): boolean {
    const info = this.treeInfoByRow.get(row);
    if (info) return info.expanded;
    return this.treeExpandedKeys.has(this.rowKey(row));
  }

  /** True when every row that has children is open — drives an "Expand all / Collapse all" label */
  get treeAllExpanded(): boolean {
    const parents = (this.treeModel?.all ?? []).filter((n) => n.children.length > 0);
    return parents.length > 0 && parents.every((n) => this.treeExpandedKeys.has(n.key));
  }

  /** Opens or closes a row's children; `force` picks the state. Emits `(treeExpandChange)` with source 'api' */
  toggleTreeNode(row: T, force?: boolean): void {
    this.setTreeExpanded(row, force ?? !this.isTreeExpanded(row), 'api');
  }

  onTreeToggleClick(event: Event, row: T): void {
    event.stopPropagation();
    this.setTreeExpanded(row, !this.isTreeExpanded(row), 'user');
  }

  expandAllTree(): void {
    const opened = (this.treeModel?.all ?? []).filter((n) => n.children.length > 0 && !this.treeExpandedKeys.has(n.key));
    opened.forEach((n) => {
      this.treeExpandedKeys.add(n.key);
      this.treeFilterClosedKeys.delete(n.key);
    });
    this.flattenTree();
    opened.forEach((n) => this.treeExpandChange.emit({ row: n.row, expanded: true, source: 'api' }));
    this.announce(this.locale.treeRowsShown(this.treeNodes.length));
    this.cdr.markForCheck();
  }

  collapseAllTree(): void {
    const all = this.treeModel?.all ?? [];
    const closed = all.filter((n) => n.children.length > 0 && this.isTreeExpanded(n.row));
    // Only the rows in data — the remembered state of rows that left (treeRetainState) is kept
    all.forEach((n) => this.treeExpandedKeys.delete(n.key));
    // Rows an active filter holds open close too, until the filters change
    all.filter((n) => n.children.length > 0).forEach((n) => this.treeFilterClosedKeys.add(n.key));
    this.flattenTree();
    closed.forEach((n) => this.treeExpandChange.emit({ row: n.row, expanded: false, source: 'api' }));
    this.announce(this.locale.treeRowsShown(this.treeNodes.length));
    this.cdr.markForCheck();
  }

  /**
   * Brings a row into view: opens its ancestors (unless `expandParents: false`), then scrolls it
   * into the scroll area after the next render. False when no row has that key, or a filter hides it.
   */
  scrollToRow(key: unknown, opts: WeGridScrollToRowOptions = {}): boolean {
    if (this.treeActive) {
      const node = this.treeModel?.byKey.get(key);
      if (!node || !this.treeFilteredRows.includes(node.row)) return false;
      if (opts.expandParents !== false) {
        const ancestors: T[] = [];
        for (let parent = node.parent; parent; parent = parent.parent) ancestors.unshift(parent.row);
        ancestors.forEach((row) => {
          if (!this.isTreeExpanded(row)) this.setTreeExpanded(row, true, 'api');
        });
      }
    }
    const rowItems = this.renderItems.filter((item) => item.kind === 'row');
    const position = rowItems.findIndex((item) => item.kind === 'row' && this.rowKey(item.row) === key);
    if (position === -1) return false;
    this.cdr.markForCheck();
    afterNextRender(() => this.scrollRowIntoView(key, opts), { injector: this.injector });
    return true;
  }

  private scrollRowIntoView(key: unknown, opts: WeGridScrollToRowOptions): void {
    const host = this.elementRef.nativeElement as HTMLElement;
    const position = this.renderItems
      .filter((item) => item.kind === 'row')
      .findIndex((item) => item.kind === 'row' && this.rowKey(item.row) === key);
    // The draft row of "Add row" is the first .we-grid__row while it is open
    const rows = host.querySelectorAll<HTMLElement>('tbody > tr.we-grid__row');
    const element = rows[position + (this.showDraftRow ? 1 : 0)];
    if (!element) return;
    // Inside a bounded grid the sticky header would cover a row scrolled to the very top
    const head = host.querySelector<HTMLElement>('.we-grid__table > thead');
    if (this.scrollMaxHeight && head) element.style.scrollMarginTop = `${head.offsetHeight}px`;
    const reduceMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({ block: opts.block ?? 'center', behavior: reduceMotion ? 'auto' : (opts.behavior ?? 'auto') });
  }

  private setTreeExpanded(row: T, expanded: boolean, source: 'user' | 'api'): void {
    const key = this.rowKey(row);
    const node = this.treeModel?.byKey.get(key);
    if (!node || node.children.length === 0 || this.isTreeExpanded(row) === expanded) return;
    if (expanded) {
      this.treeExpandedKeys.add(key);
      this.treeFilterClosedKeys.delete(key);
    } else {
      this.treeExpandedKeys.delete(key);
      this.treeFilterClosedKeys.add(key);
    }
    this.flattenTree();
    this.treeExpandChange.emit({ row, expanded, source });
    this.cdr.markForCheck();
  }

  /**
   * Forgets every row's open/closed state — remembered ones included — and applies
   * `treeDefaultExpanded` again. For switching to an unrelated record set; a `gridKey` change does it by itself.
   */
  clearTreeState(): void {
    this.resetTreeState();
    if (this.treeActive) this.refreshDisplayData();
    this.cdr.markForCheck();
  }

  private resetTreeState(): void {
    this.treeExpandedKeys.clear();
    this.treeKnownKeys.clear();
    this.treeFilterClosedKeys.clear();
    this.treeRetainedKeys.clear();
    this.treeModel = null;
    this.treeModelSource = null;
    this.treeInfoByRow.clear();
    this.treeFiltered = [];
    this.treeNodes = [];
    this.treeFilteredRows = [];
  }

  private resolveTreeColumn(): void {
    if (!this.treeActive) {
      this.treeColumnField = null;
      return;
    }
    if (this.treeColumn) {
      // A hidden tree column takes its toggle with it — "Expand all" in the menu stays available
      this.treeColumnField = this.renderColumns.some((c) => c.field === this.treeColumn) ? this.treeColumn : null;
      return;
    }
    this.treeColumnField = (this.renderColumns.find((c) => !c.pinned) ?? this.renderColumns[0])?.field ?? null;
  }

  /**
   * Tree mode's refreshDisplayData: filter (a row stays when it or a descendant matches; a matching
   * row with no matching child keeps all its children), sort siblings, flatten what is open.
   * `displayData` holds the filtered roots, so paging, the footer and server-side totals stay root based.
   */
  private refreshTree(): void {
    const model = this.ensureTreeModel();
    this.fillTreeInfo(model);

    const filtering = this.hasActiveFilters && !this.isServerFilter;
    const signature = filtering ? this.activeFilterSignature() : '';
    if (signature !== this.treeFilterSignature) {
      this.treeFilterClosedKeys.clear();
      this.treeFilterSignature = signature;
    }
    const matched = filtering
      ? new Set(applyWeGridFilters(model.all.map((n) => n.row), this.filterState, this.internalColumns, this.locale, this.readCellValue))
      : null;
    const relevant = new Map<WeGridTreeModelNode<T>, boolean>();
    const isRelevant = (node: WeGridTreeModelNode<T>): boolean => {
      let result = relevant.get(node);
      if (result === undefined) {
        result = matched!.has(node.row) || node.children.some(isRelevant);
        relevant.set(node, result);
      }
      return result;
    };
    const compare = this.treeComparator();
    const build = (nodes: WeGridTreeModelNode<T>[], showAll: boolean): WeGridFilteredNode<T>[] => {
      const kept = !matched || showAll ? nodes : nodes.filter(isRelevant);
      // Array.prototype.sort is stable, so equal values keep their original order
      const ordered = compare ? [...kept].sort(compare) : kept;
      return ordered.map((node) => {
        if (!matched || showAll) return { node, children: build(node.children, showAll), heldOpen: false };
        const matchingChildren = node.children.filter(isRelevant);
        if (matchingChildren.length > 0) return { node, children: build(matchingChildren, false), heldOpen: true };
        // The row matched on its own: its children stay visible so it keeps its context
        return { node, children: matched.has(node.row) ? build(node.children, true) : [], heldOpen: false };
      });
    };
    this.treeFiltered = build(model.roots, false);
    this.displayData = this.treeFiltered.map((f) => f.node.row);
    this.groupedSections = null;
    this.flattenTree();
  }

  /**
   * treeRetainState bookkeeping: a key that left `data` joins the end of `treeRetainedKeys`, one
   * that came back leaves it, and past `treeStateRetainLimit` the earliest to leave are forgotten.
   */
  private retainMissingTreeKeys(present: Map<unknown, unknown>): void {
    for (const key of Array.from(this.treeRetainedKeys)) if (present.has(key)) this.treeRetainedKeys.delete(key);
    for (const key of this.treeKnownKeys) if (!present.has(key)) this.treeRetainedKeys.add(key);
    for (const key of this.treeExpandedKeys) if (!present.has(key)) this.treeRetainedKeys.add(key);
    const limit = Math.max(0, this.treeStateRetainLimit);
    for (const key of Array.from(this.treeRetainedKeys)) {
      if (this.treeRetainedKeys.size <= limit) break;
      this.treeRetainedKeys.delete(key);
      this.treeKnownKeys.delete(key);
      this.treeExpandedKeys.delete(key);
    }
  }

  /** Sibling comparator for the client sort — null when the grid isn't sorting itself */
  private treeComparator(): ((a: WeGridTreeModelNode<T>, b: WeGridTreeModelNode<T>) => number) | null {
    if (this.isServerSort || !this.clientSort?.direction) return null;
    const { field, direction } = this.clientSort;
    const col = this.internalColumns.find((c) => c.field === field);
    const read = (row: T): unknown => (col ? this.cellValue(row, col) : getNestedValue(row, field));
    return (a, b) => {
      const va = read(a.row);
      const vb = read(b.row);
      if (va == null && vb == null) return 0;
      if (va == null) return direction === 'asc' ? -1 : 1;
      if (vb == null) return direction === 'asc' ? 1 : -1;
      if ((va as number) < (vb as number)) return direction === 'asc' ? -1 : 1;
      if ((va as number) > (vb as number)) return direction === 'asc' ? 1 : -1;
      return 0;
    };
  }

  /** The full tree, rebuilt only when `data` or `treeChildren` changed — not on a sort, filter or toggle */
  private ensureTreeModel(): WeGridTreeModel<T> {
    if (this.treeModel && this.treeModelSource?.data === this.data && this.treeModelSource.children === this.treeChildren) {
      return this.treeModel;
    }
    if (!this.trackByField) {
      this.warnTreeOnce('trackBy', 'tree mode needs trackByField, unique across every level — rows are tracked by object reference until it is set.');
    }
    const all: WeGridTreeModelNode<T>[] = [];
    const byKey = new Map<unknown, WeGridTreeModelNode<T>>();
    let duplicate = false;
    const visit = (rows: readonly T[], level: number, parent: WeGridTreeModelNode<T> | null): WeGridTreeModelNode<T>[] => {
      if (level > WE_GRID_TREE_MAX_DEPTH) {
        if (isDevMode()) {
          throw new Error(`[we-grid] "${this.gridKey}": the tree is deeper than ${WE_GRID_TREE_MAX_DEPTH} levels — treeChildren probably returns a row's own ancestor.`);
        }
        return [];
      }
      return rows.map((row) => {
        const node: WeGridTreeModelNode<T> = { row, key: this.rowKey(row), level, parent, children: [] };
        all.push(node);
        if (byKey.has(node.key)) duplicate = true;
        else byKey.set(node.key, node);
        const children = this.treeChildren?.(row) ?? [];
        node.children = children.length > 0 ? visit(children, level + 1, node) : [];
        return node;
      });
    };
    const roots = visit(this.data ?? [], 0, null);
    if (duplicate && this.trackByField) {
      this.warnTreeOnce('duplicate', `two tree rows share a trackByField value — they share their open/closed state.`);
    }

    // treeDefaultExpanded applies to a row the first time it is seen; rows that disappeared lose
    // their state — unless treeRetainState keeps it for when they come back
    for (const node of all) {
      if (node.children.length === 0 || this.treeKnownKeys.has(node.key)) continue;
      this.treeKnownKeys.add(node.key);
      const open = this.treeDefaultExpanded === true || (typeof this.treeDefaultExpanded === 'number' && node.level < this.treeDefaultExpanded);
      if (open) this.treeExpandedKeys.add(node.key);
    }
    if (this.treeRetainState) {
      this.retainMissingTreeKeys(byKey);
      for (const key of Array.from(this.treeFilterClosedKeys)) if (!byKey.has(key)) this.treeFilterClosedKeys.delete(key);
    } else {
      this.treeRetainedKeys.clear();
      for (const set of [this.treeExpandedKeys, this.treeKnownKeys, this.treeFilterClosedKeys]) {
        for (const key of Array.from(set)) if (!byKey.has(key)) set.delete(key);
      }
    }

    this.treeModel = { roots, all, byKey };
    this.treeModelSource = { data: this.data, children: this.treeChildren };
    return this.treeModel;
  }

  /**
   * Gives every row a provisional tree info from the unfiltered tree — `childField`/`treeValue`
   * need the level while filtering and sorting, before the filtered positions are known.
   */
  private fillTreeInfo(model: WeGridTreeModel<T>): void {
    this.treeInfoByRow.clear();
    const fill = (nodes: WeGridTreeModelNode<T>[]) =>
      nodes.forEach((node, index) => {
        this.treeInfoByRow.set(node.row, {
          level: node.level,
          hasChildren: node.children.length > 0,
          expanded: this.treeExpandedKeys.has(node.key),
          parent: node.parent?.row ?? null,
          index,
          siblingCount: nodes.length
        });
        fill(node.children);
      });
    fill(model.roots);
  }

  /** Recomputes the tree infos of the filtered tree and lays out the open rows — the cheap part of a toggle */
  private flattenTree(): void {
    const visible: WeGridTreeNode<T>[] = [];
    const everyRow: T[] = [];
    const walk = (list: WeGridFilteredNode<T>[], parent: T | null, shown: boolean): void => {
      list.forEach((f, index) => {
        const { row, key, level } = f.node;
        const expanded = f.children.length > 0 && (this.treeExpandedKeys.has(key) || (f.heldOpen && !this.treeFilterClosedKeys.has(key)));
        this.treeInfoByRow.set(row, { level, hasChildren: f.children.length > 0, expanded, parent, index, siblingCount: list.length });
        everyRow.push(row);
        if (shown) visible.push({ row, level, parent, index, siblingCount: list.length });
        walk(f.children, row, shown && expanded);
      });
    };
    walk(this.treeFiltered, null, true);
    this.treeNodes = visible;
    this.treeFilteredRows = everyRow;
    this.rebuildRenderItems();
  }

  private warnTreeOnce(id: string, message: string): void {
    if (!isDevMode() || this.treeWarnings.has(id)) return;
    this.treeWarnings.add(id);
    console.warn(`[we-grid] "${this.gridKey}": ${message}`);
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
    this.setDetailOpen(row, !this.isRowExpanded(row), event ? 'user' : 'api');
  }

  /** Whether `canExpandRow` lets this row have a detail */
  rowCanExpand(row: T): boolean {
    return !this.canExpandRow || this.canExpandRow(row);
  }

  /** Opens or closes a row's detail — `force` picks the state. Emits `(detailToggle)` with source 'api' */
  toggleRowDetail(row: T, force?: boolean): void {
    this.setDetailOpen(row, force ?? !this.isRowExpanded(row), 'api');
  }

  openRowDetail(row: T): void {
    this.setDetailOpen(row, true, 'api');
  }

  closeRowDetail(row: T): void {
    this.setDetailOpen(row, false, 'api');
  }

  /** Alias of `isRowExpanded` */
  isRowDetailOpen(row: T): boolean {
    return this.isRowExpanded(row);
  }

  /** `id` of a row's detail region — for the `aria-controls` of a button that opens it */
  detailId(row: T): string {
    return `we-grid-detail-${encodeURIComponent(String(this.rowKey(row)))}`;
  }

  closeAllDetails(): void {
    const open = this.expandedRows();
    open.forEach((row) => this.setDetailOpen(row, false, 'api'));
  }

  /**
   * Whether the detail row carries the region wrapper — any of the newer detail options turns it
   * on; with all of them at their defaults the detail markup stays exactly as it always was.
   */
  get detailEnhanced(): boolean {
    return this.detailSticky || this.detailTrigger !== 'column' || this.detailMount !== 'once' || !!this.canExpandRow || this.detailMaxWidth != null;
  }

  get detailMaxWidthCss(): string | null {
    return this.cssLength(this.detailMaxWidth);
  }

  /** A row's readable name — its text in the tree column, else in the first visible column */
  rowLabel(row: T): string {
    const field = this.treeColumnField ?? this.renderColumns[0]?.field;
    const col = this.renderColumns.find((c) => c.field === field);
    return col ? this.formatCell(row, col) : '';
  }

  private setDetailOpen(row: T, open: boolean, source: 'user' | 'api'): void {
    if (open && !this.rowCanExpand(row)) return;
    const key = this.rowKey(row);
    if (this.expandedKeys.has(key) === open) return;
    if (open) {
      this.expandedKeys.add(key);
      this.mountedDetailKeys.add(key);
    } else {
      this.expandedKeys.delete(key);
      // 'whileOpen' rebuilds the content on the next open — its cached context goes with it
      if (this.detailMount === 'whileOpen') this.rowDetailContextCache.delete(key);
    }
    this.detailToggle.emit({ row, open, source });
    this.cdr.markForCheck();
  }

  /** The loaded rows whose detail is open */
  private expandedRows(): T[] {
    if (this.expandedKeys.size === 0) return [];
    const rows = this.treeActive ? (this.treeModel?.all.map((n) => n.row) ?? []) : this.data ?? [];
    const seen = new Set<unknown>();
    return rows.filter((row) => {
      const key = this.rowKey(row);
      if (!this.expandedKeys.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /** A row `canExpandRow` stopped allowing loses its open detail — reported with source 'api' */
  private closeDetailsThatCannotExpand(): void {
    if (!this.canExpandRow || this.expandedKeys.size === 0) return;
    this.expandedRows()
      .filter((row) => !this.rowCanExpand(row))
      .forEach((row) => this.setDetailOpen(row, false, 'api'));
  }

  // ─── Sticky detail: the scroll area's width as a CSS variable ─────
  private viewportObserver: ResizeObserver | null = null;
  private lastViewportWidth = -1;

  /**
   * One ResizeObserver per grid, however many details are open, and only while `detailSticky` is
   * on: it writes the scroll area's width to `--we-grid-viewport-width`, which caps the sticky
   * content. It runs outside Angular and touches the DOM only when the width really changed.
   */
  private syncViewportObserver(): void {
    const area = this.scrollAreaRef?.nativeElement;
    if (!this.detailSticky || !area || typeof ResizeObserver === 'undefined') {
      this.viewportObserver?.disconnect();
      this.viewportObserver = null;
      this.lastViewportWidth = -1;
      area?.style.removeProperty('--we-grid-viewport-width');
      return;
    }
    if (this.viewportObserver) return;
    const write = (): void => {
      const width = area.clientWidth;
      if (width === this.lastViewportWidth) return;
      this.lastViewportWidth = width;
      area.style.setProperty('--we-grid-viewport-width', `${width}px`);
    };
    this.ngZone.runOutsideAngular(() => {
      this.viewportObserver = new ResizeObserver(() => write());
      this.viewportObserver.observe(area);
    });
    write();
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
    const tree = this.treeActive ? this.treeInfoByRow.get(row) : undefined;
    const cached = this.rowDetailContextCache.get(key);
    if (cached && cached.row === row && cached.rowIndex === rowIndex && cached.tree === tree) {
      return cached;
    }
    const ctx: WeGridRowDetailContext<T> = { $implicit: row, row, rowIndex, close: () => this.setDetailOpen(row, false, 'api') };
    if (tree) ctx.tree = tree;
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
      this.selectableRows.forEach((row) => this.selectedKeys.delete(this.rowKey(row)));
    } else {
      this.selectableRows.forEach((row) => this.selectedKeys.add(this.rowKey(row)));
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
    return this.selectableRows.filter((row) => this.isSelected(row));
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
    const rows = scope === 'selected' ? this.selectedRows : this.treeActive ? this.treeFilteredRows : this.displayData;
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
        useDisplayText: !!col.displayValue,
        numberScale: col.type === 'currency' && col.minorUnits ? this.inputScale(col) : 1
      })),
      rows: rows.map((row) => {
        const values = columns.map((col) => this.cellValue(row, col));
        const text = columns.map((col) => (col.displayValue ? col.displayValue(row) : this.formatCell(row, col)));
        // Tree mode: two spaces per level in front of the first column keep the hierarchy readable
        const level = this.treeActive ? (this.treeInfoByRow.get(row)?.level ?? 0) : 0;
        if (level > 0 && text.length > 0) {
          const indent = '  '.repeat(level);
          text[0] = indent + text[0];
          if (typeof values[0] === 'string') values[0] = indent + values[0];
        }
        return { values, text };
      }),
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
        this.internalColumns.map((col) => this.importColumn(col))
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

  /** The draft row at the top of the table — only in row mode; the form mode edits in its dialog */
  get showDraftRow(): boolean {
    return this.isCreating && this.editMode === 'row';
  }

  /** Whether the row itself shows editors — never in form mode, where the dialog does */
  isEditingRow(row: T): boolean {
    return this.editMode === 'row' && !!this.edit && !this.isCreating && this.edit.key === this.rowKey(row);
  }

  /** The fields of the record form: every editable column in column order, hidden ones included */
  get formColumns(): WeGridInternalColumn<T>[] {
    return this.internalColumns.filter((c) => c.editable).sort((a, b) => a.order - b.order);
  }

  readonly formScaleFor = (col: WeGridInternalColumn<unknown>): number => this.inputScale(col as WeGridInternalColumn<T>);

  onFormValueChange(change: WeGridEditFormChange): void {
    const col = this.internalColumns.find((c) => c.field === change.field);
    if (col) this.setDraftValue(col, change.value);
  }

  isRowDeleting(row: T): boolean {
    return this.deletingKeys.has(this.rowKey(row));
  }

  /** Whether this cell shows an editor right now — the row is in edit mode AND the column allows it */
  isCellEditing(row: T, col: WeGridInternalColumn<T>): boolean {
    return col.editable && this.isEditingRow(row) && !this.isMappedTreeCell(row, col);
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

  // ─── Saved views ─────────────────────────────────────────────────────
  private get viewsKey(): string {
    return `${this.gridKey}::views`;
  }

  private loadViews(): void {
    this.layoutStore
      .load(this.viewsKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe((record) => {
        this.views = (record?.views ?? []).map((v) => weGridSanitizeView(v)).filter((v): v is WeGridSavedView => v !== null);
        this.cdr.markForCheck();
      });
  }

  private persistViews(): void {
    const record: WeGridLayout = { gridKey: this.viewsKey, version: 1, columns: [], views: this.views };
    this.layoutStore.save(this.viewsKey, record).pipe(takeUntil(this.destroy$)).subscribe();
  }

  toggleViewsPanel(): void {
    this.viewsPanelOpen = !this.viewsPanelOpen;
  }

  /** Closes the panel once focus has left it and its button — a click anywhere else does that */
  onViewsFocusOut(event: FocusEvent, container: HTMLElement): void {
    const next = event.relatedTarget as Node | null;
    if (!next || !container.contains(next)) this.viewsPanelOpen = false;
  }

  /** The grid as it looks right now, as a view called `name` */
  getCurrentView(name: string): WeGridSavedView {
    return {
      name,
      columns: toColumnLayout(this.internalColumns, this.columns),
      density: this.density,
      sort: this.currentSort?.direction ? { ...this.currentSort } : null,
      filters: Array.from(this.filterState.values())
        .filter(isWeGridFilterActive)
        .map((f) => ({ ...f })),
      groupField: this.groupField,
      ...(this.groupFields.length > 1 ? { groupFields: [...this.groupFields] } : {}),
      filterRowVisible: this.filterRowVisible
    };
  }

  /** Saves the current state as a view — a view of the same name is replaced */
  saveCurrentView(name: string): void {
    const trimmed = name.trim();
    if (trimmed === '') return;
    const view = weGridSanitizeView(this.getCurrentView(trimmed));
    if (!view) return;
    const index = this.views.findIndex((v) => v.name === view.name);
    this.views = index === -1 ? [...this.views, view] : this.views.map((v, i) => (i === index ? view : v));
    this.activeViewName = view.name;
    this.newViewName = '';
    this.persistViews();
    this.cdr.markForCheck();
  }

  deleteView(name: string): void {
    this.views = this.views.filter((v) => v.name !== name);
    if (this.activeViewName === name) this.activeViewName = null;
    this.persistViews();
    this.cdr.markForCheck();
  }

  /**
   * Puts the grid into a view. Anything that no longer fits the current columns is dropped: a
   * column that was removed, a filter whose operator the column doesn't offer, a sort on a column
   * that can't be sorted. Server-side grids get `(sortChange)`, `(filterChange)` and
   * `(groupChange)` just as if the user had made the changes by hand.
   */
  applyView(view: WeGridSavedView): void {
    const synthetic: WeGridLayout = { gridKey: this.gridKey, version: this.layoutVersion, columns: view.columns };
    this.internalColumns = mergeGridLayout(this.columns, synthetic, this.layoutVersion, this.headerFilterMode).columns;
    if (view.density) this.density = view.density;
    if (view.filterRowVisible !== undefined) this.filterRowVisible = view.filterRowVisible;

    const filtersBefore = this.activeFilterSignature();
    this.filterState.clear();
    for (const filter of view.filters ?? []) {
      const col = this.internalColumns.find((c) => c.field === filter.field);
      if (!col?.filterable) continue;
      const allowed = filter.operator === 'in' || weGridFilterOperatorsFor(col.type, col.filterOperators).includes(filter.operator);
      if (allowed) this.filterState.set(col.field, { ...filter });
    }

    const wanted = view.groupFields?.length ? view.groupFields : view.groupField ? [view.groupField] : [];
    const groupFields = this.grouping && !this.treeActive ? this.validGroupFields(wanted) : [];
    if (groupFields.join('\u0000') !== this.groupFields.join('\u0000')) {
      const outerBefore = this.groupField;
      this.groupFields = groupFields;
      this.groupCollapsedKeys.clear();
      if (this.groupField !== outerBefore) this.groupChange.emit(this.groupField);
      this.groupFieldsChange.emit([...this.groupFields]);
    }

    this.recomputeRenderColumns();
    this.refreshDisplayData();

    const sortCol = view.sort ? this.internalColumns.find((c) => c.field === view.sort?.field && c.sortable) : undefined;
    const target = sortCol && view.sort ? view.sort : null;
    const current = this.currentSort?.direction ? this.currentSort : null;
    if (target && (target.field !== current?.field || target.direction !== current?.direction)) {
      this.applySort(target.field, target.direction);
    } else if (!target && current) {
      this.applySort(current.field, null);
    }

    // Flushed rather than debounced: picking a view is one deliberate click, like resetting
    if (this.activeFilterSignature() !== filtersBefore) {
      this.filterEmit$.next();
      this.filterEmitFlush$.next();
    }

    this.activeViewName = view.name;
    this.viewsPanelOpen = false;
    this.scheduleLayoutSave();
    this.cdr.markForCheck();
  }

  private activeFilterSignature(): string {
    return JSON.stringify(
      Array.from(this.filterState.values())
        .filter(isWeGridFilterActive)
        .map((f) => [f.field, f.operator, f.value ?? null, f.value2 ?? null])
    );
  }

  shareView(view: WeGridSavedView): void {
    const token = weGridEncodeView(view);
    if (this.viewShare.observed) {
      this.viewShare.emit({ view, token });
      return;
    }
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set(weGridViewParamName(this.gridKey), token);
    const link = url.toString();
    const failed = (): void => this.showNotice(`${this.locale.viewLinkCopyFailed} ${link}`, true);
    if (!navigator.clipboard) {
      failed();
      return;
    }
    navigator.clipboard.writeText(link).then(() => this.showNotice(this.locale.viewLinkCopied, false), failed);
  }

  /** Opens the grid in the view a shared link carries — offered for saving under its own name */
  private applyViewFromUrl(): void {
    if (!this.savedViews || typeof window === 'undefined') return;
    const token = new URLSearchParams(window.location.search).get(weGridViewParamName(this.gridKey));
    const view = token ? weGridDecodeView(token) : null;
    if (!view) return;
    this.applyView(view);
    this.newViewName = view.name;
  }

  // ─── Pasting a spreadsheet range ─────────────────────────────────────
  get pasteEnabled(): boolean {
    return this.editable && this.allowPaste;
  }

  isActiveCell(row: T, col: WeGridInternalColumn<T>): boolean {
    return this.activeCell !== null && this.activeCell.field === col.field && this.activeCell.key === this.rowKey(row);
  }

  onCellClick(event: MouseEvent, row: T, col: WeGridInternalColumn<T>): void {
    if (col.stopRowEvents.includes('click')) event.stopPropagation();
    if (this.pasteEnabled && !this.isCellEditing(row, col)) this.activeCell = { key: this.rowKey(row), field: col.field };
  }

  onPaste(event: ClipboardEvent): void {
    if (!this.pasteEnabled || !this.activeCell || this.edit) return;
    // A paste into an editor, the filter row or any other text box is that control's business
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (text === '') return;
    event.preventDefault();
    this.pasteTable(weGridParseClipboardTable(text));
  }

  /** The rows in the order the user sees them — grouped, a collapsed group's rows are skipped */
  private get visibleRowsInOrder(): T[] {
    return this.renderItems.flatMap((item) => (item.kind === 'row' ? [item.row] : []));
  }

  private pasteTable(table: string[][]): void {
    const anchor = this.activeCell;
    if (!anchor) return;
    const rows = this.visibleRowsInOrder;
    const startRow = rows.findIndex((row) => this.rowKey(row) === anchor.key);
    const startCol = this.renderColumns.findIndex((c) => c.field === anchor.field);
    if (startRow === -1 || startCol === -1) return;

    const updates: WeGridPastedRow<T>[] = [];
    const created: T[] = [];
    const errors: string[] = [];
    let cellCount = 0;
    let droppedRows = 0;

    table.forEach((cells, offset) => {
      const original = rows[startRow + offset] as T | undefined;
      if (!original && !this.allowAdd) {
        droppedRows++;
        return;
      }
      // Cells are laid over the columns as the user sees them; read-only columns keep their value
      const values: Record<string, unknown> = {};
      cells.forEach((raw, c) => {
        const col = this.renderColumns[startCol + c];
        if (!col || !col.editable || (original && this.isMappedTreeCell(original, col))) return;
        const { value, ok } = this.coercePastedValue(raw, col);
        const cellName = `${weGridDisplayHeader(col)} (${startRow + offset + 1})`;
        if (!ok) {
          errors.push(`${cellName}: "${raw}"`);
          return;
        }
        if (col.required && (value === null || value === '')) {
          errors.push(`${cellName}: ${this.locale.requiredField}`);
          return;
        }
        values[col.field] = value;
      });

      if (!original) {
        const row = { ...((this.newRowTemplate ?? {}) as object) } as T;
        for (const [field, value] of Object.entries(values)) setNestedValue(row, field, value);
        created.push(row);
        cellCount += Object.keys(values).length;
        return;
      }
      const changes: Record<string, unknown> = {};
      for (const [field, value] of Object.entries(values)) {
        if (!weGridSameEditValue(getNestedValue(original, field), value)) changes[field] = value;
      }
      if (Object.keys(changes).length === 0) return;
      const row = { ...(original as object) } as T;
      for (const [field, value] of Object.entries(changes)) setNestedValue(row, field, value);
      updates.push({ row, original, rowIndex: this.displayData.indexOf(original), changes });
      cellCount += Object.keys(changes).length;
    });

    const parts = [this.locale.pasteApplied(cellCount)];
    if (droppedRows > 0) parts.push(this.locale.pasteRowsDropped(droppedRows));
    if (errors.length > 0) parts.push(`${this.locale.pasteInvalidCells} ${errors.slice(0, 10).join(', ')}`);
    const summary = parts.join(' · ');
    const hasProblems = droppedRows > 0 || errors.length > 0;

    if (updates.length === 0 && created.length === 0) {
      this.showNotice(summary, hasProblems);
      return;
    }

    if (!this.rowsPaste.observed) {
      for (const update of updates) {
        for (const [field, value] of Object.entries(update.changes)) setNestedValue(update.original, field, value);
      }
      if (created.length > 0) this.data = [...this.data, ...created];
      this.refreshDisplayData();
      this.showNotice(summary, hasProblems);
      return;
    }

    this.rowsPaste.emit({
      updates,
      created,
      errors,
      done: (success, error) => this.showNotice(success ? summary : (error ?? this.locale.saveFailed), !success || hasProblems)
    });
  }

  /** A pasted text in the column's terms — a select column also accepts an option's label */
  private coercePastedValue(raw: string, col: WeGridInternalColumn<T>): { value: unknown; ok: boolean } {
    if (col.editorOptions && raw.trim() !== '') {
      const text = raw.trim().toLocaleLowerCase(this.locale.intlLocale);
      const option = col.editorOptions.find(
        (o) =>
          o.label.toLocaleLowerCase(this.locale.intlLocale) === text ||
          String(o.value).toLocaleLowerCase(this.locale.intlLocale) === text
      );
      return option ? { value: option.value, ok: true } : { value: null, ok: false };
    }
    return weGridCoerceImportValue(raw, this.importColumn(col));
  }

  /** The column as the import/paste converter sees it */
  private importColumn(col: WeGridInternalColumn<T>): WeGridImportColumn {
    return {
      field: col.field,
      header: weGridDisplayHeader(col),
      type: col.type,
      minorUnitFactor:
        col.type === 'currency' && col.minorUnits
          ? 10 ** weGridCurrencyFractionDigits(weGridResolveCurrency(col.format, this.locale.intlCurrency))
          : 1
    };
  }

  // ─── Column width dragging ───────────────────────────────────────────
  /** Double-clicking a column's right border fits it to its content, like a spreadsheet */
  onResizeHandleDblClick(event: MouseEvent, col: WeGridInternalColumn<T>): void {
    event.stopPropagation();
    this.handleMenuAction({ type: 'autofit', field: col.field });
  }

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
    col.autoFitPending = false;
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
    const moving = this.renderColumns[event.previousIndex];
    if (moving && !this.dropSortPredicate(event.currentIndex, { data: moving })) return;
    moveItemInArray(this.renderColumns, event.previousIndex, event.currentIndex);
    this.renumberColumnOrder();
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
      return;
    }
    // Alt+arrows move the focused header. Only on the header itself — Alt+arrow means back/forward
    // to the browser everywhere else, and a control inside the header owns its own keys.
    if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight') && event.target === thEl) {
      event.preventDefault();
      const towardsEnd = (event.key === 'ArrowRight') !== this.isRtl;
      const moved = this.moveColumn(col, event.shiftKey ? (towardsEnd ? 'last' : 'first') : towardsEnd ? 1 : -1);
      if (moved) {
        // The header element moves with its column; keep the keyboard on it
        setTimeout(() => thEl.focus());
      }
    }
  }

  private get isRtl(): boolean {
    if (typeof window === 'undefined') return false;
    return window.getComputedStyle(this.elementRef.nativeElement).direction === 'rtl';
  }

  /** The keyboard twin of dragging the resize handle — see docs/api.md for the keys */
  onResizeKeydown(event: KeyboardEvent, col: WeGridInternalColumn<T>, thEl: HTMLElement): void {
    const step = event.shiftKey ? 32 : 8;
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowRight':
        next = col.width + (this.isRtl ? -step : step);
        break;
      case 'ArrowLeft':
        next = col.width + (this.isRtl ? step : -step);
        break;
      case 'Home':
        next = col.minWidth;
        break;
      case 'Enter':
        event.preventDefault();
        event.stopPropagation();
        this.handleMenuAction({ type: 'autofit', field: col.field });
        return;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        thEl.focus();
        return;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    const width = Math.max(col.minWidth, Math.round(next));
    if (width === col.width) return;
    col.width = width;
    col.autoFitPending = false;
    this.recomputeRenderColumns();
    this.scheduleLayoutSave();
    this.cdr.markForCheck();
  }

  /**
   * Moves a visible column inside its pin group (left, unpinned, right) — by one place, or to the
   * group's first/last place. A `lockOrder` column never moves and nothing passes it; the move
   * stops at the last free place. Returns whether anything moved.
   */
  moveColumn(col: WeGridInternalColumn<T>, to: 1 | -1 | 'first' | 'last'): boolean {
    const target = this.moveTargetIndex(col, to);
    if (target === null) return false;
    const from = this.renderColumns.indexOf(col);
    moveItemInArray(this.renderColumns, from, target);
    this.renumberColumnOrder();
    this.recomputeRenderColumns();
    this.scheduleLayoutSave();
    this.announce(this.locale.columnMoved(weGridDisplayHeader(col), this.renderColumns.indexOf(col) + 1));
    this.cdr.markForCheck();
    return true;
  }

  /** Index in `renderColumns` a move would land on, or null when it can't move that way */
  private moveTargetIndex(col: WeGridInternalColumn<T>, to: 1 | -1 | 'first' | 'last'): number | null {
    if (col.lockOrder) return null;
    const list = this.renderColumns;
    const from = list.indexOf(col);
    if (from === -1) return null;
    const group = list.map((_, i) => i).filter((i) => (list[i].pinned ?? null) === (col.pinned ?? null));
    const pos = group.indexOf(from);
    const goal = to === 'first' ? 0 : to === 'last' ? group.length - 1 : Math.min(Math.max(pos + to, 0), group.length - 1);
    const step = goal > pos ? 1 : -1;
    let reached = pos;
    while (reached !== goal && !list[group[reached + step]].lockOrder) reached += step;
    return reached === pos ? null : group[reached];
  }

  /** Writes the visible order back to `order`, hidden columns after the visible ones */
  private renumberColumnOrder(): void {
    this.renderColumns.forEach((c, i) => (c.order = i));
    this.internalColumns.filter((c) => !c.visible).forEach((c, i) => (c.order = this.renderColumns.length + i));
  }

  /**
   * Drag-and-drop guard: a locked column's place can't be taken, a drag can't cross one, and a
   * column pinned to one side can't be dropped among the other side's columns.
   */
  readonly dropSortPredicate = (index: number, drag: { data: unknown }): boolean => {
    const dragged = drag.data as WeGridInternalColumn<T>;
    if (dragged.lockOrder) return false;
    const target = this.renderColumns[index];
    if (!target || target === dragged) return true;
    if (target.lockOrder) return false;
    if (dragged.pinned && target.pinned && dragged.pinned !== target.pinned) return false;
    const from = this.renderColumns.indexOf(dragged);
    const [lo, hi] = from < index ? [from, index] : [index, from];
    return !this.renderColumns.slice(lo + 1, hi).some((c) => c.lockOrder);
  };

  /**
   * Opens the columns menu — the toolbar menu, without the column-specific items — anchored to
   * `anchor`, or to the toolbar's Columns button, or (with `toolbar='none'`) to the grid's top
   * corner. Focus returns to the anchor when the menu closes.
   */
  openColumnsMenu(anchor?: HTMLElement): void {
    const origin = anchor ?? this.gearButtonRef?.nativeElement;
    if (origin) {
      this.openHeaderMenu(origin, null);
      return;
    }
    const rect = (this.elementRef.nativeElement as HTMLElement).getBoundingClientRect();
    this.openHeaderMenu({ x: this.isRtl ? rect.right : rect.left, y: rect.top }, null);
  }

  openColumnsMenuFromToolbar(): void {
    this.openColumnsMenu();
  }

  /**
   * Right-click on a cell — only takes effect while `grouping=true`. While false it returns
   * early and NEVER calls `preventDefault`, so the browser's default context menu keeps working
   * exactly as it did on existing screens (the handler is bound but stays inert).
   */
  onCellContextMenu(event: MouseEvent, col: WeGridInternalColumn<T>, row: T): void {
    // A cell that keeps its right click, or a control under ignoreInteractiveTargets, gets the
    // browser's own menu — copy and paste in an input must keep working.
    if (col.stopRowEvents.includes('contextmenu')) {
      event.stopPropagation();
      return;
    }
    if (this.isFromInteractiveTarget(event)) return;
    if (!this.grouping) return;
    event.preventDefault();
    const raw = getNestedValue(row, col.field);
    if (col.headerFilterMode === 'checklist') {
      // A checklist filters on raw codes, so the raw value travels and its label is remembered for
      // the chip — the row it came from is gone by the time the chip renders.
      if (col.displayValue && raw !== null && raw !== undefined && raw !== '') {
        this.checklistLabelsFor(col.field).set(weGridFilterValueKey(raw), col.displayValue(row));
      }
      this.openHeaderMenu({ x: event.clientX, y: event.clientY }, col, { value: raw });
      return;
    }
    // When displayValue is given, "filter by this value" uses the label the user sees instead of the raw code
    const value = col.displayValue ? col.displayValue(row) : raw;
    this.openHeaderMenu({ x: event.clientX, y: event.clientY }, col, { value });
  }

  private openHeaderMenu(origin: WeGridMenuOrigin, column: WeGridInternalColumn<T> | null, cellCtx?: { value: unknown }): void {
    // One grid menu on the page at a time — opening this one from code closes another grid's
    weGridOpenMenuCloser?.();
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
    weGridOpenMenuCloser = () => this.closeHeaderMenu();

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
    componentRef.setInput('enableGrouping', this.grouping && !this.treeActive);
    componentRef.setInput('treeMode', this.treeActive);
    componentRef.setInput('treeAllExpanded', this.treeActive && this.treeAllExpanded);
    componentRef.setInput('groupField', this.groupField);
    componentRef.setInput('groupFields', this.groupFields);
    componentRef.setInput('cellValue', cellCtx?.value);
    componentRef.setInput('hasCellValue', !!cellCtx);
    componentRef.setInput('canMoveLeft', !!column && this.moveTargetIndex(column, this.isRtl ? 1 : -1) !== null);
    componentRef.setInput('canMoveRight', !!column && this.moveTargetIndex(column, this.isRtl ? -1 : 1) !== null);

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
    weGridOpenMenuCloser = null;
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
      case 'move-column': {
        const col = this.internalColumns.find((c) => c.field === action.field);
        const towardsEnd = (action.direction === 'right') !== this.isRtl;
        // moveColumn already saves and re-renders
        if (col) this.moveColumn(col, towardsEnd ? 1 : -1);
        this.cdr.markForCheck();
        return;
      }
      case 'tree-expand-all':
        this.expandAllTree();
        return;
      case 'tree-collapse-all':
        this.collapseAllTree();
        return;
      case 'autofit-all':
        // A templated cell's content can't be measured as text — fitting it would shrink the
        // column to its header, so those columns keep their width.
        this.internalColumns.filter((c) => c.visible && !this.getCellTemplate(c)).forEach((c) => this.autofitColumn(c));
        break;
      case 'pin': {
        const col = this.internalColumns.find((c) => c.field === action.field);
        if (col && !col.lockPinned) col.pinned = action.pinned;
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
        // unnecessary PUT/localStorage write). "Group by this field" replaces every level.
        this.groupField = action.field;
        this.applyGrouping();
        this.groupChange.emit(this.groupField);
        this.groupFieldsChange.emit([...this.groupFields]);
        this.cdr.markForCheck();
        return;
      case 'group-add':
        this.addGroupField(action.field);
        return;
      case 'group-remove':
        this.removeGroupField(action.field);
        return;
      case 'groups-expand-all':
        this.expandAllGroups();
        return;
      case 'groups-collapse-all':
        this.collapseAllGroups();
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
    const merged = mergeGridLayout(this.columns, null, this.layoutVersion, this.headerFilterMode);
    this.internalColumns = merged.columns;
    this.density = 'normal';
    this.clientSort = null;
    this.filterRowVisible = false;
    const hadActiveFilter = this.hasActiveFilters;
    this.filterState.clear();
    this.checklistLabels.clear();
    this.groupField = null;
    this.groupCollapsedKeys.clear();
    this.refreshDisplayData();

    // persistLayout() is deliberately unreachable from here (it would PUT back the record the reset
    // just deleted), so the snapshot is emitted directly — a pure read, no store call.
    this.layoutChange.emit(this.buildLayoutSnapshot());
    // A server-side screen would otherwise keep querying with filters the user no longer sees. The
    // pending debounce window is flushed rather than waited out: the reset is one deliberate click,
    // and an unsent keystroke emit has to collapse into this one instead of trailing it.
    if (hadActiveFilter) {
      this.filterEmit$.next();
      this.filterEmitFlush$.next();
    }
  }

  private autofitColumn(col: WeGridInternalColumn<T>, maxWidth?: number): void {
    const ctx = this.measureCanvas?.getContext('2d');
    if (!ctx) return;
    const host = this.elementRef.nativeElement as HTMLElement;
    const root = host.querySelector<HTMLElement>('.we-grid') ?? host;
    // Header and cells are measured in the font they actually render in — the grid's own font
    // size differs from the host's (and between densities), and the header is bold.
    const rootStyle = this.computedStyle(root);
    const font = rootStyle ? `${rootStyle.fontSize} ${rootStyle.fontFamily}` : '13px sans-serif';
    ctx.font = `600 ${font}`;
    const header = ctx.measureText(weGridDisplayHeader(col)).width + this.headerChromeWidth(col);
    ctx.font = font;
    let cells = 0;
    if (!this.getCellTemplate(col)) {
      for (const row of this.displayData.slice(0, 200)) {
        const width = ctx.measureText(this.formatCell(row, col)).width;
        if (width > cells) cells = width;
      }
    }
    const cellPadding = this.horizontalPadding(host.querySelector<HTMLElement>('.we-grid__row td')) ?? 16;
    // A few px of slack — canvas text metrics and the rendered text don't round the same way
    const fitted = Math.max(col.minWidth, Math.ceil(Math.max(header, cells + cellPadding)) + 4);
    const bound = col.maxWidth ?? maxWidth;
    col.width = bound ? Math.max(col.minWidth, Math.min(fitted, bound)) : fitted;
    col.autoFitPending = false;
  }

  /**
   * Width the header cell needs besides its label — padding, the funnel and menu buttons, and room
   * for a sort arrow that may appear later. Read from the column's own rendered header (or any
   * header, for a hidden column); the fallback covers a fit that runs before the first render.
   */
  private headerChromeWidth(col: WeGridInternalColumn<T>): number {
    const host = this.elementRef.nativeElement as HTMLElement;
    const headers = Array.from(host.querySelectorAll<HTMLElement>('.we-grid__header-row th[role="columnheader"]'));
    const th = headers[this.renderColumns.indexOf(col)] ?? headers[0];
    const inner = th?.querySelector<HTMLElement>('.we-grid__th-inner');
    const innerStyle = inner ? this.computedStyle(inner) : null;
    if (!inner || !innerStyle) return 64;
    const gap = parseFloat(innerStyle.columnGap) || 0;
    let width = this.horizontalPadding(inner) ?? 0;
    let hasSortIcon = false;
    for (const child of Array.from(inner.children) as HTMLElement[]) {
      if (child.classList.contains('we-grid__th-label')) continue;
      if (child.classList.contains('we-grid__sort-icon')) hasSortIcon = true;
      width += child.getBoundingClientRect().width + gap;
    }
    if (col.sortable && !hasSortIcon) {
      const sortIcon = host.querySelector<HTMLElement>('.we-grid__sort-icon');
      width += (sortIcon?.getBoundingClientRect().width ?? 12) + gap;
    }
    return width;
  }

  private horizontalPadding(el: HTMLElement | null): number | null {
    const style = el ? this.computedStyle(el) : null;
    if (!style) return null;
    return (
      (parseFloat(style.paddingLeft) || 0) +
      (parseFloat(style.paddingRight) || 0) +
      (parseFloat(style.borderLeftWidth) || 0) +
      (parseFloat(style.borderRightWidth) || 0)
    );
  }

  private computedStyle(el: HTMLElement): CSSStyleDeclaration | null {
    if (typeof window === 'undefined') return null;
    const style = window.getComputedStyle(el);
    return style.fontSize ? style : null;
  }

  /**
   * The automatic half of `autoFitColumns`: fits the columns still on the default width once there
   * are rows to measure. Runs before the rows render, so the columns never visibly jump; the result
   * isn't saved as a layout change — nothing the user did changed.
   */
  private autoFitPendingColumns(): void {
    if (!this.autoFitColumns || this.displayData.length === 0) return;
    const pending = this.internalColumns.filter((c) => c.autoFitPending);
    if (pending.length === 0) return;
    // Detached, the host has no computed font and the measurement would be wrong — the next data
    // refresh after attaching tries again.
    if (!(this.elementRef.nativeElement as HTMLElement).isConnected) return;
    for (const col of pending) {
      if (this.getCellTemplate(col)) col.autoFitPending = false;
      else this.autofitColumn(col, WE_GRID_AUTO_FIT_MAX_WIDTH);
    }
    this.recomputeRenderColumns();
  }
}
