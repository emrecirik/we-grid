# Changelog

All notable changes to this project are documented in this file.

## 0.26.0 — 2026-10-20

Merged cells in the spreadsheet. A minor release.

### Added

- `<we-sheet>` **merge and center**: the toolbar's merge button joins the selection into one cell
  (the top-left value stays, centred) or splits it again. The keyboard steps over a merge, a
  selection grows to hold any merge it touches, inserting and deleting rows and columns move
  merges, sorting through one is refused with a notice, and `.xlsx` files keep them on export and
  import. `WeSheetData.merges`, `WeGridXlsxSheet.merges`, `WeGridXlsxCellSheet.merges`,
  `weSheetSanitizeMerges`; icon `merge`; locale keys `sheetMerge`, `sheetMergeSort`.
  Filters show or hide a merge whole; paste, fill and edits never write under a merge's top-left
  cell.

## 0.25.0 — 2026-10-20

Dates typed into the spreadsheet. A minor release.

### Added

- `<we-sheet>`: **typed dates** — `2026-01-15`, or `15.01.2026` / `1/15/2026` in the order the
  locale writes dates, become dates (an Excel serial with the date format), in typing, pasting
  and CSV import. `weSheetParseInput` takes the order; `weSheetParseDate` util.

## 0.24.1 — 2026-10-20

Screen-reader fixes for the spreadsheet. A patch release.

### Fixed

- `<we-sheet>`: the focused grid names its active cell (`aria-activedescendant`, cells with
  ids and `aria-rowindex`/`aria-colindex`), so screen readers follow the cursor; the `role="grid"`
  moved from the table to the focusable container, the table is presentational.
- Formula suggestions (cell editor and formula bar) and the ƒ list are comboboxes that point at the
  highlighted option; the ƒ list keeps the highlighted function in view.

## 0.24.0 — 2026-10-20

Insert function, and a closer Excel round trip. A minor release.

### Added

- `<we-sheet>` **Insert function**: the ƒ button by the formula bar lists every function with its
  arguments, searchable by English or Turkish name; the pick goes into the cell's formula. Locale
  keys `sheetInsertFunction`, `sheetFunctionSearch`.
- Docs: [Coming from Excel](docs/excel.md) — every Excel habit and where it is in we-grid.
- `weSheetRenameSheets(formula, renames)` (several sheets in one pass) and `weGridXlsxSheetName`.

### Fixed

- Excel import: text stays text (`00123`, `TRUE`, `15%`, `=x` stored as text come in with a
  leading `'`); numbers in exponent form (`1E-3`) are numbers; functions Excel stores as
  `_xlfn.IFS(…)` work; phonetic guides no longer leak into text; files with prefixed XML
  namespaces or cells without addresses are read.
- Excel export: functions newer than Excel 2007 are written with their `_xlfn.` prefix, so Excel
  does not show `#NAME?`; sheet names Excel cannot hold (over 31 characters, `/` and the like) are
  shortened in the file and the formulas pointing at them follow; duplicates are numbered from
  the base name (`A 2`, `A 3`).
- `<we-workbook>` import: a reference is renamed once, never twice.
- Formulas: `XLOOKUP` takes empty arguments, `search_mode` (-1 searches from the end), wildcard
  match mode 2 and 2-D result ranges; `FLOOR`/`CEILING` without float drift (`FLOOR(0.3,0.1)` is
  0.3) and with negative numbers; `DAYS` counts whole days; `PRODUCT` of nothing is 0; `WEEKDAY`
  types 11-17; `~` escapes in wildcards (`COUNTIF`, `SUMIFS`, `SEARCH`); `"TRUE"`/`"FALSE"`
  criteria match booleans; `XOR` skips text in ranges; `LOG(x, 1)` is `#DIV/0!`; `VALUE("10%")`.

## 0.23.0 — 2026-10-20

Sorting by several columns. A minor release.

### Added

- **Multi-column sort**: Shift+click more headers to sort by them after the first — ascending,
  descending, then off again; their place in the order shows next to the arrow. A plain click
  starts over. Saved views keep the whole sort (`WeGridSavedView.thenBy`), `(sortChange)` reports
  it (`WeGridSortChange.thenBy`), and macros write it as `SORT [City] ASC THEN [Total] DESC` (the
  recorder too). Client-side sorting only; a server-side grid sorts by one column, as before.
  Screen readers hear each extra column's place and direction (locale key `sortThenBy`).

## 0.22.0 — 2026-10-20

Fifty more Excel functions. A minor release.

### Added

- Formula engine (grid formula columns, format rules, macros and `<we-sheet>`): `SUMIFS`,
  `COUNTIFS`, `AVERAGEIFS`, `COUNTBLANK`, `PRODUCT`, `SUMPRODUCT`, `MEDIAN`, `LARGE`, `SMALL`,
  `RANK` / `RANK.EQ`, `STDEV` / `STDEV.S`, `CEILING`, `FLOOR`, `SIGN`, `PI`, `EXP`, `LN`, `LOG`,
  `LOG10`, `FIND`, `SEARCH`, `SUBSTITUTE`, `REPLACE`, `REPT`, `EXACT`, `VALUE`, `TEXTJOIN`,
  `ISBLANK`, `ISNUMBER`, `ISTEXT`, `ISERROR`, `IFNA`, `NA`, `XOR`, `CHOOSE`, `SWITCH`, `XLOOKUP`,
  `HLOOKUP`, `WEEKDAY`, `EDATE`, `EOMONTH`, `DAYS`, `HOUR`, `MINUTE`, `SECOND` — each with its
  Turkish Excel name and an argument hint.

### Changed

- `<we-sheet>` function suggestions list the shortest names first (`=SU` offers `SUM` first).
- Studio and README describe the spreadsheet's newer features.

## 0.21.0 — 2026-10-20

Multi-sheet Excel import and paste values. A minor release.

### Added

- `<we-workbook>`: opening an Excel file with several worksheets adds every one as a sheet, with
  its formulas; a name already taken gets a number and the formulas pointing at it follow.
  `<we-sheet [importSheets]>`, `weSheetFromCells` util.
- `<we-sheet>`: **Ctrl+Shift+V pastes values only** — what the copied cells showed, without
  formulas, into the target cells' own formats.

## 0.20.0 — 2026-10-20

Excel round trip for the spreadsheet, and fixes to filtered sheets. A minor release.

### Added

- `<we-sheet>` / `<we-workbook>` **Excel export writes the workbook itself**: every sheet, each
  cell where it stands, formulas in Excel's syntax with their results (Turkish function names and
  `;` become `SUM` and `,`), references between sheets, bold and italic, number formats and column
  widths. `weSheetWorkbookXlsx`, `weSheetFormulaToExcel`; `<we-sheet [xlsxSheets]>`.
- **Excel import keeps formulas and layout**: cells land where they stand in the file, formulas
  come in as formulas, and a filled (shared) formula is moved to each of its cells.
- xlsx utils: `weGridBuildXlsxWorkbook` (`WeGridXlsxSheet`, `WeGridXlsxCell`) and
  `weGridReadXlsxCells` (`WeGridXlsxCellSheet`).

### Fixed

- Filtered sheets: the active cell never lands on a hidden row (Enter, the formula bar, Ctrl+↓,
  a filter that hides the current row); Delete, cut and styles leave hidden rows alone; Ctrl+D
  fills the shown rows only; a filtered copy pastes with the right references; zebra rows follow
  the rows shown; a column's filter lists only the values the other filters show; inserting or
  deleting columns moves the filters with their columns.
- Clear formatting keeps dropdown lists and notes.
- Double-clicking the fill handle fills past a 0 or FALSE in the column beside.
- The dropdown picker finds a stored choice that was read as a number (`001`).

## 0.19.0 — 2026-10-20

Filters in the spreadsheet. A minor release.

### Added

- `<we-sheet>` **filter buttons** (Excel's AutoFilter): *Table options → Filter buttons* on a sheet
  with a header row puts a button in each header cell with a checklist of the column's values.
  Alt+↓ on a header cell opens it. Hidden rows keep their numbers; arrow keys and Enter skip them,
  copy and the status bar leave them out. `WeSheetData.autoFilter` and
  `filters`, `toggleAutoFilter()`; locale keys `sheetAutoFilter`, `sheetFilterColumn`.
- Studio: the Budget sheet has filter buttons.

## 0.18.0 — 2026-10-20

Notes and conditional formatting in the spreadsheet. A minor release.

### Added

- `<we-sheet>` **notes**: right-click → *Note…* adds a note to the selected cells
  (`WeSheetCell.n`). A triangle marks the cell's corner and the note shows when it is pointed at;
  copy, fill and saved sheets keep it. `saveNote(text)` method; locale keys `sheetNote`,
  `sheetNoteHint`, `sheetNoteRemove`.
- `<we-sheet>` **conditional formatting**: right-click → *Conditional formatting* opens the grid's
  Format panel for a range of one column — highlight rules, top/bottom, averages, duplicates,
  colour scales, data bars and icon sets over the computed values, kept in `WeSheetData.formats`
  (`WeSheetFormatRule`) and moved with inserted and deleted rows and columns.
  `weSheetSanitizeFormats` util. `WeGridFormatPanelComponent` takes `rulesOnly` (no column style,
  decimals, whole-row or formula rules).

## 0.17.0 — 2026-10-20

Spreadsheet fill handle and dropdown lists. A minor release.

### Added

- `<we-sheet>` **fill handle**: drag the square at the corner of the selection to fill down, up or
  sideways — numbers continue their step, dates go on by a day, text ending in a number counts on,
  formulas shift their references, anything else repeats. Double-click it to fill down as far as
  the neighbouring column goes; from the keyboard, *Fill series down* in the context menu.
  `fill(range)` / `fillSeries()` methods, `weSheetFill` util, locale keys `sheetFillHandle`,
  `sheetFillSeries`.
- `<we-sheet>` **dropdown lists** (Excel's data validation list): right-click → *Dropdown list…*
  gives the selected cells a list of choices (`WeSheetCell.l`). The active cell shows an arrow
  (or Alt+↓) to pick one; a typed value that is not a choice is refused with a notice. Kept by
  copy, fill, sort and saved layouts. `weSheetCleanList` util; icon `chevronDown`; locale keys
  `sheetList`, `sheetListHint`, `sheetListRemove`, `sheetListInvalid`, `sheetListOpen`.
- Studio: the Budget sheet has an *Approval* column with a dropdown list.

## 0.16.0 — 2026-10-20

Icon sets and a tidier sheet toolbar. A minor release.

### Added

- Conditional formatting **icon sets** (`type: 'iconSet'`, `icons: 'arrows' | 'dots'`, `reverse`):
  an arrow or traffic light before the value by its third of the column's range — in the Format
  panel, in rules from code and in macros (`ICONSET [Column] ARROWS | DOTS [REVERSE]`). Drawn as a
  CSS mask coloured from the palette, so it follows the theme. Locale keys `formatTypeIconSet`,
  `formatIconSetLabels`, `formatIconSetReverse`.

### Changed

- `<we-sheet>`: header row, zebra rows, freeze first column, add row and add column moved from the
  toolbar into a **Table options** menu, so the toolbar fits on one line. Locale key `sheetOptions`.
- `WeGridSheetEvaluator` reads text as a number in decimal notation only (`"0x10"`, `"0b11"`,
  `"Infinity"` stay text), and takes `parseNumbers: false` for inputs that are typed already.
- Macro numbers are the numbers the grid shows: `FILTER [Pct] > 25` on a percent column is 25 %,
  not 2500 %; the recorder writes them the same way. `weGridDiffViews` takes an optional `scaleOf`.

### Fixed

- `<we-sheet>`: sorting moves each formula's relative references with its row, as Excel does
  (`=A2*10` sorted to row 1 reads `=A1*10`, not another row's value).
- `<we-sheet>`: text stays text — `'007` and anything typed into a Text-formatted cell are no longer
  read back as numbers.
- `<we-workbook>`: inserting or deleting rows or columns moves the other sheets' references to that
  sheet (`=Sales!B1` becomes `=Sales!B2`); quoted references (`'Q 1'!A5`) to another sheet are no
  longer moved when this sheet changes. New `weSheetMoveSheetReferences` and `(structureChange)`.
- `<we-sheet>`: cut + paste keeps the cells' references as they were (copy + paste still shifts
  them); a whole-column reference (`=SUM(A:A)`) shifts when copied sideways; the chart range
  follows inserted and deleted rows; a whole-column selection sorts the used rows.
- `<we-sheet>`: importing a file larger than a sheet keeps what fits and says so, instead of
  growing past the limits; inserting rows or columns on a full sheet is refused with a notice
  instead of dropping the last ones. Locale keys `sheetImportTruncated`, `sheetFull`.
- Formulas: `MIN`/`MAX`/`VLOOKUP` over very large ranges no longer overflow the stack;
  `SUM`/`AVERAGE`/`MIN`/`MAX` skip text in a cell reference (`=SUM(A1,A2)` with a label in A1),
  as Excel does; `TEXT(1.005,"0.00")` rounds like `ROUND` (`1.01`).
- Macros: `FILTER [Active] = TRUE` on a boolean column filters instead of doing nothing; the
  recorder writes a one-sided range as `>` / `<` rather than an unreadable `BETWEEN 5 AND undefined`.
- Protocol layout store: long layout keys that share their first 49 bytes no longer map to the
  same URL (the hex form keeps 32 bytes plus a hash of the whole key). Keys up to 49 bytes keep
  their old URL.
- `<we-pivot>`: dates group by the local day (`2024-01-15`, not the UTC instant), invalid dates
  count as blank instead of failing the pivot.
- `<we-workbook>`: arrow keys between tabs move focus with the selection again.

## 0.15.0 — 2026-10-20

References between sheets. A minor release.

### Added

- Formulas read other sheets of a `<we-workbook>`: `=Sales!B2`, `=SUM(Sales!B2:B13)`,
  `='Q1 sales'!A1`. Renaming a sheet rewrites the formulas that point at it; deleting it shows
  `#REF!`. Inserting rows or columns in one sheet leaves references to other sheets alone.
- `<we-sheet>` `resolveSheet` input — the other sheets a lone sheet's formulas may read.
- Formula engine: `WeGridFormulaScope.sheetCell` / `sheetRange`, `WeGridSheetEvaluator`'s
  `sheet` option and `rangeValues()`; `weSheetNameRef`, `weSheetRenameReferences`.

## 0.14.0 — 2026-10-20

Workbooks, find and replace, three more languages. A minor release — new components and exports.

### Added

- `<we-workbook>` (`WeWorkbookComponent`) — several sheets behind tabs, like Excel: add, rename
  (double-click or F2), duplicate, delete and reorder (Ctrl+←/→) sheets, all saved together under
  one `workbookKey` through `WE_SHEET_STORE`; `WeWorkbookData`, `weWorkbookSanitize`. See
  docs/sheet.md.
- `<we-sheet>`: **find and replace** — Ctrl+F finds text in what the cells show and in formulas,
  Enter / Shift+Enter walk the matches, "Match case"; Ctrl+H replaces one match or all, undoably.
- `<we-sheet>`: Decrease / Increase **decimal places** for the selection (`WeSheetCell.d`), also
  applied to currency and percent formats.
- German, French and Spanish UI translations: `weGridLocaleDe`, `weGridLocaleFr`,
  `weGridLocaleEs`.
- Locale keys `sheetFind` … `sheetReplaced` and `workbookLabel` … `workbookDelete`.

### Fixed

- `<we-sheet>`: opening the cell editor no longer scrolls the page.

## 0.13.0 — 2026-10-20

Search and decimal places. A minor release — opt-in; with the new input off the markup is that of
0.12.

### Added

- Grid `search` (and `searchDebounceMs`, `(searchChange)`, `setSearch()`, `clearSearch()`) — a
  search box in the toolbar that keeps the rows containing every typed word in any visible column,
  as shown on screen (formatted numbers, dates, formula results). On a server-side grid with server
  filtering, or with `(searchChange)` bound, the text goes to you instead.
- Format panel: **decimal places** for number and percent columns (fewer / more / automatic),
  saved with the layout (`WeGridColumnLayout.format`) and in views.
- Locale keys `searchPlaceholder`, `searchClear`, `formatNumber`, `formatDecimals`,
  `formatDecimalsMore`, `formatDecimalsFewer`, `formatDecimalsAuto`.

## 0.12.1 — 2026-10-20

### Fixed

- `<we-sheet>`: moving the selection scrolled the whole page along with the sheet — only the
  sheet's own scrolling area moves now.

## 0.12.0 — 2026-10-20

Charts. A minor release — new component and exports.

### Added

- `<we-chart>` (`WeChartComponent`) — column, bar, line, area, pie and donut charts in plain SVG:
  stacking, a legend for two or more series, hover tooltips with every value of a category, a
  crosshair on line and area charts, round axis numbers in the locale's compact notation, and a
  **Show as table** view. See docs/charts.md.
- CSS `--we-grid-chart-1` … `--we-grid-chart-8` in both themes — a fixed series order checked for
  colour-vision deficiencies on the light and dark surfaces; more than eight series fold into
  "Other".
- `<we-pivot>`: chart buttons (`chart` input, `chartChange` output) — the pivot as a chart above
  the table.
- `<we-sheet>`: a chart of the selection, saved with the sheet (`WeSheetData.chart`), live as cells
  change, with its type switchable from the bar above it.
- Grid: **Ctrl+C copies** the selected rows — with a header line — or the active cell, as cells
  Excel and Google Sheets paste straight into columns (`copyText()` returns the same text). Only
  when the grid was the last thing pressed and no text is selected, so ordinary copying is
  unaffected.
- `weChartFromRows`, `weChartTicks`, `weChartFold`, `weChartArc`, `weChartBarPath`,
  `weChartColor`; locale keys `chartLabel` … `chartRemove`.

## 0.11.0 — 2026-10-20

Data sources, pivot tables and a fuller spreadsheet. A minor release — new components and exports;
the grid itself changes only in that a new `gridKey` now loads that key's layout.

### Added

- `WeGridProtocolClient` — a small fetch-based client for the we-report data protocol 1.1, which
  sample backends implement in .NET, Spring Boot, Node.js, Python, Go and PHP. Nothing calls it
  unless you create it. See docs/data-sources.md.
- `WeGridProtocolDataSource` — a database table as a server-side grid: `load({ page, pageSize,
  sort, filters })` returns the page and the total; `checklistValues` feeds the checklist header
  filter with the column's distinct values from the whole table.
- `WeGridProtocolLayoutStore` and `WeSheetProtocolStore` — keep grid layouts, saved views, user
  formatting, formula columns, macros and sheets on the backend (`/v1/layouts`), per user with a
  key prefix.
- `weGridProtocolWhere(filters)`, `weGridColumnsFromTable(table)`, `WeGridProtocolError`.
- we-grid Studio: a **Your database** tab that connects to a backend on your machine.
- `<we-sheet>`: a right-click menu (insert rows above/below, insert columns left/right, delete rows
  and columns — every formula's references move, shrink or become `#REF!` as in Excel — clear
  contents or formatting, AutoSum, sort), **Σ AutoSum** (Alt+=), **open an Excel or CSV file**,
  **freeze the first column**, a sticky header row, and **function suggestions** with argument
  hints while a formula is typed (English and Turkish names; arrows, Tab/Enter, Escape).
- `<we-pivot>` (`WePivotComponent`) — a pivot table: Rows, Columns and Values (sum, count, average,
  min, max) picked from chips, the result in a we-grid with subtotals per outer row group, a total
  per value, a grand total, sorting, formatting and export; formula fields are evaluated per row.
  `wePivot()` builds the same table without the component. See docs/pivot.md.
- `weSheetInsert`, `weSheetMoveReferences`, `weSheetAutoSum`; `WE_GRID_FORMULA_ALIASES`,
  `WE_GRID_FORMULA_SIGNATURES`; locale keys `sheetInsertRowAbove` … `sheetSuggestions` and
  `pivotLabel` … `pivotSwap`.

### Changed

- Changing a grid's `gridKey` after it was created loads that key's saved layout, formatting,
  formula columns, macros and views, instead of carrying the previous key's on screen.

## 0.10.0 — 2026-10-20

Macros. A minor release — opt-in; with the new inputs at their defaults the markup is that of 0.9.0.

### Added

- Grid `macros`, `allowMacros`, `macroCommands` and `(macroRun)` — named scripts of grid steps run
  from a **Macros** toolbar panel or pinned toolbar buttons: sort, filter, group, show/hide columns,
  density, zebra rows, highlight rules, data bars and colour scales, `SET [Column] = formula WHERE …`,
  saved views, export, messages and your own TypeScript commands (`RUN name`). Scripts are parsed,
  never evaluated. See docs/macros.md.
- A macro recorder: **Record**, use the grid, **Stop** — the steps are written for you.
- A macro editor with live line-by-line checking, a clickable cheat sheet and a test run.
- `runMacro()`, `runScript()`, `startRecording()`, `stopRecording()`, `openMacroDialog()`.
- User macros are saved with the layout (`WeGridLayout.macros`) and survive `layoutVersion` bumps.
- `weGridParseMacro`, `weGridMacroScript`, `weGridDiffViews`, `weGridSanitizeMacros`;
  `WeGridMacro`, `WeGridMacroStep`, `WeGridMacroCommand`, `WeGridMacroError`.
- Locale keys for the macros panel and editor, in English and Turkish.
- we-grid Studio, the live demo: <https://emrecirik.github.io/we-grid/studio/>.

## 0.9.0 — 2026-10-19

Spreadsheet features: formatting the user controls, Excel formula columns and a spreadsheet
component. A minor release —
every new feature is opt-in; with the new inputs at their defaults the markup and styles are those of
0.8.0.

### Added

- Grid `formatting` — **Format…** in the column menu opens a panel with the column's cell style
  (bold, italic, underline, strikethrough, a text colour and a fill from a nine-colour palette) and
  its conditional formatting rules: highlight cells (comparisons, between, text, empty, top/bottom
  n, above/below average, duplicate/unique, formula), colour scales and data bars, for the cell or
  the whole row, in priority order. Every change applies at once. See docs/formatting.md.
- Grid `striped` — zebra rows; with `formatting` on the user switches them from the menu.
- Grid `formatRules` (`WeGridFormatRule`) and column `cellStyle` (`WeGridCellStyle`) — formatting
  from code; the user's own choices are saved and win.
- Column `formula` — a computed, read-only column written as an Excel formula
  (`=[Price] * [Quantity]`); it sorts, filters, groups, sums and exports by its result, errors show
  their Excel code. See docs/formulas.md.
- Grid `allowFormulaColumns` — **Add formula column…** in the column menu: a dialog with column and
  function inserts, a syntax check and a live preview; the user's columns (`fx:` fields) can be
  edited and deleted.
- A formula engine with no dependency and no `eval`: 40-odd functions with English and Turkish
  Excel names, `,` or `;` separators, Excel error values, `#CIRC!` for loops, and a spreadsheet
  evaluator (`WeGridSheetEvaluator`, A1 references and ranges). Exported:
  `weGridCompileFormula`, `weGridTryCompileFormula` and friends.
- Formatting and formula columns are saved in the layout (`striped`, `formatRules`,
  `formulaColumns`, column `style`) and in saved views; stored and shared values are sanitised —
  colours are palette names, never CSS.
- `styles/we-grid-theme-apple.scss` — an optional Apple Human Interface Guidelines theme (the
  we-report look), shipped in the package next to the default theme.
- CSS `--we-grid-stripe-bg` and `--we-grid-format-<colour>-fg` / `-bg` for the nine palette colours.
- `<we-sheet>` (`WeSheetComponent`) — a spreadsheet: A1 cells with values and formulas, a formula
  bar and name box, range selection, Excel-compatible copy and paste (relative references shift),
  undo/redo, palette styles, alignment, number formats, sorting, fill down, header and zebra rows,
  a status bar with sum/average/count of the selection, Excel/CSV export, and persistence through
  `WE_SHEET_STORE` (localStorage by default) or `[data]`/`(dataChange)`. See docs/sheet.md.
- Locale keys for the Format panel, the formula dialog and the sheet, in English and Turkish.

### Changed

- Client-side sorting, filtering, grouping and summaries read a column through the grid's cell
  value instead of the raw field, so formula columns take part. For ordinary columns the value is
  the same and nothing changes.

## 0.8.0 — 2026-10-03

Four opt-in pieces for screens that bring their own chrome around the grid — a minor release: nothing
existing changes meaning. With the new inputs at their defaults the markup and styles are those of
0.7.0.

### Added

- Grid `toolbar: 'auto' | 'none'` — `'none'` leaves the toolbar out of the DOM; the features behind
  its buttons keep working from code, and dev mode warns once that they have no button.
- `openColumnsMenu(anchor?)` — the columns menu anchored to any element (else the Columns button,
  else the grid's corner), focus back to the anchor on close; one grid menu open on the page at a
  time. `openColumnsMenuFromToolbar()` stays and calls it. `toggleFilterRow(open?)`.
- Grid `headerMenuButton: 'always' | 'hover'` — the header ⚙ button shows on hover / focus only,
  keeping its place and its keyboard reach; always shown where the device can't hover. CSS
  `--we-grid-th-menu-btn-idle-opacity` / `--we-grid-th-menu-btn-hover-opacity`.
- Grid `treeRetainState` and `treeStateRetainLimit` — a tree row that leaves `data` keeps its open
  state for when it comes back. `clearTreeState()`; a `gridKey` change clears the tree state.
- `weGridEmpty` template (`WeGridEmptyDirective`, `WeGridEmptyContext`) — your own empty state, in a
  `role="status"` wrapper, with the grid's `hasActiveFilters`, `clearAllFilters()` and `message`.

### Changed

- `collapseAllTree()` closes the rows in `data` only, instead of clearing the whole open set — the
  same result unless `treeRetainState` remembers rows outside it.

## 0.7.0 — 2026-10-03

Tree rows, multi-level grouping with group summaries, full-width sticky detail rows, interactive
cell templates that keep their clicks, and column locks, header hints, bounded height and keyboard
column handling. Everything new is opt-in: with the new inputs at their defaults the grid renders
the same markup as 0.6.0 — guarded by DOM snapshot tests recorded from 0.6.0 — apart from the two
entries under Changed.

### Added

#### Interactive cell templates
- Column `stopRowEvents: boolean | ('click' | 'dblclick' | 'contextmenu')[]` — the general form of
  `stopRowClick` (which keeps meaning `'click'` only; given together, the union applies).
- Column `allowOverflow` — the cell stops clipping its content.
- Grid `ignoreInteractiveTargets` — a click, double click or right click that starts on a control
  inside a row (`WE_GRID_INTERACTIVE_SELECTOR`, `data-we-grid-ignore`; `data-we-grid-allow` opts
  back in) reaches neither `(rowClick)` / `(rowDblClick)` nor the grid's cell menu, and the browser's
  own menu keeps working. Exported helper `weGridIsInteractiveTarget(event, boundary?)`.
- Grid `rowStateVersion` and `refreshRows()` — re-evaluate `rowClass` and cell templates for state
  kept outside the grid, without rebuilding the templates (focus and caret survive).
- CSS `--we-grid-row-bg` and `--we-grid-row-accent`, set from a `rowClass` — the row's colour reaches
  pinned and sticky cells, and a 3px stripe marks its first cell. The library defines no value for
  either, so rows look the same until a consumer sets them.
- Guide: docs/cell-templates.md.

#### Header hints, column locks, bounded height, footer, keyboard
- Column `headerHint` — an ⓘ icon with its hint on hover and keyboard focus, in an overlay that cell
  clipping can't cut; replaces the native `headerTooltip` title when both are set. Column
  `headerTemplate` and the new `weGridHeader` directive (`WeGridHeaderDirective`,
  `WeGridHeaderContext`) for custom header content.
- Column `lockPinned`, `lockOrder` and the shorthand `fixed` (all four locks; explicit sub-flags
  win). Locked columns lose the matching menu items and their drag handle, nothing can be dragged or
  moved past a `lockOrder` column, and a saved layout's pin / position is ignored for them.
- Grid `maxHeight` / `minHeight` — the grid scrolls inside itself with the header and filter row
  stuck to the top and the summary row to the bottom.
- Grid `footer: 'full' | 'count' | 'none'`.
- Keyboard: Alt+←/→ on a header moves the column within its pin group (Alt+Shift to the group's
  edge), announced through a polite live region and saved like a drag; the resize handle is
  focusable (`role="separator"`) — arrows ±8px, Shift ±32px, Home = `minWidth`, Enter fits, Esc
  returns. Column menu items Move left / Move right.
- docs/api.md: how a saved layout from another source is merged, and when to bump `layoutVersion`.

#### Tree rows
- Grid `treeChildren`, `treeColumn`, `treeToggle`, `treeIndentPx`, `treeDefaultExpanded`,
  `treeSummaryLevel`, output `(treeExpandChange)`; methods `toggleTreeNode`, `isTreeExpanded`,
  `expandAllTree`, `collapseAllTree`, `treeAllExpanded`, `scrollToRow`.
- Column `childField` and `treeValue` — how child rows read a column; the value is used for display,
  sorting, filtering, summaries and exports alike. `WeGridCellContext.tree` and a third `tree`
  argument for `rowClass` (two-argument functions keep working).
- Sibling-only stable sorting, filters that keep the path to a match open, open state kept across
  new `data` arrays, depth-first exports with indentation, `role="treegrid"` semantics. Rendering
  500 roots with 2000 open children takes about as long as 2500 flat rows.
- Guide: docs/tree.md.

#### Row detail
- Grid `detailTrigger: 'column' | 'none'`, `detailSticky`, `detailMaxWidth`, `canExpandRow`,
  `detailMount: 'once' | 'whileOpen'`, output `(detailToggle)`; methods `toggleRowDetail`,
  `openRowDetail`, `closeRowDetail`, `isRowDetailOpen`, `closeAllDetails`, `detailId`.
- `WeGridRowDetailContext` gains `close()` and, in tree mode, `tree`. In a tree the detail comes
  between a row and its children.
- A sticky detail stays at the scroll area's edge on horizontal scroll and never widens the table;
  one `ResizeObserver` per grid. As soon as a new detail option is used the content is wrapped in a
  labelled `role="region"` the arrow points at with `aria-controls`.
- Guide: docs/row-detail.md.

#### Multi-level grouping and group summaries
- Group by several fields: menu items Add to grouping / Remove from grouping, a chip per level,
  grid `groupBy`, output `(groupFieldsChange)`, methods `setGrouping`, `addGroupField`,
  `removeGroupField`, `expandAllGroups`, `collapseAllGroups` (also in the grid menu). `groupField`
  and `(groupChange)` keep describing the outermost level.
- Group summaries: column `groupSummary`, grid `groupAutoSummary` (every numeric column adds up) and
  `groupSummaryPosition: 'header' | 'footer' | 'both'` — the footer puts each value under its column.
  Saved views store every level (`WeGridSavedView.groupFields`).
- Guide: docs/grouping.md.

#### Other
- `applyWeGridFilters`, `computeWeGridSummary` and `buildWeGridSummaryText` take an optional
  `valueOf(row, field)` reader (the tree uses it); without it they behave as before.
- Theme variables `--we-grid-group-nested-bg`, `--we-grid-detail-padding`,
  `--we-grid-detail-inset-left`; icon `info`; locale keys listed in docs/localization.md.

### Changed
- The column resize handle is keyboard operable and therefore carries `role="separator"`,
  `aria-orientation`, `tabindex="0"` and an `aria-label` on every grid — one extra tab stop per
  header.
- The column menu shows Move left / Move right on every column that isn't `lockOrder`.

### Fixed
- A header without `headerTooltip`, a summary cell without a summary and a templated or wrapped
  cell no longer carry `title="null"` — browsers showed a "null" tooltip on them.

### Notes on the requested signatures
- `WeGridRowDetailContext.tree` is optional (it only exists in tree mode); `close` is always present.
- `WeGridGroupSection` gained optional fields (`field`, `level`, `path`, `children`) rather than a
  new type, so existing code reading `groupedSections` keeps working; `rows` of an outer section
  holds every row of its sub-groups.
- The tree's "N rows shown" announcement needed a key of its own: `treeRowsShown(count)`.

## 0.6.0 — 2026-10-03

Best-fit columns on by default, a record form next to in-place editing, pasting ranges straight
from a spreadsheet, and saved, shareable views. A minor release: everything new is opt-in except
the automatic column fit, which changes how columns without an explicit width open, and paste on
`editable` grids — see Changed.

### Added

- **Best fit, on by default.** New grid input `autoFitColumns` (default `true`): every column with no
  explicit width — neither `width` on its definition nor one in the user's saved layout — is fitted
  to its content once, when the first rows arrive. Paging doesn't refit, so the columns don't jump.
  The automatic fit stops at 400px unless the column declares `maxWidth`, skips columns rendered
  through a cell template, and isn't saved as a layout change.
- Header menu entry **Fit all columns to content** (`autofitAllColumns` locale key) — fits every
  visible, non-templated column, explicit widths included, and saves the result like any resize.
- Double-clicking a column's resize border fits that column.
- **Record form.** New input `editMode: 'row' | 'form'`. In `'form'` the pencil and "Add row" open a
  modal form with one labelled field per editable column — hidden columns included — reusing the
  inline editors. `(rowCreate)` / `(rowUpdate)`, `done` and `required` validation are unchanged.
  The form is `WeGridEditFormComponent`, exported.
- **Paste from a spreadsheet.** On an `editable` grid, click a cell and press Ctrl+V with a range
  copied from Excel, LibreOffice or Google Sheets. Cells are converted to the column types the same
  way a file import converts them, a `select` column also matches option labels, read-only columns
  are left alone, invalid cells are skipped and reported, and rows past the end become new rows when
  `allowAdd` is on. The whole paste is one `(rowsPaste)` event (`updates`, `created`, `errors`,
  `done`); unbound, the values are written onto the loaded rows. New input `allowPaste` (default
  `true`) switches it off. New utilities `weGridParseClipboardTable` and `weGridCoerceImportValue`.
- **Saved views.** New input `savedViews` adds a Views toolbar button: save the current columns,
  filters, sort and grouping under a name, switch between views, and copy a link that opens the
  page in a view (`we-grid-view-<gridKey>` query parameter). Views are stored through the layout
  store under `<gridKey>::views`, so "Reset layout" keeps them. New output `(viewShare)`, models
  `WeGridSavedView` / `WeGridViewShareEvent` and utilities `weGridEncodeView` / `weGridDecodeView` /
  `weGridSanitizeView` / `weGridViewParamName`.
- Theme variables `--we-grid-on-accent-color` and `--we-grid-dialog-backdrop`; icons `bookmark` and
  `link`; locale keys for the form, paste and views (see docs/localization.md).

### Changed

- A column without an explicit width no longer opens at a flat 150px when rows are present. Set
  `[autoFitColumns]="false"` to keep the old widths.
- A saved layout no longer stores the width of a column that hasn't been fitted or resized yet.
- On an `editable` grid, clicking a cell now marks it as the paste target (an accent outline).

## 0.5.0 — 2026-09-23

Column types for what a backend actually stores — money in kuruş/cents, percentages, whole numbers,
times of day, links — a per-column formatter, and the Excel/DevExpress-style checklist header filter
switched on for every column by default. The default switch is a visible behaviour change; read the
upgrade notes before upgrading.

### Added

#### Money stored in kuruş / cents (`minorUnits`)

- New column option `minorUnits: true` for `type: 'currency'`: the row holds the amount in the
  currency's minor unit (`12345`) and the cell shows `₺123,45`. The divisor comes from the currency
  through `Intl` — 100 for TRY/USD/EUR, 1 for JPY, 1000 for KWD.
- Everything the user sees or types is in major units: cells, summary text, chips, checklist
  entries, the filter row, the filter popover, the inline editor, CSV/PDF export, and Excel export
  (written as the number `123.45`). CSV/Excel import turns `123,45` back into `12345`.
- Everything that leaves the grid stays in minor units: sorting, the summary arithmetic,
  `(filterChange)` values and `(rowCreate)`/`(rowUpdate)` rows — a user's "Price > 500" reaches the
  backend as `{ operator: 'gt', value: 50000 }`.

#### New column types

- `'integer'` — no fraction digits; the editor steps by 1 and rounds; import rounds.
- `'percent'` — stores a fraction, shows `25%`; the filter and the editor take `25` and store `0.25`;
  Excel export keeps the fraction with Excel's `0.00%` format; import reads `25%` as `0.25`.
- `'time'` — a time of day (`'14:30'`, `'14:30:15'`) or a `Date`, shown in the locale's clock
  (`02:30 PM` / `14:30`); a time of day is never shifted into `intlTimeZone`. `format: 'HH:mm:ss'`
  shows seconds. New `'time'` editor (`<input type="time">`) keeps a string a string and changes only
  the clock of a `Date`.
- `'email'`, `'url'`, `'phone'` — rendered as `mailto:`, web (new tab, `rel="noopener noreferrer"`,
  `https://` added when no http(s) scheme is present — a `javascript:` value never becomes a live
  link) and `tel:` links. Clicking one doesn't fire `(rowClick)`. New editors `'email'`, `'url'`,
  `'tel'` render the matching input type. Link colour: new theme variable `--we-grid-link-color`.
- Every numeric type filters with = > < between and offers sum/avg/min/max; `time` and the link
  types filter as text. `WeGridValueKind` / `weGridValueKind(type)` expose that grouping.

#### `formatter`

- New column option `formatter: (value, row) => string` replaces the built-in text wherever a value
  is shown as text — the cell and its tooltip, the summary row, group headers, checklist entries,
  filter chips, CSV and PDF export. It changes presentation only: sorting, filtering, the summary's
  arithmetic and Excel's numeric cells use the raw value. `row` is `null` where no single row exists.
  It is also called for empty values, so it can print a placeholder.

#### Checklist header filter on by default

- New grid input `headerFilterMode: 'checklist' | 'operator'`, default `'checklist'`. A column that
  doesn't declare its own `headerFilterMode` follows it — except `type: 'custom'`, which stays on
  `'operator'`. Changing the input at runtime rebuilds the columns.

#### Utilities

- `formatWeGridColumnValue(value, col, options?, row?)`, `weGridInputScale(col, currency?)`,
  `weGridToInputNumber`, `weGridFromInputNumber`, `weGridCurrencyFractionDigits`,
  `weGridResolveCurrency`, `weGridLinkHref`, `isWeGridLinkType`; `formatWeGridValue` accepts a
  `minorUnits` option; `mergeGridLayout` takes an optional fourth argument, the default header filter
  mode; `WeGridExportColumn.numberScale` and `WeGridImportColumn.minorUnitFactor` (both optional).

### Upgrade notes

- **Every filterable column now shows a funnel that opens the checklist**, even with `filterRow`
  off, and a grid with the filter row shows checklist buttons instead of operator inputs for those
  columns. To keep 0.4.0's behaviour, add one attribute: `<we-grid headerFilterMode="operator" …>`.
  To mix, keep the default and set `headerFilterMode: 'operator'` on the columns where free text or
  a range reads better (names, amounts, dates).
- **On a server-filtered grid without a `checklistValuesProvider`**, the new default checklists list
  only the loaded page (and say so). Bind a provider — see docs/server-side.md — or switch those
  columns to `'operator'`.
- `WeGridColumnType` and `WeGridEditorType` gained members. Code that `switch`es over them
  exhaustively needs the new cases.
- A number/integer/percent/currency cell whose value doesn't parse as a number now shows the raw
  value instead of `NaN`.

### Documentation

- New docs/column-types.md: every type, `format` per type, kuruş/cents, percentages, `formatter` vs
  `displayValue` vs a cell template, links.
- docs/server-side.md opens with an end-to-end walkthrough of filtering 3,000 products when 20 are
  loaded — component, request body, every operator's SQL meaning, EF Core and SQL backends, and a
  table of "only this page is searched" causes. README, README.tr, the npm README, docs/usage.html,
  getting-started, api, row-editing, export-import and theming are updated to match.

### Samples

- `retail-market` filters the whole product table on the server with `filterMode="server"`, feeds
  its Category/Supplier/Location checklists from a `checklistValuesProvider`, and says so above the
  grid; stock columns are `integer`.
- `banking`'s loan portfolio receives TRY amounts in kuruş and rates as fractions, shown through
  `minorUnits` and `percent`.
- `ecommerce-dashboard` keeps the default checklist on its closed-set columns (all fed from the
  whole dataset) and opts its free-text, date and amount columns into `'operator'`.
- The playground gained a checklist-by-default section and a column-types section whose log shows
  the kuruş values a backend would receive.
- Test suite grew from 243 to 282 specs.

## 0.4.0 — 2026-09-11

Locale-aware formatting and comparison, checklist values from the whole dataset, per-column
operator restrictions — and four fixes where what a server-side screen saw and what the grid emitted
or saved could drift apart. The "Added" part is additive; the upgrade notes and fixes below are not,
so read them before upgrading.

### Added

Nothing in this section changes the meaning of an existing input, output, model field or exported
signature: an English grid renders exactly what it rendered on 0.3.0.

#### Locale-aware formatting, comparison and sorting

- `WeGridLocale` gained `intlLocale` (a BCP 47 tag) and the optional `intlCurrency` and
  `intlTimeZone`. Every rendering of a cell value — cells, group headers, checklist labels, filter
  chips, summary numbers, exports — formats through them instead of a hard-coded `en-US`; the text
  filter and the checklist's search box lowercase with `toLocaleLowerCase(intlLocale)`; group headers
  and checklist values sort with `localeCompare(…, intlLocale)`.
- `summaryGrand` / `summaryPage` build the summary row's "Grand …" / "Page …" labels. They are
  functions rather than prefixes because Turkish inflects the word: "Genel toplam", "Sayfa toplamı",
  "Sayfa ortalaması".
- `formatWeGridValue` accepts `currency` and `timeZone` options; `applyWeGridFilters` accepts an
  optional `locale`.

#### Checklist values from the whole dataset

- New `checklistValuesProvider` input. On a grid that filters on the server, a checklist column asks
  it for its values — the whole dataset, narrowed by every **other** active filter — instead of
  listing the loaded page. The popover's search box goes to the provider too, debounced by the new
  `checklistSearchDebounceMs` (300ms); each new term cancels the request before it.
- Requests are capped by `checklistValuesLimit` (grid input, default 200, overridable per column);
  a `hasMore` answer shows "Showing the first N values". A failed request shows an error line and a
  Retry button instead of an empty list. Ticked values the provider no longer returns stay listed
  and ticked.
- New column options `headerFilterSource: 'loaded' | 'provider'` (keep one column on the loaded rows)
  and `checklistValueLabel(value)` (label a value with no row to run `displayValue` against).
- New models `WeGridChecklistValuesProvider`, `WeGridChecklistValuesRequest`,
  `WeGridChecklistValuesResult`, `WeGridChecklistValue` and `WeGridHeaderFilterSource`.
- The provider is ignored while filtering runs client-side (with a one-time dev-mode warning):
  there a value the loaded rows don't contain could never match.

#### Per-column operator restriction

- New column option `filterOperators` narrows the operators the filter row and the filter popover
  offer, in the order given, the first being the default. Operators that don't fit the column type
  are dropped; a list with nothing left falls back to the full one with a dev-mode warning.
- "Filter by this value" is hidden on a column whose list rules out the exact match it stands for.
- Both templates now render their operator lists from one source, exported as
  `weGridFilterOperatorsFor(type, filterOperators?)`, alongside `weGridQuickFilterOperator(col)` and
  `weGridFilterOperatorLabel(operator, type, locale?)`.

### Upgrade notes

- **`weGridLocaleTr` now formats Turkish.** It sets `intlLocale: 'tr-TR'` and `intlCurrency: 'TRY'`,
  so a grid using it shows `1.234,50` and `11.09.2026` — and a `type: 'currency'` column **without
  its own `format` shows ₺ instead of $.** A Turkish-language screen displaying another currency needs
  `format` on the column, or `{ ...weGridLocaleTr, intlCurrency: 'USD' }`.
- **Seven new required `WeGridLocale` keys:** `intlLocale`, `summaryGrand`, `summaryPage`,
  `checklistValuesLoading`, `checklistValuesError`, `checklistValuesTruncated`, `retry`. A hand-written
  locale that doesn't spread `weGridLocaleEn` or `weGridLocaleTr` fails to compile until they are
  added. Both shipped locales fill them in.
- **A server-filtered checklist without a provider now says so.** Its popover shows "Only this page
  is searched" and dev mode logs a one-time warning suggesting `checklistValuesProvider` (or
  `headerFilterSource: 'loaded'` to keep the page deliberately). Client-filtered grids are unchanged.

### Fix: "Reset layout" left a server-side screen querying with cleared filters

- The reset cleared every filter locally but emitted neither `(filterChange)` nor `(layoutChange)`,
  so the backend kept receiving filters the user could no longer see. When a filter was active, the
  reset now emits one empty `(filterChange)` with `resetPage: true` immediately — flushing, not
  waiting out, `filterDebounceMs`; when none was, it emits nothing. `(layoutChange)` fires with the
  default layout on every reset, still without writing the deleted layout back.
- **Behaviour change:** screens listening to `(filterChange)` / `(layoutChange)` receive an event on
  reset they never received before. It is the notification they were missing.

### Fix: "Filter by this value" on non-filterable and checklist columns

- A `filterable: false` column still offered the context-menu action and turned it into an active
  filter and chip. The item is now hidden there, and the action is ignored if it arrives anyway.
- On a checklist column the action produced `equals`/`eq` with a single string — a shape the
  server-side contract doesn't give that column, which also dropped the user's ticks the next time
  the checklist opened. It now produces `{ operator: 'in', value: [rawValue] }`, carrying the raw code
  even when the column has a `displayValue`, and the chip shows the label.

### Fix: "Filter by this value" used the UTC day for date columns

- `weGridQuickFilterValueToInputString` built its `yyyy-MM-dd` from `toISOString()`, the UTC day: a
  row stamped 00:30 in UTC+3 quick-filtered on the day before. It now uses the value's local
  calendar day, the one the date input shows and the date filter compares.

### Fix: editing a `date` column changed the stored instant

- The editor showed a string value's local day but saved the picked day as UTC midnight, so a value
  the backend stored as local midnight (`2026-09-10T21:00:00.000Z` in UTC+3) came back with a
  different timestamp even when the day was left as it was. A `date` editor on a string field now
  emits the calendar day itself, `"2026-09-11"`. `datetime` editors and `Date`-valued fields are
  unchanged — see docs/row-editing.md for why the two editors send different strings.

### Other

- No new theme variables: the checklist's notes reuse `--we-grid-muted-color` and
  `--we-grid-danger-color`.
- `ecommerce-dashboard` feeds its Status checklist from its mock backend; the playground's
  server-side demo does the same for Name (with a limit of 50, to show the truncation note) and
  Category.
- Test suite grew from 158 to 243 specs, with new spec files for the filter model, the header menu,
  the filter popover and the cell editor.

## 0.3.0 — 2026-09-11

Everything here is additive: no input, output, model field or exported signature changed meaning,
so an existing grid behaves exactly as it did on 0.2.0 without touching a line.

### Checklist header filter

- New column options `headerFilterMode: 'operator' | 'checklist'` (default `'operator'`, i.e. the
  popover that was already there) and `headerFilterSelection: 'multi' | 'single'` (checkboxes or
  radio buttons). A `'checklist'` column's funnel icon opens the distinct values of the LOADED rows
  with a search box, a select-all box, an "(Empty)" entry for blanks, and Clear / Cancel / Apply.
- The values are derived from the `data` input alone — the grid issues no request of its own to
  discover what a column can contain — but a value the user already ticked stays in the list, and
  stays ticked, after paging to rows that no longer contain it.
- Labels come from the column's `displayValue` when it has one; the payload always carries the raw
  values, so the backend receives the codes it stores.
- A checklist column shows its funnel icon without `filterRow` having to be on. Every other column
  keeps the old rule.

### The `'in'` filter operator

- New `'in'` member of `WeGridFilterOperator`, the only one whose `WeGridColumnFilterState.value`
  is an array (`unknown[]`); a `null` entry means the blank bucket. `isWeGridFilterActive`,
  `applyWeGridFilters` and `weGridFilterChipLabel` all understand it, the chip shortening a long
  selection to `Status: Preparing, Shipped (+3)`.
- Comparison goes through the new `weGridFilterValueKey(value)`, so a selection still matches after
  a round trip that turned `40` into `"40"` or rebuilt a `Date`.
- Works the same in both modes: `filterMode='client'` applies it over the loaded rows,
  `filterMode='server'` emits it through the existing `(filterChange)` — no new output.

### Server-side filtering

- New `filterDebounceMs` input (default `400`, the previous hard-coded value) for grids where every
  emit costs a query.
- `(filterChange)` now emits a `WeGridFilterChangeEvent`. It IS the `WeGridColumnFilterState[]` it
  has always been — a handler typed as the array keeps compiling — and additionally carries
  `filters` and `resetPage`. `resetPage` is true when the filter set really changed, which is the
  screen's cue to set `page = 1`; the grid deliberately never emits `(pageChange)` alongside it, so
  one user action stays one request.

### Other

- Four new locale keys for the checklist (`filterSearchPlaceholder`, `selectAll`,
  `noMatchingValues`, `cancel`), filled in both `weGridLocaleEn` and `weGridLocaleTr`. A
  hand-written `WeGridLocale` that doesn't spread one of them needs them added.
- No new theme variables — the checklist is built from the existing `--we-grid-*` values.
- `ecommerce-dashboard` uses a checklist on its Status column, and the playground's server-side
  demo now filters through the mock backend and logs the query it would have sent.
- Test suite grew from 140 to 158 specs, including a new `we-grid-filter.util.spec.ts`.

## 0.2.0 — 2026-09-08

### Angular 19 – 22 support

- `peerDependencies` now accept `^18.2.0 || ^19.0.0 || ^20.0.0 || ^21.0.0 || ^22.0.0` instead of
  Angular 18 only. The package is still built in Ivy partial-compilation mode, which newer Angular
  linkers consume, so no separate build is needed per major.
- `@angular/platform-browser` was added to `peerDependencies`. The grid has always imported
  `DomSanitizer` from it; it was simply missing from the declared peers.

### Export and import

- New `exportFormats` input adds toolbar buttons for CSV, Excel (`.xlsx`) and PDF. Off by default.
  The export covers the visible columns in their current order and the selected rows, or every
  loaded row when nothing is selected.
- CSV and XLSX are written without any runtime dependency: an `.xlsx` is assembled directly as a
  ZIP of XML parts with stored (uncompressed) entries. Numbers stay numeric and dates stay dates.
- PDF goes through the browser's print pipeline in an off-screen iframe, so the output supports the
  full Unicode range (a hand-rolled PDF writer would be stuck with the 14 standard fonts, none of
  which can encode `ş`, `ğ` or `ı`) and inherits the grid's theme via new `--we-grid-print-*`
  variables.
- New `importFormats` input adds a file picker for CSV and Excel. Header matching ignores case,
  whitespace and diacritics; cells are coerced to their column's type (numbers in either locale
  convention, ISO/day-first/Excel-serial dates, booleans in both shipped languages). The parsed
  rows are emitted through `(importData)` — the grid never writes into `data` itself.
- `exportMode` follows the same `'auto'` rule as `sortMode`/`filterMode`: on a `serverSide` grid
  with `(exportRequest)` bound, the backend produces the file for the full result set.
- Both halves are swappable through the new `WE_GRID_EXPORTER` and `WE_GRID_IMPORT_PARSER` tokens.

### Inline row editing

- New `editable`, `allowAdd`, `allowDelete`, `confirmDelete`, `showRefresh` and `newRowTemplate`
  inputs, with `(rowCreate)`, `(rowUpdate)`, `(rowDelete)` and `(refresh)` outputs.
- Each commit carries a `done(success, error?)` callback: the row stays in its saving state until
  the backend answers, and a rejected write leaves the editor open with the user's values intact.
  `rowUpdate` also reports `changes` — only the fields that actually changed.
- New column options `editable`, `editor`, `editorOptions`, `required` and `exportable`.
- A row-action column is pinned to the far right when editing or deleting is on; right-pinned data
  columns shift inward by its width.

### Other

- New locale keys for the export/import toolbar and row editing, filled in both `weGridLocaleEn`
  and `weGridLocaleTr`.
- New theme variables: `--we-grid-danger-color`, `--we-grid-editing-bg` and the five
  `--we-grid-print-*` values.
- New docs: `docs/export-import.md`, `docs/row-editing.md`, and a standalone usage page at
  `docs/usage.html` published on GitHub Pages.
- Test suite grew from 92 to 140 specs.

## 0.1.1 — 2026-09-04

- Ship the MIT license text inside the npm package. `package.json` declared `"license": "MIT"`
  but the `LICENSE` file itself was never included in the tarball, so anyone installing from
  npm got the declaration without the terms.

## 0.1.0 — Initial open-source release

- Extracted from an internal ERP project into an independent Angular CLI workspace
  (`projects/we-grid` library + `projects/playground` demo app).
- Renamed the npm package to `we-grid-angular`.
- Replaced all Remix Icon (`ri-*`) font glyphs with inline SVG via the new `WE_GRID_ICONS`
  injection token (`weGridDefaultIcons` provided out of the box).
- Extracted every hardcoded UI string into the new `WeGridLocale` interface / `WE_GRID_LOCALE`
  token, with `weGridLocaleEn` (default) and `weGridLocaleTr` (Turkish) provided.
- Replaced the host-application-specific CSS variable bridge with a standalone,
  framework-independent default theme (`styles/we-grid-theme.scss`) with light/dark support.
- Translated all internal code comments to English.
- Added `ng-packagr` as an explicit devDependency so the library can actually be packaged.
- Added three sample applications (`banking`, `retail-market`, `ecommerce-dashboard`) with seeded,
  entirely fictional datasets, plus a light/dark theme switch in `ecommerce-dashboard`.
- Documented the grid with real screenshots (`docs/images/`) and a standalone gallery page
  (`docs/gallery.html`).
- Added a GitHub Actions workflow that builds the library, runs the 92 unit tests, and builds all
  three sample applications.
