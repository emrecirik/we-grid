# React support

**There isn't any, and there are no plans to add it.** This page exists so you don't have to find
that out the hard way.

`@we-grid/angular` is built directly on Angular-specific APIs that have no React equivalent:

- **Angular CDK Overlay** for the header context menu and filter popover (positioning, backdrop,
  focus trapping) — this is Angular CDK, not a portable library.
- **`ngTemplateOutlet` + structural directives** (`weGridCell`, `weGridRowDetail`) for custom cell
  content and master-detail rows — these rely on Angular's template/`TemplateRef` model and its
  generic type-inference tricks (`ngTemplateContextGuard`), which don't map onto JSX.
  render-prop/children-as-function patterns.
- **Standalone component architecture** and Angular's dependency injection (`WE_GRID_LOCALE`,
  `WE_GRID_ICONS`, `WE_GRID_LAYOUT_STORE` are all DI tokens) — there's no DI container to hook into
  outside an Angular app.
- Change detection assumptions (`ChangeDetectionStrategy.OnPush`, `markForCheck()`) are meaningless
  outside Angular's runtime.

## Could I wrap it as a web component (Angular Elements)?

Technically, yes — Angular Elements can compile a standalone component down to a custom element
that any framework, including React, can mount. But it would come at a real cost here
specifically: the *whole point* of `weGridCell`/`weGridRowDetail` is projecting **Angular
templates** into the grid for custom cell rendering and master-detail content. A custom-element
wrapper only exposes plain HTML attributes/properties and DOM events at its boundary — you'd lose
template projection, and with it the main way this grid is meant to be customized. You'd be left
with a bare, mostly un-customizable table.

If that trade-off is acceptable for your use case, Angular Elements is the path — but it's outside
the scope of what this repository provides.

## What should I use in React instead?

Two mature, actively maintained, and genuinely React-native options:

- [**TanStack Table**](https://tanstack.com/table) — headless, you build the UI; closest
  philosophically to how much control `@we-grid/angular` gives you over rendering.
- [**AG Grid**](https://www.ag-grid.com/) — a full-featured, batteries-included grid with a React
  wrapper, closer to `@we-grid/angular`'s feature set (grouping, pinning, master-detail, etc.) out
  of the box.

Neither of these is affiliated with this project — they're just the honest recommendation.
