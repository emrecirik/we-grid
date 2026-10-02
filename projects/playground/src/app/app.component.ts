import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { delay, of } from 'rxjs';
import {
  WeGridCellDirective,
  WeGridChecklistValuesProvider,
  WeGridColumnDef,
  WeGridColumnFilterState,
  WeGridCommitFn,
  WeGridComponent,
  WeGridExportFormat,
  WeGridFilterChangeEvent,
  WeGridImportFormat,
  WeGridImportResult,
  WeGridPageChange,
  WeGridRowDeleteEvent,
  WeGridRowDetailDirective,
  WeGridRowEditEvent,
  WeGridHeaderDirective,
  WeGridRowsPasteEvent,
  WeGridSortChange,
  WeGridTreeInfo
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

/** A row carrying one field of every column type — section 9 */
interface TypedRow {
  id: number;
  sku: string;
  qty: number;
  /** Stored in kuruş, the way payment and accounting backends usually keep money */
  priceKurus: number;
  discount: number;
  weightKg: number;
  opensAt: string;
  contactEmail: string;
  website: string;
  phone: string;
  active: boolean;
  shippedAt: string;
}

const TYPED_ROWS: TypedRow[] = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  sku: `SKU-${(200 + i * 7).toString()}`,
  qty: (i * 37) % 250,
  priceKurus: 1999 + i * 12345,
  discount: [0, 0.05, 0.1, 0.125, 0.2, 0.33][i % 6],
  weightKg: Math.round((0.25 + i * 1.7) * 100) / 100,
  opensAt: `${String(8 + (i % 4)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
  contactEmail: `supplier${i + 1}@example.com`,
  website: `example.com/suppliers/${i + 1}`,
  phone: `+90 212 555 ${String(1000 + i * 11).slice(-4)}`,
  active: i % 3 !== 0,
  shippedAt: new Date(2026, 8, 1 + i, 9 + (i % 8), 15).toISOString()
}));

/** An order with its lines — section 11 renders both levels in the same columns */
interface OrderNode {
  key: string;
  kind: 'order' | 'line';
  label: string;
  customer?: string;
  product?: string;
  qty: number;
  unitPrice?: number;
  total: number;
  lines?: OrderNode[];
}

const ORDER_TREE: OrderNode[] = Array.from({ length: 40 }, (_, o) => {
  const lines: OrderNode[] = Array.from({ length: 1 + (o % 4) }, (_, l) => {
    const qty = 1 + ((o + l * 3) % 7);
    const unitPrice = Math.round((15 + ((o * 7 + l * 11) % 90)) * 100) / 100;
    return {
      key: `L-${o}-${l}`,
      kind: 'line' as const,
      label: `Line ${l + 1}`,
      product: ALL_PRODUCTS[(o * 3 + l) % ALL_PRODUCTS.length].name,
      qty,
      unitPrice,
      total: Math.round(qty * unitPrice * 100) / 100
    };
  });
  return {
    key: `O-${1000 + o}`,
    kind: 'order' as const,
    label: `Order ${1000 + o}`,
    customer: ['Atlas Ltd', 'Birch & Co', 'Cedar Inc', 'Delta GmbH'][o % 4],
    qty: lines.reduce((sum, l) => sum + l.qty, 0),
    total: Math.round(lines.reduce((sum, l) => sum + l.total, 0) * 100) / 100,
    lines
  };
});

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, WeGridComponent, WeGridCellDirective, WeGridRowDetailDirective, WeGridHeaderDirective],
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
    // Both checklists list values of the WHOLE table through serverChecklistValues below, not just the
    // loaded page. Name has 83 distinct values against a limit of 50, so its list notes the cut-off.
    { field: 'name', header: 'Name', width: 200, headerFilterMode: 'checklist', checklistValuesLimit: 50 },
    { field: 'category', header: 'Category', width: 160, headerFilterMode: 'checklist' },
    { field: 'price', header: 'Price', type: 'currency', width: 120 }
  ];
  serverPage = 1;
  serverPageSize = 10;
  serverSortField: string | null = null;
  serverSortDirection: 'asc' | 'desc' | null = null;
  serverLoading = false;
  serverData: Product[] = [];
  serverTotalCount = ALL_PRODUCTS.length;
  serverFilters: WeGridColumnFilterState[] = [];
  /** Shows what the screen would have sent to the backend for each change */
  serverQueryLog: string[] = [];

  constructor() {
    this.loadServerPage();
  }

  /** Simulates a backend call — filters/sorts/paginates the in-memory array with an artificial delay, no real HTTP request */
  private loadServerPage(): void {
    this.serverLoading = true;
    let rows = ALL_PRODUCTS.filter((row) => this.matchesFilters(row, this.serverFilters));
    this.serverTotalCount = rows.length;
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

  /**
   * The whole server-side filtering contract in one handler: take the filters, go back to page 1
   * when the grid says the filter set changed, and reload ONCE. The grid deliberately doesn't emit
   * (pageChange) here, so there is no second request to coalesce.
   */
  onServerFilterChange(e: WeGridFilterChangeEvent): void {
    this.serverFilters = [...e];
    if (e.resetPage) this.serverPage = 1;
    this.serverQueryLog = [
      ...this.serverQueryLog,
      `GET /products?page=${this.serverPage}&filters=${JSON.stringify(this.serverFilters)}`
    ].slice(-5);
    this.loadServerPage();
  }

  /**
   * Stands in for a `POST /products/distinct-values` endpoint: one column's distinct values over the
   * whole table, narrowed by the other active filters (the grid already leaves the column's own
   * filter out of `request.filters`) and by the search box, capped at the requested limit.
   */
  serverChecklistValues: WeGridChecklistValuesProvider = (request) => {
    this.serverQueryLog = [...this.serverQueryLog, `POST /products/distinct-values ${JSON.stringify(request)}`].slice(-5);
    const search = request.search?.toLowerCase();
    const distinct = new Set<string>();
    for (const row of ALL_PRODUCTS) {
      if (!this.matchesFilters(row, request.filters)) continue;
      const value = String((row as unknown as Record<string, unknown>)[request.field] ?? '');
      if (search && !value.toLowerCase().includes(search)) continue;
      distinct.add(value);
    }
    const values = Array.from(distinct).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return of({
      values: values.slice(0, request.limit).map((value) => ({ value })),
      hasMore: values.length > request.limit
    }).pipe(delay(300));
  };

  /** Stands in for the backend's WHERE clause — 'in' is a Contains check, everything else is a substring match */
  private matchesFilters(row: Product, filters: WeGridColumnFilterState[]): boolean {
    return filters.every((filter) => {
      const raw = (row as unknown as Record<string, unknown>)[filter.field];
      if (filter.operator === 'in') {
        const values = Array.isArray(filter.value) ? (filter.value as unknown[]) : [];
        return values.length === 0 || values.some((value) => String(value) === String(raw));
      }
      return String(raw ?? '').toLowerCase().includes(String(filter.value ?? '').toLowerCase());
    });
  }

  // ─── 9. Column types and formatters ─────────────────────────────
  typedColumns: WeGridColumnDef<TypedRow>[] = [
    { field: 'sku', header: 'SKU (text)', width: 120 },
    { field: 'qty', header: 'Qty (integer)', type: 'integer', width: 120, align: 'end', summary: 'sum' },
    // The row holds 1999; the cell shows ₺19,99, the filter and the editor take 19.99, and the
    // (filterChange) event carries 1999 again — see the log under the grid.
    { field: 'priceKurus', header: 'Price (kuruş)', type: 'currency', format: 'TRY', minorUnits: true, width: 140, align: 'end', summary: 'sum' },
    { field: 'discount', header: 'Discount (percent)', type: 'percent', format: '0-1', width: 150, align: 'end' },
    // A formatter changes the text only — sorting, filtering and the summary still use the number
    { field: 'weightKg', header: 'Weight (formatter)', type: 'number', width: 150, align: 'end', formatter: (value) => (value == null ? '—' : `${value} kg`) },
    { field: 'opensAt', header: 'Opens (time)', type: 'time', width: 120 },
    { field: 'shippedAt', header: 'Shipped (datetime)', type: 'datetime', width: 170 },
    { field: 'contactEmail', header: 'E-mail (email)', type: 'email', width: 210 },
    { field: 'website', header: 'Website (url)', type: 'url', width: 230 },
    { field: 'phone', header: 'Phone (phone)', type: 'phone', width: 160 },
    { field: 'active', header: 'Active (boolean)', type: 'boolean', width: 130, align: 'center' }
  ];
  typedData = TYPED_ROWS.map((row) => ({ ...row }));
  typedFilterLog: string[] = [];

  onTypedFilterChange(e: WeGridFilterChangeEvent): void {
    this.typedFilterLog = [...this.typedFilterLog, `(filterChange) ${JSON.stringify([...e])}`].slice(-4);
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

  // ─── 10. Form editing, spreadsheet paste and saved views ──────────
  workbenchData = ALL_PRODUCTS.slice(0, 12).map((p) => ({ ...p }));
  workbenchLog: string[] = [];

  onWorkbenchCreate(e: WeGridRowEditEvent<Product>): void {
    this.workbenchData = [{ ...e.row, id: ++this.nextCrudId }, ...this.workbenchData];
    this.workbenchLog = [...this.workbenchLog, `create ${e.row.code}`];
    e.done(true);
  }

  onWorkbenchUpdate(e: WeGridRowEditEvent<Product>): void {
    this.workbenchData = this.workbenchData.map((row) => (row === e.original ? e.row : row));
    this.workbenchLog = [...this.workbenchLog, `update ${e.row.code} → ${JSON.stringify(e.changes)}`];
    e.done(true);
  }

  /** One batch for the whole paste — a real screen would send it as a single request */
  onWorkbenchPaste(e: WeGridRowsPasteEvent<Product>): void {
    const replaced = new Map(e.updates.map((u) => [u.original, u.row]));
    const created = e.created.map((row) => ({ ...row, id: ++this.nextCrudId }));
    this.workbenchData = [...this.workbenchData.map((row) => replaced.get(row) ?? row), ...created];
    this.workbenchLog = [
      ...this.workbenchLog,
      `paste: ${e.updates.length} updated, ${e.created.length} created, ${e.errors.length} skipped`
    ];
    e.done(true);
  }


  // ─── 11. Tree rows, sticky detail, interactive cells ──────────────
  orderTree = ORDER_TREE;
  orderChildren = (row: OrderNode): OrderNode[] | undefined => row.lines;
  orderColumns: WeGridColumnDef<OrderNode>[] = [
    { field: 'label', header: 'Order / line', width: 220, pinned: 'left', fixed: true },
    { field: 'customer', header: 'Customer', width: 150, childField: 'product' },
    { field: 'qty', header: 'Qty', type: 'integer', width: 80, align: 'end', summary: 'sum' },
    {
      field: 'unitPrice',
      header: 'Unit price',
      type: 'currency',
      width: 120,
      align: 'end',
      headerHint: 'Orders show their cheapest line.\nLines show their own unit price.',
      treeValue: (row: OrderNode, tree: WeGridTreeInfo<OrderNode>) =>
        tree.level === 0 ? Math.min(...(row.lines ?? []).map((l) => l.unitPrice ?? Infinity)) : row.unitPrice
    },
    { field: 'total', header: 'Total', type: 'currency', width: 130, align: 'end', summary: 'sum' },
    { field: 'decision', header: 'Decision', width: 220, stopRowEvents: true, sortable: false, filterable: false, exportable: false },
    { field: 'note', header: 'Note', width: 220, sortable: false, filterable: false, exportable: false },
    { field: 'notes', header: 'Notes', width: 110, pinned: 'right', fixed: true, sortable: false, filterable: false, exportable: false }
  ];
  /** Unsaved decisions and notes live here, outside the grid — rowStateVersion tells it to repaint */
  readonly decisions = new Map<string, 'approved' | 'rejected'>();
  readonly notes: Record<string, string> = {};
  stateVersion = 0;
  treeLog: string[] = [];

  decide(row: OrderNode, decision: 'approved' | 'rejected'): void {
    if (this.decisions.get(row.key) === decision) this.decisions.delete(row.key);
    else this.decisions.set(row.key, decision);
    this.stateVersion++;
  }

  orderRowClass = (row: OrderNode, _index: number, tree?: WeGridTreeInfo<OrderNode>): string[] => {
    const classes: string[] = [];
    const decision = this.decisions.get(row.key);
    if (decision) classes.push(`demo-row--${decision}`);
    if (tree && tree.level > 0) classes.push('demo-row--line');
    return classes;
  };

  isOrder = (row: OrderNode): boolean => row.kind === 'order';

  onOrderRowClick(row: OrderNode): void {
    this.treeLog = [...this.treeLog.slice(-4), `rowClick ${row.key}`];
  }

  // ─── 12. Multi-level grouping with group summaries ────────────────
  groupedProducts = ALL_PRODUCTS.map((p) => ({ ...p, stockLabel: p.inStock ? 'In stock' : 'Out of stock', units: (p.id * 7) % 40 }));
  groupedColumns: WeGridColumnDef<Product & { stockLabel: string; units: number }>[] = [
    { field: 'code', header: 'Code', width: 120 },
    { field: 'name', header: 'Name', width: 180 },
    { field: 'category', header: 'Category', width: 150 },
    { field: 'stockLabel', header: 'Stock', width: 130 },
    { field: 'units', header: 'Units', type: 'integer', width: 90, align: 'end' },
    { field: 'price', header: 'Price', type: 'currency', width: 120, align: 'end', groupSummary: 'avg' }
  ];
  groupSummaryPosition: 'header' | 'footer' | 'both' = 'both';

}
