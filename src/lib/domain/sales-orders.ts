import { getProduct } from "./catalog";
import type { SalesOrder, SalesOrderLine } from "./types";

/**
 * Pure helpers for canonical SalesOrders.
 * Channel adapters produce SalesOrders; screens and metrics consume these — never raw Shopify payloads.
 */

export function assertCanonicalSalesOrderLines(lines: SalesOrderLine[]): string[] {
  const errors: string[] = [];
  for (const line of lines) {
    if (!line.productId) {
      errors.push("SalesOrder line missing productId");
      continue;
    }
    if (!getProduct(line.productId)) {
      errors.push(`Unknown canonical productId: ${line.productId}`);
    }
    if (line.quantity <= 0) {
      errors.push(`Invalid quantity for ${line.productId}`);
    }
  }
  return errors;
}

export function salesOrderUsesCanonicalCatalog(order: SalesOrder): boolean {
  return assertCanonicalSalesOrderLines(order.lines).length === 0;
}

/** Ledger reference for a channel sale — always Aarla OS order id, not an opaque channel blob. */
export function salesOrderLedgerReference(order: SalesOrder): string {
  return order.id;
}
