import { InjectionToken } from '@angular/core';

/** Icon-key → raw SVG markup string. Every key the grid uses must be present or the icon renders empty. */
export type WeGridIcons = Record<string, string>;

function svg(path: string): string {
  return `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" xmlns="http://www.w3.org/2000/svg">${path}</svg>`;
}

/**
 * Built-in icon set used when the host application doesn't provide its own `WE_GRID_ICONS`.
 * Deliberately minimal line-style glyphs so the library never depends on an icon font (no Remix
 * Icon, Font Awesome, Material Icons, ...). Swap the whole set by providing `WE_GRID_ICONS`
 * yourself — see docs/theming.md.
 */
export const weGridDefaultIcons: WeGridIcons = {
  stack: svg('<path d="M12 2 2 7l10 5 10-5-10-5Zm0 7.24L4.53 7 12 4.24 19.47 7 12 9.24ZM2 12l10 5 10-5v2l-10 5-10-5v-2Zm0 5 10 5 10-5v2l-10 5-10-5v-2Z"/>'),
  close: svg('<path d="M18.3 5.71 12 12.01l-6.3-6.3-1.41 1.41 6.3 6.3-6.3 6.29 1.41 1.41 6.3-6.29 6.3 6.29 1.41-1.41-6.3-6.29 6.3-6.3z"/>'),
  filter: svg('<path d="M4 5h16v2l-6 7v5l-4 2v-7L4 7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>'),
  filterFilled: svg('<path d="M4 5h16v2l-6 7v5l-4 2v-7L4 7z"/>'),
  filterOff: svg('<path d="M20 5H4v1.5l6 7V19l4-2v-5.5l6-7V5Zm-1.4-2L21 4.4 4.4 21 3 19.6 18.6 3Z"/>'),
  settings: svg('<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-3.5a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.5-2.4 1a7.5 7.5 0 0 0-2.1-1.2L14.4 3H9.6l-.4 2.5a7.5 7.5 0 0 0-2.1 1.2l-2.4-1-2 3.5 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.5 2.4-1c.6.5 1.3.9 2.1 1.2l.4 2.5h4.8l.4-2.5c.8-.3 1.5-.7 2.1-1.2l2.4 1 2-3.5-2-1.6c.1-.4.1-.8.1-1.2Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>'),
  warning: svg('<path d="M12 3 2 20h20L12 3Zm0 5.5 5.7 9.9H6.3L12 8.5Z"/><rect x="11.1" y="12" width="1.8" height="4.2"/><rect x="11.1" y="16.8" width="1.8" height="1.8"/>'),
  inbox: svg('<path d="M4 4h16l2 8v8H2v-8L4 4Zm0 2-1.5 6H8l1 2h6l1-2h5.5L18 6H4Z"/>'),
  chevronDown: svg('<path d="M6.7 9.3 12 14.6l5.3-5.3 1.4 1.4L12 17.4 5.3 10.7z"/>'),
  chevronRight: svg('<path d="M9.3 6.7 14.6 12l-5.3 5.3 1.4 1.4L17.4 12 10.7 5.3z"/>'),
  chevronFirst: svg('<path d="M7 6h2v12H7zM17.7 6.7 12.4 12l5.3 5.3-1.4 1.4L9.6 12l6.7-6.7z"/>'),
  chevronLast: svg('<path d="M15 6h2v12h-2zM6.3 6.7 11.6 12l-5.3 5.3 1.4 1.4L14.4 12 7.7 5.3z"/>'),
  eyeOff: svg('<path d="M2 4.3 3.3 3l18 18-1.3 1.3-3.1-3.1a11.6 11.6 0 0 1-4.9 1.1C7.5 20.3 3.7 17.6 2 12c.7-2.3 2-4.1 3.5-5.5L2 4.3Zm5 5L8.6 11a3.5 3.5 0 0 0 4.4 4.4l1.6 1.6a5.5 5.5 0 0 1-7.6-7.7ZM12 6c4.5 0 8.3 2.7 10 8-.6 1.8-1.5 3.3-2.7 4.4l-1.4-1.4c.9-.8 1.6-1.8 2.1-3-1.5-3.6-4.4-5.5-8-5.5-1 0-2 .2-2.9.5L7.5 7.4C8.9 6.5 10.4 6 12 6Zm0 3.5c.3 0 .5 0 .8.1l3.6 3.6c.1-.3.1-.5.1-.8a4.5 4.5 0 0 0-4.5-4.5Z"/>'),
  eye: svg('<path d="M12 5c-6.3 0-10 6-10 7s3.7 7 10 7 10-6 10-7-3.7-7-10-7Zm0 11.5A4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 0 1 0 9Zm0-7A2.5 2.5 0 1 0 12 14.5a2.5 2.5 0 0 0 0-5Z"/>'),
  pencil: svg('<path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25ZM20.7 7.04a1 1 0 0 0 0-1.42l-2.34-2.34a1 1 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82Z"/>'),
  wrapText: svg('<path d="M3 6h18v2H3V6Zm0 5h13a3.5 3.5 0 0 1 0 7h-3v2l-4-3 4-3v2h3a1.5 1.5 0 0 0 0-3H3v-2Zm0 9h6v-2H3v2Z"/>'),
  arrowLeftRight: svg('<path d="M7 7 3 11l4 4v-3h10v-2H7V7Zm10 6 4 4-4 4v-3H7v-2h10v-3Z"/>'),
  pin: svg('<path d="M13 3 11 5v5.6L6 15v2h6v5l1 2 1-2v-5h6v-2l-5-4.4V5l-2-2Z"/>'),
  calculator: svg('<path d="M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm0 2v4h12V4H6Zm0 6v2h2v-2H6Zm4 0v2h2v-2h-2Zm4 0v6h2v-6h-2Zm-8 4v2h2v-2H6Zm4 0v2h2v-2h-2Zm-4 4v2h2v-2H6Zm4 0v2h2v-2h-2Z"/>'),
  listSettings: svg('<path d="M4 6h11v2H4V6Zm0 5h8v2H4v-2Zm0 5h11v2H4v-2ZM17 4l1.6 1.6L17 7.2V4Zm3 4.5-3-3v6l3-3ZM17 20l1.6-1.6L17 16.8V20Zm3-4.5-3 3v-6l3 3Z"/>'),
  restart: svg('<path d="M12 5V2L8 6l4 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7Z"/>'),
  check: svg('<path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/>'),
  // ─── Export / import / row editing ───────────────────────────────────────────────
  download: svg('<path d="M13 10h5l-6 7-6-7h5V3h2v7ZM4 19h16v2H4v-2Z"/>'),
  upload: svg('<path d="M11 14V7H6l6-7 6 7h-5v7h-2ZM4 19h16v2H4v-2Z"/>'),
  fileTable: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 2.5L17.5 8H14V4.5ZM7 12h4v2H7v-2Zm0 4h4v2H7v-2Zm6-4h4v2h-4v-2Zm0 4h4v2h-4v-2Z"/>'),
  fileDoc: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 2.5L17.5 8H14V4.5ZM7 12h10v2H7v-2Zm0 4h7v2H7v-2Z"/>'),
  plus: svg('<path d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2h6Z"/>'),
  trash: svg('<path d="M9 3h6l1 2h4v2H4V5h4l1-2ZM6 8h12l-1 13H7L6 8Zm4 3v7h1.5v-7H10Zm3 0v7h1.5v-7H13Z"/>'),
  save: svg('<path d="M5 3h11l3 3v15H5V3Zm2 2v4h8V5H7Zm1 8v6h8v-6H8Z"/>'),
  sortAsc: svg('<path d="M7 20V8H4l5-6 5 6h-3v12Zm9-1v-4h-2l3-4 3 4h-2v4Zm0-8V7h-2l3-4 3 4h-2v4Z"/>'),
  info: svg('<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm-1 7v6h2v-6h-2Zm0-4v2h2V7h-2Z"/>'),
  bookmark: svg('<path d="M6 3h12v18l-6-4-6 4V3Zm2 2v12.26l4-2.67 4 2.67V5H8Z"/>'),
  link: svg('<path d="M8.5 17.5a3.5 3.5 0 0 1-2.47-5.97l2.5-2.5 1.41 1.41-2.5 2.5a1.5 1.5 0 1 0 2.12 2.12l2.5-2.5 1.41 1.41-2.5 2.5a3.48 3.48 0 0 1-2.47 1.03Zm1.15-3.74-1.41-1.41 6.11-6.11 1.41 1.41-6.11 6.11Zm7.82-1.29-1.41-1.41 2.5-2.5a1.5 1.5 0 1 0-2.12-2.12l-2.5 2.5-1.41-1.41 2.5-2.5a3.5 3.5 0 0 1 4.94 4.94l-2.5 2.5Z"/>'),
  sortDesc: svg('<path d="M7 4v12H4l5 6 5-6h-3V4Zm9 3v4h-2l3 4 3-4h-2V7Zm0 8v4h-2l3 4 3-4h-2v-4Z"/>'),
  undo: svg('<path d="M7.8 7H14a6 6 0 0 1 0 12H8v-2h6a4 4 0 0 0 0-8H7.8l2.6 2.6L9 13 4 8l5-5 1.4 1.4L7.8 7Z"/>'),
  redo: svg('<path d="M16.2 7H10a6 6 0 0 0 0 12h6v-2h-6a4 4 0 0 1 0-8h6.2l-2.6 2.6L15 13l5-5-5-5-1.4 1.4L16.2 7Z"/>'),
  alignStart: svg('<path d="M3 4h18v2H3V4Zm0 4h12v2H3V8Zm0 4h18v2H3v-2Zm0 4h12v2H3v-2Z"/>'),
  alignCenter: svg('<path d="M3 4h18v2H3V4Zm3 4h12v2H6V8Zm-3 4h18v2H3v-2Zm3 4h12v2H6v-2Z"/>'),
  alignEnd: svg('<path d="M3 4h18v2H3V4Zm6 4h12v2H9V8Zm-6 4h18v2H3v-2Zm6 4h12v2H9v-2Z"/>'),
  fillDown: svg('<path d="M11 3h2v11.2l3.6-3.6L18 12l-6 6-6-6 1.4-1.4 3.6 3.6V3ZM4 19h16v2H4v-2Z"/>'),
  eraser: svg('<path d="M15.1 3.6a2 2 0 0 1 2.8 0l3.5 3.5a2 2 0 0 1 0 2.8L12.3 19H20v2H8.7l-5.1-5.1a2 2 0 0 1 0-2.8L15.1 3.6ZM9.6 19l2.3-2.3-4.6-4.6L5 14.5 9.5 19h.1Z"/>'),
  table: svg('<path d="M3 4h18v16H3V4Zm2 2v3h6V6H5Zm8 0v3h6V6h-6Zm-8 5v3h6v-3H5Zm8 0v3h6v-3h-6Zm-8 5v2h6v-2H5Zm8 0v2h6v-2h-6Z"/>'),
  play: svg('<path d="M8 5.1v13.8a.6.6 0 0 0 .9.5l10.8-6.9a.6.6 0 0 0 0-1L8.9 4.6a.6.6 0 0 0-.9.5Z"/>'),
  record: svg('<circle cx="12" cy="12" r="6"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="1.5"/>'),
  macro: svg('<path d="M4 4h16v16H4V4Zm2 2v12h12V6H6Zm2 2.5L11.5 12 8 15.5 6.6 14.1 8.7 12 6.6 9.9 8 8.5ZM12 14h6v2h-6v-2Z"/>'),
  chart: svg('<path d="M4 20V4h2v14h14v2H4Zm4-4V9h2.5v7H8Zm4.5 0V6H15v10h-2.5Zm4.5 0v-4h2.5v4H17Z"/>'),
  search: svg('<path d="M10.5 4a6.5 6.5 0 0 1 5.18 10.43l4.45 4.44-1.42 1.42-4.44-4.45A6.5 6.5 0 1 1 10.5 4Zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z"/>'),
  palette: svg('<path d="M12 3a9 9 0 0 0 0 18c1.1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3Zm-5.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"/>'),
  stripes: svg('<path d="M3 4h18v4H3V4Zm0 6h18v1.5H3V10Zm0 3.5h18v4H3v-4Zm0 6h18V21H3v-1.5Z"/>'),
  arrowUp: svg('<path d="M11 20V7.8l-5.6 5.6L4 12l8-8 8 8-1.4 1.4L13 7.8V20h-2Z"/>'),
  function: svg('<path d="M15.6 3c-2.3 0-3.5 1.4-4 3.9L11.3 9H8.5v2h2.5l-1.3 6.4c-.3 1.4-.7 1.9-1.6 1.9-.4 0-.8-.1-1.1-.2l-.5 1.9c.5.2 1.1.3 1.7.3 2.2 0 3.3-1.4 3.8-3.9L13.1 11h3v-2h-2.6l.4-1.8c.3-1.5.8-2.1 1.7-2.1.4 0 .8.1 1.1.2l.5-1.9c-.5-.2-1-.4-1.6-.4Z"/>')
};

/**
 * DI token used to override the icon set. Provide your own `WeGridIcons` map at the app or route
 * level to replace any/all glyphs; unset keys are not backfilled from the default set, so supply a
 * complete map. See docs/theming.md.
 */
export const WE_GRID_ICONS = new InjectionToken<WeGridIcons>('WE_GRID_ICONS', {
  providedIn: 'root',
  factory: () => weGridDefaultIcons
});
