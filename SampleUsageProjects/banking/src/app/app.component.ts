import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import {
  WeGridCellDirective,
  WeGridColumnDef,
  WeGridColumnFilterState,
  WeGridComponent,
  WeGridPageChange,
  WeGridRowDetailDirective,
  WeGridSortChange,
  WeGridSortDirection
} from '@we-grid/angular';

import { BankTransaction, LoanRecord } from './models/banking.models';
import { BankingApiService } from './services/banking-api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, WeGridComponent, WeGridCellDirective, WeGridRowDetailDirective],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly api = inject(BankingApiService);
  private readonly destroy$ = new Subject<void>();

  // ─── Account transactions (server-side) ───────────────────────────────────────────────────
  transactions: BankTransaction[] = [];
  transactionsLoading = false;
  page = 1;
  pageSize = 20;
  totalCount = 0;
  sortField: string | null = 'transactionDate';
  sortDirection: WeGridSortDirection = 'desc';
  activeFilters: WeGridColumnFilterState[] = [];
  /** Grand totals from the backend — without these the grid would only total the loaded page */
  summaryValues: Record<string, number> = {};

  readonly transactionColumns: WeGridColumnDef<BankTransaction>[] = [
    // Pinned left so the account stays visible while scrolling the other columns horizontally
    { field: 'accountNo', header: 'Account No', width: 210, pinned: 'left' },
    { field: 'accountName', header: 'Account Holder', width: 190 },
    { field: 'transactionDate', header: 'Transaction Date', type: 'datetime', width: 165 },
    { field: 'valueDate', header: 'Value Date', type: 'date', width: 125 },
    {
      field: 'typeCode',
      header: 'Type',
      width: 170,
      // Filtering/grouping work on the label the user reads, not on the raw code
      displayValue: (row) => row.typeLabel
    },
    { field: 'description', header: 'Description', width: 260 },
    { field: 'channel', header: 'Channel', width: 140 },
    { field: 'currency', header: 'Cur.', width: 80, align: 'center' },
    // Mixed-currency column: the type stays 'currency' (so the summary menu keeps sum/avg) while a
    // custom template renders the row's own currency and colours negative amounts.
    { field: 'amount', header: 'Amount', type: 'currency', width: 150, align: 'end' },
    { field: 'amountTry', header: 'Amount (TRY)', type: 'currency', format: 'TRY', width: 155, align: 'end', summary: 'sum' },
    { field: 'absAmountTry', header: 'Transaction Size', type: 'currency', format: 'TRY', width: 155, align: 'end', summary: 'avg' },
    { field: 'balanceAfter', header: 'Balance After', type: 'currency', format: 'TRY', width: 160, align: 'end' },
    { field: 'reference', header: 'Reference', width: 150 }
  ];

  // ─── Loan portfolio (client-side over the fully loaded list) ──────────────────────────────
  loans: LoanRecord[] = [];
  loansLoading = false;

  readonly loanColumns: WeGridColumnDef<LoanRecord>[] = [
    { field: 'loanNo', header: 'Loan No', width: 120, pinned: 'left' },
    { field: 'customerName', header: 'Customer', width: 210 },
    { field: 'product', header: 'Product', width: 160 },
    { field: 'currency', header: 'Cur.', width: 80, align: 'center' },
    { field: 'outstanding', header: 'Outstanding', type: 'currency', width: 150, align: 'end' },
    { field: 'outstandingTry', header: 'Outstanding (TRY)', type: 'currency', format: 'TRY', width: 175, align: 'end', summary: 'sum' },
    { field: 'installmentAmount', header: 'Installment', type: 'currency', width: 150, align: 'end', summary: 'avg' },
    { field: 'interestRate', header: 'Rate %', type: 'number', format: '2-2', width: 100, align: 'end' },
    { field: 'startDate', header: 'Start', type: 'date', width: 120 },
    { field: 'maturityDate', header: 'Maturity', type: 'date', width: 120 },
    { field: 'status', header: 'Status', width: 130 },
    { field: 'overdueDays', header: 'Overdue Days', type: 'number', width: 130, align: 'end' },
    { field: 'riskGrade', header: 'Risk', width: 90, align: 'center' }
  ];

  ngOnInit(): void {
    this.loadTransactions();
    this.loadLoans();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Server-side event handlers ───────────────────────────────────────────────────────────
  onPageChange(event: WeGridPageChange): void {
    this.page = event.page;
    this.pageSize = event.pageSize;
    this.loadTransactions();
  }

  onSortChange(event: WeGridSortChange): void {
    this.sortField = event.field;
    this.sortDirection = event.direction;
    this.page = 1;
    this.loadTransactions();
  }

  onFilterChange(filters: WeGridColumnFilterState[]): void {
    this.activeFilters = filters;
    this.page = 1;
    this.loadTransactions();
  }

  // ─── Cell helpers ─────────────────────────────────────────────────────────────────────────
  formatMoney(amount: number, currency: string): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  }

  riskClass(grade: string): string {
    if (grade === 'A') return 'risk risk--low';
    if (grade === 'B') return 'risk risk--medium';
    return 'risk risk--high';
  }

  private loadTransactions(): void {
    this.transactionsLoading = true;
    this.api
      .getTransactions({
        page: this.page,
        pageSize: this.pageSize,
        sortField: this.sortField,
        sortDirection: this.sortDirection,
        filters: this.activeFilters
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe((result) => {
        this.transactions = result.items;
        this.totalCount = result.totalCount;
        this.summaryValues = { amountTry: result.totals.amountTry, absAmountTry: result.totals.absAmountTry };
        this.transactionsLoading = false;
      });
  }

  private loadLoans(): void {
    this.loansLoading = true;
    this.api
      .getLoans()
      .pipe(takeUntil(this.destroy$))
      .subscribe((loans) => {
        this.loans = loans;
        this.loansLoading = false;
      });
  }
}
