# we-grid-angular

A themeable Angular data grid with no styling-framework dependency — no Bootstrap, no Material,
no icon font. Standalone components and directives on top of Angular CDK.

```bash
npm install we-grid-angular @angular/cdk
```

```ts
import { WeGridComponent, WeGridColumnDef } from 'we-grid-angular';

@Component({
  standalone: true,
  imports: [WeGridComponent],
  template: `<we-grid gridKey="products" [columns]="columns" [data]="products" trackByField="id" />`
})
export class ProductListComponent {
  columns: WeGridColumnDef<Product>[] = [
    { field: 'code', header: 'Code', width: 120 },
    { field: 'name', header: 'Name', width: 220 },
    { field: 'price', header: 'Price', type: 'currency', width: 130, summary: 'sum' }
  ];
}
```

Add the CDK overlay stylesheet (used by the header/filter menus) and, optionally, the bundled
default theme to your global styles:

```json
"styles": [
  "node_modules/@angular/cdk/overlay-prebuilt.css",
  "node_modules/we-grid-angular/styles/we-grid-theme.scss",
  "src/styles.scss"
]
```

![An order operations dashboard built with we-grid](https://raw.githubusercontent.com/emrecirik/we-grid/main/docs/images/ecommerce-dashboard.png)

## What it does

- Column hide/show, rename, drag-to-reorder, resize, pin left/right, autofit-to-content
- Density modes, and a per-user column layout persisted automatically (localStorage by default,
  or your own backend through the `WE_GRID_LAYOUT_STORE` token)
- Filter row, per-column filter popover, active-filter chips
- Excel-style checklist header filter (`headerFilterMode: 'checklist'`) — tick the distinct values
  of the loaded page, or of the whole dataset through `checklistValuesProvider`, and one `'in'`
  filter goes to the backend
- Per-column operator restriction (`filterOperators`)
- Locale-aware number/date formatting, text matching and sorting (`intlLocale` on `WeGridLocale`)
- Single-level grouping with collapsible sections and per-group summaries
- Subtotal row: sum / average / min / max / count, per column
- Master-detail rows via a `weGridRowDetail` template
- Server-side paging, sorting and filtering (opt-in, auto-detected from your event bindings)
- Export to CSV, Excel (`.xlsx`) and PDF, and import from CSV/Excel — no runtime dependency added
- Inline row create/update/delete with a `done` callback per commit, built for a real backend
- Localizable UI text (`WE_GRID_LOCALE`) and swappable inline-SVG icons (`WE_GRID_ICONS`)
- Theming through plain CSS custom properties (`--we-grid-*`), light and dark

![The Status column opened into a checklist of order statuses, two of them ticked](https://raw.githubusercontent.com/emrecirik/we-grid/main/docs/images/checklist-filter.png)

Peer dependencies: `@angular/core`, `@angular/common`, `@angular/forms`,
`@angular/platform-browser`, `@angular/cdk` — Angular **18.2 through 22**, each major verified by CI
against the packed tarball.

## Documentation

Full docs, screenshots and three runnable sample applications live in the repository:
<https://github.com/emrecirik/we-grid>

- [Getting started](https://github.com/emrecirik/we-grid/blob/main/docs/getting-started.md)
- [API reference](https://github.com/emrecirik/we-grid/blob/main/docs/api.md)
- [Server-side paging/sorting/filtering + the checklist header filter](https://github.com/emrecirik/we-grid/blob/main/docs/server-side.md)
- [Export and import (CSV / Excel / PDF)](https://github.com/emrecirik/we-grid/blob/main/docs/export-import.md)
- [Inline row editing](https://github.com/emrecirik/we-grid/blob/main/docs/row-editing.md)
- [Theming](https://github.com/emrecirik/we-grid/blob/main/docs/theming.md)
- [Localization](https://github.com/emrecirik/we-grid/blob/main/docs/localization.md)

A screen gallery of the three sample apps is published at
<https://emrecirik.github.io/we-grid/gallery.html>.

## License

MIT
