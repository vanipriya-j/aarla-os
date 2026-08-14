import type { QueryResultRow } from "pg";
import { ORG_ID } from "@/lib/infra/db/ids";
import { query as poolQuery } from "@/lib/infra/db/pool";
import type {
  ChannelReservationRepository,
  ChannelReservationRow,
  InsertChannelReservationInput,
} from "@/lib/repositories/channel-reservations";
import type { ChannelReservationProvider } from "@/lib/domain/channel-reservation-types";

type Q = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) => Promise<T[]>;

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

function mapRow(r: {
  id: string;
  provider: string;
  external_reference: string;
  product_code: string;
  variant_code: string | null;
  sku: string;
  quantity: number | string;
  status: string;
  studio_available_at_request: number | string | null;
  contact_phone: string | null;
  contact_name: string | null;
  notes: string;
  created_at: string | Date;
  updated_at: string | Date;
}): ChannelReservationRow {
  return {
    id: String(r.id),
    provider: r.provider as ChannelReservationProvider,
    externalReference: r.external_reference,
    productCode: r.product_code,
    variantCode: r.variant_code,
    sku: r.sku ?? "",
    quantity: Number(r.quantity),
    status: r.status as ChannelReservationRow["status"],
    studioAvailableAtRequest:
      r.studio_available_at_request == null ? null : Number(r.studio_available_at_request),
    contactPhone: r.contact_phone,
    contactName: r.contact_name,
    notes: r.notes ?? "",
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

export function createChannelReservationRepository(): ChannelReservationRepository {
  const q: Q = poolQuery;

  return {
    async findByExternalReference(provider, externalReference) {
      const rows = await q<{
        id: string;
        provider: string;
        external_reference: string;
        product_code: string;
        variant_code: string | null;
        sku: string;
        quantity: number | string;
        status: string;
        studio_available_at_request: number | string | null;
        contact_phone: string | null;
        contact_name: string | null;
        notes: string;
        created_at: string | Date;
        updated_at: string | Date;
      }>(
        `select id, provider, external_reference, product_code, variant_code, sku,
                quantity, status, studio_available_at_request, contact_phone,
                contact_name, notes, created_at, updated_at
         from channel_reservations
         where organization_id = $1
           and provider = $2
           and external_reference = $3
         limit 1`,
        [ORG_ID, provider, externalReference],
      );
      return rows[0] ? mapRow(rows[0]) : null;
    },

    async sumActiveQuantity(productCode, variantCode) {
      // Product-level target: all active holds on the product (any variant).
      // Variant-level target: that variant's holds + product-level (null variant) holds.
      const rows = await q<{ total: string | number }>(
        variantCode == null
          ? `select coalesce(sum(quantity), 0)::int as total
             from channel_reservations
             where organization_id = $1
               and status = 'active'
               and product_code = $2`
          : `select coalesce(sum(quantity), 0)::int as total
             from channel_reservations
             where organization_id = $1
               and status = 'active'
               and product_code = $2
               and (variant_code = $3 or variant_code is null)`,
        variantCode == null ? [ORG_ID, productCode] : [ORG_ID, productCode, variantCode],
      );
      return Number(rows[0]?.total ?? 0);
    },

    async insert(input: InsertChannelReservationInput) {
      const rows = await q<{
        id: string;
        provider: string;
        external_reference: string;
        product_code: string;
        variant_code: string | null;
        sku: string;
        quantity: number | string;
        status: string;
        studio_available_at_request: number | string | null;
        contact_phone: string | null;
        contact_name: string | null;
        notes: string;
        created_at: string | Date;
        updated_at: string | Date;
      }>(
        `insert into channel_reservations (
           organization_id, provider, external_reference, product_code, variant_code,
           sku, quantity, status, studio_available_at_request, contact_phone,
           contact_name, notes, metadata
         ) values (
           $1, $2, $3, $4, $5, $6, $7, 'active', $8, $9, $10, $11, $12::jsonb
         )
         returning id, provider, external_reference, product_code, variant_code, sku,
                   quantity, status, studio_available_at_request, contact_phone,
                   contact_name, notes, created_at, updated_at`,
        [
          ORG_ID,
          input.provider,
          input.externalReference,
          input.productCode,
          input.variantCode,
          input.sku,
          input.quantity,
          input.studioAvailableAtRequest,
          input.contactPhone,
          input.contactName,
          input.notes,
          JSON.stringify(input.metadata ?? {}),
        ],
      );
      if (!rows[0]) throw new Error("Failed to insert channel reservation.");
      return mapRow(rows[0]);
    },
  };
}
