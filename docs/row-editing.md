# Inline row editing

The grid can create, update and delete rows in place. It owns the editing UI — the draft row, the
per-cell editors, validation and the saving state — and nothing else: **it never mutates the `data`
array you gave it and never talks to a backend.** Every commit leaves as an event carrying a `done`
callback, so an asynchronous save keeps the row in its saving state and only closes the editor once
the server has accepted the change.

```html
<we-grid
  gridKey="orders"
  [columns]="columns"
  [data]="rows"
  [editable]="true"
  [allowAdd]="true"
  [allowDelete]="true"
  [showRefresh]="true"
  [newRowTemplate]="{ status: 'draft', quantity: 1 }"
  trackByField="id"
  (rowCreate)="onCreate($event)"
  (rowUpdate)="onUpdate($event)"
  (rowDelete)="onDelete($event)"
  (refresh)="reload()"
></we-grid>
```

Turning any of `editable` / `allowDelete` on adds an action column pinned to the far right. It is
the only layout change: right-pinned data columns shift inward by its width, nothing else moves.

## Which columns are editable

Every column is editable by default except `type: 'custom'` — the grid has no idea what shape a
value rendered through your own template has. Opt in or out per column:

```ts
columns: WeGridColumnDef<Order>[] = [
  { field: 'code', header: 'Code', required: true },
  { field: 'customer', header: 'Customer', editable: false },
  { field: 'quantity', header: 'Qty', type: 'number' },
  { field: 'orderedAt', header: 'Ordered', type: 'date' },
  { field: 'status', header: 'Status', editor: 'select',
    editorOptions: [{ value: 'draft', label: 'Draft' }, { value: 'sent', label: 'Sent' }] },
  { field: 'actions', header: '', type: 'custom', exportable: false }
];
```

| Column option | Effect |
|---|---|
| `editable` | Whether the cell becomes an editor. Default `true`, except `type: 'custom'`. |
| `editor` | `'text' \| 'number' \| 'date' \| 'datetime' \| 'time' \| 'email' \| 'url' \| 'tel' \| 'checkbox' \| 'select'`. Inferred from `type` when omitted: number/integer/currency/percent → `number`, time → `time`, email → `email`, url → `url`, phone → `tel`, boolean → `checkbox`. |
| `editorOptions` | `{ value, label }[]` for a `select` editor. |
| `required` | The value may not be left empty. Blocks Save and outlines the cell. |

A number editor works in the units the user reads: a `percent` column is edited as `25` and saved
as `0.25`, a `currency` column with `minorUnits: true` is edited as `123.45` and saved as `12345`
kuruş, and an `integer` column rounds to a whole number. `(rowUpdate)` / `(rowCreate)` always carry
the stored units — see [column-types.md](column-types.md). A `time` editor keeps a `'HH:mm'` string a
string, and on a `Date` field changes only the time of day.

A date editor reports its value back in the shape the row already used: a field that arrived as a
string is emitted as a string, one that was a `Date` stays a `Date`. The two editors deliberately
send different strings:

| Editor | Field arrived as a string | Field arrived as a `Date` |
|---|---|---|
| `date` | The picked calendar day, `"2026-09-11"` — no time, no zone | A `Date` |
| `datetime` | The UTC instant of the picked local time, `"2026-09-11T14:30:00.000Z"` | A `Date` |

A `date` column holds a day, not an instant, so it is sent as one. Before 0.4.0 it was sent as UTC
midnight: a row the backend had stored as local midnight (`"2026-09-10T21:00:00.000Z"` in UTC+3)
showed the right day in the editor but came back with a different timestamp after saving.

## Committing

```ts
onUpdate(e: WeGridRowEditEvent<Order>): void {
  this.http.patch(`/api/orders/${e.original!.id}`, e.changes).subscribe({
    next: () => {
      this.rows = this.rows.map((r) => (r === e.original ? e.row : r));
      e.done(true);
    },
    error: (err) => e.done(false, err.error?.message)
  });
}
```

- `e.row` — a copy of the row with the edits applied. The row inside `data` is untouched.
- `e.original` — the row the edit started from, `null` when creating.
- `e.changes` — only the fields that actually changed, ready to send as a PATCH body. Empty for a
  creation. A commit where nothing changed closes the editor without emitting anything.
- `e.done(true)` closes the editor. `e.done(false, message)` leaves it open with the user's values
  intact and shows `message` in the notice strip under the toolbar.

Deleting works the same way, through `(rowDelete)` with `{ row, rowIndex, done }`. The delete
button stays disabled until `done` answers. `confirmDelete` (on by default) calls `window.confirm`
first; turn it off to run your own dialog before letting the click reach the grid — the library
deliberately has no dialog system of its own.

`(refresh)` carries no payload at all: the toolbar button exists so reloading has an obvious home,
and what reloading means is entirely yours.

## Without a backend

If an output has no subscriber, the grid falls back to applying the change to the loaded rows, so
playgrounds, demos and purely local grids work with no wiring. That fallback writes through to your
own objects, which is exactly why binding the output is the documented path — only then do you
control when, and whether, the change lands.

## Form mode

`editMode="form"` keeps everything above — the events, `done`, `required` validation, the local
fallback — and only moves the editors: the pencil and "Add row" open a modal record form with one
labelled field per editable column instead of turning the row into inputs.

```html
<we-grid [columns]="columns" [data]="rows" [editable]="true" [allowAdd]="true" editMode="form" ...></we-grid>
```

- The form lists every editable column in column order, **hidden ones included** — a column the
  user hid from the table is still part of the record. Make a column `editable: false` to keep it
  out.
- Each field uses the same editor as the inline mode, so `editor`, `editorOptions`, `minorUnits`
  and percent scaling behave identically.
- Enter submits, Escape cancels, focus stays inside the dialog while it is open and returns to
  where it was when it closes. A rejected `done(false, message)` shows the message in the form.
- The dialog is `position: fixed` inside the grid. An ancestor with a CSS `transform` makes that
  ancestor its containing block — avoid wrapping the grid in one when using form mode.

## Pasting from a spreadsheet

On an `editable` grid, click a cell and press Ctrl+V with a range copied from Excel, LibreOffice or
Google Sheets. The range lands with its top-left cell on the clicked one and spreads right across
the visible columns and down across the rows as they are shown (sorted, filtered, grouped).

- Each cell is converted to its column's type exactly like a file import: `₺1.234,56`, `12,5%`,
  `11.09.2026`, `evet` / `no` all arrive as numbers, fractions, dates and booleans; a `select`
  column also matches an option's label.
- Read-only columns inside the range keep their values. Cells that don't fit their type, or that
  would empty a `required` column, are skipped and listed in the notice.
- Rows that run past the last row become new rows when `allowAdd` is on (starting from
  `newRowTemplate`), and are dropped otherwise.
- The whole paste arrives as **one** `(rowsPaste)` event, so it can be saved in one request:

```ts
onPaste(e: WeGridRowsPasteEvent<Order>): void {
  this.api.saveBatch(e.updates.map((u) => ({ id: u.original.id, ...u.changes })), e.created).subscribe({
    next: () => {
      this.reload();
      e.done(true);
    },
    error: (err) => e.done(false, err.message)
  });
}
```

Without a `(rowsPaste)` subscriber the values are written onto the loaded rows, like the editor's
fallback. A paste into any text box — an editor, the filter row — is left to that text box. Set
`[allowPaste]="false"` to switch the feature off.

## Notes

- Only one row is editable at a time. Opening another editor replaces the current one; a row that
  is mid-save cannot be abandoned.
- Changing `page` cancels an open editor — the draft belongs to a row of the page being left.
- Editing state is never persisted. It is not part of `WeGridLayout`, and nothing about it survives
  a reload.
- Validation covers `required` only. Anything richer — cross-field rules, uniqueness, formats —
  belongs in your `done(false, message)` path, where the real answer lives anyway.
