import { describe, expect, it } from "vitest";
import {
  aggregateFunnelCounts,
  buildEventFingerprint,
  consentAllowsOutreach,
  hasCartIdentity,
  mapUtmToCampaignId,
  resolveCartStatus,
  shouldMaterializeCartSession,
  stitchIdentity,
} from "@/lib/domain/commerce-cart";
import { cartSessionQueueSourceKey } from "@/lib/domain/commerce-cart-types";

describe("commerce-cart domain", () => {
  it("buildEventFingerprint is stable and prefers client fingerprint", () => {
    const a = buildEventFingerprint({
      eventType: "cart_viewed",
      occurredAt: "2026-08-18T10:00:00.000Z",
      cartToken: "c1",
    });
    const b = buildEventFingerprint({
      eventType: "cart_viewed",
      occurredAt: "2026-08-18T10:00:00.000Z",
      cartToken: "c1",
    });
    expect(a).toBe(b);
    expect(a.length).toBe(64);

    expect(
      buildEventFingerprint({
        fingerprint: " client-fp-1 ",
        eventType: "cart_viewed",
        occurredAt: "2026-08-18T10:00:00.000Z",
      }),
    ).toBe("client-fp-1");
  });

  it("shouldMaterializeCartSession boundary", () => {
    expect(shouldMaterializeCartSession("product_viewed")).toBe(false);
    expect(shouldMaterializeCartSession("page_viewed")).toBe(false);
    expect(shouldMaterializeCartSession("product_added_to_cart")).toBe(true);
    expect(shouldMaterializeCartSession("cart_viewed")).toBe(true);
    expect(shouldMaterializeCartSession("checkout_started")).toBe(true);
    expect(shouldMaterializeCartSession("checkout_completed")).toBe(true);
  });

  it("stitchIdentity never overwrites known with empty", () => {
    const merged = stitchIdentity(
      {
        phone: "+919999999999",
        email: "a@example.com",
        customerName: "Ada",
        customerExternalId: "c1",
        identityProvenance: "checkout_contact",
        consentState: "granted",
      },
      {
        phone: "",
        email: null,
        customerName: "  ",
        customerExternalId: null,
        identityProvenance: null,
        consentState: null,
      },
    );
    expect(merged.phone).toBe("+919999999999");
    expect(merged.email).toBe("a@example.com");
    expect(merged.customerName).toBe("Ada");
    expect(merged.customerExternalId).toBe("c1");
    expect(merged.consentState).toBe("granted");
  });

  it("stitchIdentity fills blanks from incoming", () => {
    const merged = stitchIdentity(
      { phone: null, email: null, customerName: null, customerExternalId: null, identityProvenance: null, consentState: null },
      { phone: "+91111", email: "b@x.com", customerName: "Bea", customerExternalId: "c2", identityProvenance: "event", consentState: "granted" },
    );
    expect(merged.phone).toBe("+91111");
    expect(hasCartIdentity(merged)).toBe(true);
  });

  it("resolveCartStatus thresholds", () => {
    const now = new Date("2026-08-18T12:00:00.000Z");
    expect(
      resolveCartStatus({
        lastActivity: "2026-08-18T11:50:00.000Z",
        hasItems: true,
        hasIdentity: false,
        hasOrder: false,
        hasCheckoutToken: false,
        now,
      }),
    ).toBe("ACTIVE");

    expect(
      resolveCartStatus({
        lastActivity: "2026-08-18T11:00:00.000Z",
        hasItems: true,
        hasIdentity: false,
        hasOrder: false,
        hasCheckoutToken: false,
        now,
      }),
    ).toBe("CART_ABANDONED");

    expect(
      resolveCartStatus({
        lastActivity: "2026-08-18T11:00:00.000Z",
        hasItems: true,
        hasIdentity: true,
        hasOrder: false,
        hasCheckoutToken: true,
        now,
      }),
    ).toBe("CHECKOUT_ABANDONED");

    expect(
      resolveCartStatus({
        lastActivity: "2026-07-01T12:00:00.000Z",
        hasItems: true,
        hasIdentity: true,
        hasOrder: false,
        hasCheckoutToken: false,
        now,
      }),
    ).toBe("EXPIRED");

    expect(
      resolveCartStatus({
        lastActivity: "2026-08-18T11:50:00.000Z",
        hasItems: true,
        hasIdentity: false,
        hasOrder: true,
        hasCheckoutToken: true,
        now,
      }),
    ).toBe("CONVERTED");

    expect(
      resolveCartStatus({
        lastActivity: "2026-08-18T11:50:00.000Z",
        hasItems: true,
        hasIdentity: true,
        hasOrder: true,
        hasCheckoutToken: true,
        currentStatus: "OUTREACH_PENDING",
        now,
      }),
    ).toBe("RECOVERED");
  });

  it("mapUtmToCampaignId + funnel aggregations", () => {
    const map = new Map([["diwali-2026", "camp-1"]]);
    expect(mapUtmToCampaignId("diwali-2026", map)).toBe("camp-1");
    expect(mapUtmToCampaignId("missing", map)).toBeNull();

    const counts = aggregateFunnelCounts([
      "product_viewed",
      "product_viewed",
      "product_added_to_cart",
      "cart_viewed",
      "checkout_started",
      "checkout_contact_info_submitted",
      "checkout_completed",
      "page_viewed",
    ]);
    expect(counts).toEqual({
      productViewed: 2,
      addedToCart: 1,
      cartViewed: 1,
      checkoutStarted: 1,
      contactSubmitted: 1,
      purchased: 1,
    });
  });

  it("consent + queue source key helpers", () => {
    expect(consentAllowsOutreach(null)).toBe(true);
    expect(consentAllowsOutreach("granted")).toBe(true);
    expect(consentAllowsOutreach("denied")).toBe(false);
    expect(consentAllowsOutreach("opt_out")).toBe(false);
    expect(cartSessionQueueSourceKey("abc")).toBe("cartsession:abc");
  });
});
