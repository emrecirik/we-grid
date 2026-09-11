# Changelog

All notable changes to this project are documented in this file.

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
