---
title: Performance
---

# Performance

we-grid renders whatever is in `data`. How far that goes depends on two switches and one
choice.

## Measured

Production build, Chrome 157 (Playwright) on the development machine, Windows 11, eight columns, fictional rows from a fixed seed —
the **Performance** tab of [we-grid Studio](https://emrecirik.github.io/we-grid/studio/#perf)
repeats the run on your own device.

| Rows | `virtualScroll` | First render | Sort (currency column) | Scroll FPS | JS heap |
|---:|:---:|---:|---:|---:|---:|
| 10,000 | off | 9,012 ms | 5,445 ms | 8 | — |
| 10,000 | on | 45 ms | 44 ms | 32 | — |
| 100,000 | on | 92 ms | 37 ms | 35 | 75 MB |
| 1,000,000 | on | 62 ms | 592 ms | 38 | 213 MB |
| 2,000,000 | on | 1,548 ms | 1,017 ms | 37 | 345 MB |

Rows in the DOM stay at about twenty with `virtualScroll`, however many there are.

## What to switch on

- **More than a few hundred rows on one page:** `[virtualScroll]="true"` and a `maxHeight`.
  Grouping, trees, row details, selection and editing all work as before.
- **More rows than fit in the browser** (tens of millions and up): page on the server —
  `serverSide`, see [server-side.md](server-side.md). The grid then only ever holds one page.

## Limits today

- Rows are JavaScript objects, about 170 bytes each in the table above, so memory, not rendering,
  bounds a client-side grid — a few million rows on a desktop browser.
- Filtering, search and grouping run on the main thread over every row.
- Rows of very different heights (wrapped text, open details) make the scrollbar approximate
  under `virtualScroll`; the rows themselves are always right.
