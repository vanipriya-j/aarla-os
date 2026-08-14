import { NextResponse } from "next/server";
import { assertShopifyIntegrationAuth } from "@/lib/auth/integration-secret";
import { createShopifyReservation } from "@/lib/application/channel-reservation-service";
import {
  ConfigurationError,
  DatabaseUnavailableError,
} from "@/lib/infra/db/errors";
import type { CreateChannelReservationInput } from "@/lib/domain/channel-reservation-types";

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

/**
 * POST /api/integrations/shopify/reservations
 *
 * Soft-reserve Studio stock for a Shopify flow (e.g. WhatsApp checkout assist).
 * Auth: Authorization: Bearer <SHOPIFY_INTEGRATION_SECRET>
 *    or: x-aarla-integration-secret: <SHOPIFY_INTEGRATION_SECRET>
 *
 * Body: { externalReference, quantity, sku? | productId?, variantId?, contactPhone?, … }
 *
 * Always includes continueWhatsApp: true — callers should keep the WhatsApp path
 * even when ok is false (fail-safe). Does not write stock_movements.
 */
export async function POST(request: Request) {
  const auth = assertShopifyIntegrationAuth(request);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error, continueWhatsApp: true },
      { status: auth.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: CreateChannelReservationInput;
  try {
    body = (await request.json()) as CreateChannelReservationInput;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        code: "validation_error",
        error: "Request body must be JSON.",
        continueWhatsApp: true,
      },
      { status: 400 },
    );
  }

  try {
    const result = await createShopifyReservation(body);
    if (!result.ok) {
      const status =
        result.code === "validation_error"
          ? 400
          : result.code === "product_not_found"
            ? 404
            : result.code === "insufficient_stock"
              ? 409
              : 400;
      return NextResponse.json(result, { status });
    }
    return NextResponse.json({
      ok: true,
      data: result.reservation,
      continueWhatsApp: true,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: toErrorMessage(err), continueWhatsApp: true },
      { status: 500 },
    );
  }
}
