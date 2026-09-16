import type {
  DelhiveryCreateShipmentInput,
  DelhiveryCreateShipmentResult,
  DelhiveryPackingSlipOptions,
  DelhiveryPackingSlipPackage,
  DelhiveryPickupRequestInput,
  DelhiveryPickupRequestResult,
  DelhiveryRateQuote,
  DelhiveryRateQuoteInput,
  DelhiveryShippingConnector,
} from "./shipping-port";

/** Deterministic fixture AWB / rates for local/e2e without hitting Delhivery. */
export class FixtureDelhiveryShippingConnector implements DelhiveryShippingConnector {
  async createShipment(
    input: DelhiveryCreateShipmentInput,
  ): Promise<DelhiveryCreateShipmentResult> {
    const digits = input.orderNumber.replace(/\D/g, "").slice(-8) || "1001";
    const awb = `FIX${digits.padStart(8, "0")}`;
    return {
      awb,
      sortCode: "BLR/FIX",
      remarks: ["fixture create"],
      raw: { success: true, packages: [{ waybill: awb, status: "Success" }] },
    };
  }

  async fetchPackingSlip(
    awb: string,
    options?: DelhiveryPackingSlipOptions,
  ): Promise<DelhiveryPackingSlipPackage> {
    const wantPdf = options?.pdf !== false;
    return {
      awb,
      orderId: "FIXTURE-ORDER",
      name: "Fixture Consignee",
      address: "12 Fixture Street",
      city: "Bengaluru",
      pin: "560001",
      phone: "9999999999",
      paymentMode: "Prepaid",
      shippingMode: "Surface",
      sortCode: "BLR/FIX",
      oid: "FIXTURE-ORDER",
      // Fixture has no real S3 PDF — callers fall back to HTML Code128 label.
      pdfDownloadLink: wantPdf ? null : null,
      raw: { packages: [{ wbn: awb, name: "Fixture Consignee", pdf: wantPdf }] },
    };
  }

  async fetchRate(input: DelhiveryRateQuoteInput): Promise<DelhiveryRateQuote> {
    const originPin = (input.originPin?.replace(/\D/g, "") || "560001").slice(0, 6);
    const destinationPin = input.destinationPin.replace(/\D/g, "").slice(0, 6);
    const weightG = Math.max(50, Math.round(input.weightG));
    // Cheap Surface / dearer Express — enough spread to choose by rate in UI tests.
    const base = 40 + Math.floor(weightG / 100) * 8;
    const pinBump = Number(destinationPin.slice(-2) || "0") % 17;
    const total =
      input.shippingMode === "Express" ? base * 1.7 + pinBump + 25 : base + pinBump;
    const rounded = Math.round(total);
    return {
      shippingMode: input.shippingMode,
      totalAmount: rounded,
      grossAmount: Math.round(rounded / 1.18),
      originPin,
      destinationPin,
      weightG,
      raw: { fixture: true, total_amount: rounded },
    };
  }

  async schedulePickup(
    input: DelhiveryPickupRequestInput,
  ): Promise<DelhiveryPickupRequestResult> {
    return {
      pickupId: `FIX-PU-${input.pickupDate.replace(/-/g, "")}`,
      pickupDate: input.pickupDate,
      pickupTime: input.pickupTime,
      pickupLocation: input.pickupLocation?.trim() || "Fixture Warehouse",
      expectedPackageCount: input.expectedPackageCount,
      incomingCenterName: "Fixture_DC",
      raw: { fixture: true, pickup_id: `FIX-PU-${input.pickupDate.replace(/-/g, "")}` },
    };
  }
}
