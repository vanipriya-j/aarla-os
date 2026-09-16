/**
 * Live Delhivery create-shipment + packing-slip connector — SERVER ONLY.
 */

import type {
  DelhiveryCreateShipmentInput,
  DelhiveryCreateShipmentResult,
  DelhiveryPackingSlipOptions,
  DelhiveryPackingSlipPackage,
  DelhiveryRateQuote,
  DelhiveryRateQuoteInput,
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

/** Delhivery rejects &, #, %, ;, \ in free-text fields. */
function sanitizeDelhiveryText(value: string): string {
  return value
    .replace(/[&#%;\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  const remarks: string[] = [];
  if (Array.isArray(first?.remarks)) {
    for (const r of first.remarks) if (typeof r === "string" && r.trim()) remarks.push(r.trim());
  }
  if (typeof first?.status === "string" && first.status.trim()) {
    remarks.push(`status=${first.status.trim()}`);
  }
  if (typeof root.rmk === "string" && root.rmk.trim()) remarks.push(root.rmk.trim());
  if (typeof root.Error === "string" && root.Error.trim()) remarks.push(root.Error.trim());
  if (typeof root.error === "string" && root.error.trim()) remarks.push(root.error.trim());
  if (!awb) {
    const remark =
      remarks.join("; ") ||
      JSON.stringify(payload).slice(0, 400);
    throw new Error(`Delhivery did not return a waybill. ${remark}`);
  }
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
    if (!this.config.pickupName?.trim()) {
      throw new Error(
        "Delhivery pickup name missing. Set DELHIVERY_PICKUP_NAME (registered warehouse name).",
      );
    }
    const pickup: Record<string, string> = { name: this.config.pickupName };
    if (this.config.pickupPin) pickup.pin = this.config.pickupPin;
    if (this.config.pickupAddress) pickup.add = this.config.pickupAddress;
    if (this.config.pickupCity) pickup.city = this.config.pickupCity;
    if (this.config.pickupState) pickup.state = this.config.pickupState;
    if (this.config.pickupPhone) pickup.phone = this.config.pickupPhone;

    const paymentModeApi =
      input.paymentMode === "COD" ? "COD" : "Pre-paid";
    const lengthCm = Math.max(1, Math.round(input.lengthCm ?? 20));
    const widthCm = Math.max(1, Math.round(input.widthCm ?? 15));
    const heightCm = Math.max(1, Math.round(input.heightCm ?? 10));
    const quantity = Math.max(1, Math.round(input.quantity ?? 1));

    const shipment: Record<string, unknown> = {
      order: sanitizeDelhiveryText(input.orderNumber).slice(0, 50),
      phone: input.phone.replace(/\D/g, "").slice(-10),
      name: sanitizeDelhiveryText(input.name).slice(0, 100),
      add: sanitizeDelhiveryText(input.address).slice(0, 200),
      address_type: "home",
      pin: input.pin.replace(/\D/g, "").slice(0, 6),
      city: sanitizeDelhiveryText(input.city).slice(0, 50),
      state: sanitizeDelhiveryText(input.state).slice(0, 50),
      country: input.country || "India",
      payment_mode: paymentModeApi,
      weight: Math.max(50, Math.round(input.weightG)),
      shipment_length: lengthCm,
      shipment_width: widthCm,
      shipment_height: heightCm,
      quantity,
      shipping_mode: input.shippingMode,
      products_desc: sanitizeDelhiveryText(
        input.productDescription || "Aarla goods",
      ).slice(0, 180),
    };
    if (input.address2?.trim()) {
      shipment.address2 = sanitizeDelhiveryText(input.address2).slice(0, 100);
    }
    if (input.paymentMode === "COD" && input.codAmount != null) {
      shipment.cod_amount = Math.round(input.codAmount);
    }
    if (input.totalAmount != null) {
      shipment.total_amount = Math.round(input.totalAmount);
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

  async fetchPackingSlip(
    awb: string,
    options?: DelhiveryPackingSlipOptions,
  ): Promise<DelhiveryPackingSlipPackage> {
    const wantPdf = options?.pdf !== false;
    const url = new URL(`${this.config.baseUrl}/api/p/packing_slip`);
    url.searchParams.set("wbns", awb.trim());
    if (wantPdf) {
      url.searchParams.set("pdf", "true");
      url.searchParams.set("pdf_size", options?.pdfSize ?? "4R");
    }
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
    const pdfDownloadLink =
      (typeof first.pdf_download_link === "string" && first.pdf_download_link.trim()) ||
      (typeof first.pdfDownloadLink === "string" && first.pdfDownloadLink.trim()) ||
      (typeof first.pdf_url === "string" && first.pdf_url.trim()) ||
      null;
    if (wantPdf && !pdfDownloadLink) {
      // Some accounts only return JSON — fall through with data fields.
    }
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
      pin:
        (typeof first.pin === "string" && first.pin) ||
        (typeof first.pin === "number" ? String(first.pin) : null),
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
      pdfDownloadLink,
      raw: json,
    };
  }

  async fetchRate(input: DelhiveryRateQuoteInput): Promise<DelhiveryRateQuote> {
    const originPin = (
      input.originPin?.trim() ||
      this.config.pickupPin ||
      ""
    ).replace(/\D/g, "").slice(0, 6);
    const destinationPin = input.destinationPin.replace(/\D/g, "").slice(0, 6);
    if (originPin.length !== 6) {
      throw new Error(
        "Origin pincode missing — set DELHIVERY_PICKUP_PIN for rate lookup.",
      );
    }
    if (destinationPin.length !== 6) {
      throw new Error("Destination pincode must be a 6-digit Indian PIN.");
    }
    const weightG = Math.max(50, Math.round(input.weightG));
    const url = new URL(`${this.config.baseUrl}/api/kinko/v1/invoice/charges/.json`);
    url.searchParams.set("md", input.shippingMode === "Express" ? "E" : "S");
    url.searchParams.set("cgm", String(weightG));
    url.searchParams.set("o_pin", originPin);
    url.searchParams.set("d_pin", destinationPin);
    url.searchParams.set("ss", "Delivered");

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
        `Delhivery rate failed (${res.status}): ${text.slice(0, 240) || res.statusText}`,
      );
    }
    if (!res.ok) {
      throw new Error(
        `Delhivery rate failed (${res.status}): ${JSON.stringify(json).slice(0, 280)}`,
      );
    }
    const root = (Array.isArray(json) ? json[0] : json) as Record<string, unknown>;
    const num = (v: unknown): number | null => {
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string" && v.trim() !== "") {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };
    return {
      shippingMode: input.shippingMode,
      totalAmount: num(root?.total_amount) ?? num(root?.total_amt),
      grossAmount: num(root?.gross_amount) ?? num(root?.gross_amt),
      originPin,
      destinationPin,
      weightG,
      raw: json,
    };
  }
}
