import type {
  DelhiveryCreateShipmentInput,
  DelhiveryCreateShipmentResult,
  DelhiveryPackingSlipPackage,
  DelhiveryShippingConnector,
} from "./shipping-port";

/** Deterministic fixture AWB for local/e2e without hitting Delhivery. */
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

  async fetchPackingSlip(awb: string): Promise<DelhiveryPackingSlipPackage> {
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
      raw: { packages: [{ wbn: awb, name: "Fixture Consignee" }] },
    };
  }
}
