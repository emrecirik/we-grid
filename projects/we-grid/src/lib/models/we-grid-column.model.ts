import { TemplateRef } from '@angular/core';
import { WeGridEditorOption, WeGridEditorType } from './we-grid-edit.model';
import { WeGridRowEventName } from './we-grid-events.model';
import { WeGridTreeInfo } from './we-grid-tree.model';
import { WeGridFilterOperator } from './we-grid-filter.model';

/**
 * Column data type — cell rendering, default formatting, filtering, editing, export and import are
 * driven by this.
 *
 * - `'text'` — plain text
 * - `'number'` — a number; `format: '2-2'` sets the min-max fraction digits
 * - `'integer'` — a whole number, shown without fraction digits
 * - `'currency'` — money in the locale's (or `format`'s) currency; add `minorUnits: true` when the
 *   value is stored in the minor unit (kuruş, cents — `12345` → ₺123,45)
 * - `'percent'` — a FRACTION shown as a percentage (`0.255` → %25,5); `format` sets fraction digits
 * - `'date'` / `'datetime'` — a `Date` or anything `new Date()` accepts
 * - `'time'` — a time of day, either `'HH:mm'` / `'HH:mm:ss'` text or a `Date`
 * - `'boolean'` — shown as the locale's Yes / No
 * - `'email'` / `'url'` / `'phone'` — text rendered as a `mailto:` / web / `tel:` link
 * - `'custom'` — rendered by a cell template only
 */
export type WeGridColumnType =
  | 'text'
  | 'number'
  | 'integer'
  | 'date'
  | 'datetime'
  | 'time'
  | 'currency'
  | 'percent'
  | 'boolean'
  | 'email'
  | 'url'
  | 'phone'
  | 'custom';

/**
 * The family a column type behaves like when filtering, sorting and summarising: every numeric type
 * filters with = > < between, every date type with a calendar picker, and so on.
 */
export type WeGridValueKind = 'text' | 'number' | 'date' | 'boolean';

/** Maps a column type onto the family it filters, sums and edits like — see WeGridValueKind */
export function weGridValueKind(type: WeGridColumnType | undefined): WeGridValueKind {
  switch (type) {
    case 'number':
    case 'integer':
    case 'currency':
    case 'percent':
      return 'number';
    case 'date':
    case 'datetime':
      return 'date';
    case 'boolean':
      return 'boolean';
    default:
      return 'text';
  }
}

/** Column types whose cells render as a link — see WeGridColumnType */
export function isWeGridLinkType(type: WeGridColumnType): boolean {
  return type === 'email' || type === 'url' || type === 'phone';
}

/**
 * Turns a cell value into its own display text — see WeGridColumnDef.formatter. `row` is `null`
 * where there is no row to hand: the summary row, a filter chip, a checklist value, a group header.
 */
export type WeGridValueFormatter<T = unknown> = (value: unknown, row: T | null) => string;

/** Cell / header alignment */
export type WeGridAlign = 'start' | 'center' | 'end';

/** Column pin direction */
export type WeGridPinned = 'left' | 'right' | null;

/** Grid density mode — determines row height */
export type WeGridDensity = 'comfortable' | 'normal' | 'compact';

/** Sort direction */
export type WeGridSortDirection = 'asc' | 'desc' | null;

/** Subtotal (summary row) function — a column with 'none' does not participate in the summary row */
export type WeGridSummaryFunction = 'sum' | 'count' | 'avg' | 'min' | 'max' | 'none';

/**
 * What the column header's funnel icon opens.
 * 'checklist' (the grid default since 0.5.0) is the Excel/DevExpress style list of the distinct
 * values in the data; 'operator' is the classic operator + single value popover.
 */
export type WeGridHeaderFilterMode = 'operator' | 'checklist';

/** Whether a checklist header filter accepts several values (checkboxes) or exactly one (radios) */
export type WeGridHeaderFilterSelection = 'multi' | 'single';

/** Where a checklist column's values come from — the loaded rows, or the grid's `checklistValuesProvider` */
export type WeGridHeaderFilterSource = 'loaded' | 'provider';

/** sum/avg/min/max only make sense on numeric columns (number/integer/currency/percent) — the rest only offer count */
export function isWeGridNumericSummaryType(type: WeGridColumnType): boolean {
  return weGridValueKind(type) === 'number';
}

/** Context passed to a `weGridCell` template — used as `let-row`, `let-value="value"` */
export interface WeGridCellContext<T> {
  $implicit: T;
  row: T;
  /** The cell's value — in tree mode resolved for the row's level (`treeValue` → `childField` → `field`) */
  value: unknown;
  rowIndex: number;
  column: WeGridColumnDef<T>;
  /** The row's place in the tree — only present in tree mode (`treeChildren`) */
  tree?: WeGridTreeInfo<T>;
}

/** Context passed to a header template (`headerTemplate` or the `weGridHeader` directive) */
export interface WeGridHeaderContext<T> {
  $implicit: WeGridColumnDef<T>;
  column: WeGridColumnDef<T>;
  /** The header text the grid would show — the user's rename included */
  title: string;
}

/**
 * Column definition supplied by the developer (the default layout).
 * User customizations (visibility, order, width, name, pin) are stored separately
 * in `WeGridColumnLayout` and merged on top of this definition.
 */
export interface WeGridColumnDef<T> {
  /** Field path on the row object — nested access via `a.b.c` is supported */
  field: string;
  /** Default header text */
  header: string;
  /** Cell render type — defaults to 'text' */
  type?: WeGridColumnType;
  /** Width in pixels */
  width?: number;
  /** Minimum width in pixels (resize/autofit never goes below this) */
  minWidth?: number;
  /**
   * Maximum width in pixels — only bounds autofit (manual dragging is unaffected).
   * For free-text columns that can grow unbounded (e.g. a `STRING_AGG` result), autofit would
   * otherwise apply the measured content width verbatim; a cell with thousands of characters could
   * blow up the column (and therefore the whole table) to an unreasonable size. If set, autofit
   * never exceeds this value, though the user can still drag the edge to widen it further.
   */
  maxWidth?: number;
  /** Default visibility — defaults to true */
  visible?: boolean;
  /** Default order (ascending) */
  order?: number;
  /** Word wrap — defaults to false (single line, ellipsis) */
  wrap?: boolean;
  /** Cell/header alignment */
  align?: WeGridAlign;
  /** Whether sortable — defaults to true */
  sortable?: boolean;
  /** Default pin direction */
  pinned?: WeGridPinned;
  /**
   * Type-specific format: `'min-max'` fraction digits for number/integer/percent (e.g. `'2-2'`), an
   * ISO 4217 code for currency (e.g. `'EUR'` — the locale's currency otherwise), `'HH:mm:ss'` for a
   * time column that should show seconds.
   */
  format?: string;
  /**
   * Currency columns only: the value is stored in the currency's MINOR unit — kuruş, cents — as
   * most payment and accounting backends do. `12345` then shows as ₺123,45 (the divisor comes from
   * the currency: 100 for TRY/USD/EUR, 1 for JPY). Everything the user sees or types is in major
   * units — the filter inputs, the inline editor, CSV/Excel import and export — while the rows,
   * sorting, the summary row and every filter value the grid EMITS stay in minor units, so a
   * server-side filter can be put straight into `WHERE amount_kurus >= :value`.
   */
  minorUnits?: boolean;
  /**
   * Custom display text for this column's values — `(value, row) => string`. Replaces the built-in
   * formatting wherever the value is shown as text: the cell, its tooltip, the summary row, group
   * headers, checklist entries, filter chips and the CSV/PDF export (Excel keeps numbers numeric).
   * `row` is `null` where no row exists (summary, chips, checklist, group headers), so a formatter
   * that needs the row should fall back gracefully. Unlike `displayValue` it changes presentation
   * only — filtering and grouping still work on the raw value. Also called for empty values, so it
   * can print a placeholder such as "—".
   */
  formatter?: WeGridValueFormatter<T>;
  /**
   * Custom cell template (can also be supplied via the `weGridCell` directive) — works
   * INDEPENDENTLY of `type`. If the field holds numeric/currency data, keep `type: 'number'` /
   * `'currency'` and still use a template; only setting `type: 'custom'` for rendering purposes
   * silently disables the sum/avg/min/max summary menu.
   */
  cellTemplate?: TemplateRef<WeGridCellContext<T>>;
  /** Tooltip shown when hovering over the header */
  headerTooltip?: string;
  /**
   * Explanation shown behind an info icon (ⓘ) next to the header text — on hover and on keyboard
   * focus, in an overlay that cell clipping can't cut. Long text wraps at about 320px and keeps its
   * line breaks. Already translated text: the grid shows it as is, and a rename doesn't change it.
   * When set, `headerTooltip` is not rendered (one tooltip per header).
   */
  headerHint?: string;
  /** Custom header content — the `weGridHeader` directive does the same from the template */
  headerTemplate?: TemplateRef<WeGridHeaderContext<T>>;
  /** If true, the user cannot hide this column (e.g. an actions column) */
  lockVisible?: boolean;
  /** If true, the user cannot rename this column */
  lockRename?: boolean;
  /**
   * The user can't change how this column is pinned — the pin items are left out of its menu and
   * a pin stored in a saved layout is ignored in favour of `pinned` here.
   */
  lockPinned?: boolean;
  /**
   * The user can't move this column, and no other column can be moved past it: it has no drag
   * handle and no move items, and keeps its definition position whatever a saved layout says.
   */
  lockOrder?: boolean;
  /**
   * Shorthand for `lockVisible` + `lockRename` + `lockPinned` + `lockOrder`. A sub-flag given
   * explicitly wins — `fixed: true, lockRename: false` leaves the column renamable.
   */
  fixed?: boolean;
  /** If true, clicking this cell does not bubble into the row's rowClick event — used for action/button columns */
  stopRowClick?: boolean;
  /**
   * The general form of `stopRowClick`: the listed events stop at the cell, so a button group or an
   * input inside it never fires `(rowClick)` / `(rowDblClick)` and a right click never opens the
   * grid's cell menu (the browser's own menu stays). `true` means all three. Combined with
   * `stopRowClick`, the union applies — `stopRowClick: true` alone still stops only `'click'`.
   */
  stopRowEvents?: boolean | WeGridRowEventName[];
  /**
   * Tree mode: the field a CHILD row (level 1 and deeper) is read from — defaults to `field`.
   * `null` leaves the column empty on child rows. Sorting, filtering, the summary row and exports
   * read the same value the cell shows.
   */
  childField?: string | null;
  /**
   * Tree mode: computes the value per row from its place in the tree. Wins over `childField` and
   * `field` everywhere the value is read — the cell text, sorting, filtering, summaries, exports.
   */
  treeValue?: (row: T, tree: WeGridTreeInfo<T>) => unknown;
  /**
   * Lets a cell's content spill out of it — a dropdown, a tooltip — instead of being clipped:
   * the cell gets `overflow: visible` (and `position: relative` unless it is pinned). Defaults to false.
   */
  allowOverflow?: boolean;
  /**
   * Developer-supplied default summary function — defaults to 'none'.
   * If the user makes their own choice from the header menu (including a deliberate 'none'), that
   * choice becomes permanent and overrides this default — on reload, the developer's default never
   * silently re-enables a total the user turned off.
   */
  summary?: WeGridSummaryFunction;
  /**
   * What this column shows in group headers and group footers while rows are grouped — independent
   * of `summary`, which drives the grand summary row. Left out, groups use `summary` and, when the
   * grid's `groupAutoSummary` is on, numeric columns without a summary add up ('sum').
   */
  groupSummary?: WeGridSummaryFunction;
  /**
   * Whether this column can be edited in the filter row — defaults to true. Set to `false` for
   * columns where filtering makes no sense (e.g. action/button columns); the cell stays empty in
   * the filter row when it's open. Only relevant on grids where the `filterRow` input is true.
   */
  filterable?: boolean;
  /**
   * Restricts the operators the filter row and the filter popover offer for this column — e.g.
   * `['equals']` on a field the backend can't run a `LIKE` against. Omitted, the type's full list is
   * offered, exactly as before. The select renders them in the order given and the first one is the
   * default. Operators that don't fit the column's `type` are ignored; a list with nothing left
   * falls back to the full list (with a dev-mode console warning). "Filter by this value" is hidden
   * on a column whose list rules out the exact match it stands for. Ignored by checklist columns.
   */
  filterOperators?: WeGridFilterOperator[];
  /**
   * What the header's funnel icon opens. Left out, the grid's `headerFilterMode` input decides —
   * `'checklist'` by default since 0.5.0 (`'custom'` columns always default to `'operator'`). With
   * `'operator'` it is the operator + single value popover (and the filter row shows the operator
   * controls). With `'checklist'` the popover instead lists the DISTINCT values of the rows currently in `data`
   * (the loaded page — the grid never issues a request of its own to collect them) with a search
   * box, a select-all box and an "(Empty)" entry. The selection leaves the grid as a single filter
   * whose operator is `'in'` and whose `value` is the array of picked raw values, so a
   * `filterMode='server'` screen can translate it into one `IN (...)` query — see
   * docs/server-side.md.
   */
  headerFilterMode?: WeGridHeaderFilterMode;
  /**
   * Whether the checklist accepts several values (checkboxes, the default) or exactly one (radio
   * buttons). Ignored while `headerFilterMode` is `'operator'`.
   */
  headerFilterSelection?: WeGridHeaderFilterSelection;
  /**
   * Pins where this checklist column's values come from. Left out, the column uses the grid's
   * `checklistValuesProvider` when one is set and the loaded rows otherwise; `'loaded'` keeps it on
   * the loaded rows even then — for a value computed on the client that the backend has no column
   * for. Ignored unless `headerFilterMode` is `'checklist'`.
   */
  headerFilterSource?: WeGridHeaderFilterSource;
  /**
   * Labels a raw checklist value without a row to hand (e.g. status `1` → "Draft"). A value the
   * `checklistValuesProvider` returned may belong to a page that was never loaded, where
   * `displayValue` — which needs the row — can't help. Not called for values the provider already
   * labelled; it also labels a ticked value on the filter chip when no label was seen for it.
   */
  checklistValueLabel?: (value: unknown) => string;
  /** Overrides the grid's `checklistValuesLimit` for this column's provider requests */
  checklistValuesLimit?: number;
  /**
   * Converts a raw/code value on the row (e.g. `status: 1`, `supplierCode: '120'`) into the
   * human-readable text shown to the user (e.g. "Draft", "120 - ABC Supplies Inc."). When supplied,
   * GROUP HEADERS, text filtering, and the "Filter by this value" context menu action all use this
   * label instead of the raw value — the user searches/groups by what they already see on screen
   * rather than the raw code. If omitted, the existing behavior (raw `field` value, formatted via
   * `formatWeGridValue`) is unchanged, so this is fully backward compatible. Sorting is NOT
   * affected by this — sorting always continues to use the raw `field` value.
   */
  displayValue?: (row: T) => string;
  /**
   * Whether this column is editable while the row is in inline edit mode — only relevant on grids
   * where the `editable` input is true. Defaults to true for every type except `'custom'`, whose
   * value shape the grid cannot know (give such a column an explicit `editor` if it is editable).
   */
  editable?: boolean;
  /** Editor control used while editing — inferred from `type` when omitted */
  editor?: WeGridEditorType;
  /** Options offered by a `'select'` editor — required for that editor, ignored by every other */
  editorOptions?: WeGridEditorOption[];
  /** The value may not be left empty when the row is committed — blocks Save and marks the cell */
  required?: boolean;
  /**
   * Whether the column takes part in CSV/Excel/PDF exports — defaults to true. Set to `false` for
   * columns that only exist on screen (action buttons, row selectors rendered as a column).
   */
  exportable?: boolean;
}
