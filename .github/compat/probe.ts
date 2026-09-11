import { Component, signal } from '@angular/core';
import { of } from 'rxjs';
import {
  WeGridCellDirective,
  WeGridChecklistValuesProvider,
  WeGridColumnDef,
  WeGridComponent,
  WeGridExportFormat,
  WeGridExportRequest,
  WeGridImportFormat,
  WeGridImportResult,
  WeGridPageChange,
  WeGridRowDeleteEvent,
  WeGridRowDetailDirective,
  WeGridRowEditEvent,
  WeGridSortChange,
  weGridBuildXlsx,
  weGridFilterOperatorsFor,
  weGridLocaleTr,
  weGridParseCsv,
  weGridToCsv
} from 'we-grid-angular';

interface Product {
  id: number;
  code: string;
  name: string;
  category: string;
  price: number;
  inStock: boolean;
  updatedAt: string;
}

/**
 * Compatibility probe: exercises the whole public surface of we-grid-angular so the AOT template
 * type checker and the Angular linker both have to accept the published package on this major.
 */
@Component({
  selector: 'app-root',
  imports: [WeGridComponent, WeGridCellDirective, WeGridRowDetailDirective],
  templateUrl: './probe.html'
})
export class ProbeApp {
  protected readonly title = signal('we-grid compatibility probe');

  columns: WeGridColumnDef<Product>[] = [
    { field: 'code', header: 'Code', width: 130, pinned: 'left', required: true, filterOperators: ['equals', 'startsWith'] },
    { field: 'name', header: 'Name', width: 200 },
    {
      field: 'category',
      header: 'Category',
      width: 170,
      headerFilterMode: 'checklist',
      headerFilterSource: 'provider',
      checklistValueLabel: (value) => String(value).toUpperCase(),
      checklistValuesLimit: 50,
      editor: 'select',
      editorOptions: [
        { value: 'Bikes', label: 'Bikes' },
        { value: 'Components', label: 'Components' }
      ],
      displayValue: (row) => row.category.toUpperCase()
    },
    { field: 'price', header: 'Price', type: 'currency', format: 'EUR', width: 120, summary: 'sum' },
    { field: 'inStock', header: 'In stock', type: 'boolean', width: 110, align: 'center' },
    { field: 'updatedAt', header: 'Updated', type: 'date', width: 150 },
    { field: 'actions', header: '', type: 'custom', width: 90, exportable: false, editable: false }
  ];

  data: Product[] = [
    { id: 1, code: 'PRD-1', name: 'Alpha', category: 'Bikes', price: 20, inStock: true, updatedAt: '2026-01-01' },
    { id: 2, code: 'PRD-2', name: 'Beta', category: 'Components', price: 35, inStock: false, updatedAt: '2026-01-02' }
  ];

  exportFormats: WeGridExportFormat[] = ['csv', 'xlsx', 'pdf'];
  importFormats: WeGridImportFormat[] = ['csv', 'xlsx'];
  newRow: Partial<Product> = { category: 'Bikes', inStock: true, price: 0 };

  page = 1;
  pageSize = 20;
  sortField: string | null = null;
  sortDirection: 'asc' | 'desc' | null = null;

  onPage(e: WeGridPageChange): void {
    this.page = e.page;
    this.pageSize = e.pageSize;
  }

  onSort(e: WeGridSortChange): void {
    this.sortField = e.field;
    this.sortDirection = e.direction;
  }

  onExport(e: WeGridExportRequest<Product>): void {
    // Calls the standalone utilities directly too, so their published typings are checked as well.
    const csv = weGridToCsv(e.table);
    const blob = weGridBuildXlsx(e.table);
    console.log(e.format, e.scope, csv.length, blob.size, weGridParseCsv(csv).headers.length);
  }

  onImport(e: WeGridImportResult<Product>): void {
    this.data = [...(e.rows as Product[]), ...this.data];
  }

  onCreate(e: WeGridRowEditEvent<Product>): void {
    this.data = [{ ...e.row, id: Date.now() }, ...this.data];
    e.done(true);
  }

  onUpdate(e: WeGridRowEditEvent<Product>): void {
    const changedFields = Object.keys(e.changes);
    this.data = this.data.map((row) => (row === e.original ? e.row : row));
    e.done(changedFields.length > 0, 'unchanged');
  }

  onDelete(e: WeGridRowDeleteEvent<Product>): void {
    this.data = this.data.filter((row) => row !== e.row);
    e.done(true);
  }

  onRefresh(): void {
    this.data = this.data.slice();
  }

  checklistValues: WeGridChecklistValuesProvider = (request) =>
    of({ values: this.data.map((row) => ({ value: row.category })).slice(0, request.limit), hasMore: false });

  readonly codeOperators = weGridFilterOperatorsFor('text', ['equals', 'startsWith']);

  readonly localeName = `${weGridLocaleTr.exportButton} · ${weGridLocaleTr.intlLocale} · ${weGridLocaleTr.summaryPage(weGridLocaleTr.sum)}`;
}
