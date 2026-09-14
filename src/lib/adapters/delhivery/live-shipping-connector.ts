/**
 * Live Delhivery create-shipment + packing-slip connector — SERVER ONLY.
 */

import type {
  DelhiveryCreateShipmentInput,
  DelhiveryCreateShipmentResult,
  DelhiveryPackingSlipPackage,
  DelhiveryShippingConfig,
  DelhiveryShippingConnector,
} from "./shipping-port";
import { readDelhiveryShippingConfigFromEnv } from "./shipping-port";

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("LiveDelhiveryShippingConnector must not run in the browser.");
  }
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Token ${token}`,
    Accept: "application/json",
  };
}

function extractAwb(payload: unknown): { awb: string; sortCode: string | null; remarks: string[] } {
  const root = payload as Record<string, unknown>;
  const packages = Array.isArray(root.packages) ? root.packages : [];
  const first = (packages[0] ?? null) as Record<string, unknown> | null;
  const awb =
    (typeof first?.waybill === "string" && first.waybill.trim()) ||
    (typeof first?.wbn === "string" && first.wbn.trim()) ||
    (typeof root.waybill === "string" && root.waybill.trim()) ||
    "";
  if (!awb) {
    const remark =
      (typeof root.rmk === "string" && root.rmk) ||
      (typeof root.Error === "string" && root.Error) ||
      (typeof root.error === "string" && root.error) ||
      JSON.stringify(payload).slice(0, 280);
    throw new Error(`Delhivery did not return a waybill. ${remark}`);
  }
  const remarks: string[] = [];
  if (Array.isArray(first?.remarks)) {
    for (const r of first.remarks) if (typeof r === "string" && r.trim()) remarks.push(r.trim());
  }
  if (typeof root.rmk === "string" && root.rmk.trim()) remarks.push(root.rmk.trim());
  const sortCode =
    (typeof first?.sort_code === "string" && first.sort_code) ||
    (typeof first?.sortCode === "string" && first.sortCode) ||
    null;
  return { awb, sortCode, remarks };
}

export function createLiveDelhiveryShippingConnectorFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): LiveDelhiveryShippingConnector | null {
  const config = readDelhiveryShippingConfigFromEnv(env);
  if (!config) return null;
  return new LiveDelhiveryShippingConnector(config);
}

export class LiveDelhiveryShippingConnector implements DelhiveryShippingConnector {
  constructor(private readonly config: DelhiveryShippingConfig) {
    assertServerOnly();
  }

  async createShipment(
    input: DelhiveryCreateShipmentInput,
  ): Promise<DelhiveryCreateShipmentResult> {
    const pickup: Record<string, string> = { name: this.config.pickupName };
    if (this.config.pickupPin) pickup.pin = this.config.pickupPin;
    if (this.config.pickupAddress) pickup.add = this.config.pickupAddress;
    if (this.config.pickupCity) pickup.city = this.config.pickupCity;
    if (this.config.pickupState) pickup.state = this.config.pickupState;
    if (this.config.pickupPhone) pickup.phone = this.config.pickupPhone;

    const shipment: Record<string, unknown> = {
      order: input.orderNumber,
      phone: input.phone.replace(/\D/g, "").slice(-10),
      name: input.name,
      add: input.address,
      address_type: "home",
      pin: input.pin.replace(/\D/g, "").slice(0, 6),
      city: input.city,
      state: input.state,
      country: input.country || "India",
      payment_mode: input.paymentMode,
      weight: String(Math.max(50, Math.round(input.weightG))),
      shipping_mode: input.shippingMode,
      products_desc: input.productDescription || "Aarla goods",
    };
    if (input.address2?.trim()) shipment.address2 = input.address2.trim();
    if (input.paymentMode === "COD" && input.codAmount != null) {
      shipment.cod_amount = String(Math.round(input.codAmount));
    }
    if (input.totalAmount != null) {
      shipment.total_amount = String(Math.round(input.totalAmount));
    }

    const body = new URLSearchParams();
    body.set("format", "json");
    body.set(
      "data",
      JSON.stringify({
        pickup_location: pickup,
        shipments: [shipment],
      }),
    );

    const res = await fetch(`${this.config.baseUrl}/api/cmu/create.json`, {
      method: "POST",
      headers: {
        ...authHeaders(this.config.apiToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(
        `Delhivery create failed (${res.status}): ${text.slice(0, 240) || res.statusText}`,
      );
    }
    if (!res.ok) {
      throw new Error(
        `Delhivery create failed (${res.status}): ${JSON.stringify(json).slice(0, 280)}`,
      );
    }
    const extracted = extractAwb(json);
    const root = json as Record<string, unknown>;
    if (root.success === false) {
      throw new Error(
        extracted.remarks.join("; ") || "Delhivery rejected the shipment create request.",
      );
    }
    return { ...extracted, raw: json };
  }

  async fetchPackingSlip(awb: string): Promise<DelhiveryPackingSlipPackage> {
    const url = new URL(`${this.config.baseUrl}/api/p/packing_slip`);
    url.searchParams.set("wbns", awb.trim());
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: authHeaders(this.config.apiToken),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(
        `Delhivery packing slip failed (${res.status}): ${text.slice(0, 240) || res.statusText}`,
      );
    }
    if (!res.ok) {
      throw new Error(
        `Delhivery packing slip failed (${res.status}): ${JSON.stringify(json).slice(0, 280)}`,
      );
    }
    const root = json as Record<string, unknown>;
    const packages = Array.isArray(root.packages)
      ? root.packages
      : Array.isArray(root.Packages)
        ? root.Packages
        : [];
    const first = (packages[0] ?? root) as Record<string, unknown>;
    const resolvedAwb =
      (typeof first.wbn === "string" && first.wbn) ||
      (typeof first.waybill === "string" && first.waybill) ||
      awb;
    return {
      awb: resolvedAwb,
      orderId:
        (typeof first.oid === "string" && first.oid) ||
        (typeof first.order_id === "string" && first.order_id) ||
        null,
      name: typeof first.name === "string" ? first.name : null,
      address:
        (typeof first.address === "string" && first.address) ||
        (typeof first.add === "string" && first.add) ||
        null,
      city: typeof first.city === "string" ? first.city : null,
      pin: typeof first.pin === "string" ? first.pin : null,
      phone: typeof first.phone === "string" ? first.phone : null,
      paymentMode:
        (typeof first.pt === "string" && first.pt) ||
        (typeof first.payment_mode === "string" && first.payment_mode) ||
        null,
      shippingMode:
        (typeof first.shipping_mode === "string" && first.shipping_mode) || null,
      sortCode:
        (typeof first.sort_code === "string" && first.sort_code) ||
        (typeof first.sort_code === "object" &&
        first.sort_code &&
        typeof (first.sort_code as { code?: string }).code === "string"
          ? (first.sort_code as { code: string }).code
          : null),
      oid: typeof first.oid === "string" ? first.oid : null,
      raw: json,
    };
  }
}
