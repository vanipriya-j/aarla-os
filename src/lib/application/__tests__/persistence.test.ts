import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool } from "@/lib/infra/db/pool";
import {
  createManufacturingPO,
  getInventorySnapshots,
  healthCheck,
  listProducts,
  listPurchaseOrders,
  receiveAgainstPO,
  recordPartnerSale,
  registerProduct,
  transferToPartner,
} from "@/lib/application/services";

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
    const po = await createManufacturingPO({
      vendorId: "vendor-velan",
      productId: "prod-muruga-bottle",
      quantity: 17,
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
