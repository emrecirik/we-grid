import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import {
  WeGridCellDirective,
  WeGridColumnDef,
  WeGridColumnFilterState,
  WeGridComponent,
  WeGridDensity,
  WeGridPageChange,
  WeGridRowClassFn,
  WeGridSortChange,
  WeGridSortDirection
} from 'we-grid-angular';

import { BulkActionResult, Product } from './models/retail.models';
import { RetailApiService } from './services/retail-api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, WeGridComponent, WeGridCellDirective],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly api = inject(RetailApiService);
  private readonly destroy$ = new Subject<void>();

  /** The grid instance — used to drive density from our own toolbar */
  @ViewChild(WeGridComponent) private grid?: WeGridComponent<Product>;

  products: Product[] = [];
  loading = false;
  page = 1;
  pageSize = 50;
  totalCount = 0;
  sortField: string | null = 'name';
  sortDirection: WeGridSortDirection = 'asc';
  activeFilters: WeGridColumnFilterState[] = [];

  selectedProducts: Product[] = [];
  lastAction: BulkActionResult | null = null;
  density: WeGridDensity = 'normal';
  readonly densities: WeGridDensity[] = ['comfortable', 'normal', 'compact'];

  readonly columns: WeGridColumnDef<Product>[] = [
    { field: 'barcode', header: 'Barcode', width: 150, pinned: 'left' },
    { field: 'name', header: 'Product', width: 230 },
    { field: 'category', header: 'Category', width: 165 },
    { field: 'supplier', header: 'Supplier', width: 200 },
    { field: 'warehouse', header: 'Location', width: 150 },
    { field: 'costPrice', header: 'Cost', type: 'currency', format: 'TRY', width: 120, align: 'end' },
    { field: 'salePrice', header: 'Sale Price', type: 'currency', format: 'TRY', width: 130, align: 'end', summary: 'avg' },
    { field: 'stockQty', header: 'Stock', type: 'number', width: 110, align: 'end', summary: 'sum' },
    { field: 'minStockQty', header: 'Min. Stock', type: 'number', width: 120, align: 'end' },
    { field: 'reservedQty', header: 'Reserved', type: 'number', width: 110, align: 'end' },
    { field: 'onShelf', header: 'On Shelf', type: 'boolean', width: 110, align: 'center' },
    { field: 'shelfLifeDays', header: 'Shelf Life (days)', type: 'number', width: 150, align: 'end' },
    { field: 'expiryDate', header: 'Expires', type: 'date', width: 125 },
    { field: 'lastCountedAt', header: 'Last Counted', type: 'date', width: 140 }
  ];

  /**
   * Critical/out-of-stock highlighting. The classes land on the grid's own <tr>, which lives inside
   * the library component, so they must be defined in the GLOBAL stylesheet (styles.scss) — a
   * component-scoped rule would never reach that element.
   */
  readonly rowClass: WeGridRowClassFn<Product> = (row) => ({
    'row-out-of-stock': row.stockQty === 0,
    'row-critical-stock': row.stockQty > 0 && row.stockQty <= row.minStockQty
  });

  ngOnInit(): void {
    this.loadProducts();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onPageChange(event: WeGridPageChange): void {
    this.page = event.page;
    this.pageSize = event.pageSize;
    this.loadProducts();
  }

  onSortChange(event: WeGridSortChange): void {
    this.sortField = event.field;
    this.sortDirection = event.direction;
    this.page = 1;
    this.loadProducts();
  }

  onFilterChange(filters: WeGridColumnFilterState[]): void {
    this.activeFilters = filters;
    this.page = 1;
    this.loadProducts();
  }

  setDensity(density: WeGridDensity): void {
    this.density = density;
    if (!this.grid) return;
    // `density` is a public field on the grid, not an @Input: the grid is OnPush, so assigning it
    // from outside updates the value but does not mark the grid's view dirty. Handing `data` a new
    // array reference is a real input change, which is what schedules the re-render.
    this.grid.density = density;
    this.products = [...this.products];
  }

  applyShelfStatus(onShelf: boolean): void {
    if (this.selectedProducts.length === 0) return;
    const ids = this.selectedProducts.map((product) => product.id);
    this.api
      .setShelfStatus(ids, onShelf)
      .pipe(takeUntil(this.destroy$))
      .subscribe((affected) => {
        this.lastAction = {
          message: onShelf ? 'Moved to the shelf' : 'Pulled from the shelf',
          affectedRows: affected
        };
        this.loadProducts();
      });
  }

  requestReplenishment(): void {
    if (this.selectedProducts.length === 0) return;
    const totalMissing = this.selectedProducts.reduce(
      (sum, product) => sum + Math.max(0, product.minStockQty - product.stockQty),
      0
    );
    this.lastAction = {
      message: `Replenishment requested for ${totalMissing} units`,
      affectedRows: this.selectedProducts.length
    };
  }

  clearSelectionMessage(): void {
    this.lastAction = null;
  }

  get selectedValue(): number {
    return this.selectedProducts.reduce((sum, product) => sum + product.salePrice * product.stockQty, 0);
  }

  formatMoney(amount: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'TRY' }).format(amount);
  }

  private loadProducts(): void {
    this.loading = true;
    this.api
      .getProducts({
        page: this.page,
        pageSize: this.pageSize,
        sortField: this.sortField,
        sortDirection: this.sortDirection,
        filters: this.activeFilters
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe((result) => {
        this.products = result.items;
        this.totalCount = result.totalCount;
        this.loading = false;
      });
  }
}
