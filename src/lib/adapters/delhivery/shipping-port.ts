/**
 * Delhivery shipment create + packing slip (server-only).
 * Tracking stays in live-tracking-connector.ts.
 */

import "server-only";

export type DelhiveryCreateShipmentInput = {
  orderNumber: string;
  /** Consignee */
  name: string;
  phone: string;
  address: string;
  address2?: string | null;
  city: string;
  state: string;
  pin: string;
  country?: string;
  paymentMode: "Prepaid" | "COD";
  /** COD amount when paymentMode is COD */
  codAmount?: number | null;
  /** Grams */
  weightG: number;
  shippingMode: "Surface" | "Express";
  productDescription?: string;
  totalAmount?: number | null;
};

export type DelhiveryCreateShipmentResult = {
  awb: string;
  sortCode: string | null;
  remarks: string[];
  raw: unknown;
};

export type DelhiveryPackingSlipPackage = {
  awb: string;
  orderId: string | null;
  name: string | null;
  address: string | null;
  city: string | null;
  pin: string | null;
  phone: string | null;
  paymentMode: string | null;
  shippingMode: string | null;
  sortCode: string | null;
  oid: string | null;
  raw: unknown;
};

export interface DelhiveryShippingConnector {
  createShipment(
    input: DelhiveryCreateShipmentInput,
  ): Promise<DelhiveryCreateShipmentResult>;
  fetchPackingSlip(awb: string): Promise<DelhiveryPackingSlipPackage>;
}

export type DelhiveryShippingConfig = {
  apiToken: string;
  baseUrl: string;
  pickupName: string;
  pickupPin?: string;
  pickupAddress?: string;
  pickupCity?: string;
  pickupState?: string;
  pickupPhone?: string;
  defaultWeightG: number;
};

export function readDelhiveryShippingConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): DelhiveryShippingConfig | null {
  const apiToken = env.DELHIVERY_API_TOKEN?.trim();
  const pickupName = env.DELHIVERY_PICKUP_NAME?.trim();
  if (!apiToken || !pickupName) return null;
  const baseUrl = (
    env.DELHIVERY_API_BASE_URL?.trim() || "https://track.delhivery.com"
  ).replace(/\/$/, "");
  const weightRaw = Number(env.DELHIVERY_DEFAULT_WEIGHT_G ?? "500");
  return {
    apiToken,
    baseUrl,
    pickupName,
    pickupPin: env.DELHIVERY_PICKUP_PIN?.trim() || undefined,
    pickupAddress: env.DELHIVERY_PICKUP_ADDRESS?.trim() || undefined,
    pickupCity: env.DELHIVERY_PICKUP_CITY?.trim() || undefined,
    pickupState: env.DELHIVERY_PICKUP_STATE?.trim() || undefined,
    pickupPhone: env.DELHIVERY_PICKUP_PHONE?.trim() || undefined,
    defaultWeightG: Number.isFinite(weightRaw) && weightRaw > 0 ? weightRaw : 500,
  };
}
