import { describe, expect, it } from "vitest";
import { FixtureDelhiveryShippingConnector } from "@/lib/adapters/delhivery/fixture-shipping-connector";
import { renderDelhiveryPackingSlipHtml } from "@/lib/adapters/delhivery/packing-slip-html";
import { readDelhiveryShippingConfigFromEnv } from "@/lib/adapters/delhivery/shipping-port";
import {
  resolveDelhiveryPaymentMode,
  resolveDelhiveryShippingMode,
} from "@/lib/application/delhivery-shipping-service";

describe("Delhivery shipping helpers", () => {
  it("maps PAID to Prepaid and other statuses to COD", () => {
    expect(resolveDelhiveryPaymentMode("PAID")).toEqual({
      paymentMode: "Prepaid",
      codAmount: null,
    });
    expect(resolveDelhiveryPaymentMode("PENDING").paymentMode).toBe("COD");
    expect(resolveDelhiveryPaymentMode(null).paymentMode).toBe("COD");
  });

  it("maps fulfilment shipping method to Delhivery mode", () => {
    expect(resolveDelhiveryShippingMode("delhivery-express")).toBe("Express");
    expect(resolveDelhiveryShippingMode("delhivery-surface")).toBe("Surface");
    expect(resolveDelhiveryShippingMode(null)).toBe("Surface");
  });

  it("reads shipping config only when token + pickup name are set", () => {
    expect(
      readDelhiveryShippingConfigFromEnv({
        DELHIVERY_API_TOKEN: "tok",
      } as unknown as NodeJS.ProcessEnv),
    ).toBeNull();
    const cfg = readDelhiveryShippingConfigFromEnv({
      DELHIVERY_API_TOKEN: "tok",
      DELHIVERY_PICKUP_NAME: "Aarla Studio",
      DELHIVERY_DEFAULT_WEIGHT_G: "750",
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg?.pickupName).toBe("Aarla Studio");
    expect(cfg?.defaultWeightG).toBe(750);
  });
});

describe("FixtureDelhiveryShippingConnector", () => {
  it("creates a deterministic AWB and packing slip", async () => {
    const c = new FixtureDelhiveryShippingConnector();
    const created = await c.createShipment({
      orderNumber: "#1531",
      name: "Test",
      phone: "9876543210",
      address: "1 Main",
      city: "Bengaluru",
      state: "Karnataka",
      pin: "560001",
      paymentMode: "Prepaid",
      weightG: 500,
      shippingMode: "Surface",
    });
    expect(created.awb).toBe("FIX00001531");
    const slip = await c.fetchPackingSlip(created.awb);
    expect(slip.awb).toBe(created.awb);
    const html = renderDelhiveryPackingSlipHtml({
      slip,
      orderNumber: "#1531",
    });
    expect(html).toContain(created.awb);
    expect(html).toContain("#1531");
  });
});
