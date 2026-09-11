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

Three fields are functions rather than plain strings, since they need to interpolate a number:

```ts
pageAriaLabel: (page: number) => string;                // e.g. (n) => `Page ${n}`
pageOf: (page: number, totalPages: number) => string;   // e.g. (p, t) => `Page ${p} / ${t}`
importSucceeded: (rowCount: number) => string;          // e.g. (n) => `${n} rows read`
```

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

## What locale does NOT cover

`WeGridLocale` only covers grid-chrome UI text. Formatting of actual cell **values** (numbers,
currency, dates) is handled separately by `formatWeGridValue`, which takes its own `locale` string
(a BCP 47 tag for `Intl.NumberFormat`/`Intl.DateTimeFormat`) and `yesLabel`/`noLabel` for boolean
columns — the main component wires `this.locale.yes`/`this.locale.no` into it automatically, so a
boolean column already reflects your `WeGridLocale`'s `yes`/`no` strings without extra wiring.
