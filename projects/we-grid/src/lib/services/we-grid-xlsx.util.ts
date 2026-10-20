import { weGridValueKind } from '../models/we-grid-column.model';
import { WeGridExportTable, WeGridImportSheet } from '../models/we-grid-export.model';
import { WeGridCellStyle } from '../models/we-grid-format.model';
import { weGridFormatHex } from './we-grid-format.util';

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
const STYLE_PERCENT = 4;

/** Number format ids of the fixed styles, by style index */
const STYLE_FORMATS = [0, 0, 14, 22, 10];

/**
 * Cell styles beyond the five fixed ones: a fixed style (its number format) with a cell's own font
 * and fill — the grid's column styles and format rules, as the grid shows them
 */
class ExtraStyles {
  readonly fonts: string[] = [];
  readonly fills: string[] = [];
  readonly xfs: { fmt: number; font: number; fill: number }[] = [];
  private readonly keys = new Map<string, number>();

  of(base: number, style: WeGridCellStyle | null | undefined): number {
    if (!style || !(style.bold || style.italic || style.underline || style.strike || style.color || style.fill)) return base;
    const bold = style.bold || base === STYLE_HEADER;
    const font =
      `<font>${bold ? '<b/>' : ''}${style.italic ? '<i/>' : ''}${style.strike ? '<strike/>' : ''}${style.underline ? '<u/>' : ''}<sz val="11"/>` +
      `${style.color ? `<color rgb="FF${weGridFormatHex(style.color, 'fg').slice(1).toUpperCase()}"/>` : ''}<name val="Calibri"/></font>`;
    const fill = style.fill ? `<fill><patternFill patternType="solid"><fgColor rgb="FF${weGridFormatHex(style.fill, 'bg').slice(1).toUpperCase()}"/><bgColor indexed="64"/></patternFill></fill>` : '';
    const key = `${base}|${font}|${fill}`;
    const known = this.keys.get(key);
    if (known !== undefined) return known;
    const fontIndex = this.index(this.fonts, font) + 2;
    const fillIndex = fill ? this.index(this.fills, fill) + 2 : 0;
    this.xfs.push({ fmt: STYLE_FORMATS[base] ?? 0, font: fontIndex, fill: fillIndex });
    const at = STYLE_FORMATS.length + this.xfs.length - 1;
    this.keys.set(key, at);
    return at;
  }

  private index(list: string[], xml: string): number {
    const at = list.indexOf(xml);
    if (at >= 0) return at;
    list.push(xml);
    return list.length - 1;
  }
}

function buildStyles(extra = new ExtraStyles()): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="${2 + extra.fonts.length}"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font>${extra.fonts.join('')}</fonts>` +
    `<fills count="${2 + extra.fills.length}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${extra.fills.join('')}</fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="${5 + extra.xfs.length}">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="22" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    extra.xfs
      .map((x) => `<xf numFmtId="${x.fmt}" fontId="${x.font}" fillId="${x.fill}" borderId="0" xfId="0" applyFont="1"${x.fill ? ' applyFill="1"' : ''}${x.fmt ? ' applyNumberFormat="1"' : ''}/>`)
      .join('') +
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
export function weGridXlsxSheetName(name: string): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, ' ').trim();
  return (cleaned || 'Sheet1').slice(0, 31);
}

/** Builds a real .xlsx workbook out of an export table — one sheet, a bold header and a summary row */
export function weGridBuildXlsx(table: WeGridExportTable): Blob {
  const sheetName = weGridXlsxSheetName(table.title);

  const cols = table.columns
    .map((col, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.max(8, Math.round(col.width / 7))}" customWidth="1"/>`)
    .join('');

  const rowsXml: string[] = [];
  rowsXml.push(
    `<row r="1">` +
      table.columns.map((col, i) => inlineStringCell(`${columnLetter(i)}1`, col.header, STYLE_HEADER)).join('') +
      `</row>`
  );

  const extra = new ExtraStyles();
  table.rows.forEach((row, rowIndex) => {
    const r = rowIndex + 2;
    const cells: string[] = [];
    table.columns.forEach((col, colIndex) => {
      const ref = `${columnLetter(colIndex)}${r}`;
      const raw = row.values[colIndex];
      const text = row.text[colIndex] ?? '';
      // The cell's own look on top of the style its type gives it
      const st = (base: number) => extra.of(base, row.styles?.[colIndex]);
      if (raw === null || raw === undefined || raw === '') return;

      // A column with a `displayValue` mapper is text as far as the file is concerned — see
      // WeGridExportColumn.useDisplayText.
      if (col.useDisplayText) {
        cells.push(inlineStringCell(ref, text, st(STYLE_DEFAULT)));
        return;
      }

      if (weGridValueKind(col.type) === 'number') {
        const scale = col.numberScale ?? 1;
        const num = scale === 1 ? Number(raw) : Number((Number(raw) * scale).toPrecision(12));
        // A "numeric" column can still hold something unparseable — fall back to the display text
        // instead of writing NaN, which Excel rejects.
        if (!isNaN(num)) {
          // A percent cell keeps the fraction and lets Excel's own 0.00% format show it
          const style = st(col.type === 'percent' ? STYLE_PERCENT : STYLE_DEFAULT);
          cells.push(`<c r="${ref}" s="${style}"><v>${num}</v></c>`);
          return;
        }
      } else if (col.type === 'boolean') {
        cells.push(`<c r="${ref}" t="b" s="${st(STYLE_DEFAULT)}"><v>${raw ? 1 : 0}</v></c>`);
        return;
      } else if (col.type === 'date' || col.type === 'datetime') {
        const date = toDateOrNull(raw);
        if (date) {
          const style = st(col.type === 'date' ? STYLE_DATE : STYLE_DATETIME);
          cells.push(`<c r="${ref}" s="${style}"><v>${toExcelSerial(date)}</v></c>`);
          return;
        }
      }
      cells.push(inlineStringCell(ref, text, st(STYLE_DEFAULT)));
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

  // Visual rules cover the column's data rows — not the header, not the summary row
  const visuals: WeGridXlsxConditionalFormat[] = [];
  for (const rule of table.formatRules ?? []) {
    const i = table.columns.findIndex((c) => c.field === rule.field);
    if (i < 0 || !table.rows.length) continue;
    const ref = `${columnLetter(i)}2:${columnLetter(i)}${table.rows.length + 1}`;
    if (rule.type === 'colorScale' && (rule.colors?.length ?? 0) >= 2) visuals.push({ ref, type: 'colorScale', colors: rule.colors!.map((c) => weGridFormatHex(c, 'fg')) });
    else if (rule.type === 'dataBar') visuals.push({ ref, type: 'dataBar', colors: [weGridFormatHex(rule.color ?? 'blue', 'fg')] });
    else if (rule.type === 'iconSet') visuals.push({ ref, type: 'iconSet', iconSet: rule.icons === 'dots' ? '3TrafficLights1' : '3Arrows', reverse: rule.reverse });
  }

  const sheet =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${rowsXml.join('')}</sheetData>` +
    conditionalFormattingXml(visuals, () => 0) +
    `</worksheet>`;

  return buildPackage([{ name: sheetName, xml: sheet }], buildStyles(extra));
}

/** The .xlsx package around worksheet XML: content types, relationships, workbook and styles */
function buildPackage(sheets: { name: string; xml: string; notes?: Record<string, string> }[], styles: string): Blob {
  const encoder = new TextEncoder();
  const noted = sheets.map((s) => !!s.notes && Object.keys(s.notes).length > 0);
  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    (noted.some(Boolean) ? `<Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/>` : '') +
    sheets.map((_, i) => (noted[i] ? `<Override PartName="/xl/comments${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/>` : '')).join('') +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
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
    `<sheets>${sheets.map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
    // Formulas are written with their last result; Excel recalculates them on opening
    `<calcPr fullCalcOnLoad="1"/></workbook>`;

  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  return buildZip([
    { name: '[Content_Types].xml', data: encoder.encode(contentTypes) },
    { name: '_rels/.rels', data: encoder.encode(rootRels) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRels) },
    { name: 'xl/styles.xml', data: encoder.encode(styles) },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: encoder.encode(s.xml) })),
    ...sheets.flatMap((s, i) => (noted[i] ? notesParts(s.notes!, i + 1).map((p) => ({ name: p.name, data: encoder.encode(p.xml) })) : []))
  ]);
}

/** A sheet's notes as Excel's comments, with the VML drawing that puts the red corner and the box on screen */
function notesParts(notes: Record<string, string>, n: number): { name: string; xml: string }[] {
  const refs = Object.keys(notes).filter((ref) => /^[A-Z]{1,3}\d+$/.test(ref));
  const comments =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><authors><author>we-grid</author></authors><commentList>` +
    refs.map((ref) => `<comment ref="${ref}" authorId="0"><text><r><t xml:space="preserve">${escapeXml(sanitiseXmlText(notes[ref]))}</t></r></text></comment>`).join('') +
    `</commentList></comments>`;
  const shapes = refs
    .map((ref, i) => {
      const col = refToColumnIndex(ref);
      const row = Number(/\d+$/.exec(ref)![0]) - 1;
      return (
        `<v:shape id="_x0000_s${1025 + i}" type="#_x0000_t202" style="position:absolute;margin-left:80pt;margin-top:2pt;width:120pt;height:60pt;z-index:${i + 1};visibility:hidden" fillcolor="#ffffe1" o:insetmode="auto">` +
        `<v:fill color2="#ffffe1"/><v:shadow on="t" color="black" obscured="t"/><v:path o:connecttype="none"/>` +
        `<v:textbox style="mso-direction-alt:auto"><div style="text-align:left"></div></v:textbox>` +
        `<x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:AutoFill>False</x:AutoFill><x:Row>${row}</x:Row><x:Column>${col}</x:Column></x:ClientData></v:shape>`
      );
    })
    .join('');
  const vml =
    `<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">` +
    `<o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="${n}"/></o:shapelayout>` +
    `<v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>` +
    shapes +
    `</xml>`;
  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="../comments${n}.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing" Target="../drawings/vmlDrawing${n}.vml"/>` +
    `</Relationships>`;
  return [
    { name: `xl/comments${n}.xml`, xml: comments },
    { name: `xl/drawings/vmlDrawing${n}.vml`, xml: vml },
    { name: `xl/worksheets/_rels/sheet${n}.xml.rels`, xml: rels }
  ];
}

// ─── Workbooks with formulas ───────────────────────────────────────────────────────────

/** One cell for `weGridBuildXlsxWorkbook` */
export interface WeGridXlsxCell {
  /** A1 address */
  ref: string;
  /** The value — for a formula, its last result, which Excel shows until it recalculates */
  value: string | number | boolean | Date | null;
  /** The formula in Excel's syntax, without the leading `=` (`SUM(B2:B9)`) */
  formula?: string;
  /** `value` is an error code such as `#DIV/0!` */
  error?: boolean;
  bold?: boolean;
  italic?: boolean;
  /** An Excel number format code — `#,##0.00`, `0%`, `mm-dd-yy`, `@` … */
  numFmt?: string;
  /** Thin borders on these sides, any of `t` `r` `b` `l` */
  borders?: string;
  /** Horizontal alignment */
  align?: 'start' | 'center' | 'end';
  /** Wrap text */
  wrap?: boolean;
  underline?: boolean;
  strike?: boolean;
  /** Text colour, hex (`#c41e16`) */
  color?: string;
  /** Fill colour, hex */
  fill?: string;
}

/** One worksheet for `weGridBuildXlsxWorkbook` — widths in pixels by column index */
export interface WeGridXlsxSheet {
  name: string;
  cells: WeGridXlsxCell[];
  widths?: Record<number, number>;
  /** Merged ranges, `'A1:C1'` */
  merges?: string[];
  /** Dropdown lists (data validation): the cells, space-separated (`'B2 B3:B9'`), and their choices */
  lists?: { ref: string; values: string[] }[];
  /** The range with filter buttons, `'A1:G12'` */
  autoFilter?: string;
  /** Rows and columns that stay in view */
  freeze?: { rows: number; cols: number };
  /** Conditional formatting, in Excel's own terms */
  conditionalFormats?: WeGridXlsxConditionalFormat[];
  /** Notes, by A1 address — written as Excel comments */
  notes?: Record<string, string>;
}

/** One conditional format rule for `weGridBuildXlsxWorkbook`, as Excel names it (a `cfRule`) */
export interface WeGridXlsxConditionalFormat {
  /** The cells, `'B2:B20'` */
  ref: string;
  type:
    | 'cellIs' | 'top10' | 'aboveAverage' | 'duplicateValues' | 'uniqueValues' | 'containsText' | 'notContainsText'
    | 'beginsWith' | 'endsWith' | 'containsBlanks' | 'notContainsBlanks' | 'colorScale' | 'dataBar' | 'iconSet';
  /** `cellIs`: greaterThan, between, equal … */
  operator?: string;
  /** Excel formulas without `=` — the compared values, or the test of a text or blank rule */
  formulas?: string[];
  /** `containsText` / `beginsWith` / `endsWith`: the text */
  text?: string;
  /** `top10`: how many, and whether from the bottom */
  rank?: number;
  bottom?: boolean;
  /** `aboveAverage`: below it instead */
  below?: boolean;
  /** What a matching cell looks like — colours in hex */
  style?: { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; color?: string; fill?: string };
  /** `colorScale`: two or three colours from low to high; `dataBar`: one */
  colors?: string[];
  /** `iconSet`: `3Arrows`, `3TrafficLights1` … */
  iconSet?: string;
  reverse?: boolean;
}

const BUILTIN_FORMATS: Record<string, number> = {
  General: 0, '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '0%': 9, '0.00%': 10, 'mm-dd-yy': 14, 'm/d/yy h:mm': 22, '@': 49
};

/**
 * Writes sheets cell by cell — formulas (with their last results), bold and italic text and number
 * formats survive, so the file opens in Excel as the workbook it was. Sheet names are made valid
 * and unique.
 */
export function weGridBuildXlsxWorkbook(sheets: readonly WeGridXlsxSheet[]): Blob {
  const custom = new Map<string, number>();
  const xfs = new Map<string, number>([['0:0:0:0:', 0]]);
  const xfList: { font: number; fmt: number; border: number; fill: number; align?: string; wrap?: boolean }[] = [{ font: 0, fmt: 0, border: 0, fill: 0 }];
  const borders = new Map<string, number>([['', 0]]);
  // Fonts and fills are numbered as they turn up; fills 0 and 1 are the two Excel requires
  const fonts = new Map<string, number>([['', 0]]);
  const fills = new Map<string, number>([['none', 0], ['gray125', 1]]);
  const styleOf = (cell: WeGridXlsxCell): number => {
    const fontKey = `${cell.bold ? 'b' : ''}${cell.italic ? 'i' : ''}${cell.strike ? 's' : ''}${cell.underline ? 'u' : ''}${hex(cell.color) ? `:${hex(cell.color)}` : ''}`;
    let font = fonts.get(fontKey);
    if (font === undefined) {
      font = fonts.size;
      fonts.set(fontKey, font);
    }
    const fillKey = hex(cell.fill);
    let fill = fillKey ? fills.get(fillKey) : 0;
    if (fill === undefined) {
      fill = fills.size;
      fills.set(fillKey, fill);
    }
    const sides = ['l', 'r', 't', 'b'].filter((s) => cell.borders?.includes(s)).join('');
    let border = borders.get(sides);
    if (border === undefined) {
      border = borders.size;
      borders.set(sides, border);
    }
    let fmt = 0;
    if (cell.numFmt) {
      fmt = BUILTIN_FORMATS[cell.numFmt] ?? custom.get(cell.numFmt) ?? 164 + custom.size;
      if (fmt >= 164 && !custom.has(cell.numFmt)) custom.set(cell.numFmt, fmt);
    }
    const align = cell.align === 'start' ? 'left' : cell.align === 'end' ? 'right' : cell.align;
    const wrap = !!cell.wrap;
    const key = `${font}:${fmt}:${border}:${fill}:${align ?? ''}${wrap ? ':w' : ''}`;
    let index = xfs.get(key);
    if (index === undefined) {
      index = xfList.length;
      xfs.set(key, index);
      xfList.push({ font, fmt, border, fill, align, wrap });
    }
    return index;
  };

  const hex = (c: string | undefined) => (c && /^#?[0-9a-f]{6}$/i.test(c) ? `FF${c.replace('#', '').toUpperCase()}` : '');
  // Differential formats — what a conditional rule changes — shared by every sheet
  const dxfs: string[] = [];
  const dxfOf = (style: NonNullable<WeGridXlsxConditionalFormat['style']>): number => {
    const color = hex(style.color);
    const fill = hex(style.fill);
    const xml =
      `<dxf>` +
      (style.bold || style.italic || style.strike || style.underline || color
        ? `<font>${style.bold ? '<b/>' : ''}${style.italic ? '<i/>' : ''}${style.strike ? '<strike/>' : ''}${style.underline ? '<u/>' : ''}${color ? `<color rgb="${color}"/>` : ''}</font>`
        : '') +
      (fill ? `<fill><patternFill patternType="solid"><bgColor rgb="${fill}"/></patternFill></fill>` : '') +
      `</dxf>`;
    const at = dxfs.indexOf(xml);
    if (at >= 0) return at;
    dxfs.push(xml);
    return dxfs.length - 1;
  };
  const used = new Set<string>();
  const parts = sheets.map((sheet, i) => {
    const base = weGridXlsxSheetName(sheet.name || `Sheet${i + 1}`);
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 28)} ${n}`;
    used.add(name.toLowerCase());
    const byRow = new Map<number, WeGridXlsxCell[]>();
    for (const cell of sheet.cells) {
      const m = /^([A-Z]{1,3})(\d+)$/.exec(cell.ref);
      if (!m) continue;
      const row = Number(m[2]);
      byRow.set(row, [...(byRow.get(row) ?? []), cell]);
    }
    const rows = [...byRow.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([r, cells]) => {
        cells.sort((a, b) => refToColumnIndex(a.ref) - refToColumnIndex(b.ref));
        return `<row r="${r}">${cells.map((c) => workbookCell(c, styleOf(c))).join('')}</row>`;
      });
    const widths = Object.entries(sheet.widths ?? {})
      .map(([c, w]) => `<col min="${Number(c) + 1}" max="${Number(c) + 1}" width="${Math.max(4, Math.round(w / 7))}" customWidth="1"/>`)
      .join('');
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      sheetViewXml(sheet.freeze) +
      (widths ? `<cols>${widths}</cols>` : '') +
      `<sheetData>${rows.join('')}</sheetData>` +
      (sheet.autoFilter ? `<autoFilter ref="${escapeXml(sheet.autoFilter)}"/>` : '') +
      (sheet.merges?.length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${escapeXml(m)}"/>`).join('')}</mergeCells>` : '') +
      conditionalFormattingXml(sheet.conditionalFormats ?? [], dxfOf) +
      dataValidationsXml(sheet.lists ?? []) +
      (sheet.notes && Object.keys(sheet.notes).length ? `<legacyDrawing r:id="rId2"/>` : '') +
      `</worksheet>`;
    return { name, xml, notes: sheet.notes };
  });

  const styles =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    (custom.size ? `<numFmts count="${custom.size}">${[...custom].map(([code, id]) => `<numFmt numFmtId="${id}" formatCode="${escapeXml(code)}"/>`).join('')}</numFmts>` : '') +
    `<fonts count="${fonts.size}">` +
    [...fonts.keys()]
      .map((k) => {
        const [flags, rgb] = k.split(':');
        return (
          `<font>${flags.includes('b') ? '<b/>' : ''}${flags.includes('i') ? '<i/>' : ''}${flags.includes('s') ? '<strike/>' : ''}${flags.includes('u') ? '<u/>' : ''}` +
          `<sz val="11"/>${rgb ? `<color rgb="${rgb}"/>` : ''}<name val="Calibri"/></font>`
        );
      })
      .join('') +
    `</fonts>` +
    `<fills count="${fills.size}">` +
    [...fills.keys()]
      .map((k) => (k === 'none' || k === 'gray125' ? `<fill><patternFill patternType="${k}"/></fill>` : `<fill><patternFill patternType="solid"><fgColor rgb="${k}"/><bgColor indexed="64"/></patternFill></fill>`))
      .join('') +
    `</fills>` +
    `<borders count="${borders.size}">` +
    [...borders.keys()]
      .map((sides) => {
        const side = (name: string, letter: string) => (sides.includes(letter) ? `<${name} style="thin"><color auto="1"/></${name}>` : `<${name}/>`);
        return `<border>${side('left', 'l')}${side('right', 'r')}${side('top', 't')}${side('bottom', 'b')}<diagonal/></border>`;
      })
      .join('') +
    `</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="${xfList.length}">` +
    xfList
      .map(
        (x) =>
          `<xf numFmtId="${x.fmt}" fontId="${x.font}" fillId="${x.fill}" borderId="${x.border}" xfId="0"${x.font ? ' applyFont="1"' : ''}${x.fill ? ' applyFill="1"' : ''}${x.fmt ? ' applyNumberFormat="1"' : ''}${x.border ? ' applyBorder="1"' : ''}` +
          (x.align || x.wrap
            ? ` applyAlignment="1"><alignment${x.align ? ` horizontal="${x.align}"` : ''}${x.wrap ? ' wrapText="1"' : ''}/></xf>`
            : '/>')
      )
      .join('') +
    `</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    (dxfs.length ? `<dxfs count="${dxfs.length}">${dxfs.join('')}</dxfs>` : '') +
    `</styleSheet>`;
  return buildPackage(parts, styles);
}

/** Frozen panes, as Excel writes them: a split at the first scrolling cell */
function sheetViewXml(freeze: WeGridXlsxSheet['freeze']): string {
  if (!freeze || (!freeze.rows && !freeze.cols)) return '';
  const topLeft = `${columnLetter(freeze.cols)}${freeze.rows + 1}`;
  const pane = freeze.rows && freeze.cols ? 'bottomRight' : freeze.rows ? 'bottomLeft' : 'topRight';
  return (
    `<sheetViews><sheetView workbookViewId="0"><pane${freeze.cols ? ` xSplit="${freeze.cols}"` : ''}${freeze.rows ? ` ySplit="${freeze.rows}"` : ''}` +
    ` topLeftCell="${topLeft}" activePane="${pane}" state="frozen"/></sheetView></sheetViews>`
  );
}

/** Conditional formatting as Excel writes it: one block per range, rules in priority order */
function conditionalFormattingXml(rules: readonly WeGridXlsxConditionalFormat[], dxfOf: (style: NonNullable<WeGridXlsxConditionalFormat['style']>) => number): string {
  if (!rules.length) return '';
  const rgb = (c: string) => `FF${c.replace('#', '').toUpperCase()}`;
  const byRef = new Map<string, string[]>();
  rules.forEach((r, i) => {
    const priority = i + 1;
    const dxf = r.style ? ` dxfId="${dxfOf(r.style)}"` : '';
    const formulas = (r.formulas ?? []).map((f) => `<formula>${escapeXml(sanitiseXmlText(f))}</formula>`).join('');
    let xml: string;
    switch (r.type) {
      case 'colorScale': {
        const colors = (r.colors ?? []).slice(0, 3);
        const stops = colors.length === 3 ? '<cfvo type="min"/><cfvo type="percentile" val="50"/><cfvo type="max"/>' : '<cfvo type="min"/><cfvo type="max"/>';
        xml = `<cfRule type="colorScale" priority="${priority}"><colorScale>${stops}${colors.map((c) => `<color rgb="${rgb(c)}"/>`).join('')}</colorScale></cfRule>`;
        break;
      }
      case 'dataBar':
        xml = `<cfRule type="dataBar" priority="${priority}"><dataBar><cfvo type="min"/><cfvo type="max"/><color rgb="${rgb(r.colors?.[0] ?? '#638ec6')}"/></dataBar></cfRule>`;
        break;
      case 'iconSet':
        xml =
          `<cfRule type="iconSet" priority="${priority}"><iconSet iconSet="${escapeXml(r.iconSet ?? '3Arrows')}"${r.reverse ? ' reverse="1"' : ''}>` +
          `<cfvo type="percent" val="0"/><cfvo type="percent" val="33"/><cfvo type="percent" val="67"/></iconSet></cfRule>`;
        break;
      case 'top10':
        xml = `<cfRule type="top10"${dxf} priority="${priority}" rank="${r.rank ?? 10}"${r.bottom ? ' bottom="1"' : ''}/>`;
        break;
      case 'aboveAverage':
        xml = `<cfRule type="aboveAverage"${dxf} priority="${priority}"${r.below ? ' aboveAverage="0"' : ''}/>`;
        break;
      case 'duplicateValues':
      case 'uniqueValues':
        xml = `<cfRule type="${r.type}"${dxf} priority="${priority}"/>`;
        break;
      case 'containsText':
      case 'notContainsText':
      case 'beginsWith':
      case 'endsWith': {
        const op = r.type === 'notContainsText' ? 'notContains' : r.type;
        xml = `<cfRule type="${r.type}"${dxf} priority="${priority}" operator="${op}" text="${escapeXml(sanitiseXmlText(r.text ?? ''))}">${formulas}</cfRule>`;
        break;
      }
      case 'containsBlanks':
      case 'notContainsBlanks':
        xml = `<cfRule type="${r.type}"${dxf} priority="${priority}">${formulas}</cfRule>`;
        break;
      default:
        xml = `<cfRule type="cellIs"${dxf} priority="${priority}" operator="${escapeXml(r.operator ?? 'equal')}">${formulas}</cfRule>`;
    }
    byRef.set(r.ref, [...(byRef.get(r.ref) ?? []), xml]);
  });
  return [...byRef].map(([ref, xml]) => `<conditionalFormatting sqref="${escapeXml(ref)}">${xml.join('')}</conditionalFormatting>`).join('');
}

/** Dropdown lists as list validations — Excel takes up to 255 characters of choices, without commas */
function dataValidationsXml(lists: readonly { ref: string; values: string[] }[]): string {
  const valid = lists.filter((l) => l.values.length && l.values.every((v) => !v.includes(',') && !v.includes('"')) && l.values.join(',').length <= 255);
  if (!valid.length) return '';
  return (
    `<dataValidations count="${valid.length}">` +
    valid.map((l) => `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${escapeXml(l.ref)}"><formula1>"${escapeXml(sanitiseXmlText(l.values.join(',')))}"</formula1></dataValidation>`).join('') +
    `</dataValidations>`
  );
}

function workbookCell(cell: WeGridXlsxCell, style: number): string {
  const { ref, value } = cell;
  const f = cell.formula ? `<f>${escapeXml(sanitiseXmlText(cell.formula))}</f>` : '';
  if (cell.error) return `<c r="${ref}" t="e" s="${style}">${f}<v>${escapeXml(String(value))}</v></c>`;
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}" s="${style}">${f}<v>${value}</v></c>`;
  if (value instanceof Date && !isNaN(value.getTime())) return `<c r="${ref}" s="${style}">${f}<v>${toExcelSerial(value)}</v></c>`;
  if (typeof value === 'boolean') return `<c r="${ref}" t="b" s="${style}">${f}<v>${value ? 1 : 0}</v></c>`;
  const text = value === null || value === undefined ? '' : String(value);
  if (f) return `<c r="${ref}" t="str" s="${style}">${f}<v>${escapeXml(sanitiseXmlText(text))}</v></c>`;
  return text === '' ? `<c r="${ref}" s="${style}"/>` : inlineStringCell(ref, text, style);
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
  return Array.from(doc.getElementsByTagNameNS('*', 'si')).map(stringItemText);
}

/** The text of a string item (`<si>` or `<is>`): its `<t>`, or the `<t>` of each `<r>` run — never the phonetic `<rPh>` */
function stringItemText(item: Element): string {
  let text = '';
  for (const child of Array.from(item.children)) {
    if (child.localName === 't') text += child.textContent ?? '';
    else if (child.localName === 'r') {
      for (const t of Array.from(child.children)) if (t.localName === 't') text += t.textContent ?? '';
    }
  }
  return text;
}

/** The format codes of Excel's built-in number formats a file refers to by id */
const BUILTIN_FORMAT_CODES: Record<number, string> = {
  1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 14: 'mm-dd-yy', 15: 'd-mmm-yy',
  16: 'd-mmm', 17: 'mmm-yy', 22: 'm/d/yy h:mm', 37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)',
  40: '#,##0.00;[Red](#,##0.00)', 49: '@'
};

/** The differential formats (`dxfs`) of a styles part — what each conditional rule changes */
function parseDifferentialFormats(xml: string): NonNullable<WeGridXlsxConditionalFormat['style']>[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const dxfsEl = doc.getElementsByTagNameNS('*', 'dxfs')[0];
  if (!dxfsEl) return [];
  const kids = (el: Element | undefined, name: string) => (el ? Array.from(el.children).filter((c) => c.localName === name) : []);
  const rgb = (el: Element | undefined) => {
    const v = el?.getAttribute('rgb');
    return v && /^[0-9a-f]{8}$/i.test(v) ? `#${v.slice(2).toLowerCase()}` : undefined;
  };
  return Array.from(dxfsEl.children).map((dxf) => {
    const font = kids(dxf, 'font')[0];
    const on = (name: string) => kids(font, name).some((c) => c.getAttribute('val') !== '0' && c.getAttribute('val') !== 'none');
    const pattern = kids(kids(dxf, 'fill')[0], 'patternFill')[0];
    const style: NonNullable<WeGridXlsxConditionalFormat['style']> = {};
    if (on('b')) style.bold = true;
    if (on('i')) style.italic = true;
    if (on('u')) style.underline = true;
    if (on('strike')) style.strike = true;
    const color = rgb(kids(font, 'color')[0]);
    if (color) style.color = color;
    const fill = rgb(kids(pattern, 'bgColor')[0]) ?? rgb(kids(pattern, 'fgColor')[0]);
    if (fill) style.fill = fill;
    return style;
  });
}

/** The conditional formatting of a worksheet, rule by rule, with each rule's look from `dxfs` */
function parseConditionalFormats(doc: Document, dxfs: NonNullable<WeGridXlsxConditionalFormat['style']>[]): WeGridXlsxConditionalFormat[] {
  const out: WeGridXlsxConditionalFormat[] = [];
  const types = new Set(['cellIs', 'top10', 'aboveAverage', 'duplicateValues', 'uniqueValues', 'containsText', 'notContainsText', 'beginsWith', 'endsWith', 'containsBlanks', 'notContainsBlanks', 'colorScale', 'dataBar', 'iconSet']);
  for (const block of Array.from(doc.getElementsByTagNameNS('*', 'conditionalFormatting'))) {
    const ref = block.getAttribute('sqref') ?? '';
    const rules = Array.from(block.children)
      .filter((r) => r.localName === 'cfRule')
      .sort((a, b) => Number(a.getAttribute('priority') ?? 0) - Number(b.getAttribute('priority') ?? 0));
    for (const rule of rules) {
      const type = rule.getAttribute('type') ?? '';
      if (!types.has(type)) continue;
      const child = (name: string) => Array.from(rule.children).find((c) => c.localName === name);
      const colours = (el: Element | undefined) =>
        Array.from(el?.children ?? []).filter((c) => c.localName === 'color').map((c) => c.getAttribute('rgb') ?? '').filter((v) => /^[0-9a-f]{8}$/i.test(v)).map((v) => `#${v.slice(2).toLowerCase()}`);
      const cf: WeGridXlsxConditionalFormat = { ref, type: type as WeGridXlsxConditionalFormat['type'] };
      const dxfId = rule.getAttribute('dxfId');
      if (dxfId !== null && dxfs[Number(dxfId)]) cf.style = dxfs[Number(dxfId)];
      const operator = rule.getAttribute('operator');
      if (operator) cf.operator = operator;
      const formulas = Array.from(rule.children).filter((c) => c.localName === 'formula').map((c) => c.textContent ?? '');
      if (formulas.length) cf.formulas = formulas;
      const text = rule.getAttribute('text');
      if (text !== null) cf.text = text;
      if (type === 'top10') {
        cf.rank = Number(rule.getAttribute('rank') ?? 10) || 10;
        if (rule.getAttribute('bottom') === '1') cf.bottom = true;
      }
      if (type === 'aboveAverage' && rule.getAttribute('aboveAverage') === '0') cf.below = true;
      if (type === 'colorScale') cf.colors = colours(child('colorScale'));
      if (type === 'dataBar') cf.colors = colours(child('dataBar'));
      if (type === 'iconSet') {
        const set = child('iconSet');
        cf.iconSet = set?.getAttribute('iconSet') ?? '3TrafficLights1';
        if (set?.getAttribute('reverse') === '1') cf.reverse = true;
      }
      out.push(cf);
    }
  }
  return out;
}

/** The cell formats (`cellXfs`) of a styles part, by index — null for the plain ones */
function parseCellFormats(xml: string): (WeGridXlsxCellFormat | null)[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const all = (parent: Element | Document, name: string) => Array.from(parent.getElementsByTagNameNS('*', name));
  const codes = new Map<number, string>(Object.entries(BUILTIN_FORMAT_CODES).map(([id, code]) => [Number(id), code]));
  for (const f of all(doc, 'numFmt')) codes.set(Number(f.getAttribute('numFmtId')), f.getAttribute('formatCode') ?? '');
  const fontsEl = all(doc, 'fonts')[0];
  const on = (el: Element, name: string) => Array.from(el.children).some((c) => c.localName === name && c.getAttribute('val') !== '0' && c.getAttribute('val') !== 'none');
  const rgbOf = (el: Element | undefined) => {
    const rgb = el?.getAttribute('rgb');
    return rgb && /^[0-9a-f]{8}$/i.test(rgb) ? `#${rgb.slice(2).toLowerCase()}` : undefined;
  };
  const fonts = fontsEl ? Array.from(fontsEl.children).map((font) => ({
    bold: on(font, 'b'),
    italic: on(font, 'i'),
    underline: on(font, 'u'),
    strike: on(font, 'strike'),
    color: rgbOf(Array.from(font.children).find((c) => c.localName === 'color'))
  })) : [];
  const fillsEl = all(doc, 'fills')[0];
  const fills = fillsEl ? Array.from(fillsEl.children).map((fill) => {
    const pattern = Array.from(fill.children).find((c) => c.localName === 'patternFill');
    return pattern?.getAttribute('patternType') === 'solid' ? rgbOf(Array.from(pattern.children).find((c) => c.localName === 'fgColor')) : undefined;
  }) : [];
  const bordersEl = all(doc, 'borders')[0];
  const borders = bordersEl ? Array.from(bordersEl.children).map((border) =>
    Array.from(border.children)
      .filter((side) => side.getAttribute('style') && side.getAttribute('style') !== 'none')
      .map((side) => ({ top: 't', right: 'r', bottom: 'b', left: 'l' })[side.localName as 'top'] ?? '')
      .join('')
  ) : [];
  const xfsEl = all(doc, 'cellXfs')[0];
  return xfsEl ? Array.from(xfsEl.children).map((xf) => {
    const out: WeGridXlsxCellFormat = {};
    const font = fonts[Number(xf.getAttribute('fontId') ?? 0)];
    if (font?.bold) out.bold = true;
    if (font?.italic) out.italic = true;
    if (font?.underline) out.underline = true;
    if (font?.strike) out.strike = true;
    // Black text and white fills are what a cell has anyway
    if (font?.color && font.color !== '#000000') out.color = font.color;
    const fill = fills[Number(xf.getAttribute('fillId') ?? 0)];
    if (fill && fill !== '#ffffff') out.fill = fill;
    const sides = borders[Number(xf.getAttribute('borderId') ?? 0)];
    if (sides) out.borders = ['t', 'r', 'b', 'l'].filter((s) => sides.includes(s)).join('');
    const code = codes.get(Number(xf.getAttribute('numFmtId') ?? 0));
    if (code && code !== 'General') out.numFmt = code;
    const alignment = Array.from(xf.children).find((c) => c.localName === 'alignment');
    const h = alignment?.getAttribute('horizontal');
    if (h === 'left') out.align = 'start';
    else if (h === 'center' || h === 'centerContinuous') out.align = 'center';
    else if (h === 'right') out.align = 'end';
    if (alignment?.getAttribute('wrapText') === '1' || alignment?.getAttribute('wrapText') === 'true') out.wrap = true;
    return Object.keys(out).length ? out : null;
  }) : [];
}

/** Text that a spreadsheet would read as a number, a boolean or a formula if it were typed */
function looksTyped(text: string): boolean {
  const t = text.trim();
  return /^[='\-+]/.test(text) || /^[-+]?[\d.,]+(e[-+]?\d+)?%?$/i.test(t) || /^(TRUE|FALSE|DOĞRU|YANLIŞ)$/i.test(t);
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

/** One worksheet read by `weGridReadXlsxCells`: its name and the text of each cell by A1 address */
export interface WeGridXlsxCellSheet {
  name: string;
  /** What a user would type: numbers as written (a dot decimal), booleans `TRUE`/`FALSE`, formulas with `=` */
  cells: Record<string, string>;
  /** Merged ranges, `'A1:C1'` */
  merges: string[];
  /** How cells look, by A1 address — empty cells too (a border, say); plain cells are left out */
  formats: Record<string, WeGridXlsxCellFormat>;
  /** Dropdown lists with their choices written out, by the cells they cover (`'B2 B3:B9'`) */
  lists: { ref: string; values: string[] }[];
  /** The range with filter buttons, when there is one */
  autoFilter?: string;
  /** Frozen rows and columns, when the sheet has them */
  freeze?: { rows: number; cols: number };
  /** Conditional formatting, in Excel's terms — colours as hex; rules in theme colours lose them */
  conditionalFormats: WeGridXlsxConditionalFormat[];
  /** Notes (Excel comments) by A1 address */
  notes: Record<string, string>;
}

/** A cell's look as an .xlsx file stores it, read by `weGridReadXlsxCells` */
export interface WeGridXlsxCellFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  /** Text and fill colours, hex (`#c41e16`) — set as RGB in the file; theme colours are not read */
  color?: string;
  fill?: string;
  /** Bordered sides, any of `t` `r` `b` `l` */
  borders?: string;
  align?: 'start' | 'center' | 'end';
  wrap?: boolean;
  /** The number format code (`'0.00%'`, `'mm-dd-yy'`, `'@'` …), built-in ones included */
  numFmt?: string;
}

/**
 * Reads every worksheet of an .xlsx file cell by cell, where they are — for a spreadsheet, unlike
 * `weGridReadXlsx`, which reads a table. Formulas come back as `=…`; a shared formula (Excel stores
 * a filled formula once) is moved to each of its cells by `shift`, which gets the master formula
 * and the offset. Without `shift`, those cells keep their last value.
 */
export async function weGridReadXlsxCells(
  file: Blob,
  shift?: (formula: string, dCol: number, dRow: number) => string
): Promise<WeGridXlsxCellSheet[]> {
  const buffer = await file.arrayBuffer();
  const directory = readZipDirectory(buffer);
  const read = async (path: string) => {
    const entry = directory.get(path);
    return entry ? readZipEntry(buffer, entry) : null;
  };
  const sharedXml = await read('xl/sharedStrings.xml');
  const sharedStrings = sharedXml ? parseSharedStrings(sharedXml) : [];
  const stylesXml = await read('xl/styles.xml');
  const cellFormats = stylesXml ? parseCellFormats(stylesXml) : [];
  const dxfs = stylesXml ? parseDifferentialFormats(stylesXml) : [];

  // Sheet names and order come from the workbook, their files from its relationships
  const targets = new Map<string, string>();
  const relsXml = await read('xl/_rels/workbook.xml.rels');
  if (relsXml) {
    for (const rel of Array.from(new DOMParser().parseFromString(relsXml, 'application/xml').getElementsByTagNameNS('*', 'Relationship'))) {
      const target = rel.getAttribute('Target') ?? '';
      targets.set(rel.getAttribute('Id') ?? '', target.startsWith('/') ? target.slice(1) : `xl/${target}`);
    }
  }
  const workbookXml = await read('xl/workbook.xml');
  const listed = workbookXml
    ? Array.from(new DOMParser().parseFromString(workbookXml, 'application/xml').getElementsByTagNameNS('*', 'sheet')).map((el) => ({
        name: el.getAttribute('name') ?? '',
        path: targets.get(el.getAttribute('r:id') ?? el.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? '') ?? ''
      }))
    : [];
  const sheets = listed.length ? listed : [{ name: 'Sheet1', path: 'xl/worksheets/sheet1.xml' }];

  const out: WeGridXlsxCellSheet[] = [];
  for (const sheet of sheets) {
    const xml = await read(sheet.path);
    if (xml === null) continue;
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const cells: Record<string, string> = {};
    const masters = new Map<string, { formula: string; col: number; row: number }>();
    const formats: Record<string, WeGridXlsxCellFormat> = {};
    // Namespace-blind (`<x:c>` too); a row or cell without its `r` follows the one before it
    let rowNumber = 0;
    for (const rowEl of Array.from(doc.getElementsByTagNameNS('*', 'row'))) {
      rowNumber = Number(rowEl.getAttribute('r')) || rowNumber + 1;
      let col = -1;
      for (const cellEl of Array.from(rowEl.children)) {
        if (cellEl.localName !== 'c') continue;
        const given = /^([A-Z]{1,3})(\d+)$/.exec(cellEl.getAttribute('r') ?? '');
        col = given ? refToColumnIndex(given[1]) : col + 1;
        const row = given ? Number(given[2]) : rowNumber;
        const ref = `${columnLetter(col)}${row}`;
        const look = cellFormats[Number(cellEl.getAttribute('s') ?? 0)];
        if (look) formats[ref] = look;
        const child = (name: string) => Array.from(cellEl.children).find((el) => el.localName === name);
        const fEl = child('f');
        if (fEl) {
          // Functions newer than Excel 2007 are stored as _xlfn.IFS(…)
          const text = (fEl.textContent ?? '').replace(/_xl(?:fn|ws)\./gi, '');
          const si = fEl.getAttribute('si');
          if (fEl.getAttribute('t') === 'shared' && si !== null) {
            if (text) masters.set(si, { formula: `=${text}`, col, row });
            const master = masters.get(si);
            if (text) {
              cells[ref] = `=${text}`;
              continue;
            }
            if (master && shift) {
              cells[ref] = shift(master.formula, col - master.col, row - master.row);
              continue;
            }
          } else if (text) {
            cells[ref] = `=${text}`;
            continue;
          }
        }
        const type = cellEl.getAttribute('t');
        let text: string;
        if (type === 'inlineStr') {
          const is = child('is');
          text = is ? stringItemText(is) : '';
        } else {
          const value = child('v')?.textContent ?? '';
          text = type === 's' ? (sharedStrings[Number(value)] ?? '') : type === 'b' ? (value === '1' ? 'TRUE' : 'FALSE') : value;
        }
        // Text stays text: "00123", "TRUE" or "=x" stored as a string come back with a leading '
        if ((type === 's' || type === 'inlineStr' || type === 'str') && looksTyped(text)) text = `'${text}`;
        if (text !== '') cells[ref] = text;
      }
    }
    const merges = Array.from(doc.getElementsByTagNameNS('*', 'mergeCell'))
      .map((el) => el.getAttribute('ref') ?? '')
      .filter((ref) => /^[A-Z]{1,3}\d+:[A-Z]{1,3}\d+$/.test(ref));
    const lists: { ref: string; values: string[] }[] = [];
    for (const dv of Array.from(doc.getElementsByTagNameNS('*', 'dataValidation'))) {
      const formula = Array.from(dv.children).find((c) => c.localName === 'formula1')?.textContent ?? '';
      const literal = /^"(.*)"$/s.exec(formula);
      if (dv.getAttribute('type') !== 'list' || !literal) continue;
      const values = literal[1].split(',').map((v) => v.trim()).filter(Boolean);
      if (values.length) lists.push({ ref: dv.getAttribute('sqref') ?? '', values });
    }
    const filterRef = doc.getElementsByTagNameNS('*', 'autoFilter')[0]?.getAttribute('ref') ?? undefined;
    const paneEl = doc.getElementsByTagNameNS('*', 'pane')[0];
    const frozen = paneEl && (paneEl.getAttribute('state') === 'frozen' || paneEl.getAttribute('state') === 'frozenSplit');
    const freeze = frozen ? { rows: Math.round(Number(paneEl.getAttribute('ySplit') ?? 0)) || 0, cols: Math.round(Number(paneEl.getAttribute('xSplit') ?? 0)) || 0 } : undefined;
    const conditionalFormats = parseConditionalFormats(doc, dxfs);
    // Notes live in a comments part the sheet's relationships point at
    const notes: Record<string, string> = {};
    const sheetRels = await read(sheet.path.replace(/([^/]+)$/, '_rels/$1.rels'));
    const commentsTarget = sheetRels
      ? Array.from(new DOMParser().parseFromString(sheetRels, 'application/xml').getElementsByTagNameNS('*', 'Relationship')).find((r) => /\/comments$/.test(r.getAttribute('Type') ?? ''))?.getAttribute('Target')
      : undefined;
    if (commentsTarget) {
      const base = sheet.path.replace(/[^/]+$/, '');
      const path = commentsTarget.startsWith('/') ? commentsTarget.slice(1) : new URL(commentsTarget, `http://x/${base}`).pathname.slice(1);
      const commentsXml = await read(path);
      if (commentsXml) {
        for (const c of Array.from(new DOMParser().parseFromString(commentsXml, 'application/xml').getElementsByTagNameNS('*', 'comment'))) {
          const ref = c.getAttribute('ref') ?? '';
          const textEl = Array.from(c.children).find((e) => e.localName === 'text');
          const text = textEl ? stringItemText(textEl).trim() : '';
          if (/^[A-Z]{1,3}\d+$/.test(ref) && text) notes[ref] = text;
        }
      }
    }
    out.push({ name: sheet.name, cells, merges, formats, lists, conditionalFormats, notes, ...(filterRef ? { autoFilter: filterRef } : {}), ...(freeze && (freeze.rows || freeze.cols) ? { freeze } : {}) });
  }
  return out;
}
