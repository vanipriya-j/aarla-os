import { NextResponse } from "next/server";
import {
  compareShopifyInventoryDrift,
  pullShopifyInventoryToAarla,
  pushAarlaInventoryToShopify,
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
 * action: compare | push | pull | refresh
 * Chunked Shopify ↔ Aarla inventory sync, or single-row refresh.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      cursor?: string | null;
      lockToken?: string;
      action?: "compare" | "push" | "pull" | "refresh";
      driftedOnly?: boolean;
      shopifyVariantId?: string | null;
      sku?: string | null;
      productId?: string | null;
      variantId?: string | null;
      shopifyProductId?: string | null;
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
