import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import {
  WeGridCellDirective,
  WeGridChecklistValuesProvider,
  WeGridColumnDef,
  WeGridColumnFilterState,
  WeGridFilterChangeEvent,
  WeGridComponent,
  WeGridLayout,
  WeGridPageChange,
  WeGridSortChange,
  WeGridSortDirection
} from 'we-grid-angular';

import { Order, OrderKpis, orderStatusLabel } from './models/ecommerce.models';
import { OrderApiService } from './services/order-api.service';
import { UserLayoutStore } from './services/user-layout-store';

const GRID_KEY = 'ecommerce-orders';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, WeGridComponent, WeGridCellDirective],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly api = inject(OrderApiService);
  private readonly layoutStore = inject(UserLayoutStore);
  private readonly destroy$ = new Subject<void>();

  readonly gridKey = GRID_KEY;

  orders: Order[] = [];
  loading = false;

  // ─── Server-side state: everything the backend needs to answer the next request ───────────
  page = 1;
  pageSize = 25;
  totalCount = 0;
  sortField: string | null = 'orderDate';
  sortDirection: WeGridSortDirection = 'desc';
  activeFilters: WeGridColumnFilterState[] = [];

  kpis: OrderKpis = { orderCount: 0, revenue: 0, averageOrderValue: 0, openOrderCount: 0, cancelledCount: 0 };
  summaryValues: Record<string, number> = {};
  layoutSaved = false;
  theme: 'light' | 'dark' = 'light';

  readonly columns: WeGridColumnDef<Order>[] = [
    { field: 'orderNo', header: 'Order No', width: 155, pinned: 'left' },
    { field: 'orderDate', header: 'Order Date', type: 'datetime', width: 165 },
    { field: 'customerName', header: 'Customer', width: 190 },
    { field: 'customerCity', header: 'City', width: 140 },
    { field: 'channel', header: 'Channel', width: 140 },
    {
      field: 'statusCode',
      header: 'Status',
      width: 165,
      // The user reads (and filters/groups by) the label; sorting still uses the raw code
      displayValue: (row) => orderStatusLabel(row.statusCode),
      // A closed set of values is exactly what a checklist is for: the funnel icon lists the
      // statuses of every order matching the other filters (see checklistValues below), and the
      // ticks leave as one 'in' filter carrying the raw codes — the mock backend turns that into an
      // IN (...) over every order.
      headerFilterMode: 'checklist'
    },
    { field: 'carrier', header: 'Carrier', width: 160 },
    { field: 'trackingNo', header: 'Tracking', width: 140 },
    { field: 'paymentMethod', header: 'Payment', width: 155 },
    { field: 'isPaid', header: 'Paid', type: 'boolean', width: 90, align: 'center' },
    { field: 'itemCount', header: 'Items', type: 'number', width: 90, align: 'end', summary: 'sum' },
    { field: 'subtotal', header: 'Subtotal', type: 'currency', format: 'TRY', width: 140, align: 'end' },
    { field: 'shippingCost', header: 'Shipping', type: 'currency', format: 'TRY', width: 130, align: 'end' },
    { field: 'totalAmount', header: 'Total', type: 'currency', format: 'TRY', width: 150, align: 'end', summary: 'sum' }
  ];

  /** Checklist values come from the backend, so a status that isn't on the current page can still be picked */
  readonly checklistValues: WeGridChecklistValuesProvider = (request) => this.api.getChecklistValues(request);

  ngOnInit(): void {
    this.layoutSaved = this.layoutStore.hasSavedLayout(GRID_KEY);
    this.loadOrders();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * The grid's default theme reads `data-theme` from an ancestor element, so a host app
   * switches light/dark by setting that single attribute — no grid input involved.
   */
  toggleTheme(): void {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', this.theme);
  }

  // ─── Grid -> component: the three server-side hooks ───────────────────────────────────────
  onPageChange(event: WeGridPageChange): void {
    this.page = event.page;
    this.pageSize = event.pageSize;
    this.loadOrders();
  }

  onSortChange(event: WeGridSortChange): void {
    this.sortField = event.field;
    this.sortDirection = event.direction;
    this.page = 1; // a new ordering invalidates the current offset
    this.loadOrders();
  }

  /**
   * `resetPage` says the filter set really changed, so the current offset is meaningless. The grid
   * emits no `(pageChange)` of its own alongside it — this is the single request that reloads.
   */
  onFilterChange(event: WeGridFilterChangeEvent): void {
    this.activeFilters = [...event];
    if (event.resetPage) this.page = 1;
    this.loadOrders();
  }

  onLayoutChange(_layout: WeGridLayout): void {
    this.layoutSaved = true;
  }

  statusClass(statusCode: number): string {
    switch (statusCode) {
      case 10:
        return 'badge badge--pending';
      case 20:
        return 'badge badge--paid';
      case 30:
        return 'badge badge--preparing';
      case 40:
        return 'badge badge--shipped';
      case 50:
        return 'badge badge--delivered';
      default:
        return 'badge badge--cancelled';
    }
  }

  statusLabel(statusCode: number): string {
    return orderStatusLabel(statusCode);
  }

  formatMoney(amount: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(amount);
  }

  private loadOrders(): void {
    this.loading = true;
    this.api
      .getOrders({
        page: this.page,
        pageSize: this.pageSize,
        sortField: this.sortField,
        sortDirection: this.sortDirection,
        filters: this.activeFilters
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe((result) => {
        this.orders = result.items;
        this.totalCount = result.totalCount;
        this.kpis = result.kpis;
        this.summaryValues = result.totals;
        this.loading = false;
      });
  }
}
