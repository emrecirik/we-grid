# Changelog

All notable changes to this project are documented in this file.

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
