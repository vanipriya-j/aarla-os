/**
 * FIFO-style inventory aging from ledger inflows/outflows.
 * Age is from movement_date of inbound layers — not product created_at.
 */
import type { Location, StockMovement } from "@/lib/domain/types";
import { DEFAULT_INVENTORY_LOC, type InventoryLocCodes } from "@/lib/domain/ledger";

export type AgeBand = "0-30" | "31-60" | "61-90" | "91-180" | "180+";

export const AGE_BANDS: AgeBand[] = ["0-30", "31-60", "61-90", "91-180", "180+"];

export type AgeLayer = {
  availableOn: string;
  quantity: number;
  ageDays: number;
  band: AgeBand;
  locationId: string;
};

export type VariantAging = {
  productId: string;
  variantId: string;
  locationId: string | "all-sellable";
  layers: AgeLayer[];
  quantity: number;
  oldestAgeDays: number | null;
  bands: Record<AgeBand, number>;
  costIncomplete: boolean;
  valueAtCost: number | null;
};

function dayMs(isoDay: string): number {
  return Date.parse(`${String(isoDay).slice(0, 10)}T00:00:00.000Z`);
}

function daysBetween(a: string, b: string): number {
  return Math.max(0, Math.round((dayMs(b) - dayMs(a)) / 86_400_000));
}

export function ageBandForDays(days: number): AgeBand {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  if (days <= 180) return "91-180";
  return "180+";
}

function emptyBands(): Record<AgeBand, number> {
  return { "0-30": 0, "31-60": 0, "61-90": 0, "91-180": 0, "180+": 0 };
}

function isInboundTo(locId: string, m: StockMovement): boolean {
  return m.toLocationId === locId && m.fromLocationId !== locId;
}

function isOutboundFrom(locId: string, m: StockMovement): boolean {
  return m.fromLocationId === locId && m.toLocationId !== locId;
}

/**
 * Remaining inventory layers at a location using FIFO consumption of outflows.
 */
export function fifoLayersAtLocation(input: {
  movements: StockMovement[];
  productId: string;
  variantId: string;
  locationId: string;
  asOf?: string;
}): AgeLayer[] {
  const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);
  const relevant = input.movements
    .filter(
      (m) =>
        m.productId === input.productId &&
        (m.variantId ?? "") === input.variantId &&
        (isInboundTo(input.locationId, m) || isOutboundFrom(input.locationId, m)),
    )
    .sort((a, b) => dayMs(a.date) - dayMs(b.date) || a.id.localeCompare(b.id));

  type Layer = { availableOn: string; remaining: number };
  const open: Layer[] = [];

  for (const m of relevant) {
    if (isInboundTo(input.locationId, m)) {
      open.push({ availableOn: String(m.date).slice(0, 10), remaining: m.quantity });
      continue;
    }
    let need = m.quantity;
    for (const layer of open) {
      if (need <= 0) break;
      const take = Math.min(layer.remaining, need);
      layer.remaining -= take;
      need -= take;
    }
  }

  return open
    .filter((l) => l.remaining > 0)
    .map((l) => {
      const ageDays = daysBetween(l.availableOn, asOf);
      return {
        availableOn: l.availableOn,
        quantity: l.remaining,
        ageDays,
        band: ageBandForDays(ageDays),
        locationId: input.locationId,
      };
    });
}

export function getVariantAging(input: {
  movements: StockMovement[];
  productId: string;
  variantId: string;
  locations: Location[];
  unitCost: number | null;
  locationId?: string;
  locCodes?: InventoryLocCodes;
  asOf?: string;
}): VariantAging {
  const locCodes = input.locCodes ?? DEFAULT_INVENTORY_LOC;
  const sellableLocIds = input.locationId
    ? [input.locationId]
    : input.locations
        .filter((l) => l.kind === "Studio" || l.kind === "Partner" || l.id === locCodes.shopify)
        .map((l) => l.id);

  const layers = sellableLocIds.flatMap((locationId) =>
    fifoLayersAtLocation({
      movements: input.movements,
      productId: input.productId,
      variantId: input.variantId,
      locationId,
      asOf: input.asOf,
    }),
  );

  const bands = emptyBands();
  let quantity = 0;
  let oldestAgeDays: number | null = null;
  for (const layer of layers) {
    bands[layer.band] += layer.quantity;
    quantity += layer.quantity;
    oldestAgeDays =
      oldestAgeDays == null ? layer.ageDays : Math.max(oldestAgeDays, layer.ageDays);
  }

  const costIncomplete = input.unitCost == null || !(input.unitCost > 0);
  const valueAtCost = costIncomplete ? null : quantity * input.unitCost!;

  return {
    productId: input.productId,
    variantId: input.variantId,
    locationId: input.locationId ?? "all-sellable",
    layers,
    quantity,
    oldestAgeDays,
    bands,
    costIncomplete,
    valueAtCost,
  };
}
