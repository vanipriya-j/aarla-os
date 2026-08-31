import { describe, expect, it } from "vitest";
import {
  delhiveryPublicTrackingUrl,
  formatShipmentStatusLabel,
  resolveShipmentTrackingUrl,
} from "@/lib/domain/shipment-types";

describe("formatShipmentStatusLabel", () => {
  it("humanizes normalized status", () => {
    expect(formatShipmentStatusLabel("in-transit")).toBe("In transit");
    expect(formatShipmentStatusLabel("out-for-delivery")).toBe("Out for delivery");
  });

  it("appends distinct provider status", () => {
    expect(formatShipmentStatusLabel("in-transit", "In Transit")).toBe("In transit");
    expect(formatShipmentStatusLabel("in-transit", "Pending")).toBe("In transit · Pending");
  });
});

describe("resolveShipmentTrackingUrl", () => {
  it("prefers fulfilment tracking URL", () => {
    expect(
      resolveShipmentTrackingUrl("AWB1", "delhivery", "https://example.com/t/AWB1"),
    ).toBe("https://example.com/t/AWB1");
  });

  it("falls back to Delhivery public URL", () => {
    expect(resolveShipmentTrackingUrl("AWB1001DEL", "delhivery", null)).toBe(
      "https://www.delhivery.com/track/package/AWB1001DEL",
    );
    expect(delhiveryPublicTrackingUrl("  ")).toBeNull();
  });
});
