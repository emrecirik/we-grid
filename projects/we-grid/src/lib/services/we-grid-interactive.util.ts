/**
 * What counts as an interactive element inside a cell: a click, double click or right click that
 * starts on one of these belongs to the control, not to the row — see the grid's
 * `ignoreInteractiveTargets` input. `[data-we-grid-ignore]` marks anything else the same way.
 */
export const WE_GRID_INTERACTIVE_SELECTOR =
  'a[href], button, input, select, textarea, label, summary, [contenteditable=""], [contenteditable="true"], ' +
  '[role="button"], [role="switch"], [role="checkbox"], [role="radio"], [role="combobox"], [role="listbox"], ' +
  '[role="option"], [role="menuitem"], [role="tab"], ng-select, [data-we-grid-ignore]';

/** Escape hatch — an interactive element on or inside one of these still counts as a click on the row */
const WE_GRID_ALLOW_SELECTOR = '[data-we-grid-allow]';

/**
 * Whether the event started on an interactive element (see `WE_GRID_INTERACTIVE_SELECTOR`) that
 * sits inside `boundary` — normally the row. The search never climbs past `boundary`, so a grid
 * placed inside a `<label>` or a link doesn't swallow every click, and a target outside `boundary`
 * is never interactive. The path comes from `composedPath()`, so a control inside a shadow root is
 * recognised too.
 */
export function weGridIsInteractiveTarget(event: Event, boundary?: Element | null): boolean {
  const path = eventPath(event);
  let interactive = false;
  for (const node of path) {
    if (boundary && node === boundary) return interactive;
    if (!(node instanceof Element)) continue;
    if (node.matches(WE_GRID_ALLOW_SELECTOR)) return false;
    if (!interactive && node.matches(WE_GRID_INTERACTIVE_SELECTOR)) interactive = true;
  }
  // The path ran out without meeting the boundary: the target wasn't inside it
  return boundary ? false : interactive;
}

/** The event's propagation path, innermost first — rebuilt from the parent chain where `composedPath` is empty */
function eventPath(event: Event): EventTarget[] {
  const composed = typeof event.composedPath === 'function' ? event.composedPath() : [];
  if (composed.length > 0) return composed;
  const path: EventTarget[] = [];
  let node: Node | null = event.target instanceof Node ? event.target : null;
  while (node) {
    path.push(node);
    node = node.parentNode ?? (node instanceof ShadowRoot ? node.host : null);
  }
  return path;
}
