import { InjectionToken, inject } from '@angular/core';
import { WeGridAlign, WeGridColumnType } from './we-grid-column.model';
import { WeGridDefaultExporter } from '../services/we-grid-default-exporter';
import { WeGridDefaultImportParser } from '../services/we-grid-import.util';

/** Formats the built-in export menu can produce */
export type WeGridExportFormat = 'csv' | 'xlsx' | 'pdf';

/** Formats the built-in import picker accepts */
export type WeGridImportFormat = 'csv' | 'xlsx';

/** Which rows an export covers */
export type WeGridExportScope = 'all' | 'selected';

/** One column of an export, flattened out of the grid's runtime column state */
export interface WeGridExportColumn {
  field: string;
  /** The header the user currently sees — a rename made from the header menu is included */
  header: string;
  type: WeGridColumnType;
  format: string | undefined;
  align: WeGridAlign;
  /** On-screen width in px — only the PDF/print output uses it, to keep column proportions */
  width: number;
  /**
   * True when the column maps its raw value to a label (`WeGridColumnDef.displayValue`). Exporters
   * must then write the display text even for a numeric or date column: exporting the raw code
   * behind "Draft" or "120 - ABC Supplies" would produce a file nobody can read back.
   */
  useDisplayText: boolean;
}

/** One exported row: the raw values (used by xlsx to keep numbers numeric) alongside the display text */
export interface WeGridExportRow {
  /** Raw cell values, aligned with `WeGridExportTable.columns` */
  values: unknown[];
  /** Display text of the same cells — exactly what the grid renders (including `displayValue`) */
  text: string[];
}

/**
 * The complete, renderer-agnostic description of what is being exported. Every exporter (csv,
 * xlsx, pdf, or a consumer's own) receives this and nothing else, so a custom exporter never has
 * to reach back into the grid's internals.
 */
export interface WeGridExportTable {
  /** File name WITHOUT an extension — the exporter appends the one matching its format */
  fileName: string;
  /** Worksheet name for xlsx, document title for pdf */
  title: string;
  columns: WeGridExportColumn[];
  rows: WeGridExportRow[];
  /** Summary-row text per column (aligned with `columns`), or null when no summary row is shown */
  summary: (string | null)[] | null;
  /**
   * Resolved `--we-grid-*` custom properties read off the live grid element. The PDF/print
   * document renders in a separate document that does not inherit the host page's stylesheet, so
   * the theme is carried over through this map instead of being hardcoded.
   */
  cssVariables: Record<string, string>;
}

/** What `(exportRequest)` reports — enough for a backend to produce the same file server-side */
export interface WeGridExportRequest<T> {
  format: WeGridExportFormat;
  scope: WeGridExportScope;
  /** The rows the grid would have exported — the LOADED rows only (see the exportMode docs) */
  rows: T[];
  table: WeGridExportTable;
}

/**
 * Dependency-inversion contract for producing the actual file, mirroring `WeGridLayoutStore`.
 * Provide your own implementation of `WE_GRID_EXPORTER` to swap in a different generator (a real
 * PDF library, an xlsx library with styling, ...) without touching the grid.
 */
export interface WeGridExporter {
  export(table: WeGridExportTable, format: WeGridExportFormat): void | Promise<void>;
}

/** A spreadsheet as read from a file: the first row is the header, everything else is raw text */
export interface WeGridImportSheet {
  headers: string[];
  rows: string[][];
}

/** Dependency-inversion contract for reading an imported file into a `WeGridImportSheet` */
export interface WeGridImportParser {
  parse(file: File, format: WeGridImportFormat): Promise<WeGridImportSheet>;
}

/** What `(importData)` reports once a picked file has been parsed and mapped onto the columns */
export interface WeGridImportResult<T> {
  format: WeGridImportFormat;
  fileName: string;
  /** One partial row per data line, keyed by column `field` and coerced to the column's type */
  rows: Partial<T>[];
  /** Header texts found in the file, in file order */
  headers: string[];
  /** Header texts that matched no column — those cells are dropped, they are not guessed at */
  unmappedHeaders: string[];
  /** Per-cell conversion problems, e.g. a non-numeric value in a number column */
  errors: string[];
}

/** Falls back to `WeGridDefaultExporter` (csv + xlsx download, pdf via print) when not provided */
export const WE_GRID_EXPORTER = new InjectionToken<WeGridExporter>('WE_GRID_EXPORTER', {
  providedIn: 'root',
  factory: () => inject(WeGridDefaultExporter)
});

/** Falls back to `WeGridDefaultImportParser` (csv + xlsx) when not provided */
export const WE_GRID_IMPORT_PARSER = new InjectionToken<WeGridImportParser>('WE_GRID_IMPORT_PARSER', {
  providedIn: 'root',
  factory: () => inject(WeGridDefaultImportParser)
});
