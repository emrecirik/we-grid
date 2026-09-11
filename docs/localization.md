# Localization

Every piece of user-facing text the grid renders — toolbar buttons, the header context menu, the
filter popover, pagination labels, empty-state messages — comes from the `WE_GRID_LOCALE`
injection token. No text is hardcoded in any component template.

## Default

If you don't provide anything, the grid falls back to English (`weGridLocaleEn`).

## Using the built-in Turkish translation

```ts
import { WE_GRID_LOCALE, weGridLocaleTr } from 'we-grid-angular';

// app.config.ts
providers: [
  { provide: WE_GRID_LOCALE, useValue: weGridLocaleTr }
]
```

You can also provide it at a route or component level (`providers: [...]` on a route or an
`@Component`) if only part of your app needs a different language.

## Providing your own language

Implement the `WeGridLocale` interface (see `we-grid-locale.model.ts` for every field, grouped by
which part of the UI they belong to — the main grid template, the header context menu, and the
filter popover) and provide it the same way:

```ts
import { WE_GRID_LOCALE, WeGridLocale, weGridLocaleEn } from 'we-grid-angular';

const myLocale: WeGridLocale = {
  ...weGridLocaleEn,
  emptyMessage: 'Nichts gefunden',
  columnsButton: 'Spalten',
  // ... override the rest, or spread over weGridLocaleEn and only change what you need
};

{ provide: WE_GRID_LOCALE, useValue: myLocale }
```

A few fields are functions rather than plain strings, since they need to interpolate a value:

```ts
pageAriaLabel: (page: number) => string;                // e.g. (n) => `Page ${n}`
pageOf: (page: number, totalPages: number) => string;   // e.g. (p, t) => `Page ${p} / ${t}`
importSucceeded: (rowCount: number) => string;          // e.g. (n) => `${n} rows read`
summaryGrand: (functionLabel: string) => string;        // e.g. (fn) => `Grand ${fn.toLowerCase()}`
summaryPage: (functionLabel: string) => string;         // e.g. (fn) => `Page ${fn.toLowerCase()}`
```

## Formatting, comparison and sorting

The locale does more than translate: `intlLocale` is the BCP 47 tag every cell **value** goes
through. It drives `Intl.NumberFormat` / `Intl.DateTimeFormat` for number, currency, date and
datetime cells — and so group headers, checklist labels, filter chips, summary numbers and exports —
`toLocaleLowerCase` for the text filter and the checklist's search box, and `localeCompare` for the
order of group headers and checklist values.

| Field | Used for | `weGridLocaleEn` | `weGridLocaleTr` |
|---|---|---|---|
| `intlLocale` | Number/date formatting, case-insensitive matching, sorting | `'en-US'` | `'tr-TR'` |
| `intlCurrency?` | A `type: 'currency'` column with no `format` of its own | *(unset — `'USD'`)* | `'TRY'` |
| `intlTimeZone?` | The IANA zone date and datetime cells are shown in | *(unset — the browser's zone)* | *(unset)* |

With `weGridLocaleTr` that means `1.234,50`, `11.09.2026`, a filter for "istanbul" finding
"İSTANBUL", Ç/Ş/İ/Ğ/Ö/Ü sorted where the Turkish alphabet puts them, and "Sayfa toplamı" /
"Genel toplam" in the summary row.

**A currency column without `format` shows lira under `weGridLocaleTr`.** The currency is a
property of the data, not of the language: if a Turkish-language screen shows dollar amounts, give
the column `format: 'USD'`, or override the fallback for the whole app:

```ts
{ provide: WE_GRID_LOCALE, useValue: { ...weGridLocaleTr, intlCurrency: 'USD' } }
```

`intlTimeZone` only affects how an instant is displayed. Filtering compares calendar days in the
browser's own zone, as it always has.

## Keys added in 0.2.0

Export/import and inline row editing brought their own keys. They are only rendered on grids that
turn those features on, but `WeGridLocale` is an interface — a hand-written locale object that
doesn't spread `weGridLocaleEn` will fail to compile until they are filled in.

- Export/import toolbar: `exportButton`, `exportCsv`, `exportExcel`, `exportPdf`, `exportAllRows`,
  `exportSelectedRows`, `importButton`, `importCsv`, `importExcel`, `importSucceeded`,
  `importFailed`, `importUnmappedColumns`, `refreshButton`
- Row editing: `actionsColumn`, `addRow`, `editRow`, `deleteRow`, `saveRow`, `cancelEdit`,
  `savingRow`, `confirmDeleteRow`, `requiredField`, `saveFailed`

## Keys added in 0.3.0

The checklist header filter (`headerFilterMode: 'checklist'`) brought four more, with the same
caveat: they only render on a grid that uses a checklist column, but a hand-written locale object
that doesn't spread `weGridLocaleEn` will fail to compile until they are filled in.

- `filterSearchPlaceholder` — the search box above the value list
- `selectAll` — the select-all / clear-all checkbox
- `noMatchingValues` — shown when the search matches nothing
- `cancel` — the checklist's third button, next to Clear and Apply

The "(Empty)" entry reuses the existing `emptyGroupValue` key rather than adding a fifth: it is the
same idea the group headers already label that way.

## Keys added in 0.4.0

Before 0.4.0 the grid formatted every value in `en-US` and compared text without a locale, however
the rest of it was translated; the summary row's "Grand "/"Page " prefixes were fixed English. The
same caveat as before applies to the required fields: a hand-written locale object that doesn't
spread `weGridLocaleEn` fails to compile until they are filled in.

- `intlLocale` (required) — see [Formatting, comparison and sorting](#formatting-comparison-and-sorting)
- `intlCurrency`, `intlTimeZone` (optional)
- `summaryGrand`, `summaryPage` (required) — build the summary row's label for a server override
  and for a loaded-page total from the already translated function label (`sum`, `average`, …).
  Functions, not prefixes, because Turkish inflects the word: "Sayfa toplamı", "Sayfa ortalaması".

- `checklistValuesLoading`, `checklistValuesError`, `checklistValuesTruncated`, `retry` (required) —
  the loading line, the error line with its retry button, and the "only the first N values" note of
  a checklist fed by `checklistValuesProvider`. `checklistValuesTruncated` is a function of the
  request limit: `(n) => \`Showing the first ${n} values — narrow your search\``.

`weGridLocaleEn` sets `intlLocale: 'en-US'` and builds exactly the labels 0.3.0 hard-coded, so an
English grid renders the same text as before.

## What locale does NOT cover

`WeGridLocale` covers the grid's own text and how the grid formats and compares cell values. It does
not reach into your cell templates (`weGridCell`), `displayValue` functions or `format` strings —
those render whatever you return. `formatWeGridValue` remains usable on its own: it takes `locale`,
`currency`, `timeZone` and `yesLabel`/`noLabel` options, and the main component passes all of them
from the injected `WeGridLocale`.
