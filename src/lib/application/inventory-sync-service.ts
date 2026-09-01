/**
 * Bidirectional inventory sync — Aarla Studio ↔ Shopify available.
 *
 * Policy:
 * - Sales pipeline remains Shopify (orders sync into Aarla).
 * - Manufacturing / receive / transfer ops happen in Aarla.
 * - Push: set Shopify available = Aarla Studio ATP (ops → storefront).
 * - Pull: adjust Aarla Studio to match Shopify available (sales/qty → ledger).
 * - Drift board compares both without writing.
 */
import "server-only";
import type { ShopifyConnector } from "@/lib/adapters/shopify/port";
import { createLiveShopifyConnectorFromEnv } from "@/lib/adapters/shopify/live-graphql-connector";
import { ConfigurationError } from "@/lib/infra/db/errors";
import { ORG_ID } from "@/lib/infra/db/ids";
import { query } from "@/lib/infra/db/pool";
import { ensureCoreInventoryLocations } from "@/lib/infra/db/ensure-inventory-locations";
import * as services from "@/lib/application/services";
import {
  compareInventoryDrift,
  summarizeInventoryDrift,
  type InventoryDriftRow,
} from "@/lib/domain/inventory-drift";
import { LOC } from "@/lib/domain/catalog";

export type InventorySyncSummary = {
  variantsRead: number;
  matched: number;
  drifted: number;
  aarlaHigher: number;
  shopifyHigher: number;
  pushed: number;
  pulled: number;
  skippedUnmatched: number;
  skippedNoInventoryItem: number;
  errors: string[];
  hasMore: boolean;
  nextCursor: string | null;
  pagesFetched: number;
  complete: boolean;
  rows: InventoryDriftRow[];
};

export type InventorySyncDeps = {
  connector?: ShopifyConnector;
  cursor?: string | null;
  maxPages?: number;
  /** When true, only drifted rows are returned in `rows`. */
  driftedOnly?: boolean;
  /** Load Shopify inventoryItem ids (needed for Push). */
  includeInventoryItems?: boolean;
  /**
   * Resolve Shopify primary location via `locations` (needs read_locations).
   * Compare/Pull leave this off — only Push needs it.
   */
  resolveShopifyLocation?: boolean;
};

function resolveConnector(deps: InventorySyncDeps): ShopifyConnector {
  if (deps.connector) return deps.connector;
  const live = createLiveShopifyConnectorFromEnv();
  if (!live) {
    throw new ConfigurationError(
      "Shopify credentials missing. Set SHOPIFY_STORE_DOMAIN plus SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET, or SHOPIFY_ADMIN_API_ACCESS_TOKEN.",
    );
  }
  return live;
}

async function mapShopifyVariantToAarla(
  externalVariantId: string,
  sku: string,
): Promise<{
  productCode: string;
  variantCode: string;
  title: string;
  variantLabel: string;
  sku: string;
} | null> {
  const byShopify = await query<{
    product_code: string;
    variant_code: string;
    title: string;
    variant_label: string;
    sku: string;
  }>(
    `select p.code as product_code, pv.code as variant_code, p.title, pv.label as variant_label, pv.sku
     from product_variants pv
     join products p on p.id = pv.product_id
     where pv.organization_id = $1 and pv.shopify_variant_id = $2
     limit 1`,
    [ORG_ID, externalVariantId],
  );
  if (byShopify[0]) {
    return {
      productCode: byShopify[0].product_code,
      variantCode: byShopify[0].variant_code,
      title: byShopify[0].title,
      variantLabel: byShopify[0].variant_label,
      sku: byShopify[0].sku,
    };
  }
  if (sku) {
    const bySku = await query<{
      product_code: string;
      variant_code: string;
      title: string;
      variant_label: string;
      sku: string;
    }>(
      `select p.code as product_code, pv.code as variant_code, p.title, pv.label as variant_label, pv.sku
       from product_variants pv
       join products p on p.id = pv.product_id
       where pv.organization_id = $1 and pv.sku = $2
       limit 1`,
      [ORG_ID, sku],
    );
    if (bySku[0]) {
      return {
        productCode: bySku[0].product_code,
        variantCode: bySku[0].variant_code,
        title: bySku[0].title,
        variantLabel: bySku[0].variant_label,
        sku: bySku[0].sku,
      };
    }
  }
  return null;
}

async function persistInventoryItemId(
  shopifyVariantId: string,
  inventoryItemId: string | null | undefined,
): Promise<void> {
  if (!inventoryItemId) return;
  await query(
    `update product_variants
     set shopify_inventory_item_id = $3, updated_at = now()
     where organization_id = $1 and shopify_variant_id = $2`,
    [ORG_ID, shopifyVariantId, inventoryItemId],
  ).catch(() => undefined);
}

async function resolvePushLocationId(
  connector: ShopifyConnector,
  preferredFromVariant: string | null,
): Promise<string | null> {
  if (preferredFromVariant) return preferredFromVariant;
  const stored = await query<{ primary_location_id: string | null }>(
    `select primary_location_id from shopify_inventory_settings where organization_id = $1`,
    [ORG_ID],
  ).catch(() => [] as { primary_location_id: string | null }[]);
  if (stored[0]?.primary_location_id) return stored[0].primary_location_id;
  if (typeof connector.fetchPrimaryInventoryLocationId === "function") {
    try {
      const loc = await connector.fetchPrimaryInventoryLocationId();
      if (loc) {
        await query(
          `insert into shopify_inventory_settings (organization_id, primary_location_id)
           values ($1,$2)
           on conflict (organization_id) do update set primary_location_id = excluded.primary_location_id, updated_at = now()`,
          [ORG_ID, loc],
        ).catch(() => undefined);
        return loc;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        /ACCESS_DENIED|locations|read_locations|not authorized|permission/i.test(message)
          ? `${message} — Push needs read_locations on the live store token. Reinstall the app after adding the scope, or clear a stale SHOPIFY_ADMIN_API_ACCESS_TOKEN in Vercel and redeploy.`
          : message,
      );
    }
  }
  return null;
}

async function studioQtyMap(): Promise<Map<string, number>> {
  const [products, movements, locations] = await Promise.all([
    services.listProducts(),
    services.listMovements(),
    services.listLocations(),
  ]);
  const { deriveVariantTotals } = await import("@/lib/domain/ledger");
  const map = new Map<string, number>();
  for (const product of products) {
    const cells = deriveVariantTotals(movements, product.id, product.variants, locations);
    for (const cell of cells) {
      map.set(`${product.id}:${cell.variantId}`, cell.studio);
    }
  }
  return map;
}

async function buildDriftPage(
  deps: InventorySyncDeps,
): Promise<{
  summary: InventorySyncSummary;
  connector: ShopifyConnector;
  primaryLocationId: string | null;
}> {
  const connector = resolveConnector(deps);
  if (typeof connector.fetchVariantInventoryPage !== "function") {
    throw new Error("Shopify connector does not support inventory quantities");
  }

  await ensureCoreInventoryLocations();
  // Best-effort schema for inventory item id column / settings table.
  await query(
    `alter table product_variants add column if not exists shopify_inventory_item_id text`,
  ).catch(() => undefined);
  await query(`
    create table if not exists shopify_inventory_settings (
      organization_id uuid primary key references organizations(id) on delete cascade,
      primary_location_id text,
      updated_at timestamptz not null default now()
    )`).catch(() => undefined);

  let page;
  try {
    page = await connector.fetchVariantInventoryPage({
      cursor: deps.cursor ?? null,
      maxPages: deps.maxPages ?? 1,
      pageSize: 15,
      includeInventoryItems: deps.includeInventoryItems === true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Shopify inventory fetch failed";
    throw new Error(
      /ACCESS_DENIED|read_inventory|write_inventory|not authorized|permission/i.test(message)
        ? `${message} — app config scopes are not enough: reinstall the app on the store, or remove a stale SHOPIFY_ADMIN_API_ACCESS_TOKEN from Vercel and redeploy so client credentials pick up the new grant.`
        : message,
    );
  }

  const studioByKey = await studioQtyMap();
  const draftRows: Parameters<typeof compareInventoryDrift>[0]["rows"] = [];
  let skippedUnmatched = 0;

  for (const v of page.variants) {
    const match = await mapShopifyVariantToAarla(v.externalVariantId, v.sku);
    if (!match) {
      skippedUnmatched += 1;
      continue;
    }
    let inventoryItemId = v.inventoryItemId ?? null;
    if (!inventoryItemId) {
      const cached = await query<{ shopify_inventory_item_id: string | null }>(
        `select shopify_inventory_item_id from product_variants
         where organization_id = $1 and shopify_variant_id = $2
         limit 1`,
        [ORG_ID, v.externalVariantId],
      ).catch(() => [] as { shopify_inventory_item_id: string | null }[]);
      inventoryItemId = cached[0]?.shopify_inventory_item_id ?? null;
    }
    await persistInventoryItemId(v.externalVariantId, inventoryItemId);
    const aarlaStudio = studioByKey.get(`${match.productCode}:${match.variantCode}`) ?? 0;
    draftRows.push({
      productId: match.productCode,
      variantId: match.variantCode,
      label:
        match.variantLabel && match.variantLabel !== "Default"
          ? `${match.title} / ${match.variantLabel}`
          : match.title,
      sku: match.sku || v.sku,
      shopifyVariantId: v.externalVariantId,
      inventoryItemId,
      locationId: v.locationId ?? null,
      aarlaStudio,
      shopifyAvailable: v.available,
    });
  }

  const allRows = compareInventoryDrift({ rows: draftRows });
  const stats = summarizeInventoryDrift(allRows);
  const rows = deps.driftedOnly ? allRows.filter((r) => r.status !== "match") : allRows;
  // Compare/Pull never need Shopify locations — only Push does.
  const primaryLocationId =
    deps.resolveShopifyLocation === true
      ? await resolvePushLocationId(
          connector,
          page.variants.find((v) => v.locationId)?.locationId ?? null,
        )
      : null;

  return {
    connector,
    primaryLocationId,
    summary: {
      variantsRead: page.variants.length,
      matched: stats.matched,
      drifted: stats.drifted,
      aarlaHigher: stats.aarlaHigher,
      shopifyHigher: stats.shopifyHigher,
      pushed: 0,
      pulled: 0,
      skippedUnmatched,
      skippedNoInventoryItem: 0,
      errors: [],
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
      pagesFetched: page.pagesFetched,
      complete: !page.hasMore,
      rows,
    },
  };
}

/** Compare one page of Shopify inventory vs Aarla Studio (no writes). */
export async function compareShopifyInventoryDrift(
  deps: InventorySyncDeps = {},
): Promise<InventorySyncSummary> {
  const { summary } = await buildDriftPage({ ...deps, driftedOnly: deps.driftedOnly ?? true });
  return summary;
}

/** Push Aarla Studio ATP → Shopify available for drifted (or all) variants on this page. */
export async function pushAarlaInventoryToShopify(
  deps: InventorySyncDeps & { onlyDrifted?: boolean } = {},
): Promise<InventorySyncSummary> {
  const { summary, connector, primaryLocationId } = await buildDriftPage({
    ...deps,
    driftedOnly: false,
    includeInventoryItems: true,
    resolveShopifyLocation: true,
  });
  if (typeof connector.setInventoryQuantities !== "function") {
    summary.errors.push("Shopify connector cannot set inventory quantities.");
    return summary;
  }
  if (!primaryLocationId) {
    summary.errors.push("No Shopify inventory location found for push.");
    return summary;
  }

  const targets = summary.rows.filter((r) =>
    deps.onlyDrifted === false ? true : r.status !== "match",
  );
  let skippedNoInventoryItem = 0;
  const batch: Array<{ inventoryItemId: string; locationId: string; quantity: number }> = [];

  for (const row of targets) {
    if (!row.inventoryItemId) {
      skippedNoInventoryItem += 1;
      continue;
    }
    batch.push({
      inventoryItemId: row.inventoryItemId,
      locationId: row.locationId || primaryLocationId,
      quantity: row.aarlaStudio,
    });
  }

  // Shopify accepts modest batches; send in chunks of 10.
  for (let i = 0; i < batch.length; i += 10) {
    const slice = batch.slice(i, i + 10);
    const result = await connector.setInventoryQuantities(slice);
    if (!result.ok) {
      summary.errors.push(...result.errors);
    } else {
      summary.pushed += slice.length;
    }
  }

  summary.skippedNoInventoryItem = skippedNoInventoryItem;
  summary.rows = deps.driftedOnly === false ? summary.rows : summary.rows.filter((r) => r.status !== "match");
  return summary;
}

/** Pull Shopify available → Aarla Studio via count-correction adjustments. */
export async function pullShopifyInventoryToAarla(
  deps: InventorySyncDeps & { onlyDrifted?: boolean } = {},
): Promise<InventorySyncSummary> {
  const { summary } = await buildDriftPage({ ...deps, driftedOnly: false });
  const targets = summary.rows.filter((r) =>
    deps.onlyDrifted === false ? true : r.status !== "match",
  );

  for (const row of targets) {
    if (row.aarlaStudio === row.shopifyAvailable) continue;
    try {
      const mv = await services.adjustStock({
        productId: row.productId,
        variantId: row.variantId,
        locationId: LOC.studio,
        systemQty: row.aarlaStudio,
        physicalQty: row.shopifyAvailable,
        reason: "count correction",
        notes: `Shopify inventory pull · available ${row.shopifyAvailable} (was Studio ${row.aarlaStudio})`,
      });
      if (mv) summary.pulled += 1;
    } catch (err) {
      summary.errors.push(
        `${row.label}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  summary.rows =
    deps.driftedOnly === false ? summary.rows : summary.rows.filter((r) => r.status !== "match");
  return summary;
}
