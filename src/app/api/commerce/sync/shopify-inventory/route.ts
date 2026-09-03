import { NextResponse } from "next/server";
import {
  compareShopifyInventoryDrift,
  pullShopifyInventoryToAarla,
  pushAarlaInventoryToShopify,
  pushStudioAvailableForRow,
  refreshShopifyInventoryRow,
} from "@/lib/application/inventory-sync-service";
import { acquireOrRenewCommerceSyncLock } from "@/lib/application/commerce-sync-lock";
import {
  ConfigurationError,
  DatabaseUnavailableError,
} from "@/lib/infra/db/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function toErrorMessage(err: unknown): string {
  if (err instanceof DatabaseUnavailableError || err instanceof ConfigurationError) {
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * POST /api/commerce/sync/shopify-inventory
 * action: compare | push | pull | refresh | push-available
 * Chunked Shopify ↔ Aarla inventory sync, single-row refresh, or Push Available.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      cursor?: string | null;
      lockToken?: string;
      action?: "compare" | "push" | "pull" | "refresh" | "push-available";
      driftedOnly?: boolean;
      shopifyVariantId?: string | null;
      sku?: string | null;
      productId?: string | null;
      variantId?: string | null;
      shopifyProductId?: string | null;
      inventoryItemId?: string | null;
      locationId?: string | null;
    };
    const lockToken = body.lockToken?.trim();
    if (!lockToken) {
      return NextResponse.json(
        { ok: false, error: "Sync lock token is required." },
        { status: 400 },
      );
    }

    const lock = await acquireOrRenewCommerceSyncLock(lockToken, "shopify");
    if (!lock.ok) {
      return NextResponse.json({ ok: false, error: lock.error }, { status: 409 });
    }

    const action = body.action ?? "compare";

    if (action === "refresh") {
      const data = await refreshShopifyInventoryRow({
        shopifyVariantId: body.shopifyVariantId,
        sku: body.sku,
        productId: body.productId,
        variantId: body.variantId,
        shopifyProductId: body.shopifyProductId,
      });
      return NextResponse.json({ ok: true, data });
    }

    if (action === "push-available") {
      if (!body.productId || !body.variantId) {
        return NextResponse.json(
          { ok: false, error: "productId and variantId are required for push-available." },
          { status: 400 },
        );
      }
      const data = await pushStudioAvailableForRow({
        productId: body.productId,
        variantId: body.variantId,
        shopifyVariantId: body.shopifyVariantId,
        sku: body.sku,
        inventoryItemId: body.inventoryItemId,
        locationId: body.locationId,
      });
      return NextResponse.json({ ok: true, data });
    }

    const deps = {
      cursor: body.cursor ?? null,
      driftedOnly: body.driftedOnly ?? true,
    };

    const data =
      action === "push"
        ? await pushAarlaInventoryToShopify(deps)
        : action === "pull"
          ? await pullShopifyInventoryToAarla(deps)
          : await compareShopifyInventoryDrift(deps);

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: toErrorMessage(err) },
      { status: 500 },
    );
  }
}
