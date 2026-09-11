/*
 * Mock backend for the e-commerce sample.
 *
 * NOTE: in a real backend everything below happens in SQL — the filter list becomes a WHERE clause,
 * the sort becomes ORDER BY and the page becomes OFFSET/FETCH; the KPI figures become a second
 * aggregate query over the same WHERE clause. This service only reproduces those semantics in the
 * browser so the sample runs without a server.
 *
 * The source file is XML on purpose: <we-grid> never touches the transport, it only receives an
 * array of rows, so the same grid works whether the data arrived as JSON, XML or anything else.
 */

import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, delay, map, shareReplay } from 'rxjs';
import {
  WeGridChecklistValue,
  WeGridChecklistValuesRequest,
  WeGridChecklistValuesResult,
  WeGridColumnFilterState,
  WeGridSortDirection
} from 'we-grid-angular';

import { Order, orderStatusLabel } from '../models/ecommerce.models';
import { OrderKpis } from '../models/ecommerce.models';
import { MockFieldTypes, MockPagedResult, applyMockFilters, applyMockSort, paginateMock } from './mock-query.util';

const NETWORK_DELAY_MS = 300;

const ORDER_FIELD_TYPES: MockFieldTypes = {
  orderNo: 'text',
  orderDate: 'datetime',
  customerName: 'text',
  customerCity: 'text',
  channel: 'text',
  statusCode: 'number',
  statusLabel: 'text',
  carrier: 'text',
  trackingNo: 'text',
  paymentMethod: 'text',
  itemCount: 'number',
  subtotal: 'currency',
  shippingCost: 'currency',
  totalAmount: 'currency',
  isPaid: 'boolean'
};

/** Statuses that still need operational work */
const OPEN_STATUS_CODES = [10, 20, 30, 40];
const CANCELLED_STATUS_CODE = 60;

export interface OrderQuery {
  page: number;
  pageSize: number;
  sortField: string | null;
  sortDirection: WeGridSortDirection;
  filters: WeGridColumnFilterState[];
}

export interface OrderPage extends MockPagedResult<Order> {
  kpis: OrderKpis;
  /** Grand total of the filtered set — feeds the grid's `summaryValues` input */
  totals: Record<string, number>;
}

@Injectable({ providedIn: 'root' })
export class OrderApiService {
  private readonly http = inject(HttpClient);

  private readonly orders$: Observable<Order[]> = this.http
    .get('assets/data/orders.xml', { responseType: 'text' })
    .pipe(
      map((xml) => this.parseOrdersXml(xml)),
      shareReplay({ bufferSize: 1, refCount: false })
    );

  getOrders(query: OrderQuery): Observable<OrderPage> {
    return this.orders$.pipe(
      map((all) => {
        const filtered = applyMockFilters(all, this.translateFilters(query.filters), ORDER_FIELD_TYPES);
        const sorted = applyMockSort(filtered, query.sortField, query.sortDirection, ORDER_FIELD_TYPES);
        const paged = paginateMock(sorted, query.page, query.pageSize);
        return {
          ...paged,
          kpis: this.computeKpis(filtered),
          totals: { totalAmount: filtered.reduce((sum, order) => sum + order.totalAmount, 0) }
        };
      }),
      delay(NETWORK_DELAY_MS)
    );
  }

  /**
   * The checklist's values over the WHOLE order table — `SELECT DISTINCT status_code … WHERE <every
   * other filter>` in SQL. The grid already leaves the requested column's own filter out of
   * `request.filters`; adding it back here would hide every status that isn't ticked yet. The
   * search box matches the label the user reads, and the label travels with the raw code.
   */
  getChecklistValues(request: WeGridChecklistValuesRequest): Observable<WeGridChecklistValuesResult> {
    return this.orders$.pipe(
      map((all) => {
        const filtered = applyMockFilters(all, this.translateFilters(request.filters), ORDER_FIELD_TYPES);
        const search = request.search?.toLowerCase();
        const distinct = new Map<string, WeGridChecklistValue>();
        for (const order of filtered) {
          const value = (order as unknown as Record<string, unknown>)[request.field];
          const key = String(value ?? '');
          if (distinct.has(key)) continue;
          const label = request.field === 'statusCode' ? order.statusLabel : key;
          if (search && !label.toLowerCase().includes(search)) continue;
          distinct.set(key, { value, label });
        }
        const values = Array.from(distinct.values());
        return { values: values.slice(0, request.limit), hasMore: values.length > request.limit };
      }),
      delay(NETWORK_DELAY_MS)
    );
  }

  /**
   * The status column shows a label through `displayValue`, so the user types "ship", not "40".
   * The grid still reports the filter under the raw field name — the backend is the place that
   * knows a status filter has to run against the label (a lookup-table join in SQL).
   */
  private translateFilters(filters: WeGridColumnFilterState[]): WeGridColumnFilterState[] {
    return filters.map((filter) =>
      filter.field === 'statusCode' && typeof filter.value === 'string'
        ? { ...filter, field: 'statusLabel', operator: 'contains' as const }
        : filter
    );
  }

  private computeKpis(rows: Order[]): OrderKpis {
    const revenue = rows.reduce((sum, order) => sum + order.totalAmount, 0);
    return {
      orderCount: rows.length,
      revenue,
      averageOrderValue: rows.length === 0 ? 0 : revenue / rows.length,
      openOrderCount: rows.filter((order) => OPEN_STATUS_CODES.includes(order.statusCode)).length,
      cancelledCount: rows.filter((order) => order.statusCode === CANCELLED_STATUS_CODE).length
    };
  }

  /** XML -> typed rows. A real API would return JSON; this shows the grid does not care. */
  private parseOrdersXml(xml: string): Order[] {
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    if (document.querySelector('parsererror')) {
      throw new Error('orders.xml could not be parsed');
    }

    return Array.from(document.getElementsByTagName('order')).map((element) => {
      const statusCode = this.readNumber(element, 'statusCode');
      return {
        id: this.readNumber(element, 'id'),
        orderNo: this.readText(element, 'orderNo'),
        orderDate: this.readText(element, 'orderDate'),
        customerName: this.readText(element, 'customerName'),
        customerCity: this.readText(element, 'customerCity'),
        channel: this.readText(element, 'channel'),
        statusCode,
        statusLabel: orderStatusLabel(statusCode),
        carrier: this.readText(element, 'carrier'),
        trackingNo: this.readText(element, 'trackingNo'),
        paymentMethod: this.readText(element, 'paymentMethod'),
        itemCount: this.readNumber(element, 'itemCount'),
        subtotal: this.readNumber(element, 'subtotal'),
        shippingCost: this.readNumber(element, 'shippingCost'),
        totalAmount: this.readNumber(element, 'totalAmount'),
        currency: this.readText(element, 'currency'),
        isPaid: this.readText(element, 'isPaid') === 'true'
      };
    });
  }

  private readText(element: Element, tag: string): string {
    return element.getElementsByTagName(tag).item(0)?.textContent?.trim() ?? '';
  }

  private readNumber(element: Element, tag: string): number {
    const parsed = Number(this.readText(element, tag));
    return Number.isNaN(parsed) ? 0 : parsed;
  }
}
