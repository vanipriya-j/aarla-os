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
  /** Package dimensions in cm (Delhivery shipment_length/width/height). */
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  quantity?: number | null;
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
  /** Official Delhivery shipping-label PDF (when requested with pdf=true). */
  pdfDownloadLink: string | null;
  raw: unknown;
};

export type DelhiveryPackingSlipOptions = {
  /** Prefer official Delhivery PDF label (S3 link). Default true for print. */
  pdf?: boolean;
  /** A4 sheet or 4R (4×6 thermal). */
  pdfSize?: "A4" | "4R";
};

export type DelhiveryRateQuoteInput = {
  /** Destination pincode */
  destinationPin: string;
  /** Origin pincode — defaults to configured pickup pin */
  originPin?: string | null;
  /** Grams */
  weightG: number;
  shippingMode: "Surface" | "Express";
};

export type DelhiveryRateQuote = {
  shippingMode: "Surface" | "Express";
  /** Approximate total incl. tax (Delhivery total_amount) */
  totalAmount: number | null;
  grossAmount: number | null;
  originPin: string;
  destinationPin: string;
  weightG: number;
  raw: unknown;
};

export interface DelhiveryShippingConnector {
  createShipment(
    input: DelhiveryCreateShipmentInput,
  ): Promise<DelhiveryCreateShipmentResult>;
  fetchPackingSlip(
    awb: string,
    options?: DelhiveryPackingSlipOptions,
  ): Promise<DelhiveryPackingSlipPackage>;
  fetchRate(input: DelhiveryRateQuoteInput): Promise<DelhiveryRateQuote>;
}

export type DelhiveryShippingConfig = {
  apiToken: string;
  baseUrl: string;
  /** Required for AWB create — registered warehouse name in Delhivery. */
  pickupName: string | null;
  pickupPin?: string;
  pickupAddress?: string;
  pickupCity?: string;
  pickupState?: string;
  pickupPhone?: string;
  defaultWeightG: number;
};

/**
 * Token alone is enough to construct a connector (rates / packing slip).
 * AWB create still requires pickupName at call time.
 */
export function readDelhiveryShippingConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): DelhiveryShippingConfig | null {
  const apiToken = env.DELHIVERY_API_TOKEN?.trim();
  if (!apiToken) return null;
  const baseUrl = (
    env.DELHIVERY_API_BASE_URL?.trim() || "https://track.delhivery.com"
  ).replace(/\/$/, "");
  const weightRaw = Number(env.DELHIVERY_DEFAULT_WEIGHT_G ?? "500");
  return {
    apiToken,
    baseUrl,
    pickupName: env.DELHIVERY_PICKUP_NAME?.trim() || null,
    pickupPin: env.DELHIVERY_PICKUP_PIN?.trim() || undefined,
    pickupAddress: env.DELHIVERY_PICKUP_ADDRESS?.trim() || undefined,
    pickupCity: env.DELHIVERY_PICKUP_CITY?.trim() || undefined,
    pickupState: env.DELHIVERY_PICKUP_STATE?.trim() || undefined,
    pickupPhone: env.DELHIVERY_PICKUP_PHONE?.trim() || undefined,
    defaultWeightG: Number.isFinite(weightRaw) && weightRaw > 0 ? weightRaw : 500,
  };
}
