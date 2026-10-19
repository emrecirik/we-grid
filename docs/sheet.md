# `<we-sheet>` — a spreadsheet

*(0.9.0)* A small spreadsheet in the same package as the grid. It uses the grid's formula engine,
format palette, theme variables, locale and exporters, so it looks and reads like the grid next to
it. Where the grid shows records, the sheet is for the tables people otherwise build in Excel:
price lists, budgets, quick calculations.

```ts
import { WeSheetComponent } from 'we-grid-angular';

@Component({
  standalone: true,
  imports: [WeSheetComponent],
  template: `<we-sheet sheetKey="budget-2026" exportFileName="budget" />`
})
export class BudgetComponent {}
```

## What the user can do

| | |
|---|---|
| Type | A value, text or a formula (`=SUM(B2:B9)`) straight into the selected cell. Numbers are read in the user's locale (`1.234,5` in Turkish), `15%` becomes 0.15 shown as a percentage, a leading `'` keeps `'007` as text. Enter / Tab commit and move, Escape cancels, F2 or a double click edits what is there. |
| Formula bar | Shows the active cell's formula; edit it there. The name box shows the selection — type `C12` or `A1:D20` and press Enter to jump. |
| Select | Click, drag, Shift+click, Shift+arrows, Ctrl+arrows to the end of the data, a column or row header for the whole column/row, the corner for everything. |
| Copy & paste | Ctrl+C / Ctrl+X / Ctrl+V. Copying inside the sheet copies whole cells — style, format and formulas, whose relative references move with them (`=A1` pasted one row down is `=A2`, `$A$1` stays). A table pasted from Excel, Google Sheets or a web page arrives as if it had been typed. |
| Undo | Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z), 100 steps. |
| Style | Bold, italic, underline, strikethrough (Ctrl+B / I / U), text colour and fill from the nine-colour palette, alignment. |
| Number format | General, number, whole number, currency (the locale's `intlCurrency`), percent, date (Excel serial dates), text. |
| Sort | A → Z / Z → A by the active column — the selected rows, or every used row below the header row. Numbers before text, blanks last. |
| Fill down | Ctrl+D copies the top row of the selection down through it, shifting relative references. |
| Header row, zebra rows | Row 1 as a header (bold, kept out of sorting, the column titles of an export) and alternate row tint. |
| Grow | Add a row or a column; pasting past the edge grows the sheet. Drag a column header's edge to resize. |
| Status bar | Average, min, max, count and sum of the selection, as in Excel. |
| Export | Excel (`.xlsx`, numbers stay numbers) and CSV, of the used range. |

All formula functions, their Turkish names and the error values are listed in
[formulas.md](formulas.md). A1 references (`B3`, `$B$3`), ranges (`A1:C9`) and whole columns
(`A:A`) work; a formula that refers to itself shows `#CIRC!`.

## Inputs and outputs

| Input | Type | Default | |
|---|---|---|---|
| `sheetKey` | `string` | — | Saves the sheet (debounced) through `WE_SHEET_STORE` and restores it on load |
| `data` | `WeSheetData \| null` | — | The content. Wins over a stored sheet. Binding `(dataChange)` back into it is safe |
| `rows` / `cols` | `number` | `50` / `12` | Size of a new, empty sheet (max 5000 × 200) |
| `readonly` | `boolean` | `false` | No editing; selection, copy and export remain |
| `exportFileName` | `string` | `'sheet'` | File name of exports, without extension |
| `height` | `number \| string` | `420` | Height of the scrolling area (px or any CSS length) |

| Output | |
|---|---|
| `dataChange` | `WeSheetData` after every change |

Public methods: `getData()`, `setData(data)`, `getValue('B3')`, `setCell('C2', '=A2*B2')`,
`select('A1:C5')`, `selectionLabel`, `sort('asc' \| 'desc')`, `fillDown()`, `undo()`, `redo()`,
`addRow()`, `addColumn()`, `exportAs('xlsx' \| 'csv')`, `buildExportTable()`.

Content projected with the `weSheetToolbar` attribute is placed in the toolbar — your own buttons
next to the built-in ones:

```html
<we-sheet #sheet sheetKey="prices">
  <button weSheetToolbar type="button" (click)="sheet.setCell('A1', 'Updated')">Mark</button>
</we-sheet>
```

## Saving to your backend

`WeSheetData` is plain JSON — cells keyed by address, so it reads like the sheet:

```json
{
  "version": 1, "rows": 50, "cols": 12, "headerRow": true,
  "cells": { "A1": { "v": "Item" }, "B2": { "v": 1250, "f": "currency" }, "C2": { "v": "=B2*1.2", "s": { "bold": true } } }
}
```

Provide `WE_SHEET_STORE` to keep sheets somewhere other than localStorage:

```ts
@Injectable()
class HttpSheetStore implements WeSheetStore {
  private http = inject(HttpClient);
  load(key: string) { return this.http.get<WeSheetData | null>(`/api/sheets/${key}`); }
  save(key: string, data: WeSheetData) { return this.http.put<void>(`/api/sheets/${key}`, data); }
}

providers: [{ provide: WE_SHEET_STORE, useClass: HttpSheetStore }]
```

Whatever a store returns is sanitised before use (`weSheetSanitize`): sizes are capped, unknown
fields dropped, colours must be palette names and text is length-limited, so a stored record can
never inject CSS or markup. Formulas are evaluated by the formula engine — never `eval`.

## Utilities

`weSheetAddress`, `weSheetParseAddress`, `weSheetRangeLabel`, `weSheetParseInput`,
`weSheetParseNumber`, `weSheetShiftFormula`, `weSheetStats`, `weSheetSortRange`,
`weSheetFormatValue`, `weSheetSanitize`, `weSheetEmpty` — the pure functions the component is built
on, exported for servers and tests.
