import { WeGridDensity, WeGridSortDirection } from './we-grid-column.model';
import { WeGridColumnFilterState } from './we-grid-filter.model';
import { WeGridColumnLayout } from './we-grid-layout.model';

/**
 * A named snapshot of how the user looks at the grid — the column layout plus the filters, the
 * sort and the grouping, which the persisted layout deliberately leaves out. Saved from the
 * toolbar's Views panel when the grid's `savedViews` input is on, and shareable as a link.
 */
export interface WeGridSavedView {
  name: string;
  columns: WeGridColumnLayout[];
  density?: WeGridDensity;
  sort?: { field: string; direction: WeGridSortDirection } | null;
  /** Active filters only, in the same shape `(filterChange)` reports them */
  filters?: WeGridColumnFilterState[];
  groupField?: string | null;
  /** Every grouping level, outermost first — only written when more than one field is grouped */
  groupFields?: string[];
  filterRowVisible?: boolean;
}

/** Emitted by `(viewShare)` — bind it to build the link yourself instead of the grid's default */
export interface WeGridViewShareEvent {
  view: WeGridSavedView;
  /** URL-safe encoding of `view` — `weGridDecodeView(token)` turns it back */
  token: string;
}
