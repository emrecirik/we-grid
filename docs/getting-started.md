# Getting started

## 1. Install

```bash
npm install @we-grid/angular @angular/cdk
```

`WeGridComponent`, `WeGridCellDirective`, and `WeGridRowDetailDirective` are all standalone —
import them directly into your standalone component, or into an `NgModule`'s `imports` array (they
are never declared, only imported).

## 2. Add the CDK overlay stylesheet

The header context menu and filter popover are rendered through the Angular CDK Overlay, which
needs its base positioning CSS:

```json
// angular.json
"styles": [
  "node_modules/@angular/cdk/overlay-prebuilt.css",
  "src/styles.scss"
]
```

## 3. (Optional) Add the default theme

`@we-grid/angular` ships a framework-independent default theme built entirely from CSS custom
properties, with light and dark variants:

```json
"styles": [
  "node_modules/@angular/cdk/overlay-prebuilt.css",
  "node_modules/@we-grid/angular/styles/we-grid-theme.scss",
  "src/styles.scss"
]
```

You don't have to use it — the grid falls back to sensible built-in defaults for every
`--we-grid-*` variable even without this file. Use it as a starting point and override the
variables to match your own design system (see [theming.md](theming.md)).

## 4. Define columns and render the grid

```ts
import { WeGridColumnDef } from '@we-grid/angular';

columns: WeGridColumnDef<Product>[] = [
  { field: 'code', header: 'Code', width: 120 },
  { field: 'name', header: 'Name', width: 220 },
  { field: 'price', header: 'Price', type: 'currency', width: 130 }
];
```

```html
<we-grid gridKey="products" [columns]="columns" [data]="products" trackByField="id"></we-grid>
```

`gridKey` is required — it's the storage key for the user's column layout (visibility, order,
width, pin, rename, summary choice). Make it unique per grid instance in your app.

## 5. Custom cell content (`weGridCell`)

```html
<we-grid gridKey="products" [columns]="columns" [data]="products">
  <ng-template weGridCell="price" [weGridCellRowsOf]="products" let-row let-value="value">
    <strong>{{ value | currency }}</strong>
  </ng-template>
</we-grid>
```

The `[weGridCellRowsOf]` binding is never read at runtime — it exists purely so Angular's strict
template type-checker can infer `row`'s real type instead of `unknown` (the same trick `NgFor`
uses with `ngForOf`). Omitting it doesn't break anything at runtime, but any property access on
`row` will fail to compile under `strictTemplates: true`.

## 6. Master-detail rows

```html
<we-grid gridKey="products" [columns]="columns" [data]="products" [expandable]="true" trackByField="id">
  <ng-template weGridRowDetail [weGridRowDetailRowsOf]="products" let-row>
    <div class="p-2">{{ row.description }}</div>
  </ng-template>
</we-grid>
```

## 7. Persisting layout to your backend

By default, column layout is saved to `localStorage`. To persist it server-side instead, implement
`WeGridLayoutStore` and provide it via `WE_GRID_LAYOUT_STORE`:

```ts
import { WE_GRID_LAYOUT_STORE, WeGridLayout, WeGridLayoutStore } from '@we-grid/angular';

@Injectable({ providedIn: 'root' })
export class BackendGridLayoutStore implements WeGridLayoutStore {
  constructor(private http: HttpClient) {}
  load(gridKey: string) { return this.http.get<WeGridLayout | null>(`/api/grid-layouts/${gridKey}`); }
  save(gridKey: string, layout: WeGridLayout) { return this.http.put<void>(`/api/grid-layouts/${gridKey}`, layout); }
  reset(gridKey: string) { return this.http.delete<void>(`/api/grid-layouts/${gridKey}`); }
}

// in your app config / route providers
{ provide: WE_GRID_LAYOUT_STORE, useClass: BackendGridLayoutStore }
```

See [api.md](api.md), [server-side.md](server-side.md), [theming.md](theming.md), and
[localization.md](localization.md) for everything else.
