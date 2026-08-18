import { NextResponse } from "next/server";
import { assertShopifyIntegrationAuth } from "@/lib/auth/integration-secret";
import { ingestCommerceEvent } from "@/lib/application/commerce-cart-service";
import {
  ConfigurationError,
  DatabaseUnavailableError,
} from "@/lib/infra/db/errors";
import type {
  CartSessionItemInput,
  IngestCommerceEventInput,
} from "@/lib/domain/commerce-cart-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function toErrorMessage(err: unknown): string {
  if (err instanceof DatabaseUnavailableError || err instanceof ConfigurationError) {
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

function asString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapItems(raw: unknown): CartSessionItemInput[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    const qty = Math.max(0, Math.floor(asNumber(r.quantity) ?? 0));
    const unit = asNumber(r.unitPrice ?? r.unit_price ?? r.price) ?? 0;
    return {
      productExternalId: asString(r.productExternalId ?? r.product_external_id ?? r.productId),
      variantExternalId: asString(r.variantExternalId ?? r.variant_external_id ?? r.variantId),
      sku: asString(r.sku),
      title: asString(r.title ?? r.productTitle) || "Item",
      variantTitle: asString(r.variantTitle ?? r.variant_title),
      quantity: qty,
      unitPrice: unit,
      lineValue: asNumber(r.lineValue ?? r.line_value) ?? unit * qty,
      imageUrl: asString(r.imageUrl ?? r.image_url),
    };
  });
}

/**
 * Normalize Shopify Web Pixel / Custom Pixel envelopes into IngestCommerceEventInput.
 */
function normalizeBody(body: Record<string, unknown>): IngestCommerceEventInput {
  const data =
    body.data && typeof body.data === "object"
      ? (body.data as Record<string, unknown>)
      : body;
  const context =
    body.context && typeof body.context === "object"
      ? (body.context as Record<string, unknown>)
      : {};
  const document =
    context.document && typeof context.document === "object"
      ? (context.document as Record<string, unknown>)
      : {};
  const utm =
    (body.utm && typeof body.utm === "object"
      ? (body.utm as Record<string, unknown>)
      : null) ??
    (data.utm && typeof data.utm === "object"
      ? (data.utm as Record<string, unknown>)
      : {}) ??
    {};

  const cart =
    data.cart && typeof data.cart === "object"
      ? (data.cart as Record<string, unknown>)
      : {};
  const checkout =
    data.checkout && typeof data.checkout === "object"
      ? (data.checkout as Record<string, unknown>)
      : {};
  const product =
    data.productVariant && typeof data.productVariant === "object"
      ? (data.productVariant as Record<string, unknown>)
      : data.product && typeof data.product === "object"
        ? (data.product as Record<string, unknown>)
        : {};
  const customer =
    data.customer && typeof data.customer === "object"
      ? (data.customer as Record<string, unknown>)
      : checkout.customer && typeof checkout.customer === "object"
        ? (checkout.customer as Record<string, unknown>)
        : {};

  const eventType =
    asString(body.eventType ?? body.name ?? body.type ?? data.eventType) ||
    "page_viewed";

  const lines =
    mapItems(data.lineItems ?? cart.lines ?? checkout.lineItems) ??
    mapItems(body.items);

  return {
    provider: "shopify",
    eventType,
    occurredAt: asString(body.timestamp ?? body.occurredAt ?? data.timestamp) ?? undefined,
    eventFingerprint:
      asString(body.eventFingerprint ?? body.id ?? body.event_id) ?? undefined,
    anonymousSessionId: asString(
      body.anonymousSessionId ?? context.sessionId ?? body.clientId,
    ),
    shopifyClientId: asString(body.shopifyClientId ?? context.clientId ?? body.clientId),
    cartToken: asString(body.cartToken ?? cart.token ?? cart.id ?? data.cartToken),
    checkoutToken: asString(
      body.checkoutToken ?? checkout.token ?? checkout.id ?? data.checkoutToken,
    ),
    orderExternalId: asString(
      body.orderExternalId ??
        (data.order && typeof data.order === "object"
          ? (data.order as Record<string, unknown>).id
          : data.order),
    ),
    customerExternalId: asString(
      body.customerExternalId ?? customer.id ?? customer.externalId,
    ),
    email: asString(body.email ?? customer.email ?? checkout.email),
    phone: asString(body.phone ?? customer.phone ?? checkout.phone),
    customerName: asString(
      body.customerName ??
        customer.displayName ??
        [customer.firstName, customer.lastName].filter(Boolean).join(" "),
    ),
    productExternalId: asString(
      body.productExternalId ??
        (product.product as Record<string, unknown>)?.id ??
        product.productId ??
        product.id,
    ),
    variantExternalId: asString(body.variantExternalId ?? product.id ?? product.variantId),
    sku: asString(body.sku ?? product.sku),
    productTitle: asString(
      body.productTitle ??
        product.title ??
        (product.product as Record<string, unknown>)?.title,
    ),
    quantity: asNumber(body.quantity ?? data.quantity),
    unitPrice: asNumber(
      body.unitPrice ??
        (product.price as Record<string, unknown>)?.amount ??
        product.price,
    ),
    currency: asString(
      body.currency ??
        (checkout.currencyCode as string) ??
        data.currency,
    ) ?? undefined,
    referrer: asString(body.referrer ?? document.referrer ?? context.referrer),
    utmSource: asString(body.utmSource ?? utm.source ?? utm.utm_source),
    utmMedium: asString(body.utmMedium ?? utm.medium ?? utm.utm_medium),
    utmCampaign: asString(body.utmCampaign ?? utm.campaign ?? utm.utm_campaign),
    utmContent: asString(body.utmContent ?? utm.content ?? utm.utm_content),
    utmTerm: asString(body.utmTerm ?? utm.term ?? utm.utm_term),
    campaignId: asString(body.campaignId),
    consentState: asString(body.consentState ?? body.consent),
    privacyState: asString(body.privacyState),
    recoveryUrl: asString(
      body.recoveryUrl ?? checkout.abandonedCheckoutUrl ?? checkout.url,
    ),
    cartValue: asNumber(
      body.cartValue ??
        (cart.cost as Record<string, unknown>)?.totalAmount ??
        checkout.totalPrice ??
        data.cartValue,
    ),
    items: lines,
    payload: body,
  };
}

/**
 * POST /api/integrations/shopify/commerce-events
 *
 * Shopify Web Pixel / Custom Pixel → Aarla OS cart funnel.
 * Auth: Authorization: Bearer <SHOPIFY_INTEGRATION_SECRET>
 *
 * Always returns JSON. Never writes stock_movements or soft reserves.
 */
export async function POST(request: Request) {
  const auth = assertShopifyIntegrationAuth(request);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Request body must be JSON." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const input = normalizeBody(body ?? {});
    const result = await ingestCommerceEvent(input);
    return NextResponse.json(
      {
        ok: true,
        eventId: result.eventId,
        sessionId: result.sessionId,
        created: result.created,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: toErrorMessage(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
