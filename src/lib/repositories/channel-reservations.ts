import type {
  ChannelReservation,
  ChannelReservationProvider,
  ChannelReservationStatus,
  CreateChannelReservationInput,
} from "@/lib/domain/channel-reservation-types";

export interface ChannelReservationRow {
  id: string;
  provider: ChannelReservationProvider;
  externalReference: string;
  productCode: string;
  variantCode: string | null;
  sku: string;
  quantity: number;
  status: ChannelReservationStatus;
  studioAvailableAtRequest: number | null;
  contactPhone: string | null;
  contactName: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface InsertChannelReservationInput {
  provider: ChannelReservationProvider;
  externalReference: string;
  productCode: string;
  variantCode: string | null;
  sku: string;
  quantity: number;
  studioAvailableAtRequest: number;
  contactPhone: string | null;
  contactName: string | null;
  notes: string;
  metadata: Record<string, unknown>;
}

export interface ChannelReservationRepository {
  findByExternalReference(
    provider: ChannelReservationProvider,
    externalReference: string,
  ): Promise<ChannelReservationRow | null>;

  /** Sum of active reservation quantities for product (+ optional variant). */
  sumActiveQuantity(productCode: string, variantCode: string | null): Promise<number>;

  insert(input: InsertChannelReservationInput): Promise<ChannelReservationRow>;
}

export function toChannelReservation(
  row: ChannelReservationRow,
  idempotentReplay: boolean,
): ChannelReservation {
  return {
    id: row.id,
    provider: row.provider,
    externalReference: row.externalReference,
    productId: row.productCode,
    variantId: row.variantCode,
    sku: row.sku,
    quantity: row.quantity,
    status: row.status,
    studioAvailableAtRequest: row.studioAvailableAtRequest,
    contactPhone: row.contactPhone,
    contactName: row.contactName,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    idempotentReplay,
  };
}

export type { CreateChannelReservationInput };
