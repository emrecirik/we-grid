import { WeGridExportTable } from '../models/we-grid-export.model';

/**
 * PDF output, without a PDF library.
 *
 * A hand-rolled PDF writer would be limited to the 14 standard fonts, and none of them can encode
 * `ş`, `ğ` or `ı` — a grid that ships a Turkish locale cannot have an export that silently mangles
 * Turkish. So the PDF is produced the way the platform already knows how: a self-contained,
 * print-styled HTML document is rendered in an off-screen iframe and handed to the browser's print
 * pipeline, where "Save as PDF" writes the file. Every glyph, every theme colour and every RTL/LTR
 * rule the browser supports comes along for free.
 *
 * Consumers who need an unattended, dialog-free PDF can provide their own `WE_GRID_EXPORTER` and
 * generate the file with a real PDF library — see docs/api.md.
 */

export interface WeGridPdfOptions {
  /** Page orientation of the printed document — defaults to 'landscape', which suits wide grids */
  orientation?: 'portrait' | 'landscape';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Serialises the captured `--we-grid-*` values into a `:root` block for the standalone document */
function themeBlock(cssVariables: Record<string, string>): string {
  const declarations = Object.entries(cssVariables)
    .filter(([name, value]) => name.startsWith('--we-grid-') && value.trim() !== '')
    .map(([name, value]) => `${name}: ${value.trim()};`)
    .join('')
    // A custom property value can legally contain a closing brace or a </style> sequence; strip
    // anything that could terminate the style element early.
    .replace(/<\/?style/gi, '');
  return `:root{${declarations}}`;
}

/**
 * Builds the complete printable document. Exported separately from `weGridPrintTable` so it can be
 * unit tested and so a consumer can open it in a tab of their own instead of printing it.
 */
export function weGridBuildPrintDocument(table: WeGridExportTable, options?: WeGridPdfOptions): string {
  const orientation = options?.orientation ?? 'landscape';
  const totalWidth = table.columns.reduce((sum, c) => sum + c.width, 0) || 1;

  const head = table.columns
    .map((col) => `<th style="width:${((col.width / totalWidth) * 100).toFixed(3)}%;text-align:${col.align}">${escapeHtml(col.header)}</th>`)
    .join('');

  const body = table.rows
    .map(
      (row) =>
        '<tr>' +
        table.columns.map((col, i) => `<td style="text-align:${col.align}">${escapeHtml(row.text[i] ?? '')}</td>`).join('') +
        '</tr>'
    )
    .join('');

  const foot = table.summary
    ? '<tfoot><tr>' +
      table.columns.map((col, i) => `<td style="text-align:${col.align}">${escapeHtml(table.summary?.[i] ?? '')}</td>`).join('') +
      '</tr></tfoot>'
    : '';

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(table.title)}</title><style>
${themeBlock(table.cssVariables)}
@page { size: A4 ${orientation}; margin: 12mm; }
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: var(--we-grid-print-font-family, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif);
  font-size: var(--we-grid-print-font-size, 9pt);
  color: var(--we-grid-print-color, #212529);
  background: var(--we-grid-print-bg, #ffffff);
}
h1 {
  font-size: var(--we-grid-print-title-size, 13pt);
  margin: 0 0 2mm;
  font-weight: 600;
}
.we-grid-print__meta {
  color: var(--we-grid-print-muted-color, #6c757d);
  margin: 0 0 3mm;
  font-size: var(--we-grid-print-meta-size, 8pt);
}
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
th, td {
  border: 1px solid var(--we-grid-print-border-color, #dee2e6);
  padding: 1.2mm 1.6mm;
  overflow-wrap: anywhere;
  vertical-align: top;
}
thead th {
  background: var(--we-grid-print-header-bg, #f3f6f9);
  color: var(--we-grid-print-color, #212529);
  font-weight: 600;
  border-bottom-width: 2px;
  border-bottom-color: var(--we-grid-accent-color, #405189);
}
tfoot td { font-weight: 600; background: var(--we-grid-print-header-bg, #f3f6f9); }
thead { display: table-header-group; }
tfoot { display: table-footer-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<h1>${escapeHtml(table.title)}</h1>
<p class="we-grid-print__meta">${escapeHtml(String(table.rows.length))} · ${escapeHtml(new Date().toLocaleString())}</p>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table>
</body></html>`;
}

/**
 * Renders the table in an off-screen iframe and opens the browser's print dialog on it. The iframe
 * is removed once printing finishes; browsers that never fire `afterprint` (or where the user
 * leaves the dialog open) are covered by the fallback timer, so the node can't leak.
 */
export function weGridPrintTable(table: WeGridExportTable, options?: WeGridPdfOptions): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('tabindex', '-1');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const cleanup = (): void => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };

  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    cleanup();
    throw new Error('The print document could not be created');
  }

  doc.open();
  doc.write(weGridBuildPrintDocument(table, options));
  doc.close();

  win.addEventListener('afterprint', cleanup, { once: true });
  // A fallback so the iframe is reclaimed even where `afterprint` never arrives — long enough that
  // it cannot fire while the user is still choosing a destination in the print dialog.
  setTimeout(cleanup, 120000);

  // One frame of slack lets the document lay out before the dialog snapshots it; without it,
  // Chromium occasionally prints an empty first page.
  setTimeout(() => {
    win.focus();
    win.print();
  }, 50);
}
