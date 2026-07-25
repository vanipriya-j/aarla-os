import type {
  Location,
  Product,
  ProductRegistration,
  PurchaseOrder,
  StockMovement,
  Vendor,
} from "@/lib/domain/types";

let seq = 0;

export function resetFixtureSeq(n = 0) {
  seq = n;
}

function nextId(prefix: string) {
  seq += 1;
  return `${prefix}-${seq}`;
}

export function buildProduct(overrides: Partial<Product> = {}): Product {
  const id = overrides.id ?? nextId("prod");
  return {
    id,
    sku: overrides.sku ?? `SKU-${id}`,
    title: overrides.title ?? `Product ${id}`,
    category: overrides.category ?? "Home",
    world: overrides.world ?? "Temple Arts",
    story: overrides.story ?? "Test story",
    variants: overrides.variants ?? [{ id: `var-${id}`, label: "Default", sku: `SKU-${id}-D` }],
    sellingPrice: overrides.sellingPrice ?? 999,
    cost: overrides.cost ?? 400,
    velocity: overrides.velocity ?? "Steady",
    status: overrides.status ?? "Active",
    ideaOrigin: overrides.ideaOrigin,
    designedDate: overrides.designedDate,
  };
}

export function buildVendor(overrides: Partial<Vendor> = {}): Vendor {
  const id = overrides.id ?? nextId("vendor");
  return {
    id,
    name: overrides.name ?? `Vendor ${id}`,
    city: overrides.city ?? "Chennai",
    category: overrides.category ?? "Bottles",
    contact: overrides.contact ?? "vendor@example.com",
    moq: overrides.moq ?? 50,
    leadTimeDays: overrides.leadTimeDays ?? 21,
    qualityRating: overrides.qualityRating ?? 4.5,
  };
}

export function buildLocation(overrides: Partial<Location> = {}): Location {
  const id = overrides.id ?? nextId("loc");
  return {
    id,
    name: overrides.name ?? `Location ${id}`,
    kind: overrides.kind ?? "Studio",
    partnerId: overrides.partnerId,
  };
}

export function buildPurchaseOrder(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  const id = overrides.id ?? nextId("PO");
  return {
    id,
    vendorId: overrides.vendorId ?? "vendor-velan",
    productId: overrides.productId ?? "prod-muruga-bottle",
    quantityOrdered: overrides.quantityOrdered ?? 100,
    quantityReceived: overrides.quantityReceived ?? 0,
    unitCost: overrides.unitCost ?? 320,
    status: overrides.status ?? "Sent",
    requiredDate: overrides.requiredDate ?? "2026-08-10",
    orderedDate: overrides.orderedDate ?? "2026-07-01",
    batchId: overrides.batchId,
  };
}

export function buildStockMovement(overrides: Partial<StockMovement> = {}): StockMovement {
  const id = overrides.id ?? nextId("mv");
  return {
    id,
    date: overrides.date ?? "2026-07-20",
    productId: overrides.productId ?? "prod-kolam-bottle",
    variantId: overrides.variantId,
    batchId: overrides.batchId,
    quantity: overrides.quantity ?? 1,
    fromLocationId: overrides.fromLocationId ?? "loc-external",
    toLocationId: overrides.toLocationId ?? "loc-studio",
    movementType: overrides.movementType ?? "Purchase Receipt",
    reference: overrides.reference ?? `REF-${id}`,
    notes: overrides.notes ?? "fixture",
  };
}

export function buildRegistration(
  overrides: Partial<ProductRegistration> = {},
): ProductRegistration {
  const id = overrides.registrationId ?? nextId("reg");
  return {
    registrationId: id,
    productId: overrides.productId ?? "prod-kolam-bottle",
    batchId: overrides.batchId ?? "batch-kb-2026-07-01",
    customerId: overrides.customerId,
    organizationId: overrides.organizationId,
    userId: overrides.userId ?? "person-test-user",
    partnerId: overrides.partnerId,
    purchaseSource: overrides.purchaseSource ?? "Website",
    registrationDate: overrides.registrationDate ?? "2026-07-22",
    registrationCode: overrides.registrationCode ?? `AARLA-${id.toUpperCase()}`,
    status: overrides.status ?? "Registered",
  };
}
