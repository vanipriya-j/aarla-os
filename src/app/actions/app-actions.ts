"use server";

import {
  ConfigurationError,
  DatabaseUnavailableError,
} from "@/lib/infra/db/errors";
import * as services from "@/lib/application/services";
import type { RegisterProductInput } from "@/lib/engine/business-engine";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toErrorMessage(err: unknown): string {
  if (err instanceof DatabaseUnavailableError || err instanceof ConfigurationError) {
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

async function wrap<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

export async function healthAction() {
  return services.healthCheck();
}

export async function listProductsAction() {
  return wrap(() => services.listProducts());
}

export async function listVendorsAction() {
  return wrap(() => services.listVendors());
}

export async function listPartnersAction() {
  return wrap(() => services.listPartners());
}

export async function listLocationsAction() {
  return wrap(() => services.listLocations());
}

export async function listBatchesAction() {
  return wrap(() => services.listBatches());
}

export async function listCatalogAction() {
  return wrap(() => services.listCatalog());
}

export async function listInventorySnapshotsAction() {
  return wrap(() => services.getInventorySnapshots());
}

export async function listMovementsAction() {
  return wrap(() => services.listMovements());
}

export async function listPurchaseOrdersAction() {
  return wrap(() => services.listPurchaseOrders());
}

export async function createManufacturingPOAction(input: {
  vendorId: string;
  productId: string;
  quantity: number;
  unitCost: number;
  requiredDate: string;
  id?: string;
}) {
  return wrap(() => services.createManufacturingPO(input));
}

export async function receiveAgainstPOAction(input: {
  poId: string;
  accepted: number;
  damaged: number;
  missing: number;
  notes: string;
}) {
  return wrap(() => services.receiveAgainstPO(input));
}

export async function transferToPartnerAction(input: {
  productId: string;
  partnerId: string;
  quantity: number;
  notes?: string;
  reference?: string;
}) {
  return wrap(() => services.transferToPartner(input));
}

export async function partnerSaleAction(input: {
  productId: string;
  partnerId: string;
  quantity: number;
  notes?: string;
  reference?: string;
}) {
  return wrap(() => services.recordPartnerSale(input));
}

export async function partnerStockAction(partnerId: string) {
  return wrap(() => services.partnerStock(partnerId));
}

export async function listPeopleAction() {
  return wrap(() => services.listPeople());
}

export async function listRegistrationsAction() {
  return wrap(() => services.listRegistrations());
}

export async function registerProductAction(input: RegisterProductInput) {
  return wrap(() => services.registerProduct(input));
}

export async function listProjectsAction() {
  return wrap(() => services.listProjects());
}

export async function listContentTasksAction() {
  return wrap(() => services.listContentTasks());
}

export async function listChannelOrdersAction() {
  return wrap(() => services.listChannelOrders());
}

export async function updateChannelOrderStatusAction(code: string, courierStatus: string) {
  return wrap(async () => {
    await services.updateChannelOrderStatus(code, courierStatus);
    return { code, courierStatus };
  });
}

export async function listLaunchChecklistsAction() {
  return wrap(() => services.listLaunchChecklists());
}

export async function listHomePrioritiesAction() {
  return wrap(() => services.listHomePriorities());
}

export async function listHomeAttentionAction() {
  return wrap(() => services.listHomeAttention());
}

export async function getDemoMetricsAction() {
  return wrap(() => services.getDemoMetrics());
}

export async function listAdviceAction() {
  return wrap(() => services.listAdviceSnippets());
}

export async function listTipPromptsAction() {
  return wrap(() => services.listTipPrompts());
}

export async function listStoryHampersAction() {
  return wrap(() => services.listStoryHampers());
}

export async function listInstitutionsAction() {
  return wrap(() => services.listInstitutions());
}

export async function getProductByIdAction(id: string) {
  return wrap(() => services.getProductById(id));
}

export async function getJourneyDataAction(productId: string) {
  return wrap(() => services.getJourneyData(productId));
}

export async function getHomeDashboardDataAction() {
  return wrap(() => services.getHomeDashboardData());
}

export async function getLedgerBundleAction() {
  return wrap(async () => {
    const [snapshots, movements, purchaseOrders, catalog] = await Promise.all([
      services.getInventorySnapshots(),
      services.listMovements(),
      services.listPurchaseOrders(),
      services.listCatalog(),
    ]);
    return { snapshots, movements, purchaseOrders, catalog };
  });
}

export async function getNetworkBundleAction() {
  return wrap(async () => {
    const [people, registrations] = await Promise.all([
      services.listPeople(),
      services.listRegistrations(),
    ]);
    return { people, registrations };
  });
}
