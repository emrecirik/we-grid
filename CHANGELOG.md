# Changelog

All notable changes to this project are documented in this file.

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
