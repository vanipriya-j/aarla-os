import type { InventoryBalance, Product } from "@/lib/domain/types";
import type { ResolvedCatalogTarget } from "@/lib/domain/channel-reservation-types";
import { balanceAt } from "@/lib/domain/ledger";

/**
 * Resolve a catalog target from SKU and/or product/variant domain codes.
 * Variant SKU wins over product SKU when both match different rows.
 */
export function resolveCatalogTarget(
  products: Product[],
  input: { productId?: string; variantId?: string; sku?: string },
): ResolvedCatalogTarget | null {
  const sku = input.sku?.trim();
  const productId = input.productId?.trim();
  const variantId = input.variantId?.trim();

  if (sku) {
    for (const p of products) {
      const variant = p.variants.find((v) => v.sku === sku);
      if (variant) {
        return {
          productId: p.id,
          variantId: variant.id,
          sku: variant.sku,
          title: `${p.title} · ${variant.label}`,
        };
      }
    }
    for (const p of products) {
      if (p.sku === sku) {
        return {
          productId: p.id,
          variantId: null,
          sku: p.sku,
          title: p.title,
        };
      }
    }
  }

  if (productId) {
    const product = products.find((p) => p.id === productId);
    if (!product) return null;
    if (variantId) {
      const variant = product.variants.find((v) => v.id === variantId);
      if (!variant) return null;
      return {
        productId: product.id,
        variantId: variant.id,
        sku: variant.sku,
        title: `${product.title} · ${variant.label}`,
      };
    }
    return {
      productId: product.id,
      variantId: null,
      sku: product.sku,
      title: product.title,
    };
  }

  return null;
}

/**
 * Studio ledger qty for a soft-reserve target.
 * Product-level (no variant): sum across all variant buckets.
 * Variant target: that variant's qty; if the product has ≤1 variant, also
 * include unspecified-variant (legacy product-level) movements so SKU holds work.
 */
export function studioLedgerAvailable(
  balances: InventoryBalance[],
  products: Product[],
  productId: string,
  variantId: string | null,
  studioLocationId: string,
): number {
  if (variantId == null) {
    return Math.max(0, balanceAt(balances, productId, studioLocationId));
  }
  const specific = Math.max(
    0,
    balanceAt(balances, productId, studioLocationId, variantId),
  );
  const product = products.find((p) => p.id === productId);
  if (product && product.variants.length <= 1) {
    const unspecified = Math.max(
      0,
      balanceAt(balances, productId, studioLocationId, ""),
    );
    return specific + unspecified;
  }
  return specific;
}

/**
 * Soft-available Studio qty = ledger Studio balance − sum(active soft reservations).
 * Never returns negative.
 */
export function softAvailableStudio(
  studioBalance: number,
  activeReservedQuantity: number,
): number {
  return Math.max(0, Math.floor(studioBalance) - Math.max(0, Math.floor(activeReservedQuantity)));
}

export function canSoftReserve(available: number, requested: number): boolean {
  return requested > 0 && available >= requested;
}
