import { describe, expect, it } from "vitest";
import {
  canCancelVendorOrder,
  canReopenVendorOrderForEdit,
  EDITABLE_VENDOR_ORDER_STATUSES,
  TERMINAL_VENDOR_ORDER_STATUSES,
} from "@/lib/domain/vendor-order-lifecycle";
import type { VendorOrderStatus } from "@/lib/domain/manufacture-types";

const ALL: VendorOrderStatus[] = [
  "draft",
  "ready_to_send",
  "sent",
  "awaiting_confirmation",
  "confirmed",
  "in_production",
  "awaiting_payment",
  "awaiting_dispatch",
  "in_transit",
  "ready_to_receive",
  "partially_received",
  "received",
  "closed",
  "cancelled",
];

describe("vendor-order-lifecycle", () => {
  it("allows cancel until receive / terminal", () => {
    expect(canCancelVendorOrder("confirmed")).toBe(true);
    expect(canCancelVendorOrder("awaiting_confirmation")).toBe(true);
    expect(canCancelVendorOrder("draft")).toBe(true);
    expect(canCancelVendorOrder("partially_received")).toBe(false);
    expect(canCancelVendorOrder("received")).toBe(false);
    expect(canCancelVendorOrder("cancelled")).toBe(false);
  });

  it("allows edit & resend only after the PO left the editable draft states", () => {
    expect(canReopenVendorOrderForEdit("confirmed")).toBe(true);
    expect(canReopenVendorOrderForEdit("awaiting_confirmation")).toBe(true);
    expect(canReopenVendorOrderForEdit("in_production")).toBe(true);
    expect(canReopenVendorOrderForEdit("draft")).toBe(false);
    expect(canReopenVendorOrderForEdit("ready_to_send")).toBe(false);
    expect(canReopenVendorOrderForEdit("cancelled")).toBe(false);
    expect(canReopenVendorOrderForEdit("partially_received")).toBe(false);
  });

  it("keeps editable and terminal sets disjoint from reopen targets", () => {
    for (const status of ALL) {
      if (EDITABLE_VENDOR_ORDER_STATUSES.has(status)) {
        expect(canReopenVendorOrderForEdit(status)).toBe(false);
      }
      if (TERMINAL_VENDOR_ORDER_STATUSES.has(status)) {
        expect(canCancelVendorOrder(status)).toBe(false);
        expect(canReopenVendorOrderForEdit(status)).toBe(false);
      }
    }
  });
});
