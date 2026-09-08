import { TemplateRef } from '@angular/core';
import { WeGridAlign, WeGridCellContext, WeGridColumnType, WeGridPinned, WeGridSummaryFunction } from './we-grid-column.model';
import { WeGridEditorOption, WeGridEditorType } from './we-grid-edit.model';

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
  wrap: boolean;
  align: WeGridAlign;
  sortable: boolean;
  pinned: WeGridPinned;
  /** Cumulative px offset while pinned 'left'/'right' — computed by recomputeRenderColumns(), prevents overlap */
  pinnedOffset: number;
  format: string | undefined;
  cellTemplate: TemplateRef<WeGridCellContext<T>> | undefined;
  headerTooltip: string | undefined;
  lockVisible: boolean;
  lockRename: boolean;
  stopRowClick: boolean;
  /** Subtotal (summary row) function — chosen by the user from the header menu, persisted */
  summary: WeGridSummaryFunction;
  /** Whether editable in the filter row — see WeGridColumnDef.filterable */
  filterable: boolean;
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
