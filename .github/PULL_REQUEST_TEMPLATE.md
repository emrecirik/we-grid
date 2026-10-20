## What and why

<!-- What changes for the people using the grid, and the issue it closes, if any. -->

## Checklist

- [ ] `npm run build:lib` and `npm test` pass
- [ ] New behaviour has a `*.spec.ts`
- [ ] Colours and spacing go through `var(--we-grid-*, fallback)`; new variables are in all three blocks of `styles/we-grid-theme.scss`
- [ ] New text is a `WeGridLocale` key, filled in every locale
- [ ] Anything a consumer imports is exported from `src/public-api.ts`
- [ ] Docs and `CHANGELOG.md` (under "Unreleased") are updated
