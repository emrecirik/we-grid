import {
  WeGridColumnDef,
  WeGridDensity,
  WeGridHeaderFilterMode,
  WeGridSortDirection,
  isWeGridNumericSummaryType
} from '../models/we-grid-column.model';
import { weGridDefaultEditor } from '../models/we-grid-edit.model';
import { WeGridInternalColumn } from '../models/we-grid-internal.model';
import { WeGridLayout } from '../models/we-grid-layout.model';
import { WeGridRowEventName } from '../models/we-grid-events.model';

/** Default column width used when the developer doesn't supply `width` and it isn't in the saved layout either */
export const WE_GRID_DEFAULT_COLUMN_WIDTH = 150;

export interface WeGridMergedLayout<T> {
  columns: WeGridInternalColumn<T>[];
  density: WeGridDensity | undefined;
  sort: { field: string; direction: WeGridSortDirection } | null;
  pageSize: number | undefined;
  filterRowVisible: boolean | undefined;
}

/**
 * Merges the developer-supplied `columns` definition with a saved `WeGridLayout`.
 *
 * Rules:
 * - If `version` doesn't match, the saved layout is discarded entirely, falling back to the defaults
 * - A new column that isn't in the saved layout is appended at the end with its default settings
 * - A column no longer present in `columns` is silently dropped (even if still present in `saved`)
 * - `summary`: the user's saved choice wins if present (including a deliberate 'none'); otherwise
 *   the developer's `WeGridColumnDef.summary` default is used
 * - `headerFilterMode`: the column's own choice, otherwise `defaultHeaderFilterMode` (the grid's
 *   `headerFilterMode` input) — except a `'custom'` column, whose value the grid cannot list, which
 *   falls back to `'operator'`
 */
export function mergeGridLayout<T>(
  columnDefs: WeGridColumnDef<T>[],
  saved: WeGridLayout | null,
  layoutVersion: number,
  defaultHeaderFilterMode: WeGridHeaderFilterMode = 'checklist'
): WeGridMergedLayout<T> {
  const useSaved = !!saved && saved.version === layoutVersion;
  const savedByField = new Map(useSaved && saved ? saved.columns.map((c) => [c.field, c]) : []);

  const merged: WeGridInternalColumn<T>[] = columnDefs.map((def, index) => {
    const savedCol = savedByField.get(def.field);
    const type = def.type ?? 'text';
    const lockPinned = def.lockPinned ?? def.fixed ?? false;
    const lockOrder = def.lockOrder ?? def.fixed ?? false;
    // If the user has a saved choice (including a deliberate 'none'), it wins — it never falls
    // back to the developer default. Without a saved choice (new column, first load, after
    // reset) the developer's `summary` default on the column definition is used.
    const summaryCandidate = savedCol?.summary ?? def.summary ?? 'none';
    // If the candidate is sum/avg/min/max but the column isn't numeric (the type may have
    // changed since, or the developer may have mistakenly given a numeric default on a text
    // column), silently fall back to 'none' — otherwise a meaningless/incorrect "Total: NaN"
    // would show up on a text column.
    const summary =
      (summaryCandidate === 'sum' || summaryCandidate === 'avg' || summaryCandidate === 'min' || summaryCandidate === 'max') &&
      !isWeGridNumericSummaryType(type)
        ? 'none'
        : summaryCandidate;
    return {
      field: def.field,
      defaultHeader: def.header,
      headerOverride: savedCol?.headerOverride ?? null,
      type,
      visible: savedCol ? savedCol.visible : (def.visible ?? true),
      order: savedCol && !lockOrder ? savedCol.order : (useSaved ? 1000 + index : (def.order ?? index)),
      width: savedCol?.width ?? def.width ?? def.minWidth ?? WE_GRID_DEFAULT_COLUMN_WIDTH,
      minWidth: def.minWidth ?? 60,
      maxWidth: def.maxWidth,
      autoFitPending: savedCol?.width == null && def.width == null,
      wrap: savedCol?.wrap ?? def.wrap ?? false,
      align: def.align ?? 'start',
      sortable: def.sortable ?? true,
      pinned: savedCol && !lockPinned ? savedCol.pinned : (def.pinned ?? null),
      // the real value is computed in recomputeRenderColumns() — this is just a valid starting point
      pinnedOffset: 0,
      format: def.format,
      minorUnits: def.minorUnits ?? false,
      formatter: def.formatter,
      cellTemplate: def.cellTemplate,
      headerTooltip: def.headerTooltip,
      lockVisible: def.lockVisible ?? def.fixed ?? false,
      lockRename: def.lockRename ?? def.fixed ?? false,
      lockPinned,
      lockOrder,
      headerHint: def.headerHint,
      headerTemplate: def.headerTemplate,
      stopRowClick: def.stopRowClick ?? false,
      stopRowEvents: resolveStopRowEvents(def.stopRowEvents, def.stopRowClick),
      allowOverflow: def.allowOverflow ?? false,
      childField: def.childField,
      treeValue: def.treeValue,
      groupSummary:
        def.groupSummary && def.groupSummary !== 'count' && def.groupSummary !== 'none' && !isWeGridNumericSummaryType(type)
          ? 'none'
          : def.groupSummary,
      summary,
      filterable: def.filterable ?? true,
      filterOperators: def.filterOperators,
      headerFilterMode: def.headerFilterMode ?? (type === 'custom' ? 'operator' : defaultHeaderFilterMode),
      headerFilterSelection: def.headerFilterSelection ?? 'multi',
      // Left unresolved: whether a provider applies depends on grid inputs this merge can't see
      headerFilterSource: def.headerFilterSource,
      checklistValueLabel: def.checklistValueLabel,
      checklistValuesLimit: def.checklistValuesLimit,
      displayValue: def.displayValue,
      // A 'custom' column renders through a consumer template, so the grid can't know what its
      // value looks like — it stays read-only unless the developer opts in explicitly.
      editable: def.editable ?? type !== 'custom',
      editor: def.editor ?? weGridDefaultEditor(type),
      editorOptions: def.editorOptions,
      required: def.required ?? false,
      exportable: def.exportable ?? true
    };
  });

  merged.sort((a, b) => a.order - b.order);
  placeOrderLockedColumns(merged, columnDefs);
  merged.forEach((c, i) => (c.order = i));

  return {
    columns: merged,
    density: useSaved ? saved?.density : undefined,
    sort: useSaved ? (saved?.sort ?? null) : null,
    pageSize: useSaved ? saved?.pageSize : undefined,
    filterRowVisible: useSaved ? saved?.filterRowVisible : undefined
  };
}

/**
 * Converts runtime column state back into `WeGridColumnLayout[]` — used before saving.
 *
 * `columnDefs` is needed to find the developer's defaults: `summary` is only written when it
 * DIFFERS from the developer's default. Otherwise (unconditional writes) any layout change at all
 * (width, order, visibility, drag-and-drop) would persist the then-current (derived from
 * `def.summary` at that moment) value even if the user never touched the Summary menu — if the
 * developer later adds a new `summary` default to an existing column, it would never reach users
 * who already have a saved layout. `visible`/`order`/`pinned` are required (non-optional) fields
 * on `WeGridColumnLayout`, so the same "write only if different" pattern can't be applied to them
 * without a type change (see README).
 */
export function toColumnLayout<T>(columns: WeGridInternalColumn<T>[], columnDefs: WeGridColumnDef<T>[]): WeGridLayout['columns'] {
  const defByField = new Map(columnDefs.map((d) => [d.field, d]));
  return columns.map((c) => {
    const defaultSummary = defByField.get(c.field)?.summary ?? 'none';
    return {
      field: c.field,
      visible: c.visible,
      order: c.order,
      // A width the grid hasn't fitted yet is a placeholder, not a choice — saving it would stop
      // the column from ever being fitted to its content.
      width: c.autoFitPending ? undefined : c.width,
      wrap: c.wrap,
      pinned: c.pinned,
      headerOverride: c.headerOverride ?? undefined,
      summary: c.summary !== defaultSummary ? c.summary : undefined
    };
  });
}

const WE_GRID_ALL_ROW_EVENTS: WeGridRowEventName[] = ['click', 'dblclick', 'contextmenu'];

/** `stopRowEvents` (true = every row event) united with the older `stopRowClick` */
function resolveStopRowEvents(stopRowEvents: boolean | WeGridRowEventName[] | undefined, stopRowClick: boolean | undefined): WeGridRowEventName[] {
  const listed = stopRowEvents === true ? WE_GRID_ALL_ROW_EVENTS : Array.isArray(stopRowEvents) ? stopRowEvents : [];
  const events = new Set<WeGridRowEventName>(listed.filter((e) => WE_GRID_ALL_ROW_EVENTS.includes(e)));
  if (stopRowClick) events.add('click');
  return WE_GRID_ALL_ROW_EVENTS.filter((e) => events.has(e));
}

/**
 * A `lockOrder` column sits at its definition position (`order`, or its index) whatever the saved
 * layout says; the other columns keep their saved order around it. Rendering still puts left- and
 * right-pinned columns at the edges, so a locked pinned column stays first or last in its group.
 */
function placeOrderLockedColumns<T>(merged: WeGridInternalColumn<T>[], columnDefs: WeGridColumnDef<T>[]): void {
  const locked = merged.filter((c) => c.lockOrder);
  if (locked.length === 0) return;
  const position = (c: WeGridInternalColumn<T>): number => {
    const index = columnDefs.findIndex((d) => d.field === c.field);
    return columnDefs[index]?.order ?? index;
  };
  const rest = merged.filter((c) => !c.lockOrder);
  for (const col of [...locked].sort((a, b) => position(a) - position(b))) {
    rest.splice(Math.min(Math.max(position(col), 0), rest.length), 0, col);
  }
  merged.splice(0, merged.length, ...rest);
}
