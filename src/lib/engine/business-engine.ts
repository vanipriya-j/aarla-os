import {
  DEFAULT_INVENTORY_LOC,
  deriveBalances,
  deriveInventorySnapshots,
  partnerStockFor,
  type AppendMovementInput,
} from "@/lib/domain/ledger";
import type {
  InventorySnapshot,
  Location,
  ManufacturingBatch,
  Partner,
  Person,
  PersonRole,
  Product,
  ProductRegistration,
  PurchaseOrder,
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

      const [movements, products, batches] = await Promise.all([
        tx.movements.list(),
        tx.products.list(),
        tx.batches.list(),
      ]);
      const snapshots = deriveInventorySnapshots(
        movements,
        products,
        locations,
        DEFAULT_INVENTORY_LOC,
      );
      const snap = snapshots.find((s) => s.productId === input.productId);
      if (!snap || snap.available < input.quantity) return null;

      const batch = batches.find((b) => b.productId === input.productId);
      const partner = await tx.partners.getByCode(input.partnerId);
      const reference =
        input.reference ??
        `TR-${input.partnerId.toUpperCase().replace("PARTNER-", "")}-${input.productId}-${input.quantity}`;

      const created = await this.appendMovementsTx(tx, [
        {
          productId: input.productId,
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

      const [movements, batches] = await Promise.all([
        tx.movements.list(),
        tx.batches.list(),
      ]);
      const stock = partnerStockFor(movements, input.partnerId, locations);
      const bal = stock.find((s) => s.productId === input.productId)?.quantity ?? 0;
      if (bal < input.quantity) return null;

      const batch = batches.find((b) => b.productId === input.productId);
      const reference =
        input.reference ??
        `PSALE-${input.partnerId}-${input.productId}-${input.quantity}`;

      const created = await this.appendMovementsTx(tx, [
        {
          productId: input.productId,
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
    const balMap = new Map(balances.map((b) => [`${b.productId}::${b.locationId}`, b.quantity]));

    const created: StockMovement[] = [];
    for (const e of entries) {
      if (e.quantity <= 0) continue;
      const fp = movementFingerprint(e);
      if (existingFingerprints.has(fp)) continue;

      const fromKey = `${e.productId}::${e.fromLocationId}`;
      const toKey = `${e.productId}::${e.toLocationId}`;
      const fromBal = balMap.get(fromKey) ?? 0;
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
      balMap.set(fromKey, nextFrom);
      balMap.set(toKey, (balMap.get(toKey) ?? 0) + e.quantity);
    }

    if (created.length) {
      await tx.movements.append(created);
    }
    return created;
  }
}
