# Theming

`we-grid-angular` never hardcodes colors or depends on a design system — every visual token comes
from a CSS custom property with a fallback, e.g. `background: var(--we-grid-bg, #fff)`. This means
you can theme it two ways:

1. Import the bundled default theme (`styles/we-grid-theme.scss`) and override individual
   variables to match your brand.
2. Ignore the bundled theme entirely and just define your own values for the variables you care
   about — every variable already has a sensible built-in fallback, so you only need to set the
   ones you want to change.

## Variable reference

| Variable | Used for |
|---|---|
| `--we-grid-bg` | Grid background, row/cell background |
| `--we-grid-font-color` | Default text color |
| `--we-grid-border-color` | All borders (header, rows, dividers) |
| `--we-grid-header-bg` / `--we-grid-header-color` | Header row background/text |
| `--we-grid-row-hover-bg` | Row hover background |
| `--we-grid-row-selected-bg` | Selected row background |
| `--we-grid-accent-color` | Sort icon, active states, chips, pager active button |
| `--we-grid-muted-color` | Secondary/muted text (footer info, group summary) |
| `--we-grid-font-size` / `--we-grid-font-size-compact` | Base font size / compact density font size |
| `--we-grid-radius` | Border radius on buttons, chips, the grid container |
| `--we-grid-row-height` | Row height — also switched per density (`comfortable`/`compact`) |
| `--we-grid-skeleton-base` / `--we-grid-skeleton-shine` | Loading skeleton gradient colors |
| `--we-grid-menu-bg` / `--we-grid-menu-color` | Header/filter context menu background & text |
| `--we-grid-menu-shadow` | Context menu drop shadow |
| `--we-grid-warning-color` | "Only this page is searched/sorted" hint |
| `--we-grid-chips-bg` | Active-filter chip strip background |
| `--we-grid-detail-bg` | Master-detail row background |
| `--we-grid-summary-bg` | Summary (subtotal) row background |

## Dark mode

Set `data-theme="dark"` on `<html>` or `<body>` to switch to dark values, or rely on
`prefers-color-scheme` (the bundled theme reacts to the OS setting automatically when no explicit
`data-theme` is set). The pattern used in `we-grid-theme.scss`:

```scss
:root { /* light defaults */ }

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) { /* dark values */ }
}

:root[data-theme='dark'] { /* dark values again, so an explicit toggle always wins */ }
```

## Icons

Every icon the grid uses is inline SVG, provided through the `WE_GRID_ICONS` injection token
(`WeGridIcons = Record<string, string>`, icon key → raw SVG markup). There is no icon-font
dependency (no Remix Icon, Font Awesome, Material Icons, ...).

To replace the whole icon set:

```ts
import { WE_GRID_ICONS, WeGridIcons } from 'we-grid-angular';

const myIcons: WeGridIcons = {
  close: '<svg>...</svg>',
  filter: '<svg>...</svg>',
  // ... every key used by the grid — see weGridDefaultIcons for the full list
};

// app.config.ts / route providers
{ provide: WE_GRID_ICONS, useValue: myIcons }
```

If you omit a key, that icon renders empty — always provide a complete map (start from
`weGridDefaultIcons` and override individual entries if you only want to swap a few).
