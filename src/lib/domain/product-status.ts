import type { Product } from "@/lib/domain/types";

/**
 * Inventory / stock screens should not list Shopify drafts (or archived).
 * Seed / legacy labels like "Low stock" stay visible — they are not drafts.
 */
export function isActiveCatalogProduct(product: Pick<Product, "status">): boolean {
  const status = (product.status || "").trim().toLowerCase();
  if (!status) return true;
  if (status === "draft" || status === "archived") return false;
  if (status.includes("draft")) return false;
  return true;
}

export function filterActiveCatalogProducts<T extends Pick<Product, "status">>(
  products: T[],
): T[] {
  return products.filter(isActiveCatalogProduct);
}
