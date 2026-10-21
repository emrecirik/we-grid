import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { WeGridIcons } from '../models/we-grid-icons.model';

// [innerHTML] compares by identity: a new SafeHtml on every change detection rewrites the SVG, and a
// click whose mousedown landed on the replaced element never fires — so each icon is wrapped once
const cache = new WeakMap<WeGridIcons, Map<string, SafeHtml>>();

/** The icon `key` of `icons` as trusted HTML — the same object every time */
export function weGridSafeIcon(sanitizer: DomSanitizer, icons: WeGridIcons, key: string): SafeHtml {
  let byKey = cache.get(icons);
  if (!byKey) cache.set(icons, (byKey = new Map()));
  let html = byKey.get(key);
  if (!html) byKey.set(key, (html = sanitizer.bypassSecurityTrustHtml(icons[key] ?? '')));
  return html;
}
