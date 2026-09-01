import { BusinessEngine, type RegisterProductInput } from "@/lib/engine/business-engine";
import { assertDatabaseAvailable } from "@/lib/infra/db/pool";
import { createPostgresUnitOfWork } from "@/lib/infra/repositories/postgres-unit-of-work";
import { projectProductJourney } from "@/lib/domain/journey";
import type {
  AdjustmentReason,
  InventorySnapshot,
  Person,
  Product,
  ProductRegistration,
  PurchaseOrder,
  ReorderRule,
  StockMovement,
} from "@/lib/domain/types";

function engine() {
  return new BusinessEngine(createPostgresUnitOfWork());
}

function ops() {
  return createPostgresUnitOfWork().ops;
}

export async function healthCheck(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await assertDatabaseAvailable();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function listCatalog() {
  return engine().listCatalog();
}

export async function listProducts() {
  return (await engine().listCatalog()).products;
}

export async function listVendors() {
  return (await engine().listCatalog()).vendors;
}

export async function listPartners() {
  return (await engine().listCatalog()).partners;
}

export async function listLocations() {
  return (await engine().listCatalog()).locations;
}

export async function listBatches() {
  return (await engine().listCatalog()).batches;
}

export async function listInstitutions() {
  return (await engine().listCatalog()).institutions;
}

export async function getProductById(id: string): Promise<Product | null> {
  return createPostgresUnitOfWork().products.getByCode(id);
}

export async function listMovements(): Promise<StockMovement[]> {
  return engine().listMovements();
}

export async function listPurchaseOrders(): Promise<PurchaseOrder[]> {
  return engine().listPurchaseOrders();
}

export async function getInventorySnapshots(): Promise<InventorySnapshot[]> {
  return engine().getInventorySnapshots();
}

export async function partnerStock(partnerId: string) {
  return engine().partnerStock(partnerId);
}

export async function createManufacturingPO(input: {
  vendorId: string;
  productId: string;
  quantity: number;
  unitCost: number;
  requiredDate: string;
  id?: string;
}) {
  return engine().createManufacturingPO(input);
}

export async function receiveAgainstPO(input: {
  poId: string;
  accepted: number;
  damaged: number;
  missing: number;
  notes: string;
}) {
  return engine().receiveAgainstPO(input);
}

export async function transferToPartner(input: {
  productId: string;
  variantId?: string;
  partnerId: string;
  quantity: number;
  notes?: string;
  reference?: string;
}) {
  return engine().transferToPartner(input);
}

export async function recordPartnerSale(input: {
  productId: string;
  variantId?: string;
  partnerId: string;
  quantity: number;
  notes?: string;
  reference?: string;
}) {
  return engine().recordPartnerSale(input);
}

export async function recordShopifySale(input: {
  productId: string;
  variantId?: string;
  quantity: number;
  notes?: string;
  reference: string;
}) {
  return engine().recordShopifySale(input);
}

export async function transferStock(input: {
  productId: string;
  variantId?: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  notes?: string;
  reference?: string;
}) {
  return engine().transferStock(input);
}

export async function adjustStock(input: {
  productId: string;
  variantId?: string;
  locationId: string;
  systemQty: number;
  physicalQty: number;
  reason: AdjustmentReason;
  notes?: string;
}) {
  return engine().adjustStock(input);
}

export async function establishOpeningBalances(
  rows: Array<{
    productId: string;
    variantId: string;
    quantity: number;
    notes?: string;
  }>,
) {
  return engine().establishOpeningBalances(rows);
}

export async function listReorderRules(): Promise<ReorderRule[]> {
  return engine().listReorderRules();
}

export async function listPeople(): Promise<Person[]> {
  return engine().listPeople();
}

export async function listRegistrations(): Promise<ProductRegistration[]> {
  return engine().listRegistrations();
}

export async function registerProduct(input: RegisterProductInput) {
  return engine().registerProduct(input);
}

export async function getJourneyData(productId: string) {
  const [movements, registrations] = await Promise.all([
    engine().listMovements(),
    engine().listRegistrations(),
  ]);
  const productRegs = registrations.filter((r) => r.productId === productId);
  const stages = projectProductJourney(productId, movements, productRegs);
  return { movements, registrations: productRegs, stages };
}

export async function listProjects() {
  return ops().listProjects();
}

export async function listContentTasks() {
  return ops().listContentTasks();
}

export async function listChannelOrders() {
  return ops().listChannelOrders();
}

export async function updateChannelOrderStatus(code: string, courierStatus: string) {
  return ops().updateChannelOrderStatus(code, courierStatus);
}

export async function listLaunchChecklists() {
  return ops().listLaunchChecklists();
}

export async function listHomePriorities() {
  return ops().listHomePriorities();
}

export async function listHomeAttention() {
  return ops().listHomeAttention();
}

export async function getDemoMetrics() {
  return ops().getDemoMetrics();
}

export async function listAdviceSnippets() {
  return ops().listAdviceSnippets();
}

export async function listTipPrompts() {
  return ops().listTipPrompts();
}

export async function listStoryHampers() {
  return ops().listStoryHampers();
}

export async function getHomeDashboardData() {
  const e = engine();
  const o = ops();
  const [
    metrics,
    priorities,
    attention,
    channelOrders,
    contentTasks,
    projects,
    purchaseOrders,
    tips,
    products,
  ] = await Promise.all([
    o.getDemoMetrics(),
    o.listHomePriorities(),
    o.listHomeAttention(),
    o.listChannelOrders(),
    o.listContentTasks(),
    o.listProjects(),
    e.listPurchaseOrders(),
    o.listTipPrompts(),
    e.listCatalog().then((c) => c.products),
  ]);
  return {
    metrics,
    priorities,
    attention,
    channelOrders,
    contentTasks,
    projects,
    purchaseOrders,
    tipPrompts: tips,
    products,
  };
}
