import { WeGridExportTable, WeGridImportSheet } from '../models/we-grid-export.model';

/**
 * A minimal, dependency-free XLSX reader/writer.
 *
 * we-grid ships no runtime dependencies, so "export to Excel" cannot mean pulling in SheetJS or
 * ExcelJS. An .xlsx file is a ZIP of XML parts, and both halves of that are reachable from the
 * platform alone:
 *
 * - WRITING stores every part uncompressed (ZIP method 0). A stored entry only needs a CRC-32,
 *   which is ~20 lines; the file is bigger than a compressed one but is a completely ordinary
 *   .xlsx that Excel, LibreOffice and Google Sheets open without a warning.
 * - READING needs real DEFLATE, because files written by Excel are compressed. That comes from
 *   `DecompressionStream('deflate-raw')` — a browser API (Chrome 103+, Firefox 113+, Safari
 *   16.4+), not a dependency. Where it is missing, xlsx import reports an error and CSV import
 *   still works.
 */

// ─── CRC-32 ────────────────────────────────────────────────────────────────────────────
let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  crcTable = table;
  return table;
}

function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ─── ZIP writing (stored entries only) ─────────────────────────────────────────────────
interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** MS-DOS date/time pair used by the ZIP local header — second resolution is 2s, hence the >>> 1 */
function dosDateTime(date: Date): { time: number; date: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

function buildZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(new Date());
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);

    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true); // version needed
    localView.setUint16(6, 0x0800, true); // UTF-8 file names
    localView.setUint16(8, 0, true); // method: stored
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, entry.data.length, true);
    localView.setUint32(22, entry.data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true); // version made by
    centralView.setUint16(6, 20, true); // version needed
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.data.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    localParts.push(local, entry.data);
    centralParts.push(central);
    offset += local.length + entry.data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  return new Blob([...localParts, ...centralParts, end], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

// ─── XLSX writing ──────────────────────────────────────────────────────────────────────
function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Control characters other than tab/LF/CR are illegal in XML 1.0 — a stray one anywhere in the
 * data would make the whole workbook unreadable, so they are dropped rather than escaped.
 */
function sanitiseXmlText(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

/** 0 → A, 25 → Z, 26 → AA */
function columnLetter(index: number): string {
  let letters = '';
  let n = index;
  while (n >= 0) {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  }
  return letters;
}

/**
 * Excel's serial date: day 1 is 1900-01-01, and the format keeps the (non-existent) 1900-02-29,
 * which is why the epoch used for the conversion is 1899-12-30. UTC parts are used so the local
 * timezone offset cannot shift a date to the previous day.
 */
function toExcelSerial(date: Date): number {
  const utcMidnightDays = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
  const fraction = (date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds()) / 86400;
  return utcMidnightDays + 25569 + fraction;
}

function toDateOrNull(value: unknown): Date | null {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/** Style indices declared in `buildStyles()` — kept in sync by hand, the sheet references them by number */
const STYLE_DEFAULT = 0;
const STYLE_HEADER = 1;
const STYLE_DATE = 2;
const STYLE_DATETIME = 3;

function buildStyles(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="4">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="22" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`
  );
}

function inlineStringCell(ref: string, text: string, style: number): string {
  return (
    `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">` +
    escapeXml(sanitiseXmlText(text)) +
    `</t></is></c>`
  );
}

/** Worksheet names may not exceed 31 characters nor contain any of `[]:*?/\` */
function sanitiseSheetName(name: string): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, ' ').trim();
  return (cleaned || 'Sheet1').slice(0, 31);
}

/** Builds a real .xlsx workbook out of an export table — one sheet, a bold header and a summary row */
export function weGridBuildXlsx(table: WeGridExportTable): Blob {
  const encoder = new TextEncoder();
  const sheetName = sanitiseSheetName(table.title);

  const cols = table.columns
    .map((col, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.max(8, Math.round(col.width / 7))}" customWidth="1"/>`)
    .join('');

  const rowsXml: string[] = [];
  rowsXml.push(
    `<row r="1">` +
      table.columns.map((col, i) => inlineStringCell(`${columnLetter(i)}1`, col.header, STYLE_HEADER)).join('') +
      `</row>`
  );

  table.rows.forEach((row, rowIndex) => {
    const r = rowIndex + 2;
    const cells: string[] = [];
    table.columns.forEach((col, colIndex) => {
      const ref = `${columnLetter(colIndex)}${r}`;
      const raw = row.values[colIndex];
      const text = row.text[colIndex] ?? '';
      if (raw === null || raw === undefined || raw === '') return;

      // A column with a `displayValue` mapper is text as far as the file is concerned — see
      // WeGridExportColumn.useDisplayText.
      if (col.useDisplayText) {
        cells.push(inlineStringCell(ref, text, STYLE_DEFAULT));
        return;
      }

      if (col.type === 'number' || col.type === 'currency') {
        const num = Number(raw);
        // A "numeric" column can still hold something unparseable — fall back to the display text
        // instead of writing NaN, which Excel rejects.
        if (!isNaN(num)) {
          cells.push(`<c r="${ref}" s="${STYLE_DEFAULT}"><v>${num}</v></c>`);
          return;
        }
      } else if (col.type === 'boolean') {
        cells.push(`<c r="${ref}" t="b" s="${STYLE_DEFAULT}"><v>${raw ? 1 : 0}</v></c>`);
        return;
      } else if (col.type === 'date' || col.type === 'datetime') {
        const date = toDateOrNull(raw);
        if (date) {
          const style = col.type === 'date' ? STYLE_DATE : STYLE_DATETIME;
          cells.push(`<c r="${ref}" s="${style}"><v>${toExcelSerial(date)}</v></c>`);
          return;
        }
      }
      cells.push(inlineStringCell(ref, text, STYLE_DEFAULT));
    });
    rowsXml.push(`<row r="${r}">${cells.join('')}</row>`);
  });

  if (table.summary) {
    const r = table.rows.length + 2;
    const cells = table.summary
      .map((text, i) => (text ? inlineStringCell(`${columnLetter(i)}${r}`, text, STYLE_HEADER) : ''))
      .join('');
    rowsXml.push(`<row r="${r}">${cells}</row>`);
  }

  const sheet =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${rowsXml.join('')}</sheetData></worksheet>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  return buildZip([
    { name: '[Content_Types].xml', data: encoder.encode(contentTypes) },
    { name: '_rels/.rels', data: encoder.encode(rootRels) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRels) },
    { name: 'xl/styles.xml', data: encoder.encode(buildStyles()) },
    { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(sheet) }
  ]);
}

// ─── XLSX reading ──────────────────────────────────────────────────────────────────────
interface ZipDirectoryEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

/** Reads the ZIP central directory — the only reliable way to locate parts inside an .xlsx */
function readZipDirectory(buffer: ArrayBuffer): Map<string, ZipDirectoryEntry> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();

  // The end-of-central-directory record sits at the very end, unless the archive has a comment —
  // scan backwards over the maximum comment length (64 KB) plus the record itself.
  let eocd = -1;
  const scanStart = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= scanStart; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('Not a ZIP archive');

  const entryCount = view.getUint16(eocd + 10, true);
  let pointer = view.getUint32(eocd + 16, true);
  const entries = new Map<string, ZipDirectoryEntry>();

  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(pointer, true) !== 0x02014b50) break;
    const method = view.getUint16(pointer + 10, true);
    const compressedSize = view.getUint32(pointer + 20, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const localHeaderOffset = view.getUint32(pointer + 42, true);
    const name = decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength));
    entries.set(name, { name, method, compressedSize, localHeaderOffset });
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const DecompressionStreamCtor = (globalThis as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream;
  if (!DecompressionStreamCtor) {
    throw new Error('DecompressionStream is unavailable — this browser cannot read compressed .xlsx files');
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStreamCtor('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZipEntry(buffer: ArrayBuffer, entry: ZipDirectoryEntry): Promise<string> {
  const view = new DataView(buffer);
  const nameLength = view.getUint16(entry.localHeaderOffset + 26, true);
  const extraLength = view.getUint16(entry.localHeaderOffset + 28, true);
  const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;
  const raw = new Uint8Array(buffer, dataStart, entry.compressedSize);
  const bytes = entry.method === 0 ? raw : await inflateRaw(raw);
  return new TextDecoder().decode(bytes);
}

/** `A12` → column index 0 — needed because empty cells are simply absent from the XML */
function refToColumnIndex(ref: string): number {
  let index = 0;
  for (let i = 0; i < ref.length; i++) {
    const code = ref.charCodeAt(i);
    if (code < 65 || code > 90) break;
    index = index * 26 + (code - 64);
  }
  return index - 1;
}

function parseSharedStrings(xml: string): string[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(doc.getElementsByTagName('si')).map((si) =>
    Array.from(si.getElementsByTagName('t'))
      .map((t) => t.textContent ?? '')
      .join('')
  );
}

/**
 * Reads the first worksheet of an .xlsx file as raw text. Values keep whatever Excel stored:
 * dates come back as serial numbers, which the import mapper converts using the target column's
 * type (see we-grid-import.util.ts).
 */
export async function weGridReadXlsx(file: File): Promise<WeGridImportSheet> {
  const buffer = await file.arrayBuffer();
  const directory = readZipDirectory(buffer);

  const sheetEntry =
    directory.get('xl/worksheets/sheet1.xml') ??
    Array.from(directory.values()).find((e) => /^xl\/worksheets\/[^/]+\.xml$/.test(e.name));
  if (!sheetEntry) throw new Error('The workbook contains no worksheet');

  const sharedEntry = directory.get('xl/sharedStrings.xml');
  const sharedStrings = sharedEntry ? parseSharedStrings(await readZipEntry(buffer, sharedEntry)) : [];

  const doc = new DOMParser().parseFromString(await readZipEntry(buffer, sheetEntry), 'application/xml');
  const rows: string[][] = [];
  let width = 0;

  for (const rowEl of Array.from(doc.getElementsByTagName('row'))) {
    const cells: string[] = [];
    for (const cellEl of Array.from(rowEl.getElementsByTagName('c'))) {
      const ref = cellEl.getAttribute('r') ?? '';
      const index = ref ? refToColumnIndex(ref) : cells.length;
      const type = cellEl.getAttribute('t');
      let text: string;
      if (type === 'inlineStr') {
        text = Array.from(cellEl.getElementsByTagName('t'))
          .map((t) => t.textContent ?? '')
          .join('');
      } else {
        const value = cellEl.getElementsByTagName('v')[0]?.textContent ?? '';
        if (type === 's') text = sharedStrings[Number(value)] ?? '';
        else if (type === 'b') text = value === '1' ? 'true' : 'false';
        else text = value;
      }
      while (cells.length < index) cells.push('');
      cells[index] = text;
    }
    if (cells.length > width) width = cells.length;
    rows.push(cells);
  }

  const normalised = rows.map((r) => {
    const padded = r.slice();
    while (padded.length < width) padded.push('');
    return padded;
  });
  const nonEmpty = normalised.filter((r) => r.some((cell) => cell.trim() !== ''));
  const headers = (nonEmpty.shift() ?? []).map((h) => h.trim());
  return { headers, rows: nonEmpty };
}
