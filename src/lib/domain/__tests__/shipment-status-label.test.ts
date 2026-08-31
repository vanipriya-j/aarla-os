import { describe, expect, it } from "vitest";
import { formatShipmentStatusLabel } from "@/lib/domain/shipment-types";

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
