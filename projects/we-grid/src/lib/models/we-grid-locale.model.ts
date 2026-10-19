import { InjectionToken } from '@angular/core';
import { WeGridFormatColor, WeGridFormatOperator, WeGridFormatPreset, WeGridFormatScalePreset } from './we-grid-format.model';

/**
 * All user-facing text used by we-grid. Grouped roughly by which part of the UI they belong to
 * (toolbar/footer, header context menu, filter popover) — provide your own object satisfying this
 * interface to translate the grid, or use one of the ready-made `weGridLocaleEn`/`weGridLocaleTr`
 * exports. See docs/localization.md.
 */
export interface WeGridLocale {
  // ─── Value formatting, comparison and sorting ───────────────────────────────────────
  /**
   * BCP 47 tag (e.g. `'en-US'`, `'tr-TR'`) the grid formats and compares cell values with:
   * `Intl.NumberFormat` / `Intl.DateTimeFormat` for number, currency, date and datetime cells — and
   * therefore group headers, filter chips, summaries and exports — `toLocaleLowerCase` for the text
   * filter and the checklist's search box, and `localeCompare` for group and checklist ordering.
   * Without it a translated grid still showed `1,234.50`, and "İSTANBUL" never matched "istanbul".
   */
  intlLocale: string;
  /** ISO 4217 code a `type: 'currency'` column without its own `format` is shown in — `'USD'` when omitted */
  intlCurrency?: string;
  /** IANA time zone (e.g. `'Europe/Istanbul'`) date and datetime cells are shown in — the browser's own zone when omitted */
  intlTimeZone?: string;

  // ─── Toolbar / footer / empty state (main grid template) ───────────────────────────
  emptyMessage: string;
  columnsButton: string;
  filterRowButton: string;
  groupingLabel: string;
  clearGroupingAria: string;
  filterAriaLabel: string;
  clearAllFilters: string;
  onlyThisPageSearched: string;
  onlyThisPageSorted: string;
  noRecordsMatchFilter: string;
  clearFilters: string;
  paginationAriaLabel: string;
  firstPage: string;
  previousPage: string;
  nextPage: string;
  lastPage: string;
  /** Accepts the page number, e.g. `(n) => \`Page ${n}\`` */
  pageAriaLabel: (page: number) => string;
  recordsLabel: string;
  /** Accepts (page, totalPages), e.g. `(p, t) => \`Page ${p} / ${t}\`` */
  pageOf: (page: number, totalPages: number) => string;
  /** Label shown as the group header when the grouped field's value is null/undefined/empty */
  emptyGroupValue: string;

  // ─── Export / import toolbar (shown when exportFormats / importFormats are set) ─────
  exportButton: string;
  exportCsv: string;
  exportExcel: string;
  exportPdf: string;
  exportAllRows: string;
  exportSelectedRows: string;
  importButton: string;
  importCsv: string;
  importExcel: string;
  /** Accepts the number of rows read out of the file, e.g. `(n) => \`${n} rows read\`` */
  importSucceeded: (rowCount: number) => string;
  importFailed: string;
  /** Prefix for the list of file headers that matched no column */
  importUnmappedColumns: string;
  refreshButton: string;

  // ─── Row editing (shown when editable / allowAdd / allowDelete are on) ──────────────
  actionsColumn: string;
  addRow: string;
  editRow: string;
  deleteRow: string;
  saveRow: string;
  cancelEdit: string;
  savingRow: string;
  confirmDeleteRow: string;
  requiredField: string;
  /** Fallback message when a commit is rejected without one of its own */
  saveFailed: string;

  // ─── Header context menu (we-grid-header-menu) ──────────────────────────────────────
  hideColumn: string;
  columns: string;
  showAllColumns: string;
  groupByThisField: string;
  removeGrouping: string;
  filterByThisValue: string;
  rename: string;
  wrapText: string;
  autofitWidth: string;
  autofitAllColumns: string;
  pin: string;
  pinLeft: string;
  pinRight: string;
  unpin: string;
  sortAscending: string;
  sortDescending: string;
  clearSort: string;
  summary: string;
  sum: string;
  average: string;
  min: string;
  max: string;
  count: string;
  none: string;
  /**
   * Summary-row label of a genuine grand total (a `summaryValues` override), built from the
   * function's own label: `(fn) => \`Grand ${fn.toLowerCase()}\`` turns "Sum" into "Grand sum". A
   * function rather than a prefix string, because some languages inflect the word it joins.
   */
  summaryGrand: (functionLabel: string) => string;
  /**
   * Summary-row label of a total over the loaded page only (`serverSide` without an override) —
   * "Page sum" in English, "Sayfa toplamı" in Turkish, where the possessive suffix depends on the word.
   */
  summaryPage: (functionLabel: string) => string;
  density: string;
  comfortable: string;
  normal: string;
  compact: string;
  resetLayout: string;

  // ─── Filter popover (we-grid-filter-popover) ────────────────────────────────────────
  clear: string;
  apply: string;
  all: string;
  yes: string;
  no: string;
  contains: string;
  startsWith: string;
  equals: string;
  before: string;
  after: string;
  between: string;
  value: string;
  close: string;

  // ─── Checklist header filter (columns with headerFilterMode: 'checklist') ───────────
  /** Placeholder of the search box above the value list */
  filterSearchPlaceholder: string;
  /** Label of the select-all / clear-all checkbox at the top of the list */
  selectAll: string;
  /** Shown instead of the list when the search matches no value */
  noMatchingValues: string;
  /** The checklist's third button, next to Clear and Apply — discards the pending selection */
  cancel: string;
  /** Shown while a `checklistValuesProvider` request is in flight */
  checklistValuesLoading: string;
  /** Shown when a `checklistValuesProvider` request failed, above the retry button */
  checklistValuesError: string;
  /** Accepts the request limit, e.g. `(n) => \`Showing the first ${n} values — narrow your search\`` */
  checklistValuesTruncated: (limit: number) => string;
  /** Repeats a failed request */
  retry: string;

  // ─── Record form (editMode: 'form') ───
  formEditTitle: string;
  formCreateTitle: string;

  // ─── Pasting a spreadsheet range ───
  /** Accepts the number of cells written, e.g. `(n) => \`${n} cells pasted\`` */
  pasteApplied: (cellCount: number) => string;
  /** Accepts the number of pasted rows that fell below the last row and were dropped */
  pasteRowsDropped: (rowCount: number) => string;
  /** Prefix for the list of cells whose text didn't fit the column's type */
  pasteInvalidCells: string;

  // ─── Saved views ───
  viewsButton: string;
  viewNamePlaceholder: string;
  saveView: string;
  deleteView: string;
  shareView: string;
  noSavedViews: string;
  viewLinkCopied: string;
  /** Shown with the link itself when the clipboard refused it, so the user can copy it by hand */
  viewLinkCopyFailed: string;

  // ─── Header hint, column moving and resizing from the keyboard ───
  /** Accessible name prefix of the ⓘ icon — the hint text follows it */
  headerHintAria: string;
  /** Announced after a keyboard move, e.g. `(title, 3) => \`${title} moved to position 3\`` */
  columnMoved: (title: string, position: number) => string;
  /** Accessible name of a column's resize handle */
  columnResizeAria: (title: string) => string;
  moveColumnLeft: string;
  moveColumnRight: string;

  // ─── Tree rows (treeChildren) ───
  /** Accessible name of a collapsed row's toggle — `label` is the row's text in the tree column */
  treeExpandRow: (label: string) => string;
  treeCollapseRow: (label: string) => string;
  treeExpandAll: string;
  treeCollapseAll: string;
  /** Announced once after expand/collapse all */
  treeRowsShown: (count: number) => string;

  // ─── Row detail ───
  /** Accessible name of a detail region — `label` is the row's text in its first column */
  detailRegionLabel: (label: string) => string;

  // ─── Multi-level grouping ───
  addToGrouping: string;
  removeFromGrouping: string;
  expandAllGroups: string;
  collapseAllGroups: string;

  // ─── Formatting (the grid's `formatting` input) ───
  formatColumn: string;
  /** Title of the format panel — `header` is the column's header text */
  formatPanelTitle: (header: string) => string;
  stripedRows: string;
  formatCellStyle: string;
  formatBold: string;
  formatItalic: string;
  formatUnderline: string;
  formatStrike: string;
  /** The letters on the bold / italic / underline / strikethrough buttons */
  formatFlagGlyphs: Record<'bold' | 'italic' | 'underline' | 'strike', string>;
  formatTextColor: string;
  formatFill: string;
  formatNoColor: string;
  /** Names of the palette colours — read out on the colour swatches */
  formatColorNames: Record<WeGridFormatColor, string>;
  formatRules: string;
  formatNoRules: string;
  formatAddRule: string;
  formatRuleType: string;
  formatTypeCondition: string;
  formatTypeColorScale: string;
  formatTypeDataBar: string;
  formatTypeIconSet: string;
  formatIconSetLabels: Record<'arrows' | 'dots', string>;
  formatIconSetReverse: string;
  formatOperatorLabels: Record<WeGridFormatOperator, string>;
  formatValue: string;
  formatValueAnd: string;
  formatTopCount: string;
  formatFormulaHint: string;
  formatStyle: string;
  formatPresetLabels: Record<WeGridFormatPreset, string>;
  formatScaleLabels: Record<WeGridFormatScalePreset, string>;
  formatApplyToRow: string;
  formatBarColor: string;
  formatDeleteRule: string;
  formatRaisePriority: string;
  formatClearRules: string;

  // ─── Formula columns (the grid's `allowFormulaColumns` input) ───
  addFormulaColumn: string;
  editFormulaColumn: string;
  deleteFormulaColumn: string;
  formulaDialogNew: string;
  formulaDialogEdit: string;
  formulaColumnName: string;
  formulaDefaultName: string;
  formulaLabel: string;
  formulaPlaceholder: string;
  formulaResultType: string;
  formulaTypeLabels: Record<'text' | 'number' | 'integer' | 'currency' | 'percent' | 'date' | 'boolean', string>;
  formulaInsertColumn: string;
  formulaInsertFunction: string;
  formulaPreview: string;
  /** A formula that cannot be read — `position` is 1-based */
  formulaSyntaxError: (position: number) => string;
  formulaSave: string;

  // ─── <we-sheet> ───
  sheetLabel: string;
  sheetToolbar: string;
  sheetNameBox: string;
  sheetFormulaBar: string;
  sheetUndo: string;
  sheetRedo: string;
  sheetAlignStart: string;
  sheetAlignCenter: string;
  sheetAlignEnd: string;
  sheetNumberFormat: string;
  sheetFormatLabels: Record<'general' | 'number' | 'integer' | 'currency' | 'percent' | 'date' | 'text', string>;
  sheetSortAsc: string;
  sheetSortDesc: string;
  sheetFillDown: string;
  sheetClearFormat: string;
  sheetHeaderRow: string;
  sheetAddRow: string;
  sheetAddColumn: string;
  sheetSelectAll: string;
  /** Read out for a cell — `address` is like B3 */
  sheetCellLabel: (address: string, text: string) => string;
  sheetInsertRowAbove: string;
  sheetInsertRowBelow: string;
  sheetDeleteRows: string;
  sheetInsertColumnLeft: string;
  sheetInsertColumnRight: string;
  sheetDeleteColumns: string;
  sheetClearContents: string;
  sheetAutoSum: string;
  sheetImport: string;
  sheetImportFailed: string;
  /** The imported file was larger than a sheet holds */
  sheetImportTruncated: string;
  /** An insert would push content off a full sheet */
  sheetFull: string;
  sheetFreezeColumn: string;
  sheetSuggestions: string;
  sheetOptions: string;

  // ─── <we-pivot> ───
  pivotLabel: string;
  pivotRows: string;
  pivotColumns: string;
  pivotValues: string;
  pivotAddField: string;
  pivotRemove: (field: string) => string;
  pivotAggregate: string;
  pivotTotal: string;
  pivotTruncated: string;
  pivotSwap: string;

  // ─── <we-chart> ───
  chartLabel: string;
  chartShowTable: string;
  chartShowChart: string;
  chartNoData: string;
  chartOther: string;
  chartLegend: string;
  chartTypeLabels: Record<'column' | 'bar' | 'line' | 'area' | 'pie' | 'donut', string>;
  chartStacked: string;
  chartInsert: string;
  chartRemove: string;

  // ─── Search and number format ───
  searchPlaceholder: string;
  searchClear: string;
  formatNumber: string;
  formatDecimals: string;
  formatDecimalsMore: string;
  formatDecimalsFewer: string;
  formatDecimalsAuto: string;

  // ─── <we-sheet> find and replace ───
  sheetFind: string;
  sheetReplaceWith: string;
  sheetFindNext: string;
  sheetFindPrevious: string;
  sheetReplace: string;
  sheetReplaceAll: string;
  sheetMatchCase: string;
  /** `current` of `total` matches */
  sheetFindCount: (current: number, total: number) => string;
  sheetFindNone: string;
  sheetReplaced: (count: number) => string;
  workbookLabel: string;
  /** Name of a new sheet — numbered: Sheet1, Sheet2 … */
  workbookSheetName: string;
  workbookAdd: string;
  workbookRename: string;
  workbookRenameHint: string;
  workbookDuplicate: string;
  workbookDelete: string;

  // ─── Macros (the grid's `allowMacros` / `macros` inputs) ───
  macrosButton: string;
  macroRun: string;
  macroEdit: string;
  macroDelete: string;
  macroPin: string;
  macroNew: string;
  macroRecord: string;
  macroStopRecording: string;
  macroRecording: string;
  macroNoMacros: string;
  macroDialogNew: string;
  macroDialogEdit: string;
  macroName: string;
  macroDefaultName: string;
  macroScript: string;
  macroHelp: string;
  macroSave: string;
  macroTryRun: string;
  /** A script problem — `line` is 1-based */
  macroLineError: (line: number, message: string) => string;
  macroDone: (name: string) => string;
  macroFailed: (name: string, problems: number) => string;
  macroUnknownColumn: (name: string) => string;
  macroUnknownView: (name: string) => string;
  macroUnknownCommand: (name: string) => string;
  macroReadOnlyColumn: (name: string) => string;
  macroRowsUpdated: (count: number) => string;
}

export const weGridLocaleEn: WeGridLocale = {
  intlLocale: 'en-US',

  emptyMessage: 'No records found',
  columnsButton: 'Columns',
  filterRowButton: 'Filter row',
  groupingLabel: 'Grouped by:',
  clearGroupingAria: 'Remove grouping',
  filterAriaLabel: 'Filter',
  clearAllFilters: 'Clear all',
  onlyThisPageSearched: 'Only this page is searched',
  onlyThisPageSorted: 'Only this page was sorted',
  noRecordsMatchFilter: 'No records match the filter',
  clearFilters: 'Clear filters',
  paginationAriaLabel: 'Pagination',
  firstPage: 'First page',
  previousPage: 'Previous page',
  nextPage: 'Next page',
  lastPage: 'Last page',
  pageAriaLabel: (page) => `Page ${page}`,
  recordsLabel: 'records',
  pageOf: (page, totalPages) => `Page ${page} / ${totalPages}`,
  emptyGroupValue: '(Empty)',

  exportButton: 'Export',
  exportCsv: 'CSV',
  exportExcel: 'Excel (.xlsx)',
  exportPdf: 'PDF',
  exportAllRows: 'All rows',
  exportSelectedRows: 'Selected rows',
  importButton: 'Import',
  importCsv: 'CSV',
  importExcel: 'Excel (.xlsx)',
  importSucceeded: (rowCount) => `${rowCount} rows read`,
  importFailed: 'The file could not be read',
  importUnmappedColumns: 'Unmatched columns:',
  refreshButton: 'Refresh',

  actionsColumn: 'Actions',
  addRow: 'Add row',
  editRow: 'Edit',
  deleteRow: 'Delete',
  saveRow: 'Save',
  cancelEdit: 'Cancel',
  savingRow: 'Saving…',
  confirmDeleteRow: 'Delete this row?',
  requiredField: 'This field is required',
  saveFailed: 'The change could not be saved',

  hideColumn: 'Hide column',
  columns: 'Columns',
  showAllColumns: 'Show all columns',
  groupByThisField: 'Group by this field',
  removeGrouping: 'Remove grouping',
  filterByThisValue: 'Filter by this value',
  rename: 'Rename',
  wrapText: 'Wrap text',
  autofitWidth: 'Fit width to content',
  autofitAllColumns: 'Fit all columns to content',
  pin: 'Pin',
  pinLeft: 'Pin left',
  pinRight: 'Pin right',
  unpin: 'Unpin',
  sortAscending: 'Sort ascending',
  sortDescending: 'Sort descending',
  clearSort: 'Clear sort',
  summary: 'Summary',
  sum: 'Sum',
  average: 'Average',
  min: 'Min',
  max: 'Max',
  count: 'Count',
  none: 'None',
  summaryGrand: (functionLabel) => `Grand ${functionLabel.toLowerCase()}`,
  summaryPage: (functionLabel) => `Page ${functionLabel.toLowerCase()}`,
  density: 'Density',
  comfortable: 'Comfortable',
  normal: 'Normal',
  compact: 'Compact',
  resetLayout: 'Reset layout',

  clear: 'Clear',
  apply: 'Apply',
  all: 'All',
  yes: 'Yes',
  no: 'No',
  contains: 'Contains',
  startsWith: 'Starts with',
  equals: 'Equals',
  before: 'Before',
  after: 'After',
  between: 'Between',
  value: 'Value',
  close: 'Close',

  filterSearchPlaceholder: 'Search',
  selectAll: 'Select all',
  noMatchingValues: 'No matching values',
  cancel: 'Cancel',
  checklistValuesLoading: 'Loading values…',
  checklistValuesError: 'The values could not be loaded',
  checklistValuesTruncated: (limit) => `Showing the first ${limit} values — narrow your search`,
  retry: 'Retry',
  formEditTitle: 'Edit record',
  formCreateTitle: 'New record',
  pasteApplied: (cellCount) => `${cellCount} cells pasted`,
  pasteRowsDropped: (rowCount) => `${rowCount} rows didn't fit below the last row`,
  pasteInvalidCells: 'Not pasted:',
  viewsButton: 'Views',
  viewNamePlaceholder: 'View name',
  saveView: 'Save current view',
  deleteView: 'Delete view',
  shareView: 'Copy link to view',
  noSavedViews: 'No saved views yet',
  viewLinkCopied: 'Link copied',
  viewLinkCopyFailed: 'Copy this link:',
  headerHintAria: 'About this column',
  columnMoved: (title, position) => `${title} moved to position ${position}`,
  columnResizeAria: (title) => `Resize column ${title}`,
  moveColumnLeft: 'Move left',
  moveColumnRight: 'Move right',
  treeExpandRow: (label) => `Expand ${label}`,
  treeCollapseRow: (label) => `Collapse ${label}`,
  treeExpandAll: 'Expand all',
  treeCollapseAll: 'Collapse all',
  treeRowsShown: (count) => `${count} rows shown`,
  detailRegionLabel: (label) => `Details of ${label}`,
  addToGrouping: 'Add to grouping',
  removeFromGrouping: 'Remove from grouping',
  expandAllGroups: 'Expand all groups',
  collapseAllGroups: 'Collapse all groups',
  formatColumn: 'Format…',
  formatPanelTitle: (header) => `Format “${header}”`,
  stripedRows: 'Zebra rows',
  formatCellStyle: 'Cell style',
  formatBold: 'Bold',
  formatItalic: 'Italic',
  formatUnderline: 'Underline',
  formatStrike: 'Strikethrough',
  formatFlagGlyphs: { bold: 'B', italic: 'I', underline: 'U', strike: 'S' },
  formatTextColor: 'Text colour',
  formatFill: 'Fill',
  formatNoColor: 'None',
  formatColorNames: { red: 'Red', orange: 'Orange', yellow: 'Yellow', green: 'Green', teal: 'Teal', blue: 'Blue', purple: 'Purple', pink: 'Pink', gray: 'Grey' },
  formatRules: 'Conditional formatting',
  formatNoRules: 'No rules yet — add one to highlight values automatically.',
  formatAddRule: 'Add rule',
  formatRuleType: 'Rule',
  formatTypeCondition: 'Highlight cells',
  formatTypeColorScale: 'Colour scale',
  formatTypeDataBar: 'Data bar',
  formatTypeIconSet: 'Icon set',
  formatIconSetLabels: { arrows: 'Arrows', dots: 'Traffic lights' },
  formatIconSetReverse: 'Low values are good',
  formatOperatorLabels: {
    gt: 'Greater than',
    gte: 'Greater than or equal to',
    lt: 'Less than',
    lte: 'Less than or equal to',
    eq: 'Equal to',
    neq: 'Not equal to',
    between: 'Between',
    notBetween: 'Not between',
    contains: 'Text contains',
    notContains: 'Text does not contain',
    startsWith: 'Text starts with',
    endsWith: 'Text ends with',
    empty: 'Is empty',
    notEmpty: 'Is not empty',
    top: 'Top',
    bottom: 'Bottom',
    aboveAverage: 'Above average',
    belowAverage: 'Below average',
    duplicate: 'Duplicate values',
    unique: 'Unique values',
    formula: 'Formula is true'
  },
  formatValue: 'Value',
  formatValueAnd: 'and',
  formatTopCount: 'items',
  formatFormulaHint: 'For example =[Amount] > [Limit]',
  formatStyle: 'Style',
  formatPresetLabels: {
    redFill: 'Light red fill with dark red text',
    yellowFill: 'Yellow fill with dark yellow text',
    greenFill: 'Green fill with dark green text',
    blueFill: 'Blue fill with dark blue text',
    redText: 'Red text',
    bold: 'Bold text'
  },
  formatScaleLabels: {
    redGreen: 'Red to green',
    greenRed: 'Green to red',
    redYellowGreen: 'Red, yellow, green',
    grayBlue: 'Grey to blue'
  },
  formatApplyToRow: 'Apply to the entire row',
  formatBarColor: 'Bar colour',
  formatDeleteRule: 'Delete rule',
  formatRaisePriority: 'Move up (higher priority)',
  formatClearRules: 'Clear all rules',
  addFormulaColumn: 'Add formula column…',
  editFormulaColumn: 'Edit formula…',
  deleteFormulaColumn: 'Delete column',
  formulaDialogNew: 'New formula column',
  formulaDialogEdit: 'Edit formula column',
  formulaColumnName: 'Column name',
  formulaDefaultName: 'Calculation',
  formulaLabel: 'Formula',
  formulaPlaceholder: '=[Price] * [Quantity]',
  formulaResultType: 'Result type',
  formulaTypeLabels: { text: 'Text', number: 'Number', integer: 'Whole number', currency: 'Currency', percent: 'Percent', date: 'Date', boolean: 'Yes / No' },
  formulaInsertColumn: 'Insert a column',
  formulaInsertFunction: 'Insert a function',
  formulaPreview: 'Result on the first row',
  formulaSyntaxError: (position) => `The formula cannot be read at character ${position}`,
  formulaSave: 'Save column',
  sheetLabel: 'Spreadsheet',
  sheetToolbar: 'Spreadsheet tools',
  sheetNameBox: 'Cell address',
  sheetFormulaBar: 'Cell contents',
  sheetUndo: 'Undo',
  sheetRedo: 'Redo',
  sheetAlignStart: 'Align left',
  sheetAlignCenter: 'Centre',
  sheetAlignEnd: 'Align right',
  sheetNumberFormat: 'Number format',
  sheetFormatLabels: { general: 'General', number: 'Number', integer: 'Whole number', currency: 'Currency', percent: 'Percent', date: 'Date', text: 'Text' },
  sheetSortAsc: 'Sort A → Z',
  sheetSortDesc: 'Sort Z → A',
  sheetFillDown: 'Fill down',
  sheetClearFormat: 'Clear formatting',
  sheetHeaderRow: 'Header row',
  sheetAddRow: 'Add row',
  sheetAddColumn: 'Add column',
  sheetSelectAll: 'Select all',
  sheetCellLabel: (address, text) => (text ? `${address}, ${text}` : `${address}, empty`),
  sheetInsertRowAbove: 'Insert row above',
  sheetInsertRowBelow: 'Insert row below',
  sheetDeleteRows: 'Delete rows',
  sheetInsertColumnLeft: 'Insert column left',
  sheetInsertColumnRight: 'Insert column right',
  sheetDeleteColumns: 'Delete columns',
  sheetClearContents: 'Clear contents',
  sheetAutoSum: 'AutoSum',
  sheetImport: 'Open Excel or CSV',
  sheetImportFailed: 'The file could not be read',
  sheetImportTruncated: 'The file is larger than a sheet holds — only what fits was imported',
  sheetFull: 'The sheet is full — clear its last rows or columns first',
  sheetFreezeColumn: 'Freeze first column',
  sheetSuggestions: 'Functions',
  sheetOptions: 'Table options',
  pivotLabel: 'Pivot table',
  pivotRows: 'Rows',
  pivotColumns: 'Columns',
  pivotValues: 'Values',
  pivotAddField: 'Add…',
  pivotRemove: (field) => `Remove ${field}`,
  pivotAggregate: 'Summarise by',
  pivotTotal: 'Total',
  pivotTruncated: 'Only the first columns are shown — use fewer column fields.',
  pivotSwap: 'Swap rows and columns',
  chartLabel: 'Chart',
  chartShowTable: 'Show as table',
  chartShowChart: 'Show chart',
  chartNoData: 'Nothing to chart yet',
  chartOther: 'Other',
  chartLegend: 'Legend',
  chartTypeLabels: { column: 'Column', bar: 'Bar', line: 'Line', area: 'Area', pie: 'Pie', donut: 'Donut' },
  chartStacked: 'Stacked',
  chartInsert: 'Chart',
  chartRemove: 'Remove chart',
  searchPlaceholder: 'Search',
  searchClear: 'Clear search',
  formatNumber: 'Number',
  formatDecimals: 'Decimal places',
  formatDecimalsMore: 'More decimal places',
  formatDecimalsFewer: 'Fewer decimal places',
  formatDecimalsAuto: 'Automatic',
  sheetFind: 'Find',
  sheetReplaceWith: 'Replace with',
  sheetFindNext: 'Next',
  sheetFindPrevious: 'Previous',
  sheetReplace: 'Replace',
  sheetReplaceAll: 'Replace all',
  sheetMatchCase: 'Match case',
  sheetFindCount: (current, total) => `${current} of ${total}`,
  sheetFindNone: 'No matches',
  sheetReplaced: (count) => `${count} ${count === 1 ? 'cell' : 'cells'} replaced`,
  workbookLabel: 'Workbook',
  workbookSheetName: 'Sheet',
  workbookAdd: 'Add sheet',
  workbookRename: 'Rename sheet',
  workbookRenameHint: 'Double-click to rename',
  workbookDuplicate: 'Duplicate sheet',
  workbookDelete: 'Delete sheet',
  macrosButton: 'Macros',
  macroRun: 'Run',
  macroEdit: 'Edit',
  macroDelete: 'Delete',
  macroPin: 'Show on the toolbar',
  macroNew: 'New macro',
  macroRecord: 'Record',
  macroStopRecording: 'Stop recording',
  macroRecording: 'Recording — use the grid, then stop',
  macroNoMacros: 'No macros yet. Record one, or write a script.',
  macroDialogNew: 'New macro',
  macroDialogEdit: 'Edit macro',
  macroName: 'Name',
  macroDefaultName: 'My macro',
  macroScript: 'Steps',
  macroHelp: 'Steps you can use',
  macroSave: 'Save macro',
  macroTryRun: 'Run now',
  macroLineError: (line, message) => `Line ${line}: ${message}`,
  macroDone: (name) => `“${name}” ran`,
  macroFailed: (name, problems) => `“${name}” ran with ${problems} ${problems === 1 ? 'problem' : 'problems'}`,
  macroUnknownColumn: (name) => `there is no column called ${name}`,
  macroUnknownView: (name) => `there is no view called ${name}`,
  macroUnknownCommand: (name) => `there is no command called ${name}`,
  macroReadOnlyColumn: (name) => `${name} cannot be changed`,
  macroRowsUpdated: (count) => `${count} ${count === 1 ? 'row' : 'rows'} updated`
};

/**
 * "Sayfa" forms a possessive compound with the function name ("sayfanın toplamı" → "Sayfa toplamı"),
 * and the suffix depends on how the word ends — a plain prefix would read "Sayfa toplam". Keyed by
 * the lowercased labels `weGridLocaleTr` ships; a relabelled function falls back to the plain word.
 */
const TR_PAGE_SUMMARY_WORDS: Record<string, string> = {
  toplam: 'toplamı',
  ortalama: 'ortalaması',
  min: 'min',
  maks: 'maks',
  sayım: 'sayımı'
};

export const weGridLocaleTr: WeGridLocale = {
  intlLocale: 'tr-TR',
  intlCurrency: 'TRY',

  emptyMessage: 'Kayıt bulunamadı',
  columnsButton: 'Kolonlar',
  filterRowButton: 'Filtre Satırı',
  groupingLabel: 'Gruplama:',
  clearGroupingAria: 'Gruplamayı kaldır',
  filterAriaLabel: 'Filtrele',
  clearAllFilters: 'Tümünü Temizle',
  onlyThisPageSearched: 'Yalnızca bu sayfada aranıyor',
  onlyThisPageSorted: 'Yalnızca bu sayfa sıralandı',
  noRecordsMatchFilter: 'Filtreye uyan kayıt yok',
  clearFilters: 'Filtreleri temizle',
  paginationAriaLabel: 'Sayfalama',
  firstPage: 'İlk sayfa',
  previousPage: 'Önceki sayfa',
  nextPage: 'Sonraki sayfa',
  lastPage: 'Son sayfa',
  pageAriaLabel: (page) => `Sayfa ${page}`,
  recordsLabel: 'kayıt',
  pageOf: (page, totalPages) => `Sayfa ${page} / ${totalPages}`,
  emptyGroupValue: '(Boş)',

  exportButton: 'Dışa Aktar',
  exportCsv: 'CSV',
  exportExcel: 'Excel (.xlsx)',
  exportPdf: 'PDF',
  exportAllRows: 'Tüm satırlar',
  exportSelectedRows: 'Seçili satırlar',
  importButton: 'İçe Aktar',
  importCsv: 'CSV',
  importExcel: 'Excel (.xlsx)',
  importSucceeded: (rowCount) => `${rowCount} satır okundu`,
  importFailed: 'Dosya okunamadı',
  importUnmappedColumns: 'Eşleşmeyen kolonlar:',
  refreshButton: 'Yenile',

  actionsColumn: 'İşlemler',
  addRow: 'Satır Ekle',
  editRow: 'Düzenle',
  deleteRow: 'Sil',
  saveRow: 'Kaydet',
  cancelEdit: 'İptal',
  savingRow: 'Kaydediliyor…',
  confirmDeleteRow: 'Bu satır silinsin mi?',
  requiredField: 'Bu alan zorunlu',
  saveFailed: 'Değişiklik kaydedilemedi',

  hideColumn: 'Kolonu Gizle',
  columns: 'Kolonlar',
  showAllColumns: 'Tüm Kolonları Göster',
  groupByThisField: 'Bu Alana Göre Grupla',
  removeGrouping: 'Gruplamayı Kaldır',
  filterByThisValue: 'Bu Değere Göre Filtrele',
  rename: 'Yeniden Adlandır',
  wrapText: 'Kelime Kaydır',
  autofitWidth: 'Genişliği İçeriğe Sığdır',
  autofitAllColumns: 'Tüm Kolonları İçeriğe Sığdır',
  pin: 'Sabitle',
  pinLeft: 'Sola Sabitle',
  pinRight: 'Sağa Sabitle',
  unpin: 'Sabitlemeyi Kaldır',
  sortAscending: 'Artan Sırala',
  sortDescending: 'Azalan Sırala',
  clearSort: 'Sıralamayı Temizle',
  summary: 'Alt Toplam',
  sum: 'Toplam',
  average: 'Ortalama',
  min: 'Min',
  max: 'Maks',
  count: 'Sayım',
  none: 'Yok',
  // "Genel" doesn't inflect the word after it: "Genel toplam", "Genel ortalama", "Genel sayım".
  summaryGrand: (functionLabel) => `Genel ${functionLabel.toLocaleLowerCase('tr-TR')}`,
  summaryPage: (functionLabel) => {
    const word = functionLabel.toLocaleLowerCase('tr-TR');
    return `Sayfa ${TR_PAGE_SUMMARY_WORDS[word] ?? word}`;
  },
  density: 'Yoğunluk',
  comfortable: 'Rahat',
  normal: 'Normal',
  compact: 'Sıkışık',
  resetLayout: 'Düzeni Sıfırla',

  clear: 'Temizle',
  apply: 'Uygula',
  all: 'Hepsi',
  yes: 'Evet',
  no: 'Hayır',
  contains: 'İçerir',
  startsWith: 'İle Başlar',
  equals: 'Eşittir',
  before: 'Öncesi',
  after: 'Sonrası',
  between: 'Aralık',
  value: 'Değer',
  close: 'Kapat',

  filterSearchPlaceholder: 'Ara',
  selectAll: 'Tümünü Seç',
  noMatchingValues: 'Eşleşen değer yok',
  cancel: 'İptal',
  checklistValuesLoading: 'Değerler yükleniyor…',
  checklistValuesError: 'Değerler yüklenemedi',
  checklistValuesTruncated: (limit) => `İlk ${limit} değer gösteriliyor — aramayı daraltın`,
  retry: 'Tekrar dene',
  formEditTitle: 'Kaydı Düzenle',
  formCreateTitle: 'Yeni Kayıt',
  pasteApplied: (cellCount) => `${cellCount} hücre yapıştırıldı`,
  pasteRowsDropped: (rowCount) => `${rowCount} satır son satırın altına sığmadı`,
  pasteInvalidCells: 'Yapıştırılamayanlar:',
  viewsButton: 'Görünümler',
  viewNamePlaceholder: 'Görünüm adı',
  saveView: 'Mevcut görünümü kaydet',
  deleteView: 'Görünümü sil',
  shareView: 'Görünüm bağlantısını kopyala',
  noSavedViews: 'Henüz kayıtlı görünüm yok',
  viewLinkCopied: 'Bağlantı kopyalandı',
  viewLinkCopyFailed: 'Bu bağlantıyı kopyalayın:',
  headerHintAria: 'Kolon hakkında',
  columnMoved: (title, position) => `${title} ${position}. sıraya taşındı`,
  columnResizeAria: (title) => `${title} kolonunu yeniden boyutlandır`,
  moveColumnLeft: 'Sola Taşı',
  moveColumnRight: 'Sağa Taşı',
  treeExpandRow: (label) => `${label} satırını aç`,
  treeCollapseRow: (label) => `${label} satırını kapat`,
  treeExpandAll: 'Tümünü Aç',
  treeCollapseAll: 'Tümünü Kapat',
  treeRowsShown: (count) => `${count} satır gösteriliyor`,
  detailRegionLabel: (label) => `${label} ayrıntıları`,
  addToGrouping: 'Gruplamaya Ekle',
  removeFromGrouping: 'Gruplamadan Çıkar',
  expandAllGroups: 'Tüm Grupları Aç',
  collapseAllGroups: 'Tüm Grupları Kapat',
  formatColumn: 'Biçimlendir…',
  formatPanelTitle: (header) => `“${header}” Biçimi`,
  stripedRows: 'Zebra Satırlar',
  formatCellStyle: 'Hücre stili',
  formatBold: 'Kalın',
  formatItalic: 'İtalik',
  formatUnderline: 'Altı çizili',
  formatStrike: 'Üstü çizili',
  formatFlagGlyphs: { bold: 'K', italic: 'T', underline: 'A', strike: 'Ü' },
  formatTextColor: 'Metin rengi',
  formatFill: 'Dolgu',
  formatNoColor: 'Yok',
  formatColorNames: { red: 'Kırmızı', orange: 'Turuncu', yellow: 'Sarı', green: 'Yeşil', teal: 'Camgöbeği', blue: 'Mavi', purple: 'Mor', pink: 'Pembe', gray: 'Gri' },
  formatRules: 'Koşullu biçimlendirme',
  formatNoRules: 'Henüz kural yok — değerleri otomatik vurgulamak için bir kural ekleyin.',
  formatAddRule: 'Kural ekle',
  formatRuleType: 'Kural',
  formatTypeCondition: 'Hücreleri vurgula',
  formatTypeColorScale: 'Renk skalası',
  formatTypeDataBar: 'Veri çubuğu',
  formatTypeIconSet: 'Simge kümesi',
  formatIconSetLabels: { arrows: 'Oklar', dots: 'Trafik ışıkları' },
  formatIconSetReverse: 'Düşük değerler iyi',
  formatOperatorLabels: {
    gt: 'Büyüktür',
    gte: 'Büyük veya eşittir',
    lt: 'Küçüktür',
    lte: 'Küçük veya eşittir',
    eq: 'Eşittir',
    neq: 'Eşit değildir',
    between: 'Arasında',
    notBetween: 'Arasında değil',
    contains: 'Metin içerir',
    notContains: 'Metin içermez',
    startsWith: 'Metin ile başlar',
    endsWith: 'Metin ile biter',
    empty: 'Boş',
    notEmpty: 'Boş değil',
    top: 'En büyük',
    bottom: 'En küçük',
    aboveAverage: 'Ortalamanın üstünde',
    belowAverage: 'Ortalamanın altında',
    duplicate: 'Yinelenen değerler',
    unique: 'Benzersiz değerler',
    formula: 'Formül doğruysa'
  },
  formatValue: 'Değer',
  formatValueAnd: 've',
  formatTopCount: 'öğe',
  formatFormulaHint: 'Örneğin =[Tutar] > [Limit]',
  formatStyle: 'Stil',
  formatPresetLabels: {
    redFill: 'Açık kırmızı dolgu, koyu kırmızı metin',
    yellowFill: 'Sarı dolgu, koyu sarı metin',
    greenFill: 'Yeşil dolgu, koyu yeşil metin',
    blueFill: 'Mavi dolgu, koyu mavi metin',
    redText: 'Kırmızı metin',
    bold: 'Kalın metin'
  },
  formatScaleLabels: {
    redGreen: 'Kırmızıdan yeşile',
    greenRed: 'Yeşilden kırmızıya',
    redYellowGreen: 'Kırmızı, sarı, yeşil',
    grayBlue: 'Griden maviye'
  },
  formatApplyToRow: 'Tüm satıra uygula',
  formatBarColor: 'Çubuk rengi',
  formatDeleteRule: 'Kuralı sil',
  formatRaisePriority: 'Yukarı taşı (öncelik)',
  formatClearRules: 'Tüm kuralları temizle',
  addFormulaColumn: 'Formül Kolonu Ekle…',
  editFormulaColumn: 'Formülü Düzenle…',
  deleteFormulaColumn: 'Kolonu Sil',
  formulaDialogNew: 'Yeni formül kolonu',
  formulaDialogEdit: 'Formül kolonunu düzenle',
  formulaColumnName: 'Kolon adı',
  formulaDefaultName: 'Hesaplama',
  formulaLabel: 'Formül',
  formulaPlaceholder: '=[Fiyat] * [Adet]',
  formulaResultType: 'Sonuç türü',
  formulaTypeLabels: { text: 'Metin', number: 'Sayı', integer: 'Tam sayı', currency: 'Para', percent: 'Yüzde', date: 'Tarih', boolean: 'Evet / Hayır' },
  formulaInsertColumn: 'Kolon ekle',
  formulaInsertFunction: 'Fonksiyon ekle',
  formulaPreview: 'İlk satırdaki sonuç',
  formulaSyntaxError: (position) => `Formül ${position}. karakterde okunamıyor`,
  formulaSave: 'Kolonu kaydet',
  sheetLabel: 'Tablo',
  sheetToolbar: 'Tablo araçları',
  sheetNameBox: 'Hücre adresi',
  sheetFormulaBar: 'Hücre içeriği',
  sheetUndo: 'Geri al',
  sheetRedo: 'Yinele',
  sheetAlignStart: 'Sola hizala',
  sheetAlignCenter: 'Ortala',
  sheetAlignEnd: 'Sağa hizala',
  sheetNumberFormat: 'Sayı biçimi',
  sheetFormatLabels: { general: 'Genel', number: 'Sayı', integer: 'Tam sayı', currency: 'Para', percent: 'Yüzde', date: 'Tarih', text: 'Metin' },
  sheetSortAsc: 'A → Z sırala',
  sheetSortDesc: 'Z → A sırala',
  sheetFillDown: 'Aşağı doldur',
  sheetClearFormat: 'Biçimi temizle',
  sheetHeaderRow: 'Başlık satırı',
  sheetAddRow: 'Satır ekle',
  sheetAddColumn: 'Kolon ekle',
  sheetSelectAll: 'Tümünü seç',
  sheetCellLabel: (address, text) => (text ? `${address}, ${text}` : `${address}, boş`),
  sheetInsertRowAbove: 'Üste satır ekle',
  sheetInsertRowBelow: 'Alta satır ekle',
  sheetDeleteRows: 'Satırları sil',
  sheetInsertColumnLeft: 'Sola kolon ekle',
  sheetInsertColumnRight: 'Sağa kolon ekle',
  sheetDeleteColumns: 'Kolonları sil',
  sheetClearContents: 'İçeriği temizle',
  sheetAutoSum: 'Otomatik Toplam',
  sheetImport: 'Excel ya da CSV aç',
  sheetImportFailed: 'Dosya okunamadı',
  sheetImportTruncated: 'Dosya bir sayfaya sığmayacak kadar büyük — yalnızca sığan kısmı alındı',
  sheetFull: 'Sayfa dolu — önce son satırları veya sütunları boşaltın',
  sheetFreezeColumn: 'İlk kolonu dondur',
  sheetSuggestions: 'Fonksiyonlar',
  sheetOptions: 'Tablo seçenekleri',
  pivotLabel: 'Pivot tablo',
  pivotRows: 'Satırlar',
  pivotColumns: 'Kolonlar',
  pivotValues: 'Değerler',
  pivotAddField: 'Ekle…',
  pivotRemove: (field) => `${field} alanını kaldır`,
  pivotAggregate: 'Özetleme',
  pivotTotal: 'Toplam',
  pivotTruncated: 'Yalnızca ilk kolonlar gösteriliyor — daha az kolon alanı kullanın.',
  pivotSwap: 'Satırlarla kolonları değiştir',
  chartLabel: 'Grafik',
  chartShowTable: 'Tablo olarak göster',
  chartShowChart: 'Grafiği göster',
  chartNoData: 'Henüz gösterilecek veri yok',
  chartOther: 'Diğer',
  chartLegend: 'Açıklama',
  chartTypeLabels: { column: 'Sütun', bar: 'Çubuk', line: 'Çizgi', area: 'Alan', pie: 'Pasta', donut: 'Halka' },
  chartStacked: 'Yığılmış',
  chartInsert: 'Grafik',
  chartRemove: 'Grafiği kaldır',
  searchPlaceholder: 'Ara',
  searchClear: 'Aramayı temizle',
  formatNumber: 'Sayı',
  formatDecimals: 'Ondalık basamak',
  formatDecimalsMore: 'Ondalık artır',
  formatDecimalsFewer: 'Ondalık azalt',
  formatDecimalsAuto: 'Otomatik',
  sheetFind: 'Bul',
  sheetReplaceWith: 'Yeni değer',
  sheetFindNext: 'Sonraki',
  sheetFindPrevious: 'Önceki',
  sheetReplace: 'Değiştir',
  sheetReplaceAll: 'Tümünü değiştir',
  sheetMatchCase: 'Büyük/küçük harf duyarlı',
  sheetFindCount: (current, total) => `${current} / ${total}`,
  sheetFindNone: 'Eşleşme yok',
  sheetReplaced: (count) => `${count} hücre değiştirildi`,
  workbookLabel: 'Çalışma kitabı',
  workbookSheetName: 'Sayfa',
  workbookAdd: 'Sayfa ekle',
  workbookRename: 'Sayfayı yeniden adlandır',
  workbookRenameHint: 'Yeniden adlandırmak için çift tıklayın',
  workbookDuplicate: 'Sayfayı çoğalt',
  workbookDelete: 'Sayfayı sil',
  macrosButton: 'Makrolar',
  macroRun: 'Çalıştır',
  macroEdit: 'Düzenle',
  macroDelete: 'Sil',
  macroPin: 'Araç çubuğunda göster',
  macroNew: 'Yeni makro',
  macroRecord: 'Kaydet',
  macroStopRecording: 'Kaydı durdur',
  macroRecording: 'Kaydediliyor — tabloyu kullanın, sonra durdurun',
  macroNoMacros: 'Henüz makro yok. Bir tane kaydedin ya da betik yazın.',
  macroDialogNew: 'Yeni makro',
  macroDialogEdit: 'Makroyu düzenle',
  macroName: 'Ad',
  macroDefaultName: 'Makrom',
  macroScript: 'Adımlar',
  macroHelp: 'Kullanabileceğiniz adımlar',
  macroSave: 'Makroyu kaydet',
  macroTryRun: 'Şimdi çalıştır',
  macroLineError: (line, message) => `Satır ${line}: ${message}`,
  macroDone: (name) => `“${name}” çalıştı`,
  macroFailed: (name, problems) => `“${name}” ${problems} sorunla çalıştı`,
  macroUnknownColumn: (name) => `${name} adında bir kolon yok`,
  macroUnknownView: (name) => `${name} adında bir görünüm yok`,
  macroUnknownCommand: (name) => `${name} adında bir komut yok`,
  macroReadOnlyColumn: (name) => `${name} değiştirilemez`,
  macroRowsUpdated: (count) => `${count} satır güncellendi`
};

/**
 * DI token consumers use to translate the grid. Falls back to English (`weGridLocaleEn`) when not
 * provided by the host application — provide it at the app or route level with your own
 * `WeGridLocale`, or with the exported `weGridLocaleTr` for Turkish.
 */
export const WE_GRID_LOCALE = new InjectionToken<WeGridLocale>('WE_GRID_LOCALE', {
  providedIn: 'root',
  factory: () => weGridLocaleEn
});
