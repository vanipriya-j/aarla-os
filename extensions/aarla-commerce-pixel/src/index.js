/**
 * Aarla OS — Shopify Web Pixel extension (minimal).
 *
 * Settings (configured after deploy in Shopify admin / app extension settings):
 *   - ingestUrl: https://<aarla-host>/api/integrations/shopify/commerce-events
 *   - secret:    same value as SHOPIFY_INTEGRATION_SECRET on the server
 *
 * Does NOT touch inventory. Posts demand-signal events only.
 */
import { register } from "@shopify/web-pixels-extension";

const EVENTS = [
  "product_viewed",
  "product_added_to_cart",
  "product_removed_from_cart",
  "cart_viewed",
  "checkout_started",
  "checkout_contact_info_submitted",
  "checkout_address_info_submitted",
  "checkout_shipping_info_submitted",
  "checkout_payment_info_submitted",
  "checkout_completed",
];

register(({ analytics, settings, browser, init }) => {
  const ingestUrl = String(settings?.ingestUrl || "").trim();
  const secret = String(settings?.secret || "").trim();
  if (!ingestUrl || !secret) {
    return;
  }

  const post = async (name, event) => {
    try {
      const payload = {
        name,
        eventType: name,
        id: event?.id,
        timestamp: event?.timestamp || new Date().toISOString(),
        data: event?.data || {},
        context: event?.context || init?.context || {},
        clientId: init?.data?.customer?.id || browser?.cookie?.get?.("_shopify_y"),
      };
      await fetch(ingestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    } catch {
      // Pixel must never throw into the storefront.
    }
  };

  for (const name of EVENTS) {
    analytics.subscribe(name, (event) => {
      post(name, event);
    });
  }
});
