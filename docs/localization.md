# Localization

Every piece of user-facing text the grid renders — toolbar buttons, the header context menu, the
filter popover, pagination labels, empty-state messages — comes from the `WE_GRID_LOCALE`
injection token. No text is hardcoded in any component template.

## Default

If you don't provide anything, the grid falls back to English (`weGridLocaleEn`).

## Using the built-in Turkish translation

```ts
import { WE_GRID_LOCALE, weGridLocaleTr } from '@we-grid/angular';

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
import { WE_GRID_LOCALE, WeGridLocale, weGridLocaleEn } from '@we-grid/angular';

const myLocale: WeGridLocale = {
  ...weGridLocaleEn,
  emptyMessage: 'Nichts gefunden',
  columnsButton: 'Spalten',
  // ... override the rest, or spread over weGridLocaleEn and only change what you need
};

{ provide: WE_GRID_LOCALE, useValue: myLocale }
```

Two fields are functions rather than plain strings, since they need to interpolate a number:

```ts
pageAriaLabel: (page: number) => string;               // e.g. (n) => `Page ${n}`
pageOf: (page: number, totalPages: number) => string;   // e.g. (p, t) => `Page ${p} / ${t}`
```

## What locale does NOT cover

`WeGridLocale` only covers grid-chrome UI text. Formatting of actual cell **values** (numbers,
currency, dates) is handled separately by `formatWeGridValue`, which takes its own `locale` string
(a BCP 47 tag for `Intl.NumberFormat`/`Intl.DateTimeFormat`) and `yesLabel`/`noLabel` for boolean
columns — the main component wires `this.locale.yes`/`this.locale.no` into it automatically, so a
boolean column already reflects your `WeGridLocale`'s `yes`/`no` strings without extra wiring.
