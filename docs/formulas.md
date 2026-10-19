# Formulas

Computed columns written as Excel formulas — by you in the column definition, or by the user from
the column menu. The engine is part of the package: no dependency, and no `eval` or
`new Function` — a formula is parsed and evaluated by the grid's own interpreter, so a formula
arriving in a shared view link can only compute, never run code.

## Formula columns in code

```ts
columns: WeGridColumnDef<OrderLine>[] = [
  { field: 'price', header: 'Price', type: 'currency' },
  { field: 'qty', header: 'Quantity', type: 'integer' },
  { field: 'total', header: 'Total', type: 'currency', formula: '=[Price] * [Quantity]', summary: 'sum' },
  { field: 'level', header: 'Level', formula: '=IF([Total] > 2000, "High", IF([Total] > 500, "Mid", "Low"))' }
];
```

A formula column's value is what the cell shows **and** what it sorts, filters, groups, sums and
exports by. Its `field` does not need to exist on the row. Formula columns are read-only (`editable`
defaults to `false`). A formula that fails shows its Excel error code in the cell and in exports.

## Formula columns the user adds

```html
<we-grid gridKey="orders" [columns]="columns" [data]="rows" [allowFormulaColumns]="true"></we-grid>
```

The column menu gets **Add formula column…**, and the user's own formula columns also get
**Edit formula…** and **Delete column**. The dialog has:

- a name and the formula, with a syntax check that points at the character it cannot read;
- one-click inserts for every column (`[Header]`) and the most used functions;
- the result type — number, currency, percent, whole number, text, date or yes/no;
- a live preview of the result on the first shown row.

User formula columns are stored in the layout (`formulaColumns` on `WeGridLayout`) and in saved
views, as `WeGridFormulaColumn` (`field`, `header`, `formula`, `type?`). Their fields always start
with `fx:` so they can never shadow a data field; anything else in a stored or shared list is
dropped (`weGridSanitizeFormulaColumns`). Width, order, pin and summary of a user formula column are
saved like any other column's. **Reset layout** removes them.

## Syntax

| | |
|---|---|
| Leading `=` | Optional |
| `[Name]` | Another column of the same row, by its **field or its header**, case-insensitively (`[qty]`, `[Quantity]`) |
| Numbers | `12`, `0.18` — the decimal separator is always `.` |
| Text | `"abc"`; `""` inside text is a quote |
| Logical | `TRUE` / `FALSE` (also `DOĞRU` / `YANLIŞ`) |
| Operators | `+ - * / ^`, `&` (join text), `= <> < > <= >=`, unary `-`, postfix `%` |
| Arguments | Separated by `,` or `;` — both work, so formulas copied from a Turkish Excel paste as they are |
| Functions | Case-insensitive, English or Turkish names |

Text compares case-insensitively, as in Excel. A reference to an unknown column is `#NAME?`.

## Functions

| Function | Turkish | |
|---|---|---|
| `SUM` | `TOPLA` | Sum, skipping blanks and text |
| `AVERAGE` | `ORTALAMA` | Average |
| `MIN` / `MAX` | `MİN` / `MAK` | Smallest / largest |
| `COUNT` / `COUNTA` | `BAĞ_DEĞ_SAY` / `BAĞ_DEĞ_DOLU_SAY` | Numbers / non-blank values |
| `COUNTIF` `SUMIF` `AVERAGEIF` | `EĞERSAY` `ETOPLA` `EĞERORTALAMA` | With a criteria such as `">10"`, `"<>x"`, `"abc"`, `5` |
| `IF` / `IFS` | `EĞER` / `ÇOKEĞER` | Conditions |
| `IFERROR` | `EĞERHATA` | A fallback for an error |
| `AND` `OR` `NOT` | `VE` `YADA` `DEĞİL` | Logic |
| `ROUND` `ROUNDUP` `ROUNDDOWN` | `YUVARLA` `YUKARIYUVARLA` `AŞAĞIYUVARLA` | Rounding to n digits |
| `ABS` `INT` `MOD` `POWER` `SQRT` | `MUTLAK` `TAMSAYI` `MOD` `KUVVET` `KAREKÖK` | Maths |
| `LEN` `LEFT` `RIGHT` `MID` | `UZUNLUK` `SOLDAN` `SAĞDAN` `PARÇAAL` | Text slicing |
| `UPPER` `LOWER` `PROPER` `TRIM` | `BÜYÜKHARF` `KÜÇÜKHARF` `YAZIM.DÜZENİ` `KIRP` | Text casing and spaces |
| `CONCAT` / `CONCATENATE` | `BİRLEŞTİR` | Join text |
| `TEXT` | `METNEÇEVİR` | A number in a format: `0`, `0.00`, `#,##0.00`, `0%` |
| `TODAY` / `NOW` | `BUGÜN` / `ŞİMDİ` | Current date / date and time |
| `YEAR` `MONTH` `DAY` `DATE` | `YIL` `AY` `GÜN` `TARİH` | Date parts / build a date |
| `VLOOKUP` `MATCH` `INDEX` | `DÜŞEYARA` `KAÇINCI` `İNDİS` | Lookups over ranges (sheet mode) |

`WE_GRID_FORMULA_FUNCTIONS` lists the canonical names. Dates are `Date` objects; `date ± number`
adds days and the difference of two dates is a number of days.

Known limits: `TEXT` supports number formats only (no date codes); `UPPER`/`LOWER` use invariant
casing (`i` → `I`, not `İ`); a formula returning a whole range shows `#VALUE!` (no spilling).

## Errors

Errors are values, as in Excel: they flow through operators and functions, and `IFERROR` catches
them.

| Code | Meaning |
|---|---|
| `#DIV/0!` | Division by zero |
| `#VALUE!` | A value of the wrong kind (`"abc" * 2`) |
| `#NAME?` | Unknown function or column |
| `#REF!` | A cell reference where none is available (A1 in a row formula) |
| `#N/A` | A lookup found nothing |
| `#NUM!` | A number out of range (`SQRT(-1)`) |
| `#CIRC!` | Columns that refer to each other in a loop — reported, never an endless loop |
| `#ERROR!` | The formula cannot be read |

## Using the engine directly

Exported for your own screens and tests:

- `weGridCompileFormula(source)` → `WeGridFormula` (`source`, `evaluate(scope)`, `fieldRefs`,
  `hasCellRefs`); throws `WeGridFormulaSyntaxError` (with a 0-based `position`). Compiled formulas
  are cached by source.
- `weGridTryCompileFormula(source)` → `{ formula }` or `{ error }`, never throws.
- `WeGridFormulaScope` — what `evaluate` reads: `field(name)` for `[Name]`, `cell(col, row)` and
  `range(...)` for A1 references, `now()` for `TODAY`/`NOW`.
- `WeGridSheetEvaluator` — evaluates a whole grid of raw cell inputs (strings starting with `=` are
  formulas, `A1`, `$A$1`, `A1:B5`, `A:A`), memoised and cycle-safe; call `invalidate()` after edits.
- `WeGridFormulaError` (`code`), `weGridIsFormula(value)`, `weGridColumnLetter(index)` /
  `weGridColumnIndex(letters)`, `weGridFormulaValueToText(value)`.

```ts
const total = weGridCompileFormula('=ROUND([Price] * [Qty] * 1.2, 2)');
const row = { price: 12.55, qty: 2 };
total.evaluate({ field: (name) => row[name.toLowerCase() as keyof typeof row] }); // 30.12
```

Formulas also drive `formula` [formatting rules](formatting.md).

## Other sheets *(0.15.0)*

In `<we-workbook>`, `Sheet2!A1`, `Sheet2!A1:B9` and `'Name with spaces'!A1` read another sheet
(`''` for a quote inside the name). An unknown sheet gives `#REF!`. Engine scopes provide them
through `sheetCell(sheet, col, row)` / `sheetRange(sheet, …)` on `WeGridFormulaScope`, and
`WeGridSheetEvaluator` takes `{ sheet: name => evaluator }`.
