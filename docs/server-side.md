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
debounces (`filterDebounceMs`, 400ms by default) and emits the active filters via
`(filterChange)`, trusting the backend to return already-filtered data. While `isServerFilter` is
false (the common case), filtering runs entirely client-side over whatever rows are currently in
`data` — with `serverSide=true` and no `(filterChange)` binding, that means filtering only searches
the **currently loaded page**, and the grid shows an "only this page is searched" hint
(`isFilteringPageOnly`).

```html
<we-grid gridKey="products" [columns]="columns" [data]="products" [filterRow]="true"
         [serverSide]="true" [totalCount]="totalItems"
         filterMode="server" [filterDebounceMs]="400"
         [page]="page" [pageSize]="pageSize"
         (pageChange)="onPageChange($event)"
         (filterChange)="onFilterChange($event)">
</we-grid>
```

```ts
onFilterChange(e: WeGridFilterChangeEvent): void {
  this.activeFilters = [...e];        // the event IS the WeGridColumnFilterState[]
  if (e.resetPage) this.page = 1;     // the filter set changed, the old offset is meaningless
  this.loadProducts();                // exactly one request
}
```

### `resetPage` — one request, not two

Setting `filterMode="server"` explicitly is worth it even when `(filterChange)` is bound: `'auto'`
infers the answer from whether anything is subscribed, which changes with a refactor, while
`'server'` states it.

The payload of `(filterChange)` is still the array of active filters, so a handler typed
`(filters: WeGridColumnFilterState[])` keeps compiling. It additionally carries:

| Property | Meaning |
|---|---|
| `filters` | The same entries, as a named property. |
| `resetPage` | `true` when the active filter set really changed since the last emit — the reload belongs on page 1. `false` when the debounce window happened to end on the filters that were already sent (typed and deleted again), where jumping to page 1 would be wrong. |

The grid deliberately never emits `(pageChange)` alongside `(filterChange)`: setting `this.page = 1`
in the handler and reloading once is the whole protocol, so there is no page event racing a filter
event and no way to end up issuing two queries for one user action.

## The checklist header filter (`headerFilterMode: 'checklist'`)

A column whose values come from a closed set reads better as a list of ticks than as an operator
and a text box:

```ts
columns: WeGridColumnDef<Order>[] = [
  {
    field: 'statusCode',
    header: 'Status',
    displayValue: (row) => orderStatusLabel(row.statusCode), // the label the user ticks
    headerFilterMode: 'checklist',      // 'operator' (the default) keeps the old popover
    headerFilterSelection: 'multi'      // 'single' renders radio buttons instead
  }
];
```

The funnel icon then opens a list of the **distinct values of the loaded rows** — with a search
box, a select-all box and an "(Empty)" entry for null/blank cells. The list is built from the `data`
input alone: the grid issues no request of its own to discover what values a column can take, which
is why it shows what the current page contains. Anything already ticked stays in the list and stays
ticked even after paging to rows that no longer contain it.

What leaves the grid is one ordinary filter:

```jsonc
{ "field": "statusCode", "operator": "in", "value": [10, 40] }  // raw values, not labels
```

`'in'` is the only operator whose `value` is an array; a `null` entry in it is the "(Empty)" bucket.
`displayValue` affects the labels in the list and on the chip, never the payload, so the backend
receives the raw codes it stores.

### Applying it on the backend

A DTO that already carries `Value`/`Value2` only needs a place for several values:

```csharp
public sealed class GridFilterDto
{
    public string Field { get; init; } = "";
    public string Operator { get; init; } = "";
    public string? Value { get; init; }
    public string? Value2 { get; init; }
    public string[]? Values { get; init; }   // only read for "in"
}
```

…and one more branch in the expression-tree builder, `Enumerable.Contains` over the whitelisted
column. The selection still has to be applied to the **whole table**, not to the page the values
were collected from — that is the point of sending it to the backend at all.

With `filterMode='client'` the same `'in'` filter is applied by `applyWeGridFilters` over the
loaded rows, so a grid can switch between the two without changing a column definition.

## Summary row and `summaryValues`

With `serverSide=true`, the summary row computed from the loaded page is labeled "Page sum/average/…"
to avoid implying it's a grand total. Supply the real backend-computed totals via `summaryValues`
(keyed by column field) to show "Grand sum/…" instead:

```html
<we-grid ... [summaryValues]="{ totalAmount: backendGrandTotal }"></we-grid>
```

See [api.md](api.md) for the full summary row behavior.
