import { describe, expect, it } from "vitest";
import {
  resolveShopifyAbandonedCheckoutPhone,
  resolveShopifyOrderPhone,
} from "@/lib/adapters/shopify/live-graphql-connector";

describe("resolveShopifyOrderPhone", () => {
  it("prefers customer defaultPhoneNumber", () => {
    expect(
      resolveShopifyOrderPhone({
        customer: {
          defaultPhoneNumber: { phoneNumber: "+91 90000 11111" },
          phone: "+91 90000 22222",
        },
        shippingAddress: { phone: "+91 90000 33333" },
      }),
    ).toBe("+91 90000 11111");
  });

  it("falls back to shipping address when customer phone is blank", () => {
    expect(
      resolveShopifyOrderPhone({
        customer: {
          defaultPhoneNumber: { phoneNumber: null },
          phone: "  ",
          defaultAddress: { phone: null },
        },
        shippingAddress: { phone: "+91 98400 12345" },
        billingAddress: { phone: "+91 98400 99999" },
      }),
    ).toBe("+91 98400 12345");
  });

  it("returns null when no phone sources exist", () => {
    expect(
      resolveShopifyOrderPhone({
        customer: { phone: null },
        shippingAddress: { phone: null },
        billingAddress: null,
      }),
    ).toBeNull();
  });
});

describe("resolveShopifyAbandonedCheckoutPhone", () => {
  it("prefers customer defaultPhoneNumber, then customer phone, then shipping, then billing", () => {
    expect(
      resolveShopifyAbandonedCheckoutPhone({
        customer: {
          defaultPhoneNumber: { phoneNumber: "+91 90000 11111" },
          phone: "+91 90000 22222",
        },
        shippingAddress: { phone: "+91 90000 33333" },
        billingAddress: { phone: "+91 90000 44444" },
      }),
    ).toBe("+91 90000 11111");

    expect(
      resolveShopifyAbandonedCheckoutPhone({
        customer: { defaultPhoneNumber: { phoneNumber: null }, phone: "+91 90000 22222" },
        shippingAddress: { phone: "+91 90000 33333" },
      }),
    ).toBe("+91 90000 22222");

    expect(
      resolveShopifyAbandonedCheckoutPhone({
        customer: { defaultPhoneNumber: { phoneNumber: "  " }, phone: "  " },
        shippingAddress: { phone: "+91 90000 33333" },
        billingAddress: { phone: "+91 90000 44444" },
      }),
    ).toBe("+91 90000 33333");

    expect(
      resolveShopifyAbandonedCheckoutPhone({
        customer: null,
        shippingAddress: { phone: null },
        billingAddress: { phone: "+91 90000 44444" },
      }),
    ).toBe("+91 90000 44444");
  });

  it("returns null when no phone sources exist", () => {
    expect(
      resolveShopifyAbandonedCheckoutPhone({
        customer: { phone: null },
        shippingAddress: null,
        billingAddress: null,
      }),
    ).toBeNull();
  });
});
