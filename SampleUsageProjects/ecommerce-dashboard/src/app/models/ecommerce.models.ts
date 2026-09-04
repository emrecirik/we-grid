/** Row, query and KPI models for the e-commerce sample. All data is fictional. */

export interface Order {
  id: number;
  orderNo: string;
  orderDate: string;
  customerName: string;
  customerCity: string;
  channel: string;
  /** Raw status code as stored by the backend — the readable label comes from ORDER_STATUS_LABELS */
  statusCode: number;
  /** Projected label; the mock backend adds it so text filters can run against what the user sees */
  statusLabel: string;
  carrier: string;
  trackingNo: string;
  paymentMethod: string;
  itemCount: number;
  subtotal: number;
  shippingCost: number;
  totalAmount: number;
  currency: string;
  isPaid: boolean;
}

/** status code -> label lookup; in a real app this would come from a reference endpoint */
export const ORDER_STATUS_LABELS: Record<number, string> = {
  10: 'Awaiting Payment',
  20: 'Paid',
  30: 'Preparing',
  40: 'Shipped',
  50: 'Delivered',
  60: 'Cancelled'
};

export function orderStatusLabel(statusCode: number): string {
  return ORDER_STATUS_LABELS[statusCode] ?? `Unknown (${statusCode})`;
}

/** Dashboard figures computed over the filtered set, not just the current page */
export interface OrderKpis {
  orderCount: number;
  revenue: number;
  averageOrderValue: number;
  openOrderCount: number;
  cancelledCount: number;
}
