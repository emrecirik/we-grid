# Formatting

Spreadsheet-style formatting the user controls: bold and colours per column, conditional rules
("highlight values greater than 1000"), colour scales, data bars and zebra rows. Everything is
opt-in and saved with the user's layout and with [saved views](saved-views.md).

```html
<we-grid
  gridKey="orders"
  [columns]="columns"
  [data]="rows"
  [formatting]="true"
  [striped]="true"
  [formatRules]="rules"
></we-grid>
```

## What the user gets

`formatting` adds two entries to the column menu:

- **Format…** opens the column's Format panel.
- **Zebra rows** switches the striped rows on and off for this grid.

The Format panel has two parts, and every change applies at once — there is no Save button:

- **Cell style** — bold, italic, underline, strikethrough, a text colour and a fill for the whole
  column.
- **Conditional formatting** — the column's rules, in priority order. Each rule can be moved up or
  deleted. Below the list, a form adds a new rule:
  - **Highlight cells**: an operator, one or two values, and one of six ready-made styles
    (light red fill with dark red text, yellow, green, blue, red text, bold text), optionally
    applied to the **entire row**.
  - **Colour scale** (numeric and date columns): red to green, green to red, red–yellow–green or
    grey to blue.
  - **Data bar** (numeric and date columns): a bar in one of the palette colours.

**Clear all rules** removes the column's rules.

## Operators

| Operator | Matches when the cell… |
|---|---|
| `gt` `gte` `lt` `lte` `eq` `neq` | compares with `value` — numbers and dates numerically, text case-insensitively |
| `between` / `notBetween` | is (not) between `value` and `value2`, both inclusive |
| `contains` `notContains` `startsWith` `endsWith` | text matches, case-insensitively |
| `empty` / `notEmpty` | is (not) blank |
| `top` / `bottom` | is one of the `value` highest / lowest numbers of the column (default 10) |
| `aboveAverage` / `belowAverage` | is above / below the column's average |
| `duplicate` / `unique` | appears more than once / exactly once in the column |
| `formula` | `value` is a formula that returns TRUE or a non-zero number for the row, e.g. `=[Amount] > [Limit]` — see [formulas.md](formulas.md) |

Rules are evaluated over the rows the grid currently shows, as in Excel: a filter changes what
"top 10", "above average" or a colour scale's range means. On a server-side grid that is the loaded
page.

## Priority

Where several rules style the same cell, **the first rule in the list wins** for each property it
sets — a later rule can still add bold to a cell an earlier rule made red. Layers, from bottom to top:
the column's cell style, a colour scale or data bar, then the fill of a matching rule (a row rule's
fill included).

## Rules from code

`formatRules` sets the rules the grid starts with. Once the user edits the rules in the panel, their
list is saved and replaces yours.

```ts
import { WeGridFormatRule } from 'we-grid-angular';

rules: WeGridFormatRule[] = [
  { id: 'late', field: 'dueDate', type: 'condition', operator: 'lt', value: '2026-10-01', style: { fill: 'red', color: 'red' }, applyTo: 'row' },
  { id: 'big', field: 'amount', type: 'condition', operator: 'top', value: 5, style: { bold: true } },
  { id: 'heat', field: 'margin', type: 'colorScale', colors: ['red', 'yellow', 'green'] },
  { id: 'bar', field: 'quantity', type: 'dataBar', color: 'blue' },
  { id: 'over', field: 'amount', type: 'condition', operator: 'formula', value: '=[Amount] > [Credit limit]', style: { color: 'orange' } }
];
```

```ts
interface WeGridFormatRule {
  id: string;                         // unique per grid
  field: string;
  type: 'condition' | 'colorScale' | 'dataBar';
  operator?: WeGridFormatOperator;    // 'condition'
  value?: string | number | null;
  value2?: string | number | null;    // between / notBetween
  style?: WeGridCellStyle;            // 'condition'
  applyTo?: 'cell' | 'row';           // default 'cell'
  colors?: WeGridFormatColor[];       // 'colorScale': two or three, lowest value first
  color?: WeGridFormatColor;          // 'dataBar'
}

interface WeGridCellStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: WeGridFormatColor;          // text
  fill?: WeGridFormatColor;           // background
}
```

`WeGridFormatColor` is one of `'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple' |
'pink' | 'gray'` (`WE_GRID_FORMAT_COLORS`). The presets the panel offers are exported as
`WE_GRID_FORMAT_PRESETS` and `WE_GRID_FORMAT_SCALES`.

## A column's default style

`cellStyle` on a column definition is its base style. The user's choice in the Format panel is saved
and wins over it; clearing it in the panel is saved too (as an empty style).

```ts
{ field: 'customer', header: 'Customer', cellStyle: { bold: true } }
```

## Zebra rows

`striped` tints every other row with `--we-grid-stripe-bg`. With `formatting` on, the user's
**Zebra rows** choice is saved and wins over the input. Hover, selection and editing are drawn over
the stripe, and pinned cells stay opaque.

## Persistence and sharing

The user's zebra choice and rules are stored in the layout (`striped`, `formatRules` on
`WeGridLayout`) and column styles in each column's layout (`style`). Saved views carry `striped` and
`formatRules` too, so a view can bring its own highlighting. **Reset layout** returns to the inputs.

A rule names a palette colour, never a CSS value: a stored layout or a shared view link is rebuilt
field by field (`weGridSanitizeFormatRules`, `weGridSanitizeCellStyle`), unknown operators and
colours are dropped, and the CSS the grid writes only ever contains `var(--we-grid-format-*)`
references — a shared link cannot inject styles.

## Theme variables

| Variable | Used for |
|---|---|
| `--we-grid-stripe-bg` | Zebra row tint |
| `--we-grid-format-<colour>-fg` | Text colour, colour scale and data bar for `<colour>` |
| `--we-grid-format-<colour>-bg` | Fill for `<colour>` |

`<colour>` is each of the nine palette names. All are defined for light and dark in
`we-grid-theme.scss` — see [theming.md](theming.md). Colour scales and data bars use CSS
`color-mix()`, available in every current browser.

## Decimal places (0.13.0)

For number and percent columns the Format panel has **Decimal places**: fewer, more (0 to 6) or
automatic. The choice is the column's `format` (`'3-3'`), saved with the layout and in views like
the rest of the panel; currency columns keep their currency's decimals.

## Icon sets (0.16.0)

`{ id, field, type: 'iconSet', icons: 'arrows' }` puts ▲ ► ▼ (or, with `'dots'`, traffic lights)
before each number: green for the top third of the column's range, yellow for the middle, red for
the bottom — `reverse: true` when low is good (costs, delays). The shapes are CSS masks and the
colours the palette's `--we-grid-format-green/yellow/red-fg`, so dark mode and your theme apply.
In a macro: `ICONSET [Total] ARROWS` or `ICONSET [Delay] DOTS REVERSE`.
