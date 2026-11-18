/**
 * Tallest scroll content the grid builds. Browsers cap an element's height (Firefox near 17.9M px,
 * Chrome near 33.5M px); past this the scrollbar is scaled, so a billion rows still fit.
 */
export const WE_GRID_MAX_SCROLL_PX = 10_000_000;

/** Row height `virtualScroll` assumes until it has measured a rendered row */
export const WE_GRID_DEFAULT_ROW_PX = 36;

/** Which items are in the DOM and how tall the spacers around them are */
export interface WeGridVirtualWindow {
  /** First item rendered (inclusive) */
  start: number;
  /** Last item rendered (exclusive) */
  end: number;
  padTop: number;
  padBottom: number;
  /** The position, clamped to the list */
  pos: number;
  /** Where the scroll area's scrollTop belongs for `pos` */
  scrollTop: number;
}

/**
 * Lays out a virtual list. `pos` is the scroll position in unscaled px (item `i` starts at
 * `i * itemPx`); it equals scrollTop until the list outgrows WE_GRID_MAX_SCROLL_PX, after which
 * the scrollbar maps linearly onto the list.
 */
export function weGridVirtualWindow(count: number, itemPx: number, pos: number, viewportPx: number, overscan = 8): WeGridVirtualWindow {
  const natural = count * itemPx;
  const total = Math.min(natural, WE_GRID_MAX_SCROLL_PX);
  const maxPos = Math.max(0, natural - viewportPx);
  pos = Math.min(Math.max(0, pos), maxPos);
  const scrollTop = weGridScrollTopForPos(count, itemPx, pos, viewportPx);
  const first = pos / itemPx;
  const start = Math.max(0, Math.floor(first) - overscan);
  const end = Math.min(count, Math.ceil((pos + viewportPx) / itemPx) + overscan);
  // The rendered rows sit so that item `first` is exactly at the top of the viewport
  const padTop = Math.max(0, scrollTop - (first - start) * itemPx);
  const padBottom = Math.max(0, total - padTop - (end - start) * itemPx);
  return { start, end, padTop, padBottom, pos, scrollTop };
}

/** Inverse of the scrollbar mapping: the unscaled position for a scrollTop */
export function weGridPosForScrollTop(count: number, itemPx: number, scrollTop: number, viewportPx: number): number {
  const natural = count * itemPx;
  if (natural <= WE_GRID_MAX_SCROLL_PX) return scrollTop;
  const maxScroll = WE_GRID_MAX_SCROLL_PX - viewportPx;
  return maxScroll > 0 ? (scrollTop / maxScroll) * (natural - viewportPx) : 0;
}

export function weGridScrollTopForPos(count: number, itemPx: number, pos: number, viewportPx: number): number {
  const natural = count * itemPx;
  if (natural <= WE_GRID_MAX_SCROLL_PX) return pos;
  const maxPos = natural - viewportPx;
  return maxPos > 0 ? (pos / maxPos) * (WE_GRID_MAX_SCROLL_PX - viewportPx) : 0;
}
