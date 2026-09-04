# API reference

## `<we-grid>` (`WeGridComponent<T>`)

### Inputs

| Input | Type | Default | Description |
|---|---|---|---|
| `gridKey` | `string` (required) | — | Storage key for the user's saved layout. Must be unique per grid instance. |
| `columns` | `WeGridColumnDef<T>[]` (required) | — | Column definitions. |
| `data` | `T[]` | `[]` | Rows to display (the currently loaded page, if server-side). |
| `loading` | `boolean` | `false` | Shows skeleton rows only when `data` is also empty. |
| `trackByField` | `keyof T` | — | Field used as the row identity key (selection, expansion, `trackBy`). |
| `totalCount` | `number` | `0` | Total record count on the server (used for pagination math when `serverSide`). |
| `page` | `number` | `1` | Current page (1-based). |
| `pageSize` | `number` | `20` | Page size. |
| `serverSide` | `boolean` | `false` | Whether pagination is server-driven. |
| `sortField` / `sortDirection` | `string \| null` / `'asc' \| 'desc' \| null` | `null` | Current sort, used when sorting on the server. |
| `sortMode` | `'auto' \| 'client' \| 'server'` | `'auto'` | See [server-side.md](server-side.md). |
| `filterMode` | `'auto' \| 'client' \| 'server'` | `'auto'` | See [server-side.md](server-side.md). |
| `selectable` | `'none' \| 'single' \| 'multi'` | `'none'` | Row selection mode. |
| `emptyMessage` | `string` | locale's `emptyMessage` | Message shown when there are no rows. |
| `rowClass` | `WeGridRowClassFn<T>` | — | `(row, index) => string \| string[] \| Record<string, boolean>`, applied via `[ngClass]`. |
| `layoutVersion` | `number` | `1` | Bump to discard an incompatible saved layout. |
| `summaryValues` | `Record<string, number>` | — | Server-computed grand totals per column field. |
| `expandable` | `boolean` | `false` | Enables master-detail row expansion. |
| `filterRow` | `boolean` | `false` | Enables the per-cell filter row + toolbar toggle. |
| `grouping` | `boolean` | `false` | Enables grouping + "filter by this value" in the header/cell context menu. |

### Outputs

| Output | Payload | Description |
|---|---|---|
| `pageChange` | `WeGridPageChange` | `{ page, pageSize }` |
| `sortChange` | `WeGridSortChange` | `{ field, direction }` |
| `rowClick` / `rowDblClick` | `WeGridRowClickEvent<T>` | `{ row, rowIndex }` |
| `selectionChange` | `T[]` | Currently selected rows. |
| `layoutChange` | `WeGridLayout` | Fires whenever the user's layout is persisted. |
| `filterChange` | `WeGridColumnFilterState[]` | Debounced (400ms), only the active filters. |
| `groupChange` | `string \| null` | Fires when the grouped field changes. |

### Notable public members

- `internalColumns`, `renderColumns: WeGridInternalColumn<T>[]`
- `displayData: T[]` — post filter/sort rows currently rendered
- `hasSummaryRow`, `totalRecordCountForSummary`, `summaryCellText(col)`
- `canExpandRows`, `isRowExpanded(row)`, `toggleRowExpand(row, event?)`, `expandedKeys: Set<unknown>`
- `hasActiveFilters`, `activeFilterChips`, `clearAllFilters()`, `clearFilterByField(field)`
- `groupField`, `groupedSections`, `clearGrouping()`

## Directives

- **`WeGridCellDirective<T>`** (`[weGridCell]`) — custom cell template, selector value = column
  field. Inputs: `weGridCell: string`, `weGridCellRowsOf?: T[]` (type-inference only).
- **`WeGridRowDetailDirective<T>`** (`[weGridRowDetail]`) — master-detail content template.
  Inputs: `weGridRowDetailRowsOf?: T[]` (type-inference only).

## Models

- `WeGridColumnDef<T>` — `field`, `header`, `type?`, `width?`, `minWidth?`, `maxWidth?`,
  `visible?`, `order?`, `wrap?`, `align?`, `sortable?`, `pinned?`, `format?`, `cellTemplate?`,
  `headerTooltip?`, `lockVisible?`, `lockRename?`, `stopRowClick?`, `summary?`, `filterable?`,
  `displayValue?: (row: T) => string`
- `WeGridColumnType` = `'text' | 'number' | 'date' | 'datetime' | 'currency' | 'boolean' | 'custom'`
- `WeGridAlign` = `'start' | 'center' | 'end'`
- `WeGridPinned` = `'left' | 'right' | null`
- `WeGridDensity` = `'comfortable' | 'normal' | 'compact'`
- `WeGridSortDirection` = `'asc' | 'desc' | null`
- `WeGridSummaryFunction` = `'sum' | 'count' | 'avg' | 'min' | 'max' | 'none'`
- `WeGridCellContext<T>` — `$implicit`, `row`, `value`, `rowIndex`, `column`
- `WeGridRowDetailContext<T>` — `$implicit`, `row`, `rowIndex`
- `WeGridInternalColumn<T>` — merged runtime column state
- `WeGridColumnLayout`, `WeGridLayout`, `WeGridLayoutStore`, `WE_GRID_LAYOUT_STORE`
- `WeGridMenuAction` — discriminated union of every header-menu action
- `WeGridPageChange`, `WeGridSortChange`, `WeGridSelectionMode`, `WeGridRowClickEvent<T>`, `WeGridRowClassFn<T>`
- `WeGridColumnFilterState`, `WeGridFilterOperator` and friends
- `WeGridGroupSection<T>`, `WeGridGroupRowEntry<T>`
- `WeGridLocale`, `WE_GRID_LOCALE`, `weGridLocaleEn`, `weGridLocaleTr` — see [localization.md](localization.md)
- `WeGridIcons`, `WE_GRID_ICONS`, `weGridDefaultIcons` — see [theming.md](theming.md)

## Utilities / services

- `LocalStorageGridLayoutStore` — default `WeGridLayoutStore` implementation
- `mergeGridLayout(columnDefs, saved, layoutVersion)`, `toColumnLayout(columns, columnDefs)`,
  `WE_GRID_DEFAULT_COLUMN_WIDTH`
- `formatWeGridValue(value, type, format?, options?)`, `getNestedValue(row, path)`
- `isWeGridNumericSummaryType(type)`, `computeWeGridSummary(rows, field, fn)`,
  `buildWeGridSummaryText(rows, col, scope, overrideValue?, locale?)`, `weGridSummaryLabel(fn, scope, locale?)`
- `applyWeGridFilters(rows, filters, columns)`, `weGridFilterChipLabel(col, filter, locale?)`,
  `weGridQuickFilterValueToInputString(value, type)`
