/**
 * Inventory availability helpers — Studio / partner / reserved / totals.
 * Soft holds (channel reservations, campaign allocations) sit beside the ledger.
 */
import {
  DEFAULT_INVENTORY_LOC,
  deriveVariantLocationBreakdown,
  type InventoryLocCodes,
} from "@/lib/domain/ledger";
import type { Location, ProductVariant, StockMovement, VariantStockCell } from "@/lib/domain/types";

export type SoftHold = {
  productId: string;
  variantId: string | null;
  quantity: number;
};

export type VariantAvailability = VariantStockCell & {
  softReserved: number;
  /** Studio minus soft holds (never below 0). */
  studioAvailableNow: number;
  partnerByName: Array<{ partnerName: string; locationId: string; quantity: number }>;
};

export function sumSoftHolds(
  holds: SoftHold[],
  productId: string,
  variantId: string,
): number {
  return holds
    .filter(
      (h) =>
        h.productId === productId &&
        (h.variantId == null || h.variantId === "" || h.variantId === variantId),
    )
    .reduce((n, h) => n + Math.max(0, h.quantity), 0);
}

export function getVariantAvailability(input: {
  movements: StockMovement[];
  productId: string;
  variantId: string;
  locations: Location[];
  softHolds?: SoftHold[];
  locCodes?: InventoryLocCodes;
}): VariantAvailability {
  const cell = deriveVariantLocationBreakdown(
    input.movements,
    input.productId,
    input.variantId,
    input.locations,
    input.locCodes ?? DEFAULT_INVENTORY_LOC,
  );
  const softReserved = sumSoftHolds(input.softHolds ?? [], input.productId, input.variantId);
  const studioAvailableNow = Math.max(0, cell.studio - softReserved);
  const partnerByName = cell.byLocation
    .filter((l) => l.kind === "Partner")
    .map((l) => ({
      partnerName: l.locationName,
      locationId: l.locationId,
      quantity: l.quantity,
    }));

  return {
    ...cell,
    softReserved,
    studioAvailableNow,
    partnerByName,
  };
}

export function getProductAvailability(input: {
  movements: StockMovement[];
  productId: string;
  variants: ProductVariant[];
  locations: Location[];
  softHolds?: SoftHold[];
  locCodes?: InventoryLocCodes;
}): VariantAvailability[] {
  return input.variants.map((v) =>
    getVariantAvailability({
      movements: input.movements,
      productId: input.productId,
      variantId: v.id,
      locations: input.locations,
      softHolds: input.softHolds,
      locCodes: input.locCodes,
    }),
  );
}

/** Slice apparel variants by a Size option value (e.g. all Tyagaraja L colours). */
export function variantsMatchingOption(
  variants: ProductVariant[],
  key: string,
  value: string,
): ProductVariant[] {
  const target = value.trim().toLowerCase();
  return variants.filter((v) => (v.options?.[key] ?? "").trim().toLowerCase() === target);
}
