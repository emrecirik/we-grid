# Row detail (master-detail)

`expandable` plus a `weGridRowDetail` template gives every row a full-width detail row under it:

```html
<we-grid gridKey="orders" [columns]="columns" [data]="orders" trackByField="id" [expandable]="true">
  <ng-template weGridRowDetail let-row let-close="close">
    <app-order-history [orderId]="row.id" />
    <button type="button" (click)="close()">Hide</button>
  </ng-template>
</we-grid>
```

The template context carries `row` (also `$implicit`), `rowIndex`, `close()` and, in tree mode,
`tree`. With every option below at its default the detail behaves — and renders — exactly as before
0.7.0: an arrow column opens it, it is mounted on first open and hidden when closed.

| Input | Default | |
|---|---|---|
| `detailTrigger` | `'column'` | `'none'` drops the arrow column (the table gets narrower by it, pinned offsets follow). Open the detail from your own control. |
| `detailSticky` | `false` | The content sticks to the left edge of the scroll area while the table scrolls sideways — a wide table can't push it out of view. |
| `detailMaxWidth` | the scroll area's width | With `detailSticky`: the largest content width, px or any CSS length (`'min(960px, 70vw)'`). |
| `canExpandRow` | every row | `(row) => boolean`. A row answering false has no arrow and can't be opened; an open detail whose row turns false is closed (reported with source `'api'`). |
| `detailMount` | `'once'` | `'whileOpen'` removes the content when closed and creates it fresh on every open. |
| `(detailToggle)` | | `{ row, open, source: 'user' \| 'api' }` — `'user'` for the arrow, `'api'` for every method. |

## Opening it from a cell

```html
<ng-template weGridCell="comments" let-row>
  <button
    type="button"
    [attr.aria-controls]="grid.detailId(row)"
    [attr.aria-expanded]="grid.isRowDetailOpen(row)"
    (click)="grid.toggleRowDetail(row)"
  >Comments</button>
</ng-template>
```

`toggleRowDetail(row, force?)`, `openRowDetail(row)`, `closeRowDetail(row)`,
`isRowDetailOpen(row)` (alias of `isRowExpanded`), `closeAllDetails()` and `detailId(row)`
(`'we-grid-detail-<key>'`). `toggleRowExpand` / `isRowExpanded` keep working.

As soon as any of these options is in use, the detail content sits in a
`<div role="region" id="we-grid-detail-<key>" aria-label="Details of …">` wrapper and the arrow
carries `aria-controls` pointing at it.

## Sticky details

With `detailSticky` the grid measures the scroll area once per resize — one `ResizeObserver` per
grid however many details are open, outside Angular, released on destroy — and writes the width to
`--we-grid-viewport-width`. The wrapper is `position: sticky; inset-inline-start: 0` (so it sticks to
the right edge in a right-to-left page), as wide as the visible part of the table, never wider than
the table, and lets wider content scroll inside it: an open detail never widens the table or changes
a column. Printing turns the stickiness off.

Theme variables: `--we-grid-detail-padding` (default `0.75rem 1rem`), `--we-grid-detail-inset-left`
(default `0` — the width of your left-pinned columns, if the content should start after them) and
`--we-grid-detail-bg`.

## Order and lifetime

- In a tree a row reads parent → detail → children; a parent's detail shows while its children are
  collapsed.
- The open state is held per key: a new `data` array keeps open details open, their DOM and the
  focus inside them. A page change closes them all. Hiding, moving or resizing columns never closes
  them — the cell's `colspan` follows.
