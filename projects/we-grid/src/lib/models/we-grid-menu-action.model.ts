import { WeGridDensity, WeGridPinned, WeGridSortDirection, WeGridSummaryFunction } from './we-grid-column.model';

export type WeGridMenuAction =
  | { type: 'hide-column'; field: string }
  | { type: 'toggle-column'; field: string; visible: boolean }
  | { type: 'rename'; field: string; header: string }
  | { type: 'toggle-wrap'; field: string }
  | { type: 'autofit'; field: string }
  | { type: 'autofit-all' }
  | { type: 'move-column'; field: string; direction: 'left' | 'right' }
  | { type: 'tree-expand-all' }
  | { type: 'tree-collapse-all' }
  | { type: 'group-add'; field: string }
  | { type: 'group-remove'; field: string }
  | { type: 'groups-expand-all' }
  | { type: 'groups-collapse-all' }
  | { type: 'pin'; field: string; pinned: WeGridPinned }
  | { type: 'sort'; field: string; direction: WeGridSortDirection }
  | { type: 'density'; density: WeGridDensity }
  | { type: 'summary'; field: string; summary: WeGridSummaryFunction }
  | { type: 'reset-layout' }
  // ─── Grouping / quick filter / bulk column visibility (shown in the menu when grouping=true) ───
  | { type: 'group-by'; field: string }
  | { type: 'clear-grouping' }
  | { type: 'quick-filter'; field: string; value: unknown }
  | { type: 'show-all-columns' };
