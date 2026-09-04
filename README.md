# @we-grid/angular

[Türkçe](README.tr.md)

A themeable Angular data grid with no styling framework dependency (no Bootstrap/Material
required) — built as a set of standalone components/directives on top of Angular CDK.

<!-- screenshot placeholder -->

## Features

- Column hide/show, rename, drag-to-reorder, resize, pin (left/right), autofit-to-content
- Density modes (comfortable / normal / compact)
- Per-user layout persisted automatically (localStorage by default, pluggable backend store)
- Filter row + a per-column filter popover, with active-filter chips
- Single-level grouping with collapsible sections and per-group summaries
- Subtotal (summary) row: sum / average / min / max / count, per column
- Master-detail row expansion via a `weGridRowDetail` template
- Server-side pagination, sorting, and filtering (opt-in, auto-detected from your event bindings)
- Fully localizable UI text (`WE_GRID_LOCALE`) and swappable icon set (`WE_GRID_ICONS`, inline
  SVG — no icon font dependency)
- Theming via plain CSS custom properties (`--we-grid-*`), light/dark out of the box

## Installation

```bash
npm install @we-grid/angular @angular/cdk
```

> **Note:** `@we-grid/angular` is a new package name — verify its availability on npm before
> publishing (`npm view @we-grid/angular`), or adjust the scope/name to one you own.

Peer dependencies: `@angular/core`, `@angular/common`, `@angular/forms`, `@angular/cdk` (Angular 18.x).

Add the CDK overlay stylesheet (used for the header/filter context menus) to your app's global
styles, and optionally the bundled default theme:

```json
// angular.json
"styles": [
  "node_modules/@angular/cdk/overlay-prebuilt.css",
  "node_modules/@we-grid/angular/styles/we-grid-theme.scss",
  "src/styles.scss"
]
```

## Quick start

```ts
import { Component } from '@angular/core';
import { WeGridComponent, WeGridColumnDef } from '@we-grid/angular';

interface Product {
  id: number;
  code: string;
  name: string;
  price: number;
}

@Component({
  standalone: true,
  imports: [WeGridComponent],
  template: `
    <we-grid gridKey="products" [columns]="columns" [data]="products" trackByField="id"></we-grid>
  `
})
export class ProductListComponent {
  columns: WeGridColumnDef<Product>[] = [
    { field: 'code', header: 'Code', width: 120 },
    { field: 'name', header: 'Name', width: 220 },
    { field: 'price', header: 'Price', type: 'currency', width: 130, summary: 'sum' }
  ];
  products: Product[] = [/* ... */];
}
```

`gridKey` is required — the user's column layout is persisted under this key, so keep it unique
per grid instance.

## Examples

Three full sample applications live in [`SampleUsageProjects/`](SampleUsageProjects/README.md), each
registered in this workspace and runnable with the Angular CLI:

| App | Shows |
|---|---|
| [`banking`](SampleUsageProjects/banking) | Currency columns with mixed per-row currencies, a pinned column, date-range filtering, backend-supplied totals, master-detail rows |
| [`retail-market`](SampleUsageProjects/retail-market) | Grouping with subtotals, boolean column + filter, `rowClass` highlighting, multi-select with bulk actions, density switching |
| [`ecommerce-dashboard`](SampleUsageProjects/ecommerce-dashboard) | The server-side reference example: paging/sorting/filtering against a mock backend, KPI cards, `displayValue` status badges, a custom layout store, XML data source |

```bash
npx ng build we-grid              # build the library first
npx ng serve ecommerce-dashboard  # then any sample app
```

## Documentation

- [Getting started](docs/getting-started.md)
- [API reference](docs/api.md)
- [Server-side pagination/sorting/filtering](docs/server-side.md)
- [Theming](docs/theming.md)
- [Localization](docs/localization.md)
- [React support (there is none)](docs/react.md)

## Development

This repo is an Angular CLI workspace with the library at `projects/we-grid` and a demo app at
`projects/playground`.

```bash
npm install
npx ng build we-grid              # build the library (dist/we-grid)
npx ng test we-grid --watch=false --browsers=ChromeHeadless
npx ng serve playground           # run the demo app
```

## License

MIT — see [LICENSE](LICENSE).
