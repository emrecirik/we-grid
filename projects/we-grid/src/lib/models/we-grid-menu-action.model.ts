import { WeGridDensity, WeGridPinned, WeGridSortDirection, WeGridSummaryFunction } from './we-grid-column.model';

export type WeGridMenuAction =
  | { type: 'hide-column'; field: string }
  | { type: 'toggle-column'; field: string; visible: boolean }
  | { type: 'rename'; field: string; header: string }
  | { type: 'toggle-wrap'; field: string }
  | { type: 'autofit'; field: string }
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
