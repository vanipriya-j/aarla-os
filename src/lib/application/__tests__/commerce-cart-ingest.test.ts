import { describe, expect, it, vi } from "vitest";
import {
  enqueueIdentifiedAbandonedCarts,
  ingestCommerceEvent,
} from "@/lib/application/commerce-cart-service";
import type { CommerceCartRepository } from "@/lib/repositories/commerce-cart";
import type { CustomerCallsRepository } from "@/lib/repositories/customer-calls";
import type { CartSession, CommerceEventRecord } from "@/lib/domain/commerce-cart-types";

function baseEvent(over: Partial<CommerceEventRecord> = {}): CommerceEventRecord {
  return {
    id: "evt-1",
    provider: "shopify",
    eventFingerprint: "fp-1",
    eventType: "cart_viewed",
    occurredAt: "2026-08-18T10:00:00.000Z",
    anonymousSessionId: "anon-1",
    shopifyClientId: null,
    cartToken: "cart-1",
    checkoutToken: null,
    orderExternalId: null,
    customerExternalId: null,
    email: null,
    phone: null,
    customerName: null,
    productExternalId: null,
    variantExternalId: null,
    sku: null,
    productTitle: null,
    quantity: null,
    unitPrice: null,
    currency: "INR",
    referrer: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    utmTerm: null,
    campaignId: null,
    consentState: null,
    privacyState: null,
    payload: {},
    createdAt: "2026-08-18T10:00:00.000Z",
    ...over,
  };
}

function baseSession(over: Partial<CartSession> = {}): CartSession {
  return {
    id: "sess-1",
    provider: "shopify",
    anonymousSessionId: "anon-1",
    cartToken: "cart-1",
    checkoutToken: null,
    checkoutExternalId: null,
    orderExternalId: null,
    customerExternalId: null,
    customerName: null,
    email: null,
    phone: null,
    status: "ACTIVE",
    cartValue: 0,
    currency: "INR",
    referrer: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    utmTerm: null,
    campaignId: null,
    recoveryUrl: null,
    outreachState: null,
    assignedTo: null,
    notes: null,
    firstActivityAt: "2026-08-18T10:00:00.000Z",
    lastActivityAt: "2026-08-18T10:00:00.000Z",
    abandonedAt: null,
    recoveredAt: null,
    convertedAt: null,
    recoveredOrderExternalId: null,
    recoveredRevenue: null,
    identityProvenance: null,
    consentState: null,
    createdAt: "2026-08-18T10:00:00.000Z",
    updatedAt: "2026-08-18T10:00:00.000Z",
    ...over,
  };
}

function mockRepo(overrides: Partial<CommerceCartRepository> = {}): CommerceCartRepository {
  let createdOnce = false;
  return {
    ensureSchema: vi.fn(),
    insertEventIfNew: vi.fn(async () => {
      if (!createdOnce) {
        createdOnce = true;
        return { created: true, event: baseEvent() };
      }
      return { created: false, event: baseEvent() };
    }),
    findSessionByCartToken: vi.fn(async () => null),
    findSessionByCheckoutToken: vi.fn(async () => null),
    findSessionByAnonymousSession: vi.fn(async () => null),
    findSessionById: vi.fn(async () => null),
    upsertCartSession: vi.fn(async () => baseSession()),
    replaceItems: vi.fn(async () => undefined),
    updateSessionStatus: vi.fn(async (_id, patch) => baseSession({ status: patch.status })),
    listSessions: vi.fn(async () => []),
    countByStatusBuckets: vi.fn(async () => ({
      active: 0,
      anonymousAbandoned: 0,
      identifiedAbandoned: 0,
      recovered: 0,
      converted: 0,
    })),
    listSessionsNeedingStatusRefresh: vi.fn(async () => []),
    listEnqueueCandidates: vi.fn(async () => []),
    funnelAggregatesForCampaign: vi.fn(async () => ({
      productViewed: 0,
      addedToCart: 0,
      cartViewed: 0,
      checkoutStarted: 0,
      contactSubmitted: 0,
      purchased: 0,
    })),
    demandUnitsByVariant: vi.fn(async () => []),
    getUtmCampaignMap: vi.fn(async () => new Map()),
    ...overrides,
  };
}

describe("commerce-cart-service (mocked)", () => {
  it("ingest is idempotent on fingerprint", async () => {
    const repo = mockRepo();
    const first = await ingestCommerceEvent(
      {
        eventType: "cart_viewed",
        eventFingerprint: "fp-same",
        cartToken: "cart-1",
        occurredAt: "2026-08-18T10:00:00.000Z",
        items: [{ title: "Bottle", quantity: 1, unitPrice: 100, lineValue: 100, productExternalId: null, variantExternalId: null, sku: null, variantTitle: null, imageUrl: null }],
      },
      { repo, now: new Date("2026-08-18T10:00:00.000Z") },
    );
    expect(first.created).toBe(true);
    expect(first.sessionId).toBe("sess-1");

    const second = await ingestCommerceEvent(
      {
        eventType: "cart_viewed",
        eventFingerprint: "fp-same",
        cartToken: "cart-1",
        occurredAt: "2026-08-18T10:00:00.000Z",
        items: [{ title: "Bottle", quantity: 1, unitPrice: 100, lineValue: 100, productExternalId: null, variantExternalId: null, sku: null, variantTitle: null, imageUrl: null }],
      },
      { repo, now: new Date("2026-08-18T10:00:00.000Z") },
    );
    expect(second.created).toBe(false);
    expect(repo.insertEventIfNew).toHaveBeenCalledTimes(2);
  });

  it("product_viewed does not materialize a session", async () => {
    const repo = mockRepo({
      insertEventIfNew: vi.fn(async () => ({
        created: true,
        event: baseEvent({ eventType: "product_viewed" }),
      })),
    });
    const res = await ingestCommerceEvent(
      { eventType: "product_viewed", eventFingerprint: "pv-1" },
      { repo },
    );
    expect(res.sessionId).toBeNull();
    expect(repo.upsertCartSession).not.toHaveBeenCalled();
  });

  it("enqueueIdentifiedAbandonedCarts skips anonymous (no phone)", async () => {
    const repo = mockRepo({
      listEnqueueCandidates: vi.fn(async () => [
        baseSession({ id: "anon-sess", phone: null, status: "CART_ABANDONED" }),
        baseSession({
          id: "id-sess",
          phone: "+919876543210",
          status: "IDENTIFIED",
          customerName: "Riya",
          recoveryUrl: "https://shop.example/checkouts/x",
          cartValue: 1200,
        }),
      ]),
    });

    const upsertQueueCandidate = vi.fn(async () => ({
      created: true,
      item: {
        id: "q1",
        segmentId: "seg",
        sourceKey: "cartsession:id-sess",
        externalCustomerId: "cartsession:id-sess",
        externalOrderId: null,
        customerName: "Riya",
        phone: "+919876543210",
        email: null,
        reason: "",
        lastOrderDate: null,
        deliveredAt: null,
        productsSummary: null,
        status: "pending" as const,
        assignedTo: null,
        checkoutUrl: null,
        cartSubtotal: null,
        cartCurrency: null,
        createdAt: "",
        updatedAt: "",
      },
    }));

    const callsRepo = {
      ensureQueueSchema: vi.fn(),
      ensureAbandonedCartSchema: vi.fn(),
      getSegmentByType: vi.fn(async () => ({
        id: "seg-abandoned",
        name: "Abandoned Carts",
        description: "",
        segmentType: "abandoned-cart" as const,
        script: "",
        isActive: true,
        cooldownDays: 7,
        createdAt: "",
        updatedAt: "",
      })),
      isDoNotContact: vi.fn(async () => false),
      upsertQueueCandidate,
    } as unknown as CustomerCallsRepository;

    const summary = await enqueueIdentifiedAbandonedCarts({ repo, callsRepo });
    expect(summary.skippedAnonymous).toBe(1);
    expect(summary.created).toBe(1);
    expect(upsertQueueCandidate).toHaveBeenCalledTimes(1);
    expect(upsertQueueCandidate.mock.calls[0][0].sourceKey).toBe("cartsession:id-sess");
  });
});
