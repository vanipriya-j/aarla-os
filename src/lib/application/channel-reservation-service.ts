import {
  canSoftReserve,
  resolveCatalogTarget,
  softAvailableStudio,
} from "@/lib/domain/channel-reservation";
import type {
  CreateChannelReservationInput,
  CreateChannelReservationResult,
} from "@/lib/domain/channel-reservation-types";
import { LOC_CODES } from "@/lib/engine/business-engine";
import { balanceAt, deriveBalances } from "@/lib/domain/ledger";
import { createPostgresUnitOfWork } from "@/lib/infra/repositories/postgres-unit-of-work";
import { createChannelReservationRepository } from "@/lib/infra/repositories/postgres-channel-reservations";
import {
  toChannelReservation,
  type ChannelReservationRepository,
} from "@/lib/repositories/channel-reservations";

const PROVIDER = "shopify" as const;

function repo(): ChannelReservationRepository {
  return createChannelReservationRepository();
}

/**
 * Soft-reserve Studio stock for Shopify without writing stock_movements.
 * Idempotent on externalReference. Fail-safe: callers should continue WhatsApp
 * regardless of ok/false (response always includes continueWhatsApp: true).
 */
export async function createShopifyReservation(
  input: CreateChannelReservationInput,
): Promise<CreateChannelReservationResult> {
  const externalReference = input.externalReference?.trim() ?? "";
  const quantity = Number(input.quantity);

  if (!externalReference) {
    return {
      ok: false,
      code: "validation_error",
      error: "externalReference is required.",
      continueWhatsApp: true,
    };
  }
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0) {
    return {
      ok: false,
      code: "validation_error",
      error: "quantity must be a positive integer.",
      continueWhatsApp: true,
    };
  }
  if (!input.sku?.trim() && !input.productId?.trim()) {
    return {
      ok: false,
      code: "validation_error",
      error: "Provide sku or productId.",
      continueWhatsApp: true,
    };
  }

  const existing = await repo().findByExternalReference(PROVIDER, externalReference);
  if (existing) {
    return {
      ok: true,
      reservation: toChannelReservation(existing, true),
      continueWhatsApp: true,
    };
  }

  const uow = createPostgresUnitOfWork();
  const [products, movements] = await Promise.all([
    uow.products.list(),
    uow.movements.list(),
  ]);

  const target = resolveCatalogTarget(products, {
    productId: input.productId,
    variantId: input.variantId,
    sku: input.sku,
  });
  if (!target) {
    return {
      ok: false,
      code: "product_not_found",
      error: "No matching product/variant in Aarla catalog.",
      continueWhatsApp: true,
    };
  }

  const balances = deriveBalances(movements);
  const studioBalance = Math.max(
    balanceAt(
      balances,
      target.productId,
      LOC_CODES.studio,
      target.variantId ?? undefined,
    ),
    0,
  );
  const alreadyReserved = await repo().sumActiveQuantity(
    target.productId,
    target.variantId,
  );
  const available = softAvailableStudio(studioBalance, alreadyReserved);

  if (!canSoftReserve(available, quantity)) {
    return {
      ok: false,
      code: "insufficient_stock",
      error: "Insufficient Studio stock for soft reservation.",
      continueWhatsApp: true,
      studioAvailable: available,
      requested: quantity,
    };
  }

  try {
    const row = await repo().insert({
      provider: PROVIDER,
      externalReference,
      productCode: target.productId,
      variantCode: target.variantId,
      sku: target.sku,
      quantity,
      studioAvailableAtRequest: available,
      contactPhone: input.contactPhone?.trim() || null,
      contactName: input.contactName?.trim() || null,
      notes: input.notes?.trim() || "",
      metadata: input.metadata ?? {},
    });
    return {
      ok: true,
      reservation: toChannelReservation(row, false),
      continueWhatsApp: true,
    };
  } catch (err) {
    // Race on unique (org, provider, external_reference) → return winner.
    const raced = await repo().findByExternalReference(PROVIDER, externalReference);
    if (raced) {
      return {
        ok: true,
        reservation: toChannelReservation(raced, true),
        continueWhatsApp: true,
      };
    }
    throw err;
  }
}
