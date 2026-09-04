/*
 * Mock backend for the retail sample.
 *
 * In a real backend the filtering/sorting/paging below is done in SQL; here the whole JSON file is
 * loaded once, cached, and queried in memory so the sample runs with `ng serve` alone.
 */

import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, delay, map, shareReplay } from 'rxjs';
import { WeGridColumnFilterState, WeGridSortDirection } from 'we-grid-angular';

import { Product } from '../models/retail.models';
import { MockFieldTypes, MockPagedResult, applyMockFilters, applyMockSort, paginateMock } from './mock-query.util';

const NETWORK_DELAY_MS = 300;

const PRODUCT_FIELD_TYPES: MockFieldTypes = {
  barcode: 'text',
  name: 'text',
  category: 'text',
  supplier: 'text',
  warehouse: 'text',
  costPrice: 'currency',
  salePrice: 'currency',
  stockQty: 'number',
  minStockQty: 'number',
  reservedQty: 'number',
  onShelf: 'boolean',
  shelfLifeDays: 'number',
  receivedAt: 'date',
  expiryDate: 'date',
  lastCountedAt: 'date'
};

export interface ProductQuery {
  page: number;
  pageSize: number;
  sortField: string | null;
  sortDirection: WeGridSortDirection;
  filters: WeGridColumnFilterState[];
}

@Injectable({ providedIn: 'root' })
export class RetailApiService {
  private readonly http = inject(HttpClient);

  private readonly products$: Observable<Product[]> = this.http
    .get<Product[]>('assets/data/products.json')
    .pipe(shareReplay({ bufferSize: 1, refCount: false }));

  getProducts(query: ProductQuery): Observable<MockPagedResult<Product>> {
    return this.products$.pipe(
      map((all) => {
        const filtered = applyMockFilters(all, query.filters, PRODUCT_FIELD_TYPES);
        const sorted = applyMockSort(filtered, query.sortField, query.sortDirection, PRODUCT_FIELD_TYPES);
        return paginateMock(sorted, query.page, query.pageSize);
      }),
      delay(NETWORK_DELAY_MS)
    );
  }

  /** Stands in for a PATCH endpoint — mutates the cached rows so the change survives paging */
  setShelfStatus(ids: number[], onShelf: boolean): Observable<number> {
    const idSet = new Set(ids);
    return this.products$.pipe(
      map((all) => {
        let affected = 0;
        for (const product of all) {
          if (idSet.has(product.id) && product.onShelf !== onShelf) {
            product.onShelf = onShelf;
            affected++;
          }
        }
        return affected;
      }),
      delay(NETWORK_DELAY_MS)
    );
  }
}
