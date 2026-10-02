# Interactive cell templates

A `weGridCell` template can hold real controls — a button group, an input, a select, a link. This
page is the contract between those controls and the grid's own row events.

## Keeping events away from the row

Two tools, usable together:

```ts
{ field: 'decision', header: 'Decision', stopRowEvents: true }          // or ['click', 'dblclick']
```

```html
<we-grid [ignoreInteractiveTargets]="true" ...></we-grid>
```

- **`stopRowEvents`** (column) stops the listed events — `'click' | 'dblclick' | 'contextmenu'`,
  `true` for all three — at the cell. A right click it keeps opens no grid menu; the browser's own
  menu stays. `stopRowClick: true` still means `'click'` only; together, the union applies.
- **`ignoreInteractiveTargets`** (grid) ignores a click, double click or right click that starts on
  an interactive element inside the row: no `(rowClick)` / `(rowDblClick)`, no grid cell menu, no
  `preventDefault` — the browser's copy/paste menu keeps working in an input. Interactive means
  anything matching `WE_GRID_INTERACTIVE_SELECTOR`: links, buttons, inputs, selects, textareas,
  labels, `summary`, contenteditable, the ARIA widget roles (button, switch, checkbox, radio,
  combobox, listbox, option, menuitem, tab), `ng-select`, and anything marked `data-we-grid-ignore`.
  `data-we-grid-allow` on an element (or around it) opts it back in. Clicking the empty part of the
  cell still reaches the row.

`weGridIsInteractiveTarget(event, boundary)` is the same check, exported for your own handlers. It
never looks past `boundary` (a `<label>` around the whole grid doesn't make every click
interactive) and reads the real target from `composedPath()`, so controls inside a shadow root
count.

**Keyboard.** The grid has no row-level key handlers; any it gets in a later version will do nothing
when the target is interactive (`weGridIsInteractiveTarget`) — Space keeps pressing a button, the
arrows keep moving the caret in an input, Enter keeps opening a select.

## State that lives outside the grid

The grid never imposes its own editing state on template controls: keep unsaved decisions and notes
in your component (a `Map`, a form), bind the controls to it, and tell the grid when it changed:

```html
<we-grid [rowClass]="rowClass" [rowStateVersion]="stateVersion" ...>
  <ng-template weGridCell="decision" let-row>
    <button type="button" (click)="approve(row)">Approve</button>
  </ng-template>
</we-grid>
```

```ts
readonly decisions = new Map<string, 'approved' | 'rejected'>();
stateVersion = 0;

approve(row: Task): void {
  this.decisions.set(row.id, 'approved');
  this.stateVersion++;                  // the grid is OnPush — this is what makes it look again
}

rowClass = (row: Task) => (this.decisions.get(row.id) === 'approved' ? 'row-approved' : '');
```

`rowStateVersion` is compared with `!==` only: use a counter or a Symbol. A new object literal on
every change detection would refresh every time (dev mode warns once about an object that keeps
coming back with the same content). `refreshRows()` does the same imperatively. Neither rebuilds a
template: an input keeps its focus and caret, also across a new `data` array with the same
`trackByField` keys.

## Coloured rows

`rowClass` can colour a whole row — pinned cells included — through two variables the library
never sets itself:

```scss
tr.row-approved {
  --we-grid-row-bg: var(--app-success-subtle);   // every cell's background, pinned ones too (stays opaque)
  --we-grid-row-accent: var(--app-success);      // a 3px stripe on the row's first visible cell
}
```

Left undefined, the cells look exactly as before.

## Disabled controls and tooltips

- A cell clips its content. For a dropdown or a tooltip that must spill out, give the column
  `allowOverflow: true` (or render the panel to `<body>`, like `ng-select`'s `appendTo="body"`).
- A disabled button receives no mouse events, so a tooltip on it never shows. Put the tooltip on a
  wrapping element instead:

  ```html
  <span [title]="row.lockedReason">
    <button type="button" [disabled]="row.locked">Approve</button>
  </span>
  ```

- Multi-line content (a name, a note, a reason) needs `wrap: true` on the column; the row grows with it.
