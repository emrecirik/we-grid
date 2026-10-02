# Tree rows

A tree draws child rows under their parent **in the same columns** — aligned, indented and
collapsible — instead of a free-form detail panel. Give the grid the root rows as `data` and tell it
how to reach a row's children:

```html
<we-grid
  gridKey="orders-tree"
  [columns]="columns"
  [data]="orders"
  trackByField="key"
  [treeChildren]="linesOf"
  treeColumn="label"
></we-grid>
```

```ts
interface OrderNode {
  key: string;          // unique across EVERY level — 'O:17', 'L:17-2'
  label: string;
  customer?: string;
  product?: string;
  qty: number;
  lines?: OrderNode[];
}

linesOf = (row: OrderNode) => row.lines;   // empty, null or undefined = a leaf
```

`trackByField` is required in tree mode and must be unique across all levels — it is what the open
state, the selection and `scrollToRow` hold on to. Without it the grid falls back to object
identity and warns in dev mode; a duplicate key warns too (the two rows then share their state).

## Inputs and outputs

| Input | Default | |
|---|---|---|
| `treeChildren` | — | `(row) => readonly T[] \| null \| undefined`. Setting it turns tree mode on; removing it goes back to flat rows and drops the open state. |
| `treeColumn` | first visible unpinned column | Field of the column that carries the toggle and the indentation. A hidden tree column takes its toggle with it — the grid menu's *Expand all / Collapse all* stays available. |
| `treeToggle` | `'inline'` | `'none'` leaves both the toggle and the indentation to your cell template (`ctx.tree` + `toggleTreeNode`). |
| `treeIndentPx` | `16` | Indentation per level. |
| `treeDefaultExpanded` | `false` | `true` opens everything, a number `n` opens the levels below `n` (`1` = the roots are open). Applies to a row the first time it is seen. |
| `treeSummaryLevel` | `'root'` | Which rows the summary row adds up: `'root'` (no double counting), `'leaf'` or `'all'`. |
| `(treeExpandChange)` | | `{ row, expanded, source: 'user' \| 'api' }` — `'user'` for the toggle, `'api'` for every method call. |

## Values per level

Both levels use the same column definitions. A column reads its value in this order:

1. `treeValue: (row, tree) => unknown` — computed from the row and its place in the tree;
2. `childField` — on child rows only; `null` leaves the column empty on child rows;
3. `field`.

```ts
columns: WeGridColumnDef<OrderNode>[] = [
  { field: 'label', header: 'Order / line', pinned: 'left' },
  { field: 'customer', header: 'Customer', childField: 'product' },   // product on a line
  {
    field: 'unitPrice',
    header: 'Unit price',
    type: 'currency',
    treeValue: (row, tree) => (tree.level === 0 ? cheapestLine(row) : row.unitPrice)
  }
];
```

That value is what the cell shows, sorts, filters, adds up and exports — one rule everywhere. A
cell template is called on every level, and `ctx.tree` tells them apart:

```html
<ng-template weGridCell="decision" let-row let-tree="tree">
  @if (tree.level === 0) { <app-decision-buttons [row]="row" /> }
</ng-template>
```

`WeGridTreeInfo` carries `level` (0 = root), `hasChildren`, `expanded`, `parent`, `index` and
`siblingCount`. `rowClass` receives it as a third argument (left out outside tree mode, so a
two-argument function keeps working).

Inline editing and paste leave a cell alone when its value comes from `treeValue` or `childField`
on that row: writing it back to `field` would put the value somewhere else than where it was read.

## Methods

| | |
|---|---|
| `toggleTreeNode(row, force?)` | Opens / closes a row's children; `force` picks the state. |
| `isTreeExpanded(row)` | Whether its children are shown. |
| `expandAllTree()` / `collapseAllTree()` | Every row that has children; one screen-reader announcement ("N rows shown"). |
| `treeAllExpanded` | True when every row with children is open — for an *Expand all / Collapse all* label. |
| `scrollToRow(key, { expandParents?, block?, behavior? })` | Opens the row's ancestors (unless `expandParents: false`), then scrolls it into view after the next render. Returns false for an unknown key or a row the filters hide — clear the filters and call it again. Falls back to an instant scroll when the user prefers reduced motion; inside a `maxHeight` grid the sticky header doesn't cover the row. |

Each tree row carries `id="we-grid-row-<key>"` and `data-we-grid-row-key` (the key URI-encoded) for
deep links.

## Open state

The open state belongs to the keys, not to the row objects: a new `data` array keeps every row whose
key still exists open — and its DOM, so an input inside it keeps the focus — and forgets the keys
that disappeared. A page change clears it. It is never part of the saved layout.

## Sorting and filtering (client side)

- Sorting orders **siblings** only — children stay under their parent — and is stable.
- A row stays visible when it matches the filters **or** a descendant does. A matching row whose
  children match nothing keeps all its children, so it doesn't lose its context.
- While a filter is active the path to every match is held open; the rows you opened yourself are
  remembered and come back when the filter is cleared.

On a `serverSide` grid the server sorts and filters; paging and `totalCount` count **root** rows,
and children arrive with their parent (lazy loading is not part of this).

## Everything else

- **Summary row** — see `treeSummaryLevel`.
- **Export** — every row of the filtered tree, collapsed ones included, depth first, with two
  spaces per level in front of the first column. With a selection, only the selected rows.
- **Selection** — every row selects on its own (no cascading); *select all* covers the filtered tree.
- **Grouping** cannot be combined with a tree: while `treeChildren` is set, grouping is ignored
  (with a dev warning).
- **Detail rows** — see [row-detail.md](row-detail.md): parent → detail → children.
- **Accessibility** — the table becomes `role="treegrid"`; each row has `aria-level`,
  `aria-posinset`, `aria-setsize` and, with children, `aria-expanded`. The toggle is a real button
  (Enter / Space) named by `treeExpandRow(label)` / `treeCollapseRow(label)`.
- **Cycles** — data deeper than 32 levels is taken to be cyclic: an error in dev mode, cut off in
  production.

The rows are flattened into one list once per data, sort, filter or open-state change, never per
change detection; every per-row lookup is a Map hit. 500 roots with 2000 open children render about
as fast as 2500 flat rows.
