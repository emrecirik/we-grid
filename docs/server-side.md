# Server-side pagination, sorting, and filtering

## Pagination

Pagination is always driven by the parent when `serverSide=true`:

```html
<we-grid
  gridKey="products"
  [columns]="columns"
  [data]="products"
  [loading]="loading"
  [totalCount]="totalItems"
  [page]="page"
  [pageSize]="pageSize"
  [serverSide]="true"
  (pageChange)="onPageChange($event)"
>
</we-grid>
```

```ts
onPageChange(e: WeGridPageChange): void {
  this.page = e.page;
  this.loadProducts();
}
```

The grid never fetches data itself — it only emits `pageChange`/`sortChange`/`filterChange`; your
component is responsible for refetching `data`.

## Sorting — the `sortMode` / `isServerSort` contract

`sortMode` defaults to `'auto'`. The component exposes a computed `isServerSort` getter used
throughout its logic — reproduced here exactly:

```ts
get isServerSort(): boolean {
  if (!this.serverSide || this.sortMode === 'client') return false;
  return this.sortMode === 'server' || this.sortChange.observed;
}
```

In words: sorting happens **on the server** when `serverSide=true` **and** either `sortMode` is
explicitly `'server'`, or `sortMode` is `'auto'` **and** something is actually subscribed to
`(sortChange)` (Angular's `EventEmitter.observed` becomes `true` once the template binds it).
Otherwise, the grid sorts the **currently loaded rows** itself (client-side), regardless of
`serverSide`.

This means: if you set `serverSide=true` but forget to bind `(sortChange)`, clicking a header
still does something useful (a purely visual, page-local sort) instead of silently doing nothing —
while your screen still shows a "only this page was sorted" hint (`isSortingPageOnly`) so the user
isn't misled into thinking the whole dataset was sorted.

```ts
onSortChange(e: WeGridSortChange): void {
  this.sortField = e.field;
  this.sortDirection = e.direction;
  this.page = 1;
  this.loadProducts(); // include e.field/e.direction in your backend query
}
```

## Filtering — the `filterMode` / `isServerFilter` contract

Same shape, for the filter row:

```ts
get isServerFilter(): boolean {
  if (!this.serverSide || this.filterMode === 'client') return false;
  return this.filterMode === 'server' || this.filterChange.observed;
}
```

While `isServerFilter` is true, the grid does **not** apply the filter row locally — it only
debounces (400ms) and emits the active filters via `(filterChange)`, trusting the backend to
return already-filtered data. While `isServerFilter` is false (the common case), filtering runs
entirely client-side over whatever rows are currently in `data` — with `serverSide=true` and no
`(filterChange)` binding, that means filtering only searches the **currently loaded page**, and the
grid shows an "only this page is searched" hint (`isFilteringPageOnly`).

```html
<we-grid gridKey="products" [columns]="columns" [data]="products" [filterRow]="true"
         [serverSide]="true" [totalCount]="totalItems"
         (filterChange)="onFilterChange($event)">
</we-grid>
```

```ts
onFilterChange(filters: WeGridColumnFilterState[]): void {
  this.activeFilters = filters;
  this.page = 1;
  this.loadProducts(); // translate filters into your backend query
}
```

## Summary row and `summaryValues`

With `serverSide=true`, the summary row computed from the loaded page is labeled "Page sum/average/…"
to avoid implying it's a grand total. Supply the real backend-computed totals via `summaryValues`
(keyed by column field) to show "Grand sum/…" instead:

```html
<we-grid ... [summaryValues]="{ totalAmount: backendGrandTotal }"></we-grid>
```

See [api.md](api.md) for the full summary row behavior.
