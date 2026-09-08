import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import {
  WeGridCellDirective,
  WeGridColumnDef,
  WeGridCommitFn,
  WeGridComponent,
  WeGridExportFormat,
  WeGridImportFormat,
  WeGridImportResult,
  WeGridPageChange,
  WeGridRowDeleteEvent,
  WeGridRowDetailDirective,
  WeGridRowEditEvent,
  WeGridSortChange
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

const CATEGORIES = ['Bikes', 'Components', 'Accessories', 'Apparel'];

function makeProducts(count: number): Product[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    code: `PRD-${(1000 + i).toString()}`,
    name: `Product ${i + 1}`,
    category: CATEGORIES[i % CATEGORIES.length],
    price: Math.round((20 + i * 3.37) * 100) / 100,
    inStock: i % 4 !== 0,
    updatedAt: new Date(2026, 0, 1 + (i % 28)).toISOString()
  }));
}

const ALL_PRODUCTS = makeProducts(83);

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, WeGridComponent, WeGridCellDirective, WeGridRowDetailDirective],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'we-grid playground';

  // ─── 1. Basic grid ────────────────────────────────────────────────
  basicColumns: WeGridColumnDef<Product>[] = [
    { field: 'code', header: 'Code', width: 120 },
    { field: 'name', header: 'Name', width: 200 },
    { field: 'category', header: 'Category', width: 160 },
    { field: 'price', header: 'Price', type: 'currency', width: 120, summary: 'sum' },
    { field: 'updatedAt', header: 'Updated', type: 'date', width: 140 }
  ];
  basicData = ALL_PRODUCTS.slice(0, 20);

  // ─── 2. Custom cell template (weGridCell) ────────────────────────
  templateColumns: WeGridColumnDef<Product>[] = [
    { field: 'code', header: 'Code', width: 120 },
    { field: 'name', header: 'Name', width: 200 },
    { field: 'inStock', header: 'Stock', type: 'custom', width: 130, align: 'center', sortable: false },
    { field: 'price', header: 'Price', type: 'currency', width: 120 }
  ];
  templateData = ALL_PRODUCTS.slice(0, 15);

  // ─── 3. Grouping ──────────────────────────────────────────────────
  groupingColumns: WeGridColumnDef<Product>[] = [
    { field: 'code', header: 'Code', width: 120 },
    { field: 'name', header: 'Name', width: 200 },
    { field: 'category', header: 'Category', width: 160 },
    { field: 'price', header: 'Price', type: 'currency', width: 120, summary: 'avg' }
  ];
  groupingData = ALL_PRODUCTS.slice(0, 40);

  // ─── 4. Filter row ────────────────────────────────────────────────
  filterColumns: WeGridColumnDef<Product>[] = [
    { field: 'code', header: 'Code', width: 120 },
    { field: 'name', header: 'Name', width: 200 },
    { field: 'category', header: 'Category', width: 160 },
    { field: 'price', header: 'Price', type: 'currency', width: 120 },
    { field: 'inStock', header: 'In stock', type: 'boolean', width: 110 }
  ];
  filterData = ALL_PRODUCTS.slice(0, 30);

  // ─── 5. Master-detail (weGridRowDetail) ──────────────────────────
  detailColumns: WeGridColumnDef<Product>[] = [
    { field: 'code', header: 'Code', width: 120 },
    { field: 'name', header: 'Name', width: 200 },
    { field: 'category', header: 'Category', width: 160 },
    { field: 'price', header: 'Price', type: 'currency', width: 120 }
  ];
  detailData = ALL_PRODUCTS.slice(0, 12);

  // ─── 6. Server-side mode (simulated with an in-memory mock, no real HTTP call) ───────
  serverColumns: WeGridColumnDef<Product>[] = [
    { field: 'code', header: 'Code', width: 120 },
    { field: 'name', header: 'Name', width: 200 },
    { field: 'category', header: 'Category', width: 160 },
    { field: 'price', header: 'Price', type: 'currency', width: 120 }
  ];
  serverPage = 1;
  serverPageSize = 10;
  serverSortField: string | null = null;
  serverSortDirection: 'asc' | 'desc' | null = null;
  serverLoading = false;
  serverData: Product[] = [];
  serverTotalCount = ALL_PRODUCTS.length;

  constructor() {
    this.loadServerPage();
  }

  /** Simulates a backend call — sorts/paginates the in-memory array with an artificial delay, no real HTTP request */
  private loadServerPage(): void {
    this.serverLoading = true;
    let rows = [...ALL_PRODUCTS];
    if (this.serverSortField) {
      const field = this.serverSortField;
      const dir = this.serverSortDirection === 'desc' ? -1 : 1;
      rows.sort((a, b) => {
        const va = (a as unknown as Record<string, unknown>)[field];
        const vb = (b as unknown as Record<string, unknown>)[field];
        return va! < vb! ? -dir : va! > vb! ? dir : 0;
      });
    }
    const start = (this.serverPage - 1) * this.serverPageSize;
    const pageRows = rows.slice(start, start + this.serverPageSize);
    setTimeout(() => {
      this.serverData = pageRows;
      this.serverLoading = false;
    }, 250);
  }

  onServerPageChange(e: WeGridPageChange): void {
    this.serverPage = e.page;
    this.serverPageSize = e.pageSize;
    this.loadServerPage();
  }

  onServerSortChange(e: WeGridSortChange): void {
    this.serverSortField = e.field;
    this.serverSortDirection = e.direction;
    this.serverPage = 1;
    this.loadServerPage();
  }

  // ─── 7. Export / import ───────────────────────────────────────────
  exportColumns: WeGridColumnDef<Product>[] = [
    { field: 'code', header: 'Code', width: 120 },
    { field: 'name', header: 'Name', width: 200 },
    { field: 'category', header: 'Category', width: 160 },
    { field: 'price', header: 'Price', type: 'currency', width: 120, summary: 'sum' },
    { field: 'inStock', header: 'In stock', type: 'boolean', width: 110 },
    { field: 'updatedAt', header: 'Updated', type: 'date', width: 140 }
  ];
  exportFormats: WeGridExportFormat[] = ['csv', 'xlsx', 'pdf'];
  importFormats: WeGridImportFormat[] = ['csv', 'xlsx'];
  exportData = ALL_PRODUCTS.slice(0, 25);
  lastImport: WeGridImportResult<Product> | null = null;

  onImport(result: WeGridImportResult<Product>): void {
    // The grid hands over parsed rows and never touches `data` itself — appending them is the
    // consumer's decision, which is where a real app would POST them instead.
    this.lastImport = result;
    this.exportData = [...(result.rows as Product[]), ...this.exportData];
  }

  // ─── 8. Inline editing against a simulated backend ────────────────
  crudColumns: WeGridColumnDef<Product>[] = [
    { field: 'code', header: 'Code', width: 130, required: true },
    { field: 'name', header: 'Name', width: 200, required: true },
    {
      field: 'category',
      header: 'Category',
      width: 170,
      editor: 'select',
      editorOptions: CATEGORIES.map((c) => ({ value: c, label: c }))
    },
    { field: 'price', header: 'Price', type: 'currency', width: 120 },
    { field: 'inStock', header: 'In stock', type: 'boolean', width: 110 },
    { field: 'updatedAt', header: 'Updated', type: 'date', width: 150 }
  ];
  crudData = ALL_PRODUCTS.slice(0, 8).map((p) => ({ ...p }));
  crudLog: string[] = [];
  private nextCrudId = 1000;

  get crudNewRow(): Partial<Product> {
    return { category: CATEGORIES[0], inStock: true, price: 0 };
  }

  onCrudCreate(e: WeGridRowEditEvent<Product>): void {
    this.saveToFakeBackend(`create ${e.row.code}`, () => {
      this.crudData = [{ ...e.row, id: ++this.nextCrudId }, ...this.crudData];
    }, e.done);
  }

  onCrudUpdate(e: WeGridRowEditEvent<Product>): void {
    this.saveToFakeBackend(`update ${e.row.code} → ${JSON.stringify(e.changes)}`, () => {
      this.crudData = this.crudData.map((row) => (row === e.original ? e.row : row));
    }, e.done);
  }

  onCrudDelete(e: WeGridRowDeleteEvent<Product>): void {
    this.saveToFakeBackend(`delete ${e.row.code}`, () => {
      this.crudData = this.crudData.filter((row) => row !== e.row);
    }, e.done);
  }

  onCrudRefresh(): void {
    this.crudData = ALL_PRODUCTS.slice(0, 8).map((p) => ({ ...p }));
    this.crudLog = [...this.crudLog, 'refresh'];
  }

  /**
   * Stands in for the HTTP call a real screen would make. The point of the demo is the timing: the
   * grid keeps the row in its saving state until `done` is called, so a rejected write leaves the
   * editor open with the values the user typed still in it.
   */
  private saveToFakeBackend(label: string, apply: () => void, done: WeGridCommitFn): void {
    setTimeout(() => {
      // Anything priced above 500 is rejected, so the failure path is visible in the demo too.
      if (label.includes('"price":') && /"price":\s*([5-9]\d\d|\d{4,})/.test(label)) {
        this.crudLog = [...this.crudLog, `${label} — REJECTED`];
        done(false, 'The backend rejected this price');
        return;
      }
      apply();
      this.crudLog = [...this.crudLog, label];
      done(true);
    }, 400);
  }
}
