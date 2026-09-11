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
| `filterDebounceMs` | `number` | `400` | How long the grid waits after the last filter edit before emitting `(filterChange)`. Only the outgoing event is debounced. |
| `checklistValuesProvider` | `WeGridChecklistValuesProvider` | — | Lists checklist values from the whole dataset instead of the loaded rows, while filtering runs on the server. See [server-side.md](server-side.md#populating-the-checklist-from-the-whole-dataset-checklistvaluesprovider). |
| `checklistValuesLimit` | `number` | `200` | The most values one provider request asks for. A column's own `checklistValuesLimit` overrides it. |
| `checklistSearchDebounceMs` | `number` | `300` | How long a provider-backed checklist waits after the last keystroke in its search box before asking again. |
| `selectable` | `'none' \| 'single' \| 'multi'` | `'none'` | Row selection mode. |
| `emptyMessage` | `string` | locale's `emptyMessage` | Message shown when there are no rows. |
| `rowClass` | `WeGridRowClassFn<T>` | — | `(row, index) => string \| string[] \| Record<string, boolean>`, applied via `[ngClass]`. |
| `layoutVersion` | `number` | `1` | Bump to discard an incompatible saved layout. |
| `summaryValues` | `Record<string, number>` | — | Server-computed grand totals per column field. |
| `expandable` | `boolean` | `false` | Enables master-detail row expansion. |
| `filterRow` | `boolean` | `false` | Enables the per-cell filter row + toolbar toggle. A column with `headerFilterMode: 'checklist'` gets its funnel icon without this. |
| `grouping` | `boolean` | `false` | Enables grouping + "filter by this value" in the header/cell context menu. |
| `exportFormats` | `WeGridExportFormat[]` | `[]` | Formats offered by the toolbar's export buttons. Empty hides the group. |
| `exportFileName` | `string` | `gridKey` | Export file name, without an extension. |
| `exportMode` | `'auto' \| 'client' \| 'server'` | `'auto'` | See [export-import.md](export-import.md). |
| `importFormats` | `WeGridImportFormat[]` | `[]` | Formats the toolbar's import button accepts. Empty hides the button. |
| `editable` | `boolean` | `false` | Enables inline row editing (an edit button per row). |
| `allowAdd` | `boolean` | `false` | Adds an "Add row" toolbar button and a draft row. |
| `allowDelete` | `boolean` | `false` | Adds a delete button per row. |
| `confirmDelete` | `boolean` | `true` | Whether deleting calls `window.confirm` first. |
| `showRefresh` | `boolean` | `false` | Adds a toolbar button that only emits `(refresh)`. |
| `newRowTemplate` | `Partial<T>` | — | Field values a new draft row starts from. |

### Outputs

| Output | Payload | Description |
|---|---|---|
| `pageChange` | `WeGridPageChange` | `{ page, pageSize }` |
| `sortChange` | `WeGridSortChange` | `{ field, direction }` |
| `rowClick` / `rowDblClick` | `WeGridRowClickEvent<T>` | `{ row, rowIndex }` |
| `selectionChange` | `T[]` | Currently selected rows. |
| `layoutChange` | `WeGridLayout` | Fires whenever the user's layout is persisted, and on "Reset layout" (with the default layout). |
| `filterChange` | `WeGridFilterChangeEvent` | Debounced (`filterDebounceMs`), only the active filters. The payload **is** the `WeGridColumnFilterState[]` it has always been, plus `filters` and `resetPage` — see [server-side.md](server-side.md). "Reset layout" emits it at once when it cleared an active filter. |
| `groupChange` | `string \| null` | Fires when the grouped field changes. |
| `exportRequest` | `WeGridExportRequest<T>` | `{ format, scope, rows, table }` — fires on every export. |
| `importData` | `WeGridImportResult<T>` | Parsed and column-mapped rows from a picked file. |
| `rowCreate` / `rowUpdate` | `WeGridRowEditEvent<T>` | `{ row, original, rowIndex, changes, done }` |
| `rowDelete` | `WeGridRowDeleteEvent<T>` | `{ row, rowIndex, done }` |
| `refresh` | `void` | The toolbar's refresh button was pressed. |

### Notable public members

- `internalColumns`, `renderColumns: WeGridInternalColumn<T>[]`
- `displayData: T[]` — post filter/sort rows currently rendered
- `hasSummaryRow`, `totalRecordCountForSummary`, `summaryCellText(col)`
- `canExpandRows`, `isRowExpanded(row)`, `toggleRowExpand(row, event?)`, `expandedKeys: Set<unknown>`
- `hasActiveFilters`, `activeFilterChips`, `clearAllFilters()`, `clearFilterByField(field)`
- `hasColumnFilters`, `showFilterIcon(col)`, `checklistOptionsFor(col)`, `setChecklistFilter(col, values)`,
  `checklistButtonLabel(col)` — the checklist header filter
- `filterOperatorsFor(col)`, `filterOperatorLabel(col, operator)` — the operators a column's filter
  row cell and popover offer
- `groupField`, `groupedSections`, `clearGrouping()`
- `exportAs(format)`, `exportScope`, `exportColumns`, `isServerExport`
- `openImportPicker()`, `importAccept`
- `edit: WeGridEditState<T> | null`, `startEdit(row, index, event?)`, `startCreate()`, `commitEdit()`,
  `cancelEdit()`, `requestDelete(row, index, event?)`, `isEditingRow(row)`, `isCreating`, `hasRowActions`
- `notice` — the strip under the toolbar reporting the last import/commit/delete outcome, `dismissNotice()`

## Directives

- **`WeGridCellDirective<T>`** (`[weGridCell]`) — custom cell template, selector value = column
  field. Inputs: `weGridCell: string`, `weGridCellRowsOf?: T[]` (type-inference only).
- **`WeGridRowDetailDirective<T>`** (`[weGridRowDetail]`) — master-detail content template.
  Inputs: `weGridRowDetailRowsOf?: T[]` (type-inference only).

## Models

- `WeGridColumnDef<T>` — `field`, `header`, `type?`, `width?`, `minWidth?`, `maxWidth?`,
  `visible?`, `order?`, `wrap?`, `align?`, `sortable?`, `pinned?`, `format?`, `cellTemplate?`,
  `headerTooltip?`, `lockVisible?`, `lockRename?`, `stopRowClick?`, `summary?`, `filterable?`,
  `filterOperators?: WeGridFilterOperator[]`, `headerFilterMode?`, `headerFilterSelection?`,
  `headerFilterSource?`, `checklistValueLabel?: (value: unknown) => string`, `checklistValuesLimit?`,
  `displayValue?: (row: T) => string`, `editable?`, `editor?`, `editorOptions?`, `required?`, `exportable?`

  | Column option (0.4.0) | Effect |
  |---|---|
  | `filterOperators` | Restricts the filter row / popover operators, in the order given; the first is the default. See [server-side.md](server-side.md#restricting-operators-per-column-filteroperators). |
  | `headerFilterSource` | `'loaded' \| 'provider'` — `'loaded'` keeps a checklist on the loaded rows even when the grid has a `checklistValuesProvider`. |
  | `checklistValueLabel` | Labels a raw checklist value without its row — for values a provider returned. |
  | `checklistValuesLimit` | Per-column override of the grid's `checklistValuesLimit`. |
- `WeGridColumnType` = `'text' | 'number' | 'date' | 'datetime' | 'currency' | 'boolean' | 'custom'`
- `WeGridAlign` = `'start' | 'center' | 'end'`
- `WeGridPinned` = `'left' | 'right' | null`
- `WeGridDensity` = `'comfortable' | 'normal' | 'compact'`
- `WeGridSortDirection` = `'asc' | 'desc' | null`
- `WeGridSummaryFunction` = `'sum' | 'count' | 'avg' | 'min' | 'max' | 'none'`
- `WeGridHeaderFilterMode` = `'operator' | 'checklist'` — what the header funnel icon opens
- `WeGridHeaderFilterSelection` = `'multi' | 'single'` — checkboxes or radios in the checklist
- `WeGridHeaderFilterSource` = `'loaded' | 'provider'` — where a checklist's values come from
- `WeGridChecklistValuesProvider` = `(request: WeGridChecklistValuesRequest) => Observable<WeGridChecklistValuesResult>`,
  `WeGridChecklistValuesRequest` (`field`, `search`, `filters`, `limit`), `WeGridChecklistValuesResult`
  (`values`, `hasMore`), `WeGridChecklistValue` (`value`, `label?`) — see [server-side.md](server-side.md)
- `WeGridCellContext<T>` — `$implicit`, `row`, `value`, `rowIndex`, `column`
- `WeGridRowDetailContext<T>` — `$implicit`, `row`, `rowIndex`
- `WeGridInternalColumn<T>` — merged runtime column state
- `WeGridColumnLayout`, `WeGridLayout`, `WeGridLayoutStore`, `WE_GRID_LAYOUT_STORE`
- `WeGridMenuAction` — discriminated union of every header-menu action
- `WeGridPageChange`, `WeGridSortChange`, `WeGridSelectionMode`, `WeGridRowClickEvent<T>`, `WeGridRowClassFn<T>`
- `WeGridColumnFilterState`, `WeGridFilterOperator` (including `'in'`), `WeGridChecklistOption`,
  `WeGridFilterChangeEvent`, `weGridFilterValueKey(value)`, `WE_GRID_BLANK_FILTER_KEY` and friends
- `WeGridGroupSection<T>`, `WeGridGroupRowEntry<T>`
- `WeGridLocale`, `WE_GRID_LOCALE`, `weGridLocaleEn`, `weGridLocaleTr` — see [localization.md](localization.md);
  `intlLocale` / `intlCurrency` / `intlTimeZone` also drive value formatting, text matching and sorting
- `WeGridIcons`, `WE_GRID_ICONS`, `weGridDefaultIcons` — see [theming.md](theming.md)
- `WeGridExportFormat`, `WeGridImportFormat`, `WeGridExportScope`, `WeGridExportColumn`,
  `WeGridExportRow`, `WeGridExportTable`, `WeGridExportRequest<T>`, `WeGridExporter`,
  `WE_GRID_EXPORTER`, `WeGridImportSheet`, `WeGridImportParser`, `WE_GRID_IMPORT_PARSER`,
  `WeGridImportResult<T>` — see [export-import.md](export-import.md)
- `WeGridEditorType`, `WeGridEditorOption`, `WeGridCommitFn`, `WeGridRowEditEvent<T>`,
  `WeGridRowDeleteEvent<T>`, `WeGridEditState<T>`, `WE_GRID_NEW_ROW_KEY` — see
  [row-editing.md](row-editing.md)

## Utilities / services

- `LocalStorageGridLayoutStore` — default `WeGridLayoutStore` implementation
- `mergeGridLayout(columnDefs, saved, layoutVersion)`, `toColumnLayout(columns, columnDefs)`,
  `WE_GRID_DEFAULT_COLUMN_WIDTH`
- `formatWeGridValue(value, type, format?, options?)` — `options`: `locale`, `currency`, `timeZone`,
  `yesLabel`, `noLabel` — `getNestedValue(row, path)`, `setNestedValue(row, path, value)`
- `WeGridDefaultExporter` (default `WE_GRID_EXPORTER`), `WeGridDefaultImportParser`
  (default `WE_GRID_IMPORT_PARSER`)
- `weGridToCsv(table, options?)`, `weGridParseCsv(text, options?)`, `weGridDownloadBlob(blob, fileName)`
- `weGridBuildXlsx(table)`, `weGridReadXlsx(file)`
- `weGridBuildPrintDocument(table, options?)`, `weGridPrintTable(table, options?)`
- `weGridMapImportedRows(sheet, columns)`
- `applyWeGridFilters(rows, filters, columns, locale?)`, `isWeGridFilterActive(filter)`,
  `weGridFilterChipLabel(col, filter, locale?, valueLabel?)`, `weGridInFilterValueLabel(values, valueLabel, maxShown?)`
- `weGridFilterOperatorsFor(type, filterOperators?)`, `weGridQuickFilterOperator(col)`,
  `weGridFilterOperatorLabel(operator, type, locale?)`
- `WeGridCellEditorComponent` (`<we-grid-cell-editor>`), `weGridDefaultEditor(type)`,
  `weGridSameEditValue(before, after)`
- `isWeGridNumericSummaryType(type)`, `computeWeGridSummary(rows, field, fn)`,
  `buildWeGridSummaryText(rows, col, scope, overrideValue?, locale?)`, `weGridSummaryLabel(fn, scope, locale?)`
- `weGridQuickFilterValueToInputString(value, type)` — a date's local calendar day as `yyyy-MM-dd`
