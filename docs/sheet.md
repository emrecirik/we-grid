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
| Wrap text *(0.28.0)* | The wrap button breaks long text onto more lines and lets the row grow (`WeSheetCell.w`); Excel files keep it. |
| Borders *(0.27.0)* | The borders button: all borders, outside borders, a bottom border or none, for the selection (`WeSheetCell.b`, sides `t` `r` `b` `l`). Drawn in the text colour on the grid lines, and written to Excel files as thin borders. |
| Merge and center *(0.26.0)* | The merge button in the toolbar joins the selection into one cell, keeping the top-left value (centred), or splits the merge back. Moving with the keyboard steps over a merge, a selection that touches one grows to hold it, inserted rows and columns move it, sorting through one is refused with a notice, and Excel files keep it both ways (`WeSheetData.merges`, `weSheetSanitizeMerges`). |
| Typed dates *(0.25.0)* | `2026-01-15`, or `15.01.2026` / `1/15/2026` in the order your locale writes dates, becomes a date (an Excel serial with the date format) that date functions and sorting understand. `weSheetParseDate`. |
| Insert function *(0.24.0)* | The ƒ button by the formula bar lists every function with its arguments; search by English or Turkish name, pick one (or ↑ ↓ Enter) and it goes into the cell's formula. |
| Paste values *(0.21.0)* | Ctrl+Shift+V after copying in the sheet pastes the values the copy showed — no formulas, the target cells keep their formats. |
| Fill down | Ctrl+D copies the top row of the selection down through it, shifting relative references. |
| Fill handle *(0.17.0)* | Drag the square at the selection's corner down, up or sideways: numbers continue their step (`1, 2` → `3, 4`), dates go on by a day, `Item 9` → `Item 10`, formulas shift, anything else repeats. Double-click it to fill down as far as the column beside goes. `fill(range)` does the same from code; from the keyboard, select the start of the series and the empty cells under it and choose **Fill series down** in the context menu (Shift+F10). |
| Header row, zebra rows | Row 1 as a header (bold, kept out of sorting, the column titles of an export) and alternate row tint. |
| Grow | Add a row or a column; pasting past the edge grows the sheet. Drag a column header's edge to resize. |
| Status bar | Average, min, max, count and sum of the selection, as in Excel. |
| Right-click menu *(0.11.0)* | Insert rows above/below, insert columns left/right, delete rows or columns, clear contents or formatting, AutoSum, sort — also on the context-menu key or Shift+F10. Every formula's references follow: inserted rows push them down, deleted cells turn them into `#REF!`, a range that loses an end shrinks. |
| Σ AutoSum *(0.11.0)* | Alt+= or the Σ button: a block gets a `=SUM()` under each column; one cell sums the numbers right above it, or to its left. |
| Open a file *(0.11.0)* | Excel (`.xlsx`) or CSV into the sheet from A1, with row 1 as the header — undoable. *(0.20.0)* An Excel file keeps its layout and its formulas (filled formulas included). *(0.21.0)* In a `<we-workbook>`, a file with several worksheets adds them all as sheets; a taken name gets a number and the formulas that point at it follow. |
| Freeze *(0.11.0)* | Column A stays in view while scrolling sideways; with a header row, row 1 stays at the top. |
| Function suggestions *(0.11.0)* | Typing `=SU` (or `=TOP` in Turkish) lists matching functions with their arguments; arrows choose, Tab or Enter inserts `SUM(`, Escape closes. |
| Find and replace *(0.14.0)* | Ctrl+F finds text in what the cells show (and in formulas), Enter / Shift+Enter walk the matches, "Match case" narrows them; Ctrl+H (or Replace…) replaces one match or all of them — undoable. |
| Filter *(0.19.0)* | **Table options → Filter buttons** (with a header row) puts a button in each header cell: tick the values to show, as in Excel's AutoFilter. Alt+↓ on a header cell opens its filter. Hidden rows keep their numbers; arrow keys and Enter skip them, copy and the status bar leave them out. Kept in `WeSheetData.autoFilter` / `filters` (per column, the texts hidden). |
| Conditional formatting *(0.18.0)* | Right-click → **Conditional formatting** opens the grid's Format panel for the active cell's column — over the selected rows, or its used rows below the header row when one cell is selected. Highlight rules, top/bottom, above/below average, duplicates, colour scales, data bars and icon sets, recomputed on every change (`WeSheetData.formats`, `WeSheetFormatRule` = a `WeGridFormatRule` plus its `range`). Ranges follow inserted and deleted rows and columns. Formula rules are left out. |
| Notes *(0.18.0)* | Right-click → **Note…** adds a note to the selected cells (`WeSheetCell.n`, up to 1000 characters): a triangle marks the corner and the note shows when the cell is pointed at. |
| Dropdown lists *(0.17.0)* | Right-click → **Dropdown list…**, one choice per line, for the selected cells (`WeSheetCell.l`). The active cell shows an arrow (or Alt+↓) to pick a choice; typing anything else is refused with a notice, and a choice typed in another case is written as the list writes it. Paste is not checked, as in Excel. |
| Decimal places *(0.14.0)* | `.0−` / `.00+` in the toolbar: Excel's Decrease / Increase Decimal for the selection (`WeSheetCell.d`). |
| Export | Excel (`.xlsx`) and CSV. *(0.20.0)* The Excel file is the workbook itself: every sheet of a `<we-workbook>`, formulas in Excel's syntax (Turkish names and `;` become `SUM` and `,`) with their results, references between sheets, bold/italic, number formats and column widths. Colours, lists, notes, charts and conditional formats are not written. `weSheetWorkbookXlsx(sheets)`, `weSheetFormulaToExcel(formula)`. |

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
| `importSheets` *(0.21.0)* | `(sheets) => void` | — | Takes the worksheets of an opened Excel file with more than one — `<we-workbook>` sets it |
| `xlsxSheets` *(0.20.0)* | `() => { name, data }[]` | this sheet | The sheets the Excel export writes, when this sheet is one of several — `<we-workbook>` sets it |

| Output | |
|---|---|
| `dataChange` | `WeSheetData` after every change |
| `structureChange` | `{ axis, at, count }` after rows or columns are inserted (`count` > 0) or deleted *(0.16.0)* — `<we-workbook>` uses it to move the other sheets' references |

Public methods: `getData()`, `setData(data)`, `getValue('B3')`, `setCell('C2', '=A2*B2')`,
`select('A1:C5')`, `selectionLabel`, `sort('asc' \| 'desc')`, `fillDown()`, `undo()`, `redo()`,
`addRow()`, `addColumn()`, `insertRows('before' \| 'after')`, `insertColumns('before' \| 'after')`,
`deleteRows()`, `deleteColumns()`, `autoSum()`, `toggleFreezeColumn()`, `openImport()`,
`openFind(withReplace?)`, `findNext(step?)`, `replaceOne()`, `replaceAll()`, `changeDecimals(delta)`,
`insertChart(type?)`, `setChartType(type)`, `removeChart()`,
`exportAs('xlsx' \| 'csv')`, `buildExportTable()`, `fill(range)`, `fillSeries()` *(0.17.0)*,
`saveList(text)`, `saveNote(text)`, `openFormatPanel()` *(0.18.0)*, `toggleAutoFilter()` *(0.19.0)*,
`insertFunction(name)` *(0.24.0)*, `toggleMerge()` *(0.26.0)*,
`setBorders('all' \| 'outside' \| 'bottom' \| 'none')` *(0.27.0)*, `toggleWrap()` *(0.28.0)*.

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
`weSheetFormatValue`, `weSheetSanitize`, `weSheetEmpty`, `weSheetInsert`, `weSheetMoveReferences`,
`weSheetAutoSum`, `weSheetFill`, `weSheetCleanList` *(0.17.0)*, `weSheetSanitizeFormats` *(0.18.0)*, `weSheetFromCells` *(0.21.0)*, `weSheetMoveSheetReferences` *(0.16.0)* — the pure functions the component is built
on, exported for servers and tests.

## Workbooks: several sheets *(0.14.0)*

`<we-workbook>` puts sheets behind tabs, as at the bottom of an Excel window — add one with **+**,
rename with a double-click (or F2), duplicate, delete, and move them with the arrows (or
Ctrl+← / Ctrl+→ on a tab). The whole workbook is one JSON object saved under `workbookKey`
through `WE_SHEET_STORE`:

```html
<we-workbook workbookKey="planning-2027" exportFileName="planning" />
```

```ts
interface WeWorkbookData {
  version: 1;
  sheets: { name: string; data: WeSheetData }[];
  active: number;
}
```

Inputs: `workbookKey`, `data` (wins over a stored workbook), `readonly`, `height`, `rows`, `cols`
(size of a new sheet), `exportFileName`; output `dataChange`.

*(0.15.0)* Formulas read other sheets as in Excel: `=Sales!B2`, `=SUM(Sales!B2:B13)`, and quoted
when the name has spaces or punctuation: `='Q1 sales'!A1`. Renaming a sheet rewrites the
formulas that point at it; deleting one turns them into `#REF!`. Copying and filling shift such
references like any other; inserting rows in one sheet leaves references to the others alone.
A plain `<we-sheet>` can read other sheets too: give it `[resolveSheet]="name => data"`.
