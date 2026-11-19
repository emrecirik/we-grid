---
title: Performance
---

# Performance

we-grid holds rows in one of three ways, and how far it goes depends on which:

- **`[data]="rows"`** — an array of objects, as most grids take it. Add `[virtualScroll]="true"`
  and it scrolls a few million rows smoothly; memory is what stops it.
- **`[dataSource]="store"`** with `WeGridColumnStore` — the column engine. Rows are never held as
  objects, so tens of millions fit, and sorting, filtering and search run on compact codes.
- **`[dataSource]="store"`** with `WeGridWorkerStore` — the same engine in a Web Worker: the page
  never freezes, however long a sort of fifty million rows takes.

## Measured

Production build, Chrome 157 (Playwright) on the development machine, Windows 11, eight columns
(id, customer, city, category, quantity, price, total, date), fictional rows from a fixed seed, a
fresh grid for every run. The **Performance** tab of
[we-grid Studio](https://emrecirik.github.io/we-grid/studio/#perf) repeats every run on your own
device.

Each step shows two times: **until the result is on screen · the longest the page went without
drawing a frame meanwhile**. A short second number means scrolling and typing kept working.

### One million rows, side by side with AG Grid Community

AG Grid Community 36.3 (MIT) runs on the same rows, columns and display formats, with its own
defaults otherwise — client-side row model, text column filter, quick filter for the search. It is
loaded only when that mode is picked; we-grid doesn't depend on it. A first render counts until the
rows are actually in the page, which AG Grid reaches a few frames after `createGrid`.

| One million rows | AG Grid Community | we-grid, rows as objects | we-grid, column engine | we-grid, engine in a worker |
|---|---:|---:|---:|---:|
| First render | 1,370 · 1,344 ms | 96 · 90 ms | 110 · 90 ms | 140 · **24** ms |
| Sort by Total | 5,741 · 5,724 ms | 406 · 397 ms | **63** · 55 ms | 68 · **17** ms |
| Filter City = Ankara | 2,079 · 2,068 ms | 167 · 161 ms | **46** · 39 ms | 64 · **19** ms |
| Search "selin izmir" | 1,189 · 1,181 ms, finds **0** rows | 414 · 409 ms | 123 · 116 ms | **98** · **18** ms |
| Data in memory | 336 MB JS heap | ≈ 150 MB JS heap | **14 MB** | **14 MB**, in the worker |
| Scroll FPS | 39 | 54 | 44 | 50 |

Against AG Grid the column engine renders about 12×, sorts 90×, filters 45× and searches 10×
faster; in a worker the page's longest freeze is 56× to 340× shorter. Grouping a million rows by
City with each group's total takes the engine 73 ms (row objects: 818 ms), and a City × Category
pivot of the sum of Total 94 ms (row objects: 560 ms) — the same cells either way. AG Grid Community
can't group rows or pivot at all; both are part of AG Grid Enterprise. All three we-grid modes give
the same result — the filter keeps 100,402 rows and the search 7,240 — and at two million rows AG
Grid took 2.6 s to render, 12.1 s to sort, 4.6 s to filter and 3.0 s to search; at five million,
32 s to sort with 1.6 GB of heap.

### Ten and fifty million rows: main thread or worker

| | 10M, main thread | 10M, worker | 50M, main thread | 50M, worker |
|---|---:|---:|---:|---:|
| Build the store and show it | 828 · 822 ms | 788 · **25** ms | 2,791 · 2,780 ms | 2,323 · **25** ms |
| Sort by Total | 542 · 534 ms | 523 · **29** ms | 2,484 · 2,473 ms | 2,365 · **18** ms |
| Filter City = Ankara | 230 · 223 ms | 206 · **17** ms | 993 · 985 ms | 784 · **21** ms |
| Search "selin izmir" | 447 · 441 ms | 472 · **26** ms | 1,488 · 1,483 ms | 1,601 · **20** ms |
| Group by City, with each group's Total | 373 · 367 ms | 338 · **15** ms | — | 1,375 · **17** ms |
| Pivot City × Category, sum of Total | — | 535 · **23** ms | — | 2,950 · **25** ms |
| Data in memory | 143 MB | 143 MB | 715 MB | 715 MB |
| Scroll FPS | 40 | 44 | 45 | 51 |

The work takes as long in a worker; the page just doesn't wait for it — the rows in view show
placeholders until the answer arrives. Generating the test data itself (on the page) is not part of
these numbers.

Two things the tables don't show:

- **Turkish İ.** AG Grid's quick filter upper-cases text without a locale (`toUpperCase()`), so
  "izmir" never matches "İzmir" and "istanbul" never matches "İstanbul". we-grid lowercases with the
  grid locale's rules (`tr-TR` under `weGridLocaleTr`). Under an English locale we-grid has the same
  blind spot.
- **Scrolling** is bounded by the display's refresh rate; every grid stays in the same range.

Numbers vary by device — run the tab on yours.

## The column engine

```ts
import { WeGridColumnStore } from 'we-grid-angular';

// From rows you already have — they can be dropped afterwards
store = WeGridColumnStore.fromRows(orders);

// Or straight from columns, never building row objects at all
store = WeGridColumnStore.fromColumns({
  id: idArray,                                         // Int32Array, number[] …
  city: { dictionary: ['Ankara', 'Bursa'], codes },    // already dictionary-encoded
  total: { fixed: totalInCents, scale: 100 }           // money as integers
});
```

```html
<we-grid [columns]="columns" [dataSource]="store" trackByField="id" [search]="true" />
```

Each column is stored in the smallest form its values allow, chosen on its own:

| Values | Stored as | Bytes per row |
|---|---|---:|
| A running id (`1, 2, 3 …`) | start and step | 0 |
| Strings, booleans | sorted dictionary + `Uint8`/`Uint16`/`Uint32` codes | 1–4 |
| Integers, decimals with up to four places | offset integer codes (`Uint8` … `Uint32`) | 1–4 |
| Other numbers, dates | `Float64Array` | 8 |
| Objects, mixed values | as given | — |

`store.describe()` tells how each column ended up. Work runs on those codes:

- **Filters** are decided once per distinct value and then applied as a lookup, so `City = Ankara`
  over 50 million rows tests ten strings, not fifty million.
- **Search** formats each dictionary value once; number columns are only formatted when the word
  could appear in their cell text.
- **Sorting** is a stable LSD radix sort straight over the codes — no comparisons, no copies of the
  column.
- **Grouping** is a hash aggregation over the codes: one pass counts every group and adds up its
  subtotals; the rows then come group by group, so a group is one run of offsets and the grid can
  show fifty million grouped rows window by window. More than 200,000 groups is refused.
- **Pivots** come from the same aggregation: `<we-pivot [dataSource]="store">` asks for the groups
  by the row and column fields with each value's aggregate, and builds the table from those cells.
- **Rows** become objects only for the window in view (256 at a time).

The engine follows the grid's own rules — the same filter operators and Turkish-aware lowercasing,
the same sort order with empty values first — and its tests compare it with the row-object path.

## In a Web Worker

The engine has its own entry point, `we-grid-angular/engine`, with no Angular in it — a worker
built from it is about 27 kB (9 kB gzipped). The whole worker file:

```ts
// grid.worker.ts
import { weGridServeColumnStore } from 'we-grid-angular/engine';
weGridServeColumnStore();
```

and on the page:

```ts
import { WeGridWorkerStore } from 'we-grid-angular';

const worker = new Worker(new URL('./grid.worker', import.meta.url), { type: 'module' });
store = await WeGridWorkerStore.fromColumns<Order>(worker, { id, city: { dictionary, codes }, total });
```

The Angular CLI builds the worker once `webWorkerTsConfig` is set for the app (`ng generate
web-worker` sets it up). Typed arrays handed to `fromColumns` are transferred, not copied — they are
empty on the page afterwards; `fromRows` copies the rows over once. `aggregate`, `distinct`, `set`
and `describe` return promises. Search in the worker formats cells with the column's built-in
formatting (type, `format`, `minorUnits`, the grid's locale); a column's own `formatter` function
can't cross into the worker and isn't applied there.

The engine entry point also runs in Node — the same store can answer a backend's requests.

### What a `dataSource` grid does differently

- Sorting, filters (including the checklist, which lists values from the whole store) and the
  search box go to the source. Virtual scrolling is always on.
- The footer shows the count; there is no pager.
- Grouping works when the source has `groups()` — both stores do: group headers show the source's
  counts and the columns' group summaries (`summary`, `groupSummary`, `groupAutoSummary`, weighted
  averages included); collapsing a group doesn't ask the source again. A group's label is the
  value's formatted text — a `displayValue` isn't applied.
- Trees and `scrollToRow` are not available. The summary row shows `summaryValues` — fill them from
  `store.aggregate('total', 'sum', query)`.
- "Export all" loads the whole result from the source.
- Editing: change the store with `store.set(row, field, value)`, then call the grid's
  `refreshDataSource()`.
- Search and text filters see a value the way the column formats it on its own. A `formatter` that
  reads other fields of the row, or a `displayValue`, is not applied there — the engine never builds
  the row to ask it.

A remote backend can implement the same `WeGridDataSource` interface — `load({ offset, limit,
sort, filters, search })` returning `{ rows, total }` — and the grid scrolls through any number of
rows it has.

## Limits today

- Rows of very different heights (wrapped text, open details) make the scrollbar approximate
  under virtual scrolling; the rows themselves are always right.
- A search on a number column checks the characters of its first 256 cells before formatting every
  row; a formatter whose output characters change with the value beyond those could be missed.
