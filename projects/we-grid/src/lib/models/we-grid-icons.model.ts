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
  sortAsc: svg('<path d="M7 20V8H4l5-6 5 6h-3v12Zm9-1v-4h-2l3-4 3 4h-2v4Zm0-8V7h-2l3-4 3 4h-2v4Z"/>'),
  sortDesc: svg('<path d="M7 4v12H4l5 6 5-6h-3V4Zm9 3v4h-2l3 4 3-4h-2V7Zm0 8v4h-2l3 4 3-4h-2v-4Z"/>')
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
