/**
 * Delhivery AWB create + packing-slip label for Fulfil orders.
 */

import "server-only";

import { FixtureDelhiveryShippingConnector } from "@/lib/adapters/delhivery/fixture-shipping-connector";
import { createLiveDelhiveryShippingConnectorFromEnv } from "@/lib/adapters/delhivery/live-shipping-connector";
import { renderDelhiveryPackingSlipHtml } from "@/lib/adapters/delhivery/packing-slip-html";
import type { DelhiveryShippingConnector } from "@/lib/adapters/delhivery/shipping-port";
import { readDelhiveryShippingConfigFromEnv } from "@/lib/adapters/delhivery/shipping-port";
import { saveManualCourier, getFulfilmentDetail } from "@/lib/application/fulfilment-service";
import { ConfigurationError } from "@/lib/infra/db/errors";
import type { FulfilmentOrderDetail } from "@/lib/repositories/fulfilment";

export type DelhiveryAddressOverride = {
  name?: string | null;
  phone?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export type CreateDelhiveryAwbResult = {
  awb: string;
  sortCode: string | null;
  detail: FulfilmentOrderDetail;
};

function resolveShippingConnector(
  connector?: DelhiveryShippingConnector,
): DelhiveryShippingConnector {
  if (connector) return connector;
  if (process.env.DELHIVERY_USE_FIXTURE === "1") {
    return new FixtureDelhiveryShippingConnector();
  }
  const live = createLiveDelhiveryShippingConnectorFromEnv();
  if (!live) {
    throw new ConfigurationError(
      "Delhivery not configured. Set DELHIVERY_API_TOKEN (and DELHIVERY_PICKUP_PIN for rates, DELHIVERY_PICKUP_NAME for AWB create).",
    );
  }
  return live;
}

/** PAID → Prepaid; otherwise treat as COD (common for Shopify India COD). */
export function resolveDelhiveryPaymentMode(financialStatus: string | null | undefined): {
  paymentMode: "Prepaid" | "COD";
  codAmount: number | null;
} {
  const status = (financialStatus ?? "").trim().toUpperCase();
  if (status === "PAID") {
    return { paymentMode: "Prepaid", codAmount: null };
  }
  return { paymentMode: "COD", codAmount: null };
}

export function resolveDelhiveryShippingMode(
  method: string | null | undefined,
): "Surface" | "Express" {
  return method === "delhivery-express" ? "Express" : "Surface";
}

function requireField(label: string, value: string | null | undefined): string {
  const v = value?.trim() ?? "";
  if (!v) throw new Error(`Missing shipping ${label} — sync Shopify address or enter it before generating AWB.`);
  return v;
}

function buildProductDescription(detail: FulfilmentOrderDetail): string {
  const parts = detail.lines
    .slice(0, 4)
    .map((l) => {
      const title = l.title?.trim() || "item";
      const variant = l.variantTitle?.trim();
      return variant ? `${title} (${variant})×${l.requiredQuantity}` : `${title}×${l.requiredQuantity}`;
    });
  if (detail.lines.length > 4) parts.push(`+${detail.lines.length - 4} more`);
  return parts.join(", ").slice(0, 180) || "Aarla goods";
}

export type DelhiveryPackageOverride = {
  weightG?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  quantity?: number | null;
};

export async function createDelhiveryAwbForFulfilment(input: {
  fulfilmentOrderId: string;
  addressOverride?: DelhiveryAddressOverride | null;
  packageOverride?: DelhiveryPackageOverride | null;
  actor?: string | null;
  connector?: DelhiveryShippingConnector;
  /** When true, replace an existing AWB (creates a new Delhivery shipment). */
  replaceExisting?: boolean;
}): Promise<CreateDelhiveryAwbResult> {
  const detail = await getFulfilmentDetail(input.fulfilmentOrderId);
  if (!detail) throw new Error("Fulfilment order not found");

  const method = detail.shippingMethod;
  if (method !== "delhivery-surface" && method !== "delhivery-express") {
    throw new Error(
      "Set shipping method to Delhivery Surface or Express before generating an AWB.",
    );
  }
  if (detail.awb?.trim() && !input.replaceExisting) {
    throw new Error(
      `AWB already set (${detail.awb.trim()}). Print the label, or clear/replace before generating again.`,
    );
  }

  const ov = input.addressOverride ?? {};
  const pkg = input.packageOverride ?? {};
  const name = requireField(
    "name",
    ov.name ?? detail.shippingName ?? detail.customerName,
  );
  const phone = requireField("phone", ov.phone ?? detail.contactPhone);
  const address1 = requireField("address", ov.address1 ?? detail.shippingAddress1);
  const city = requireField("city", ov.city ?? detail.shippingCity);
  const state = requireField(
    "state",
    ov.state ?? detail.shippingProvince,
  );
  const zip = requireField("pin", ov.zip ?? detail.shippingZip);
  const address2 = (ov.address2 ?? detail.shippingAddress2)?.trim() || null;

  const { paymentMode } = resolveDelhiveryPaymentMode(detail.financialStatus);
  const codAmount = paymentMode === "COD" ? detail.totalAmount : null;
  const shippingMode = resolveDelhiveryShippingMode(method);
  const config = readDelhiveryShippingConfigFromEnv();
  const weightG =
    pkg.weightG && pkg.weightG > 0
      ? Math.round(pkg.weightG)
      : (config?.defaultWeightG ?? 500);
  const lengthCm = pkg.lengthCm && pkg.lengthCm > 0 ? Math.round(pkg.lengthCm) : 20;
  const widthCm = pkg.widthCm && pkg.widthCm > 0 ? Math.round(pkg.widthCm) : 15;
  const heightCm = pkg.heightCm && pkg.heightCm > 0 ? Math.round(pkg.heightCm) : 10;
  const quantity =
    pkg.quantity && pkg.quantity > 0
      ? Math.round(pkg.quantity)
      : Math.max(
          1,
          detail.lines.reduce((s, l) => s + (l.requiredQuantity || 0), 0) || 1,
        );

  // Delhivery requires unique order ids when it assigns the waybill.
  const orderNumber = input.replaceExisting
    ? `${detail.orderNumber}-R${Date.now().toString(36).slice(-5)}`
    : detail.orderNumber;

  const connector = resolveShippingConnector(input.connector);
  let created;
  try {
    created = await connector.createShipment({
      orderNumber,
      name,
      phone,
      address: address1,
      address2,
      city,
      state,
      pin: zip,
      country: detail.shippingCountry || "India",
      paymentMode,
      codAmount,
      weightG,
      lengthCm,
      widthCm,
      heightCm,
      quantity,
      shippingMode,
      productDescription: buildProductDescription(detail),
      totalAmount: detail.totalAmount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `${message} (sent ${weightG}g · ${lengthCm}×${widthCm}×${heightCm}cm · qty ${quantity} · ${paymentMode} · ${shippingMode}; check DELHIVERY_PICKUP_NAME matches Delhivery warehouse exactly)`,
    );
  }

  const saved = await saveManualCourier({
    fulfilmentOrderId: input.fulfilmentOrderId,
    awb: created.awb,
    courierProvider: "Delhivery",
    courierReference: created.sortCode,
    labelStatus: "ready",
    alternateAwaitingAwbCost: false,
    actor: input.actor ?? null,
  });

  return {
    awb: created.awb,
    sortCode: created.sortCode,
    detail: saved,
  };
}

export async function getDelhiveryLabelHtmlForFulfilment(input: {
  fulfilmentOrderId: string;
  connector?: DelhiveryShippingConnector;
}): Promise<{ html: string; awb: string }> {
  const detail = await getFulfilmentDetail(input.fulfilmentOrderId);
  if (!detail) throw new Error("Fulfilment order not found");
  const awb = detail.awb?.trim();
  if (!awb) {
    throw new Error("No AWB on this order — generate or enter an AWB first.");
  }

  const connector = resolveShippingConnector(input.connector);
  let slip;
  try {
    slip = await connector.fetchPackingSlip(awb);
  } catch (err) {
    // Fall back to local address so ops can still print when packing-slip API fails.
    slip = {
      awb,
      orderId: detail.orderNumber,
      name: detail.shippingName ?? detail.customerName,
      address: [detail.shippingAddress1, detail.shippingAddress2].filter(Boolean).join(", ") || null,
      city: detail.shippingCity,
      pin: detail.shippingZip,
      phone: detail.contactPhone,
      paymentMode: resolveDelhiveryPaymentMode(detail.financialStatus).paymentMode,
      shippingMode: resolveDelhiveryShippingMode(detail.shippingMethod),
      sortCode: detail.courierReference,
      oid: detail.orderNumber,
      raw: { fallback: true, error: err instanceof Error ? err.message : String(err) },
    };
  }

  return {
    awb,
    html: renderDelhiveryPackingSlipHtml({
      slip,
      orderNumber: detail.orderNumber,
    }),
  };
}

export type DelhiveryRatePair = {
  destinationPin: string;
  originPin: string;
  weightG: number;
  surface: {
    method: "delhivery-surface";
    totalAmount: number | null;
    grossAmount: number | null;
  };
  express: {
    method: "delhivery-express";
    totalAmount: number | null;
    grossAmount: number | null;
  };
  /** Cheaper method when both totals are known; null if tied / incomplete. */
  cheaper: "delhivery-surface" | "delhivery-express" | null;
  approximate: true;
};

export async function getDelhiveryRatesForFulfilment(input: {
  fulfilmentOrderId: string;
  destinationPin?: string | null;
  weightG?: number | null;
  connector?: DelhiveryShippingConnector;
}): Promise<DelhiveryRatePair> {
  const detail = await getFulfilmentDetail(input.fulfilmentOrderId);
  if (!detail) throw new Error("Fulfilment order not found");

  const destinationPin = requireField(
    "pin",
    input.destinationPin ?? detail.shippingZip,
  );
  const config = readDelhiveryShippingConfigFromEnv();
  const weightG =
    input.weightG && input.weightG > 0
      ? Math.round(input.weightG)
      : (config?.defaultWeightG ?? 500);

  const connector = resolveShippingConnector(input.connector);
  const [surface, express] = await Promise.all([
    connector.fetchRate({
      destinationPin,
      originPin: config?.pickupPin,
      weightG,
      shippingMode: "Surface",
    }),
    connector.fetchRate({
      destinationPin,
      originPin: config?.pickupPin,
      weightG,
      shippingMode: "Express",
    }),
  ]);

  let cheaper: DelhiveryRatePair["cheaper"] = null;
  if (surface.totalAmount != null && express.totalAmount != null) {
    if (surface.totalAmount < express.totalAmount) cheaper = "delhivery-surface";
    else if (express.totalAmount < surface.totalAmount) cheaper = "delhivery-express";
  }

  return {
    destinationPin: surface.destinationPin,
    originPin: surface.originPin,
    weightG,
    surface: {
      method: "delhivery-surface",
      totalAmount: surface.totalAmount,
      grossAmount: surface.grossAmount,
    },
    express: {
      method: "delhivery-express",
      totalAmount: express.totalAmount,
      grossAmount: express.grossAmount,
    },
    cheaper,
    approximate: true,
  };
}
