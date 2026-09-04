/**
 * Inventory sync — Aarla Studio ↔ Shopify Available (Aarla Office).
 *
 * Policy (weekend tighten):
 * - Sales pipeline remains Shopify (orders sync into Aarla).
 * - Manufacture / receive / transfer ops happen in Aarla.
 * - Receive → best-effort Push: Shopify Available = Studio ATP for linked variants.
 * - Mismatch board: Pull Available when Shopify is truth; Push Available when Studio is;
 *   Sync re-reads after an Admin fix.
 * - Stock table Sync → Pull Available for that SKU (Shopify Available → Studio).
 * - Manufacture → Shopify Incoming is deferred (API needs scheduled changes); WIP stays in Aarla.
 * - Bulk Pull remains optional advanced (sales/qty → ledger).
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
  /** Aarla-first compare: total Shopify-linked variants in catalog. */
  linkedTotal?: number;
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
       limit 2`,
      [ORG_ID, sku],
    );
    // Only use SKU when it uniquely identifies one Aarla variant — shared SKUs
    // otherwise explode the mismatch table (same Studio row × many Shopify qtys).
    if (bySku.length === 1 && bySku[0]) {
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

async function persistOfficeLocationId(locationId: string | null | undefined): Promise<void> {
  if (!locationId) return;
  await query(
    `insert into shopify_inventory_settings (organization_id, primary_location_id)
     values ($1,$2)
     on conflict (organization_id) do update set primary_location_id = excluded.primary_location_id, updated_at = now()`,
    [ORG_ID, locationId],
  ).catch(() => undefined);
}

/**
 * Best-effort Aarla Office location id for Push / preferred matching.
 * Sync/Pull can proceed without this — they pick Office from inventoryLevels by name.
 * Never hard-fail Compare/Pull on missing read_locations.
 */
async function resolveShopifyOfficeLocationId(
  connector: ShopifyConnector,
  preferredFromVariant: string | null = null,
  opts: { required?: boolean } = {},
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
      // Root `locations` needs read_locations on the live token. Sync can skip it.
      if (/ACCESS_DENIED|locations|read_locations|not authorized|permission/i.test(message)) {
        if (opts.required) {
          throw new Error(
            `${message} — Push needs read_locations on the live store token. Reinstall the app after adding the scope, or clear a stale SHOPIFY_ADMIN_API_ACCESS_TOKEN in Vercel and redeploy.`,
          );
        }
        return null;
      }
      if (opts.required) throw err instanceof Error ? err : new Error(message);
      return null;
    }
  }
  if (opts.required) {
    throw new Error(
      'No Shopify location named "Aarla Office". Check Settings → Locations in Shopify Admin.',
    );
  }
  return null;
}

/** @deprecated use resolveShopifyOfficeLocationId */
async function resolvePushLocationId(
  connector: ShopifyConnector,
  preferredFromVariant: string | null,
): Promise<string | null> {
  return resolveShopifyOfficeLocationId(connector, preferredFromVariant, {
    required: true,
  });
}

async function studioQtyMap(): Promise<Map<string, number>> {
  const [products, movements, locations] = await Promise.all([
    services.listProducts(),
    services.listMovements(),
    services.listLocations(),
  ]);
  const { deriveBalances, balanceAt } = await import("@/lib/domain/ledger");
  // Derive once — calling per-variant would re-scan the full ledger each time.
  const balances = deriveBalances(movements);
  const map = new Map<string, number>();
  for (const product of products) {
    for (const variant of product.variants) {
      map.set(
        `${product.id}:${variant.id}`,
        Math.max(0, balanceAt(balances, product.id, LOC.studio, variant.id)),
      );
    }
  }
  void locations;
  return map;
}

const LINKED_COMPARE_PAGE = 40;
let schemaReady = false;

async function ensureInventorySyncSchema(): Promise<void> {
  if (schemaReady) return;
  await ensureCoreInventoryLocations();
  await query(
    `alter table product_variants add column if not exists shopify_inventory_item_id text`,
  ).catch(() => undefined);
  await query(`
    create table if not exists shopify_inventory_settings (
      organization_id uuid primary key references organizations(id) on delete cascade,
      primary_location_id text,
      updated_at timestamptz not null default now()
    )`).catch(() => undefined);
  schemaReady = true;
}

function normalizeShopifyVariantId(id: string): string {
  const trimmed = id.trim();
  if (trimmed.includes("/")) return trimmed.split("/").pop() || trimmed;
  return trimmed;
}

/**
 * Compare only Aarla variants already linked to Shopify — does not crawl the
 * whole Shopify catalog (that path was taking hours on large stores).
 */
async function compareLinkedShopifyInventory(
  deps: InventorySyncDeps,
): Promise<InventorySyncSummary> {
  const connector = resolveConnector(deps);
  if (typeof connector.fetchVariantsInventoryByIds !== "function") {
    throw new Error("Shopify connector does not support inventory-by-id lookup");
  }

  await ensureInventorySyncSchema();

  // Optional — Sync picks Aarla Office from inventoryLevels by name when this is null.
  const officeLocationId = await resolveShopifyOfficeLocationId(connector);

  const offset = Math.max(0, Number.parseInt(String(deps.cursor ?? "0"), 10) || 0);
  const pageSize = LINKED_COMPARE_PAGE;

  const countRows = await query<{ n: string | number }>(
    `select count(*)::int as n
     from product_variants pv
     where pv.organization_id = $1
       and pv.shopify_variant_id is not null
       and trim(pv.shopify_variant_id) <> ''`,
    [ORG_ID],
  );
  const linkedTotal = Number(countRows[0]?.n ?? 0);

  const linked = await query<{
    product_code: string;
    variant_code: string;
    title: string;
    variant_label: string;
    sku: string;
    shopify_variant_id: string;
    shopify_inventory_item_id: string | null;
  }>(
    `select p.code as product_code, pv.code as variant_code, p.title,
            pv.label as variant_label, pv.sku, pv.shopify_variant_id,
            pv.shopify_inventory_item_id
     from product_variants pv
     join products p on p.id = pv.product_id
     where pv.organization_id = $1
       and pv.shopify_variant_id is not null
       and trim(pv.shopify_variant_id) <> ''
     order by p.code asc, pv.code asc
     limit $2 offset $3`,
    [ORG_ID, pageSize, offset],
  );

  const studioByKey = await studioQtyMap();
  const shopifyRows =
    linked.length > 0
      ? await connector.fetchVariantsInventoryByIds(
          linked.map((r) => r.shopify_variant_id),
          officeLocationId ? { locationId: officeLocationId } : undefined,
        )
      : [];
  const shopifyById = new Map(
    shopifyRows.map((v) => [normalizeShopifyVariantId(v.externalVariantId), v]),
  );

  const draftRows: Parameters<typeof compareInventoryDrift>[0]["rows"] = [];
  let skippedUnmatched = 0;

  for (const row of linked) {
    const sid = normalizeShopifyVariantId(row.shopify_variant_id);
    const shopify = shopifyById.get(sid);
    if (!shopify) {
      skippedUnmatched += 1;
      continue;
    }
    if (!shopify.locationId || !shopify.locationName) {
      skippedUnmatched += 1;
      continue;
    }
    const aarlaStudio = studioByKey.get(`${row.product_code}:${row.variant_code}`) ?? 0;
    draftRows.push({
      productId: row.product_code,
      variantId: row.variant_code,
      label:
        row.variant_label && row.variant_label !== "Default"
          ? `${row.title} / ${row.variant_label}`
          : row.title,
      sku: row.sku || shopify.sku,
      shopifyVariantId: shopify.externalVariantId,
      inventoryItemId: row.shopify_inventory_item_id ?? shopify.inventoryItemId ?? null,
      locationId: shopify.locationId,
      aarlaStudio,
      shopifyAvailable: shopify.available,
    });
  }

  const allRows = compareInventoryDrift({ rows: draftRows });
  const stats = summarizeInventoryDrift(allRows);
  const rows = deps.driftedOnly === false ? allRows : allRows.filter((r) => r.status !== "match");
  const nextOffset = offset + linked.length;
  const hasMore = nextOffset < linkedTotal;

  return {
    variantsRead: linked.length,
    matched: stats.matched,
    drifted: stats.drifted,
    aarlaHigher: stats.aarlaHigher,
    shopifyHigher: stats.shopifyHigher,
    pushed: 0,
    pulled: 0,
    skippedUnmatched,
    skippedNoInventoryItem: 0,
    errors: [],
    hasMore,
    nextCursor: hasMore ? String(nextOffset) : null,
    pagesFetched: 1,
    complete: !hasMore,
    rows,
    linkedTotal,
  };
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

  await ensureInventorySyncSchema();

  const officeLocationId = await resolveShopifyOfficeLocationId(connector);

  let page;
  try {
    page = await connector.fetchVariantInventoryPage({
      cursor: deps.cursor ?? null,
      maxPages: deps.maxPages ?? 2,
      pageSize: 25,
      includeInventoryItems: deps.includeInventoryItems === true,
      locationId: officeLocationId,
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

  // Batch-map Shopify → Aarla (avoid 1–2 SQL queries per variant).
  const byShopifyId = new Map<
    string,
    {
      productCode: string;
      variantCode: string;
      title: string;
      variantLabel: string;
      sku: string;
      inventoryItemId: string | null;
    }
  >();
  const shopifyIds = page.variants.map((v) => v.externalVariantId);
  if (shopifyIds.length) {
    const mapped = await query<{
      product_code: string;
      variant_code: string;
      title: string;
      variant_label: string;
      sku: string;
      shopify_variant_id: string;
      shopify_inventory_item_id: string | null;
    }>(
      `select p.code as product_code, pv.code as variant_code, p.title,
              pv.label as variant_label, pv.sku, pv.shopify_variant_id,
              pv.shopify_inventory_item_id
       from product_variants pv
       join products p on p.id = pv.product_id
       where pv.organization_id = $1 and pv.shopify_variant_id = any($2::text[])`,
      [ORG_ID, shopifyIds],
    );
    for (const m of mapped) {
      byShopifyId.set(normalizeShopifyVariantId(m.shopify_variant_id), {
        productCode: m.product_code,
        variantCode: m.variant_code,
        title: m.title,
        variantLabel: m.variant_label,
        sku: m.sku,
        inventoryItemId: m.shopify_inventory_item_id,
      });
    }
  }

  for (const v of page.variants) {
    if (!v.locationId || !v.locationName) {
      skippedUnmatched += 1;
      continue;
    }
    let match = byShopifyId.get(normalizeShopifyVariantId(v.externalVariantId));
    if (!match) {
      // Unique-SKU fallback only (shared SKUs explode the mismatch table).
      const fallback = await mapShopifyVariantToAarla(v.externalVariantId, v.sku);
      if (!fallback) {
        skippedUnmatched += 1;
        continue;
      }
      match = { ...fallback, inventoryItemId: null };
    }
    const inventoryItemId = v.inventoryItemId ?? match.inventoryItemId ?? null;
    // Persist only when Push enriched an inventory item id — skip writes on Compare.
    if (deps.includeInventoryItems && inventoryItemId) {
      await persistInventoryItemId(v.externalVariantId, inventoryItemId);
    }
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
      locationId: v.locationId,
      aarlaStudio,
      shopifyAvailable: v.available,
    });
  }

  const allRows = compareInventoryDrift({ rows: draftRows });
  const stats = summarizeInventoryDrift(allRows);
  const rows = deps.driftedOnly ? allRows.filter((r) => r.status !== "match") : allRows;
  const primaryLocationId = await resolveShopifyOfficeLocationId(
    connector,
    page.variants.find((v) => v.locationId)?.locationId ?? officeLocationId,
    { required: deps.resolveShopifyLocation === true },
  );

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

/** Compare one page of linked Aarla ↔ Shopify inventory (no writes). */
export async function compareShopifyInventoryDrift(
  deps: InventorySyncDeps = {},
): Promise<InventorySyncSummary> {
  const connector = resolveConnector(deps);
  // Prefer Aarla-first: only fetch Shopify qty for variants already linked in Aarla.
  if (typeof connector.fetchVariantsInventoryByIds === "function") {
    return compareLinkedShopifyInventory({
      ...deps,
      driftedOnly: deps.driftedOnly ?? true,
    });
  }
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
        notes: `Shopify Aarla Office pull · available ${row.shopifyAvailable} (was Studio ${row.aarlaStudio})`,
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

export type InventoryRowRefreshResult = {
  row: InventoryDriftRow | null;
  /** True when Studio and Shopify available now match (row can leave the mismatch list). */
  aligned: boolean;
  catalogUpdated: boolean;
  errors: string[];
  /** Aarla Office location name used for Available */
  locationName?: string | null;
  /** Store-wide inventoryQuantity (diagnostics only) */
  shopTotal?: number | null;
  /** Per-location Available breakdown from Shopify */
  levelSummary?: string | null;
};

export function shopifyVariantSearchQuery(input: {
  shopifyVariantId?: string | null;
  sku?: string | null;
}): string | null {
  const idRaw = input.shopifyVariantId?.trim();
  if (idRaw) {
    const numeric = idRaw.includes("/") ? idRaw.split("/").pop() : idRaw;
    if (numeric && /^\d+$/.test(numeric)) return `id:${numeric}`;
  }
  const sku = input.sku?.trim();
  if (sku) {
    // Quote SKUs that contain spaces/specials.
    const safe = /[\s:]/.test(sku) ? `"${sku.replace(/"/g, "")}"` : sku;
    return `sku:${safe}`;
  }
  return null;
}

/**
 * Re-read one Shopify variant (after a founder fix in Admin) and return the
 * updated mismatch row for that Aarla SKU — no full catalog refresh.
 */
export async function refreshShopifyInventoryRow(input: {
  shopifyVariantId?: string | null;
  sku?: string | null;
  productId?: string | null;
  variantId?: string | null;
  shopifyProductId?: string | null;
  connector?: ShopifyConnector;
}): Promise<InventoryRowRefreshResult> {
  const result: InventoryRowRefreshResult = {
    row: null,
    aligned: false,
    catalogUpdated: false,
    errors: [],
  };
  const connector = resolveConnector({ connector: input.connector });
  if (typeof connector.fetchVariantInventoryPage !== "function") {
    result.errors.push("Shopify connector does not support inventory quantities");
    return result;
  }

  const search = shopifyVariantSearchQuery(input);
  if (!search) {
    result.errors.push("Need a Shopify variant id or SKU to refresh this row.");
    return result;
  }

  await ensureCoreInventoryLocations();

  let officeLocationId: string | null = null;
  try {
    officeLocationId = await resolveShopifyOfficeLocationId(connector);
  } catch {
    officeLocationId = null;
  }

  // Best-effort: refresh catalog metadata for the parent Shopify product first.
  if (
    input.shopifyProductId &&
    typeof connector.fetchProductsPage === "function"
  ) {
    try {
      const { ensureShopifyCatalogSchema, upsertShopifyCatalogProduct } = await import(
        "@/lib/infra/repositories/postgres-shopify-catalog"
      );
      await ensureShopifyCatalogSchema();
      const numeric =
        input.shopifyProductId.includes("/")
          ? input.shopifyProductId.split("/").pop()
          : input.shopifyProductId;
      if (numeric && /^\d+$/.test(numeric)) {
        const page = await connector.fetchProductsPage({
          query: `id:${numeric}`,
          maxPages: 1,
          pageSize: 5,
        });
        for (const product of page.products) {
          await upsertShopifyCatalogProduct(product);
          result.catalogUpdated = true;
        }
      }
    } catch (err) {
      result.errors.push(
        `Catalog refresh: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  let page;
  try {
    page = await connector.fetchVariantInventoryPage({
      query: search,
      maxPages: 1,
      pageSize: 25,
      includeInventoryItems: true,
      locationId: officeLocationId,
    });
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
    return result;
  }

  if (!page.variants.length) {
    result.errors.push(`No Shopify variant found for ${search}`);
    return result;
  }

  const studioByKey = await studioQtyMap();
  const draftRows: Parameters<typeof compareInventoryDrift>[0]["rows"] = [];

  for (const v of page.variants) {
    result.shopTotal = v.shopTotal ?? result.shopTotal ?? null;
    result.levelSummary = v.levelSummary ?? result.levelSummary ?? null;
    result.locationName = v.locationName ?? result.locationName ?? null;

    if (!v.locationId || !v.locationName) {
      result.errors.push(
        `No “Aarla Office” inventory level for this SKU — not using shop total ${v.shopTotal ?? "?"}. Levels: ${v.levelSummary || "(none)"}. Rename the Studio location to “Aarla Office” in Shopify, or activate inventory there.`,
      );
      continue;
    }

    let match = await mapShopifyVariantToAarla(v.externalVariantId, v.sku);
    // Prefer the Aarla row the founder clicked when provided.
    if (input.productId && input.variantId) {
      match = {
        productCode: input.productId,
        variantCode: input.variantId,
        title: match?.title ?? input.productId,
        variantLabel: match?.variantLabel ?? input.variantId,
        sku: match?.sku || v.sku || input.sku || "",
      };
    }
    if (!match) continue;
    await persistInventoryItemId(v.externalVariantId, v.inventoryItemId);
    await persistOfficeLocationId(v.locationId);
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
      inventoryItemId: v.inventoryItemId ?? null,
      locationId: v.locationId,
      aarlaStudio,
      shopifyAvailable: v.available,
    });
  }

  if (!draftRows.length) {
    if (!result.errors.length) {
      result.errors.push("Shopify variant found but not linked to an Aarla catalog row.");
    }
    return result;
  }

  const rows = compareInventoryDrift({ rows: draftRows });
  const row = rows[0] ?? null;
  result.row = row;
  result.aligned = row?.status === "match";
  return result;
}

export type InventoryRowPullResult = {
  /** True when a Studio count-correction was written. */
  pulled: boolean;
  row: InventoryDriftRow | null;
  aligned: boolean;
  errors: string[];
  locationName?: string | null;
  shopTotal?: number | null;
  levelSummary?: string | null;
};

/**
 * Pull Shopify Available → Aarla Studio for one linked variant, then re-read.
 * Used by stock-table Sync and mismatch "Pull Available".
 */
export async function pullShopifyAvailableForRow(input: {
  shopifyVariantId?: string | null;
  sku?: string | null;
  productId?: string | null;
  variantId?: string | null;
  shopifyProductId?: string | null;
  connector?: ShopifyConnector;
}): Promise<InventoryRowPullResult> {
  const result: InventoryRowPullResult = {
    pulled: false,
    row: null,
    aligned: false,
    errors: [],
  };

  await ensureCoreInventoryLocations();

  const refreshed = await refreshShopifyInventoryRow({
    shopifyVariantId: input.shopifyVariantId,
    sku: input.sku,
    productId: input.productId,
    variantId: input.variantId,
    shopifyProductId: input.shopifyProductId,
    connector: input.connector,
  });
  result.locationName = refreshed.locationName ?? null;
  result.shopTotal = refreshed.shopTotal ?? null;
  result.levelSummary = refreshed.levelSummary ?? null;
  if (refreshed.errors.length) result.errors.push(...refreshed.errors);
  if (!refreshed.row) {
    if (!result.errors.length) {
      result.errors.push("Could not read Shopify available qty for this SKU.");
    }
    return result;
  }
  if (!refreshed.locationName) {
    result.errors.push(
      `Refusing to pull shop total ${refreshed.shopTotal ?? "?"} — Aarla Office Available not found. Levels: ${refreshed.levelSummary || "(none)"}`,
    );
    result.row = refreshed.row;
    return result;
  }

  const row = refreshed.row;
  if (row.aarlaStudio === row.shopifyAvailable) {
    result.row = row;
    result.aligned = true;
    return result;
  }

  try {
    const mv = await services.adjustStock({
      productId: row.productId,
      variantId: row.variantId,
      locationId: LOC.studio,
      systemQty: row.aarlaStudio,
      physicalQty: row.shopifyAvailable,
      reason: "count correction",
      notes: `Shopify ${refreshed.locationName} pull · available ${row.shopifyAvailable} (was Studio ${row.aarlaStudio}; shop total ${refreshed.shopTotal ?? "?"})`,
    });
    result.pulled = Boolean(mv);
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
    result.row = row;
    return result;
  }

  const after = await refreshShopifyInventoryRow({
    shopifyVariantId: row.shopifyVariantId,
    sku: row.sku,
    productId: row.productId,
    variantId: row.variantId,
    shopifyProductId: input.shopifyProductId,
    connector: input.connector,
  });
  result.locationName = after.locationName ?? result.locationName;
  result.shopTotal = after.shopTotal ?? result.shopTotal;
  result.levelSummary = after.levelSummary ?? result.levelSummary;
  if (after.errors.length) result.errors.push(...after.errors);
  result.row = after.row ?? {
    ...row,
    aarlaStudio: row.shopifyAvailable,
    delta: 0,
    status: "match",
  };
  result.aligned = result.row?.status === "match";
  return result;
}

export type PushAvailableResult = {
  /** True when at least one Shopify-linked variant was considered. */
  attempted: boolean;
  pushed: number;
  skippedUnlinked: number;
  skippedNoInventoryItem: number;
  errors: string[];
};

export type InventoryRowPushResult = {
  pushed: boolean;
  row: InventoryDriftRow | null;
  aligned: boolean;
  errors: string[];
};

async function ensureInventoryItemId(
  connector: ShopifyConnector,
  shopifyVariantId: string,
  sku: string | null | undefined,
  cached: string | null | undefined,
): Promise<string | null> {
  if (cached) return cached;
  if (typeof connector.fetchVariantInventoryPage !== "function") return null;
  const search = shopifyVariantSearchQuery({ shopifyVariantId, sku });
  if (!search) return null;
  try {
    const page = await connector.fetchVariantInventoryPage({
      query: search,
      maxPages: 1,
      pageSize: 5,
      includeInventoryItems: true,
    });
    const hit =
      page.variants.find((v) => v.externalVariantId === shopifyVariantId) ??
      page.variants[0];
    if (hit?.inventoryItemId) {
      await persistInventoryItemId(hit.externalVariantId, hit.inventoryItemId);
      return hit.inventoryItemId;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Set Shopify Available = current Aarla Studio ATP for every linked variant
 * of a product. Used after Receive (and for explicit per-product push).
 */
export async function pushStudioAvailableForProduct(input: {
  productId: string;
  connector?: ShopifyConnector;
}): Promise<PushAvailableResult> {
  const result: PushAvailableResult = {
    attempted: false,
    pushed: 0,
    skippedUnlinked: 0,
    skippedNoInventoryItem: 0,
    errors: [],
  };

  let connector: ShopifyConnector;
  try {
    connector = resolveConnector({ connector: input.connector });
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
    return result;
  }
  if (typeof connector.setInventoryQuantities !== "function") {
    result.errors.push("Shopify connector cannot set inventory quantities.");
    return result;
  }

  await ensureCoreInventoryLocations();
  await query(
    `alter table product_variants add column if not exists shopify_inventory_item_id text`,
  ).catch(() => undefined);

  const linked = await query<{
    variant_code: string;
    sku: string;
    shopify_variant_id: string;
    shopify_inventory_item_id: string | null;
  }>(
    `select pv.code as variant_code, pv.sku, pv.shopify_variant_id, pv.shopify_inventory_item_id
     from product_variants pv
     join products p on p.id = pv.product_id
     where pv.organization_id = $1 and p.code = $2
       and pv.shopify_variant_id is not null and trim(pv.shopify_variant_id) <> ''`,
    [ORG_ID, input.productId],
  );

  if (!linked.length) {
    result.skippedUnlinked = 1;
    return result;
  }

  result.attempted = true;
  const studioByKey = await studioQtyMap();
  let primaryLocationId: string | null = null;
  try {
    primaryLocationId = await resolvePushLocationId(connector, null);
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
    return result;
  }
  if (!primaryLocationId) {
    result.errors.push("No Shopify inventory location found for push.");
    return result;
  }

  const batch: Array<{ inventoryItemId: string; locationId: string; quantity: number }> =
    [];
  for (const v of linked) {
    const inventoryItemId = await ensureInventoryItemId(
      connector,
      v.shopify_variant_id,
      v.sku,
      v.shopify_inventory_item_id,
    );
    if (!inventoryItemId) {
      result.skippedNoInventoryItem += 1;
      continue;
    }
    const qty = studioByKey.get(`${input.productId}:${v.variant_code}`) ?? 0;
    batch.push({
      inventoryItemId,
      locationId: primaryLocationId,
      quantity: qty,
    });
  }

  for (let i = 0; i < batch.length; i += 10) {
    const slice = batch.slice(i, i + 10);
    const setResult = await connector.setInventoryQuantities(slice);
    if (!setResult.ok) {
      result.errors.push(...setResult.errors);
    } else {
      result.pushed += slice.length;
    }
  }

  return result;
}

/**
 * Push Studio ATP → Shopify Available for one mismatch row, then re-read.
 */
export async function pushStudioAvailableForRow(input: {
  productId: string;
  variantId: string;
  shopifyVariantId?: string | null;
  sku?: string | null;
  inventoryItemId?: string | null;
  locationId?: string | null;
  connector?: ShopifyConnector;
}): Promise<InventoryRowPushResult> {
  const result: InventoryRowPushResult = {
    pushed: false,
    row: null,
    aligned: false,
    errors: [],
  };

  let connector: ShopifyConnector;
  try {
    connector = resolveConnector({ connector: input.connector });
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
    return result;
  }
  if (typeof connector.setInventoryQuantities !== "function") {
    result.errors.push("Shopify connector cannot set inventory quantities.");
    return result;
  }

  await ensureCoreInventoryLocations();

  let shopifyVariantId = input.shopifyVariantId?.trim() || null;
  let inventoryItemId = input.inventoryItemId?.trim() || null;
  let sku = input.sku?.trim() || null;

  if (!shopifyVariantId || !inventoryItemId) {
    const rows = await query<{
      shopify_variant_id: string | null;
      shopify_inventory_item_id: string | null;
      sku: string;
    }>(
      `select pv.shopify_variant_id, pv.shopify_inventory_item_id, pv.sku
       from product_variants pv
       join products p on p.id = pv.product_id
       where pv.organization_id = $1 and p.code = $2 and pv.code = $3
       limit 1`,
      [ORG_ID, input.productId, input.variantId],
    );
    const hit = rows[0];
    if (hit) {
      shopifyVariantId = shopifyVariantId || hit.shopify_variant_id;
      inventoryItemId = inventoryItemId || hit.shopify_inventory_item_id;
      sku = sku || hit.sku;
    }
  }

  if (!shopifyVariantId) {
    result.errors.push("Variant is not linked to Shopify — cannot push Available.");
    return result;
  }

  inventoryItemId = await ensureInventoryItemId(
    connector,
    shopifyVariantId,
    sku,
    inventoryItemId,
  );
  if (!inventoryItemId) {
    result.errors.push("Missing Shopify inventory item id for this variant.");
    return result;
  }

  let locationId = input.locationId?.trim() || null;
  try {
    locationId = await resolvePushLocationId(connector, locationId);
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
    return result;
  }
  if (!locationId) {
    result.errors.push("No Shopify inventory location found for push.");
    return result;
  }

  const studioByKey = await studioQtyMap();
  const quantity = studioByKey.get(`${input.productId}:${input.variantId}`) ?? 0;

  const setResult = await connector.setInventoryQuantities([
    { inventoryItemId, locationId, quantity },
  ]);
  if (!setResult.ok) {
    result.errors.push(...setResult.errors);
    return result;
  }
  result.pushed = true;

  const refreshed = await refreshShopifyInventoryRow({
    shopifyVariantId,
    sku,
    productId: input.productId,
    variantId: input.variantId,
    connector,
  });
  result.row = refreshed.row;
  result.aligned = refreshed.aligned;
  if (refreshed.errors.length) result.errors.push(...refreshed.errors);
  return result;
}
