import { Injectable } from '@angular/core';
import { WeGridExportFormat, WeGridExportTable, WeGridExporter } from '../models/we-grid-export.model';
import { weGridDownloadBlob, weGridToCsv } from './we-grid-csv.util';
import { weGridPrintTable } from './we-grid-pdf.util';
import { weGridBuildXlsx } from './we-grid-xlsx.util';

/**
 * Default `WE_GRID_EXPORTER` implementation: CSV and XLSX are written to a file the browser
 * downloads, PDF goes through the browser's print pipeline (see we-grid-pdf.util.ts for why).
 * Provide your own `WE_GRID_EXPORTER` to redirect any of the three — to a server-rendered
 * document, to a PDF library, or to a different file naming scheme.
 */
@Injectable({ providedIn: 'root' })
export class WeGridDefaultExporter implements WeGridExporter {
  export(table: WeGridExportTable, format: WeGridExportFormat): void {
    switch (format) {
      case 'csv':
        weGridDownloadBlob(new Blob([weGridToCsv(table)], { type: 'text/csv;charset=utf-8' }), `${table.fileName}.csv`);
        return;
      case 'xlsx':
        weGridDownloadBlob(weGridBuildXlsx(table), `${table.fileName}.xlsx`);
        return;
      case 'pdf':
        weGridPrintTable(table);
        return;
    }
  }
}
