/** Row and query models for the retail market sample. All data is fictional. */

export interface Product {
  id: number;
  barcode: string;
  name: string;
  category: string;
  supplier: string;
  warehouse: string;
  costPrice: number;
  salePrice: number;
  stockQty: number;
  minStockQty: number;
  reservedQty: number;
  /** Whether the product is currently placed on the shelf */
  onShelf: boolean;
  shelfLifeDays: number;
  receivedAt: string;
  expiryDate: string;
  lastCountedAt: string;
}

/** Result of a bulk action performed on the selected rows */
export interface BulkActionResult {
  message: string;
  affectedRows: number;
}
