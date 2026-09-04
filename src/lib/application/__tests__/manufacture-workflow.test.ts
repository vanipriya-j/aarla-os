import { describe, expect, it } from "vitest";
import { generateVendorWorkflowHeuristic } from "@/lib/application/vendor-workflow-ai";
import {
  buildWhatsAppDeepLink,
  prepareWhatsAppMessage,
} from "@/lib/application/vendor-communication";
import type { VendorOrder } from "@/lib/domain/manufacture-types";

describe("VendorWorkflowAI heuristic", () => {
  it("extracts advance, lead time, and buffer from plain English", () => {
    const draft = generateVendorWorkflowHeuristic({
      vendorDescription:
        "I WhatsApp the quantity and design. He confirms availability and price. I transfer 50% advance. Then blanks are ordered. Printing happens. He sends photos. I pay the balance. He ships by lorry. Usually says 10 days but I want a 3-week internal buffer.",
      vendorName: "Tiruppur",
    });
    expect(draft.advancePercentage).toBe(50);
    expect(draft.vendorLeadTimeDays).toBe(10);
    expect(draft.internalBufferDays).toBe(21);
    expect(draft.steps.length).toBeGreaterThan(8);
    expect(draft.steps.some((s) => s.stepType === "ADVANCE_PAYMENT")).toBe(true);
    expect(draft.steps.some((s) => s.stepType === "RECEIVE")).toBe(true);
    expect(draft.extractedRules.inventoryUpdate).toMatch(/Receive Stock/i);
    expect(draft.source).toBe("heuristic");
  });
});

describe("VendorCommunication helpers", () => {
  it("builds wa.me deep link with encoded message", () => {
    const url = buildWhatsAppDeepLink("9876543210", "Hello Aarla");
    expect(url).toContain("https://wa.me/919876543210?text=");
    expect(url).toContain(encodeURIComponent("Hello Aarla"));
  });

  it("prepares confirmation-oriented WhatsApp copy", () => {
    const order = {
      orderNumber: "AARLA-MFG-0247",
      requestedDeliveryDate: "2026-09-10",
      vendorCommittedDate: null,
    } as VendorOrder;
    const msg = prepareWhatsAppMessage({ order, vendorName: "Rajesh Kumar" });
    expect(msg).toContain("AARLA-MFG-0247");
    expect(msg).toContain("quantities");
    expect(msg).toContain("2026-09-10");
  });
});
