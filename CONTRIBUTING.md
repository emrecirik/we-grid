# Contributing

Thanks for considering a contribution to `we-grid-angular`.

## Setup

```bash
npm install
```

## Development loop

```bash
npm run build:lib     # build the library
npm test              # run the unit tests (headless Chrome)
npm start             # try changes in the playground app
```

The playground app (`projects/playground`) is a dev/documentation sandbox — when adding a feature,
add or extend a demo section there so it's exercised outside of unit tests too.

## Guidelines

- Keep the library free of any styling-framework dependency (no Bootstrap, no Material, no
  hardcoded colors) — everything visual goes through a `var(--we-grid-*, fallback)` custom
  property.
- No hardcoded user-facing text — read/add strings through `WeGridLocale` (see
  `we-grid-locale.model.ts`) and update both `weGridLocaleEn` and `weGridLocaleTr`.
- No icon-font dependency — icons are inline SVG through the `WE_GRID_ICONS` token (see
  `we-grid-icons.model.ts`).
- Comments and identifiers are in English.
- Add or update unit tests (`*.spec.ts`) for any behavioral change.
- Run `npm run build:lib` and `npm test` before opening a PR — both must be clean. CI runs the
  same two steps plus a build of all three sample applications.

## Reporting issues

Please include: Angular version, `we-grid-angular` version, a minimal reproduction (StackBlitz or
a small repo), and the expected vs. actual behavior.
