# Saved views

The persisted layout remembers columns and density, never what the user is looking for. A saved
view does: it is a named snapshot of the **columns, filters, sort and grouping**, one click away,
and shareable as a link.

```html
<we-grid gridKey="orders" [columns]="columns" [data]="rows" [savedViews]="true" ...></we-grid>
```

`savedViews` adds a **Views** button to the toolbar. Its panel lists the user's views — click one to
apply it — and saves the current state under a name; saving under an existing name replaces that
view. The button shows the name of the view last applied or saved.

## What a view holds

```ts
interface WeGridSavedView {
  name: string;
  columns: WeGridColumnLayout[];      // order, visibility, width, pin, rename, summary
  density?: WeGridDensity;
  sort?: { field: string; direction: 'asc' | 'desc' } | null;
  filters?: WeGridColumnFilterState[]; // the active filters, as (filterChange) reports them
  groupField?: string | null;
  filterRowVisible?: boolean;
}
```

Applying a view drops whatever no longer fits the grid's columns: a removed column, a filter whose
operator the column doesn't offer, a sort on a column that can't be sorted, a grouping on a grid
whose `grouping` input is off. On a server-side screen the grid emits `(sortChange)`,
`(filterChange)` (with `resetPage: true` when the filters changed) and `(groupChange)` — the same
events the user's own clicks produce, so no extra wiring is needed.

## Where views are stored

Through the same `WE_GRID_LAYOUT_STORE` as the layout, but in a record of their own, under the key
`<gridKey>::views` (`columns` is empty there; the views are in `views`). A custom backend store
therefore keeps them without any change, and "Reset layout" never deletes them.

## Sharing a view

The link icon next to a view copies the current page's URL with the view in a
`we-grid-view-<gridKey>` query parameter. A grid with `savedViews` on reads that parameter when it
first loads and opens in the view; its name is pre-filled in the panel so the recipient can save
it. Two grids on one page use different parameters.

To build the link yourself — a short-link service, your router's own query params — bind
`(viewShare)`. The grid then only emits `{ view, token }`; `weGridDecodeView(token)` turns the
token back into the view and `grid.applyView(view)` applies it:

```ts
onViewShare(e: WeGridViewShareEvent): void {
  this.shortLinks.create(`/orders?view=${e.token}`).subscribe((url) => this.copy(url));
}
```

A token arrives through a URL anyone can edit, so it is decoded defensively: the view is rebuilt
field by field from what has the expected shape, filter values must be plain strings, numbers,
booleans or `null`, and an oversized token is refused.

## Programmatic use

`getCurrentView(name)`, `saveCurrentView(name)`, `applyView(view)`, `deleteView(name)` and
`shareView(view)` are public on `WeGridComponent`, and `views` holds the list — so views can also be
offered from your own UI, or seeded from a backend.
