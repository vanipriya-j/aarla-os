import {
  DEFAULT_INVENTORY_LOC,
  balanceAt,
  buildAdjustmentMovement,
  buildTransferMovement,
  deriveBalances,
  deriveInventorySnapshots,
  partnerStockFor,
  type AppendMovementInput,
} from "@/lib/domain/ledger";
import type {
  AdjustmentReason,
  InventorySnapshot,
  Location,
  ManufacturingBatch,
  Partner,
  Person,
  PersonRole,
  Product,
  ProductRegistration,
  PurchaseOrder,
  ReorderRule,
  StockMovement,
  Vendor,
} from "@/lib/domain/types";
import type { Interest, PurchaseSource } from "@/lib/domain/types";
import type { InstitutionRecord, UnitOfWork } from "@/lib/repositories/types";
import { withTransaction } from "@/lib/infra/db/pool";
import { createPostgresUnitOfWork } from "@/lib/infra/repositories/postgres-unit-of-work";

export const LOC_CODES = {
  external: "loc-external",
  studio: "loc-studio",
  shopify: "loc-shopify",
  damage: "loc-damage",
  sold: "loc-sold",
} as const;

export interface RegisterProductInput {
  registrationCode: string;
  productId: string;
  batchId: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  purchaseSource: PurchaseSource;
  partnerId?: string;
  purchasedByYou: boolean;
  gifted: boolean;
  interests: Interest[];
  customerName?: string;
}

function movementFingerprint(
  m: Pick<
    StockMovement,
    "movementType" | "reference" | "productId" | "fromLocationId" | "toLocationId" | "quantity"
  >,
) {
  return `${m.movementType}|${m.reference}|${m.productId}|${m.fromLocationId}|${m.toLocationId}|${m.quantity}`;
}

function newMovementId(prefix = "mv"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Only mutator of business state. Repositories persist; this layer owns rules.
 */
export class BusinessEngine {
  constructor(private readonly uow: UnitOfWork) {}

  async listCatalog(): Promise<{
    products: Product[];
    vendors: Vendor[];
    locations: Location[];
    partners: Partner[];
    batches: ManufacturingBatch[];
    institutions: InstitutionRecord[];
  }> {
    const [products, vendors, locations, partners, batches, institutions] = await Promise.all([
      this.uow.products.list(),
      this.uow.vendors.list(),
      this.uow.locations.list(),
      this.uow.partners.list(),
      this.uow.batches.list(),
      this.uow.ops.listInstitutions(),
    ]);
    return { products, vendors, locations, partners, batches, institutions };
  }

  listMovements() {
    return this.uow.movements.list();
  }

  listPurchaseOrders() {
    return this.uow.purchaseOrders.list();
  }

  listPeople() {
    return this.uow.people.list();
  }

  listRegistrations() {
    return this.uow.registrations.list();
  }

  async getInventorySnapshots(): Promise<InventorySnapshot[]> {
    const [movements, products, locations] = await Promise.all([
      this.uow.movements.list(),
      this.uow.products.list(),
      this.uow.locations.list(),
    ]);
    return deriveInventorySnapshots(movements, products, locations, DEFAULT_INVENTORY_LOC);
  }

  async partnerStock(partnerId: string): Promise<{ productId: string; quantity: number }[]> {
    const [movements, locations] = await Promise.all([
      this.uow.movements.list(),
      this.uow.locations.list(),
    ]);
    return partnerStockFor(movements, partnerId, locations);
  }

  listReorderRules(): Promise<ReorderRule[]> {
    return this.uow.reorderRules.list();
  }

  async createManufacturingPO(input: {
    vendorId: string;
    productId: string;
    quantity: number;
    unitCost: number;
    requiredDate: string;
    id?: string;
  }): Promise<PurchaseOrder> {
    const existing = (await this.uow.purchaseOrders.list()).find(
      (p) =>
        (input.id ? p.id === input.id : false) ||
        (p.vendorId === input.vendorId &&
          p.productId === input.productId &&
          p.quantityOrdered === input.quantity &&
          p.unitCost === input.unitCost &&
          p.requiredDate === input.requiredDate &&
          p.quantityReceived === 0 &&
          ["Draft", "Sent"].includes(p.status)),
    );
    if (existing) return existing;

    const id = input.id ?? `PO-${Date.now().toString().slice(-6)}`;
    return this.uow.purchaseOrders.upsert({
      id,
      vendorId: input.vendorId,
      productId: input.productId,
      quantityOrdered: input.quantity,
      quantityReceived: 0,
      unitCost: input.unitCost,
      status: "Sent",
      requiredDate: input.requiredDate,
      orderedDate: new Date().toISOString().slice(0, 10),
    });
  }

  async receiveAgainstPO(input: {
    poId: string;
    accepted: number;
    damaged: number;
    missing: number;
    notes: string;
  }): Promise<{ movements: StockMovement[]; purchaseOrder: PurchaseOrder } | null> {
    return withTransaction(async (client) => {
      const tx = createPostgresUnitOfWork(client);
      const po = await tx.purchaseOrders.getByCode(input.poId);
      if (!po) return null;

      const batches = await tx.batches.list();
      const batch =
        batches.find((b) => b.id === po.batchId) ??
        batches.find((b) => b.productId === po.productId);

      const planned: AppendMovementInput[] = [];
      if (input.accepted > 0) {
        planned.push({
          productId: po.productId,
          batchId: batch?.id,
          quantity: input.accepted,
          fromLocationId: LOC_CODES.external,
          toLocationId: LOC_CODES.studio,
          movementType: "Purchase Receipt",
          reference: po.id,
          notes: input.notes || `Received ${input.accepted} accepted units`,
        });
      }
      if (input.damaged > 0) {
        planned.push({
          productId: po.productId,
          batchId: batch?.id,
          quantity: input.damaged,
          fromLocationId: LOC_CODES.external,
          toLocationId: LOC_CODES.damage,
          movementType: "Damage",
          reference: `${po.id}-QC`,
          notes: `${input.damaged} damaged on receive`,
        });
      }

      const created = await this.appendMovementsTx(tx, planned);
      if (!created.length && planned.length) {
        return { movements: [], purchaseOrder: po };
      }

      const acceptedWritten =
        created.find((m) => m.movementType === "Purchase Receipt")?.quantity ?? 0;
      const quantityReceived = po.quantityReceived + acceptedWritten;
      const status =
        quantityReceived >= po.quantityOrdered
          ? "Received"
          : quantityReceived > 0
            ? "Partial"
            : po.status;

      const updated = await tx.purchaseOrders.upsert({
        ...po,
        quantityReceived,
        status,
      });
      return { movements: created, purchaseOrder: updated };
    });
  }

  async transferToPartner(input: {
    productId: string;
    variantId?: string;
    partnerId: string;
    quantity: number;
    notes?: string;
    reference?: string;
  }): Promise<StockMovement | null> {
    return withTransaction(async (client) => {
      const tx = createPostgresUnitOfWork(client);
      const locations = await tx.locations.list();
      const loc = locations.find((l) => l.partnerId === input.partnerId);
      if (!loc || input.quantity <= 0) return null;

      const [movements, batches] = await Promise.all([tx.movements.list(), tx.batches.list()]);
      const balances = deriveBalances(movements);
      const available = Math.max(
        balanceAt(balances, input.productId, LOC_CODES.studio, input.variantId),
        0,
      );
      if (available < input.quantity) return null;

      const batch = batches.find((b) => b.productId === input.productId);
      const partner = await tx.partners.getByCode(input.partnerId);
      const reference =
        input.reference ??
        `TR-${input.partnerId.toUpperCase().replace("PARTNER-", "")}-${input.productId}${
          input.variantId ? `-${input.variantId}` : ""
        }-${input.quantity}`;

      const created = await this.appendMovementsTx(tx, [
        {
          productId: input.productId,
          variantId: input.variantId,
          batchId: batch?.id,
          quantity: input.quantity,
          fromLocationId: LOC_CODES.studio,
          toLocationId: loc.id,
          movementType: "Transfer",
          reference,
          notes: input.notes || `Transfer to ${partner?.name ?? loc.name}`,
        },
      ]);
      return created[0] ?? null;
    });
  }

  async recordPartnerSale(input: {
    productId: string;
    variantId?: string;
    partnerId: string;
    quantity: number;
    notes?: string;
    reference?: string;
  }): Promise<StockMovement | null> {
    return withTransaction(async (client) => {
      const tx = createPostgresUnitOfWork(client);
      const locations = await tx.locations.list();
      const loc = locations.find((l) => l.partnerId === input.partnerId);
      if (!loc || input.quantity <= 0) return null;

      const [movements, batches] = await Promise.all([tx.movements.list(), tx.batches.list()]);
      const balances = deriveBalances(movements);
      const bal = Math.max(balanceAt(balances, input.productId, loc.id, input.variantId), 0);
      if (bal < input.quantity) return null;

      const batch = batches.find((b) => b.productId === input.productId);
      const reference =
        input.reference ??
        `PSALE-${input.partnerId}-${input.productId}${
          input.variantId ? `-${input.variantId}` : ""
        }-${input.quantity}`;

      const created = await this.appendMovementsTx(tx, [
        {
          productId: input.productId,
          variantId: input.variantId,
          batchId: batch?.id,
          quantity: input.quantity,
          fromLocationId: loc.id,
          toLocationId: LOC_CODES.sold,
          movementType: "Partner Sale",
          reference,
          notes: input.notes || "Partner sale",
        },
      ]);
      return created[0] ?? null;
    });
  }

  /** General-purpose location-to-location transfer (studio ↔ partner, partner ↔ partner, etc.). */
  async transferStock(input: {
    productId: string;
    variantId?: string;
    fromLocationId: string;
    toLocationId: string;
    quantity: number;
    notes?: string;
    reference?: string;
  }): Promise<StockMovement | null> {
    if (input.quantity <= 0) return null;
    return withTransaction(async (client) => {
      const tx = createPostgresUnitOfWork(client);
      const [movements, batches] = await Promise.all([tx.movements.list(), tx.batches.list()]);
      const balances = deriveBalances(movements);
      const available = balanceAt(balances, input.productId, input.fromLocationId, input.variantId);
      if (input.fromLocationId !== LOC_CODES.external && available < input.quantity) {
        return null;
      }

      const batch = batches.find((b) => b.productId === input.productId);
      const movement = buildTransferMovement({
        productId: input.productId,
        variantId: input.variantId,
        fromLocationId: input.fromLocationId,
        toLocationId: input.toLocationId,
        quantity: input.quantity,
        batchId: batch?.id,
        notes: input.notes,
        reference: input.reference,
      });

      const created = await this.appendMovementsTx(tx, [movement]);
      return created[0] ?? null;
    });
  }

  /** Writes a compensating Adjustment movement for the delta between system and physical counts. */
  async adjustStock(input: {
    productId: string;
    variantId?: string;
    locationId: string;
    systemQty: number;
    physicalQty: number;
    reason: AdjustmentReason;
    notes?: string;
  }): Promise<StockMovement | null> {
    const delta = input.physicalQty - input.systemQty;
    const movement = buildAdjustmentMovement({
      productId: input.productId,
      variantId: input.variantId,
      locationId: input.locationId,
      delta,
      reason: input.reason,
      notes: input.notes,
    });
    if (!movement) return null;

    return withTransaction(async (client) => {
      const tx = createPostgresUnitOfWork(client);
      const created = await this.appendMovementsTx(tx, [movement]);
      return created[0] ?? null;
    });
  }

  /**
   * One-time legacy opening balances: Purchase Receipt External → Studio.
   * Idempotent via stable OPEN-LEGACY-* references. Skips variants that already
   * have Studio qty > 0. Not continuous Shopify inventory sync.
   */
  async establishOpeningBalances(
    rows: Array<{
      productId: string;
      variantId: string;
      quantity: number;
      notes?: string;
    }>,
  ): Promise<{ written: StockMovement[]; skipped: number }> {
    return withTransaction(async (client) => {
      const tx = createPostgresUnitOfWork(client);
      const movements = await tx.movements.list();
      const balances = deriveBalances(movements);
      const studioQty = (productId: string, variantId: string) =>
        Math.max(balanceAt(balances, productId, LOC_CODES.studio, variantId), 0);

      const planned: AppendMovementInput[] = [];
      let skipped = 0;
      for (const row of rows) {
        const qty = Math.floor(row.quantity);
        if (qty <= 0) {
          skipped += 1;
          continue;
        }
        if (studioQty(row.productId, row.variantId) > 0) {
          skipped += 1;
          continue;
        }
        planned.push({
          productId: row.productId,
          variantId: row.variantId,
          quantity: qty,
          fromLocationId: LOC_CODES.external,
          toLocationId: LOC_CODES.studio,
          movementType: "Purchase Receipt",
          reference: `OPEN-LEGACY-${row.variantId}`,
          notes: row.notes ?? "Legacy opening balance",
        });
      }

      const written = await this.appendMovementsTx(tx, planned);
      skipped += planned.length - written.length;
      return { written, skipped };
    });
  }

  /** Create a partner and their Partner location (stock bucket in the ledger). */
  async createPartner(input: {
    name: string;
    partnerType?: Partner["partnerType"];
    locationLabel?: string;
    contact?: string;
    margin?: number;
    merchandisingNotes?: string;
    code?: string;
  }): Promise<Partner> {
    const name = input.name?.trim();
    if (!name) throw new Error("Partner name is required");
    return withTransaction(async (client) => {
      const tx = createPostgresUnitOfWork(client);
      return tx.partners.create({ ...input, name });
    });
  }

  /**
   * One-time legacy opening stock already at a partner (not transferred from Studio).
   * Purchase Receipt External → Partner location. Idempotent via
   * OPEN-PARTNER-{partnerId}-{variantId}. Skips variants that already have qty > 0.
   */
  async establishPartnerOpeningBalances(
    partnerId: string,
    rows: Array<{
      productId: string;
      variantId: string;
      quantity: number;
      notes?: string;
    }>,
  ): Promise<{ written: StockMovement[]; skipped: number }> {
    return withTransaction(async (client) => {
      const tx = createPostgresUnitOfWork(client);
      const locations = await tx.locations.list();
      const loc = locations.find((l) => l.partnerId === partnerId);
      if (!loc) throw new Error(`Partner location not found for ${partnerId}`);

      const movements = await tx.movements.list();
      const balances = deriveBalances(movements);
      const partnerQty = (productId: string, variantId: string) =>
        Math.max(balanceAt(balances, productId, loc.id, variantId), 0);

      const planned: AppendMovementInput[] = [];
      let skipped = 0;
      for (const row of rows) {
        const qty = Math.floor(row.quantity);
        if (qty <= 0) {
          skipped += 1;
          continue;
        }
        if (partnerQty(row.productId, row.variantId) > 0) {
          skipped += 1;
          continue;
        }
        planned.push({
          productId: row.productId,
          variantId: row.variantId,
          quantity: qty,
          fromLocationId: LOC_CODES.external,
          toLocationId: loc.id,
          movementType: "Purchase Receipt",
          reference: `OPEN-PARTNER-${partnerId}-${row.variantId}`,
          notes: row.notes ?? "Partner legacy opening stock",
        });
      }

      const written = await this.appendMovementsTx(tx, planned);
      skipped += planned.length - written.length;
      return { written, skipped };
    });
  }

  async registerProduct(
    input: RegisterProductInput,
  ): Promise<{ user: Person; registration: ProductRegistration }> {
    return withTransaction(async (client) => {
      const tx = createPostgresUnitOfWork(client);
      const existing = await tx.people.findByEmail(input.email);

      let user: Person;
      if (existing) {
        const roles = new Set<PersonRole>(existing.roles);
        roles.add("User");
        roles.add("Community Member");
        user = {
          ...existing,
          phone: input.phone || existing.phone,
          city: input.city || existing.city,
          roles: Array.from(roles),
          interests: Array.from(new Set([...existing.interests, ...input.interests])),
          ownedProducts: Array.from(new Set([...existing.ownedProducts, input.productId])),
          registeredProducts: Array.from(
            new Set([...existing.registeredProducts, input.productId]),
          ),
          timeline: [
            ...(existing.timeline ?? []),
            {
              date: new Date().toISOString().slice(0, 10),
              label: "Registered product",
              href: "/registrations",
            },
          ],
        };
      } else {
        user = {
          id: `person-${Date.now()}`,
          name: input.name,
          email: input.email,
          phone: input.phone,
          city: input.city,
          roles: ["User", "Community Member"],
          interests: input.interests,
          purchasedOrders: [],
          ownedProducts: [input.productId],
          registeredProducts: [input.productId],
          createdAt: new Date().toISOString().slice(0, 10),
          timeline: [
            {
              date: new Date().toISOString().slice(0, 10),
              label: "Registered product and joined community",
              href: "/registrations",
            },
          ],
        };
      }

      await tx.people.upsert(user);

      let customerId = input.purchasedByYou ? user.id : undefined;
      if (input.gifted && input.customerName) {
        const people = await tx.people.list();
        const customerExisting = people.find(
          (p) => p.name.toLowerCase() === input.customerName!.trim().toLowerCase(),
        );
        if (customerExisting) customerId = customerExisting.id;
      }
      if (input.purchasedByYou) customerId = user.id;

      const registration: ProductRegistration = {
        registrationId: `reg-${Date.now()}`,
        productId: input.productId,
        batchId: input.batchId,
        customerId,
        userId: user.id,
        partnerId: input.partnerId || undefined,
        purchaseSource: input.purchaseSource,
        registrationDate: new Date().toISOString().slice(0, 10),
        registrationCode:
          input.registrationCode || `AARLA-${Date.now().toString(36).toUpperCase()}`,
        status: "Community",
      };

      await tx.registrations.create(registration);
      return { user, registration };
    });
  }

  /** Append with fingerprint idempotency; reject negatives except from external. */
  private async appendMovementsTx(
    tx: UnitOfWork,
    entries: AppendMovementInput[],
  ): Promise<StockMovement[]> {
    if (!entries.length) return [];
    const current = await tx.movements.list();
    const existingFingerprints = new Set(current.map(movementFingerprint));
    const balances = deriveBalances(current);
    // Exact bucket (product+variant+location) drives commits; pooled bucket (product+location,
    // summed across variants) is used to check entries that don't name a variant — backward
    // compatible with product-level callers that predate variant tracking.
    const exactMap = new Map(
      balances.map((b) => [`${b.productId}::${b.variantId}::${b.locationId}`, b.quantity]),
    );
    const pooledMap = new Map<string, number>();
    for (const b of balances) {
      const k = `${b.productId}::${b.locationId}`;
      pooledMap.set(k, (pooledMap.get(k) ?? 0) + b.quantity);
    }

    const created: StockMovement[] = [];
    for (const e of entries) {
      if (e.quantity <= 0) continue;
      const fp = movementFingerprint(e);
      if (existingFingerprints.has(fp)) continue;

      const variantId = e.variantId ?? "";
      const fromExactKey = `${e.productId}::${variantId}::${e.fromLocationId}`;
      const toExactKey = `${e.productId}::${variantId}::${e.toLocationId}`;
      const fromPooledKey = `${e.productId}::${e.fromLocationId}`;
      const toPooledKey = `${e.productId}::${e.toLocationId}`;

      const fromBal =
        e.variantId !== undefined
          ? exactMap.get(fromExactKey) ?? 0
          : pooledMap.get(fromPooledKey) ?? 0;
      const nextFrom = fromBal - e.quantity;
      if (e.fromLocationId !== LOC_CODES.external && nextFrom < 0) {
        continue;
      }

      const movement: StockMovement = {
        id: newMovementId(),
        date: e.date ?? new Date().toISOString().slice(0, 10),
        productId: e.productId,
        variantId: e.variantId,
        batchId: e.batchId,
        quantity: e.quantity,
        fromLocationId: e.fromLocationId,
        toLocationId: e.toLocationId,
        movementType: e.movementType,
        reference: e.reference,
        notes: e.notes,
      };
      created.push(movement);
      existingFingerprints.add(fp);
      exactMap.set(fromExactKey, (exactMap.get(fromExactKey) ?? 0) - e.quantity);
      exactMap.set(toExactKey, (exactMap.get(toExactKey) ?? 0) + e.quantity);
      pooledMap.set(fromPooledKey, (pooledMap.get(fromPooledKey) ?? 0) - e.quantity);
      pooledMap.set(toPooledKey, (pooledMap.get(toPooledKey) ?? 0) + e.quantity);
    }

    if (created.length) {
      await tx.movements.append(created);
    }
    return created;
  }
}
