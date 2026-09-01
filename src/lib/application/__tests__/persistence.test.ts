import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool } from "@/lib/infra/db/pool";
import {
  adjustStock,
  createManufacturingPO,
  createPartner,
  establishPartnerOpeningBalances,
  getInventorySnapshots,
  healthCheck,
  listPartners,
  listProducts,
  listPurchaseOrders,
  listReorderRules,
  receiveAgainstPO,
  recordPartnerSale,
  registerProduct,
  transferStock,
  transferToPartner,
} from "@/lib/application/services";
import { partnerStockFor } from "@/lib/domain/ledger";
import { createPostgresUnitOfWork } from "@/lib/infra/repositories/postgres-unit-of-work";

const hasDb = !!process.env.DATABASE_URL;
const runId = `${Date.now()}`;

describe.runIf(hasDb)("Postgres persistence (application services)", () => {
  beforeAll(async () => {
    const health = await healthCheck();
    expect(health.ok).toBe(true);
  });

  afterAll(async () => {
    await closePool();
  });

  it("products load from the database", async () => {
    const products = await listProducts();
    expect(products.length).toBeGreaterThan(0);
    expect(products.some((p) => p.id === "prod-kolam-bottle")).toBe(true);
  });

  it("purchase order creation persists", async () => {
    const id = `PO-PERSIST-${runId}`;
    const quantity = 1000 + (Number(runId.slice(-5)) % 8000);
    const po = await createManufacturingPO({
      vendorId: "vendor-velan",
      productId: "prod-muruga-bottle",
      quantity,
      unitCost: 320,
      requiredDate: "2026-09-15",
      id,
    });
    expect(po.id).toBe(id);
    const listed = await listPurchaseOrders();
    expect(listed.some((p) => p.id === id)).toBe(true);
  });

  it("receiving creates receipt + damage ledger movements and inventory derives", async () => {
    const id = `PO-RCV-${runId}`;
    await createManufacturingPO({
      vendorId: "vendor-velan",
      productId: "prod-muruga-bottle",
      quantity: 20,
      unitCost: 320,
      requiredDate: "2026-09-16",
      id,
    });
    const before = (await getInventorySnapshots()).find((s) => s.productId === "prod-muruga-bottle");
    const result = await receiveAgainstPO({
      poId: id,
      accepted: 14,
      damaged: 2,
      missing: 1,
      notes: "persistence test receive",
    });
    expect(result).not.toBeNull();
    expect(result!.movements.some((m) => m.movementType === "Purchase Receipt")).toBe(true);
    expect(result!.movements.some((m) => m.movementType === "Damage")).toBe(true);

    const after = (await getInventorySnapshots()).find((s) => s.productId === "prod-muruga-bottle");
    expect((after?.studioStock ?? 0) - (before?.studioStock ?? 0)).toBe(14);
    expect((after?.damaged ?? 0) - (before?.damaged ?? 0)).toBe(2);
  });

  it("partner transfer and sale persist and update derived stock", async () => {
    const productId = "prod-kolam-bottle";
    const before = (await getInventorySnapshots()).find((s) => s.productId === productId)!;
    const mv = await transferToPartner({
      productId,
      partnerId: "partner-nimalli",
      quantity: 1,
      reference: `TR-PERSIST-${runId}`,
    });
    expect(mv).not.toBeNull();
    const mid = (await getInventorySnapshots()).find((s) => s.productId === productId)!;
    expect(mid.studioStock).toBe(before.studioStock - 1);

    const sale = await recordPartnerSale({
      productId,
      partnerId: "partner-freshly",
      quantity: 1,
      reference: `PSALE-PERSIST-${runId}`,
    });
    expect(sale).not.toBeNull();
  });

  it("createPartner + legacy opening stock + sale deduct partner qty", async () => {
    const name = `Persist Café ${runId}`;
    const partner = await createPartner({
      name,
      partnerType: "Café",
      locationLabel: "Test Lane",
      contact: "persist@example.com",
      margin: 18,
    });
    expect(partner.name).toBe(name);
    expect(partner.id.startsWith("partner-")).toBe(true);

    const listed = await listPartners();
    expect(listed.some((p) => p.id === partner.id)).toBe(true);

    const productId = "prod-muruga-bottle";
    const variantId = "var-mur-750";
    const opening = await establishPartnerOpeningBalances(partner.id, [
      {
        productId,
        variantId,
        quantity: 7,
        notes: `legacy persist ${runId}`,
      },
    ]);
    expect(opening.written).toHaveLength(1);
    expect(opening.written[0]?.toLocationId).toBe(`loc-${partner.id}`);
    expect(opening.written[0]?.fromLocationId).toBe("loc-external");
    expect(opening.written[0]?.reference).toBe(`OPEN-PARTNER-${partner.id}-${variantId}`);

    const again = await establishPartnerOpeningBalances(partner.id, [
      { productId, variantId, quantity: 3 },
    ]);
    expect(again.written).toHaveLength(0);
    expect(again.skipped).toBeGreaterThan(0);

    const uow = createPostgresUnitOfWork();
    const [movements, locations] = await Promise.all([
      uow.movements.list(),
      uow.locations.list(),
    ]);
    const beforeSale = partnerStockFor(movements, partner.id, locations).find(
      (s) => s.productId === productId,
    )?.quantity;
    expect(beforeSale).toBe(7);

    const sale = await recordPartnerSale({
      productId,
      variantId,
      partnerId: partner.id,
      quantity: 2,
      reference: `PSALE-NEW-PARTNER-${runId}`,
    });
    expect(sale).not.toBeNull();

    const afterMoves = await uow.movements.list();
    const afterSale = partnerStockFor(afterMoves, partner.id, locations).find(
      (s) => s.productId === productId,
    )?.quantity;
    expect(afterSale).toBe(5);
  });

  it("variant-aware partner transfer and sale move a specific variant's stock", async () => {
    const productId = "prod-chennai-tee";
    const variantId = "var-tee-ind-m";
    const before = await getInventorySnapshots();
    const productBefore = before.find((s) => s.productId === productId)!;

    const mv = await transferToPartner({
      productId,
      variantId,
      partnerId: "partner-nimalli",
      quantity: 2,
      reference: `TR-VARIANT-PERSIST-${runId}`,
    });
    expect(mv).not.toBeNull();
    expect(mv?.variantId).toBe(variantId);

    // Product-level snapshot still sums across variants (studio drops by exactly the transfer).
    const after = await getInventorySnapshots();
    const productAfter = after.find((s) => s.productId === productId)!;
    expect(productAfter.studioStock).toBe(productBefore.studioStock - 2);

    const sale = await recordPartnerSale({
      productId,
      variantId,
      partnerId: "partner-nimalli",
      quantity: 1,
      reference: `PSALE-VARIANT-PERSIST-${runId}`,
    });
    expect(sale).not.toBeNull();
    expect(sale?.variantId).toBe(variantId);
  });

  it("transferStock moves stock between arbitrary locations and persists", async () => {
    const productId = "prod-chennai-tee";
    const variantId = "var-tee-ind-s";
    const before = await getInventorySnapshots();
    const productBefore = before.find((s) => s.productId === productId)!;

    const mv = await transferStock({
      productId,
      variantId,
      fromLocationId: "loc-studio",
      toLocationId: "loc-partner-ngs",
      quantity: 3,
      reference: `TR-GENERIC-PERSIST-${runId}`,
    });
    expect(mv).not.toBeNull();
    expect(mv?.movementType).toBe("Transfer");

    const after = await getInventorySnapshots();
    const productAfter = after.find((s) => s.productId === productId)!;
    expect(productAfter.studioStock).toBe(productBefore.studioStock - 3);
    expect(productAfter.partnerStock).toBe(productBefore.partnerStock + 3);
  });

  it("transferStock rejects a transfer that would overdraw the source location", async () => {
    const mv = await transferStock({
      productId: "prod-chennai-tee",
      variantId: "var-tee-ind-l", // seeded with only 3 units in studio
      fromLocationId: "loc-studio",
      toLocationId: "loc-partner-ngs",
      quantity: 999,
      reference: `TR-GENERIC-NEG-${runId}`,
    });
    expect(mv).toBeNull();
  });

  it("adjustStock writes a compensating Adjustment movement and updates derived stock", async () => {
    const productId = "prod-kolam-art";
    const variantId = "var-art-08";
    const before = await getInventorySnapshots();
    const productBefore = before.find((s) => s.productId === productId)!;

    const mv = await adjustStock({
      productId,
      variantId,
      locationId: "loc-studio",
      systemQty: productBefore.studioStock,
      physicalQty: productBefore.studioStock + 4,
      reason: "count correction",
      notes: `persistence test ${runId}`,
    });
    expect(mv).not.toBeNull();
    expect(mv?.movementType).toBe("Adjustment");
    expect(mv?.fromLocationId).toBe("loc-external");
    expect(mv?.toLocationId).toBe("loc-studio");

    const after = await getInventorySnapshots();
    const productAfter = after.find((s) => s.productId === productId)!;
    expect(productAfter.studioStock).toBe(productBefore.studioStock + 4);
  });

  it("adjustStock returns null for a zero delta", async () => {
    const productId = "prod-kolam-art";
    const snap = (await getInventorySnapshots()).find((s) => s.productId === productId)!;
    const mv = await adjustStock({
      productId,
      locationId: "loc-studio",
      systemQty: snap.studioStock,
      physicalQty: snap.studioStock,
      reason: "other",
    });
    expect(mv).toBeNull();
  });

  it("reorder rules seeded for the demo org load from the database", async () => {
    const rules = await listReorderRules();
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.some((r) => r.productId === "prod-chennai-tee")).toBe(true);
  });

  it("registration persists", async () => {
    const code = `AARLA-PERSIST-${runId}`;
    const email = `persist.${runId}@example.com`;
    const result = await registerProduct({
      registrationCode: code,
      productId: "prod-kolam-bottle",
      batchId: "batch-kb-2026-07-01",
      name: "Persist Tester",
      email,
      phone: "9000000001",
      city: "Chennai",
      purchaseSource: "Website",
      purchasedByYou: true,
      gifted: false,
      interests: ["Chennai"],
    });
    expect(result.registration.registrationCode).toBe(code);
    expect(result.user.email).toBe(email);
  });
});
