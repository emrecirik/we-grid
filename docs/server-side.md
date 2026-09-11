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

### Every way a filter changes is emitted

`(filterChange)` is the only thing a server-side screen knows the filters from, so every path that
changes them reports it — including two that used to stay silent before 0.4.0:

- **Reset layout** (header menu) clears every filter. When one was active it emits a single empty
  `(filterChange)` with `resetPage: true` straight away, without waiting out `filterDebounceMs`;
  when none was, it emits nothing. It also emits `(layoutChange)` with the default layout — without
  saving it, since the reset has just deleted the stored record.
- **Filter by this value** (cell context menu) is not offered on a `filterable: false` column, and
  does nothing there if the action arrives anyway. On a checklist column it produces the same
  `{ operator: 'in', value: [rawValue] }` a tick in the checklist would, so the backend receives one
  shape per column and the checklist shows the value as ticked.

### Restricting operators per column (`filterOperators`)

When the backend can only run some operators on a field — an exact match on a column without a
`LIKE`-friendly index, say — declare them, and the filter row and popover offer nothing else:

```ts
{ field: 'taxNumber', header: 'Tax no.', filterOperators: ['equals'] },
{ field: 'amount', header: 'Amount', type: 'currency', filterOperators: ['gt', 'lt', 'between'] }
```

The first operator is the column's default. Operators that don't belong to the column's type are
ignored, and a list with nothing usable left falls back to the full list with a dev-mode warning.
"Filter by this value" is hidden on a column whose list doesn't contain the exact match it stands for
(`equals` for text, `eq` otherwise) rather than sending an operator the backend doesn't accept.

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
is why it shows what the current page contains — unless you give it a
[`checklistValuesProvider`](#populating-the-checklist-from-the-whole-dataset-checklistvaluesprovider).
Anything already ticked stays in the list and stays ticked even after paging to rows that no longer
contain it.

On a grid that filters on the server, a checklist without a provider says "Only this page is
searched" in its popover and logs a one-time warning in dev mode — a user looking for a value that
lives on page 7 would otherwise never find out why it isn't there.

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

### Populating the checklist from the whole dataset (`checklistValuesProvider`)

On page 1 of 25 a list built from the loaded rows is missing most of what a column can contain.
Give the grid a provider and every checklist column asks it instead — for the whole table, narrowed
by the other active filters:

```ts
import { map } from 'rxjs';
import { WeGridChecklistValuesProvider } from 'we-grid-angular';

checklistValues: WeGridChecklistValuesProvider = (request) =>
  this.http
    .post<{ values: { value: number; label: string }[]; hasMore: boolean }>('/api/orders/distinct-values', {
      ...this.screenCriteria(),          // whatever the screen filters on outside the grid
      field: request.field,
      search: request.search,
      filters: request.filters,
      limit: request.limit
    });
```

```html
<we-grid ... [serverSide]="true" filterMode="server" (filterChange)="onFilterChange($event)"
         [checklistValuesProvider]="checklistValues"></we-grid>
```

What the grid sends and expects:

| `WeGridChecklistValuesRequest` | |
|---|---|
| `field` | The column being filtered. |
| `search` | The popover's search box, trimmed — `null` while it is empty. |
| `filters` | Every active filter **except this column's own**. |
| `limit` | `checklistValuesLimit` of the column, else of the grid (200). |

| `WeGridChecklistValuesResult` | |
|---|---|
| `values` | `{ value, label? }[]` — raw values; `null` is the "(Empty)" entry. |
| `hasMore` | More values exist beyond `limit`; the popover says only the first ones are listed. |

**Why the column's own filter is left out.** Opening "Status" while "Status in (Draft)" is active
must still list Approved and Shipped — otherwise the user could only ever see what is already
ticked. The backend has to mirror this: apply `filters` as given, and don't add the column's own
selection back in. The other filters *do* apply, so with "Supplier: ABC" active the Status list
only holds statuses ABC's orders actually have.

A few rules the grid follows:

- **Search** is debounced (`checklistSearchDebounceMs`, 300ms) and each new term cancels the request
  before it — return a cold Observable such as `HttpClient`'s and the HTTP call is really aborted.
  The search goes to the backend as typed, for number and enum columns too; ignore it where it
  makes no sense.
- **Labels** come from the value's `label`, then the column's `checklistValueLabel(value)`, then
  plain formatting. `displayValue` can't be used here — it needs a row, and the value may come from
  a page that was never loaded.
- **Ticks survive**: a ticked value missing from the unsearched result stays listed and ticked. A
  search result is shown as returned.
- **Failure** shows an error line and a Retry button instead of an empty list.
- **Keep `limit` at or below what your backend accepts** in one `IN (...)`, so a select-all over the
  listed values can always be applied.
- **No caching**: every open asks again, since other users may have changed the data meanwhile.
  Wrap your provider in `shareReplay` if a screen really needs it.
- The provider is **only used while filtering runs on the server** (`isServerFilter`). A
  client-filtered grid applies the selection to the loaded rows, where a value found elsewhere could
  never match, so it keeps listing the loaded rows and warns once in dev mode.
- A column that holds something the backend has no column for — a flag computed on the client —
  opts out with `headerFilterSource: 'loaded'`.

```ts
{ field: 'statusCode', header: 'Status', headerFilterMode: 'checklist',
  checklistValueLabel: (code) => ORDER_STATUS_LABELS[code as number] ?? String(code),
  checklistValuesLimit: 50 }
```

Like every other filter source, the endpoint must only reveal values from rows the user is allowed
to see — apply the same authorization and scoping as the list query itself.

## Summary row and `summaryValues`

With `serverSide=true`, the summary row computed from the loaded page is labeled "Page sum/average/…"
to avoid implying it's a grand total. Supply the real backend-computed totals via `summaryValues`
(keyed by column field) to show "Grand sum/…" instead:

```html
<we-grid ... [summaryValues]="{ totalAmount: backendGrandTotal }"></we-grid>
```

See [api.md](api.md) for the full summary row behavior.
