import { TemplateRef } from '@angular/core';
import { WeGridEditorOption, WeGridEditorType } from './we-grid-edit.model';
import { WeGridFilterOperator } from './we-grid-filter.model';

/** Column data type — cell rendering and default formatting are driven by this */
export type WeGridColumnType = 'text' | 'number' | 'date' | 'datetime' | 'currency' | 'boolean' | 'custom';

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
 * 'operator' (the default) is the classic operator + single value popover; 'checklist' is the
 * Excel/DevExpress style list of the distinct values found in the loaded rows.
 */
export type WeGridHeaderFilterMode = 'operator' | 'checklist';

/** Whether a checklist header filter accepts several values (checkboxes) or exactly one (radios) */
export type WeGridHeaderFilterSelection = 'multi' | 'single';

/** Where a checklist column's values come from — the loaded rows, or the grid's `checklistValuesProvider` */
export type WeGridHeaderFilterSource = 'loaded' | 'provider';

/** sum/avg/min/max only make sense on numeric columns — text/date/boolean/custom only offer count */
export function isWeGridNumericSummaryType(type: WeGridColumnType): boolean {
  return type === 'number' || type === 'currency';
}

/** Context passed to a `weGridCell` template — used as `let-row`, `let-value="value"` */
export interface WeGridCellContext<T> {
  $implicit: T;
  row: T;
  value: unknown;
  rowIndex: number;
  column: WeGridColumnDef<T>;
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
  /** date/datetime/number/currency format (same convention as Angular's DatePipe/DecimalPipe) */
  format?: string;
  /**
   * Custom cell template (can also be supplied via the `weGridCell` directive) — works
   * INDEPENDENTLY of `type`. If the field holds numeric/currency data, keep `type: 'number'` /
   * `'currency'` and still use a template; only setting `type: 'custom'` for rendering purposes
   * silently disables the sum/avg/min/max summary menu.
   */
  cellTemplate?: TemplateRef<WeGridCellContext<T>>;
  /** Tooltip shown when hovering over the header */
  headerTooltip?: string;
  /** If true, the user cannot hide this column (e.g. an actions column) */
  lockVisible?: boolean;
  /** If true, the user cannot rename this column */
  lockRename?: boolean;
  /** If true, clicking this cell does not bubble into the row's rowClick event — used for action/button columns */
  stopRowClick?: boolean;
  /**
   * Developer-supplied default summary function — defaults to 'none'.
   * If the user makes their own choice from the header menu (including a deliberate 'none'), that
   * choice becomes permanent and overrides this default — on reload, the developer's default never
   * silently re-enables a total the user turned off.
   */
  summary?: WeGridSummaryFunction;
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
   * What the header's funnel icon opens — defaults to `'operator'`, i.e. the existing operator +
   * single value popover, so columns that don't set it behave exactly as before. With
   * `'checklist'` the popover instead lists the DISTINCT values of the rows currently in `data`
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
