/** Row and query models for the banking sample. All data is fictional. */

export type TransactionDirection = 'debit' | 'credit';

export interface TransactionBreakdownLine {
  code: string;
  label: string;
  amount: number;
}

export interface BankTransaction {
  id: number;
  accountNo: string;
  accountName: string;
  reference: string;
  transactionDate: string;
  valueDate: string;
  typeCode: string;
  typeLabel: string;
  direction: TransactionDirection;
  description: string;
  channel: string;
  currency: string;
  /** Amount in the transaction currency — negative for debits */
  amount: number;
  /** Amount converted to the reporting currency (TRY) — negative for debits */
  amountTry: number;
  /** Absolute value of amountTry; a backend would project this, we derive it in the mock service */
  absAmountTry: number;
  balanceAfter: number;
  breakdown: TransactionBreakdownLine[];
}

export interface LoanRecord {
  id: number;
  loanNo: string;
  accountNo: string;
  customerName: string;
  product: string;
  currency: string;
  principal: number;
  outstanding: number;
  outstandingTry: number;
  interestRate: number;
  installmentAmount: number;
  termMonths: number;
  startDate: string;
  maturityDate: string;
  status: string;
  overdueDays: number;
  riskGrade: string;
}

/** Server-computed totals for the summary row, keyed by column field */
export interface TransactionTotals {
  amountTry: number;
  absAmountTry: number;
}
