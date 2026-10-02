import { TemplateRef } from '@angular/core';
import {
  WeGridAlign,
  WeGridCellContext,
  WeGridColumnType,
  WeGridHeaderContext,
  WeGridHeaderFilterMode,
  WeGridHeaderFilterSelection,
  WeGridHeaderFilterSource,
  WeGridPinned,
  WeGridSummaryFunction,
  WeGridValueFormatter
} from './we-grid-column.model';
import { WeGridEditorOption, WeGridEditorType } from './we-grid-edit.model';
import { WeGridFilterOperator } from './we-grid-filter.model';
import { WeGridRowEventName } from './we-grid-events.model';
import { WeGridTreeInfo } from './we-grid-tree.model';
import { WeGridGroupSection } from './we-grid-group.model';

/**
 * The merged result of the `columns` input with a saved `WeGridLayout`.
 * The runtime column state used inside the grid for rendering and the context menu.
 */
export interface WeGridInternalColumn<T> {
  field: string;
  defaultHeader: string;
  headerOverride: string | null;
  type: WeGridColumnType;
  visible: boolean;
  order: number;
  /** Always defined — for `table-layout:fixed` to work reliably, column width is never left undefined */
  width: number;
  minWidth: number;
  /** autofit never exceeds this bound — see WeGridColumnDef.maxWidth */
  maxWidth: number | undefined;
  /**
   * True while the width is still the grid's default — neither the developer's `width` nor a saved
   * one. Such a column is fitted to its content once rows arrive when the grid's `autoFitColumns`
   * is on; any explicit width (a drag, a menu fit, a saved layout) clears it.
   */
  autoFitPending: boolean;
  wrap: boolean;
  align: WeGridAlign;
  sortable: boolean;
  pinned: WeGridPinned;
  /** Cumulative px offset while pinned 'left'/'right' — computed by recomputeRenderColumns(), prevents overlap */
  pinnedOffset: number;
  format: string | undefined;
  /** Currency value stored in minor units — see WeGridColumnDef.minorUnits */
  minorUnits: boolean;
  /** Custom display text — see WeGridColumnDef.formatter */
  formatter: WeGridValueFormatter<T> | undefined;
  cellTemplate: TemplateRef<WeGridCellContext<T>> | undefined;
  headerTooltip: string | undefined;
  lockVisible: boolean;
  lockRename: boolean;
  /** See WeGridColumnDef.lockPinned — resolved with `fixed` */
  lockPinned: boolean;
  /** See WeGridColumnDef.lockOrder — resolved with `fixed` */
  lockOrder: boolean;
  /** See WeGridColumnDef.headerHint */
  headerHint: string | undefined;
  /** See WeGridColumnDef.headerTemplate */
  headerTemplate: TemplateRef<WeGridHeaderContext<T>> | undefined;
  stopRowClick: boolean;
  /** Row events the cell keeps to itself, resolved from `stopRowEvents` and `stopRowClick` */
  stopRowEvents: WeGridRowEventName[];
  /** See WeGridColumnDef.allowOverflow */
  allowOverflow: boolean;
  /** Tree mode: see WeGridColumnDef.childField — `undefined` reads `field` */
  childField: string | null | undefined;
  /** Tree mode: see WeGridColumnDef.treeValue */
  treeValue: ((row: T, tree: WeGridTreeInfo<T>) => unknown) | undefined;
  /** See WeGridColumnDef.groupSummary — undefined falls back to `summary` / `groupAutoSummary` */
  groupSummary: WeGridSummaryFunction | undefined;
  /** Subtotal (summary row) function — chosen by the user from the header menu, persisted */
  summary: WeGridSummaryFunction;
  /** Whether editable in the filter row — see WeGridColumnDef.filterable */
  filterable: boolean;
  /** Operators offered in the filter row/popover — see WeGridColumnDef.filterOperators */
  filterOperators: WeGridFilterOperator[] | undefined;
  /** What the header funnel icon opens, resolved against the grid's default — see WeGridColumnDef.headerFilterMode */
  headerFilterMode: WeGridHeaderFilterMode;
  /** Checkboxes or radios in the checklist — see WeGridColumnDef.headerFilterSelection */
  headerFilterSelection: WeGridHeaderFilterSelection;
  /** Declared value source, unresolved — the grid decides per popover whether a provider applies; see WeGridColumnDef.headerFilterSource */
  headerFilterSource: WeGridHeaderFilterSource | undefined;
  /** Labels a raw checklist value without its row — see WeGridColumnDef.checklistValueLabel */
  checklistValueLabel: ((value: unknown) => string) | undefined;
  /** Per-column provider request limit — see WeGridColumnDef.checklistValuesLimit */
  checklistValuesLimit: number | undefined;
  /** Converts the raw value into a readable label — see WeGridColumnDef.displayValue */
  displayValue: ((row: T) => string) | undefined;
  /** Whether editable inline — see WeGridColumnDef.editable */
  editable: boolean;
  /** Editor control used while editing — resolved from the column type when not declared */
  editor: WeGridEditorType;
  /** Options of a 'select' editor — see WeGridColumnDef.editorOptions */
  editorOptions: WeGridEditorOption[] | undefined;
  /** May not be left empty when committing — see WeGridColumnDef.required */
  required: boolean;
  /** Whether the column takes part in exports — see WeGridColumnDef.exportable */
  exportable: boolean;
}

export function weGridDisplayHeader<T>(col: WeGridInternalColumn<T>): string {
  return col.headerOverride ?? col.defaultHeader;
}

/**
 * One entry of the flattened list the grid body renders — a data row, or a group header while
 * grouping. Built once per data/sort/filter/expansion change, never per change detection.
 */
export type WeGridRenderItem<T> =
  | {
      kind: 'row';
      row: T;
      /** Index handed to row events and templates — the position in `displayData`, or among the visible tree rows */
      index: number;
      /** The row's place in the tree — null outside tree mode */
      tree: WeGridTreeInfo<T> | null;
      trackKey: unknown;
    }
  | { kind: 'group'; section: WeGridGroupSection<T>; level: number; trackKey: unknown }
  /** The group footer row of `groupSummaryPosition` 'footer' / 'both' — closes an expanded group */
  | { kind: 'groupFooter'; section: WeGridGroupSection<T>; level: number; trackKey: unknown };

