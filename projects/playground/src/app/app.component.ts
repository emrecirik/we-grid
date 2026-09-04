import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import {
  WeGridCellDirective,
  WeGridColumnDef,
  WeGridComponent,
  WeGridPageChange,
  WeGridRowDetailDirective,
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
}
