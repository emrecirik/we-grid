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
| `headerFilterMode` | `'checklist' \| 'operator'` | `'checklist'` | What the header funnel of a column without its own `headerFilterMode` opens. `'checklist'` (default since 0.5.0) gives every filterable column the distinct-values list, with the funnel shown even while `filterRow` is off; `'operator'` restores the pre-0.5.0 operator popover. `'custom'` columns always default to `'operator'`. |
| `filterDebounceMs` | `number` | `400` | How long the grid waits after the last filter edit before emitting `(filterChange)`. Only the outgoing event is debounced. |
| `checklistValuesProvider` | `WeGridChecklistValuesProvider` | — | Lists checklist values from the whole dataset instead of the loaded rows, while filtering runs on the server. See [server-side.md](server-side.md#populating-the-checklist-from-the-whole-dataset-checklistvaluesprovider). |
| `checklistValuesLimit` | `number` | `200` | The most values one provider request asks for. A column's own `checklistValuesLimit` overrides it. |
| `checklistSearchDebounceMs` | `number` | `300` | How long a provider-backed checklist waits after the last keystroke in its search box before asking again. |
| `selectable` | `'none' \| 'single' \| 'multi'` | `'none'` | Row selection mode. |
| `emptyMessage` | `string` | locale's `emptyMessage` | Message shown when there are no rows. |
| `rowClass` | `WeGridRowClassFn<T>` | — | `(row, index, tree?) => string \| string[] \| Record<string, boolean>`, applied via `[ngClass]`. `tree` only in tree mode. A class can set `--we-grid-row-bg` / `--we-grid-row-accent` — see [cell-templates.md](cell-templates.md#coloured-rows). |
| `layoutVersion` | `number` | `1` | Bump to discard an incompatible saved layout — see [below](#saved-layouts-and-layoutversion). |
| `summaryValues` | `Record<string, number>` | — | Server-computed grand totals per column field. |
| `expandable` | `boolean` | `false` | Enables master-detail row expansion. |
| `filterRow` | `boolean` | `false` | Enables the per-cell filter row + toolbar toggle. A checklist column gets its funnel icon without this, and shows a checklist button in the filter row. |
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
| `editMode` | `'row' \| 'form'` | `'row'` | `'form'` edits and creates in a modal record form instead of in the row — see [row-editing.md](row-editing.md#form-mode). |
| `allowPaste` | `boolean` | `true` | On an `editable` grid, Ctrl+V pastes a spreadsheet range from the clicked cell — see [row-editing.md](row-editing.md#pasting-from-a-spreadsheet). |
| `savedViews` | `boolean` | `false` | Adds a Views toolbar button: named, shareable snapshots of columns, filters, sort and grouping — see [saved-views.md](saved-views.md). |
| `ignoreInteractiveTargets` *(0.7.0)* | `boolean` | `false` | Clicks, double clicks and right clicks that start on a control inside a row stay with it — see [cell-templates.md](cell-templates.md). |
| `rowStateVersion` *(0.7.0)* | `unknown` | — | Any change (`!==`) re-evaluates `rowClass` and the cell templates without rebuilding them. Use a counter. |
| `maxHeight` / `minHeight` *(0.7.0)* | `number \| string` | — | Bounds of the scroll area (px or CSS length). With `maxHeight` the grid scrolls inside itself: header and filter row stick to the top, the summary row to the bottom. |
| `footer` *(0.7.0)* | `'full' \| 'count' \| 'none'` | `'full'` | `'count'` keeps the record count without the pager, `'none'` drops the footer. A `serverSide` grid without a pager warns in dev mode. |
| `toolbar` *(0.8.0)* | `'auto' \| 'none'` | `'auto'` | `'none'` leaves the toolbar out of the DOM entirely. `filterRow`, `exportFormats`, `importFormats`, `savedViews`, `showRefresh` and `allowAdd` keep working but have no button — drive them from your own controls (`openColumnsMenu`, `toggleFilterRow`, `exportAs`, `openImportPicker`, `startCreate` …). Dev mode warns once when such a feature is on. |
| `headerMenuButton` *(0.8.0)* | `'always' \| 'hover'` | `'always'` | `'hover'`: the header ⚙ button shows only while the header is hovered or holds focus (opacity — it keeps its place and its keyboard focus). Devices that can't hover always show it. Tune with `--we-grid-th-menu-btn-idle-opacity` / `-hover-opacity`. |
| `treeChildren` *(0.7.0)* | `(row) => readonly T[] \| null \| undefined` | — | Turns on tree mode — see [tree.md](tree.md), with `treeColumn`, `treeToggle`, `treeIndentPx`, `treeDefaultExpanded`, `treeSummaryLevel`, `treeRetainState` / `treeStateRetainLimit` *(0.8.0)*. |
| `detailTrigger` *(0.7.0)* | `'column' \| 'none'` | `'column'` | `'none'`: no arrow column, open details from code — see [row-detail.md](row-detail.md), with `detailSticky`, `detailMaxWidth`, `canExpandRow`, `detailMount`. |
| `groupBy` *(0.7.0)* | `string[] \| null` | — | Grouping levels, outermost first — see [grouping.md](grouping.md). |
| `groupSummaryPosition` *(0.7.0)* | `'header' \| 'footer' \| 'both'` | `'header'` | Where group summaries appear. |
| `groupAutoSummary` *(0.7.0)* | `boolean` | `false` | Every numeric column adds up per group without a summary of its own. |
| `autoFitColumns` | `boolean` | `true` | Fits every column without an explicit `width` (on its definition or in the saved layout) to its content once, when the first rows arrive. Paging doesn't refit. The automatic fit stops at 400px unless the column sets `maxWidth`; it isn't saved as a layout change. |

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
| `rowsPaste` | `WeGridRowsPasteEvent<T>` | `{ updates, created, errors, done }` — a pasted spreadsheet range, already converted to the column types. |
| `viewShare` | `WeGridViewShareEvent` | `{ view, token }` — "Copy link" in the Views panel; bound, the grid builds no link itself. |
| `treeExpandChange` *(0.7.0)* | `WeGridTreeExpandEvent<T>` | `{ row, expanded, source: 'user' \| 'api' }` |
| `detailToggle` *(0.7.0)* | `WeGridDetailToggleEvent<T>` | `{ row, open, source: 'user' \| 'api' }` |
| `groupFieldsChange` *(0.7.0)* | `string[]` | Every grouping change, all levels. |

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
- `openColumnsMenu(anchor?)` *(0.8.0)* — opens the columns menu (the toolbar's, without the
  column-specific items) anchored to `anchor`; without one to the toolbar's Columns button, and with
  `toolbar='none'` to the grid's top corner. It flips / pushes to stay on screen, closes any other
  grid's open menu, and gives focus back to the anchor on close — `aria-expanded` on your button is
  yours to manage. `openColumnsMenuFromToolbar()` is kept and calls it.
- `toggleFilterRow(open?)` *(0.8.0)* — opens / closes the filter row while `filterRow=true`
- `exportAs(format)`, `exportScope`, `exportColumns`, `isServerExport`
- `openImportPicker()`, `importAccept`
- `edit: WeGridEditState<T> | null`, `startEdit(row, index, event?)`, `startCreate()`, `commitEdit()`,
  `cancelEdit()`, `requestDelete(row, index, event?)`, `isEditingRow(row)`, `isCreating`, `hasRowActions`
- `notice` — the strip under the toolbar reporting the last import/commit/delete/paste outcome, `dismissNotice()`
- `activeCell`, `pasteEnabled` — the paste target
- `views`, `activeViewName`, `getCurrentView(name)`, `saveCurrentView(name)`, `applyView(view)`,
  `deleteView(name)`, `shareView(view)` — saved views
- `refreshRows()` — the imperative twin of `rowStateVersion`
- Tree: `treeActive`, `toggleTreeNode(row, force?)`, `isTreeExpanded(row)`, `expandAllTree()`,
  `collapseAllTree()`, `treeAllExpanded`, `scrollToRow(key, opts?)`, `treeNodes`, `treeExpandedKeys`,
  `cellValue(row, col)`, `clearTreeState()` *(0.8.0)* — see [tree.md](tree.md)
- Detail: `toggleRowDetail(row, force?)`, `openRowDetail(row)`, `closeRowDetail(row)`,
  `isRowDetailOpen(row)`, `closeAllDetails()`, `detailId(row)` — see [row-detail.md](row-detail.md)
- Grouping: `groupFields`, `setGrouping(fields)`, `addGroupField(field)`, `removeGroupField(field)`,
  `expandAllGroups()`, `collapseAllGroups()` — see [grouping.md](grouping.md)
- `moveColumn(col, 1 | -1 | 'first' | 'last')` — the keyboard/menu column move
- `renderItems: WeGridRenderItem<T>[]` — the flattened list the body renders

### Keyboard

| Where | Keys | |
|---|---|---|
| Column header | Alt+← / Alt+→ | Moves the column one place within its pin group (left-pinned, unpinned, right-pinned); Alt+Shift moves it to the group's first / last place. A `lockOrder` column doesn't move and nothing passes it. Announced politely; saved like a drag. Only on the header itself — elsewhere Alt+arrows stay the browser's. Mirrored in a right-to-left page. |
| Column header | Shift+F10 / ContextMenu | Opens the column menu. |
| Resize handle (`role="separator"`, focusable) | ← / → | ∓8 / ±8 px; with Shift ±32 px. |
| | Home | The column's `minWidth`. |
| | Enter (or a double click) | Fits the column to its content. |
| | Esc | Back to the header. |
| Header hint icon (ⓘ) | focus / Esc | Shows / hides the hint. |

The column menu also has **Move left / Move right** (not on `lockOrder` columns).

### Saved layouts and layoutVersion

A saved layout is merged onto the column definitions: stored order, widths, visibility and pins
win; a column missing from the record is added at the end with its definition's settings; a stored
column the definitions no longer have is dropped. `lockPinned` / `lockOrder` columns ignore the
stored pin / position. A record whose `version` differs from `layoutVersion` is discarded whole.

Bump `layoutVersion` when a column's `field` is renamed or a field starts to mean something else.
Adding or removing a column needs no bump.

## Directives

- **`WeGridCellDirective<T>`** (`[weGridCell]`) — custom cell template, selector value = column
  field. Inputs: `weGridCell: string`, `weGridCellRowsOf?: T[]` (type-inference only).
- **`WeGridRowDetailDirective<T>`** (`[weGridRowDetail]`) — master-detail content template.
  Inputs: `weGridRowDetailRowsOf?: T[]` (type-inference only).
- **`WeGridHeaderDirective`** (`[weGridHeader]`) *(0.7.0)* — custom header content, selector value =
  column field. Context: `WeGridHeaderContext` (`$implicit` / `column` = the column definition,
  `title` = the header text). The sort arrow, funnel, menu button and hint icon are still drawn by
  the grid.
- **`WeGridEmptyDirective`** (`[weGridEmpty]`) *(0.8.0)* — replaces the content of the empty-state
  cell, inside a `role="status"` wrapper. Context: `WeGridEmptyContext`. Not drawn while `loading`;
  without it the grid draws its own icon, message and *Clear filters* button. It refreshes with
  `rowStateVersion` like the cell templates.

  ```html
  <we-grid …>
    <ng-template weGridEmpty let-ctx>
      <p>No lines match the filters.</p>
      <button type="button" (click)="clearMyFilters(); ctx.clearAllFilters()">Clear</button>
    </ng-template>
  </we-grid>
  ```

## Models

- `WeGridColumnDef<T>` — `field`, `header`, `type?`, `width?`, `minWidth?`, `maxWidth?`,
  `visible?`, `order?`, `wrap?`, `align?`, `sortable?`, `pinned?`, `format?`, `minorUnits?`,
  `formatter?: (value, row) => string`, `cellTemplate?`,
  `headerTooltip?`, `lockVisible?`, `lockRename?`, `stopRowClick?`, `summary?`, `filterable?`,
  `filterOperators?: WeGridFilterOperator[]`, `headerFilterMode?`, `headerFilterSelection?`,
  `headerFilterSource?`, `checklistValueLabel?: (value: unknown) => string`, `checklistValuesLimit?`,
  `displayValue?: (row: T) => string`, `editable?`, `editor?`, `editorOptions?`, `required?`, `exportable?`

  | Column option | Effect |
  |---|---|
  | `type` | See [column-types.md](column-types.md) for every type — `integer`, `percent`, `time`, `email`, `url`, `phone` are new in 0.5.0. |
  | `format` | `'min-max'` fraction digits (number/integer/percent), an ISO 4217 code (currency), `'HH:mm:ss'` (time). |
  | `minorUnits` *(0.5.0)* | Currency stored in kuruş/cents: shown and typed in lira, stored and emitted in kuruş. See [column-types.md](column-types.md#money-stored-in-kuruş--cents-minorunits). |
  | `formatter` *(0.5.0)* | `(value, row) => string` — the column's display text everywhere (cell, summary, chips, checklist, groups, CSV/PDF). Presentation only; `row` is `null` where no row exists. |
  | `headerFilterMode` | `'checklist' \| 'operator'` — left out, the grid's `headerFilterMode` input decides. |
  | `filterOperators` | Restricts the filter row / popover operators, in the order given; the first is the default. See [server-side.md](server-side.md#restricting-operators-per-column-filteroperators). |
  | `headerFilterSource` | `'loaded' \| 'provider'` — `'loaded'` keeps a checklist on the loaded rows even when the grid has a `checklistValuesProvider`. |
  | `checklistValueLabel` | Labels a raw checklist value without its row — for values a provider returned. |
  | `checklistValuesLimit` | Per-column override of the grid's `checklistValuesLimit`. |
  | `stopRowEvents` *(0.7.0)* | `true` or `('click' \| 'dblclick' \| 'contextmenu')[]` — the events stop at the cell. `stopRowClick` alone still stops only `'click'`. |
  | `allowOverflow` *(0.7.0)* | The cell doesn't clip its content (dropdowns, tooltips). |
  | `headerHint` *(0.7.0)* | An ⓘ icon next to the header, its hint on hover and keyboard focus (an overlay, wraps at ~320px, keeps line breaks). Replaces the native `headerTooltip` title. |
  | `headerTemplate` *(0.7.0)* | Custom header content — same as the `weGridHeader` directive. |
  | `lockPinned` / `lockOrder` *(0.7.0)* | The user can't change the pin / move the column (no pin items, no drag, no move items; stored pin / position ignored). |
  | `fixed` *(0.7.0)* | `lockVisible` + `lockRename` + `lockPinned` + `lockOrder`; an explicit sub-flag wins. |
  | `childField` / `treeValue` *(0.7.0)* | Tree mode — how child rows read the column. See [tree.md](tree.md#values-per-level). |
  | `groupSummary` *(0.7.0)* | The column's function in group headers/footers, independent of `summary`. See [grouping.md](grouping.md#group-summaries). |
- `WeGridColumnType` = `'text' | 'number' | 'integer' | 'date' | 'datetime' | 'time' | 'currency' | 'percent' | 'boolean' | 'email' | 'url' | 'phone' | 'custom'` — see [column-types.md](column-types.md)
- `WeGridValueKind` = `'text' | 'number' | 'date' | 'boolean'` and `weGridValueKind(type)` — the family a type filters, sums and edits like
- `WeGridValueFormatter<T>` = `(value: unknown, row: T | null) => string`
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
- `WeGridCellContext<T>` — `$implicit`, `row`, `value`, `rowIndex`, `column`, `tree?` (tree mode)
- `WeGridRowDetailContext<T>` — `$implicit`, `row`, `rowIndex`, `close()`, `tree?`
- `WeGridHeaderContext<T>` — `$implicit`, `column`, `title`
- `WeGridEmptyContext` *(0.8.0)* — `hasActiveFilters` (the grid's OWN filters only), `clearAllFilters()`,
  `message` (`noRecordsMatchFilter` while filtering, otherwise `emptyMessage`); `$implicit` carries the same fields
- `WeGridRowEventName` = `'click' | 'dblclick' | 'contextmenu'`
- `WeGridTreeInfo<T>` (`level`, `hasChildren`, `expanded`, `parent`, `index`, `siblingCount`),
  `WeGridTreeExpandEvent<T>`, `WeGridTreeNode<T>`, `WeGridScrollToRowOptions` — see [tree.md](tree.md)
- `WeGridDetailToggleEvent<T>` — see [row-detail.md](row-detail.md)
- `WeGridRenderItem<T>` — a body entry: `{ kind: 'row', row, index, tree }`, `{ kind: 'group', section, level }`
  or `{ kind: 'groupFooter', section, level }`
- `WeGridInternalColumn<T>` — merged runtime column state
- `WeGridColumnLayout`, `WeGridLayout`, `WeGridLayoutStore`, `WE_GRID_LAYOUT_STORE`
- `WeGridMenuAction` — discriminated union of every header-menu action
- `WeGridPageChange`, `WeGridSortChange`, `WeGridSelectionMode`, `WeGridRowClickEvent<T>`, `WeGridRowClassFn<T>`
- `WeGridColumnFilterState`, `WeGridFilterOperator` (including `'in'`), `WeGridChecklistOption`,
  `WeGridFilterChangeEvent`, `weGridFilterValueKey(value)`, `WE_GRID_BLANK_FILTER_KEY` and friends
- `WeGridGroupSection<T>` (0.7.0 adds `field`, `level`, `path`, `children`), `WeGridGroupRowEntry<T>`
- `WeGridLocale`, `WE_GRID_LOCALE`, `weGridLocaleEn`, `weGridLocaleTr` — see [localization.md](localization.md);
  `intlLocale` / `intlCurrency` / `intlTimeZone` also drive value formatting, text matching and sorting
- `WeGridIcons`, `WE_GRID_ICONS`, `weGridDefaultIcons` — see [theming.md](theming.md)
- `WeGridExportFormat`, `WeGridImportFormat`, `WeGridExportScope`, `WeGridExportColumn`,
  `WeGridExportRow`, `WeGridExportTable`, `WeGridExportRequest<T>`, `WeGridExporter`,
  `WE_GRID_EXPORTER`, `WeGridImportSheet`, `WeGridImportParser`, `WE_GRID_IMPORT_PARSER`,
  `WeGridImportResult<T>` — see [export-import.md](export-import.md)
- `WeGridEditorType`, `WeGridEditorOption`, `WeGridCommitFn`, `WeGridRowEditEvent<T>`,
  `WeGridRowDeleteEvent<T>`, `WeGridEditState<T>`, `WE_GRID_NEW_ROW_KEY`, `WeGridEditMode`,
  `WeGridRowsPasteEvent<T>`, `WeGridPastedRow<T>` — see [row-editing.md](row-editing.md)
- `WeGridSavedView`, `WeGridViewShareEvent` — see [saved-views.md](saved-views.md)

## Utilities / services

- `LocalStorageGridLayoutStore` — default `WeGridLayoutStore` implementation
- `mergeGridLayout(columnDefs, saved, layoutVersion, defaultHeaderFilterMode?)`, `toColumnLayout(columns, columnDefs)`,
  `WE_GRID_DEFAULT_COLUMN_WIDTH`
- `formatWeGridValue(value, type, format?, options?)` — `options`: `locale`, `currency`, `timeZone`,
  `yesLabel`, `noLabel`, `minorUnits` — `getNestedValue(row, path)`, `setNestedValue(row, path, value)`
- `formatWeGridColumnValue(value, col, options?, row?)` — a column's display text, `formatter` and
  `minorUnits` included
- `weGridInputScale(col, currency?)`, `weGridToInputNumber(value, scale)`, `weGridFromInputNumber(input, scale)`
  — stored value ⇄ the number a user types (percent ×100, kuruş ÷100)
- `weGridCurrencyFractionDigits(currency)`, `weGridResolveCurrency(format, fallback?)`,
  `weGridLinkHref(value, type)`, `isWeGridLinkType(type)`
- `WeGridDefaultExporter` (default `WE_GRID_EXPORTER`), `WeGridDefaultImportParser`
  (default `WE_GRID_IMPORT_PARSER`)
- `weGridToCsv(table, options?)`, `weGridParseCsv(text, options?)`, `weGridDownloadBlob(blob, fileName)`
- `weGridBuildXlsx(table)`, `weGridReadXlsx(file)`
- `weGridBuildPrintDocument(table, options?)`, `weGridPrintTable(table, options?)`
- `weGridMapImportedRows(sheet, columns)`, `weGridCoerceImportValue(raw, column)` — one cell's text
  in the column's type, shared by import and paste
- `weGridParseClipboardTable(text)` — a spreadsheet copy's `text/plain` as rows of cells
- `weGridEncodeView(view)`, `weGridDecodeView(token)`, `weGridSanitizeView(input)`,
  `weGridViewParamName(gridKey)` — saved views as link tokens
- `WE_GRID_INTERACTIVE_SELECTOR`, `weGridIsInteractiveTarget(event, boundary?)` — see [cell-templates.md](cell-templates.md)
- `applyWeGridFilters(rows, filters, columns, locale?, valueOf?)`, `isWeGridFilterActive(filter)`,
  `weGridFilterChipLabel(col, filter, locale?, valueLabel?)`, `weGridInFilterValueLabel(values, valueLabel, maxShown?)`
- `weGridFilterOperatorsFor(type, filterOperators?)`, `weGridQuickFilterOperator(col)`,
  `weGridFilterOperatorLabel(operator, type, locale?)`
- `WeGridEditFormComponent` (`<we-grid-edit-form>`) — the record form of `editMode: 'form'`
- `WeGridCellEditorComponent` (`<we-grid-cell-editor>`), `weGridDefaultEditor(type)`,
  `weGridSameEditValue(before, after)`
- `isWeGridNumericSummaryType(type)`, `computeWeGridSummary(rows, field, fn, valueOf?)`,
  `buildWeGridSummaryText(rows, col, scope, overrideValue?, locale?, valueOf?)`, `weGridSummaryLabel(fn, scope, locale?)`
  — `valueOf: (row, field) => unknown` replaces the plain field read (the tree uses it)
- `weGridQuickFilterValueToInputString(value, type)` — a date's local calendar day as `yyyy-MM-dd`
