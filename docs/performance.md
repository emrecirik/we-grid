---
title: Performance
---

# Performance

we-grid holds rows in one of two ways, and how far it goes depends on which:

- **`[data]="rows"`** — an array of objects, as most grids take it. Add `[virtualScroll]="true"`
  and it scrolls a few million rows smoothly; memory is what stops it.
- **`[dataSource]="store"`** with `WeGridColumnStore` — the column engine. Rows are never held as
  objects, so tens of millions fit, and sorting, filtering and search run on compact codes.

## Measured

Production build, Chrome 157 (Playwright) on the development machine, Windows 11, eight columns
(id, customer, city, category, quantity, price, total, date), fictional rows from a fixed seed. The
**Performance** tab of [we-grid Studio](https://emrecirik.github.io/we-grid/studio/#perf) repeats
every run on your own device.

| | Rows as objects, 1M | Rows as objects, 2M | Column engine, 1M | Column engine, 10M | Column engine, 50M |
|---|---:|---:|---:|---:|---:|
| Data in memory | ≈ 150 MB | ≈ 300 MB | **14 MB** | **143 MB** | **715 MB** |
| First render | 58 ms | 651 ms | 44 ms | 29 ms | 1,281 ms |
| Sort by a currency column | 338 ms | 817 ms | **21 ms** | 268 ms | 1,195 ms |
| Filter City = Ankara | 132 ms | 291 ms | **35 ms** | 124 ms | 948 ms |
| Search two words, every column | 12,661 ms | 29,128 ms | **95 ms** | 265 ms | 1,036 ms |
| Scroll FPS (top to bottom in 2 s) | 68 | 62 | 57 | 61 | 64 |
| Rows in the DOM | 21 | 21 | 21 | 21 | 21 |

Both ways give the same result: on the same million rows the filter keeps 100,402 and the search
7,240 rows in each. Rows as objects are measured with `virtualScroll` on; without it, 10,000 rows
already took 9 s to render.

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
- **Rows** become objects only for the window in view (256 at a time).

The engine follows the grid's own rules — the same filter operators and Turkish-aware lowercasing,
the same sort order with empty values first — and its tests compare it with the row-object path.

### What a `dataSource` grid does differently

- Sorting, filters (including the checklist, which lists values from the whole store) and the
  search box go to the source. Virtual scrolling is always on.
- The footer shows the count; there is no pager.
- Grouping, trees and `scrollToRow` are not available. The summary row shows `summaryValues` —
  fill them from `store.aggregate('total', 'sum', query)`.
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

- The engine runs on the main thread. 50 million rows take about a second per sort, filter or
  search, during which the page doesn't respond.
- Rows of very different heights (wrapped text, open details) make the scrollbar approximate
  under virtual scrolling; the rows themselves are always right.
- A search on a number column checks the characters of its first 256 cells before formatting every
  row; a formatter whose output characters change with the value beyond those could be missed.
