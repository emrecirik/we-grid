# Server-side pagination, sorting, and filtering

> **The one thing to know.** The grid never fetches, pages or filters data behind your back. It
> renders exactly the rows you put in `data`. If you load 20 of your 3,000 products into `data`, a
> filter that runs *in the grid* can only ever look at those 20. To search all 3,000, the filter has
> to reach **your backend**, which filters the whole table and then returns the right page. The
> grid supports that fully — this page shows how, step by step.

## Filtering all 3,000 products, not just the 20 on screen

The scenario: a product list with 3,000 rows in the database, 20 per page. The user types "bolt"
into the Name filter and ticks "Hardware" in the Category checklist, and expects **every** matching
product across all 150 pages — with the pager showing how many there are.

It takes four things. Leave out any one of them and filtering silently falls back to the loaded page.

| # | What | Why |
|---|---|---|
| 1 | `[serverSide]="true"` with `[totalCount]`, `[page]`, `[pageSize]` and `(pageChange)` | The grid pages through **your** total, not through `data.length`. |
| 2 | `filterMode="server"` and a `(filterChange)` handler | The grid stops filtering locally and hands you the filters instead. |
| 3 | The backend applies the filters **before** paging: `WHERE …` then `OFFSET … FETCH …`, and counts **after** filtering | Otherwise you filter the page, or the pager shows the unfiltered total. |
| 4 | `[checklistValuesProvider]` *(for checklist columns)* | Otherwise a checklist lists only the values that happen to be on the loaded page. |

### 1–2. The component

```ts
import { Component, inject } from '@angular/core';
import {
  WeGridChecklistValuesProvider,
  WeGridColumnDef,
  WeGridColumnFilterState,
  WeGridComponent,
  WeGridFilterChangeEvent,
  WeGridPageChange,
  WeGridSortChange,
  WeGridSortDirection
} from 'we-grid-angular';
import { ProductApi, Product } from './product-api';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [WeGridComponent],
  template: `
    <we-grid
      gridKey="products"
      [columns]="columns"
      [data]="rows"
      [loading]="loading"
      trackByField="id"

      [serverSide]="true"
      [totalCount]="totalCount"
      [page]="page"
      [pageSize]="pageSize"
      (pageChange)="onPageChange($event)"

      [sortField]="sortField"
      [sortDirection]="sortDirection"
      (sortChange)="onSortChange($event)"

      [filterRow]="true"
      filterMode="server"
      [filterDebounceMs]="400"
      (filterChange)="onFilterChange($event)"
      [checklistValuesProvider]="checklistValues"
    ></we-grid>
  `
})
export class ProductsComponent {
  private readonly api = inject(ProductApi);

  columns: WeGridColumnDef<Product>[] = [
    { field: 'sku', header: 'SKU', headerFilterMode: 'operator' },
    { field: 'name', header: 'Name', headerFilterMode: 'operator' },       // contains "bolt"
    { field: 'category', header: 'Category' },                            // checklist (the default)
    { field: 'supplier', header: 'Supplier' },                            // checklist (the default)
    { field: 'priceKurus', header: 'Price', type: 'currency', format: 'TRY', minorUnits: true,
      headerFilterMode: 'operator' },                                     // > < between
    { field: 'stock', header: 'Stock', type: 'integer', headerFilterMode: 'operator' }
  ];

  rows: Product[] = [];
  loading = false;
  totalCount = 0;
  page = 1;
  pageSize = 20;
  sortField: string | null = 'name';
  sortDirection: WeGridSortDirection = 'asc';
  filters: WeGridColumnFilterState[] = [];

  /** Checklist values of the WHOLE table (narrowed by the other filters), not of the loaded page */
  checklistValues: WeGridChecklistValuesProvider = (request) => this.api.distinctValues(request);

  constructor() {
    this.load();
  }

  onPageChange(e: WeGridPageChange): void {
    this.page = e.page;
    this.pageSize = e.pageSize;
    this.load();
  }

  onSortChange(e: WeGridSortChange): void {
    this.sortField = e.field;
    this.sortDirection = e.direction;
    this.page = 1;
    this.load();
  }

  onFilterChange(e: WeGridFilterChangeEvent): void {
    this.filters = [...e];              // every active filter, as one array
    if (e.resetPage) this.page = 1;     // new filter set → page 1, in the SAME request
    this.load();
  }

  private load(): void {
    this.loading = true;
    this.api
      .search({ page: this.page, pageSize: this.pageSize, sortField: this.sortField,
                sortDirection: this.sortDirection, filters: this.filters })
      .subscribe((result) => {
        this.rows = result.items;             // only the 20 rows of this page
        this.totalCount = result.totalCount;  // how many match the filters in the WHOLE table
        this.loading = false;
      });
  }
}
```

```ts
// product-api.ts
@Injectable({ providedIn: 'root' })
export class ProductApi {
  private readonly http = inject(HttpClient);

  search(query: ProductQuery): Observable<{ items: Product[]; totalCount: number }> {
    return this.http.post<{ items: Product[]; totalCount: number }>('/api/products/search', query);
  }

  distinctValues(request: WeGridChecklistValuesRequest): Observable<WeGridChecklistValuesResult> {
    return this.http.post<WeGridChecklistValuesResult>('/api/products/distinct-values', request);
  }
}
```

### What the backend receives

After the user types "bolt" into Name, ticks two categories and asks for prices above ₺100, the
request body is:

```json
{
  "page": 1,
  "pageSize": 20,
  "sortField": "name",
  "sortDirection": "asc",
  "filters": [
    { "field": "name",       "operator": "contains", "value": "bolt" },
    { "field": "category",   "operator": "in",       "value": ["Hardware", "Fasteners"] },
    { "field": "priceKurus", "operator": "gt",       "value": 10000 }
  ]
}
```

Every operator and what it means:

| `operator` | Column types | `value` / `value2` | SQL |
|---|---|---|---|
| `contains` | text-like | string | `col LIKE '%' + @v + '%'` |
| `startsWith` | text-like | string | `col LIKE @v + '%'` |
| `equals` | text-like | string | `col = @v` |
| `eq` | number-like, date-like, boolean | number / `'yyyy-MM-dd'` / `'true'`/`'false'` | `col = @v` (dates: the whole day) |
| `gt` / `lt` | number-like | number | `col > @v` / `col < @v` |
| `before` / `after` | date-like | `'yyyy-MM-dd'` | `col < @v` / `col >= @v + 1 day` |
| `between` | number-like, date-like | `value` = from, `value2` = to — either may be missing | `col >= @from AND col <= @to` |
| `in` | any (checklist) | **array** of raw values; `null` = "(Empty)" | `col IN (…)` (`OR col IS NULL`) |

Text-like = `text`, `time`, `email`, `url`, `phone`, `custom`; number-like = `number`, `integer`,
`currency`, `percent`; date-like = `date`, `datetime`. Numbers always arrive **in the units the rows
store**: kuruş for a `minorUnits` column, a fraction for `percent` — see
[column-types.md](column-types.md).

### 3. The backend — filter, count, then page

ASP.NET Core with EF Core. `value` is a string, a number, an array or `null` depending on the
operator, so the DTO keeps it as a `JsonElement`; field names are whitelisted in the `switch`, never
passed to SQL as text:

```csharp
public sealed record GridFilter(string Field, string Operator, JsonElement Value, JsonElement Value2);
public sealed record GridQuery(int Page, int PageSize, string? SortField, string? SortDirection,
                               List<GridFilter> Filters);

static long? Long(JsonElement e) => e.ValueKind == JsonValueKind.Number ? e.GetInt64() : null;

[HttpPost("search")]
public async Task<PagedResult<ProductDto>> Search(GridQuery query)
{
    IQueryable<Product> rows = db.Products.AsNoTracking();

    foreach (var f in query.Filters)
        rows = f.Field switch
        {
            "name" => f.Operator switch
            {
                "contains"   => rows.Where(p => p.Name.Contains(f.Value.GetString()!)),
                "startsWith" => rows.Where(p => p.Name.StartsWith(f.Value.GetString()!)),
                _            => rows.Where(p => p.Name == f.Value.GetString())
            },
            "category" => rows.Where(p => f.Value.EnumerateArray()
                                              .Select(v => v.GetString()).ToList()
                                              .Contains(p.Category)),
            "priceKurus" => f.Operator switch            // kuruş in, kuruş compared
            {
                "gt"      => rows.Where(p => p.PriceKurus > Long(f.Value)),
                "lt"      => rows.Where(p => p.PriceKurus < Long(f.Value)),
                "between" => rows.Where(p => (Long(f.Value) == null || p.PriceKurus >= Long(f.Value))
                                          && (Long(f.Value2) == null || p.PriceKurus <= Long(f.Value2))),
                _         => rows.Where(p => p.PriceKurus == Long(f.Value))
            },
            _ => throw new BadHttpRequestException($"Unknown filter field {f.Field}")
        };

    var total = await rows.CountAsync();                       // AFTER filtering, BEFORE paging
    var items = await rows.OrderBy(query.SortField, query.SortDirection)   // your sort helper
                          .Skip((query.Page - 1) * query.PageSize)
                          .Take(query.PageSize)
                          .Select(p => p.ToDto())
                          .ToListAsync();
    return new PagedResult<ProductDto>(items, total);
}
```

Plain SQL (PostgreSQL), the same order of operations:

```sql
-- 1. filter the whole table
WITH filtered AS (
  SELECT * FROM products
  WHERE name ILIKE '%' || $1 || '%'
    AND category = ANY($2)
    AND price_kurus > $3
)
-- 2. count what matched, 3. return one page of it
SELECT (SELECT count(*) FROM filtered) AS total_count, f.*
FROM filtered f
ORDER BY name ASC
OFFSET ($4 - 1) * $5 LIMIT $5;
```

The `distinct-values` endpoint behind `checklistValuesProvider` is the same `WHERE`, applied with
every filter **except the requested column's own**, then `SELECT DISTINCT <field> … LIMIT @limit`
— see [Populating the checklist from the whole dataset](#populating-the-checklist-from-the-whole-dataset-checklistvaluesprovider).

### "My filter only searches the current page" — checklist

| Symptom | Cause | Fix |
|---|---|---|
| A yellow **"Only this page is searched"** hint next to the filter chips | `serverSide` is on but filtering still runs in the grid | Set `filterMode="server"` and bind `(filterChange)` |
| `(filterChange)` never fires | The grid isn't server-side, so it filters `data` itself | Add `[serverSide]="true"` (with `totalCount`/`page`/`pageSize`) |
| Filters work but the pager still shows 3,000 | `totalCount` is the table size | Return the count **after** the `WHERE`, before `OFFSET` |
| Results are right on page 1 but page 2 is empty or wrong | The backend pages first, then filters | `WHERE` first, then `ORDER BY`, then `OFFSET/FETCH` |
| The filter jumps back to an old page / two requests per keystroke | `page` isn't reset, or `(pageChange)` is used for it | `if (e.resetPage) this.page = 1;` inside the one `(filterChange)` handler |
| A checklist lists only a handful of values | It lists the loaded page | Bind `[checklistValuesProvider]` |
| The popover says "Only this page is searched" | Same — a checklist on a server-filtered grid without a provider | Bind `[checklistValuesProvider]`, or `headerFilterSource: 'loaded'` if the column really is client-only |
| A price filter of 100 finds nothing | Backend compares lira to kuruş (or the reverse) | The grid sends the units the rows use — with `minorUnits: true` that is kuruş |

The [retail-market sample](../SampleUsageProjects/retail-market) is this exact setup over 400
products, 50 per page: filters and checklists cover the whole table, and a note above the grid says
so. The [playground](../projects/playground) section 6 logs every request the grid would have sent.

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

Since 0.5.0 this is the **default** for every filterable column (except `type: 'custom'`): the
funnel icon shows on each header even with `filterRow` off, and the filter row renders a checklist
button for those columns. Set `headerFilterMode="operator"` on `<we-grid>` to go back to the
operator popover everywhere, or `headerFilterMode: 'operator'` on the columns where free text or a
range reads better than ticks. A column whose values come from a closed set reads better as a list
of ticks than as an operator and a text box:

```ts
columns: WeGridColumnDef<Order>[] = [
  {
    field: 'statusCode',
    header: 'Status',
    displayValue: (row) => orderStatusLabel(row.statusCode), // the label the user ticks
    headerFilterMode: 'checklist',      // the default since 0.5.0; 'operator' gives the operator popover
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
