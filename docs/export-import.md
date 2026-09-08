# Export and import

`we-grid-angular` can write CSV, Excel (`.xlsx`) and PDF, and read CSV and Excel back — with no
runtime dependency added. Nothing is enabled by default: a grid that doesn't set `exportFormats`
or `importFormats` renders exactly the toolbar it rendered before.

```html
<we-grid
  gridKey="orders"
  [columns]="columns"
  [data]="rows"
  [exportFormats]="['csv', 'xlsx', 'pdf']"
  [importFormats]="['csv', 'xlsx']"
  exportFileName="orders-2026"
  selectable="multi"
  (importData)="onImport($event)"
></we-grid>
```

## What gets exported

| | |
|---|---|
| **Rows** | The loaded rows, after the client-side filter and sort, in the order shown. When rows are selected, only those. |
| **Columns** | Only the columns the user currently has visible, in their current order, under their current (possibly renamed) headers. A column with `exportable: false` is always skipped. |
| **Values** | The formatted text the grid shows, including `displayValue` labels. Excel additionally keeps numbers numeric and dates as real dates. |
| **Summary** | The subtotal row, when one is shown. |

The button's tooltip says which scope will be used before it is pressed — "Excel (.xlsx) ·
Selected rows" or "· All rows".

> On a `serverSide` grid the export covers the **loaded page**, not the whole result set. Bind
> `(exportRequest)` and export on the backend when that matters — see below.

## How each format is produced

**CSV** — UTF-8 with a byte order mark (without it Excel opens the file as the OS legacy code
page), `;` as the delimiter, RFC 4180 quoting. Downloads immediately.

**Excel** — a real `.xlsx` workbook, built by hand: an `.xlsx` is a ZIP of XML parts, and the
parts are stored uncompressed so that writing needs nothing but a CRC-32. The file is larger than
one Excel would write but opens without a warning in Excel, LibreOffice and Google Sheets. Numeric
columns stay numeric, date columns get a real date format, and the header row is bold.

**PDF** — a print-styled document is rendered in an off-screen iframe and handed to the browser's
print dialog, where "Save as PDF" writes the file. This is deliberate: a hand-rolled PDF writer is
limited to the 14 standard PDF fonts, none of which can encode `ş`, `ğ` or `ı`, and a grid that
ships a Turkish locale must not have an export that mangles Turkish. Going through the browser
also means the document picks up your theme (via the `--we-grid-print-*` variables) and every
glyph the browser can render.

If you need an unattended PDF with no dialog, provide your own exporter — see below.

## Importing

The import button opens a file picker limited to `importFormats`. The picked file is parsed, its
header row is matched against your columns, and every cell is converted to its column's type.

Header matching ignores case, surrounding and duplicated whitespace, and diacritics, so `Ürün Adı`,
`urun adi` and `ÜRÜN ADI` all reach the same column; the raw `field` name is accepted as a header
too. Headers that match nothing are reported in `unmappedHeaders` and their cells are dropped —
never guessed at.

Type conversion handles what spreadsheets actually produce: numbers in either locale convention
(`1.234,56` and `1,234.56` both read as `1234.56`), dates as ISO, day-first (`05.03.2024`) or
Excel serial numbers, and booleans as `true/1/yes/evet` and `false/0/no/hayır`. A cell that cannot
be converted is left out of the row and listed in `errors`.

**The grid never adds the rows to `data`.** It emits them and stops:

```ts
onImport(result: WeGridImportResult<Order>): void {
  if (result.errors.length) {
    // report and let the user fix the file
    return;
  }
  this.http.post('/api/orders/bulk', result.rows).subscribe(() => this.reload());
}
```

Reading a `.xlsx` needs `DecompressionStream('deflate-raw')` (Chrome 103+, Firefox 113+, Safari
16.4+). Where it is missing, xlsx import reports an error in the notice strip and CSV import keeps
working.

## Exporting on the backend

`exportMode` follows the same `'auto'` rule as `sortMode` and `filterMode`: when `serverSide` is
true **and** `(exportRequest)` is bound, the grid produces no file itself — it emits the request so
your backend can export the full result set.

```html
<we-grid [serverSide]="true" [exportFormats]="['xlsx']" (exportRequest)="onExport($event)"></we-grid>
```

```ts
onExport(e: WeGridExportRequest<Order>): void {
  // e.table.columns carries the user's current column order, headers and widths, so a
  // server-rendered file can match what is on screen.
  this.http.post('/api/orders/export', { format: e.format, columns: e.table.columns, filter: this.filter })
    .subscribe(...);
}
```

`exportMode: 'client'` forces local generation even on a server-side grid; `'server'` always
delegates, whether or not the output has a subscriber.

## Replacing the generators

Both halves are injection tokens, exactly like `WE_GRID_LAYOUT_STORE`:

```ts
import { WE_GRID_EXPORTER, WeGridExportTable, WeGridExportFormat, WeGridExporter } from 'we-grid-angular';

class PdfLibExporter implements WeGridExporter {
  export(table: WeGridExportTable, format: WeGridExportFormat): void {
    if (format !== 'pdf') return new WeGridDefaultExporter().export(table, format);
    // ... generate the file with a real PDF library, dialog-free
  }
}

providers: [{ provide: WE_GRID_EXPORTER, useClass: PdfLibExporter }]
```

`WE_GRID_IMPORT_PARSER` works the same way for reading — implement `parse(file, format)` and
return a `WeGridImportSheet` (`{ headers, rows }`); the column matching and type conversion still
run afterwards.

The primitives behind the defaults are exported too, so a custom implementation rarely starts from
scratch: `weGridToCsv`, `weGridParseCsv`, `weGridBuildXlsx`, `weGridReadXlsx`,
`weGridBuildPrintDocument`, `weGridPrintTable`, `weGridDownloadBlob`, `weGridMapImportedRows`.
