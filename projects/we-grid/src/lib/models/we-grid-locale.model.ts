import { InjectionToken } from '@angular/core';

/**
 * All user-facing text used by we-grid. Grouped roughly by which part of the UI they belong to
 * (toolbar/footer, header context menu, filter popover) — provide your own object satisfying this
 * interface to translate the grid, or use one of the ready-made `weGridLocaleEn`/`weGridLocaleTr`
 * exports. See docs/localization.md.
 */
export interface WeGridLocale {
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
}

export const weGridLocaleEn: WeGridLocale = {
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
  close: 'Close'
};

export const weGridLocaleTr: WeGridLocale = {
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
  close: 'Kapat'
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
