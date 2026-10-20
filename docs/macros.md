# Macros

*(0.10.0)* A macro is a named script of grid steps — the Excel macro idea without code. Users run
macros from the **Macros** toolbar panel or from their own toolbar buttons, record new ones by simply
using the grid, and edit them as text. Scripts are **parsed, never evaluated**: a script can only do
what the steps below allow, so a macro stored in a layout or shared with someone is safe to run.

```html
<we-grid
  gridKey="orders"
  [columns]="columns"
  [data]="orders"
  [grouping]="true"
  [formatting]="true"
  [macros]="macros"
  [allowMacros]="true"
  [macroCommands]="commands"
/>
```

```ts
macros: WeGridMacro[] = [
  {
    id: 'top',
    name: 'Top sellers',
    pinned: true, // its own toolbar button
    script: `
      CLEAR FILTERS
      FILTER [Status] = "Delivered"
      SORT [Total] DESC
      HIGHLIGHT [Total] TOP 10 GREEN BOLD
    `
  }
];

commands: Record<string, WeGridMacroCommand<Order>> = {
  // RUN sendToErp — your own TypeScript, with the grid in hand
  sendToErp: async (grid) => this.erp.push(grid.displayData)
};
```

| Input | |
|---|---|
| `macros` | `WeGridMacro[]` — macros you ship. Users can run them; they cannot edit or delete them |
| `allowMacros` | Users can **record**, **write**, edit, pin and delete their own macros. Saved with the layout (`macros` in `WeGridLayout`), kept across `layoutVersion` bumps |
| `macroCommands` | `Record<string, WeGridMacroCommand<T>>` — functions a script calls with `RUN name` |

| Output | |
|---|---|
| `macroRun` | `{ macro, errors }` after every run |

Public methods: `runMacro(macroOrId)`, `runScript(script)` (both resolve with the problems met),
`startRecording()`, `stopRecording()` (returns the recorded script and opens the editor),
`openMacroDialog(macro?)`.

## The script language

One step per line; blank lines and lines starting with `#` or `//` are ignored. Columns are written
in brackets by their header or field, case-insensitively — `[Total]`, `[total]`. Keywords are
English and case-insensitive. Text values go in double quotes (`""` for a quote inside).

| Step | Does |
|---|---|
| `SORT [Column] ASC` / `DESC` / `NONE` · `CLEAR SORT` | Sorts (or stops sorting) |
| `SORT [City] ASC THEN [Total] DESC` | Sorts by several columns *(0.23.0)* |
| `FILTER [Column] = "text"` · `> 10` · `< 10` | Filters — numbers and dates compare as such, text matches exactly |
| `FILTER [Column] CONTAINS "x"` · `STARTS WITH "x"` | Text filters |
| `FILTER [Column] BETWEEN 1 AND 9` · `IN ("a", "b")` | Range and value-list filters |
| `CLEAR FILTERS` | Removes every filter |
| `GROUP BY [A], [B]` · `UNGROUP` | Grouping, outermost first (`grouping` must be on) |
| `SHOW [A], [B]` · `HIDE [A]` | Column visibility |
| `DENSITY COMPACT` / `NORMAL` / `COMFORTABLE` · `ZEBRA ON` / `OFF` | Row height and zebra rows |
| `HIGHLIGHT [Column] > 1000 GREEN BOLD ROW` | A conditional format rule: `> >= < <= = <>`, `CONTAINS`, `BETWEEN a AND b`, `TOP n`, `BOTTOM n`, `ABOVE AVERAGE`, `BELOW AVERAGE`, `DUPLICATES`, `UNIQUE`, `EMPTY` — then a palette colour (fill and text), `BOLD`, `ITALIC`, `ROW` for the whole row. Yellow when no style is given |
| `HIGHLIGHT ROWS WHERE [Qty] > [Stock] RED` | A row rule on any formula |
| `DATABAR [Column] BLUE` · `COLORSCALE [Column] RED YELLOW GREEN` | Data bars and two- or three-colour scales |
| `ICONSET [Column] ARROWS` · `ICONSET [Column] DOTS REVERSE` | Icon sets (0.16.0) |
| `CLEAR FORMATS` · `CLEAR FORMATS [Column]` | Removes format rules |
| `SET [Column] = formula WHERE condition` | Writes a formula's result into a column, for the rows shown (and matching the optional `WHERE`). Goes through `(rowsPaste)` like a paste — or straight into the rows when nobody listens. Read-only and formula columns refuse, and so does a grid without `editable` *(0.33.1)* |
| `VIEW "Name"` | Applies a saved view |
| `EXPORT XLSX` / `CSV` / `PDF` | Exports, as the toolbar would |
| `RUN name` | Calls `macroCommands[name](grid)` and waits for it |
| `MESSAGE "Done"` | Shows a notice |

Numbers are written as the grid shows them: `FILTER [Margin] > 25` on a percent column means 25 %
(and the recorder writes it that way) *(0.16.0)*.

Palette colours: `RED ORANGE YELLOW GREEN TEAL BLUE PURPLE PINK GRAY`. Formulas use the formula
engine — every function in [formulas.md](formulas.md), English or Turkish names.

Consecutive grid steps are applied together, so a macro that filters, groups and sorts makes the
grid recompute once — and a server-side grid sends one round of `(sortChange)` / `(filterChange)` /
`(groupChange)`, exactly as if the user had applied a saved view.

## Recording

**Macros → Record**, use the grid — filter, sort, group, hide columns, format, export — then **Stop
recording**. The recorder compares the grid before and after and writes the steps that get from one
to the other (plus every export), and opens them in the editor to name, tidy and save:

```
CLEAR FILTERS
FILTER [Quantity] > 6
SORT [City] ASC
EXPORT CSV
```

## Errors

A line the parser can't read is reported with its number in the editor while typing, and skipped
when the macro runs; a step that can't be carried out (an unknown column, a missing view, a command
that throws) is reported after the run. The rest of the script still runs.

## Utilities

`weGridParseMacro(script)` → `{ lines, errors }`, `weGridMacroScript(steps)` (steps back to text),
`weGridDiffViews(before, after, headerOf)` (the recorder), `weGridSanitizeMacros(input)`.
