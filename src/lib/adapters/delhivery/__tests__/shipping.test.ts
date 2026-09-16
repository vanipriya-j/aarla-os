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

  it("reads shipping config when token is set (pickup name optional)", () => {
    expect(
      readDelhiveryShippingConfigFromEnv({
        DELHIVERY_API_TOKEN: "tok",
      } as unknown as NodeJS.ProcessEnv),
    ).toMatchObject({ apiToken: "tok", pickupName: null });
    expect(
      readDelhiveryShippingConfigFromEnv({} as unknown as NodeJS.ProcessEnv),
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
  it("creates a deterministic AWB, packing slip, and Surface/Express rates", async () => {
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
      lengthCm: 20,
      widthCm: 15,
      heightCm: 10,
      quantity: 1,
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

    const surface = await c.fetchRate({
      destinationPin: "560001",
      originPin: "560034",
      weightG: 500,
      shippingMode: "Surface",
    });
    const express = await c.fetchRate({
      destinationPin: "560001",
      originPin: "560034",
      weightG: 500,
      shippingMode: "Express",
    });
    expect(surface.totalAmount).toBeGreaterThan(0);
    expect(express.totalAmount).toBeGreaterThan(surface.totalAmount!);
  });
});

describe("Delhivery text sanitization via create payload", () => {
  it("maps Prepaid to Pre-paid and includes dimensions", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const originalFetch = globalThis.fetch;
    const hadWindow = "window" in globalThis;
    const originalWindow = (globalThis as { window?: unknown }).window;
    // Live connector refuses browser; vitest exposes window by default.
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as { window?: unknown }).window;
    globalThis.fetch = (async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          success: true,
          packages: [{ waybill: "WB123", sort_code: "BLR/A", status: "Success" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const { LiveDelhiveryShippingConnector } = await import(
        "@/lib/adapters/delhivery/live-shipping-connector"
      );
      const c = new LiveDelhiveryShippingConnector({
        apiToken: "tok",
        baseUrl: "https://track.delhivery.com",
        pickupName: "Aarla Studio",
        pickupPin: "560034",
        defaultWeightG: 500,
      });
      await c.createShipment({
        orderNumber: "ORD#1 & Co",
        name: "Test; Name",
        phone: "+91 98765 43210",
        address: "12 Main #Road",
        city: "Bengaluru",
        state: "Karnataka",
        pin: "560001",
        paymentMode: "Prepaid",
        weightG: 750,
        lengthCm: 22,
        widthCm: 14,
        heightCm: 8,
        quantity: 2,
        shippingMode: "Express",
        totalAmount: 1990,
      });
      expect(calls).toHaveLength(1);
      const body = String(calls[0]?.init?.body ?? "");
      expect(body).toContain("format=json");
      const dataParam = decodeURIComponent(body.split("data=")[1] ?? "");
      const parsed = JSON.parse(dataParam) as {
        shipments: Array<Record<string, unknown>>;
      };
      expect(parsed.shipments[0]?.payment_mode).toBe("Pre-paid");
      expect(parsed.shipments[0]?.shipment_length).toBe(22);
      expect(parsed.shipments[0]?.shipment_width).toBe(14);
      expect(parsed.shipments[0]?.shipment_height).toBe(8);
      expect(parsed.shipments[0]?.quantity).toBe(2);
      expect(parsed.shipments[0]?.weight).toBe(750);
      expect(String(parsed.shipments[0]?.add)).not.toContain("#");
      expect(String(parsed.shipments[0]?.name)).not.toContain(";");
    } finally {
      globalThis.fetch = originalFetch;
      if (hadWindow) {
        (globalThis as { window?: unknown }).window = originalWindow;
      }
    }
  });
});
