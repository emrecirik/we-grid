import { Injectable } from '@angular/core';
import { WeGridColumnType } from '../models/we-grid-column.model';
import { WeGridImportFormat, WeGridImportParser, WeGridImportSheet } from '../models/we-grid-export.model';
import { weGridParseCsv } from './we-grid-csv.util';
import { weGridReadXlsx } from './we-grid-xlsx.util';

/** The subset of a column definition the import mapper needs */
export interface WeGridImportColumn {
  field: string;
  /** The header the user sees — imported files are matched against this first, then against `field` */
  header: string;
  type: WeGridColumnType;
}

export interface WeGridMappedImport {
  rows: Record<string, unknown>[];
  /** Header texts in the file that matched no column — their cells are dropped, never guessed at */
  unmappedHeaders: string[];
  errors: string[];
}

/** At most this many per-cell problems are reported — a badly matched file would otherwise produce thousands */
const MAX_REPORTED_ERRORS = 25;

/**
 * Normalises a header for matching: case, surrounding/duplicate whitespace and diacritics are all
 * ignored, so "Ürün Adı", "urun adi" and "ÜRÜN ADI" all match the same column. Users routinely
 * re-type headers by hand in the file they upload; being strict here just produces silent data loss.
 */
function normaliseHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // NFD splits the dotted and cedilla Turkish letters into a base letter plus a combining
    // mark, which the line above then removes. The dotless i is its own letter with no
    // decomposition, so it has to be folded explicitly or a header ending in it would never
    // match a file where the same header was typed with a plain i.
    .replace(/\u0131/g, 'i')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Parses a number written by a spreadsheet in an unknown locale. When both separators appear, the
 * LAST one is the decimal separator ("1.234,56" and "1,234.56" both mean 1234.56). A single
 * separator followed by exactly three digits is read as a thousands separator, which is the only
 * reading that keeps "12,500" meaning twelve and a half thousand.
 */
function parseLooseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[^\d,.\-+]/g, '').trim();
  if (cleaned === '' || cleaned === '-' || cleaned === '+') return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalised: string;

  if (lastComma !== -1 && lastDot !== -1) {
    const decimalAt = Math.max(lastComma, lastDot);
    normalised = cleaned.slice(0, decimalAt).replace(/[,.]/g, '') + '.' + cleaned.slice(decimalAt + 1);
  } else {
    const separator = lastComma !== -1 ? ',' : lastDot !== -1 ? '.' : '';
    if (separator === '') {
      normalised = cleaned;
    } else {
      const occurrences = cleaned.split(separator).length - 1;
      const decimals = cleaned.length - cleaned.lastIndexOf(separator) - 1;
      const isGroupSeparator = occurrences > 1 || decimals === 3;
      normalised = isGroupSeparator
        ? cleaned.split(separator).join('')
        : cleaned.slice(0, cleaned.lastIndexOf(separator)) + '.' + cleaned.slice(cleaned.lastIndexOf(separator) + 1);
    }
  }

  const value = Number(normalised);
  return isNaN(value) ? null : value;
}

/** Excel stores dates as serial days since 1899-12-30 — an .xlsx import gets the bare number back */
function fromExcelSerial(serial: number): Date {
  return new Date(Math.round((serial - 25569) * 86400000));
}

function parseLooseDate(raw: string): Date | null {
  const text = raw.trim();
  if (text === '') return null;

  // A pure number in a date column comes from a spreadsheet's serial format. The lower bound keeps
  // a plain year like "2024" from being read as 1905-07-15.
  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial > 10000 && serial < 100000) return fromExcelSerial(serial);
  }

  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (dmy) {
    const [, day, month, year, hour, minute, second] = dmy;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour ?? 0), Number(minute ?? 0), Number(second ?? 0));
    return isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(text);
  return isNaN(parsed.getTime()) ? null : parsed;
}

const TRUE_WORDS = new Set(['true', '1', 'yes', 'y', 'evet', 'e', 'x', 'on']);
const FALSE_WORDS = new Set(['false', '0', 'no', 'n', 'hayir', 'h', 'off']);

function coerce(raw: string, type: WeGridColumnType): { value: unknown; ok: boolean } {
  const text = raw.trim();
  if (text === '') return { value: null, ok: true };

  switch (type) {
    case 'number':
    case 'currency': {
      const value = parseLooseNumber(text);
      return { value, ok: value !== null };
    }
    case 'date':
    case 'datetime': {
      const value = parseLooseDate(text);
      return { value, ok: value !== null };
    }
    case 'boolean': {
      const word = normaliseHeader(text);
      if (TRUE_WORDS.has(word)) return { value: true, ok: true };
      if (FALSE_WORDS.has(word)) return { value: false, ok: true };
      return { value: null, ok: false };
    }
    default:
      return { value: text, ok: true };
  }
}

/**
 * Maps a parsed sheet onto the grid's columns: header texts are matched to columns and every cell
 * is coerced to its column's type. Columns missing from the file are simply absent from the
 * resulting objects (they are NOT set to null) so a consumer can tell "not supplied" apart from
 * "explicitly cleared" when patching existing records.
 */
export function weGridMapImportedRows(sheet: WeGridImportSheet, columns: WeGridImportColumn[]): WeGridMappedImport {
  const byHeader = new Map<string, WeGridImportColumn>();
  for (const col of columns) {
    byHeader.set(normaliseHeader(col.header), col);
    if (!byHeader.has(normaliseHeader(col.field))) byHeader.set(normaliseHeader(col.field), col);
  }

  const mapping = sheet.headers.map((header) => byHeader.get(normaliseHeader(header)) ?? null);
  const unmappedHeaders = sheet.headers.filter((header, i) => header.trim() !== '' && !mapping[i]);
  const errors: string[] = [];
  const rows: Record<string, unknown>[] = [];

  sheet.rows.forEach((cells, rowIndex) => {
    const row: Record<string, unknown> = {};
    mapping.forEach((col, colIndex) => {
      if (!col) return;
      const raw = cells[colIndex] ?? '';
      const { value, ok } = coerce(raw, col.type);
      if (!ok) {
        if (errors.length < MAX_REPORTED_ERRORS) {
          errors.push(`${col.header} (${rowIndex + 2}): "${raw}"`);
        }
        return;
      }
      row[col.field] = value;
    });
    rows.push(row);
  });

  return { rows, unmappedHeaders, errors };
}

/**
 * Default `WE_GRID_IMPORT_PARSER` implementation — CSV through `weGridParseCsv`, XLSX through the
 * built-in ZIP reader. Provide your own to accept other formats or to pre-process the file.
 */
@Injectable({ providedIn: 'root' })
export class WeGridDefaultImportParser implements WeGridImportParser {
  async parse(file: File, format: WeGridImportFormat): Promise<WeGridImportSheet> {
    if (format === 'xlsx') return weGridReadXlsx(file);
    return weGridParseCsv(await file.text());
  }
}
