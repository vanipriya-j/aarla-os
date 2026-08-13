/**
 * Inventory & Replenishment — turns reorder rules + ledger balances into an
 * actionable "what needs restocking" list. Pure function of movements + rules.
 */
import {
  DEFAULT_INVENTORY_LOC,
  deriveInventorySnapshots,
  deriveVariantTotals,
  partnerStockFor,
  type InventoryLocCodes,
} from "./ledger";
import type { Location, Partner, Product, ReorderRule, StockMovement } from "./types";

export type ReplenishmentAction =
  | "Transfer"
  | "Manufacture"
  | "Reorder / Manufacture"
  | "Create Transfer";

export type ReplenishmentKind = "aarla-low" | "partner-need" | "global-low";

export interface ReplenishmentItem {
  kind: ReplenishmentKind;
  productId: string;
  variantId?: string;
  label: string;
  studio: number;
  partners: number;
  total: number;
  minQuantity: number;
  partnerId?: string;
  partnerName?: string;
  partnerQty?: number;
  suggestedAction: ReplenishmentAction;
}

function labelFor(
  product: Pick<Product, "title" | "variants">,
  variantId?: string,
): string {
  if (!variantId) return product.title;
  const variant = product.variants.find((v) => v.id === variantId);
  return variant ? `${product.title} — ${variant.label}` : product.title;
}

export interface ComputeReplenishmentInput {
  products: Pick<Product, "id" | "title" | "variants">[];
  movements: StockMovement[];
  locations: Location[];
  partners: Pick<Partner, "id" | "name">[];
  rules: ReorderRule[];
  locCodes?: InventoryLocCodes;
}

/**
 * Compute the replenishment worklist from reorder rules against current ledger balances.
 * - aarla-low: studio stock below a product/variant minimum (unscoped rules)
 * - global-low: studio + partner stock below a product/variant minimum (unscoped rules)
 * - partner-need: a specific partner's stock below its partner-scoped minimum
 */
export function computeReplenishment(input: ComputeReplenishmentInput): ReplenishmentItem[] {
  const { products, movements, locations, partners, rules } = input;
  const locCodes = input.locCodes ?? DEFAULT_INVENTORY_LOC;

  const productById = new Map(products.map((p) => [p.id, p]));
  const partnerById = new Map(partners.map((p) => [p.id, p]));
  const partnerLocationByPartnerId = new Map(
    locations
      .filter((l): l is Location & { partnerId: string } => Boolean(l.partnerId))
      .map((l) => [l.partnerId, l]),
  );

  const snapshotByProduct = new Map(
    deriveInventorySnapshots(movements, products, locations, locCodes).map((s) => [
      s.productId,
      s,
    ]),
  );
  const variantCellsByProduct = new Map(
    products.map((p) => [
      p.id,
      deriveVariantTotals(movements, p.id, p.variants, locations, locCodes),
    ]),
  );

  const items: ReplenishmentItem[] = [];

  for (const rule of rules) {
    const product = productById.get(rule.productId);
    if (!product) continue;

    const variantId = rule.variantId || undefined;
    const cell = variantId
      ? variantCellsByProduct.get(rule.productId)?.find((c) => c.variantId === variantId)
      : undefined;
    const snapshot = snapshotByProduct.get(rule.productId);

    const studio = cell ? cell.studio : snapshot?.studioStock ?? 0;
    const partnerTotal = cell ? cell.partner : snapshot?.partnerStock ?? 0;
    const total = studio + partnerTotal;
    const label = labelFor(product, variantId);

    if (rule.partnerId) {
      const partnerLoc = partnerLocationByPartnerId.get(rule.partnerId);
      const partnerQty = cell
        ? cell.byLocation.find((l) => l.locationId === partnerLoc?.id)?.quantity ?? 0
        : partnerStockFor(movements, rule.partnerId, locations).find(
            (s) => s.productId === rule.productId,
          )?.quantity ?? 0;

      if (partnerQty < rule.minQuantity) {
        items.push({
          kind: "partner-need",
          productId: rule.productId,
          variantId,
          label,
          studio,
          partners: partnerTotal,
          total,
          minQuantity: rule.minQuantity,
          partnerId: rule.partnerId,
          partnerName: partnerById.get(rule.partnerId)?.name ?? rule.partnerId,
          partnerQty,
          suggestedAction: studio >= rule.minQuantity - partnerQty ? "Transfer" : "Create Transfer",
        });
      }
      continue;
    }

    if (studio < rule.minQuantity) {
      items.push({
        kind: "aarla-low",
        productId: rule.productId,
        variantId,
        label,
        studio,
        partners: partnerTotal,
        total,
        minQuantity: rule.minQuantity,
        suggestedAction: partnerTotal > 0 ? "Transfer" : "Manufacture",
      });
    }

    if (total < rule.minQuantity) {
      items.push({
        kind: "global-low",
        productId: rule.productId,
        variantId,
        label,
        studio,
        partners: partnerTotal,
        total,
        minQuantity: rule.minQuantity,
        suggestedAction: "Reorder / Manufacture",
      });
    }
  }

  return items;
}
