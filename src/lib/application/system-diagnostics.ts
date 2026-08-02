import { query, assertDatabaseAvailable } from "@/lib/infra/db/pool";
import { ORG_ID } from "@/lib/infra/db/ids";
import { readShopifyAuthConfigFromEnv } from "@/lib/adapters/shopify/auth";
import { resolveShopifyAccessToken } from "@/lib/adapters/shopify/auth";
import { readLiveDelhiveryConfigFromEnv } from "@/lib/adapters/delhivery/live-tracking-connector";

export type HealthReport = {
  ok: boolean;
  service: "aarla-os";
  timestamp: string;
  database: {
    ok: boolean;
    latencyMs: number | null;
    error: string | null;
  };
};

export type DiagnosticsReport = {
  ok: boolean;
  timestamp: string;
  database: HealthReport["database"] & {
    tables: Record<string, boolean>;
  };
  shopify: {
    configured: boolean;
    authMode: "client_credentials" | "static_token" | "missing";
    storeDomainSet: boolean;
    clientIdSet: boolean;
    clientSecretSet: boolean;
    staticTokenSet: boolean;
    apiVersion: string;
    probe?: {
      ok: boolean;
      error: string | null;
      latencyMs: number | null;
    };
  };
  delhivery: {
    configured: boolean;
    tokenSet: boolean;
    baseUrl: string;
    fixtureMode: boolean;
  };
  commerce: {
    externalCustomers: number;
    externalOrders: number;
    externalFulfilments: number;
    fulfilmentsWithAwb: number;
    shipments: number;
    shipmentsDelivered: number;
    shipmentsInTransit: number;
  };
  customerCalls: {
    segments: number;
    queueItems: number;
    interactions: number;
  };
};

async function checkDatabase(): Promise<HealthReport["database"]> {
  const started = Date.now();
  try {
    await assertDatabaseAvailable();
    return { ok: true, latencyMs: Date.now() - started, error: null };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function tableExists(name: string): Promise<boolean> {
  const rows = await query<{ exists: boolean }>(
    `select to_regclass($1) is not null as exists`,
    [`public.${name}`],
  );
  return Boolean(rows[0]?.exists);
}

async function countOrZero(sql: string, params: unknown[] = []): Promise<number> {
  try {
    const rows = await query<{ c: string }>(sql, params);
    return Number(rows[0]?.c ?? 0);
  } catch {
    return 0;
  }
}

export async function getHealthReport(): Promise<HealthReport> {
  const database = await checkDatabase();
  return {
    ok: database.ok,
    service: "aarla-os",
    timestamp: new Date().toISOString(),
    database,
  };
}

export type DiagnosticsOptions = {
  /** When true, exchange Shopify client credentials / hit a tiny Admin API ping */
  probeShopify?: boolean;
};

export async function getDiagnosticsReport(
  options: DiagnosticsOptions = {},
): Promise<DiagnosticsReport> {
  const databaseBase = await checkDatabase();
  const tableNames = [
    "organizations",
    "external_customers",
    "external_orders",
    "external_fulfilments",
    "shipments",
    "shipment_status_events",
    "customer_call_segments",
    "customer_call_queue_items",
  ];

  const tables: Record<string, boolean> = {};
  if (databaseBase.ok) {
    for (const name of tableNames) {
      tables[name] = await tableExists(name);
    }
  } else {
    for (const name of tableNames) tables[name] = false;
  }

  const shopifyCfg = readShopifyAuthConfigFromEnv();
  const clientIdSet = Boolean(process.env.SHOPIFY_CLIENT_ID?.trim());
  const clientSecretSet = Boolean(process.env.SHOPIFY_CLIENT_SECRET?.trim());
  const staticTokenSet = Boolean(process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN?.trim());
  const storeDomainSet = Boolean(
    process.env.SHOPIFY_STORE_DOMAIN?.trim() || process.env.SHOPIFY_SHOP?.trim(),
  );

  let authMode: DiagnosticsReport["shopify"]["authMode"] = "missing";
  if (staticTokenSet) authMode = "static_token";
  else if (clientIdSet && clientSecretSet) authMode = "client_credentials";

  const delhiveryCfg = readLiveDelhiveryConfigFromEnv();
  const fixtureMode = process.env.DELHIVERY_USE_FIXTURE === "1";

  const shopify: DiagnosticsReport["shopify"] = {
    configured: Boolean(shopifyCfg),
    authMode,
    storeDomainSet,
    clientIdSet,
    clientSecretSet,
    staticTokenSet,
    apiVersion: process.env.SHOPIFY_API_VERSION?.trim() || "2025-01",
  };

  if (options.probeShopify && shopifyCfg) {
    const started = Date.now();
    try {
      const token = await resolveShopifyAccessToken(shopifyCfg);
      // Tiny GraphQL ping — shop name only
      const domain = shopifyCfg.storeDomain;
      const res = await fetch(
        `https://${domain}/admin/api/${shopifyCfg.apiVersion}/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": token,
          },
          body: JSON.stringify({ query: "{ shop { name } }" }),
        },
      );
      if (!res.ok) {
        shopify.probe = {
          ok: false,
          error: `Shopify HTTP ${res.status}`,
          latencyMs: Date.now() - started,
        };
      } else {
        const body = (await res.json()) as {
          data?: { shop?: { name?: string } };
          errors?: Array<{ message: string }>;
        };
        if (body.errors?.length) {
          shopify.probe = {
            ok: false,
            error: body.errors[0]?.message ?? "GraphQL error",
            latencyMs: Date.now() - started,
          };
        } else {
          shopify.probe = {
            ok: true,
            error: null,
            latencyMs: Date.now() - started,
          };
        }
      }
    } catch (err) {
      shopify.probe = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - started,
      };
    }
  }

  const commerce = {
    externalCustomers: 0,
    externalOrders: 0,
    externalFulfilments: 0,
    fulfilmentsWithAwb: 0,
    shipments: 0,
    shipmentsDelivered: 0,
    shipmentsInTransit: 0,
  };
  const customerCalls = {
    segments: 0,
    queueItems: 0,
    interactions: 0,
  };

  if (databaseBase.ok) {
    commerce.externalCustomers = await countOrZero(
      `select count(*)::text as c from external_customers where organization_id = $1`,
      [ORG_ID],
    );
    commerce.externalOrders = await countOrZero(
      `select count(*)::text as c from external_orders where organization_id = $1`,
      [ORG_ID],
    );
    commerce.externalFulfilments = await countOrZero(
      `select count(*)::text as c from external_fulfilments where organization_id = $1`,
      [ORG_ID],
    );
    commerce.fulfilmentsWithAwb = await countOrZero(
      `select count(*)::text as c from external_fulfilments
       where organization_id = $1 and tracking_number is not null and tracking_number <> ''`,
      [ORG_ID],
    );
    commerce.shipments = await countOrZero(
      `select count(*)::text as c from shipments where organization_id = $1`,
      [ORG_ID],
    );
    commerce.shipmentsDelivered = await countOrZero(
      `select count(*)::text as c from shipments
       where organization_id = $1 and normalized_status = 'delivered'`,
      [ORG_ID],
    );
    commerce.shipmentsInTransit = await countOrZero(
      `select count(*)::text as c from shipments
       where organization_id = $1
         and normalized_status in ('in-transit','picked-up','manifested','out-for-delivery')`,
      [ORG_ID],
    );
    customerCalls.segments = await countOrZero(
      `select count(*)::text as c from customer_call_segments where organization_id = $1`,
      [ORG_ID],
    );
    customerCalls.queueItems = await countOrZero(
      `select count(*)::text as c from customer_call_queue_items where organization_id = $1`,
      [ORG_ID],
    );
    customerCalls.interactions = await countOrZero(
      `select count(*)::text as c from customer_interactions where organization_id = $1`,
      [ORG_ID],
    );
  }

  const ok =
    databaseBase.ok &&
    Boolean(tables.external_customers) &&
    Boolean(tables.shipments);

  return {
    ok,
    timestamp: new Date().toISOString(),
    database: { ...databaseBase, tables },
    shopify,
    delhivery: {
      configured: Boolean(delhiveryCfg) || fixtureMode,
      tokenSet: Boolean(process.env.DELHIVERY_API_TOKEN?.trim()),
      baseUrl:
        process.env.DELHIVERY_API_BASE_URL?.trim() || "https://track.delhivery.com",
      fixtureMode,
    },
    commerce,
    customerCalls,
  };
}
