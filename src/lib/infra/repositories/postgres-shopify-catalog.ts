/**
 * Upsert Shopify catalog products into Aarla products / product_variants.
 * Catalog metadata only — NEVER writes stock_movements.
 */
import type { ShopifyProductRecord } from "@/lib/adapters/shopify/port";
import { ORG_ID, stableId } from "@/lib/infra/db/ids";
import { query } from "@/lib/infra/db/pool";

export type CatalogUpsertResult = {
  productCode: string;
  productAction: "inserted" | "updated" | "skipped";
  variantsInserted: number;
  variantsUpdated: number;
  variantsSkipped: number;
  note?: string;
};

function productCodeFor(externalProductId: string): string {
  return `shopify-${externalProductId}`;
}

function variantCodeFor(externalVariantId: string): string {
  return `shopify-var-${externalVariantId}`;
}

function optionsFromVariant(
  selectedOptions: Array<{ name: string; value: string }>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const o of selectedOptions) {
    const name = o.name?.trim();
    const value = o.value?.trim();
    if (name && value && value.toLowerCase() !== "default title") {
      out[name] = value;
    }
  }
  return out;
}

function statusFromShopify(status: string): string {
  const s = status.toUpperCase();
  if (s === "ACTIVE") return "Active";
  if (s === "DRAFT") return "Draft";
  if (s === "ARCHIVED") return "Archived";
  return status || "Active";
}

async function ensureCatalogColumns(): Promise<void> {
  try {
    await query(`alter table products add column if not exists shopify_product_id text`);
    await query(
      `alter table products add column if not exists catalog_source text not null default 'manual'`,
    );
    await query(`alter table products add column if not exists image_url text`);
    await query(
      `alter table product_variants add column if not exists shopify_variant_id text`,
    );
  } catch {
    /* may already exist via /setup */
  }
}

/** Call once per sync run — avoid ALTER on every product upsert. */
export async function ensureShopifyCatalogSchema(): Promise<void> {
  await ensureCatalogColumns();
}

/**
 * Upsert one Shopify product + variants into the Aarla catalog.
 * Matching order: shopify_product_id → existing SKU on first variant → insert new.
 * Does not invent inventory balances or stock movements.
 */
export async function upsertShopifyCatalogProduct(
  product: ShopifyProductRecord,
  options?: { skipSchemaEnsure?: boolean },
): Promise<CatalogUpsertResult> {
  if (!options?.skipSchemaEnsure) {
    await ensureCatalogColumns();
  }

  if (!product.variants.length) {
    return {
      productCode: productCodeFor(product.externalProductId),
      productAction: "skipped",
      variantsInserted: 0,
      variantsUpdated: 0,
      variantsSkipped: 0,
      note: "No variants on Shopify product",
    };
  }

  const sellingPrice = Math.min(...product.variants.map((v) => v.price));
  const code = productCodeFor(product.externalProductId);
  const primarySku =
    product.variants.find((v) => v.sku)?.sku || `shopify-p-${product.externalProductId}`;

  const byShopify = await query<{ id: string; code: string }>(
    `select id, code from products
     where organization_id = $1 and shopify_product_id = $2
     limit 1`,
    [ORG_ID, product.externalProductId],
  );

  let productUuid: string;
  let productCode: string;
  let productAction: CatalogUpsertResult["productAction"];

  if (byShopify[0]) {
    productUuid = byShopify[0].id;
    productCode = byShopify[0].code;
    await query(
      `update products set
         title = $2,
         category = coalesce(nullif($3, ''), category),
         selling_price = $4,
         status = $5,
         catalog_source = 'shopify',
         shopify_product_id = $6,
         image_url = coalesce($7, image_url),
         updated_at = now()
       where id = $1`,
      [
        productUuid,
        product.title,
        product.productType,
        sellingPrice,
        statusFromShopify(product.status),
        product.externalProductId,
        product.imageUrl,
      ],
    );
    productAction = "updated";
  } else {
    // Prefer linking an existing catalog row when SKU already matches.
    const bySku = await query<{ id: string; code: string }>(
      `select id, code from products
       where organization_id = $1 and sku = $2
       limit 1`,
      [ORG_ID, primarySku],
    );
    if (bySku[0]) {
      productUuid = bySku[0].id;
      productCode = bySku[0].code;
      await query(
        `update products set
           title = $2,
           category = coalesce(nullif($3, ''), category),
           selling_price = $4,
           status = $5,
           catalog_source = 'shopify',
           shopify_product_id = $6,
           image_url = coalesce($7, image_url),
           updated_at = now()
         where id = $1`,
        [
          productUuid,
          product.title,
          product.productType,
          sellingPrice,
          statusFromShopify(product.status),
          product.externalProductId,
          product.imageUrl,
        ],
      );
      productAction = "updated";
    } else {
      productUuid = stableId(code);
      productCode = code;
      try {
        await query(
          `insert into products (
             id, organization_id, code, sku, title, category, world, story,
             selling_price, cost, velocity, status, catalog_source, shopify_product_id, image_url
           ) values ($1,$2,$3,$4,$5,$6,'','',$7,0,'Steady',$8,'shopify',$9,$10)`,
          [
            productUuid,
            ORG_ID,
            code,
            primarySku,
            product.title,
            product.productType || "",
            sellingPrice,
            statusFromShopify(product.status),
            product.externalProductId,
            product.imageUrl,
          ],
        );
        productAction = "inserted";
      } catch (err) {
        // SKU collision with a different product — use a unique fallback SKU.
        const fallbackSku = `shopify-p-${product.externalProductId}`;
        await query(
          `insert into products (
             id, organization_id, code, sku, title, category, world, story,
             selling_price, cost, velocity, status, catalog_source, shopify_product_id, image_url
           ) values ($1,$2,$3,$4,$5,$6,'','',$7,0,'Steady',$8,'shopify',$9,$10)
           on conflict (organization_id, code) do update set
             title = excluded.title,
             selling_price = excluded.selling_price,
             status = excluded.status,
             shopify_product_id = excluded.shopify_product_id,
             catalog_source = 'shopify',
             image_url = coalesce(excluded.image_url, products.image_url),
             updated_at = now()`,
          [
            productUuid,
            ORG_ID,
            code,
            fallbackSku,
            product.title,
            product.productType || "",
            sellingPrice,
            statusFromShopify(product.status),
            product.externalProductId,
            product.imageUrl,
          ],
        );
        productAction = "inserted";
        void err;
      }
    }
  }

  let variantsInserted = 0;
  let variantsUpdated = 0;
  let variantsSkipped = 0;

  for (const v of product.variants) {
    const vCode = variantCodeFor(v.externalVariantId);
    const label =
      v.title && v.title.toLowerCase() !== "default title"
        ? v.title
        : Object.values(optionsFromVariant(v.selectedOptions)).join(" / ") || "Default";
    const options = optionsFromVariant(v.selectedOptions);

    const existingByShopify = await query<{ id: string }>(
      `select id from product_variants
       where organization_id = $1 and shopify_variant_id = $2
       limit 1`,
      [ORG_ID, v.externalVariantId],
    );

    if (existingByShopify[0]) {
      await query(
        `update product_variants set
           label = $2,
           sku = $3,
           options = $4::jsonb,
           updated_at = now()
         where id = $1`,
        [existingByShopify[0].id, label, v.sku, JSON.stringify(options)],
      );
      variantsUpdated += 1;
      continue;
    }

    const existingBySku = await query<{ id: string; product_id: string }>(
      `select id, product_id from product_variants
       where organization_id = $1 and sku = $2
       limit 1`,
      [ORG_ID, v.sku],
    );
    if (existingBySku[0]) {
      await query(
        `update product_variants set
           label = $2,
           options = $3::jsonb,
           shopify_variant_id = $4,
           updated_at = now()
         where id = $1`,
        [existingBySku[0].id, label, JSON.stringify(options), v.externalVariantId],
      );
      variantsUpdated += 1;
      continue;
    }

    try {
      await query(
        `insert into product_variants (
           id, organization_id, product_id, code, label, sku, options, shopify_variant_id
         ) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
        [
          stableId(vCode),
          ORG_ID,
          productUuid,
          vCode,
          label,
          v.sku,
          JSON.stringify(options),
          v.externalVariantId,
        ],
      );
      variantsInserted += 1;
    } catch {
      variantsSkipped += 1;
    }
  }

  return {
    productCode,
    productAction,
    variantsInserted,
    variantsUpdated,
    variantsSkipped,
  };
}

/** Map product codes → image_url for PO thumbnails. */
export async function listProductImageUrlsByCodes(
  codes: string[],
): Promise<Map<string, { imageUrl: string | null; shopifyProductId: string | null }>> {
  await ensureCatalogColumns();
  const unique = [...new Set(codes.map((c) => c.trim()).filter(Boolean))];
  const out = new Map<string, { imageUrl: string | null; shopifyProductId: string | null }>();
  if (!unique.length) return out;

  const rows = await query<{
    code: string;
    image_url: string | null;
    shopify_product_id: string | null;
  }>(
    `select code, image_url, shopify_product_id
     from products
     where organization_id = $1
       and (
         code = any($2::text[])
         or shopify_product_id = any($2::text[])
         or ('shopify-' || shopify_product_id) = any($2::text[])
       )`,
    [ORG_ID, unique],
  ).catch(() => []);

  for (const r of rows) {
    const info = {
      imageUrl: r.image_url ? String(r.image_url) : null,
      shopifyProductId: r.shopify_product_id ? String(r.shopify_product_id) : null,
    };
    out.set(String(r.code), info);
    if (info.shopifyProductId) {
      out.set(info.shopifyProductId, info);
      out.set(`shopify-${info.shopifyProductId}`, info);
    }
  }
  return out;
}

export async function cacheProductImageUrl(
  shopifyProductId: string,
  imageUrl: string,
): Promise<void> {
  await ensureCatalogColumns();
  await query(
    `update products
     set image_url = $3, updated_at = now()
     where organization_id = $1 and shopify_product_id = $2`,
    [ORG_ID, shopifyProductId, imageUrl],
  ).catch(() => undefined);
}

