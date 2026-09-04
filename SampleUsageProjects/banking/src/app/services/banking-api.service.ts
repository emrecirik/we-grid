/*
 * Mock backend for the banking sample.
 *
 * In a real backend the filtering/sorting/paging below is done in SQL; here the whole JSON file is
 * loaded once, cached, and queried in memory so the sample runs with `ng serve` alone.
 */

import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, delay, map, shareReplay } from 'rxjs';
import { WeGridColumnFilterState, WeGridSortDirection } from 'we-grid-angular';

import { BankTransaction, LoanRecord, TransactionTotals } from '../models/banking.models';
import { MockFieldTypes, MockPagedResult, applyMockFilters, applyMockSort, paginateMock } from './mock-query.util';

/** Simulated network latency */
const NETWORK_DELAY_MS = 300;

const TRANSACTION_FIELD_TYPES: MockFieldTypes = {
  accountNo: 'text',
  accountName: 'text',
  reference: 'text',
  transactionDate: 'datetime',
  valueDate: 'date',
  typeCode: 'text',
  typeLabel: 'text',
  description: 'text',
  channel: 'text',
  currency: 'text',
  amount: 'currency',
  amountTry: 'currency',
  absAmountTry: 'currency',
  balanceAfter: 'currency'
};

export interface TransactionQuery {
  page: number;
  pageSize: number;
  sortField: string | null;
  sortDirection: WeGridSortDirection;
  filters: WeGridColumnFilterState[];
}

/** Paged page plus the grand totals the grid shows in its summary row */
export interface TransactionPage extends MockPagedResult<BankTransaction> {
  totals: TransactionTotals;
}

/** Raw JSON row — absAmountTry is derived here, a real backend would return it as a computed column */
type RawTransaction = Omit<BankTransaction, 'absAmountTry'>;

@Injectable({ providedIn: 'root' })
export class BankingApiService {
  private readonly http = inject(HttpClient);

  private readonly transactions$: Observable<BankTransaction[]> = this.http
    .get<RawTransaction[]>('assets/data/transactions.json')
    .pipe(
      map((rows) => rows.map((row) => ({ ...row, absAmountTry: Math.abs(row.amountTry) }))),
      shareReplay({ bufferSize: 1, refCount: false })
    );

  private readonly loans$: Observable<LoanRecord[]> = this.http
    .get<LoanRecord[]>('assets/data/loans.json')
    .pipe(shareReplay({ bufferSize: 1, refCount: false }));

  /** Server-side page: WHERE -> ORDER BY -> OFFSET/FETCH, plus totals over the filtered set */
  getTransactions(query: TransactionQuery): Observable<TransactionPage> {
    return this.transactions$.pipe(
      map((all) => {
        const filtered = applyMockFilters(all, query.filters, TRANSACTION_FIELD_TYPES);
        const sorted = applyMockSort(filtered, query.sortField, query.sortDirection, TRANSACTION_FIELD_TYPES);
        const paged = paginateMock(sorted, query.page, query.pageSize);
        return { ...paged, totals: this.computeTotals(filtered) };
      }),
      delay(NETWORK_DELAY_MS)
    );
  }

  /** The loan portfolio grid keeps the full list in memory and lets the grid filter/sort it */
  getLoans(): Observable<LoanRecord[]> {
    return this.loans$.pipe(delay(NETWORK_DELAY_MS));
  }

  private computeTotals(rows: BankTransaction[]): TransactionTotals {
    if (rows.length === 0) {
      return { amountTry: 0, absAmountTry: 0 };
    }
    const net = rows.reduce((sum, row) => sum + row.amountTry, 0);
    const absTotal = rows.reduce((sum, row) => sum + row.absAmountTry, 0);
    return { amountTry: net, absAmountTry: absTotal / rows.length };
  }
}
