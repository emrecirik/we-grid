# Column types and formatters

A column's `type` decides how its values are shown, filtered, sorted, summed, edited, exported and
imported. Pick the type that matches what the field **stores**; the grid takes care of turning it
into what the user reads and types.

```ts
columns: WeGridColumnDef<Product>[] = [
  { field: 'sku', header: 'SKU' },                                              // text
  { field: 'stock', header: 'Stock', type: 'integer', summary: 'sum' },
  { field: 'priceKurus', header: 'Price', type: 'currency', minorUnits: true },  // 12345 → ₺123,45
  { field: 'discount', header: 'Discount', type: 'percent' },                    // 0.25 → %25
  { field: 'weight', header: 'Weight', type: 'number', formatter: (v) => `${v} kg` },
  { field: 'opensAt', header: 'Opens', type: 'time' },                          // '09:30'
  { field: 'createdAt', header: 'Created', type: 'datetime' },
  { field: 'email', header: 'E-mail', type: 'email' },                          // mailto: link
  { field: 'website', header: 'Website', type: 'url' },                         // opens in a new tab
  { field: 'phone', header: 'Phone', type: 'phone' },                           // tel: link
  { field: 'active', header: 'Active', type: 'boolean' }
];
```

## Every type at a glance

| `type` | Stores | Shows (en-US / tr-TR) | Filter operators | Editor | Summary |
|---|---|---|---|---|---|
| `'text'` *(default)* | any value | as is | contains, starts with, equals | text | count |
| `'number'` | number | `1,234.5` / `1.234,5` | = > < between | number | sum avg min max count |
| `'integer'` | whole number | `1,235` — no decimals | = > < between | number, step 1, rounds | sum avg min max count |
| `'currency'` | amount | `$1,234.50` / `₺1.234,50` | = > < between | number | sum avg min max count |
| `'currency'` + `minorUnits: true` | amount in **kuruş / cents** | `12345` → `₺123,45` | = > < between, **typed in lira** | number, **typed in lira** | sum avg min max count |
| `'percent'` | **fraction** (`0.25`) | `25%` / `%25` | = > < between, **typed as 25** | number, **typed as 25** | sum avg min max count |
| `'date'` | `Date` / ISO string | `09/23/2026` / `23.09.2026` | = before after between | date picker | count |
| `'datetime'` | `Date` / ISO string | `09/23/2026, 02:30 PM` | = before after between (by day) | date-time picker | count |
| `'time'` | `'HH:mm'`, `'HH:mm:ss'` or a `Date` | `02:30 PM` / `14:30` | contains, starts with, equals | time picker | count |
| `'boolean'` | `true` / `false` | locale's Yes / No | All / Yes / No | checkbox | count |
| `'email'` | text | `mailto:` link | contains, starts with, equals | email input | count |
| `'url'` | text | link, new tab, `https://` added when missing | contains, starts with, equals | url input | count |
| `'phone'` | text | `tel:` link (digits and `+` only) | contains, starts with, equals | tel input | count |
| `'custom'` | anything | your `weGridCell` template | contains, starts with, equals | none unless `editor` is set | count |

The locale's `intlLocale`, `intlCurrency` and `intlTimeZone` drive all formatting — see
[localization.md](localization.md). `weGridLocaleTr` gives `1.234,50`, `₺`, `23.09.2026` and `14:30`.

## `format` per type

| Type | `format` | Example |
|---|---|---|
| `number`, `integer`, `percent` | `'min-max'` fraction digits | `'2-2'` → `1,234.50`; on percent `'1-1'` → `25.0%` |
| `currency` | ISO 4217 code — otherwise the locale's `intlCurrency`, then USD | `'EUR'`, `'TRY'`, `'JPY'` |
| `time` | `'HH:mm:ss'` shows seconds | `'14:05:09'` |

## Money stored in kuruş / cents (`minorUnits`)

Payment providers, accounting systems and most banking backends keep money as an **integer number
of minor units** — 12345 kuruş rather than 123.45 lira — so no floating point error can creep in.
Tell the grid, and it converts at the edges only:

```ts
{ field: 'amountKurus', header: 'Amount', type: 'currency', format: 'TRY', minorUnits: true, summary: 'sum' }
```

| Where | Unit |
|---|---|
| Rows in `data`, sorting, the sum/avg the summary row computes | **kuruş** — never touched |
| Cell, summary text, chips, checklist entries, CSV and PDF export | **lira**, formatted: `₺123,45` |
| What the user types in the filter row, the filter popover and the inline editor | **lira**: `123.45` |
| `(filterChange)` values, `(rowUpdate)` / `(rowCreate)` rows | **kuruş**: `12345` |
| Excel export | the number `123.45` |
| CSV / Excel import | `123,45` in the file → `12345` on the row |

So the backend compares like with like — a filter "Amount > 500" typed by the user arrives as

```json
{ "field": "amountKurus", "operator": "gt", "value": 50000 }
```

and goes straight into `WHERE amount_kurus > @value`. The divisor comes from the currency itself
(`Intl`): 100 for TRY, USD and EUR, 1 for JPY, 1000 for KWD — nothing to configure.

`summaryValues` (the server's grand totals) must be sent in kuruş too, like the rows.

## Percentages (`'percent'`)

A percent column stores the **fraction**, the way databases and Excel do: `0.25` is shown as `25%`.
The user types `25` into the filter or the editor, and the grid stores and emits `0.25`. Excel
export writes `0.25` with Excel's own `0.00%` format; importing `25%` gives `0.25`, and a bare `0.25`
stays `0.25`.

If your backend stores `25` for 25%, use `type: 'number'` with a formatter instead:
`formatter: (v) => v == null ? '' : `%${v}``.

## Your own formatter (`formatter`)

When no type prints what you need, give the column a formatter — `(value, row) => string`:

```ts
{ field: 'weight', header: 'Weight', type: 'number', formatter: (v) => (v == null ? '—' : `${v} kg`) },
{ field: 'sizeBytes', header: 'Size', type: 'integer', formatter: (v) => formatBytes(v as number) },
{ field: 'iban', header: 'IBAN', formatter: (v) => String(v ?? '').replace(/(.{4})/g, '$1 ').trim() },
{ field: 'qty', header: 'Qty', type: 'integer', formatter: (v, row) => `${v} ${row?.unit ?? ''}` }
```

- It replaces the built-in text **everywhere a value is shown as text**: the cell and its tooltip,
  the summary row, group headers, checklist entries, filter chips, CSV and PDF export.
- It changes **presentation only**. Sorting, filtering, the summary's arithmetic and the Excel
  number cells still use the raw value — keep `type: 'number'` on a numeric field so sum/avg stays
  available.
- `row` is `null` where there is no single row: the summary row, chips, checklist entries and group
  headers. Write `row?.unit`, not `row.unit`.
- It is also called for `null` / empty values, so it can print a placeholder such as `—`.

### `formatter` vs `displayValue` vs a cell template

| You want | Use |
|---|---|
| Different **text** for the same value (units, masks, custom number styles) | `formatter` |
| A **label for a code** that the user also searches and groups by (`1` → "Draft") | `displayValue` — filtering and grouping switch to the label |
| **Markup** — badges, icons, buttons, colours | a `weGridCell` template (keep the numeric `type` so the summary menu stays) |

## Links (`email`, `url`, `phone`)

The cell renders an `<a>`: `mailto:` for email, `tel:` for phone (spaces, dashes and brackets are
dropped from the link, not from the text), and the address itself for url — opened in a new tab
with `rel="noopener noreferrer"`. A url without `http://` or `https://` gets `https://` in front,
which also means a `javascript:` value can never become a live link. Clicking a link does not fire
`(rowClick)`. The colour is `--we-grid-link-color` — see [theming.md](theming.md).

## Types and the header filter

Since 0.5.0 every filterable column's funnel opens the **checklist** of its distinct values by
default (`'custom'` columns keep the operator popover). That suits closed sets — statuses, cities,
categories, booleans — while free text and continuous ranges (amounts, dates) usually read better
with operators:

```ts
{ field: 'name', header: 'Product', headerFilterMode: 'operator' },
{ field: 'priceKurus', header: 'Price', type: 'currency', minorUnits: true, headerFilterMode: 'operator' }
```

or for the whole grid: `<we-grid headerFilterMode="operator" …>`. On a server-side grid, see
[server-side.md](server-side.md) for listing the values of the whole table rather than the loaded page.
