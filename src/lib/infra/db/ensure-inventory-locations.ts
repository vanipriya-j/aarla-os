/**
 * Ensure core Aarla inventory locations exist (not Shopify locations).
 * Required before opening receipts / receive / transfer.
 */
import { LOC } from "@/lib/domain/catalog";
import { ORG_ID, stableId } from "@/lib/infra/db/ids";
import { query } from "@/lib/infra/db/pool";
import { ensureTenantBasicsViaPool } from "@/lib/infra/db/ensure-tenant";

const CORE_LOCATIONS: Array<{ code: string; name: string; kind: string }> = [
  { code: LOC.external, name: "Vendor (inbound)", kind: "External" },
  { code: LOC.studio, name: "Aarla Studio", kind: "Studio" },
  { code: LOC.shopify, name: "Shopify", kind: "Channel" },
  { code: LOC.damage, name: "Damaged Hold", kind: "Hold" },
  { code: LOC.sold, name: "Sold / In Circulation", kind: "Channel" },
];

export async function ensureCoreInventoryLocations(): Promise<void> {
  await ensureTenantBasicsViaPool();
  for (const loc of CORE_LOCATIONS) {
    await query(
      `insert into locations (id, organization_id, code, name, kind)
       values ($1, $2, $3, $4, $5)
       on conflict (organization_id, code) do nothing`,
      [stableId(loc.code), ORG_ID, loc.code, loc.name, loc.kind],
    );
  }
}
