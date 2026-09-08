import { WeGridExportTable, WeGridImportSheet } from '../models/we-grid-export.model';

/** Excel opens a UTF-8 CSV as the OS legacy code page unless the file starts with a byte order mark */
const UTF8_BOM = '﻿';

/** RFC 4180 quoting — a field is quoted when it contains the delimiter, a quote or a line break */
function escapeCsvField(value: string, delimiter: string): string {
  if (value === '') return '';
  const needsQuotes = value.includes(delimiter) || value.includes('"') || value.includes('\n') || value.includes('\r');
  return needsQuotes ? `"${value.replace(/"/g, '""')}"` : value;
}

export interface WeGridCsvOptions {
  /**
   * Field delimiter — defaults to ';'. Excel splits a CSV on the list separator of the user's
   * regional settings, which is ';' everywhere the decimal separator is a comma (most of Europe,
   * including tr-TR). ',' produces a file that opens correctly in en-US Excel and every other
   * spreadsheet tool.
   */
  delimiter?: string;
}

/** Serialises an export table to CSV text, header row first, summary row appended when present */
export function weGridToCsv(table: WeGridExportTable, options?: WeGridCsvOptions): string {
  const delimiter = options?.delimiter ?? ';';
  const lines: string[] = [];
  lines.push(table.columns.map((c) => escapeCsvField(c.header, delimiter)).join(delimiter));
  for (const row of table.rows) {
    lines.push(row.text.map((t) => escapeCsvField(t, delimiter)).join(delimiter));
  }
  if (table.summary) {
    lines.push(table.summary.map((t) => escapeCsvField(t ?? '', delimiter)).join(delimiter));
  }
  return UTF8_BOM + lines.join('\r\n');
}

/**
 * Picks the delimiter by counting candidates in the header line — a CSV has no way to declare its
 * own separator, and which one a spreadsheet writes depends on the exporting machine's locale.
 */
function detectDelimiter(headerLine: string): string {
  const candidates = [';', ',', '\t', '|'];
  let best = ';';
  let bestCount = -1;
  for (const candidate of candidates) {
    const count = headerLine.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return bestCount > 0 ? best : ';';
}

/**
 * Parses CSV text into a header row plus data rows. Handles quoted fields, escaped quotes and
 * line breaks inside quotes; everything comes back as raw text — type coercion happens later,
 * against the column definitions (see we-grid-import.util.ts).
 */
export function weGridParseCsv(text: string, options?: WeGridCsvOptions): WeGridImportSheet {
  const content = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const firstBreak = content.search(/\r?\n/);
  const headerLine = firstBreak === -1 ? content : content.slice(0, firstBreak);
  const delimiter = options?.delimiter ?? detectDelimiter(headerLine);

  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      field = '';
      row = [];
    } else if (char !== '\r') {
      field += char;
    }
  }
  // The last line usually has no trailing newline — flush whatever is still buffered, but skip a
  // file that ends WITH a newline (that would otherwise produce a phantom empty row).
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  const headers = (nonEmpty.shift() ?? []).map((h) => h.trim());
  return { headers, rows: nonEmpty };
}

/**
 * Hands a generated file to the browser's download flow. Kept in one place so every exporter
 * releases its object URL the same way — a leaked blob URL pins the whole file in memory for the
 * lifetime of the document.
 */
export function weGridDownloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoked on the next task rather than synchronously: Firefox cancels a download whose object
  // URL is revoked in the same tick as the click.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
